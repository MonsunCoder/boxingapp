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

/** Email + 6-digit code sign-in (no passwords — locked stack decision). */
export default function SignInScreen() {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const cleanEmail = email.trim().toLowerCase();

  const sendCode = async () => {
    if (!/^\S+@\S+\.\S+$/.test(cleanEmail)) {
      setMessage('Hmm, that does not look like an email address.');
      return;
    }
    setBusy(true);
    setMessage('');
    const { error } = await supabase.auth.signInWithOtp({
      email: cleanEmail,
      options: { shouldCreateUser: true },
    });
    setBusy(false);
    if (error) setMessage(error.message);
    else {
      setStep('code');
      setMessage('Code sent. Check your email — spam folder counts.');
    }
  };

  const verifyCode = async () => {
    if (code.trim().length < 6) {
      setMessage('Enter the 6-digit code from the email.');
      return;
    }
    setBusy(true);
    setMessage('');
    const { error } = await supabase.auth.verifyOtp({
      email: cleanEmail,
      token: code.trim(),
      type: 'email',
    });
    setBusy(false);
    if (error) setMessage(error.message);
    // On success onAuthStateChange fires and AuthGate moves the app forward.
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Text style={styles.logo}>🥊</Text>
      <Text style={styles.title}>BoxingApp</Text>
      <Text style={styles.subtitle}>Words first. Boxing after.</Text>

      {step === 'email' ? (
        <View style={styles.form}>
          <TextInput
            style={styles.input}
            placeholder="your@email.com"
            placeholderTextColor="#999"
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
            editable={!busy}
          />
          <Pressable
            style={[styles.button, busy && styles.buttonDisabled]}
            onPress={sendCode}
            disabled={busy}>
            <Text style={styles.buttonText}>{busy ? 'Sending…' : 'Send me a code'}</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.form}>
          <Text style={styles.hint}>We emailed a code to {cleanEmail}</Text>
          <TextInput
            style={[styles.input, styles.codeInput]}
            placeholder="123456"
            placeholderTextColor="#999"
            keyboardType="number-pad"
            maxLength={6}
            value={code}
            onChangeText={setCode}
            editable={!busy}
          />
          <Pressable
            style={[styles.button, busy && styles.buttonDisabled]}
            onPress={verifyCode}
            disabled={busy}>
            <Text style={styles.buttonText}>{busy ? 'Checking…' : 'Enter the ring'}</Text>
          </Pressable>
          <Pressable onPress={sendCode} disabled={busy} hitSlop={8}>
            <Text style={styles.link}>Send a new code</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              setStep('email');
              setCode('');
              setMessage('');
            }}
            hitSlop={8}>
            <Text style={styles.link}>Use a different email</Text>
          </Pressable>
        </View>
      )}

      {message !== '' && <Text style={styles.message}>{message}</Text>}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 28 },
  logo: { fontSize: 56, textAlign: 'center' },
  title: { fontSize: 32, fontWeight: '800', textAlign: 'center', marginTop: 8 },
  subtitle: { fontSize: 15, color: '#777', textAlign: 'center', marginBottom: 32 },
  form: { gap: 14 },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 17,
    backgroundColor: '#fff',
    color: '#111',
  },
  codeInput: { textAlign: 'center', fontSize: 24, letterSpacing: 8 },
  button: {
    backgroundColor: '#1a1a1a',
    borderRadius: 28,
    paddingVertical: 15,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  hint: { fontSize: 14, color: '#666', textAlign: 'center' },
  link: { fontSize: 15, color: '#666', textAlign: 'center', textDecorationLine: 'underline' },
  message: { marginTop: 18, fontSize: 14, color: '#b3261e', textAlign: 'center' },
});
