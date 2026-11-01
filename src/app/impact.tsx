import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { theme } from '@/constants/theme';
import { supabase } from '../../lib/supabase';

/**
 * Day 43 — Impact dashboard (internal, coaches/admin only).
 *
 * The mission, in numbers a funder can see. Everything here is a SUMMARY of
 * events the app already logs — no new tracking, nothing collected from kids
 * that the privacy screen doesn't list. The server (`impact_summary()`,
 * is_staff-gated) computes it all; this screen just lays out the tiles.
 *
 * The headline number is ETHICS COMPLETIONS — kids finishing conflict-
 * resolution work. That's the impact story: words first, provably.
 */

type Impact = {
  kids: { total: number; minors: number; consented: number };
  active: { d7: number; d30: number };
  completions: { total: number; d30: number };
  ethics: { completions_total: number; completions_30d: number; kids_reached: number; reach_pct: number };
  minutes: { total: number; d30: number };
  retention: { returned_7d: number; eligible: number; pct: number };
  streaks: { active: number; avg: number; best: number };
  ranks_awarded: number;
  community: { approved_posts: number; reports_resolved: number };
};

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <View style={styles.tile}>
      <Text style={styles.tileValue}>{value}</Text>
      <Text style={styles.tileLabel}>{label}</Text>
      {sub ? <Text style={styles.tileSub}>{sub}</Text> : null}
    </View>
  );
}

export default function ImpactScreen() {
  const router = useRouter();
  const [data, setData] = useState<Impact | null>(null);
  const [status, setStatus] = useState('Loading…');

  useFocusEffect(
    useCallback(() => {
      supabase.rpc('impact_summary').then(({ data: d, error }) => {
        if (error) {
          setStatus(
            error.message.includes('staff')
              ? 'This dashboard is for coaches and admins.'
              : `Error: ${error.message}`,
          );
          return;
        }
        setData(d as Impact);
        setStatus('');
      });
    }, []),
  );

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button">
        <Text style={styles.back}>‹ Account</Text>
      </Pressable>
      <Text style={styles.title}>Impact</Text>
      <Text style={styles.subtitle}>
        What the program is doing, from events the app already logs. Numbers are small until real
        kids train — the point is that they&apos;re real.
      </Text>

      {status !== '' && (
        <View style={styles.statusWrap}>
          {status === 'Loading…' ? (
            <ActivityIndicator color={theme.colors.gold} />
          ) : (
            <Text style={styles.statusText}>{status}</Text>
          )}
        </View>
      )}

      {data && (
        <>
          {/* The headline: words first, provably */}
          <View style={styles.headline}>
            <Text style={styles.headlineValue}>{data.ethics.completions_total}</Text>
            <Text style={styles.headlineLabel}>ETHICS COMPLETIONS</Text>
            <Text style={styles.headlineSub}>
              {data.ethics.kids_reached} kid{data.ethics.kids_reached === 1 ? '' : 's'} did
              conflict-resolution work · {data.ethics.reach_pct}% of everyone active ·{' '}
              {data.ethics.completions_30d} in the last 30 days
            </Text>
          </View>

          <Text style={styles.section}>Engagement</Text>
          <View style={styles.row}>
            <Tile label="Active · 7d" value={String(data.active.d7)} />
            <Tile label="Active · 30d" value={String(data.active.d30)} />
            <Tile label="Signed up" value={String(data.kids.total)} sub={`${data.kids.minors} minors`} />
          </View>

          <Text style={styles.section}>Training</Text>
          <View style={styles.row}>
            <Tile label="Completions" value={String(data.completions.total)} sub={`${data.completions.d30} in 30d`} />
            <Tile label="Active minutes" value={String(data.minutes.total)} sub={`${data.minutes.d30} in 30d`} />
            <Tile label="Belts earned" value={String(data.ranks_awarded)} />
          </View>

          <Text style={styles.section}>Sticking with it</Text>
          <View style={styles.row}>
            <Tile
              label="7-day return"
              value={`${data.retention.pct}%`}
              sub={`${data.retention.returned_7d}/${data.retention.eligible} eligible`}
            />
            <Tile label="Live streaks" value={String(data.streaks.active)} sub={`best ${data.streaks.best}`} />
            <Tile label="Avg streak" value={String(data.streaks.avg)} />
          </View>

          <Text style={styles.section}>Community</Text>
          <View style={styles.row}>
            <Tile label="Posts live" value={String(data.community.approved_posts)} />
            <Tile label="Reports resolved" value={String(data.community.reports_resolved)} />
            <Tile label="Consents granted" value={String(data.kids.consented)} />
          </View>

          <Text style={styles.footnote}>
            Definitions live in impact_summary() — one server function, so a grant report and this
            screen can never disagree.
          </Text>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.bg },
  content: { paddingTop: 64, paddingHorizontal: theme.space.md, paddingBottom: theme.space.xl, gap: theme.space.sm },
  back: { fontSize: theme.font.body, color: theme.colors.muted },
  title: { fontSize: theme.font.title, fontWeight: '800', color: theme.colors.text },
  subtitle: { fontSize: theme.font.small, color: theme.colors.muted, lineHeight: 19 },
  statusWrap: { paddingVertical: theme.space.lg, alignItems: 'center' },
  statusText: { fontSize: theme.font.body, color: theme.colors.muted, textAlign: 'center' },

  headline: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.gold,
    borderWidth: 2,
    borderRadius: theme.radius.md,
    padding: theme.space.lg,
    alignItems: 'center',
    gap: 4,
    marginTop: theme.space.xs,
  },
  headlineValue: { fontSize: 56, fontWeight: '800', color: theme.colors.gold },
  headlineLabel: { fontSize: theme.font.small, fontWeight: '800', color: theme.colors.text, letterSpacing: 2 },
  headlineSub: { fontSize: theme.font.small, color: theme.colors.muted, textAlign: 'center', lineHeight: 18 },

  section: {
    fontSize: theme.font.small,
    fontWeight: '800',
    color: theme.colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: theme.space.sm,
  },
  row: { flexDirection: 'row', gap: theme.space.xs },
  tile: {
    flex: 1,
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.line,
    borderWidth: 1,
    borderRadius: theme.radius.md,
    paddingVertical: theme.space.md,
    paddingHorizontal: theme.space.xs,
    alignItems: 'center',
    gap: 2,
  },
  tileValue: { fontSize: theme.font.header, fontWeight: '800', color: theme.colors.text },
  tileLabel: { fontSize: 11, color: theme.colors.muted, textAlign: 'center' },
  tileSub: { fontSize: 10, color: theme.colors.muted, opacity: 0.8, textAlign: 'center' },

  footnote: { fontSize: theme.font.small, color: theme.colors.muted, textAlign: 'center', lineHeight: 18, marginTop: theme.space.md },
});
