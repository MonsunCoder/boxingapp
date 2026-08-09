import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, SectionList, StyleSheet, Text, TextInput, View } from 'react-native';

import { useAuth } from '@/components/auth/AuthProvider';
import { PathwayInfo, TRACK_SECTIONS } from '@/constants/pathways';
import { theme } from '@/constants/theme';
import { supabase } from '../../lib/supabase';

/**
 * Day 24 — Learn tab, restructured per Jigar's direction: pathways come
 * CATEGORIZED — The Journey (required) first, then Belt pathways, then
 * Optional — each card carrying its difficulty. The flat all-content list
 * stays below as a browse section for now.
 *
 * Categories and difficulty are DATA (pathways.track / pathways.difficulty),
 * so re-shelving a pathway is a row edit. Cards open /pathway/[id] — the
 * spider-web Journey view. Tapping a flat-list item still opens its lesson
 * page directly.
 *
 * Pathways + the LV/XP chip reload on focus so both reflect work finished
 * elsewhere the moment you come back.
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

// The four pillars (locked in the DB check constraint since Day 3).
// Order here = display order in the Library; a pillar with no content
// simply doesn't render yet.
const PILLARS: { key: string; label: string }[] = [
  { key: 'boxing', label: '🥊 Boxing' },
  { key: 'conflict', label: '🕊️ Words First' },
  { key: 'nutrition', label: '🍎 Nutrition' },
  { key: 'fitness', label: '💪 Fitness' },
];
const pillarLabel = (p: string) =>
  PILLARS.find((x) => x.key === p)?.label ?? p.charAt(0).toUpperCase() + p.slice(1);

export default function LearnScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const [items, setItems] = useState<ContentItem[]>([]);
  const [pathways, setPathways] = useState<PathwayInfo[]>([]);
  const [status, setStatus] = useState('Loading…');
  const [stats, setStats] = useState<{ xp: number; level: number } | null>(null);
  const [query, setQuery] = useState('');

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

  const loadPathways = useCallback(async () => {
    const { data } = await supabase.rpc('pathway_map');
    setPathways((data as PathwayInfo[]) ?? []);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadStats();
      loadPathways();
    }, [loadStats, loadPathways]),
  );

  // The Library: title search + grouped by the four pillars (Day 25).
  // Grouping is data-driven — a pillar with no content just doesn't appear.
  const librarySections = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q === '' ? items : items.filter((i) => i.title.toLowerCase().includes(q));
    const known = PILLARS.map((p) => ({
      title: p.label,
      data: filtered.filter((i) => i.pillar === p.key),
    }));
    const other = {
      title: 'Other',
      data: filtered.filter((i) => !PILLARS.some((p) => p.key === i.pillar)),
    };
    return [...known, other].filter((s) => s.data.length > 0);
  }, [items, query]);

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

      <SectionList
        sections={librarySections}
        keyExtractor={(item) => item.id}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={{ paddingBottom: theme.space.xl }}
        renderSectionHeader={({ section }) => (
          <Text style={styles.pillarTitle}>{section.title}</Text>
        )}
        ListEmptyComponent={
          query.trim() !== '' ? (
            <Text style={styles.status}>Nothing matches “{query.trim()}”.</Text>
          ) : null
        }
        ListHeaderComponent={
          <>
            {/* Searching hides the pathway shelves to focus the results. */}
            {query.trim() === '' &&
              TRACK_SECTIONS.map((section) => {
              const inSection = pathways.filter((p) => p.track === section.track);
              if (inSection.length === 0) return null;
              return (
                <View key={section.track}>
                  <Text style={styles.sectionTitle}>{section.title}</Text>
                  <Text style={styles.sectionBlurb}>{section.blurb}</Text>
                  {inSection.map((p) => {
                    const finished = p.done_count === p.total_count;
                    return (
                      <Pressable
                        key={p.id}
                        style={({ pressed }) => [
                          styles.pathCard,
                          section.track !== 'journey' && styles.pathCardQuiet,
                          finished && styles.pathDone,
                          pressed && styles.cardPressed,
                        ]}
                        onPress={() => router.push(`/pathway/${p.id}`)}>
                        <Text style={styles.pathEmoji}>{finished ? '🏁' : '🗺️'}</Text>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.title}>{p.title}</Text>
                          {p.description ? (
                            <Text style={styles.meta} numberOfLines={2}>{p.description}</Text>
                          ) : null}
                          <Text style={styles.pathProgress}>
                            {p.difficulty} · {finished ? 'Complete' : `${p.done_count}/${p.total_count} steps`}
                          </Text>
                        </View>
                        <Text style={styles.chevron}>›</Text>
                      </Pressable>
                    );
                  })}
                  </View>
                );
              })}
            {/* Meal Plans entry (Day 31) — the basic customizer lives one tap deep */}
            <Pressable
              style={({ pressed }) => [styles.plansCard, pressed && styles.cardPressed]}
              onPress={() => router.push('/plans')}>
              <Text style={styles.pathEmoji}>🍽️</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.title}>Meal Plans</Text>
                <Text style={styles.meta}>Budget weekly menus for your goal — pick one, own it.</Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </Pressable>

            <Text style={styles.sectionTitle}>Library</Text>
            <TextInput
              style={styles.searchBox}
              value={query}
              onChangeText={setQuery}
              placeholder="Search lessons, workouts, articles…"
              placeholderTextColor={theme.colors.muted}
              autoCorrect={false}
              returnKeyType="search"
              clearButtonMode="while-editing"
            />
          </>
        }
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
  pathCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.sm,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.gold,
    padding: theme.space.md,
    marginBottom: theme.space.sm,
  },
  pathCardQuiet: { borderColor: theme.colors.line },
  plansCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.sm,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.green,
    padding: theme.space.md,
    marginTop: theme.space.sm,
  },
  pathDone: { borderColor: theme.colors.green },
  pathEmoji: { fontSize: 26 },
  pathProgress: { fontSize: theme.font.small, color: theme.colors.gold, fontWeight: '700', marginTop: 4 },
  sectionTitle: {
    fontSize: theme.font.header,
    fontWeight: '700',
    color: theme.colors.text,
    marginTop: theme.space.sm,
    marginBottom: 4,
  },
  sectionBlurb: {
    fontSize: theme.font.small,
    color: theme.colors.muted,
    marginBottom: theme.space.sm,
  },
  searchBox: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.line,
    borderWidth: 1,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.space.md,
    paddingVertical: 10,
    fontSize: theme.font.body,
    color: theme.colors.text,
    marginBottom: theme.space.sm,
  },
  pillarTitle: {
    fontSize: theme.font.body,
    fontWeight: '800',
    color: theme.colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: theme.space.sm,
    marginBottom: theme.space.xs,
  },
  emoji: { fontSize: 26 },
  title: { fontSize: theme.font.body, fontWeight: '700', color: theme.colors.text },
  meta: { fontSize: theme.font.small, color: theme.colors.muted, marginTop: 2 },
  gold: { color: theme.colors.gold, fontWeight: '700' },
  trainHint: { fontSize: theme.font.small, color: theme.colors.muted, marginTop: 4 },
  chevron: { fontSize: 24, color: theme.colors.muted, fontWeight: '300' },
});
