import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  LadderEntry,
  RankRequirement,
  RankStatus,
  RankUpResult,
  START_RANK_LABEL,
  rankLabel,
  roman,
  tierLabel,
} from '@/constants/ranks';
import { theme } from '@/constants/theme';
import { supabase } from '../../lib/supabase';

/**
 * Day 21 — The Ladder.
 *
 * Screen-list decision D7: ranks are shown as a REQUIREMENTS CHECKLIST, never
 * as a points bar or rating. A kid should always be able to read the exact
 * short list of things standing between them and the next belt.
 *
 * All truth comes from rank_status(); promotion happens server-side in
 * try_rank_up(). The button here is just a doorbell — the DB decides.
 *
 * Day 22: the ethics gate is live. required_ethics_ids is populated, the
 * "Words first" group appears in the checklist, and a blocked rank-up shows a
 * friendly prompt that links straight to the missing LESSON. Requirement rows
 * for readable content tap through to their lesson page (/lesson/[id]);
 * workouts and drills point at the Train tab instead.
 */

const isTrainType = (t: string) => t === 'workout' || t === 'drill';

const TYPE_EMOJI: Record<string, string> = {
  video_lesson: '📖',
  article: '📰',
  workout: '🥊',
  drill: '🥊',
  ethics_scenario: '🕊️',
  short_film: '🎬',
};

/** Requirements arrive pre-sorted; group them without reordering. */
function groupRequirements(reqs: RankRequirement[]): { group: string; kind: string; items: RankRequirement[] }[] {
  const out: { group: string; kind: string; items: RankRequirement[] }[] = [];
  for (const r of reqs) {
    const last = out[out.length - 1];
    if (last && last.group === r.group) last.items.push(r);
    else out.push({ group: r.group, kind: r.kind, items: [r] });
  }
  return out;
}

