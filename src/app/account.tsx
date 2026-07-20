import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/components/auth/AuthProvider';
import { theme } from '@/constants/theme';

export default function AccountScreen() {
  const { session, signOut } = useAuth();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Account</Text>
      <Text style={styles.tagline}>Manage your profile and sign-in.</Text>

      <View style={styles.card}>
        <Text style={styles.label}>Signed in as</Text>
        <Text style={styles.email}>{session?.user.email ?? '—'}</Text>
      </View>

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
  signOut: {
    backgroundColor: theme.colors.red,
    borderRadius: theme.radius.pill,
    paddingVertical: 15,
    alignItems: 'center',
  },
  pressed: { opacity: 0.7 },
  signOutText: { color: '#FFFFFF', fontSize: theme.font.body, fontWeight: '700' },
});
