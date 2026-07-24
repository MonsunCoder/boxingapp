import { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import AgeGateScreen from './AgeGateScreen';
import { useAuth } from './AuthProvider';
import ConsentScreen from './ConsentScreen';
import OnboardingFlow from './OnboardingFlow';
import SignInScreen from './SignInScreen';
import WaitingScreen from './WaitingScreen';

/**
 * Decides what the user sees, in strict order (SPEC.md onboarding flow):
 *   signed out             -> SignInScreen
 *   no date of birth yet   -> AgeGateScreen
 *   under-13, no consent   -> ConsentScreen (ask a parent)
 *   under-13, pending      -> WaitingScreen (locked until parent approves)
 *   onboarding not done    -> OnboardingFlow (goals -> Deal -> film -> First Bell)
 *   otherwise              -> the app
 *
 * NOTE (2026-07-24): the OnboardingFlow gate was silently lost in a stale-file
 * overwrite during the Day 15 build and restored today. If onboarding ever
 * stops appearing for new accounts, check this file first.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const { session, profile, loading, profileError, refreshProfile, signOut } = useAuth();

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (!session) return <SignInScreen />;

  if (!profile) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{profileError ?? 'Something went wrong.'}</Text>
        <Pressable style={styles.button} onPress={refreshProfile}>
          <Text style={styles.buttonText}>Try again</Text>
        </Pressable>
        <Pressable onPress={signOut} hitSlop={12}>
          <Text style={styles.link}>Sign out</Text>
        </Pressable>
      </View>
    );
  }

  if (!profile.dob) return <AgeGateScreen />;
  if (profile.is_minor && profile.consent_status === 'not_required') return <ConsentScreen />;
  if (profile.is_minor && profile.consent_status !== 'granted') return <WaitingScreen />;
  if (!profile.onboarding_complete) return <OnboardingFlow />;

  return <>{children}</>;
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16 },
  error: { fontSize: 16, color: '#b3261e', textAlign: 'center' },
  button: {
    backgroundColor: '#1a1a1a',
    borderRadius: 24,
    paddingHorizontal: 28,
    paddingVertical: 12,
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  link: { fontSize: 15, color: '#666', textDecorationLine: 'underline' },
});