export default function LadderScreen() {
  const router = useRouter();
  const [status, setStatus] = useState<RankStatus | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [celebrate, setCelebrate] = useState<{ tier: string; degree: number } | null>(null);
  // The words-first prompt: set when try_rank_up() blocks on an ethics lesson.
  const [ethicsPrompt, setEthicsPrompt] = useState<RankRequirement | null>(null);

  const load = useCallback(async () => {
    const { data, error: rpcError } = await supabase.rpc('rank_status');
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    setError('');
    setStatus(data as RankStatus);
    // Fresh focus, fresh slate — if the kid just finished the lesson and came
    // back, the old blocked prompt shouldn't linger over a now-clear checklist.
    setMessage('');
    setEthicsPrompt(null);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const rankUp = async () => {
    setBusy(true);
    setMessage('');
    setEthicsPrompt(null);
    const { data, error: rpcError } = await supabase.rpc('try_rank_up');
    setBusy(false);

    if (rpcError) {
      setMessage(`⚠ ${rpcError.message}`);
      return;
    }
    const result = data as RankUpResult;

    if (result.ok && result.tier && typeof result.degree === 'number') {
      setCelebrate({ tier: result.tier, degree: result.degree });
      await load();
      return;
    }
    if (result.reason === 'max_rank') {
      setMessage('You are at the top of the ladder — for now.');
      return;
    }
    const blockedEthics = result.blocked_on_ethics ?? [];
    if (blockedEthics.length > 0) {
      // The words-first gate, made visible: find the blocked LESSON in the
      // checklist we already have and link straight to it.
      const missing = (status?.requirements ?? []).find(
        (r) => r.kind === 'ethics' && blockedEthics.includes(r.content_id),
      );
      setEthicsPrompt(missing ?? null);
      setMessage('Words first. Complete this LESSON to advance:');
      return;
    }
    setMessage('Not yet — the checklist above still has open items.');
  };

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{error}</Text>
        <Pressable style={styles.retryBtn} onPress={load}>
          <Text style={styles.retryText}>Try again</Text>
        </Pressable>
      </View>
    );
  }

  if (!status) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={theme.colors.gold} />
      </View>
    );
  }

  const { tiers, ladder, requirements, current, next, done_count, total_count, can_rank_up } = status;
  const groups = groupRequirements(requirements);

  // Tiers with no seeded degrees yet — shown as the road ahead, honestly labelled.
  const seededTiers = new Set(ladder.map((l) => l.tier));
  const ahead = tiers.filter((t) => t.tier !== 'prospect' && !seededTiers.has(t.tier));

  const entryState = (entry: LadderEntry) => {
    if (entry.earned) return { glyph: '✅', style: styles.rowEarned };
    if (next && entry.sort_order === next.sort_order) return { glyph: '🎯', style: styles.rowNext };
    return { glyph: '🔒', style: styles.rowLocked };
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Pressable onPress={() => router.back()} hitSlop={12}>
        <Text style={styles.back}>‹ Progress</Text>
      </Pressable>
      <Text style={styles.header}>The Ladder</Text>

      {/* Where you stand */}
      <View style={styles.currentCard}>
        <Text style={styles.cardLabel}>You are</Text>
        <Text style={styles.currentBelt}>{rankLabel(current, tiers)}</Text>
        <Text style={styles.currentBlurb}>
          {current
            ? tiers.find((t) => t.tier === current.tier)?.blurb ?? ''
            : tiers.find((t) => t.tier === 'prospect')?.blurb ?? ''}
        </Text>
      </View>

      {/* What's left for the next belt — the checklist, never a bar */}
      {next ? (
        <View style={styles.nextCard}>
          <View style={styles.nextHeader}>
            <Text style={styles.nextLabel}>Next belt</Text>
            <Text style={styles.nextCount}>
              {done_count}/{total_count} done
            </Text>
          </View>
          <Text style={styles.nextBelt}>{rankLabel(next, tiers)}</Text>

          {groups.map((g) => (
            <View key={g.group} style={styles.group}>
              <Text style={[styles.groupTitle, g.kind === 'ethics' && styles.groupEthics]}>
                {g.kind === 'ethics' ? '🕊️ ' : ''}
                {g.group}
              </Text>
              {g.items.map((item) => {
                const train = isTrainType(item.type);
                return (
                  <Pressable
                    key={item.content_id}
                    style={({ pressed }) => [styles.reqRow, pressed && !train && styles.reqPressed]}
                    disabled={train}
                    onPress={() => router.push(`/lesson/${item.content_id}`)}>
                    <Text style={styles.reqTick}>{item.done ? '✅' : '⬜'}</Text>
                    <Text style={[styles.reqTitle, item.done && styles.reqDone]} numberOfLines={1}>
                      {TYPE_EMOJI[item.type] ?? '📄'} {item.title}
                    </Text>
                    <Text style={styles.reqGo}>{train ? 'Train tab' : '›'}</Text>
                  </Pressable>
                );
              })}
            </View>
          ))}

          {/* Always pressable (the server is the judge) — pressing while
              blocked is exactly how the words-first prompt appears. */}
          <Pressable
            style={[styles.rankBtn, (!can_rank_up || busy) && styles.rankBtnOff]}
            disabled={busy}
            onPress={rankUp}>
            <Text style={styles.rankBtnText}>
              {busy ? 'Checking…' : can_rank_up ? `Rank up to ${rankLabel(next, tiers)}` : 'Try to rank up'}
            </Text>
          </Pressable>
          {message !== '' && <Text style={styles.message}>{message}</Text>}

          {ethicsPrompt && (
            <Pressable
              style={({ pressed }) => [styles.ethicsPromptCard, pressed && styles.reqPressed]}
              onPress={() => router.push(`/lesson/${ethicsPrompt.content_id}`)}>
              <Text style={styles.ethicsPromptEmoji}>🕊️</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.ethicsPromptTitle}>{ethicsPrompt.title}</Text>
                <Text style={styles.ethicsPromptMeta}>Words come first here. Boxing comes after.</Text>
              </View>
              <Text style={styles.ethicsPromptGo}>Go ›</Text>
            </Pressable>
          )}
        </View>
      ) : (
        <View style={styles.nextCard}>
          <Text style={styles.nextBelt}>Top of the ladder</Text>
          <Text style={styles.cardMeta}>More belts arrive as content ships.</Text>
        </View>
      )}

      {/* The whole ladder */}
      <Text style={styles.sectionTitle}>Every belt</Text>

      <View style={[styles.ladderRow, styles.rowEarned]}>
        <Text style={styles.rowGlyph}>✅</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.rowTitle}>{START_RANK_LABEL}</Text>
          <Text style={styles.rowMeta}>Where everyone starts — you showed up.</Text>
        </View>
      </View>

      {ladder.map((entry) => {
        const state = entryState(entry);
        return (
          <View key={`${entry.tier}-${entry.degree}`} style={[styles.ladderRow, state.style]}>
            <Text style={styles.rowGlyph}>{state.glyph}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>{rankLabel(entry, tiers)}</Text>
              <Text style={styles.rowMeta}>
                {entry.req_count} requirement{entry.req_count === 1 ? '' : 's'}
                {entry.ethics_count > 0 ? '  ·  🕊️ words first' : ''}
                {entry.earned_at ? `  ·  earned ${entry.earned_at.slice(0, 10)}` : ''}
              </Text>
            </View>
          </View>
        );
      })}

      {/* The road ahead */}
      {ahead.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Further up</Text>
          {ahead.map((t) => (
            <View key={t.tier} style={[styles.ladderRow, styles.rowLocked]}>
              <Text style={styles.rowGlyph}>🔒</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>
                  {tierLabel(t.tier, tiers)}
                  {t.degrees_planned > 1 ? ` ${roman(1)}–${roman(t.degrees_planned)}` : ''}
                </Text>
                <Text style={styles.rowMeta}>{t.blurb}</Text>
              </View>
            </View>
          ))}
          <Text style={styles.footnote}>
            Belts above Novice open up as their lessons and workouts are built.
          </Text>
        </>
      )}

      {/* Rank-up celebration */}
      <Modal visible={celebrate !== null} transparent animationType="fade">
        <View style={styles.celebrateWrap}>
          <View style={styles.celebrateCard}>
            <Text style={styles.celebrateEmoji}>🥋</Text>
            <Text style={styles.celebrateTitle}>NEW BELT</Text>
            <Text style={styles.celebrateBelt}>{celebrate ? rankLabel(celebrate, tiers) : ''}</Text>
            <Text style={styles.cardMeta}>You earned it one round at a time.</Text>
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
  content: {
    paddingTop: 64,
    paddingHorizontal: theme.space.md,
    paddingBottom: theme.space.xl,
    gap: theme.space.sm,
  },
  center: {
    flex: 1,
    backgroundColor: theme.colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.space.md,
    padding: theme.space.lg,
  },
  back: { fontSize: theme.font.body, color: theme.colors.muted },
  header: { fontSize: theme.font.title, fontWeight: '800', color: theme.colors.text },
  errorText: { fontSize: theme.font.body, color: theme.colors.danger, textAlign: 'center' },
  retryBtn: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.line,
    borderWidth: 1,
    borderRadius: theme.radius.pill,
    paddingHorizontal: theme.space.lg,
    paddingVertical: 10,
  },
  retryText: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '600' },

  currentCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    borderWidth: 2,
    borderColor: theme.colors.gold,
    padding: theme.space.md,
    alignItems: 'center',
    gap: 4,
  },
  cardLabel: {
    fontSize: theme.font.small,
    color: theme.colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  currentBelt: { fontSize: 32, fontWeight: '800', color: theme.colors.gold },
  currentBlurb: { fontSize: theme.font.small, color: theme.colors.muted, textAlign: 'center' },

  nextCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.line,
    padding: theme.space.md,
    gap: theme.space.sm,
    marginTop: theme.space.sm,
  },
  nextHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  nextLabel: {
    fontSize: theme.font.small,
    color: theme.colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  nextCount: { fontSize: theme.font.small, color: theme.colors.muted },
  nextBelt: { fontSize: theme.font.header, fontWeight: '800', color: theme.colors.text },
  cardMeta: { fontSize: theme.font.small, color: theme.colors.muted },

  group: { gap: 6 },
  groupTitle: { fontSize: theme.font.small, color: theme.colors.muted, fontWeight: '700' },
  groupEthics: { color: theme.colors.green },
  reqRow: { flexDirection: 'row', alignItems: 'center', gap: theme.space.sm },
  reqPressed: { opacity: 0.7 },
  reqTick: { fontSize: 16 },
  reqTitle: { flex: 1, fontSize: theme.font.body, color: theme.colors.text },
  reqDone: { color: theme.colors.muted, textDecorationLine: 'line-through' },
  reqGo: { fontSize: theme.font.small, color: theme.colors.muted },

  ethicsPromptCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.sm,
    backgroundColor: theme.colors.bg,
    borderColor: theme.colors.green,
    borderWidth: 1,
    borderRadius: theme.radius.md,
    padding: theme.space.md,
  },
  ethicsPromptEmoji: { fontSize: 24 },
  ethicsPromptTitle: { fontSize: theme.font.body, fontWeight: '800', color: theme.colors.green },
  ethicsPromptMeta: { fontSize: theme.font.small, color: theme.colors.muted, marginTop: 2 },
  ethicsPromptGo: { fontSize: theme.font.body, color: theme.colors.green, fontWeight: '800' },

  rankBtn: {
    backgroundColor: theme.colors.red,
    borderRadius: theme.radius.lg,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: theme.space.xs,
  },
  rankBtnOff: { backgroundColor: theme.colors.line },
  rankBtnText: { color: '#fff', fontSize: theme.font.body, fontWeight: '800' },
  message: { fontSize: theme.font.small, color: theme.colors.gold, textAlign: 'center' },

  sectionTitle: {
    fontSize: theme.font.header,
    fontWeight: '700',
    color: theme.colors.text,
    marginTop: theme.space.md,
  },
  ladderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.sm,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    borderColor: theme.colors.line,
    paddingVertical: 10,
    paddingHorizontal: theme.space.md,
  },
  rowEarned: { borderColor: theme.colors.green },
  rowNext: { borderColor: theme.colors.gold },
  rowLocked: { opacity: 0.65 },
  rowGlyph: { fontSize: 18 },
  rowTitle: { fontSize: theme.font.body, fontWeight: '700', color: theme.colors.text },
  rowMeta: { fontSize: theme.font.small, color: theme.colors.muted, marginTop: 2 },
  footnote: {
    fontSize: theme.font.small,
    color: theme.colors.muted,
    textAlign: 'center',
    marginTop: theme.space.sm,
  },

  celebrateWrap: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
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
  celebrateTitle: {
    fontSize: theme.font.header,
    fontWeight: '800',
    color: theme.colors.text,
    letterSpacing: 4,
  },
  celebrateBelt: { fontSize: 40, fontWeight: '800', color: theme.colors.gold, textAlign: 'center' },
  celebrateBtn: {
    backgroundColor: theme.colors.red,
    borderRadius: theme.radius.pill,
    paddingVertical: 12,
    paddingHorizontal: 44,
    marginTop: theme.space.sm,
  },
  celebrateBtnText: { color: '#fff', fontSize: theme.font.body, fontWeight: '800' },
});
