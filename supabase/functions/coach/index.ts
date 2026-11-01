import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

/**
 * Day 40 — `coach` Edge Function: the ONLY place the app touches a hosted
 * model. The Anthropic key lives here as a function secret and never ships
 * in the app (SPEC standing rule).
 *
 * Actions (POST JSON):
 *   { action: "recommend" }            → recommend_next() + optional AI note
 *   { action: "ask", question: "…" }   → kid-safe Q&A, stored in coach_messages
 *   { action: "nutrition", goal }      → Day 41: tailored 7-day plan → meal_plans
 *
 * Guard rails, in order:
 *   1 JWT verified by the platform (verify_jwt: true) — requests run AS the
 *     kid via RLS; the function holds no service-role key.
 *   2 Premium: recommend_next()/coach_context() are is_premium()-gated
 *     server-side; "ask" also refuses early with reason "not_premium".
 *   3 Crisis screen BEFORE the model: certain phrases skip the AI entirely
 *     and return help-resource copy. Stored flagged=true so coaches see it.
 *   4 Rate limit: 20 questions/day per kid.
 *   5 Kid-safe system prompt; the model only ever sees fight name + progress
 *     (coach_context is PII-free by construction).
 *   6 No key configured → honest { reason: "not_configured" }, nothing fake.
 *
 * ALL COPY BELOW IS PLACEHOLDER — crisis copy especially gets a client +
 * legal punch-up before launch (pre-launch list).
 */

const MODEL = Deno.env.get("COACH_MODEL") ?? "claude-haiku-5-5";
const DAILY_LIMIT = 20;
const MAX_QUESTION_CHARS = 500;
const NUTRITION_DAILY_LIMIT = 3;

// Day 41 — tailored nutrition. The model writes a 7-day MOCK plan in the
// exact shape meal_plan_templates uses; the function validates hard before
// anything touches the database. Teen-safe by contract: no calorie numbers,
// no weight-loss framing — validated, not just requested.
const NUTRITION_SYSTEM = `You write simple 7-day meal plans for teen athletes (11-17) in a boxing training app, many from low-income homes.

RULES — never break these:
- Cheap, real, widely available food. Think rice, beans, eggs, oats, frozen veg, bananas, peanut butter, canned fish, chicken thighs.
- NO calorie numbers, NO macros, NO portion weights, NO supplements, NO fasting, NO weight-loss language. Food is fuel, never punishment.
- Simple meals a teen can make: few ingredients, minimal cooking.
- Respond with ONLY valid JSON, no markdown fences, exactly this shape:
{"title":"...", "days":[{"day":"Mon","meals":{"breakfast":"...","lunch":"...","snack":"...","dinner":"..."}}, ...]}
- Exactly 7 days: Mon Tue Wed Thu Fri Sat Sun. Every day has all 4 meals.
- The title is short and encouraging (e.g. "Your Fuel Week"), never diet-y.`;

type PlanDay = { day: string; meals: Record<string, string> };
type GeneratedPlan = { title: string; days: PlanDay[] };

function parsePlan(raw: string): GeneratedPlan | null {
  const cleaned = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  let obj: unknown;
  try {
    obj = JSON.parse(cleaned);
  } catch {
    return null;
  }
  const p = obj as GeneratedPlan;
  if (typeof p?.title !== "string" || !Array.isArray(p.days) || p.days.length !== 7) return null;
  for (const d of p.days) {
    if (typeof d?.day !== "string") return null;
    for (const meal of ["breakfast", "lunch", "snack", "dinner"]) {
      if (typeof d.meals?.[meal] !== "string" || d.meals[meal].length === 0) return null;
    }
  }
  // Hard teen-safety check: calorie/macro numbers must not appear, ever.
  const text = JSON.stringify(p);
  if (/\d+\s*(k?cal|calorie|carb|protein|gram|oz\b)/i.test(text)) return null;
  return { title: p.title, days: p.days };
}

// Placeholder screen — pre-launch this list gets a professional review.
const CRISIS_PATTERNS: RegExp[] = [
  /suicid/i,
  /kill (myself|me)/i,
  /want to die/i,
  /end (my|it all) life/i,
  /hurt (myself|me on purpose)/i,
  /self[- ]?harm/i,
  /cut(ting)? myself/i,
  /overdose/i,
  /being abused/i,
  /(hits|beats) me/i,
  /don'?t want to (live|be alive)/i,
];

// Placeholder crisis copy — client + legal punch-up pre-launch.
const CRISIS_REPLY =
  "That sounds really heavy, and I'm glad you said it out loud — but this is bigger than boxing, and you deserve real help from a real person. Please talk to a trusted adult right now: a parent, a coach, a teacher, a school counselor. If you're in the US you can call or text 988 (Suicide & Crisis Lifeline) any time, or text HOME to 741741. You matter more than any streak in this app.";

