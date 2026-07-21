import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Speech from 'expo-speech';

import { theme } from '@/constants/theme';
import { supabase } from '../../lib/supabase';

/**
 * Day 17 — Train: guided workout with audio callouts + summary + XP.
 * - Callouts are DATA ({at seconds-remaining, text}) from the content bank's
 *   First Bell script — placeholder content, per project rule.
 * - Voice is text-to-speech as a placeholder; real recorded clips (ideally
 *   the client's voice) arrive in content production. Same data, new mouth.
 * - Finishing calls the complete_activity RPC -> first real xp_events row.
 */

// ─── MOCK TIMING + PLACEHOLDER CALLOUTS ─────────────────────────────────────
// ⚠ Pacing + wording to be re-done from the client's real instructing rhythm.
const FIRST_BELL = {
  title: 'First Bell',
  subtitle: 'Your first workout — stance and jab. No equipment needed.',
  equipment: [] as string[],
  actions: [
    { name: 'Stance + single jab', roundSeconds: 180 },
    { name: 'Double jab + small steps', roundSeconds: 180 },
  ],
  restSeconds: 60,
  xp: 50,
};

type Callout = { at: number; text: string }; // `at` = seconds REMAINING in phase

const ROUND_CALLOUTS: Callout[][] = [
  [
    { at: 175, text: 'Stance check. Feet shoulder-width, back heel light.' },
    { at: 160, text: 'Jab.' },
    { at: 148, text: 'Jab. Snap it back.' },
    { at: 132, text: 'Jab.' },
    { at: 118, text: 'Breathe. Shoulders down.' },
    { at: 105, text: 'Jab. Eyes forward, not at the floor.' },
    { at: 90, text: 'Halfway. Stance check — did your feet drift?' },
    { at: 75, text: 'Jab.' },
    { at: 60, text: 'Jab. Tired is when form matters.' },
    { at: 40, text: 'Jab.' },
    { at: 20, text: 'Ten seconds of jabs — your pace, clean reps.' },
  ],
  [
    { at: 175, text: 'Hands up. Round two.' },
    { at: 162, text: 'Double jab — one-one.' },
    { at: 146, text: 'One-one. The second one is a surprise, not an echo.' },
    { at: 130, text: 'Step in, jab. Small step — inches, not leaps.' },
    { at: 115, text: 'Breathe.' },
    { at: 100, text: 'One-one.' },
    { at: 85, text: 'Halfway. Other hand glued to your cheek.' },
    { at: 70, text: 'Step back, jab. You can hit moving both ways.' },
    { at: 50, text: 'One-one.' },
    { at: 30, text: 'Last thirty. Your best double-jabs — make them clean.' },
  ],
];
const REST_CALLOUTS: Callout[] = [
  { at: 55, text: 'Breathe in through the nose, out slow. That round is done.' },
  { at: 15, text: 'Next round doubles the jab. Ready.' },
];

// Dev-only fast run (15s rounds) with a mini callout set.
const QUICK_TEST = { roundSeconds: 15, restSeconds: 8 };
const QUICK_ROUND_CALLOUTS: Callout[] = [
  { at: 12, text: 'Jab.' },
  { at: 6, text: 'Double jab — one-one.' },
];
const QUICK_REST_CALLOUTS: Callout[] = [{ at: 5, text: 'Ready.' }];
// ────────────────────────────────────────────────────────────────────────────

type Phase = 'preview' | 'work' | 'rest' | 'summary';
type RecordResult =
  | { awarded: number; first_time?: boolean; total_xp?: number; level?: number; reason?: string }
  | { error: string };

