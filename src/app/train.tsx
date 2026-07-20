import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { theme } from '@/constants/theme';

/**
 * Day 16 — Train: the round timer (the app's beating heart).
 * Phases: preview -> work -> rest -> ... -> done.
 * Function over polish: audio callouts + real summary/XP arrive Day 17,
 * loading workouts from Supabase content_items comes with the Learn build.
 */

// ─── MOCK TIMING ────────────────────────────────────────────────────────────
// Placeholder pacing from the content bank's "First Bell" script.
// ⚠ TO BE REPLACED with the client's real in-person instructing rhythm
// (round length, rest length, how he paces kids) — saved reminder.
// Timing lives in DATA so that swap is an edit, not a rebuild.
const FIRST_BELL = {
  title: 'First Bell',
  subtitle: 'Your first workout — stance and jab. No equipment needed.',
  equipment: [] as string[], // D5: equipment list renders ABOVE actions
  actions: [
    { name: 'Stance + single jab', roundSeconds: 180 },
    { name: 'Double jab + small steps', roundSeconds: 180 },
  ],
  restSeconds: 60,
  xp: 50,
};

// Dev-only fast run so a full session can be tested in under a minute.
const QUICK_TEST = { roundSeconds: 15, restSeconds: 8 };
// ────────────────────────────────────────────────────────────────────────────

type Phase = 'preview' | 'work' | 'rest' | 'done';

function fmt(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function TrainScreen() {
  const workout = FIRST_BELL;
  const totalRounds = workout.actions.length;

  const [phase, setPhase] = useState<Phase>('preview');
  const [round, setRound] = useState(1);
  const [remainingMs, setRemainingMs] = useState(0);
  const [paused, setPaused] = useState(false);
  const [quick, setQuick] = useState(false);

  const endsAtRef = useRef(0);
  const phaseRef = useRef<Phase>('preview');
  const roundRef = useRef(1);
  phaseRef.current = phase;
  roundRef.current = round;

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

  const startPhase = useCallback(
    (p: 'work' | 'rest', r: number) => {
      const ms = secondsFor(p, r) * 1000;
      endsAtRef.current = Date.now() + ms;
      setRemainingMs(ms);
      setRound(r);
      setPhase(p);
      setPaused(false);
    },
    [secondsFor],
  );

  const advance = useCallback(() => {
    const p = phaseRef.current;
    const r = roundRef.current;
    if (p === 'work') {
      if (r < totalRounds) startPhase('rest', r);
      else setPhase('done');
    } else if (p === 'rest') {
      startPhase('work', r + 1);
    }
  }, [startPhase, totalRounds]);

  // The tick: timestamp-based so pauses/app hiccups don't drift the clock.
  useEffect(() => {
    if ((phase !== 'work' && phase !== 'rest') || paused) return;
    const id = setInterval(() => {
      const left = endsAtRef.current - Date.now();
      if (left <= 0) advance();
      else setRemainingMs(left);
    }, 250);
    return () => clearInterval(id);
  }, [phase, paused, advance]);

  const togglePause = () => {
    if (paused) {
      endsAtRef.current = Date.now() + remainingMs;
      setPaused(false);
    } else {
      setRemainingMs(Math.max(0, endsAtRef.current - Date.now()));
      setPaused(true);
    }
  };

  const confirmEnd = () => {
    Alert.alert('End workout?', 'Progress in this session won’t be saved.', [
      { text: 'Keep going', style: 'cancel' },
      { text: 'End workout', style: 'destructive', onPress: () => setPhase('preview') },
    ]);
  };

  // ── PREVIEW (D2: clean pre-start · D5: equipment above actions) ──────────
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
            Rest {workout.restSeconds}s between rounds · <Text style={styles.gold}>+{workout.xp} XP</Text>
          </Text>
        </View>

        <Pressable style={styles.startBtn} onPress={() => startPhase('work', 1)}>
          <Text style={styles.startText}>Start</Text>
        </Pressable>

        <Pressable onPress={() => setQuick(!quick)} hitSlop={8}>
          <Text style={styles.devToggle}>
            ⚡ Quick test mode: {quick ? 'ON (15s rounds)' : 'off'}
          </Text>
        </Pressable>
      </View>
    );
  }

  // ── DONE (minimal — real summary + XP pipeline is Day 17) ────────────────
  if (phase === 'done') {
    return (
      <View style={styles.screen}>
        <Text style={styles.bigEmoji}>🔔</Text>
        <Text style={styles.title}>That’s the bell.</Text>
        <Text style={styles.subtitle}>
          {totalRounds} rounds done. You showed up and you worked — that’s the whole job today.
        </Text>
        <Text style={styles.cardMeta}>Summary + <Text style={styles.gold}>+{workout.xp} XP</Text> arrive Day 17.</Text>
        <Pressable style={styles.startBtn} onPress={() => setPhase('preview')}>
          <Text style={styles.startText}>Done</Text>
        </Pressable>
      </View>
    );
  }

  // ── ACTIVE: WORK (red) / REST (green) ────────────────────────────────────
  const isWork = phase === 'work';
  const nextAction = workout.actions[round]; // undefined on last round

  return (
    <View style={[styles.screen, isWork ? styles.workBg : styles.restBg]}>
      <Text style={styles.phaseLabel}>
        {isWork ? `ROUND ${round} OF ${totalRounds}` : 'REST'}
      </Text>
      <Text style={styles.actionName}>
        {isWork ? workout.actions[round - 1].name : 'Breathe. Shoulders down.'}
      </Text>

      <Text style={[styles.clock, isWork ? styles.clockWork : styles.clockRest]}>
        {fmt(remainingMs)}
      </Text>

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
  workBg: { backgroundColor: '#2A0E13' }, // dark red — work phase
  restBg: { backgroundColor: '#0F2418' }, // dark green — rest phase
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
  cardMeta: { fontSize: theme.font.small, color: theme.colors.muted, marginTop: theme.space.xs },
  gold: { color: theme.colors.gold, fontWeight: '700' },
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
  actionName: { fontSize: theme.font.header, color: theme.colors.muted, textAlign: 'center' },
  clock: { fontSize: 88, fontWeight: '800', fontVariant: ['tabular-nums'] },
  clockWork: { color: theme.colors.red },
  clockRest: { color: theme.colors.green },
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
