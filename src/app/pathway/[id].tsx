import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Svg, { Line } from 'react-native-svg';

import { PathwayInfo, PathwayNode, TYPE_EMOJI, isTrainType } from '@/constants/pathways';
import { theme } from '@/constants/theme';
import { supabase } from '../../../lib/supabase';

/**
 * Day 24 — The Journey, built to Jigar's Pathway View wireframe (as revised):
 *
 *   ‹ Learn
 *          THE JOURNEY
 *   ┌─────────────────────────┐
 *   │ Current Pathway: <name> │
 *   │ Category: <category>    │
 *   └─────────────────────────┘
 *          ( spider-web )
 *   [██████░░░░░░░]  46%       <- progress bar, level-bar style, % at right
 *
 * (EXIT/NEXT paging from the sketch was dropped — the ‹ back arrow stays;
 *  no mastery banner.)
 *
 * Nodes are circles connected by threads. Rows are prerequisite DEPTH — a
 * node hangs one row below its deepest prerequisite — so branches spread
 * sideways and checkpoints pull the threads back together (the converging
 * bottom node in the sketch). Multiple gold (open) nodes at once IS the
 * choice; that's decision D1 drawn instead of listed.
 *
 * Tapping a node selects it and shows its card at the bottom; the card
 * carries the action (open lesson / go train) or the "Finish X first" line
 * for locked nodes. Availability remains server truth from pathway_map().
 *
 * Look is placeholder like everything else — the layout logic (layering,
 * threads, states) is the keeper; art comes in the polish phase.
 */

const NODE_R = 34; // circle radius
const ROW_H = 148; // vertical distance between depth rows
const TOP_PAD = 70;

type LaidOutNode = PathwayNode & { x: number; y: number; depth: number };

function layoutWeb(nodes: PathwayNode[], width: number): { laid: LaidOutNode[]; height: number } {
  const byId = new Map(nodes.map((n) => [n.node_id, n]));
  const depthMemo = new Map<string, number>();

  const depthOf = (n: PathwayNode, seen: Set<string> = new Set()): number => {
    const cached = depthMemo.get(n.node_id);
    if (cached !== undefined) return cached;
    if (seen.has(n.node_id)) return 0; // cycle guard (DB migration also forbids)
    seen.add(n.node_id);
    const d =
      n.prereq_node_ids.length === 0
        ? 0
        : 1 +
          Math.max(
            ...n.prereq_node_ids.map((pid) => {
              const pre = byId.get(pid);
              return pre ? depthOf(pre, seen) : 0;
            }),
          );
    depthMemo.set(n.node_id, d);
    return d;
  };

  const rows = new Map<number, PathwayNode[]>();
  for (const n of nodes) {
    const d = depthOf(n);
    if (!rows.has(d)) rows.set(d, []);
    rows.get(d)!.push(n);
  }

  const laid: LaidOutNode[] = [];
  const maxDepth = Math.max(...[...rows.keys()]);
  for (const [d, rowNodes] of rows) {
    rowNodes.sort((a, b) => a.position - b.position);
    rowNodes.forEach((n, i) => {
      laid.push({
        ...n,
        depth: d,
        x: (width * (i + 1)) / (rowNodes.length + 1),
        y: TOP_PAD + d * ROW_H,
      });
    });
  }
  return { laid, height: TOP_PAD + (maxDepth + 1) * ROW_H };
}

