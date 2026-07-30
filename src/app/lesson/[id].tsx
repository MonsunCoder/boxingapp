import { useLocalSearchParams, useRouter } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { theme } from '@/constants/theme';
import { supabase } from '../../../lib/supabase';

/**
 * Day 22+23 — The Lesson Page (screen L3).
 *
 * One page for every readable/watchable content type: video lesson, article,
 * ethics scenario, short film. Workouts and drills never land here — they run
 * in the Train tab.
 *
 * Screen-list decision D9 — the middle path: "Mark complete" activates only
 * after the kid has scrolled to the bottom of the page, past the key steps.
 * Video watching is NOT hard-required — the key-steps text exists so low-data
 * kids can learn without streaming, and hard video gates would punish exactly
 * them. This is a client-side trust mechanism by design; the uncheatable gates
 * (rank-ups, XP dedupe) stay server-side.
 *
 * TEMPORARY (flagged for Phase 3): ethics scenarios complete through this same
 * button for now. Their real form is the interactive choose-your-path scenario
 * with a TRUTHFUL reflection at the end — when that flow is built, ethics
 * items stop completing here (D9 exempts them from the button shortcut).
 *
 * Video is a public sample clip wired through config.video_url — placeholder
 * machinery only. Real hosting (Mux / Supabase Storage) comes with real footage.
 */

type LessonItem = {
  id: string;
  title: string;
  type: string;
  pillar: string;
  xp_value: number;
  duration_min: number | null;
  config: {
    placeholder?: boolean;
    video_url?: string;
    description?: string;
    key_steps?: string[];
  };
};

const isTrainType = (t: string) => t === 'workout' || t === 'drill';
const isEthicsType = (t: string) => t === 'ethics_scenario' || t === 'short_film';

const SCROLL_SLACK = 32; // px of grace so "the bottom" doesn't require a pixel-perfect fling

