import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { theme } from '@/constants/theme';
import { supabase } from '../../lib/supabase';

/**
 * Decision 5 (2026-11-03) — Fuel Check, free forever.
 *
 * Three yes-or-no habits, once a day; 2 of 3 earns XP through the one
 * completion pipeline (submit_fuel_check → complete_activity). The server
 * keeps only the day and pass/fail — never the answers, never any numbers.
 * Habit copy comes from the fuel_check_habits table (placeholder content).
 *
 * The calorie target line shows only for accounts the SERVER says are 18+
 * and have turned it on in Settings (Option A; legal + clinical review
 * before launch). Kids never see a number here.
 */

type Today = {
  habits: string[];
  needed: number;
  xp: number;
  done_today: boolean;
  passed_today: boolean;
  calorie_target: number | null;
};

export default function FuelCheckCard() {
  const [today, setToday] = useState<Today | null>(null);
  const [answers, setAnswers] = useState<boolean[]>([false, false, false]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState('');

  const load = useCallback(async () => {
    const { data } = await supabase.rpc('fuel_check_today');
    if (data) setToday(data as Today);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (!today || today.habits.length !== 3) return null;

  const submit = async () => {
    setBusy(true);
    const { data, error } = await supabase.rpc('submit_fuel_check', { p_answers: answers });
    setBusy(false);
    const d = data as { ok: boolean; passed?: boolean; awarded?: number } | null;
    if (error || !d?.ok) {
      await load();
      return;
    }
    setResult(d.passed ? `Fueled up. +${d.awarded ?? 0} XP 🔥` : 'Logged. Tomorrow’s a new day.');
    await load();
  };

  const toggle = (i: number) => setAnswers((prev) => prev.map((a, j) => (j === i ? !a : a)));

  return (
    <View style={styles.card}>
      <Text style={styles.title}>⛽ Fuel Check</Text>
      {today.done_today ? (
        <Text style={styles.doneLine}>
          {result ||
            (today.passed_today ? 'Fueled up today. See you tomorrow.' : 'Logged today. Tomorrow’s a new day.')}
        </Text>
      ) : (
        <>
          <Text style={styles.meta}>
            Yes to {today.needed} of 3 earns +{today.xp} XP. Honest answers only.
          </Text>
          {today.habits.map((h, i) => (
            <Pressable
              key={h}
              style={[styles.habit, answers[i] && styles.habitOn]}
              onPress={() => toggle(i)}>
              <Text style={styles.habitText}>{h}</Text>
              <Text style={[styles.answer, answers[i] && styles.answerOn]}>{answers[i] ? 'Yes' : 'No'}</Text>
            </Pressable>
          ))}
          <Pressable style={[styles.logBtn, busy && { opacity: 0.5 }]} disabled={busy} onPress={submit}>
            <Text style={styles.logText}>{busy ? 'Logging…' : 'Log it'}</Text>
          </Pressable>
        </>
      )}
      {today.calorie_target ? (
        <Text style={styles.calorieLine}>
          Your calorie target: {today.calorie_target.toLocaleString()} a day (your setting).
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.green,
    padding: theme.space.md,
    marginTop: theme.space.sm,
    gap: theme.space.xs,
  },
  title: { fontSize: theme.font.body, fontWeight: '800', color: theme.colors.text },
  meta: { fontSize: theme.font.small, color: theme.colors.muted, marginBottom: theme.space.xs },
  doneLine: { fontSize: theme.font.small, color: theme.colors.green, fontWeight: '700' },
  habit: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: theme.colors.line,
    borderRadius: theme.radius.sm,
    paddingHorizontal: theme.space.md,
    paddingVertical: 10,
  },
  habitOn: { borderColor: theme.colors.green },
  habitText: { fontSize: theme.font.body, color: theme.colors.text },
  answer: { fontSize: theme.font.small, fontWeight: '800', color: theme.colors.muted },
  answerOn: { color: theme.colors.green },
  logBtn: {
    backgroundColor: theme.colors.green,
    borderRadius: theme.radius.pill,
    paddingVertical: 11,
    alignItems: 'center',
    marginTop: theme.space.xs,
  },
  logText: { color: '#fff', fontSize: theme.font.body, fontWeight: '800' },
  calorieLine: { fontSize: theme.font.small, color: theme.colors.muted, marginTop: theme.space.xs },
});
