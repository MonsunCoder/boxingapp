import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/components/auth/AuthProvider';
import { theme } from '@/constants/theme';
import { supabase } from '../../lib/supabase';

/**
 * Day 18 — Learn tab: the completion pipeline goes generic.
 * Every content type flows through the SAME complete_activity RPC that the
 * Train tab uses — one event stream powers everything (SPEC non-negotiable #5).
 * Real lesson pages / video / scenario player come in the Learn build phase;
 * today "Mark complete" proves the pipe end to end.
 */

type ContentItem = {
  id: string;
  title: string;
  type: string;
  pillar: string;
  xp_value: number;
};

const TYPE_EMOJI: Record<string, string> = {
  video_lesson: '📖',
  article: '📰',
  workout: '🥊',
  drill: '🥊',
  ethics_scenario: '🕊️',
  short_film: '🎬',
};

const isTrainType = (t: string) => t === 'workout' || t === 'drill';

export default function LearnScreen() {
  const { session } = useAuth();
  const [items, setItems] = useState<ContentItem[]>([]);
  const [status, setStatus] = useState('Loading…');
  const [stats, setStats] = useState<{ xp: number; level: number } | null>(null);
  const [results, setResults] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadStats = useCallback(async () => {
    if (!session) return;
    const { data: events } = await supabase.from('xp_events').select('xp');
    const xp = (events ?? []).reduce((sum, e) => sum + (e.xp ?? 0), 0);
    const { data: level } = await supabase.rpc('user_level', { p_user: session.user.id });
    setStats({ xp, level: typeof level === 'number' ? level : 1 });
  }, [session]);

  useEffect(() => {
    supabase
      .from('content_items')
      .select('id, title, type, pillar, xp_value')
      .order('type')
      .then(({ data, error }) => {
        if (error) setStatus(`Error: ${error.message}`);
        else if (!data || data.length === 0) setStatus('No content yet.');
        else {
          setItems(data);
          setStatus('');
        }
      });
    loadStats();
  }, [loadStats]);

  const markComplete = async (item: ContentItem) => {
    setBusyId(item.id);
    const { data, error } = await supabase.rpc('complete_activity', {
      p_content_id: item.id,
      p_event_type: 'completion',
      p_client_event_id: `learn-${item.id}-${Date.now()}`,
    });
    setBusyId(null);

    if (error) {
      setResults((r) => ({ ...r, [item.id]: `⚠ ${error.message}` }));
      return;
    }
    const d = data as { awarded: number; first_time?: boolean; total_xp?: number; level?: number; reason?: string };
    if (d.awarded > 0) {
      setResults((r) => ({
        ...r,
        [item.id]: `✓ +${d.awarded} XP${d.first_time ? ' — first time!' : ''}`,
      }));
      if (typeof d.total_xp === 'number' && typeof d.level === 'number') {
        setStats({ xp: d.total_xp, level: d.level });
      }
    } else {
      setResults((r) => ({ ...r, [item.id]: '✓ Already counted today' }));
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.header}>Learn</Text>
        {stats && (
          <View style={styles.statChip}>
            <Text style={styles.statText}>LV {stats.level} · {stats.xp} XP</Text>
          </View>
        )}
      </View>

      {status !== '' && <Text style={styles.status}>{status}</Text>}

      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingBottom: theme.space.xl }}
        renderItem={({ item }) => {
          const result = results[item.id];
          return (
            <View style={styles.card}>
              <View style={styles.cardTop}>
                <Text style={styles.emoji}>{TYPE_EMOJI[item.type] ?? '📄'}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.title}>{item.title}</Text>
                  <Text style={styles.meta}>
                    {item.pillar} · {item.type.replace('_', ' ')} ·{' '}
                    <Text style={styles.gold}>+{item.xp_value} XP</Text>
                  </Text>
                </View>
              </View>

              {isTrainType(item.type) ? (
                <Text style={styles.trainHint}>Complete it in the Train tab 🥊</Text>
              ) : result ? (
                <Text style={result.startsWith('⚠') ? styles.resultError : styles.resultOk}>
                  {result}
                </Text>
              ) : (
                <Pressable
                  style={[styles.completeBtn, busyId === item.id && styles.btnBusy]}
                  disabled={busyId !== null}
                  onPress={() => markComplete(item)}>
                  <Text style={styles.completeText}>
                    {busyId === item.id ? 'Saving…' : 'Mark complete'}
                  </Text>
                </Pressable>
              )}
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.bg,
    paddingTop: 72,
    paddingHorizontal: theme.space.md,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: theme.space.md,
  },
  header: { fontSize: theme.font.title, fontWeight: '800', color: theme.colors.text },
  statChip: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.gold,
    borderWidth: 1,
    borderRadius: theme.radius.pill,
    paddingHorizontal: theme.space.md,
    paddingVertical: 6,
  },
  statText: { color: theme.colors.gold, fontSize: theme.font.small, fontWeight: '700' },
  status: { fontSize: theme.font.body, color: theme.colors.muted, marginBottom: theme.space.sm },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.line,
    padding: theme.space.md,
    marginBottom: theme.space.sm,
    gap: theme.space.sm,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: theme.space.sm },
  emoji: { fontSize: 26 },
  title: { fontSize: theme.font.body, fontWeight: '700', color: theme.colors.text },
  meta: { fontSize: theme.font.small, color: theme.colors.muted, marginTop: 2 },
  gold: { color: theme.colors.gold, fontWeight: '700' },
  trainHint: { fontSize: theme.font.small, color: theme.colors.muted },
  completeBtn: {
    backgroundColor: theme.colors.red,
    borderRadius: theme.radius.lg,
    paddingVertical: 10,
    alignItems: 'center',
  },
  btnBusy: { opacity: 0.5 },
  completeText: { color: '#fff', fontSize: theme.font.body, fontWeight: '700' },
  resultOk: { fontSize: theme.font.body, color: theme.colors.green, fontWeight: '700' },
  resultError: { fontSize: theme.font.small, color: theme.colors.danger },
});
