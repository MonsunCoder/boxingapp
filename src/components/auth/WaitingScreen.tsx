import { theme } from '@/constants/theme';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { supabase } from '../../../lib/supabase';
import { useAuth } from './AuthProvider';

/**
 * Restricted state for under-13s: account exists but stays locked until the
 * parent approves. "Check again" re-reads the profile; approval currently
 * happens in the Supabase dashboard (real consent email = later Edge Function
 * on the brand domain). A dev-build-only banner says so on screen, so testers
 * don't wait on an email that is not wired yet — it never ships to kids
 * (__DEV__ is false in release builds).
 */
export default function WaitingScreen() {
  const { session, profile, refreshProfile, signOut } = useAuth();
  const [parentEmail, setParentEmail] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!session) return;
    supabase
      .from('parental_consents')
      .select('parent_email')
      .eq('child_id', session.user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setParentEmail(data.parent_email);
      });
  }, [session]);

  const checkAgain = async () => {
    setBusy(true);
    await refreshProfile();
    setBusy(false);
  };

  const changeEmail = async () => {
    // Send the flow back to the consent screen to enter a different address.
    setBusy(true);
    await supabase
      .from('profiles')
      .update({ consent_status: 'not_required' })
      .eq('id', session!.user.id);
    await refreshProfile();
    setBusy(false);
  };

  const revoked = profile?.consent_status === 'revoked';

  return (
    <View style={styles.container}>
      <Text style={styles.emoji}>{revoked ? '🛑' : '⏳'}</Text>
      <Text style={styles.title}>
        {revoked ? 'Your parent said not yet' : 'Waiting on your parent'}
      </Text>
      <Text style={styles.subtitle}>
        {revoked
          ? 'Talk it over with them — you can send a new request any time.'
          : parentEmail
            ? `We sent a request to ${parentEmail}. Ask them to check their inbox.`
            : 'We sent your parent a request. Ask them to check their inbox.'}
      </Text>

      <Pressable
        style={[styles.button, busy && styles.buttonDisabled]}
        onPress={checkAgain}
        disabled={busy}>
        <Text style={styles.buttonText}>{busy ? 'Checking…' : 'They said yes — check again'}</Text>
      </Pressable>

      <Pressable onPress={changeEmail} disabled={busy} hitSlop={8}>
        <Text style={styles.link}>Use a different parent email</Text>
      </Pressable>
      <Pressable onPress={signOut} disabled={busy} hitSlop={8}>
        <Text style={styles.link}>Sign out</Text>
      </Pressable>

      {__DEV__ && (
        <View style={styles.devNote}>
          <Text style={styles.devNoteText}>
            🛠 DEV BUILD: the consent email isn&apos;t wired yet (ships with the brand domain).
            Approve by flipping consent_status to &apos;granted&apos; in Supabase, then tap check
            again. This banner never appears in release builds.
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.bg,
    justifyContent: 'center',
    padding: 28,
    gap: 14,
  },
  emoji: { fontSize: 48, textAlign: 'center' },
  title: { fontSize: theme.font.title, fontWeight: '800', textAlign: 'center', color: theme.colors.text },
  subtitle: { fontSize: 15, color: theme.colors.muted, textAlign: 'center', lineHeight: 22 },
  button: {
    backgroundColor: theme.colors.red,
    borderRadius: theme.radius.pill,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 10,
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  link: { fontSize: 15, color: theme.colors.muted, textAlign: 'center', textDecorationLine: 'underline' },
  devNote: {
    marginTop: 18,
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.gold,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: theme.radius.md,
    padding: 12,
  },
  devNoteText: { fontSize: 12, color: theme.colors.gold, lineHeight: 17 },
});
