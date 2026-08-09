import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Pressable, SectionList, StyleSheet, Text, View } from 'react-native';
import * as Speech from 'expo-speech';

import { theme } from '@/constants/theme';
import { supabase } from '../../lib/supabase';

/**
 * Train tab — now DATA-DRIVEN (Day 22+23 refactor of the Day 17 engine).
 *
 * Day 17 hardcoded First Bell into this file to prove the timer + callout
 * engine. Day 21 made ranks require OTHER workouts, so the shortcut is
 * retired: every workout/drill now comes from content_items, and its rounds,
 * rest, and full callout script live in config (standing rule 5 — config over
 * code). First Bell's script moved to the DB verbatim. Adding a workout is
 * now a database row, not an app release.
 *
 * This also sets up the client-rhythm idea: when his real instructing pacing
 * is captured, it lands as config edits — same engine, new tempo.
 *
 * Voice is still TTS placeholder; real recorded callouts arrive in content
 * production. Screen flow: LIST -> preview -> work/rest rounds -> summary.
 * Preview keeps D2 (clean pre-start screen) and D5 (equipment above actions).
 */

type Callout = { at: number; text: string }; // `at` = seconds REMAINING in phase

type WorkoutConfig = {
  placeholder?: boolean;
  subtitle?: string;
  equipment?: string[];
  mode?: 'rounds' | 'reps'; // Day 32: 'reps' = sets×reps strength sessions
  actions?: { name: string; roundSeconds: number }[]; // rounds mode
  exercises?: { name: string; sets: number; reps: number; cue?: string }[]; // reps mode
  restSeconds?: number;
  round_callouts?: Callout[][];
  rest_callouts?: Callout[];
  repeat_recommended?: boolean; // warmups/practice drills that stay in rotation (Day 29)
};

type WorkoutItem = {
  id: string;
  title: string;
  type: string;
  xp_value: number;
  duration_min: number | null;
  config: WorkoutConfig;
};

// Dev-only fast run (15s rounds) with a mini callout set.
const QUICK_TEST = { roundSeconds: 15, restSeconds: 8 };
const QUICK_ROUND_CALLOUTS: Callout[] = [
  { at: 12, text: 'Work.' },
  { at: 6, text: 'Halfway.' },
];
const QUICK_REST_CALLOUTS: Callout[] = [{ at: 5, text: 'Ready.' }];

