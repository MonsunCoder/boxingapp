import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { useAuth } from '@/components/auth/AuthProvider';
import { theme } from '@/constants/theme';
import { RankStatus, rankLabel } from '@/constants/ranks';
import { supabase } from '../../lib/supabase';

/**
 * Day 37 — Account becomes a real profile: avatar (emoji picker, stored in
 * profiles.avatar_config), editable display name (via update_my_profile RPC —
 * the raw update policy guards against role changes), and the fighter's
 * numbers: rank, level, streak, XP.
 *
 * Display names show on the HOPE feed instead of "A fighter", so this is
 * also the community-identity screen. Emails are never shown to other kids.
 */

const AVATARS = ['🥊', '🦁', '🐺', '🦅', '🐉', '🐢', '⚡', '🔥', '🌊', '⭐', '🎯', '🛡️'];

type Stats = { level: number; xp: number; streak: number; rank: string };

export default function AccountScreen() {
  const router = useRouter();
  const { session, signOut } = useAuth();
  const [role, setRole] = useState<string>('user');
  const [name, setName] = useState('');
  const [savedName, setSavedName] = useState('');
  const [avatar, setAvatar] = useState('🥊');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [stats, setStats] = useState<Stats | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!session) return;
    const [{ data: prof }, { data: rank }, { data: level }, { data: streak }, { data: events }] =
      await Promise.all([
        supabase.from('profiles').select('role, display_name, avatar_config').eq('id', session.user.id).maybeSingle(),
        supabase.rpc('rank_status'),
        supabase.rpc('user_level', { p_user: session.user.id }),
        supabase.from('streaks').select('current').maybeSingle(),
        supabase.from('xp_events').select('xp'),
      ]);
    setRole(prof?.role ?? 'user');
    setName(prof?.display_name ?? '');
    setSavedName(prof?.display_name ?? '');
    setAvatar((prof?.avatar_config as { emoji?: string })?.emoji ?? '🥊');
    const r = rank as RankStatus | null;
    setStats({
      level: typeof level === 'number' ? level : 1,
      xp: (events ?? []).reduce((s, e) => s + (e.xp ?? 0), 0),
      streak: streak?.current ?? 0,
      rank: r ? rankLabel(r.current, r.tiers) : '—',
    });
  }, [session]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const saveProfile = async (nextAvatar?: string) => {
    setBusy(true);
    setMessage('');
    const { error } = await supabase.rpc('update_my_profile', {
      p_display_name: name.trim() || savedName || 'Fighter',
      p_avatar: { emoji: nextAvatar ?? avatar },
    });
    setBusy(false);
    if (error) setMessage(`⚠ ${error.message}`);
    else {
      setMessage('✓ Saved');
      setSavedName(name.trim());
    }
  };

  const isCoach = role === 'moderator' || role === 'admin';
  const nameDirty = name.trim() !== savedName && name.trim().length >= 2;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Account</Text>

      {/* Profile card */}
      <View style={styles.profileCard}>
        <Pressable style={styles.avatarWrap} onPress={() => setPickerOpen(true)}>
          <Text style={styles.avatar}>{avatar}</Text>
          <Text style={styles.avatarEdit}>edit</Text>
        </Pressable>
        <View style={{ flex: 1, gap: 6 }}>
          <TextInput
            style={styles.nameInput}
            value={name}
            onChangeText={setName}
            placeholder="Fight name (shown on the feed)"
            placeholderTextColor={theme.colors.muted}
            maxLength={24}
          />
          <Text style={styles.email}>{session?.user.email ?? '—'} · never shown to other kids</Text>
          {nameDirty && (
            <Pressable style={[styles.saveBtn, busy && styles.off]} disabled={busy} onPress={() => saveProfile()}>
              <Text style={styles.saveText}>{busy ? 'Saving…' : 'Save name'}</Text>
            </Pressable>
          )}
          {message !== '' && <Text style={styles.message}>{message}</Text>}
        </View>
      </View>

      {/* The fighter's numbers */}
      {stats && (
        <View style={styles.statsRow}>
          <View style={styles.stat}><Text style={styles.statValue}>{stats.rank}</Text><Text style={styles.statLabel}>Belt</Text></View>
          <View style={styles.stat}><Text style={styles.statValue}>LV {stats.level}</Text><Text style={styles.statLabel}>Level</Text></View>
          <View style={styles.stat}><Text style={styles.statValue}>{stats.streak}🔥</Text><Text style={styles.statLabel}>Streak</Text></View>
          <View style={styles.stat}><Text style={styles.statValue}>{stats.xp}</Text><Text style={styles.statLabel}>XP</Text></View>
        </View>
      )}

      {isCoach && (
        <Pressable onPress={() => router.push('/modqueue')} style={({ pressed }) => [styles.row, styles.coachRow, pressed && styles.off]}>
          <Text style={styles.rowEmoji}>🛡️</Text>
          <Text style={styles.rowTitle}>Coach&apos;s Queue</Text>
          <Text style={styles.chevron}>›</Text>
        </Pressable>
      )}
      <Pressable onPress={() => router.push('/settings')} style={({ pressed }) => [styles.row, pressed && styles.off]}>
        <Text style={styles.rowEmoji}>⚙️</Text>
        <Text style={styles.rowTitle}>Settings & Reminders</Text>
        <Text style={styles.chevron}>›</Text>
      </Pressable>
      <Pressable onPress={() => router.push('/privacy')} style={({ pressed }) => [styles.row, pressed && styles.off]}>
        <Text style={styles.rowEmoji}>🔐</Text>
        <Text style={styles.rowTitle}>Privacy & Your Data</Text>
        <Text style={styles.chevron}>›</Text>
      </Pressable>

      <Pressable onPress={signOut} style={({ pressed }) => [styles.signOut, pressed && styles.off]}>
        <Text style={styles.signOutText}>Sign out</Text>
      </Pressable>

      {/* Avatar picker */}
      <Modal visible={pickerOpen} transparent animationType="fade">
        <View style={styles.pickerWrap}>
          <View style={styles.pickerCard}>
            <Text style={styles.pickerTitle}>Pick your corner</Text>
            <View style={styles.avatarGrid}>
              {AVATARS.map((a) => (
                <Pressable
                  key={a}
                  style={[styles.avatarChoice, a === avatar && styles.avatarChosen]}
                  onPress={() => {
                    setAvatar(a);
                    setPickerOpen(false);
                    saveProfile(a);
                  }}>
                  <Text style={styles.avatarChoiceText}>{a}</Text>
                </Pressable>
              ))}
            </View>
            <Pressable onPress={() => setPickerOpen(false)} hitSlop={8}>
              <Text style={styles.pickerClose}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bg, paddingTop: 72, paddingHorizontal: theme.space.md, gap: theme.space.sm },
  title: { fontSize: theme.font.title, fontWeight: '800', color: theme.colors.text },
  profileCard: {
    flexDirection: 'row',
    gap: theme.space.md,
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.gold,
    borderWidth: 1,
    borderRadius: theme.radius.md,
    padding: theme.space.md,
    alignItems: 'center',
  },
  avatarWrap: { alignItems: 'center', gap: 2 },
  avatar: { fontSize: 44 },
  avatarEdit: { fontSize: theme.font.small, color: theme.colors.muted, textDecorationLine: 'underline' },
  nameInput: {
    backgroundColor: theme.colors.bg,
    borderColor: theme.colors.line,
    borderWidth: 1,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.space.md,
    paddingVertical: 8,
    fontSize: theme.font.body,
    color: theme.colors.text,
    fontWeight: '700',
  },
  email: { fontSize: theme.font.small, color: theme.colors.muted },
  saveBtn: { backgroundColor: theme.colors.red, borderRadius: theme.radius.pill, paddingVertical: 8, alignItems: 'center' },
  saveText: { color: '#fff', fontSize: theme.font.small, fontWeight: '800' },
  message: { fontSize: theme.font.small, color: theme.colors.green, fontWeight: '700' },

  statsRow: { flexDirection: 'row', gap: theme.space.xs },
  stat: {
    flex: 1,
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.line,
    borderWidth: 1,
    borderRadius: theme.radius.md,
    paddingVertical: theme.space.sm,
    alignItems: 'center',
    gap: 2,
  },
  statValue: { fontSize: theme.font.small, fontWeight: '800', color: theme.colors.gold, textAlign: 'center' },
  statLabel: { fontSize: 11, color: theme.colors.muted, textTransform: 'uppercase', letterSpacing: 1 },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.sm,
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.line,
    borderWidth: 1,
    borderRadius: theme.radius.md,
    padding: theme.space.md,
  },
  coachRow: { borderColor: theme.colors.gold },
  rowEmoji: { fontSize: 20 },
  rowTitle: { flex: 1, fontSize: theme.font.body, fontWeight: '700', color: theme.colors.text },
  chevron: { fontSize: 20, color: theme.colors.muted },

  signOut: {
    backgroundColor: theme.colors.red,
    borderRadius: theme.radius.pill,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: theme.space.sm,
  },
  signOutText: { color: '#FFFFFF', fontSize: theme.font.body, fontWeight: '700' },
  off: { opacity: 0.6 },

  pickerWrap: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', alignItems: 'center', justifyContent: 'center', padding: theme.space.lg },
  pickerCard: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.gold,
    borderWidth: 1,
    borderRadius: theme.radius.lg,
    padding: theme.space.lg,
    gap: theme.space.md,
    alignSelf: 'stretch',
    alignItems: 'center',
  },
  pickerTitle: { fontSize: theme.font.header, fontWeight: '800', color: theme.colors.text },
  avatarGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.sm, justifyContent: 'center' },
  avatarChoice: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: theme.colors.bg,
    borderWidth: 2,
    borderColor: theme.colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarChosen: { borderColor: theme.colors.gold },
  avatarChoiceText: { fontSize: 28 },
  pickerClose: { fontSize: theme.font.body, color: theme.colors.muted, textDecorationLine: 'underline' },
});
