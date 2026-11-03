import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ScrollViewInstance,
} from 'react-native';

import { theme } from '@/constants/theme';
import { AI_COACH_LABEL, COACH_NAME, CoachMessage } from '@/constants/coach';
import { supabase } from '../../lib/supabase';

/**
 * Day 40 — Ask the Coach (screen G2). Single-thread Q&A with the AI coach.
 *
 * Everything that matters happens SERVER-SIDE in the `coach` Edge Function:
 * premium gate, kid-safe system prompt, crisis deflection, rate limit, and
 * the Anthropic key (a function secret — never in this app). This screen is
 * just a thread view over coach_messages plus one invoke() call.
 *
 * Honest states, no fake coach:
 *  - not premium  → the Pro pitch, equal-weight walk-away (A6 spirit)
 *  - no API key   → "the coach is still being wired up" (not_configured)
 *  - rate-limited → come back tomorrow
 *  - crisis reply → rendered like any coach message; server already stored
 *    it flagged so real coaches see it
 */

const MAX_CHARS = 500;

type Gate = 'loading' | 'locked' | 'open';

export default function CoachScreen() {
  const router = useRouter();
  const scrollRef = useRef<ScrollViewInstance>(null);
  const [gate, setGate] = useState<Gate>('loading');
  const [thread, setThread] = useState<CoachMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  useFocusEffect(
    useCallback(() => {
      (async () => {
        const { data: ent } = await supabase.rpc('my_entitlement');
        if (!(ent as { premium?: boolean })?.premium) {
          setGate('locked');
          return;
        }
        setGate('open');
        const { data } = await supabase
          .from('coach_messages')
          .select('id, role, content, created_at')
          .order('created_at', { ascending: true })
          .limit(80);
        setThread((data ?? []) as CoachMessage[]);
        setTimeout(() => scrollRef.current?.scrollToEnd({ animated: false }), 50);
      })();
    }, []),
  );

  const send = async () => {
    const question = draft.trim();
    if (question.length === 0 || busy) return;
    setBusy(true);
    setNotice('');
    setDraft('');

    // Optimistic: the kid's message shows immediately.
    const mine: CoachMessage = {
      id: `local-${Date.now()}`,
      role: 'user',
      content: question,
      created_at: new Date().toISOString(),
    };
    setThread((t) => [...t, mine]);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);

    const { data, error } = await supabase.functions.invoke('coach', {
      body: { action: 'ask', question },
    });
    setBusy(false);

    // supabase-js surfaces non-2xx as error; the reason is in the response body.
    let reason: string | undefined;
    if (error) {
      try {
        const ctx = (error as { context?: Response }).context;
        if (ctx) reason = ((await ctx.json()) as { reason?: string }).reason;
      } catch {
        /* no parseable body */
      }
    }
    const d = (data ?? {}) as { ok?: boolean; answer?: string; reason?: string };
    reason = reason ?? d.reason;

    if (d.ok && d.answer) {
      setThread((t) => [
        ...t,
        { id: `coach-${Date.now()}`, role: 'coach', content: d.answer!, created_at: new Date().toISOString() },
      ]);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
      return;
    }

    const notices: Record<string, string> = {
      not_configured: `${COACH_NAME} isn’t hooked up to the AI yet — that arrives with the API key setup. Your question wasn’t lost on you, just try again once it’s live.`,
      rate_limited: 'That’s a lot of questions for one day, champ — the coach is back tomorrow. Go train one.',
      not_premium: 'Ask the Coach is a Pro feature.',
      ai_error: 'The coach couldn’t get that one out — try asking again.',
      bad_question: `Keep it under ${MAX_CHARS} characters and try again.`,
    };
    setNotice(notices[reason ?? ''] ?? 'Something went wrong — try again.');
    if (reason === 'not_premium') setGate('locked');
  };

  if (gate === 'locked') {
    return (
      <View style={[styles.screen, styles.lockWrap]}>
        <Text style={styles.lockEmoji}>🧭</Text>
        <Text style={styles.title}>{COACH_NAME} in your corner</Text>
        <Text style={styles.lockBlurb}>
          A coach who knows your training, answers your boxing and nutrition questions, and points
          you at the right next step — part of Pro. Every LESSON stays free, always.
        </Text>
        <View style={styles.lockRow}>
          <Pressable style={styles.lockBtn} onPress={() => router.push('/paywall')}>
            <Text style={styles.lockBtnText}>See Free vs Pro</Text>
          </Pressable>
          <Pressable style={styles.lockBtn} onPress={() => router.back()}>
            <Text style={styles.lockBtnText}>Keep training free</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior="padding">
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Text style={styles.back}>‹ Back</Text>
        </Pressable>
        <Text style={styles.title}>Ask {COACH_NAME} 💬</Text>
        <Text style={styles.aiTag}>{AI_COACH_LABEL}</Text>
        <Text style={styles.subtitle}>
          Boxing, LESSONs, food as fuel, staying consistent. Coaches at the gym can read this
          thread — same deal as the feed.
        </Text>
      </View>

      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={styles.thread}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}>
        {gate === 'open' && thread.length === 0 && (
          <View style={[styles.bubble, styles.coachBubble]}>
            <Text style={styles.bubbleText}>
              I’m {COACH_NAME} — I can see your training, so ask me anything about boxing, your
              LESSONs, eating right, or keeping the streak alive. What’s on your mind?
            </Text>
          </View>
        )}
        {thread.map((m) => (
          <View
            key={m.id}
            style={[styles.bubble, m.role === 'coach' ? styles.coachBubble : styles.myBubble]}>
            <Text style={styles.bubbleText}>{m.content}</Text>
          </View>
        ))}
        {busy && (
          <View style={[styles.bubble, styles.coachBubble]}>
            <Text style={styles.bubbleThinking}>…</Text>
          </View>
        )}
        {notice !== '' && <Text style={styles.notice}>{notice}</Text>}
      </ScrollView>

      <View style={styles.composer}>
        <TextInput
          style={styles.input}
          value={draft}
          onChangeText={(t) => setDraft(t.slice(0, MAX_CHARS))}
          placeholder="Ask your coach…"
          placeholderTextColor={theme.colors.muted}
          multiline
        />
        <Pressable
          style={[styles.sendBtn, (busy || draft.trim().length === 0) && { opacity: 0.5 }]}
          disabled={busy || draft.trim().length === 0}
          onPress={send}>
          <Text style={styles.sendText}>{busy ? '…' : 'Send'}</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.bg },
  header: { paddingTop: 64, paddingHorizontal: theme.space.md, gap: 6 },
  back: { fontSize: theme.font.body, color: theme.colors.muted },
  title: { fontSize: theme.font.title, fontWeight: '800', color: theme.colors.text },
  subtitle: { fontSize: theme.font.small, color: theme.colors.muted, lineHeight: 18 },
  aiTag: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: theme.colors.gold,
    borderRadius: theme.radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 2,
    fontSize: theme.font.small,
    color: theme.colors.gold,
    fontWeight: '800',
    letterSpacing: 1,
  },

  thread: { padding: theme.space.md, gap: theme.space.sm, paddingBottom: theme.space.lg },
  bubble: {
    maxWidth: '85%',
    borderRadius: theme.radius.lg,
    paddingVertical: 10,
    paddingHorizontal: theme.space.md,
    borderWidth: 1,
  },
  coachBubble: {
    alignSelf: 'flex-start',
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.gold,
  },
  myBubble: {
    alignSelf: 'flex-end',
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.line,
  },
  bubbleText: { fontSize: theme.font.body, color: theme.colors.text, lineHeight: 21 },
  bubbleThinking: { fontSize: theme.font.header, color: theme.colors.muted },
  notice: { fontSize: theme.font.small, color: theme.colors.gold, textAlign: 'center', lineHeight: 18 },

  composer: {
    flexDirection: 'row',
    gap: theme.space.sm,
    padding: theme.space.md,
    borderTopWidth: 1,
    borderTopColor: theme.colors.line,
    backgroundColor: theme.colors.surface,
    alignItems: 'flex-end',
  },
  input: {
    flex: 1,
    backgroundColor: theme.colors.bg,
    borderColor: theme.colors.line,
    borderWidth: 1,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.space.md,
    paddingVertical: 10,
    fontSize: theme.font.body,
    color: theme.colors.text,
    maxHeight: 110,
  },
  sendBtn: {
    backgroundColor: theme.colors.red,
    borderRadius: theme.radius.lg,
    paddingHorizontal: theme.space.lg,
    paddingVertical: 12,
  },
  sendText: { color: '#fff', fontSize: theme.font.body, fontWeight: '800' },

  lockWrap: { alignItems: 'center', justifyContent: 'center', padding: theme.space.lg, gap: theme.space.sm },
  lockEmoji: { fontSize: 52 },
  lockBlurb: { fontSize: theme.font.body, color: theme.colors.muted, textAlign: 'center', lineHeight: 21 },
  lockRow: { flexDirection: 'row', gap: theme.space.sm, marginTop: theme.space.sm },
  lockBtn: {
    flex: 1,
    backgroundColor: theme.colors.red,
    borderRadius: theme.radius.lg,
    paddingVertical: 13,
    alignItems: 'center',
  },
  lockBtnText: { color: '#fff', fontSize: theme.font.body, fontWeight: '800' },
});
