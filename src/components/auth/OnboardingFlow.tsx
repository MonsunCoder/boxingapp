import { theme } from '@/constants/theme';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { supabase } from '../../../lib/supabase';
import { useAuth } from './AuthProvider';

/**
 * Day 14 — first-run onboarding (SPEC onboarding flow, steps 4–7 / 04b D6).
 * Sign-up, age gate, and parental consent are handled upstream by AuthGate.
 * This is the post-consent flow, one decision per screen, strict order:
 *   goals -> "Deal." (words-first opt-in) -> Initiation Film -> Ring the First Bell
 * Answers are saved to the profile; the final step marks onboarding complete,
 * which drops the kid into the app (their First Bell workout is Day 16–17).
 *
 * NOTE: everything here is function, not final look — copy/art/theme come later.
 */

type Step = 'goals' | 'deal' | 'film' | 'firstbell';

const GOALS = [
  { key: 'confidence', emoji: '🔥', label: 'Confidence' },
  { key: 'fitness', emoji: '💪', label: 'Get fit' },
  { key: 'skills', emoji: '🥊', label: 'Boxing skills' },
  { key: 'all', emoji: '⭐', label: 'All of it' },
];

export default function OnboardingFlow() {
  const { session, refreshProfile } = useAuth();
  const [step, setStep] = useState<Step>('goals');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const uid = session!.user.id;

  const pickGoal = async (goalKey: string) => {
    setBusy(true);
    setError('');
    const { error: e } = await supabase
      .from('profiles')
      .update({ goals: [goalKey] })
      .eq('id', uid);
    setBusy(false);
    if (e) setError(e.message);
    else setStep('deal');
  };

  const acceptDeal = async () => {
    setBusy(true);
    setError('');
    const { error: e } = await supabase
      .from('profiles')
      .update({ words_first_optin: true })
      .eq('id', uid);
    setBusy(false);
    if (e) setError(e.message);
    else setStep('film');
  };

  const ringFirstBell = async () => {
    setBusy(true);
    setError('');
    const { error: e } = await supabase
      .from('profiles')
      .update({ onboarding_complete: true })
      .eq('id', uid);
    setBusy(false);
    if (e) setError(e.message);
    else await refreshProfile(); // AuthGate re-renders into the app
  };

  const stepIndex = ['goals', 'deal', 'film', 'firstbell'].indexOf(step);

  return (
    <View style={styles.container}>
      <View style={styles.dots}>
        {[0, 1, 2, 3].map((i) => (
          <View key={i} style={[styles.dot, i <= stepIndex && styles.dotActive]} />
        ))}
      </View>

      {step === 'goals' && (
        <View style={styles.body}>
          <Text style={styles.title}>What are you here for?</Text>
          <Text style={styles.subtitle}>Pick the one that fits best. You can change later.</Text>
          <View style={styles.goalGrid}>
            {GOALS.map((g) => (
              <Pressable
                key={g.key}
                style={styles.goalCard}
                disabled={busy}
                onPress={() => pickGoal(g.key)}>
                <Text style={styles.goalEmoji}>{g.emoji}</Text>
                <Text style={styles.goalLabel}>{g.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}

      {step === 'deal' && (
        <View style={styles.body}>
          <Text style={styles.bigEmoji}>🤝</Text>
          <Text style={styles.title}>Here, words come first.</Text>
          <Text style={styles.dealText}>
            Boxing comes after. You&apos;ll learn to handle things with your head before your hands
            — every time. That&apos;s the deal.
          </Text>
          <Pressable
            style={[styles.primary, busy && styles.disabled]}
            disabled={busy}
            onPress={acceptDeal}>
            <Text style={styles.primaryText}>{busy ? 'One sec…' : 'Deal.'}</Text>
          </Pressable>
        </View>
      )}

      {step === 'film' && (
        <View style={styles.body}>
          <Text style={styles.title}>The Initiation Film</Text>
          <View style={styles.filmStage}>
            <Text style={styles.playIcon}>▶</Text>
            <Text style={styles.filmNote}>~60s film — coming soon</Text>
          </View>
          <Text style={styles.subtitle}>Why we train this way. The mission before the first punch.</Text>
          <Pressable style={styles.primary} onPress={() => setStep('firstbell')}>
            <Text style={styles.primaryText}>Begin Your Journey</Text>
          </Pressable>
        </View>
      )}

      {step === 'firstbell' && (
        <View style={styles.body}>
          <Text style={styles.bigEmoji}>🔔</Text>
          <Text style={styles.title}>Ring the First Bell</Text>
          <Text style={styles.subtitle}>
            Your first workout is waiting. Two rounds, stance and jab. Let&apos;s go.
          </Text>
          <Pressable
            style={[styles.primary, busy && styles.disabled]}
            disabled={busy}
            onPress={ringFirstBell}>
            <Text style={styles.primaryText}>{busy ? 'Starting…' : 'Ring the First Bell'}</Text>
          </Pressable>
        </View>
      )}

      {error !== '' && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bg, justifyContent: 'center', padding: 28 },
  dots: { flexDirection: 'row', gap: 8, justifyContent: 'center', marginBottom: 40 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: theme.colors.line },
  dotActive: { backgroundColor: theme.colors.red },
  body: { gap: 18, alignItems: 'center' },
  bigEmoji: { fontSize: 52 },
  title: { fontSize: 27, fontWeight: '800', textAlign: 'center', color: theme.colors.text },
  subtitle: { fontSize: 15, color: theme.colors.muted, textAlign: 'center', lineHeight: 22 },
  dealText: { fontSize: 16, color: theme.colors.text, textAlign: 'center', lineHeight: 24 },
  goalGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'center',
    marginTop: 8,
  },
  goalCard: {
    width: 140,
    height: 110,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.line,
    backgroundColor: theme.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  goalEmoji: { fontSize: 32 },
  goalLabel: { fontSize: 15, fontWeight: '600', color: theme.colors.text },
  filmStage: {
    width: '100%',
    height: 200,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.line,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  playIcon: { fontSize: 44, color: theme.colors.text },
  filmNote: { fontSize: 13, color: theme.colors.muted },
  primary: {
    backgroundColor: theme.colors.red,
    borderRadius: theme.radius.pill,
    paddingVertical: 16,
    paddingHorizontal: 40,
    alignItems: 'center',
    marginTop: 8,
    minWidth: 220,
  },
  disabled: { opacity: 0.5 },
  primaryText: { color: '#fff', fontSize: 18, fontWeight: '700' },
  error: { marginTop: 20, fontSize: 14, color: theme.colors.danger, textAlign: 'center' },
});
