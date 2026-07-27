import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/components/auth/AuthProvider';
import { RankStatus, rankLabel } from '@/constants/ranks';
import { theme } from '@/constants/theme';
import { supabase } from '../../lib/supabase';

/**
 * Day 19+20+21 — Progress dashboard: XP + level bar, rank card, streak w/ freeze
 * bank, 3 daily quests (auto-completed server-side by refresh_daily), recent
 * activity, level-up celebration. refresh_daily runs FIRST on load so freshly
 * awarded quest XP is included in the totals shown.
 *
 * Day 21: the Rank card is real. It reads rank_status() and taps through to the
 * ladder (decision D7 — the hub stays calm, the checklist lives one tap deep).
 */

type CurveRow = { level: number; cumulative_xp: number };
type Quest = { key: string; label: string; xp: number; done: boolean };
type EventRow = {
  xp: number;
  event_type: string;
  occurred_on: string;
  content_items: { title: string } | null;
};

const LAST_SEEN_LEVEL_KEY = 'lastSeenLevel';

function cumulativeXpFor(level: number, curve: CurveRow[]): number {
  if (level <= 1) return 0;
  if (level <= 10) return curve.find((c) => c.level === level)?.cumulative_xp ?? 0;
  const l10 = curve.find((c) => c.level === 10)?.cumulative_xp ?? 2340;
  return l10 + (level - 10) * 350;
}