const SYSTEM_PROMPT = `You are "Coach", the in-app coach for a boxing and conflict-resolution training app for teens aged 11-17, many from underprivileged communities. The app's core rule is WORDS FIRST: kids must complete conflict-resolution LESSONs to advance in boxing rank, because walking away from a fight is the real win.

You will receive the kid's training context as JSON (fight name, level, streak, belt progress, recent completions). Use it to personalize, but never recite it back mechanically.

RULES — never break these:
- Topics you help with: boxing technique and training, the app's LESSON themes (de-escalation, walking away, handling anger, peer pressure), basic everyday sports nutrition, motivation and consistency.
- NEVER encourage using boxing skills on another person. If asked how to win a real fight or hurt someone, redirect to de-escalation — that IS the curriculum.
- NO diet numbers for teens: no calorie targets, no weight-cutting, no supplements, no fasting. Say food is fuel, point to the app's meal plans, and for anything weight-related say "that's a conversation for a doctor or a parent, not an app."
- No medical advice beyond "rest it and tell an adult" — injuries go to a trusted adult or doctor.
- If the kid mentions wanting to hurt themselves or someone else, being abused, or being in danger: stop coaching. Tell them to talk to a trusted adult immediately, and mention the 988 Suicide & Crisis Lifeline (call/text 988, US).
- Never ask for personal information: no real names, school, address, phone, or social handles.
- Nothing sexual, nothing about drugs/alcohol, nothing illegal — redirect gently and get back to training.
- Age-appropriate always: plain words, short sentences.

STYLE: 2-5 sentences. Warm, direct, corner-coach energy — believe in them, no fake hype, at most one emoji. If they're doing well, say the specific thing they did. Sign nothing; you're just Coach.`;

type Json = Record<string, unknown>;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: Json, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

