import { theme } from '@/constants/theme';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
} from 'react-native';
import { supabase } from '../../../lib/supabase';
import { useAuth } from './AuthProvider';

/**
 * Under-13 parental consent (A3): collect a parent's email and lock the
 * account in a pending state until it is granted.
 *
 * DEV NOTE: the actual email to the parent + the confirm web link ship later
 * via a Supabase Edge Function. Today the request row is real, the lock is
 * real, and approval is simulated by flipping the rows in the dashboard.
 * The token below is a placeholder; the real one gets minted server-side.
 */
export default function ConsentScreen() {
  const { refreshProfile, signOut } = useAuth();
  const [parentEmail, setParentEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const submit = async () => {
    const target = parentEmail.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(target)) {
      setMessage('Hmm, that does not look like an email address.');
      return;
    }
    setBusy(true);
    setMessage('');

    // Security Change 2: the server makes the token and saves the request.
    const { data, error } = await supabase.rpc('request_parental_consent', { p_parent_email: target });
    setBusy(false);

    const result = data as { ok: boolean; reason?: string } | null;
    if (error) setMessage(error.message);
    else if (result?.reason === 'bad_email') setMessage('Hmm, that does not look like an email address.');
    else if (result?.reason === 'too_many') setMessage('That is enough requests for today. Try again tomorrow.');
    else if (result?.ok === false) setMessage('That did not go through. Try again in a bit.');
    else await refreshProfile(); // AuthGate -> WaitingScreen
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior="padding">
      <Text style={styles.emoji}>🤝</Text>
      <Text style={styles.title}>Ask a parent</Text>
      <Text style={styles.subtitle}>
        Because of your age, a parent or guardian needs to say it is OK before you can start
        training. Enter their email and we will ask them.
      </Text>

      <TextInput
        style={styles.input}
        placeholder="parent@email.com"
        placeholderTextColor={theme.colors.muted}
        autoCapitalize="none"
        keyboardType="email-address"
        value={parentEmail}
        onChangeText={setParentEmail}
        editable={!busy}
      />

      <Pressable
        style={[styles.button, busy && styles.buttonDisabled]}
        onPress={submit}
        disabled={busy}>
        <Text style={styles.buttonText}>{busy ? 'Sending…' : 'Send the request'}</Text>
      </Pressable>

      <Pressable onPress={signOut} hitSlop={8}>
        <Text style={styles.link}>Sign out</Text>
      </Pressable>

      {message !== '' && <Text style={styles.message}>{message}</Text>}
    </KeyboardAvoidingView>
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
  input: {
    borderWidth: 1,
    borderColor: theme.colors.line,
    borderRadius: theme.radius.sm,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 17,
    backgroundColor: theme.colors.surface,
    color: theme.colors.text,
  },
  button: {
    backgroundColor: theme.colors.red,
    borderRadius: theme.radius.pill,
    paddingVertical: 15,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  link: { fontSize: 15, color: theme.colors.muted, textAlign: 'center', textDecorationLine: 'underline' },
  message: { fontSize: 14, color: theme.colors.danger, textAlign: 'center' },
});