function fmt(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

function say(text: string) {
  Speech.stop();
  Speech.speak(text, { language: 'en-US' });
}

export default function TrainScreen() {
  const workout = FIRST_BELL;
  const totalRounds = workout.actions.length;

  const [phase, setPhase] = useState<Phase>('preview');
  const [round, setRound] = useState(1);
  const [remainingMs, setRemainingMs] = useState(0);
  const [paused, setPaused] = useState(false);
  const [quick, setQuick] = useState(false);
  const [callout, setCallout] = useState('');
  const [result, setResult] = useState<RecordResult | null>(null);
  const [recording, setRecording] = useState(false);

  const endsAtRef = useRef(0);
  const phaseRef = useRef<Phase>('preview');
  const roundRef = useRef(1);
  const firedRef = useRef<Set<number>>(new Set());
  const contentRef = useRef<{ id: string; xp_value: number } | null>(null);
  phaseRef.current = phase;
  roundRef.current = round;

  // Find the real First Bell row in the DB (Day 12 seed) so XP records
  // against actual content. Content stays in data — placeholder rule.
  useEffect(() => {
    supabase
      .from('content_items')
      .select('id, xp_value')
      .eq('type', 'workout')
      .eq('title', 'First Bell')
      .maybeSingle()
      .then(({ data }) => {
        contentRef.current = data ?? null;
      });
    return () => Speech.stop();
  }, []);

  const secondsFor = useCallback(
    (p: 'work' | 'rest', r: number) =>
      p === 'work'
        ? quick
          ? QUICK_TEST.roundSeconds
          : workout.actions[r - 1].roundSeconds
        : quick
          ? QUICK_TEST.restSeconds
          : workout.restSeconds,
    [quick, workout],
  );

  const calloutsFor = useCallback(
    (p: 'work' | 'rest', r: number): Callout[] =>
      p === 'work'
        ? quick
          ? QUICK_ROUND_CALLOUTS
          : (ROUND_CALLOUTS[r - 1] ?? [])
        : quick
          ? QUICK_REST_CALLOUTS
          : REST_CALLOUTS,
    [quick],
  );

  const startPhase = useCallback(
    (p: 'work' | 'rest', r: number) => {
      const ms = secondsFor(p, r) * 1000;
      endsAtRef.current = Date.now() + ms;
      firedRef.current = new Set();
      setRemainingMs(ms);
      setRound(r);
      setPhase(p);
      setPaused(false);
      setCallout('');
      say(p === 'work' ? `Round ${r}. ${workout.actions[r - 1].name}.` : 'Rest.');
    },
    [secondsFor, workout],
  );

  const advance = useCallback(() => {
    const p = phaseRef.current;
    const r = roundRef.current;
    if (p === 'work') {
      if (r < totalRounds) startPhase('rest', r);
      else {
        setPhase('summary');
        say('That is the bell. Workout complete.');
      }
    } else if (p === 'rest') {
      startPhase('work', r + 1);
    }
  }, [startPhase, totalRounds]);

  // The tick: clock + callout engine.
  useEffect(() => {
    if ((phase !== 'work' && phase !== 'rest') || paused) return;
    const id = setInterval(() => {
      const left = endsAtRef.current - Date.now();
      if (left <= 0) {
        advance();
        return;
      }
      setRemainingMs(left);
      const secs = Math.ceil(left / 1000);
      const list = calloutsFor(phase, roundRef.current);
      list.forEach((c, i) => {
        if (secs <= c.at && !firedRef.current.has(i)) {
          firedRef.current.add(i);
          setCallout(c.text);
          say(c.text);
        }
      });
    }, 250);
    return () => clearInterval(id);
  }, [phase, paused, advance, calloutsFor]);

  // Record the completion once when we reach the summary.
  useEffect(() => {
    if (phase !== 'summary' || result !== null || recording) return;
    (async () => {
      setRecording(true);
      if (!contentRef.current) {
        setResult({ error: 'First Bell not found in the database — XP not recorded.' });
        setRecording(false);
        return;
      }
      const { data, error } = await supabase.rpc('complete_activity', {
        p_content_id: contentRef.current.id,
        p_event_type: 'completion',
        p_client_event_id: `firstbell-${Date.now()}`,
      });
      setResult(error ? { error: error.message } : (data as RecordResult));
      setRecording(false);
    })();
  }, [phase, result, recording]);

  const togglePause = () => {
    if (paused) {
      endsAtRef.current = Date.now() + remainingMs;
      setPaused(false);
    } else {
      setRemainingMs(Math.max(0, endsAtRef.current - Date.now()));
      setPaused(true);
      Speech.stop();
    }
  };

  const confirmEnd = () => {
    Alert.alert('End workout?', 'Progress in this session won’t be saved.', [
      { text: 'Keep going', style: 'cancel' },
      {
        text: 'End workout',
        style: 'destructive',
        onPress: () => {
          Speech.stop();
          setPhase('preview');
        },
      },
    ]);
  };

  const backToPreview = () => {
    setResult(null);
    setPhase('preview');
  };

  // ── PREVIEW ──────────────────────────────────────────────────────────────
  if (phase === 'preview') {
    return (
      <View style={styles.screen}>
        <Text style={styles.title}>{workout.title}</Text>
        <Text style={styles.subtitle}>{workout.subtitle}</Text>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>Equipment</Text>
          <Text style={styles.cardBody}>
            {workout.equipment.length === 0 ? 'None — just you' : workout.equipment.join(' · ')}
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>Rounds</Text>
          {workout.actions.map((a, i) => (
            <Text key={a.name} style={styles.cardBody}>
              {i + 1}. {a.name} — {Math.round(a.roundSeconds / 60)} min
            </Text>
          ))}
          <Text style={styles.cardMeta}>
            Rest {workout.restSeconds}s · voice callouts on ·{' '}
            <Text style={styles.gold}>+{workout.xp} XP</Text>
          </Text>
        </View>

        <Pressable style={styles.startBtn} onPress={() => startPhase('work', 1)}>
          <Text style={styles.startText}>Start</Text>
        </Pressable>

        <Pressable onPress={() => setQuick(!quick)} hitSlop={8}>
          <Text style={styles.devToggle}>⚡ Quick test mode: {quick ? 'ON (15s rounds)' : 'off'}</Text>
        </Pressable>
      </View>
    );
  }

  // ── SUMMARY (records the completion -> xp_events) ────────────────────────
  if (phase === 'summary') {
    return (
      <View style={styles.screen}>
        <Text style={styles.bigEmoji}>🔔</Text>
        <Text style={styles.title}>That’s the bell.</Text>
        <Text style={styles.subtitle}>
          {totalRounds} rounds · {fmt(totalRounds * secondsFor('work', 1) * 1000)} of work. You
          showed up — that’s the whole job.
        </Text>

        {recording && <Text style={styles.cardMeta}>Saving your work…</Text>}
        {result && 'error' in result && <Text style={styles.errorText}>{result.error}</Text>}
        {result && !('error' in result) && result.reason === 'already_completed_today' && (
          <Text style={styles.cardMeta}>
            Already counted today — XP is once per workout per day. The extra work still makes you
            better. 💪
          </Text>
        )}
        {result && !('error' in result) && result.awarded > 0 && (
          <View style={styles.xpBlock}>
            <Text style={styles.xpBig}>+{result.awarded} XP</Text>
            {result.first_time && <Text style={styles.cardMeta}>First-time bonus included!</Text>}
            <Text style={styles.cardMeta}>
              Total {result.total_xp} XP · Level {result.level}
            </Text>
          </View>
        )}

        <Pressable style={styles.startBtn} onPress={backToPreview}>
          <Text style={styles.startText}>Done</Text>
        </Pressable>
      </View>
    );
  }

  // ── ACTIVE: WORK (red) / REST (green) ────────────────────────────────────
  const isWork = phase === 'work';
  const nextAction = workout.actions[round];

  return (
    <View style={[styles.screen, isWork ? styles.workBg : styles.restBg]}>
      <Text style={styles.phaseLabel}>{isWork ? `ROUND ${round} OF ${totalRounds}` : 'REST'}</Text>

      <Text style={[styles.clock, isWork ? styles.clockWork : styles.clockRest]}>
        {fmt(remainingMs)}
      </Text>

      <Text style={styles.calloutText}>{callout !== '' ? callout : isWork ? workout.actions[round - 1].name : 'Breathe.'}</Text>

      {!isWork && nextAction && (
        <Text style={styles.nextHint}>Next — Round {round + 1}: {nextAction.name}</Text>
      )}
      {paused && <Text style={styles.pausedTag}>PAUSED</Text>}

      <View style={styles.controls}>
        <Pressable style={styles.ctrlBtn} onPress={togglePause}>
          <Text style={styles.ctrlText}>{paused ? 'Resume' : 'Pause'}</Text>
        </Pressable>
        <Pressable style={styles.ctrlBtn} onPress={advance}>
          <Text style={styles.ctrlText}>{isWork ? 'Skip round' : 'Skip rest'}</Text>
        </Pressable>
        <Pressable style={[styles.ctrlBtn, styles.endBtn]} onPress={confirmEnd}>
          <Text style={[styles.ctrlText, styles.endText]}>End</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: theme.colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.space.lg,
    gap: theme.space.md,
  },
  workBg: { backgroundColor: '#2A0E13' },
  restBg: { backgroundColor: '#0F2418' },
  title: { fontSize: theme.font.title, fontWeight: '800', color: theme.colors.text, textAlign: 'center' },
  subtitle: { fontSize: theme.font.body, color: theme.colors.muted, textAlign: 'center' },
  bigEmoji: { fontSize: 52 },
  card: {
    alignSelf: 'stretch',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.line,
    padding: theme.space.md,
    gap: theme.space.xs,
  },
  cardLabel: { fontSize: theme.font.small, color: theme.colors.muted, textTransform: 'uppercase', letterSpacing: 1 },
  cardBody: { fontSize: theme.font.body, color: theme.colors.text },
  cardMeta: { fontSize: theme.font.small, color: theme.colors.muted, marginTop: theme.space.xs, textAlign: 'center' },
  gold: { color: theme.colors.gold, fontWeight: '700' },
  xpBlock: { alignItems: 'center', gap: theme.space.xs },
  xpBig: { fontSize: 44, fontWeight: '800', color: theme.colors.gold },
  errorText: { fontSize: theme.font.body, color: theme.colors.danger, textAlign: 'center' },
  startBtn: {
    backgroundColor: theme.colors.red,
    borderRadius: theme.radius.pill,
    paddingVertical: 16,
    paddingHorizontal: 64,
    marginTop: theme.space.sm,
  },
  startText: { color: '#fff', fontSize: theme.font.header, fontWeight: '800' },
  devToggle: { fontSize: theme.font.small, color: theme.colors.muted, textDecorationLine: 'underline' },
  phaseLabel: { fontSize: theme.font.body, fontWeight: '800', letterSpacing: 3, color: theme.colors.text },
  clock: { fontSize: 84, fontWeight: '800', fontVariant: ['tabular-nums'] },
  clockWork: { color: theme.colors.red },
  clockRest: { color: theme.colors.green },
  calloutText: {
    fontSize: 26,
    fontWeight: '700',
    color: theme.colors.text,
    textAlign: 'center',
    minHeight: 70,
  },
  nextHint: { fontSize: theme.font.body, color: theme.colors.muted, textAlign: 'center' },
  pausedTag: { fontSize: theme.font.body, fontWeight: '800', color: theme.colors.gold, letterSpacing: 2 },
  controls: { flexDirection: 'row', gap: theme.space.sm, marginTop: theme.space.lg },
  ctrlBtn: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.line,
    borderRadius: theme.radius.lg,
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  ctrlText: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '600' },
  endBtn: { borderColor: theme.colors.danger },
  endText: { color: theme.colors.danger },
});
