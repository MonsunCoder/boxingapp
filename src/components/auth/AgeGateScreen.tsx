import { theme } from '@/constants/theme';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { supabase } from '../../../lib/supabase';
import { useAuth } from './AuthProvider';

/**
 * COPPA age gate: exact date of birth (never displayed publicly),
 * branches under-13 vs 13+. Neutral, non-judgy copy per SPEC (A2).
 */
export default function AgeGateScreen() {
  const { session, refreshProfile } = useAuth();
  const [month, setMonth] = useState('');
  const [day, setDay] = useState('');
  const [year, setYear] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const submit = async () => {
    const m = parseInt(month, 10);
    const d = parseInt(day, 10);
    const y = parseInt(year, 10);
    const now = new Date();

    const validParts =
      Number.isInteger(m) && Number.isInteger(d) && Number.isInteger(y) &&
      y >= now.getFullYear() - 120 && y <= now.getFullYear();
    const date = validParts ? new Date(y, m - 1, d) : null;
    const realDate =
      date !== null &&
      date.getFullYear() === y &&
      date.getMonth() === m - 1 &&
      date.getDate() === d &&
      date <= now;

    if (!realDate) {
      setMessage('That date does not look right — double-check it.');
      return;
    }

    // Age as of today
    let age = now.getFullYear() - y;
    if (now.getMonth() + 1 < m || (now.getMonth() + 1 === m && now.getDate() < d)) age -= 1;
    const isMinor = age < 13;
    const iso = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

    setBusy(true);
    setMessage('');
    const { error } = await supabase
      .from('profiles')
      .update({ dob: iso, is_minor: isMinor })
      .eq('id', session!.user.id);
    setBusy(false);

    if (error) setMessage(error.message);
    else await refreshProfile(); // AuthGate branches: 13+ -> app, under-13 -> consent
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Text style={styles.title}>When were you born?</Text>
      <Text style={styles.subtitle}>
        We use this to keep the app safe for your age. It is never shown to anyone.
      </Text>

      <View style={styles.row}>
        <TextInput
          style={styles.input}
          placeholder="MM"
          placeholderTextColor={theme.colors.muted}
          keyboardType="number-pad"
          maxLength={2}
          value={month}
          onChangeText={setMonth}
          editable={!busy}
        />
        <TextInput
          style={styles.input}
          placeholder="DD"
          placeholderTextColor={theme.colors.muted}
          keyboardType="number-pad"
          maxLength={2}
          value={day}
          onChangeText={setDay}
          editable={!busy}
        />
        <TextInput
          style={[styles.input, styles.year]}
          placeholder="YYYY"
          placeholderTextColor={theme.colors.muted}
          keyboardType="number-pad"
          maxLength={4}
          value={year}
          onChangeText={setYear}
          editable={!busy}
        />
      </View>

      <Pressable
        style={[styles.button, busy && styles.buttonDisabled]}
        onPress={submit}
        disabled={busy}>
        <Text style={styles.buttonText}>{busy ? 'Saving…' : 'Continue'}</Text>
      </Pressable>

      {message !== '' && <Text style={styles.message}>{message}</Text>}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bg, justifyContent: 'center', padding: 28 },
  title: { fontSize: theme.font.title, fontWeight: '800', textAlign: 'center', color: theme.colors.text },
  subtitle: {
    fontSize: 15,
    color: theme.colors.muted,
    textAlign: 'center',
    marginTop: 10,
    marginBottom: 28,
  },
  row: { flexDirection: 'row', gap: 10, justifyContent: 'center', marginBottom: 20 },
  input: {
    borderWidth: 1,
    borderColor: theme.colors.line,
    borderRadius: theme.radius.sm,
    paddingVertical: 14,
    width: 68,
    textAlign: 'center',
    fontSize: 20,
    backgroundColor: theme.colors.surface,
    color: theme.colors.text,
  },
  year: { width: 96 },
  button: {
    backgroundColor: theme.colors.red,
    borderRadius: theme.radius.pill,
    paddingVertical: 15,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  message: { marginTop: 18, fontSize: 14, color: theme.colors.danger, textAlign: 'center' },
});