async function callClaude(
  apiKey: string,
  system: string,
  messages: { role: "user" | "assistant"; content: string }[],
  maxTokens: number,
): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    // Haiku 5.5 thinks by default and thinking counts toward max_tokens.
    // Low effort keeps these short phrasing jobs fast; the caps leave room.
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      output_config: { effort: "low" },
      system,
      messages,
    }),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`anthropic_${res.status}: ${detail.slice(0, 300)}`);
  }
  const data = await res.json();
  const text = (data.content ?? [])
    .filter((b: { type: string }) => b.type === "text")
    .map((b: { text: string }) => b.text)
    .join("\n")
    .trim();
  if (!text) throw new Error(`anthropic_empty (stop_reason: ${data.stop_reason})`);
  return text;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, reason: "method_not_allowed" }, 405);

  // Run AS the calling kid — anon key + their JWT, so RLS applies everywhere.
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: req.headers.get("Authorization")! } } },
  );

  let body: Json;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, reason: "bad_request" }, 400);
  }

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY") ?? "";

  // ---------- action: recommend ----------
  if (body.action === "recommend") {
    const { data, error } = await supabase.rpc("recommend_next");
    if (error) return json({ ok: false, reason: error.message }, 400);
    const recs = data as Json;
    if (!recs.premium) return json({ ok: true, premium: false });

    // AI phrasing is a garnish on deterministic truth: the model may only
    // talk ABOUT the top candidate — it never picks content itself.
    let note: string | null = null;
    const list = (recs.recommendations ?? []) as Json[];
    if (apiKey && list.length > 0) {
      try {
        const { data: ctx } = await supabase.rpc("coach_context");
        note = await callClaude(
          apiKey,
          SYSTEM_PROMPT,
          [
            {
              role: "user",
              content:
                `My training context: ${JSON.stringify(ctx)}\n\n` +
                `The app engine picked my next step: ${JSON.stringify(list[0])}` +
                (list[0].reason === "ethics_gate"
                  ? " (this LESSON is what stands between me and my next belt — words first)"
                  : "") +
                (list[0].reason === "moment"
                  ? " (something I posted was held for review, or I reported something — this LESSON speaks to that moment; be kind, not preachy)"
                  : "") +
                `\n\nIn 1-2 sentences, as my coach, tell me why this is the right next move for me specifically. Don't mention JSON or "the engine".`,
            },
          ],
          800,
        );
      } catch {
        note = null; // recommendation still stands without the garnish
      }
    }
    return json({ ok: true, ...recs, note, ai: !!note });
  }

  // ---------- action: ask ----------
  if (body.action === "ask") {
    const question = String(body.question ?? "").trim();
    if (question.length === 0 || question.length > MAX_QUESTION_CHARS) {
      return json({ ok: false, reason: "bad_question" }, 400);
    }

    // Premium first (coach_context is also gated, but fail fast + honest).
    const { data: ctx, error: ctxError } = await supabase.rpc("coach_context");
    if (ctxError) return json({ ok: false, reason: ctxError.message }, 400);
    if (!(ctx as Json).premium) return json({ ok: false, reason: "not_premium" }, 403);

    // Crisis screen BEFORE anything else — no model, no rate limit math.
    if (CRISIS_PATTERNS.some((p) => p.test(question))) {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id;
      if (uid) {
        await supabase.from("coach_messages").insert([
          { user_id: uid, role: "user", content: question, flagged: true },
          { user_id: uid, role: "coach", content: CRISIS_REPLY, flagged: true },
        ]);
      }
      return json({ ok: true, crisis: true, answer: CRISIS_REPLY });
    }

    // Rate limit: DAILY_LIMIT questions per UTC day.
    const dayStart = new Date();
    dayStart.setUTCHours(0, 0, 0, 0);
    const { count } = await supabase
      .from("coach_messages")
      .select("id", { count: "exact", head: true })
      .eq("role", "user")
      .gte("created_at", dayStart.toISOString());
    if ((count ?? 0) >= DAILY_LIMIT) return json({ ok: false, reason: "rate_limited" }, 429);

    if (!apiKey) return json({ ok: false, reason: "not_configured" }, 503);

    const { data: auth } = await supabase.auth.getUser();
    const uid = auth?.user?.id;
    if (!uid) return json({ ok: false, reason: "not_authenticated" }, 401);

    // Flag (don't block) questions that trip the community word filter,
    // so coaches reviewing coach_messages see them first.
    let flagged = false;
    try {
      const { data: blocked } = await supabase.rpc("contains_blocked", { p_text: question });
      flagged = blocked === true;
    } catch {
      /* filter helper unavailable → leave unflagged */
    }

    // Last few turns give the model short-term memory of THIS thread.
    const { data: historyRows } = await supabase
      .from("coach_messages")
      .select("role, content")
      .order("created_at", { ascending: false })
      .limit(10);
    const history = (historyRows ?? [])
      .reverse()
      .map((m) => ({
        role: m.role === "coach" ? ("assistant" as const) : ("user" as const),
        content: m.content as string,
      }));

    await supabase.from("coach_messages").insert({
      user_id: uid,
      role: "user",
      content: question,
      flagged,
    });

    let answer: string;
    try {
      answer = await callClaude(
        apiKey,
        SYSTEM_PROMPT + `\n\nThe kid's training context: ${JSON.stringify(ctx)}`,
        [...history, { role: "user", content: question }],
        1200,
      );
    } catch (e) {
      console.error("coach ask failed:", e);
      return json({ ok: false, reason: "ai_error" }, 502);
    }

    await supabase.from("coach_messages").insert({
      user_id: uid,
      role: "coach",
      content: answer,
      flagged,
    });

    return json({ ok: true, answer });
  }

  // ---------- action: nutrition (Day 41) ----------
  if (body.action === "nutrition") {
    const goal = String(body.goal ?? "maintain");
    if (!["cut", "maintain", "build"].includes(goal)) {
      return json({ ok: false, reason: "bad_goal" }, 400);
    }

    // Premium gate (server-side, like everything else).
    const { data: ctx, error: ctxError } = await supabase.rpc("coach_context");
    if (ctxError) return json({ ok: false, reason: ctxError.message }, 400);
    if (!(ctx as Json).premium) return json({ ok: false, reason: "not_premium" }, 403);

    // Rate limit: a few generations a day is plenty.
    const dayStart = new Date();
    dayStart.setUTCHours(0, 0, 0, 0);
    const { count } = await supabase
      .from("meal_plans")
      .select("id", { count: "exact", head: true })
      .eq("is_ai_generated", true)
      .gte("created_at", dayStart.toISOString());
    if ((count ?? 0) >= NUTRITION_DAILY_LIMIT) return json({ ok: false, reason: "rate_limited" }, 429);

    if (!apiKey) return json({ ok: false, reason: "not_configured" }, 503);

    const { data: auth } = await supabase.auth.getUser();
    const uid = auth?.user?.id;
    if (!uid) return json({ ok: false, reason: "not_authenticated" }, 401);

    // Mock goal vocabulary from the Day 31 templates (client consult may
    // rename "cut" — the model gets safe framing regardless).
    const goalLine: Record<string, string> = {
      build: "goal: getting stronger — hearty, filling meals",
      maintain: "goal: steady training energy — balanced, consistent meals",
      cut: "goal: feeling light and quick for training — fresh, lighter meals (NEVER frame as weight loss or restriction)",
    };

    let plan: GeneratedPlan | null = null;
    try {
      const raw = await callClaude(
        apiKey,
        NUTRITION_SYSTEM,
        [
          {
            role: "user",
            content: `Build my 7-day plan. ${goalLine[goal]}. Budget: low — cheap staples only. My training context (for flavor, not for calories): ${JSON.stringify(ctx)}`,
          },
        ],
        4000,
      );
      plan = parsePlan(raw);
    } catch (e) {
      console.error("nutrition generation failed:", e);
      return json({ ok: false, reason: "ai_error" }, 502);
    }
    if (!plan) return json({ ok: false, reason: "ai_error" }, 502);

    // One active plan (same rule the template picker uses): clear, then save.
    await supabase.from("meal_plans").delete().eq("user_id", uid);
    const { error: insertError } = await supabase.from("meal_plans").insert({
      user_id: uid,
      config: { title: plan.title, goal, days: plan.days, ai: true },
      is_ai_generated: true,
    });
    if (insertError) return json({ ok: false, reason: insertError.message }, 400);

    return json({ ok: true, title: plan.title });
  }

  return json({ ok: false, reason: "unknown_action" }, 400);
});