export default function PathwayScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [pathway, setPathway] = useState<PathwayInfo | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const { data, error: rpcError } = await supabase.rpc('pathway_map');
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    setError('');
    const list = (data as PathwayInfo[]) ?? [];
    setPathway(list.find((p) => p.id === id) ?? null);
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      setSelectedId(null);
      load();
    }, [load]),
  );

  const width = Dimensions.get('window').width - theme.space.md * 2;
  const web = useMemo(
    () => (pathway ? layoutWeb(pathway.nodes, width) : null),
    [pathway, width],
  );

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

  if (!pathway || !web) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={theme.colors.gold} />
      </View>
    );
  }

  const { laid, height } = web;
  const byId = new Map(laid.map((n) => [n.node_id, n]));
  const selected = selectedId ? (byId.get(selectedId) ?? null) : null;
  const finished = pathway.done_count === pathway.total_count;
  const pct = Math.round((pathway.done_count / Math.max(1, pathway.total_count)) * 100);

  const nodeState = (n: PathwayNode) => (n.done ? 'done' : n.available ? 'open' : 'locked');

  const actOn = (node: PathwayNode) => {
    if (isTrainType(node.type)) router.push(`/train?open=${node.content_id}`);
    else router.push(`/lesson/${node.content_id}?returnTo=/pathway/${pathway!.id}`);
  };

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Text style={styles.back}>‹ Learn</Text>
        </Pressable>

        <Text style={styles.journeyTitle}>THE JOURNEY</Text>

        {/* Current pathway + category box (wireframe) */}
        <View style={styles.infoBox}>
          <Text style={styles.infoLine}>
            <Text style={styles.infoLabel}>Current Pathway: </Text>
            {pathway.title}
          </Text>
          <Text style={styles.infoLine}>
            <Text style={styles.infoLabel}>Category: </Text>
            {pathway.category}
          </Text>
        </View>

        {/* Progress — level-bar style, percentage at the far right */}
        <View style={styles.progressRow}>
          <View style={styles.barTrack}>
            <View style={[styles.barFill, { width: `${pct}%` }]} />
          </View>
          <Text style={styles.pctText}>{pct}%</Text>
        </View>
        {!finished && (
          <Text style={styles.webHint}>Gold circles are open — pick one.</Text>
        )}

        {/* THE WEB */}
        <View style={{ width, height }}>
          <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
            {laid.flatMap((n) =>
              n.prereq_node_ids.map((pid) => {
                const pre = byId.get(pid);
                if (!pre) return null;
                return (
                  <Line
                    key={`${pid}->${n.node_id}`}
                    x1={pre.x}
                    y1={pre.y}
                    x2={n.x}
                    y2={n.y}
                    stroke={pre.done ? theme.colors.green : theme.colors.line}
                    strokeWidth={pre.done ? 2.5 : 1.5}
                  />
                );
              }),
            )}
          </Svg>

          {laid.map((n) => {
            const state = nodeState(n);
            const isSelected = n.node_id === selectedId;
            return (
              <Pressable
                key={n.node_id}
                style={[styles.nodeWrap, { left: n.x - NODE_R, top: n.y - NODE_R }]}
                onPress={() => setSelectedId(isSelected ? null : n.node_id)}>
                <View
                  style={[
                    styles.node,
                    state === 'done' && styles.nodeDone,
                    state === 'open' && styles.nodeOpen,
                    state === 'locked' && styles.nodeLocked,
                    isSelected && styles.nodeSelected,
                  ]}>
                  <Text style={styles.nodeEmoji}>
                    {state === 'locked' ? '🔒' : (TYPE_EMOJI[n.type] ?? '📄')}
                  </Text>
                  {state === 'done' && <Text style={styles.nodeBadge}>✅</Text>}
                </View>
                <Text
                  style={[styles.nodeLabel, state === 'locked' && styles.nodeLabelLocked]}
                  numberOfLines={2}>
                  {n.title}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {finished && (
          <Text style={styles.footnote}>
            🏁 Every thread walked. This pathway now counts wherever a belt asks for it.
          </Text>
        )}
      </ScrollView>

      {/* SELECTED NODE CARD */}
      {selected && (
        <View style={styles.detail}>
          <View style={{ flex: 1 }}>
            <Text style={styles.detailTitle}>
              {TYPE_EMOJI[selected.type] ?? '📄'} {selected.title}
            </Text>
            <Text style={styles.detailMeta}>
              {selected.type.replace('_', ' ')}
              {selected.duration_min ? ` · ${selected.duration_min} min` : ''} ·{' '}
              <Text style={styles.gold}>+{selected.xp_value} XP</Text>
            </Text>
            {nodeState(selected) === 'locked' && (
              <Text style={styles.detailLock}>
                Finish {selected.prereq_titles.join(' and ')} first
              </Text>
            )}
          </View>
          {nodeState(selected) === 'locked' ? (
            <Text style={styles.detailLockGlyph}>🔒</Text>
          ) : (
            <Pressable style={styles.goBtn} onPress={() => actOn(selected)}>
              <Text style={styles.goBtnText}>
                {selected.done ? 'Revisit' : isTrainType(selected.type) ? 'Train 🥊' : 'Open ›'}
              </Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.bg },
  content: {
    paddingTop: 64,
    paddingHorizontal: theme.space.md,
    paddingBottom: 120,
    gap: theme.space.xs,
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
  journeyTitle: {
    fontSize: theme.font.title,
    fontWeight: '800',
    color: theme.colors.text,
    textAlign: 'center',
    letterSpacing: 3,
    marginTop: theme.space.xs,
  },
  infoBox: {
    alignSelf: 'stretch',
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.line,
    borderWidth: 1,
    borderRadius: theme.radius.md,
    padding: theme.space.md,
    gap: 4,
    marginTop: theme.space.xs,
  },
  infoLine: { fontSize: theme.font.body, color: theme.colors.text, fontWeight: '700' },
  infoLabel: { color: theme.colors.muted, fontWeight: '600' },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.sm,
    marginTop: theme.space.sm,
  },
  barTrack: {
    flex: 1,
    height: 10,
    borderRadius: 5,
    backgroundColor: theme.colors.line,
    overflow: 'hidden',
  },
  barFill: { height: '100%', backgroundColor: theme.colors.gold, borderRadius: 5 },
  pctText: { fontSize: theme.font.small, color: theme.colors.gold, fontWeight: '800', minWidth: 40, textAlign: 'right' },
  webHint: { fontSize: theme.font.small, color: theme.colors.muted, marginBottom: theme.space.xs },
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

  nodeWrap: { position: 'absolute', width: NODE_R * 2, alignItems: 'center' },
  node: {
    width: NODE_R * 2,
    height: NODE_R * 2,
    borderRadius: NODE_R,
    backgroundColor: theme.colors.surface,
    borderWidth: 3,
    borderColor: theme.colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nodeDone: { borderColor: theme.colors.green },
  nodeOpen: { borderColor: theme.colors.gold, backgroundColor: '#211B0E' },
  nodeLocked: { opacity: 0.5 },
  nodeSelected: { borderWidth: 4, transform: [{ scale: 1.06 }] },
  nodeEmoji: { fontSize: 24 },
  nodeBadge: { position: 'absolute', top: -6, right: -6, fontSize: 16 },
  nodeLabel: {
    marginTop: 4,
    width: 96,
    textAlign: 'center',
    fontSize: 11,
    color: theme.colors.text,
    fontWeight: '600',
  },
  nodeLabelLocked: { color: theme.colors.muted },

  detail: {
    position: 'absolute',
    left: theme.space.md,
    right: theme.space.md,
    bottom: theme.space.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.sm,
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.gold,
    borderWidth: 1,
    borderRadius: theme.radius.md,
    padding: theme.space.md,
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 8,
  },
  detailTitle: { fontSize: theme.font.body, fontWeight: '800', color: theme.colors.text },
  detailMeta: { fontSize: theme.font.small, color: theme.colors.muted, marginTop: 2 },
  detailLock: { fontSize: theme.font.small, color: theme.colors.muted, marginTop: 4, fontStyle: 'italic' },
  detailLockGlyph: { fontSize: 22 },
  gold: { color: theme.colors.gold, fontWeight: '700' },
  goBtn: {
    backgroundColor: theme.colors.red,
    borderRadius: theme.radius.pill,
    paddingVertical: 10,
    paddingHorizontal: theme.space.lg,
  },
  goBtnText: { color: '#fff', fontSize: theme.font.body, fontWeight: '800' },
  footnote: {
    fontSize: theme.font.small,
    color: theme.colors.muted,
    textAlign: 'center',
    marginTop: theme.space.sm,
  },
});
