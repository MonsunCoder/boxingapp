import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/components/auth/AuthProvider';
import { theme } from '@/constants/theme';
import { supabase } from '../../lib/supabase';

/**
 * Day 37 — Privacy & Your Data: the plain-language screen.
 *
 * Written for a kid to actually read, and for a parent to trust. The lists
 * below must stay TRUE — if a future feature collects something new, it gets
 * added here in the same release, or the feature waits (SPEC rule).
 *
 * Delete is REAL: delete_my_account() removes every row the account owns,
 * then the account itself, server-side. Double-confirmed, then signed out.
 * COPPA note: this is also the parent-requested-deletion path; the formal
 * legal review pre-launch may add a parent-initiated flow on top.
 */

const COLLECTED: { what: string; why: string }[] = [
  { what: 'Your email + date of birth', why: 'Sign-in, and knowing if we need a parent’s OK.' },
  { what: 'Your fight name + avatar', why: 'What other kids see. Never your email, never your real name unless you choose it.' },
  { what: 'What you complete (lessons, workouts, LESSONs)', why: 'Your XP, streak, belts, and quests — the whole point.' },
  { what: 'Your posts and replies', why: 'The HOPE feed. Coaches can read everything — that’s the deal.' },
];

const NOT_COLLECTED: string[] = [
  'Your choices inside LESSON scenarios — how you answer stays with you.',
  'What you eat, your weight, or calories — we don’t ask, we don’t store.',
  'Private messages — they don’t exist in this app, for anyone.',
  'Your location.',
  'Ad-tracking anything. There are no ads.',
];

export default function PrivacyScreen() {
  const router = useRouter();
  const { signOut } = useAuth();
  const [busy, setBusy] = useState(false);

  const deleteAccount = () => {
    Alert.alert(
      'Delete your account?',
      'Everything goes: belts, XP, streaks, posts, all of it. There is no undo.',
      [
        { text: 'Keep my account', style: 'cancel' },
        {
          text: 'Delete everything',
          style: 'destructive',
          onPress: () =>
            Alert.alert('Last check', 'This really is forever. Delete the account?', [
              { text: 'No, go back', style: 'cancel' },
              {
                text: 'Yes — delete it',
                style: 'destructive',
                onPress: async () => {
                  setBusy(true);
                  const { error } = await supabase.rpc('delete_my_account');
                  setBusy(false);
                  if (error) {
                    Alert.alert('Something went wrong', error.message);
                    return;
                  }
                  await signOut();
                },
              },
            ]),
        },
      ],
    );
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Pressable onPress={() => router.back()} hitSlop={12}>
        <Text style={styles.back}>‹ Account</Text>
      </Pressable>
      <Text style={styles.title}>Privacy & Your Data</Text>
      <Text style={styles.subtitle}>
        The short version, in real words. (The full legal policy ships with launch.)
      </Text>

      <Text style={styles.sectionTitle}>What we keep</Text>
      {COLLECTED.map((c) => (
        <View key={c.what} style={styles.card}>
          <Text style={styles.cardWhat}>{c.what}</Text>
          <Text style={styles.cardWhy}>{c.why}</Text>
        </View>
      ))}

      <Text style={styles.sectionTitle}>What we never collect</Text>
      <View style={[styles.card, styles.neverCard]}>
        {NOT_COLLECTED.map((n) => (
          <Text key={n} style={styles.neverLine}>✗ {n}</Text>
        ))}
      </View>

      <Text style={styles.sectionTitle}>Leaving for real</Text>
      <Text style={styles.subtitle}>
        Deleting your account removes everything you ever did here, permanently, right away.
        Parents can ask us to do this too.
      </Text>
      <Pressable
        style={[styles.deleteBtn, busy && { opacity: 0.5 }]}
        disabled={busy}
        onPress={deleteAccount}>
        <Text style={styles.deleteText}>{busy ? 'Deleting…' : 'Delete my account'}</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.bg },
  content: { paddingTop: 64, paddingHorizontal: theme.space.md, paddingBottom: theme.space.xl, gap: theme.space.sm },
  back: { fontSize: theme.font.body, color: theme.colors.muted },
  title: { fontSize: theme.font.title, fontWeight: '800', color: theme.colors.text },
  subtitle: { fontSize: theme.font.small, color: theme.colors.muted, lineHeight: 19 },
  sectionTitle: {
    fontSize: theme.font.header,
    fontWeight: '700',
    color: theme.colors.text,
    marginTop: theme.space.sm,
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.line,
    borderWidth: 1,
    borderRadius: theme.radius.md,
    padding: theme.space.md,
    gap: 4,
  },
  cardWhat: { fontSize: theme.font.body, fontWeight: '700', color: theme.colors.text },
  cardWhy: { fontSize: theme.font.small, color: theme.colors.muted, lineHeight: 18 },
  neverCard: { borderColor: theme.colors.green, gap: 8 },
  neverLine: { fontSize: theme.font.small, color: theme.colors.text, lineHeight: 18 },
  deleteBtn: {
    backgroundColor: theme.colors.danger,
    borderRadius: theme.radius.lg,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: theme.space.xs,
  },
  deleteText: { color: '#fff', fontSize: theme.font.body, fontWeight: '800' },
});
