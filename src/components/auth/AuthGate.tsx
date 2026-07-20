import { theme } from '@/constants/theme';
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
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const { session, profile, loading, profileError, refreshProfile, signOut } = useAuth();

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={theme.colors.red} />
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
  center: {
    flex: 1,
    backgroundColor: theme.colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.space.lg,
    gap: theme.space.md,
  },
  error: { fontSize: theme.font.body, color: theme.colors.danger, textAlign: 'center' },
  button: {
    backgroundColor: theme.colors.red,
    borderRadius: theme.radius.lg,
    paddingHorizontal: theme.radius.pill,
    paddingVertical: 12,
  },
  buttonText: { color: '#fff', fontSize: theme.font.body, fontWeight: '600' },
  link: { fontSize: 15, color: theme.colors.muted, textDecorationLine: 'underline' },
});
