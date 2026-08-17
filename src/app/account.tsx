import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/components/auth/AuthProvider';
import { theme } from '@/constants/theme';
import { supabase } from '../../lib/supabase';

export default function AccountScreen() {
  const router = useRouter();
  const { session, signOut } = useAuth();
  const [role, setRole] = useState<string>('user');

  // Day 36: coaches (moderator/admin) get the queue entry. Role is read
  // fresh on focus; the queue itself re-checks server-side regardless.
  useFocusEffect(
    useCallback(() => {
      if (!session) return;
      supabase
        .from('profiles')
        .select('role')
        .eq('id', session.user.id)
        .maybeSingle()
        .then(({ data }) => setRole(data?.role ?? 'user'));
    }, [session]),
  );

  const isCoach = role === 'moderator' || role === 'admin';

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Account</Text>
      <Text style={styles.tagline}>Manage your profile and sign-in.</Text>

      <View style={styles.card}>
        <Text style={styles.label}>Signed in as</Text>
        <Text style={styles.email}>{session?.user.email ?? '—'}</Text>
      </View>

      {isCoach && (
        <Pressable
          onPress={() => router.push('/modqueue')}
          style={({ pressed }) => [styles.coachRow, pressed && styles.pressed]}>
          <Text style={styles.coachEmoji}>🛡️</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.coachTitle}>Coach&apos;s Queue</Text>
            <Text style={styles.coachMeta}>Held and reported content waiting on review.</Text>
          </View>
          <Text style={styles.chevron}>›</Text>
        </Pressable>
      )}

      <Pressable
        onPress={signOut}
        style={({ pressed }) => [styles.signOut, pressed && styles.pressed]}>
        <Text style={styles.signOutText}>Sign out</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.bg,
    paddingTop: 80,
    paddingHorizontal: theme.space.lg,
  },
  title: { fontSize: theme.font.title, fontWeight: '800', color: theme.colors.text },
  tagline: {
    fontSize: theme.font.body,
    color: theme.colors.muted,
    marginTop: theme.space.xs,
    marginBottom: theme.space.xl,
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.line,
    padding: theme.space.md,
    marginBottom: theme.space.lg,
  },
  label: { fontSize: theme.font.small, color: theme.colors.muted },
  email: {
    fontSize: theme.font.body,
    color: theme.colors.text,
    fontWeight: '600',
    marginTop: theme.space.xs,
  },
  coachRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.sm,
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.gold,
    borderWidth: 1,
    borderRadius: theme.radius.md,
    padding: theme.space.md,
    marginBottom: theme.space.lg,
  },
  coachEmoji: { fontSize: 24 },
  coachTitle: { fontSize: theme.font.body, fontWeight: '800', color: theme.colors.text },
  coachMeta: { fontSize: theme.font.small, color: theme.colors.muted, marginTop: 2 },
  chevron: { fontSize: 22, color: theme.colors.muted },
  signOut: {
    backgroundColor: theme.colors.red,
    borderRadius: theme.radius.pill,
    paddingVertical: 15,
    alignItems: 'center',
  },
  pressed: { opacity: 0.7 },
  signOutText: { color: '#FFFFFF', fontSize: theme.font.body, fontWeight: '700' },
});
