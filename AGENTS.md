# BoxingApp: standing instructions for any AI assistant working in this repository

## Expo has changed
Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

## What this is
A boxing training app for teens (about 11 to 17), built especially for kids in underserved communities.
Spine: "words first, boxing after." Owner: Jigar. Full specification: `SPEC.md` in the docs folder
(`~/Claude/Projects/BoxingApp/`), alongside `BUILDLOG.md`, `10_Content_Gap_Report.md` and
`11_Roadmap_Release_Candidate.md`. If a request conflicts with the specification, flag it. Do not improvise.

## Non-negotiables (check every change against these)
1. The ethics gate is hard. A rank degree unlocks only when its boxing requirement AND its ethics LESSON are both done, enforced on the server in `try_rank_up`. Never trust the client.
2. Ethics content (all LESSONS) is free forever. Nutrition basics are free forever. Never paywall either.
3. Community is forums only. No group chat, no direct messages, no private or invite-only spaces. Do not create the tables or endpoints.
4. Teen-safe by design: parental consent for under-13s, layered moderation, report button on all community content, minimal data, no location, no contacts, no advertising software.
5. No calorie, macro or portion numbers shown to kids. The coach's nutrition output is validated on the server to reject them.
6. One event stream: all progression reads from `xp_events` through one completion pipeline. Nothing stored twice.
7. Config over code: experience values, level curve, unlocks and rank requirements live in database config tables.
8. Pro checks happen on the server (`is_premium` / `has_premium`), never on a client flag alone.
9. Low data, offline tolerant, works on older iPhones.
10. All content (scripts, scenarios, articles, callouts, copy, meal plans) is placeholder. Never treat it as final.

## Brand voice
Talk like a good coach, not a poster. Short sentences, a kid's voice, no preaching. Never glorify violence. Celebrate restraint as strength.

## Stack as built
- Expo 57 (managed, TypeScript), Expo Router with typed routes, React 19, React Native 0.86
- Supabase project `boxingapp-dev` (id `vuolnvibazfszsgzfjbw`, us-east-2): Postgres with row-level security, Auth, Storage, one Edge Function `coach`
- Client: `lib/supabase.ts`. Screens: `src/app/`. Shared pieces: `src/components/`, `src/constants/`, `src/hooks/`
- Callouts: expo-speech for now (bundled recorded audio planned). Video: expo-video. Reminders: expo-notifications.
- Planned but NOT installed yet: RevenueCat, Sentry, PostHog, offline event queue, Apple Sign-In, Expo Application Services builds.

## Database rules
- Migrations are applied straight to Supabase (there is no local migrations folder). Name them `dayNN_short_name`.
- Dry run first: run the change inside a transaction that rolls back, verify, then apply.
- After any schema change, run the Supabase security advisor. Access rules on `access_codes`, `blocked_terms` and `orgs` deny everything on purpose (database functions only); that advisor notice is expected.
- Public-schema database functions are revoked from `anon` and granted to `authenticated` and `service_role` explicitly. Keep it that way for every new function, with a pinned `search_path`.
- The free dev database auto-pauses after about a week idle. If calls time out, it is waking up; retry.

## The coach (hosted model)
- The ONLY place the app calls a hosted model is `supabase/functions/coach/index.ts`. The Anthropic key lives only in Supabase Edge Function secrets as `ANTHROPIC_API_KEY`. Never put a key in the app or in this repository.
- The engines choose; the model only phrases. Crisis screening runs BEFORE the model. Crisis copy and patterns are placeholders pending clinical and legal review.
- Coach display name is the constant in `src/constants/coach.ts` (placeholder "Coach").

## Commands
- `npm start` starts the dev server. `npx expo start --clear` if the app stops picking up changes.
- `npm run check` runs the type check (must be 0 errors before any commit).

## Working rules
- After each piece of work: run `npm run check`, add an entry to `BUILDLOG.md` in the docs folder, and list concrete device test steps.
- Commit in small, described commits. Never commit `.env` (it holds the public Supabase keys and is ignored).
- Test accounts: admin `saavanjmehta@outlook.com`; kid `monsoon1380@gmail.com`. Scholarship test code `HOPE-TEST01`.

## Pushing to GitHub
- The Mac's git has no GitHub sign-in; Claude pushes from its cloud copy of the repository (bring commits over with a `git bundle`, fast-forward, push, then align the Mac's `origin/main`).
- After EVERY push, verify both sides and report them together: the Mac (what VS Code shows: latest commit, clean working tree, nothing ahead or behind) and GitHub (`git ls-remote origin main`). The two commit ids must match.