type Phase = 'list' | 'preview' | 'work' | 'rest' | 'reps' | 'summary';
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
  // Deep link: /train?open=<content_id> lands straight on that workout's
  // preview (used by onboarding, the ladder, and pathway webs — Day 29).
  const { open } = useLocalSearchParams<{ open?: string }>();
  const handledOpenRef = useRef<string | null>(null);

  const [items, setItems] = useState<WorkoutItem[]>([]);
  const [doneIds, setDoneIds] = useState<Set<string>>(new Set());
  const [listStatus, setListStatus] = useState('Loading…');
  const [workout, setWorkout] = useState<WorkoutItem | null>(null);

  const [phase, setPhase] = useState<Phase>('list');
  const [round, setRound] = useState(1);
  const [remainingMs, setRemainingMs] = useState(0);
  const [paused, setPaused] = useState(false);
  const [quick, setQuick] = useState(false);
  const [callout, setCallout] = useState('');
  const [result, setResult] = useState<RecordResult | null>(null);
  const [recording, setRecording] = useState(false);

  const endsAtRef = useRef(0);
  const phaseRef = useRef<Phase>('list');
  const roundRef = useRef(1);
  const firedRef = useRef<Set<number>>(new Set());
  phaseRef.current = phase;
  roundRef.current = round;

  const actions = workout?.config?.actions ?? [];
  const totalRounds = actions.length;
  const restSeconds = workout?.config?.restSeconds ?? 60;
  const isReps = workout?.config?.mode === 'reps';
  const exercises = workout?.config?.exercises ?? [];

  // Reps-mode cursor (Day 32): which exercise, which set.
  const [exIndex, setExIndex] = useState(0);
  const [setNum, setSetNum] = useState(1);

  // Load every runnable workout/drill. Reload on focus so new content rows
  // appear without a restart.
  const loadList = useCallback(async () => {
    const [{ data, error }, { data: doneRows }] = await Promise.all([
      supabase
        .from('content_items')
        .select('id, title, type, xp_value, duration_min, config')
        .in('type', ['workout', 'drill'])
        .order('title'),
      supabase.from('xp_events').select('content_id').eq('event_type', 'completion'),
    ]);
    setDoneIds(new Set((doneRows ?? []).map((r) => r.content_id as string)));
    if (error) setListStatus(`Error: ${error.message}`);
    else if (!data || data.length === 0) setListStatus('No workouts yet.');
    else {
      setItems(data as WorkoutItem[]);
      setListStatus('');
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      // Only refresh the list when we're actually on it — never mid-round.
      if (phaseRef.current === 'list') loadList();
    }, [loadList]),
  );

  useEffect(() => () => Speech.stop(), []);

  // Going away = going quiet (Day 30 fix). Tab screens stay MOUNTED when you
  // switch tabs — they only lose focus — so a running round kept talking from
  // other pages. On blur: kill the voice and auto-pause a live workout so the
  // kid comes back to a paused round, not a missed one.
  useFocusEffect(
    useCallback(() => {
      return () => {
        Speech.stop();
        if (phaseRef.current === 'work' || phaseRef.current === 'rest') {
          setRemainingMs(Math.max(0, endsAtRef.current - Date.now()));
          setPaused(true);
        }
      };
    }, []),
  );

  const isRunnable = (i: WorkoutItem) =>
    (i.config?.actions?.length ?? 0) > 0 || (i.config?.exercises?.length ?? 0) > 0;

  // Honor the deep link once per distinct `open` value, only from the list.
  useEffect(() => {
    if (!open || typeof open !== 'string' || open === handledOpenRef.current) return;
    if (phaseRef.current !== 'list' || items.length === 0) return;
    const target = items.find((i) => i.id === open);
    if (target && isRunnable(target)) {
      handledOpenRef.current = open;
      setWorkout(target);
      setResult(null);
      setPhase('preview');
    }
  }, [open, items]);

  // ── REPS MODE (Day 32): sets × reps, no clock — the kid sets the pace. ──
  const startReps = () => {
    setExIndex(0);
    setSetNum(1);
    setPhase('reps');
    const first = exercises[0];
    if (first) say(`First up: ${first.name}. ${first.sets} sets of ${first.reps}. Set one — go.`);
  };

  const completeSet = () => {
    const ex = exercises[exIndex];
    if (!ex) return;
    if (setNum < ex.sets) {
      const next = setNum + 1;
      setSetNum(next);
      say(`Set ${next} of ${ex.sets}. Breathe, then go.`);
      return;
    }
    const nextIndex = exIndex + 1;
    if (nextIndex < exercises.length) {
      const nx = exercises[nextIndex];
      setExIndex(nextIndex);
      setSetNum(1);
      say(`Next: ${nx.name}. ${nx.sets} sets of ${nx.reps}. Set one — go.`);
    } else {
      setPhase('summary');
      say('That is the bell. Workout complete.');
    }
  };

  const secondsFor = useCallback(
    (p: 'work' | 'rest', r: number) =>
      p === 'work'
        ? quick
          ? QUICK_TEST.roundSeconds
          : (actions[r - 1]?.roundSeconds ?? 60)
        : quick
          ? QUICK_TEST.restSeconds
          : restSeconds,
    [quick, actions, restSeconds],
  );

  const calloutsFor = useCallback(
    (p: 'work' | 'rest', r: number): Callout[] =>
      p === 'work'
        ? quick
          ? QUICK_ROUND_CALLOUTS
          : (workout?.config?.round_callouts?.[r - 1] ?? [])
        : quick
          ? QUICK_REST_CALLOUTS
          : (workout?.config?.rest_callouts ?? []),
    [quick, workout],
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
      say(p === 'work' ? `Round ${r}. ${actions[r - 1]?.name ?? ''}.` : 'Rest.');
    },
    [secondsFor, actions],
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
    if (phase !== 'summary' || result !== null || recording || !workout) return;
    (async () => {
      setRecording(true);
      const { data, error } = await supabase.rpc('complete_activity', {
        p_content_id: workout.id,
        p_event_type: 'completion',
        p_client_event_id: `train-${workout.id}-${Date.now()}`,
      });
      setResult(error ? { error: error.message } : (data as RecordResult));
      setRecording(false);
    })();
  }, [phase, result, recording, workout]);

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

  const openWorkout = (item: WorkoutItem) => {
    setWorkout(item);
    setResult(null);
    setPhase('preview');
  };

  const backToList = () => {
    setResult(null);
    setWorkout(null);
    setPhase('list');
    loadList();
  };

  // ── LIST (Day 29: sectioned — Not Completed / Repeats Recommended / Completed) ──
  if (phase === 'list') {
    const done = (i: WorkoutItem) => doneIds.has(i.id);
    const repeat = (i: WorkoutItem) => i.config?.repeat_recommended === true;
    const sections = [
      { title: 'Not Completed', hint: 'Fresh work. This is where belts come from.', data: items.filter((i) => !done(i)) },
      { title: 'Repeats Recommended', hint: 'Warmups and practice — keep these in rotation.', data: items.filter((i) => done(i) && repeat(i)) },
      { title: 'Completed', hint: 'In the bank. Redo any of them whenever you like.', data: items.filter((i) => done(i) && !repeat(i)) },
    ].filter((s) => s.data.length > 0);

    return (
      <View style={styles.listScreen}>
        <Text style={styles.header}>Train</Text>
        {listStatus !== '' && <Text style={styles.listStatus}>{listStatus}</Text>}
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          stickySectionHeadersEnabled={false}
          contentContainerStyle={{ paddingBottom: theme.space.xl }}
          renderSectionHeader={({ section }) => (
            <View style={styles.sectionHead}>
              <Text style={styles.sectionTitle}>{section.title}</Text>
              <Text style={styles.sectionHint}>{section.hint}</Text>
            </View>
          )}
          renderItem={({ item }) => {
            const ready = isRunnable(item);
            const reps = item.config?.mode === 'reps';
            const shape = reps
              ? `${item.config.exercises!.length} exercises`
              : `${item.config?.actions?.length ?? 0} rounds`;
            return (
              <Pressable
                style={({ pressed }) => [styles.listCard, pressed && ready && styles.listPressed]}
                disabled={!ready}
                onPress={() => openWorkout(item)}>
                <Text style={styles.listEmoji}>{done(item) ? '✅' : reps ? '💪' : '🥊'}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.listTitle}>{item.title}</Text>
                  <Text style={styles.listMeta}>
                    {ready
                      ? `${shape}${item.duration_min ? ` · ~${item.duration_min} min` : ''} · `
                      : 'Script coming soon · '}
                    <Text style={styles.gold}>+{item.xp_value} XP</Text>
                    {done(item) && repeat(item) ? '  ·  🔁 keep practicing' : ''}
                  </Text>
                </View>
                {ready && <Text style={styles.chevron}>›</Text>}
              </Pressable>
            );
          }}
        />
      </View>
    );
  }

  if (!workout) return null; // unreachable: every phase past 'list' has a workout

  // ── PREVIEW (D2 clean pre-start; D5 equipment above actions) ─────────────
  if (phase === 'preview') {
    const equipment = workout.config?.equipment ?? [];
    return (
      <View style={styles.screen}>
        <Pressable onPress={backToList} hitSlop={12} style={styles.backWrap}>
          <Text style={styles.back}>‹ All workouts</Text>
        </Pressable>
        <Text style={styles.title}>{workout.title}</Text>
        <Text style={styles.subtitle}>{workout.config?.subtitle ?? ''}</Text>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>Equipment</Text>
          <Text style={styles.cardBody}>
            {equipment.length === 0 ? 'None — just you' : equipment.join(' · ')}
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>{isReps ? 'Exercises' : 'Rounds'}</Text>
          {isReps
            ? exercises.map((ex, i) => (
                <Text key={ex.name} style={styles.cardBody}>
                  {i + 1}. {ex.name} — {ex.sets} × {ex.reps}
                </Text>
              ))
            : actions.map((a, i) => (
                <Text key={a.name} style={styles.cardBody}>
                  {i + 1}. {a.name} — {Math.round(a.roundSeconds / 60)} min
                </Text>
              ))}
          <Text style={styles.cardMeta}>
            {isReps ? 'Your pace · voice cues on · ' : `Rest ${restSeconds}s · voice callouts on · `}
            <Text style={styles.gold}>+{workout.xp_value} XP</Text>
          </Text>
        </View>

        <Pressable style={styles.startBtn} onPress={() => (isReps ? startReps() : startPhase('work', 1))}>
          <Text style={styles.startText}>Start</Text>
        </Pressable>

        {!isReps && (
          <Pressable onPress={() => setQuick(!quick)} hitSlop={8}>
            <Text style={styles.devToggle}>⚡ Quick test mode: {quick ? 'ON (15s rounds)' : 'off'}</Text>
          </Pressable>
        )}
      </View>
    );
  }

  // ── REPS SESSION (Day 32): no clock, the kid sets the pace ───────────────
  if (phase === 'reps') {
    const ex = exercises[exIndex];
    const totalSets = exercises.reduce((s, e) => s + e.sets, 0);
    const doneSets = exercises.slice(0, exIndex).reduce((s, e) => s + e.sets, 0) + (setNum - 1);
    return (
      <View style={[styles.screen, styles.workBg]}>
        <Text style={styles.phaseLabel}>
          EXERCISE {exIndex + 1} OF {exercises.length}
        </Text>
        <Text style={styles.repsName}>{ex?.name}</Text>
        <Text style={styles.repsCount}>
          {ex?.reps} <Text style={styles.repsUnit}>reps</Text>
        </Text>
        <Text style={styles.calloutText}>
          Set {setNum} of {ex?.sets}
          {ex?.cue ? `\n${ex.cue}` : ''}
        </Text>
        <Text style={styles.nextHint}>{doneSets}/{totalSets} sets in the bank</Text>

        <Pressable style={styles.setDoneBtn} onPress={completeSet}>
          <Text style={styles.startText}>Set done ✓</Text>
        </Pressable>
        <View style={styles.controls}>
          <Pressable style={[styles.ctrlBtn, styles.endBtn]} onPress={confirmEnd}>
            <Text style={[styles.ctrlText, styles.endText]}>End</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // ── SUMMARY (records the completion -> xp_events) ────────────────────────
  if (phase === 'summary') {
    const workMs = actions.reduce((sum, a) => sum + (quick ? QUICK_TEST.roundSeconds : a.roundSeconds), 0) * 1000;
    return (
      <View style={styles.screen}>
        <Text style={styles.bigEmoji}>🔔</Text>
        <Text style={styles.title}>That’s the bell.</Text>
        <Text style={styles.subtitle}>
          {isReps
            ? `${exercises.reduce((s, e) => s + e.sets, 0)} sets across ${exercises.length} exercises. You showed up — that’s the whole job.`
            : `${totalRounds} rounds · ${fmt(workMs)} of work. You showed up — that’s the whole job.`}
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

        <Pressable style={styles.startBtn} onPress={backToList}>
          <Text style={styles.startText}>Done</Text>
        </Pressable>
      </View>
    );
  }

  // ── ACTIVE: WORK (red) / REST (green) ────────────────────────────────────
  const isWork = phase === 'work';
  const nextAction = actions[round];

  return (
    <View style={[styles.screen, isWork ? styles.workBg : styles.restBg]}>
      <Text style={styles.phaseLabel}>{isWork ? `ROUND ${round} OF ${totalRounds}` : 'REST'}</Text>

      <Text style={[styles.clock, isWork ? styles.clockWork : styles.clockRest]}>
        {fmt(remainingMs)}
      </Text>

      <Text style={styles.calloutText}>
        {callout !== '' ? callout : isWork ? (actions[round - 1]?.name ?? '') : 'Breathe.'}
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
  listScreen: {
    flex: 1,
    backgroundColor: theme.colors.bg,
    paddingTop: 72,
    paddingHorizontal: theme.space.md,
  },
  header: {
    fontSize: theme.font.title,
    fontWeight: '800',
    color: theme.colors.text,
    marginBottom: theme.space.md,
  },
  listStatus: { fontSize: theme.font.body, color: theme.colors.muted, marginBottom: theme.space.sm },
  sectionHead: { marginTop: theme.space.sm, marginBottom: theme.space.xs },
  sectionTitle: {
    fontSize: theme.font.small,
    fontWeight: '800',
    color: theme.colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  sectionHint: { fontSize: theme.font.small, color: theme.colors.muted, opacity: 0.7, marginTop: 2 },
  listCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.sm,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.line,
    padding: theme.space.md,
    marginBottom: theme.space.sm,
  },
  listPressed: { opacity: 0.75 },
  listEmoji: { fontSize: 26 },
  listTitle: { fontSize: theme.font.body, fontWeight: '700', color: theme.colors.text },
  listMeta: { fontSize: theme.font.small, color: theme.colors.muted, marginTop: 2 },
  chevron: { fontSize: 24, color: theme.colors.muted, fontWeight: '300' },

  screen: {
    flex: 1,
    backgroundColor: theme.colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.space.lg,
    gap: theme.space.md,
  },
  backWrap: { alignSelf: 'flex-start' },
  back: { fontSize: theme.font.body, color: theme.colors.muted },
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

  repsName: { fontSize: 30, fontWeight: '800', color: theme.colors.text, textAlign: 'center' },
  repsCount: { fontSize: 76, fontWeight: '800', color: theme.colors.red, fontVariant: ['tabular-nums'] },
  repsUnit: { fontSize: theme.font.header, color: theme.colors.muted, fontWeight: '700' },
  setDoneBtn: {
    backgroundColor: theme.colors.red,
    borderRadius: theme.radius.pill,
    paddingVertical: 18,
    paddingHorizontal: 64,
    marginTop: theme.space.md,
  },
});
