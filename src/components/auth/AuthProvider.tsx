import { Session } from '@supabase/supabase-js';
import {
  ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import { supabase } from '../../../lib/supabase';

export type Profile = {
  id: string;
  display_name: string | null;
  dob: string | null;
  is_minor: boolean;
  consent_status: 'not_required' | 'pending' | 'granted' | 'revoked';
  goals: string[];
  words_first_optin: boolean;
  onboarding_complete: boolean;
  timezone: string;
};

type AuthContextValue = {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  profileError: string | null;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select(
      'id, display_name, dob, is_minor, consent_status, goals, words_first_optin, onboarding_complete, timezone',
    )
    .eq('id', userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as Profile) ?? null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileError, setProfileError] = useState<string | null>(null);

  const loadProfile = useCallback(async (userId: string) => {
    try {
      setProfileError(null);
      let p = await fetchProfile(userId);
      if (!p) {
        // A DB trigger creates the profile row on signup; for a brand-new
        // account it can lag by a moment. One retry covers that.
        await new Promise((resolve) => setTimeout(resolve, 1200));
        p = await fetchProfile(userId);
      }

      // Timezone sync: streaks/quests/anti-grind all reset at the KID'S local
      // midnight (profiles.timezone). Default is UTC, so learn the device's
      // real timezone on every sign-in and keep the profile current.
      if (p) {
        try {
          const deviceTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
          if (deviceTz && p.timezone !== deviceTz) {
            await supabase.from('profiles').update({ timezone: deviceTz }).eq('id', userId);
            p = { ...p, timezone: deviceTz };
          }
        } catch {
          // Intl unavailable on this device — keep the stored timezone.
        }
      }

      setProfile(p);
      if (!p) setProfileError('Could not load your profile.');
    } catch (e: unknown) {
      setProfile(null);
      setProfileError(e instanceof Error ? e.message : 'Could not load your profile.');
    }
  }, []);

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      setSession(data.session);
      if (data.session) await loadProfile(data.session.user.id);
      if (active) setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, s) => {
      setSession(s);
      if (s) await loadProfile(s.user.id);
      else setProfile(null);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [loadProfile]);

  const refreshProfile = useCallback(async () => {
    if (session) await loadProfile(session.user.id);
  }, [session, loadProfile]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  return (
    <AuthContext.Provider
      value={{ session, profile, loading, profileError, refreshProfile, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