export default function LessonScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [item, setItem] = useState<LessonItem | null>(null);
  const [error, setError] = useState('');
  const [reachedEnd, setReachedEnd] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState('');

  // The ScrollView's viewport height, for the "fits on one screen" check.
  const viewportH = useRef(0);

  const videoUrl = item?.config?.video_url ?? null;
  const player = useVideoPlayer(null, (p) => {
    p.loop = false;
  });

  // useVideoPlayer captures its initial source and does NOT react when it
  // changes — and the item loads async — so swap the source in explicitly.
  useEffect(() => {
    if (videoUrl) player.replace(videoUrl);
  }, [videoUrl, player]);

  useEffect(() => {
    if (!id) return;
    // BUG FIX (Day 24): this screen is registered once inside the tab
    // navigator, so navigating to a DIFFERENT lesson reuses the same
    // component instance. Without this reset, lesson B wears lesson A's
    // "✓ completed" state — which once made an untouched ethics LESSON look
    // finished while the server (correctly) kept refusing the rank-up.
    setItem(null);
    setResult('');
    setReachedEnd(false);
    setError('');
    supabase
      .from('content_items')
      .select('id, title, type, pillar, xp_value, duration_min, config')
      .eq('id', id)
      .single()
      .then(({ data, error: qError }) => {
        if (qError) setError(qError.message);
        else setItem(data as LessonItem);
      });
  }, [id]);

  // D9 gate: unlock when the bottom of the content has been seen — including
  // the case where the whole page fits on screen with nothing to scroll.
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, layoutMeasurement, contentSize } = e.nativeEvent;
    if (contentOffset.y + layoutMeasurement.height >= contentSize.height - SCROLL_SLACK) {
      setReachedEnd(true);
    }
  };
  const onContentLayout = (w: number, h: number, viewportH: number) => {
    if (h <= viewportH + SCROLL_SLACK) setReachedEnd(true);
  };

  const markComplete = async () => {
    if (!item) return;
    setBusy(true);
    const { data, error: rpcError } = await supabase.rpc('complete_activity', {
      p_content_id: item.id,
      p_event_type: 'completion',
      p_client_event_id: `lesson-${item.id}-${Date.now()}`,
    });
    setBusy(false);

    if (rpcError) {
      setResult(`⚠ ${rpcError.message}`);
      return;
    }
    const d = data as { awarded: number; first_time?: boolean };
    if (d.awarded > 0) setResult(`✓ +${d.awarded} XP${d.first_time ? ' — first time!' : ''}`);
    else setResult('✓ Already counted today');
  };

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{error}</Text>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backBtnText}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  if (!item) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={theme.colors.gold} />
      </View>
    );
  }

  const ethics = isEthicsType(item.type);
  const steps = item.config?.key_steps ?? [];

  return (
    <View style={styles.screen}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.content}
        onScroll={onScroll}
        scrollEventThrottle={32}
        onContentSizeChange={(w, h) => onContentLayout(w, h, viewportH.current)}
        onLayout={(e) => {
          viewportH.current = e.nativeEvent.layout.height;
        }}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Text style={styles.back}>‹ Back</Text>
        </Pressable>

        {ethics && (
          <View style={styles.ethicsChip}>
            <Text style={styles.ethicsChipText}>🕊️ WORDS FIRST</Text>
          </View>
        )}

        <Text style={styles.title}>{item.title}</Text>
        <Text style={styles.meta}>
          {item.pillar} · {item.type.replace('_', ' ')}
          {item.duration_min ? ` · ${item.duration_min} min` : ''} ·{' '}
          <Text style={styles.gold}>+{item.xp_value} XP</Text>
        </Text>

        {videoUrl ? (
          <VideoView player={player} style={styles.video} contentFit="contain" allowsFullscreen />
        ) : null}

        {item.config?.description ? (
          <Text style={styles.body}>{item.config.description}</Text>
        ) : (
          <Text style={styles.body}>No lesson text yet — placeholder content pending.</Text>
        )}

        {steps.length > 0 && (
          <View style={styles.stepsCard}>
            <Text style={[styles.stepsTitle, ethics && styles.stepsTitleEthics]}>
              {ethics ? 'The moment' : 'Key steps'}
            </Text>
            {steps.map((s, i) => (
              <View key={i} style={styles.stepRow}>
                <Text style={styles.stepNum}>{i + 1}</Text>
                <Text style={styles.stepText}>{s}</Text>
              </View>
            ))}
          </View>
        )}

        {ethics && (
          <Text style={styles.truthful}>
            TRUTHFUL — before you tap complete, answer for yourself: what would walking away cost
            you here? What would it get you?
          </Text>
        )}
      </ScrollView>

      {/* Completion bar — pinned; the D9 scroll gate controls it */}
      <View style={styles.footer}>
        {isTrainType(item.type) ? (
          <Text style={styles.trainHint}>This one is done in the Train tab 🥊</Text>
        ) : result ? (
          <View style={styles.doneRow}>
            <Text style={result.startsWith('⚠') ? styles.resultError : styles.resultOk}>
              {result}
            </Text>
            <Pressable style={styles.backBtn} onPress={() => router.back()}>
              <Text style={styles.backBtnText}>Done</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <Pressable
              style={[styles.completeBtn, (!reachedEnd || busy) && styles.btnOff]}
              disabled={!reachedEnd || busy}
              onPress={markComplete}>
              <Text style={styles.completeText}>
                {busy ? 'Saving…' : reachedEnd ? 'Mark complete' : 'Read to the end first'}
              </Text>
            </Pressable>
            {!reachedEnd && (
              <Text style={styles.gateHint}>Scroll through the whole lesson to unlock.</Text>
            )}
          </>
        )}
      </View>
    </View>
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
  errorText: { fontSize: theme.font.body, color: theme.colors.danger, textAlign: 'center' },

  ethicsChip: {
    alignSelf: 'flex-start',
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.green,
    borderWidth: 1,
    borderRadius: theme.radius.pill,
    paddingHorizontal: theme.space.md,
    paddingVertical: 4,
  },
  ethicsChipText: {
    fontSize: theme.font.small,
    color: theme.colors.green,
    fontWeight: '800',
    letterSpacing: 1,
  },

  title: { fontSize: theme.font.title, fontWeight: '800', color: theme.colors.text },
  meta: { fontSize: theme.font.small, color: theme.colors.muted },
  gold: { color: theme.colors.gold, fontWeight: '700' },

  video: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: '#000',
    borderRadius: theme.radius.md,
    marginTop: theme.space.xs,
  },

  body: {
    fontSize: theme.font.body,
    color: theme.colors.text,
    lineHeight: 22,
    marginTop: theme.space.xs,
  },

  stepsCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.line,
    padding: theme.space.md,
    gap: theme.space.sm,
    marginTop: theme.space.xs,
  },
  stepsTitle: {
    fontSize: theme.font.small,
    color: theme.colors.muted,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  stepsTitleEthics: { color: theme.colors.green },
  stepRow: { flexDirection: 'row', gap: theme.space.sm, alignItems: 'flex-start' },
  stepNum: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: theme.colors.line,
    color: theme.colors.text,
    textAlign: 'center',
    lineHeight: 22,
    fontSize: theme.font.small,
    fontWeight: '700',
    overflow: 'hidden',
  },
  stepText: { flex: 1, fontSize: theme.font.body, color: theme.colors.text, lineHeight: 20 },

  truthful: {
    fontSize: theme.font.small,
    color: theme.colors.green,
    lineHeight: 20,
    marginTop: theme.space.xs,
    fontStyle: 'italic',
  },

  footer: {
    borderTopWidth: 1,
    borderTopColor: theme.colors.line,
    backgroundColor: theme.colors.surface,
    padding: theme.space.md,
    gap: 6,
  },
  completeBtn: {
    backgroundColor: theme.colors.red,
    borderRadius: theme.radius.lg,
    paddingVertical: 12,
    alignItems: 'center',
  },
  btnOff: { backgroundColor: theme.colors.line },
  completeText: { color: '#fff', fontSize: theme.font.body, fontWeight: '800' },
  gateHint: { fontSize: theme.font.small, color: theme.colors.muted, textAlign: 'center' },
  trainHint: {
    fontSize: theme.font.body,
    color: theme.colors.muted,
    textAlign: 'center',
    paddingVertical: 6,
  },
  doneRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  resultOk: { fontSize: theme.font.body, color: theme.colors.green, fontWeight: '700' },
  resultError: { flex: 1, fontSize: theme.font.small, color: theme.colors.danger },
  backBtn: {
    backgroundColor: theme.colors.line,
    borderRadius: theme.radius.pill,
    paddingHorizontal: theme.space.lg,
    paddingVertical: 8,
  },
  backBtnText: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '700' },
});
