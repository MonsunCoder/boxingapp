import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/components/auth/AuthProvider';
import { theme } from '@/constants/theme';
import { supabase } from '../../lib/supabase';

/**
 * Day 22+23 — Learn tab: from inline buttons to real lesson pages.
 *
 * Day 18 proved the completion pipe with an inline "Mark complete" button.
 * Now tapping an item opens the Lesson Page (/lesson/[id]) where the actual
 * completing happens — behind the D9 scroll-to-the-end gate. Workouts and
 * drills still point at the Train tab; they never complete from Learn.
 *
 * The LV/XP chip reloads on focus so it reflects lessons finished on the
 * lesson page the moment you come back.
 */

type ContentItem = {
  id: string;
  title: string;
  type: string;
  pillar: string;
  xp_value: number;
  duration_min: number | null;
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
  const router = useRouter();
  const { session } = useAuth();
  const [items, setItems] = useState<ContentItem[]>([]);
  const [status, setStatus] = useState('Loading…');
  const [stats, setStats] = useState<{ xp: number; level: number } | null>(null);

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
      .select('id, title, type, pillar, xp_value, duration_min')
      .order('type')
      .then(({ data, error }) => {
        if (error) setStatus(`Error: ${error.message}`);
        else if (!data || data.length === 0) setStatus('No content yet.');
        else {
          setItems(data);
          setStatus('');
        }
      });
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadStats();
    }, [loadStats]),
  );

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
          const train = isTrainType(item.type);
          return (
            <Pressable
              style={({ pressed }) => [styles.card, pressed && !train && styles.cardPressed]}
              disabled={train}
              onPress={() => router.push(`/lesson/${item.id}`)}>
              <Text style={styles.emoji}>{TYPE_EMOJI[item.type] ?? '📄'}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.title}>{item.title}</Text>
                <Text style={styles.meta}>
                  {item.pillar} · {item.type.replace('_', ' ')}
                  {item.duration_min ? ` · ${item.duration_min} min` : ''} ·{' '}
                  <Text style={styles.gold}>+{item.xp_value} XP</Text>
                </Text>
                {train && <Text style={styles.trainHint}>Complete it in the Train tab 🥊</Text>}
              </View>
              {!train && <Text style={styles.chevron}>›</Text>}
            </Pressable>
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.sm,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.line,
    padding: theme.space.md,
    marginBottom: theme.space.sm,
  },
  cardPressed: { opacity: 0.75 },
  emoji: { fontSize: 26 },
  title: { fontSize: theme.font.body, fontWeight: '700', color: theme.colors.text },
  meta: { fontSize: theme.font.small, color: theme.colors.muted, marginTop: 2 },
  gold: { color: theme.colors.gold, fontWeight: '700' },
  trainHint: { fontSize: theme.font.small, color: theme.colors.muted, marginTop: 4 },
  chevron: { fontSize: 24, color: theme.colors.muted, fontWeight: '300' },
});