export default function ProgressScreen() {
  const { session } = useAuth();
  const router = useRouter();
  const [totalXp, setTotalXp] = useState(0);
  const [level, setLevel] = useState(1);
  const [barPct, setBarPct] = useState(0);
  const [xpIntoLevel, setXpIntoLevel] = useState(0);
  const [xpForLevel, setXpForLevel] = useState(100);
  const [daily, setDaily] = useState<{ streak: number; longest: number; freezes: number; quests: Quest[] } | null>(null);
  const [rank, setRank] = useState<RankStatus | null>(null);
  const [recent, setRecent] = useState<EventRow[]>([]);
  const [status, setStatus] = useState('Loading…');
  const [celebrate, setCelebrate] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!session) return;
    try {
      // 1 · run the daily engine first (freeze grant/apply, quests, quest XP)
      const { data: dailyData, error: dailyError } = await supabase.rpc('refresh_daily');
      if (dailyError) throw new Error(dailyError.message);
      setDaily(dailyData as typeof daily);

      // 2 · then read totals (includes any XP the engine just awarded)
      const [{ data: events }, { data: lvl }, { data: curve }, { data: recentRows }, { data: rankData }] =
        await Promise.all([
          supabase.from('xp_events').select('xp'),
          supabase.rpc('user_level', { p_user: session.user.id }),
          supabase.from('level_curve').select('level, cumulative_xp').order('level'),
          supabase
            .from('xp_events')
            .select('xp, event_type, occurred_on, content_items(title)')
            .order('occurred_at', { ascending: false })
            .limit(5),
          supabase.rpc('rank_status'),
        ]);

      const xp = (events ?? []).reduce((sum, e) => sum + (e.xp ?? 0), 0);
      const lv = typeof lvl === 'number' ? lvl : 1;
      const start = cumulativeXpFor(lv, (curve ?? []) as CurveRow[]);
      const next = cumulativeXpFor(lv + 1, (curve ?? []) as CurveRow[]);
      const into = xp - start;
      const span = Math.max(1, next - start);

      setTotalXp(xp);
      setLevel(lv);
      setXpIntoLevel(into);
      setXpForLevel(span);
      setBarPct(Math.min(100, Math.round((into / span) * 100)));
      setRecent((recentRows ?? []) as unknown as EventRow[]);
      setRank((rankData as RankStatus) ?? null);
      setStatus('');

      const seenRaw = await AsyncStorage.getItem(LAST_SEEN_LEVEL_KEY);
      const seen = seenRaw ? parseInt(seenRaw, 10) : null;
      if (seen !== null && lv > seen) setCelebrate(lv);
      await AsyncStorage.setItem(LAST_SEEN_LEVEL_KEY, String(lv));
    } catch (e: unknown) {
      setStatus(e instanceof Error ? `Error: ${e.message}` : 'Something went wrong.');
    }
  }, [session]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const questsDone = daily?.quests.filter((q) => q.done).length ?? 0;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.header}>Progress</Text>
      {status !== '' && <Text style={styles.status}>{status}</Text>}

      {/* Top row: Level + Rank */}
      <View style={styles.topRow}>
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Level</Text>
          <Text style={styles.levelNum}>{level}</Text>
          <View style={styles.barTrack}>
            <View style={[styles.barFill, { width: `${barPct}%` }]} />
          </View>
          <Text style={styles.cardMetaCenter}>
            {xpIntoLevel} / {xpForLevel} XP to LV {level + 1}
          </Text>
        </View>

        {/* Rank — taps through to the ladder (D7) */}
        <Pressable
          style={({ pressed }) => [styles.card, rank?.can_rank_up && styles.cardReady, pressed && styles.cardPressed]}
          onPress={() => router.push('/ladder')}>
          <Text style={styles.cardLabel}>Rank</Text>
          <Text style={styles.rankEmoji}>🥋</Text>
          <Text style={styles.cardBody}>{rank ? rankLabel(rank.current, rank.tiers) : '—'}</Text>
          {rank?.can_rank_up ? (
            <Text style={styles.readyLine}>Ready to rank up!</Text>
          ) : (
            <Text style={styles.cardMetaCenter}>
              {rank?.next
                ? `${rank.done_count}/${rank.total_count} for ${rankLabel(rank.next, rank.tiers)}`
                : 'Top of the ladder'}
            </Text>
          )}
          <Text style={styles.ladderLink}>See Ladder ›</Text>
        </Pressable>
      </View>

      {/* Streak + freeze bank */}
      <View style={styles.wideCard}>
        <View style={styles.streakRow}>
          <Text style={styles.streakFlame}>🔥</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardBody}>
              {daily?.streak ?? 0}-day streak
              {daily && daily.longest > daily.streak ? `  ·  best ${daily.longest}` : ''}
            </Text>
            <Text style={styles.cardMeta}>❄ {daily?.freezes ?? 0} freeze{(daily?.freezes ?? 0) === 1 ? '' : 's'} banked — one auto-protects a missed day</Text>
          </View>
          <Text style={styles.totalXp}>{totalXp} XP</Text>
        </View>
      </View>

      {/* Daily quests */}
      <View style={styles.wideCard}>
        <View style={styles.questHeader}>
          <Text style={styles.cardBody}>Daily Quests</Text>
          <Text style={styles.cardMeta}>{questsDone}/3 done</Text>
        </View>
        {(daily?.quests ?? []).map((q) => (
          <View key={q.key} style={styles.questRow}>
            <Text style={styles.questTick}>{q.done ? '✅' : '⬜'}</Text>
            <Text style={[styles.questLabel, q.done && styles.questDone]} numberOfLines={1}>
              {q.label}
            </Text>
            <Text style={styles.gold}>+{q.xp}</Text>
          </View>
        ))}
        {questsDone >= 3 && (
          <Text style={styles.bonusLine}>All 3 done — +20 XP bonus! 🎉</Text>
        )}
      </View>

      {/* Recent activity */}
      <Text style={styles.sectionTitle}>Recent activity</Text>
      {recent.length === 0 && <Text style={styles.cardMeta}>Complete something — it shows up here.</Text>}
      {recent.map((e, i) => (
        <View key={i} style={styles.eventRow}>
          <Text style={styles.cardBody} numberOfLines={1}>
            {e.content_items?.title ?? e.event_type.replace('_', ' ')}
          </Text>
          <Text style={styles.eventMeta}>
            {e.occurred_on} · <Text style={styles.gold}>+{e.xp} XP</Text>
          </Text>
        </View>
      ))}

      {/* Level-up celebration */}
      <Modal visible={celebrate !== null} transparent animationType="fade">
        <View style={styles.celebrateWrap}>
          <View style={styles.celebrateCard}>
            <Text style={styles.celebrateEmoji}>🎉</Text>
            <Text style={styles.celebrateTitle}>LEVEL UP!</Text>
            <Text style={styles.celebrateLevel}>LV {celebrate}</Text>
            <Text style={styles.cardMeta}>Keep showing up. It counts.</Text>
            <Pressable style={styles.celebrateBtn} onPress={() => setCelebrate(null)}>
              <Text style={styles.celebrateBtnText}>Let’s go</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.bg },
  content: { paddingTop: 72, paddingHorizontal: theme.space.md, paddingBottom: theme.space.xl, gap: theme.space.sm },
  header: { fontSize: theme.font.title, fontWeight: '800', color: theme.colors.text, marginBottom: theme.space.sm },
  status: { fontSize: theme.font.body, color: theme.colors.muted },
  topRow: { flexDirection: 'row', gap: theme.space.sm },
  card: {
    flex: 1,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.line,
    padding: theme.space.md,
    gap: 6,
    alignItems: 'center',
  },
  cardReady: { borderColor: theme.colors.gold },
  cardPressed: { opacity: 0.7 },
  wideCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.line,
    padding: theme.space.md,
    marginTop: theme.space.sm,
    gap: theme.space.sm,
  },
  cardLabel: { fontSize: theme.font.small, color: theme.colors.muted, textTransform: 'uppercase', letterSpacing: 1 },
  levelNum: { fontSize: 44, fontWeight: '800', color: theme.colors.gold },
  rankEmoji: { fontSize: 36 },
  cardBody: { fontSize: theme.font.body, color: theme.colors.text, fontWeight: '600' },
  cardMeta: { fontSize: theme.font.small, color: theme.colors.muted },
  cardMetaCenter: { fontSize: theme.font.small, color: theme.colors.muted, textAlign: 'center' },
  readyLine: { fontSize: theme.font.small, color: theme.colors.gold, fontWeight: '700', textAlign: 'center' },
  ladderLink: { fontSize: theme.font.small, color: theme.colors.red, fontWeight: '700' },
  barTrack: {
    alignSelf: 'stretch',
    height: 10,
    borderRadius: 5,
    backgroundColor: theme.colors.line,
    overflow: 'hidden',
  },
  barFill: { height: '100%', backgroundColor: theme.colors.gold, borderRadius: 5 },
  streakRow: { flexDirection: 'row', alignItems: 'center', gap: theme.space.sm },
  streakFlame: { fontSize: 30 },
  totalXp: { fontSize: theme.font.header, fontWeight: '800', color: theme.colors.gold },
  questHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  questRow: { flexDirection: 'row', alignItems: 'center', gap: theme.space.sm },
  questTick: { fontSize: 18 },
  questLabel: { flex: 1, fontSize: theme.font.body, color: theme.colors.text },
  questDone: { color: theme.colors.muted, textDecorationLine: 'line-through' },
  bonusLine: { fontSize: theme.font.body, color: theme.colors.gold, fontWeight: '700', textAlign: 'center' },
  sectionTitle: {
    fontSize: theme.font.header,
    fontWeight: '700',
    color: theme.colors.text,
    marginTop: theme.space.md,
  },
  eventRow: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    borderColor: theme.colors.line,
    paddingVertical: 10,
    paddingHorizontal: theme.space.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: theme.space.sm,
  },
  eventMeta: { fontSize: theme.font.small, color: theme.colors.muted },
  gold: { color: theme.colors.gold, fontWeight: '700' },
  celebrateWrap: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.space.lg,
  },
  celebrateCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 2,
    borderColor: theme.colors.gold,
    padding: theme.space.xl,
    alignItems: 'center',
    gap: theme.space.sm,
    alignSelf: 'stretch',
  },
  celebrateEmoji: { fontSize: 56 },
  celebrateTitle: { fontSize: theme.font.header, fontWeight: '800', color: theme.colors.text, letterSpacing: 4 },
  celebrateLevel: { fontSize: 52, fontWeight: '800', color: theme.colors.gold },
  celebrateBtn: {
    backgroundColor: theme.colors.red,
    borderRadius: theme.radius.pill,
    paddingVertical: 12,
    paddingHorizontal: 44,
    marginTop: theme.space.sm,
  },
  celebrateBtnText: { color: '#fff', fontSize: theme.font.body, fontWeight: '800' },
});
