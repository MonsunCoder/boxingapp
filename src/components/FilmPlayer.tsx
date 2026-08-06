import { useLocalSearchParams, useRouter } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { theme } from '@/constants/theme';
import { supabase } from '../../lib/supabase';

/**
 * Day 27 — The Film Player: short-film LESSONs (animated shorts + the LIFE
 * judgment-tier series later).
 *
 * Flow: watch the film → the TRUTHFUL reflection unlocks when it ends →
 * completion event through the one pipe. Same reflection contract as the
 * scenario player: answered out loud or in-head, never typed, never stored.
 *
 * The end-of-film check polls currentTime against duration rather than
 * relying on player events — dumber, but robust across expo-video versions.
 * Scrubbing to the end technically works; like the D9 scroll gate, this is
 * a trust mechanism, not a lock. The uncheatable gates stay server-side.
 *
 * Placeholder clip until real animation lands (content phase). config.film =
 * { video_url, description?, reflection }.
 */

export type Film = {
  video_url: string;
  description?: string;
  reflection: string;
};

type Props = {
  item: { id: string; title: string; xp_value: number };
  film: Film;
};

const LOAD_TIMEOUT_MS = 12000; // placeholder resilience: video failing must never block the LESSON

export default function FilmPlayer({ item, film }: Props) {
  const router = useRouter();
  // Rendered inside /lesson/[id]; returnTo sends "Done"/back to the opener.
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();
  const goBack = () => {
    if (typeof returnTo === 'string' && returnTo.startsWith('/')) router.replace(returnTo as never);
    else router.back();
  };
  const [watched, setWatched] = useState(false);
  const [videoTrouble, setVideoTrouble] = useState('');
  const [phase, setPhase] = useState<'watching' | 'reflection' | 'done'>('watching');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState('');

  const player = useVideoPlayer(film.video_url, (p) => {
    p.loop = false;
  });

  // Unlock the reflection when the film reaches its end (0.5s slack).
  // Also watch for trouble: if the player reports an error, or the clip still
  // has no duration after LOAD_TIMEOUT_MS (source never loaded), say so on
  // screen and unlock the reflection anyway — a broken placeholder clip must
  // never wall off the LESSON. Real hosting (Mux) makes this a rarity.
  useEffect(() => {
    if (watched) return;
    const startedAt = Date.now();
    const idInterval = setInterval(() => {
      if (player.status === 'error') {
        setVideoTrouble('The clip failed to load — the reflection is open anyway.');
        setWatched(true);
        return;
      }
      const dur = player.duration;
      if (dur > 0 && player.currentTime >= dur - 0.5) {
        setWatched(true);
        return;
      }
      if (dur === 0 && Date.now() - startedAt > LOAD_TIMEOUT_MS) {
        setVideoTrouble('The clip is not loading on this connection — the reflection is open anyway.');
        setWatched(true);
      }
    }, 500);
    return () => clearInterval(idInterval);
  }, [watched, player]);

  const complete = async () => {
    setBusy(true);
    const { data, error } = await supabase.rpc('complete_activity', {
      p_content_id: item.id,
      p_event_type: 'completion',
      p_client_event_id: `film-${item.id}-${Date.now()}`,
    });
    setBusy(false);
    if (error) {
      setResult(`⚠ ${error.message}`);
      return;
    }
    const d = data as { awarded: number; first_time?: boolean };
    setResult(d.awarded > 0 ? `✓ +${d.awarded} XP${d.first_time ? ' — first time!' : ''}` : '✓ Already counted today');
    setPhase('done');
  };

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable onPress={goBack} hitSlop={12}>
          <Text style={styles.back}>‹ Back</Text>
        </Pressable>

        <View style={styles.chip}>
          <Text style={styles.chipText}>🎬 SHORT FILM</Text>
        </View>
        <Text style={styles.title}>{item.title}</Text>

        <VideoView
          player={player}
          style={styles.video}
          contentFit="contain"
          allowsFullscreen
          allowsPictureInPicture={false}
        />

        {film.description ? <Text style={styles.desc}>{film.description}</Text> : null}
        {videoTrouble !== '' && <Text style={styles.trouble}>⚠ {videoTrouble}</Text>}

        {phase === 'watching' && (
          <>
            {watched ? (
              <Pressable
                style={({ pressed }) => [styles.continueBtn, pressed && styles.pressed]}
                onPress={() => setPhase('reflection')}>
                <Text style={styles.continueText}>Sit with it ›</Text>
              </Pressable>
            ) : (
              <Text style={styles.gateHint}>The reflection opens when the film ends.</Text>
            )}
          </>
        )}

        {phase !== 'watching' && (
          <View style={styles.reflectCard}>
            <Text style={styles.reflectLabel}>TRUTHFUL</Text>
            <Text style={styles.reflectQuestion}>{film.reflection}</Text>
            <Text style={styles.reflectHint}>
              Answer out loud or in your head. Nobody grades this. That's the point.
            </Text>

            {phase === 'reflection' ? (
              <Pressable
                style={[styles.completeBtn, busy && styles.pressed]}
                disabled={busy}
                onPress={complete}>
                <Text style={styles.completeText}>{busy ? 'Saving…' : 'I answered honestly'}</Text>
              </Pressable>
            ) : (
              <>
                <Text style={result.startsWith('⚠') ? styles.resultError : styles.resultOk}>
                  {result}
                </Text>
                <Pressable style={styles.completeBtn} onPress={goBack}>
                  <Text style={styles.completeText}>Done</Text>
                </Pressable>
              </>
            )}
          </View>
        )}
      </ScrollView>
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
  back: { fontSize: theme.font.body, color: theme.colors.muted },
  chip: {
    alignSelf: 'flex-start',
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.green,
    borderWidth: 1,
    borderRadius: theme.radius.pill,
    paddingHorizontal: theme.space.md,
    paddingVertical: 4,
  },
  chipText: { fontSize: theme.font.small, color: theme.colors.green, fontWeight: '800', letterSpacing: 1 },
  title: { fontSize: theme.font.title, fontWeight: '800', color: theme.colors.text },

  video: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: '#000',
    borderRadius: theme.radius.md,
    marginTop: theme.space.xs,
  },
  desc: { fontSize: theme.font.small, color: theme.colors.muted, lineHeight: 19 },
  trouble: { fontSize: theme.font.small, color: theme.colors.gold, lineHeight: 19 },

  gateHint: {
    fontSize: theme.font.small,
    color: theme.colors.muted,
    textAlign: 'center',
    marginTop: theme.space.sm,
  },
  continueBtn: {
    backgroundColor: theme.colors.red,
    borderRadius: theme.radius.lg,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: theme.space.xs,
  },
  continueText: { color: '#fff', fontSize: theme.font.body, fontWeight: '800' },
  pressed: { opacity: 0.7 },

  reflectCard: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.green,
    borderWidth: 1,
    borderRadius: theme.radius.md,
    padding: theme.space.md,
    gap: theme.space.sm,
    marginTop: theme.space.xs,
  },
  reflectLabel: { fontSize: theme.font.small, color: theme.colors.green, fontWeight: '800', letterSpacing: 3 },
  reflectQuestion: { fontSize: theme.font.body, color: theme.colors.text, fontWeight: '700', lineHeight: 22 },
  reflectHint: { fontSize: theme.font.small, color: theme.colors.muted, fontStyle: 'italic' },

  completeBtn: {
    backgroundColor: theme.colors.red,
    borderRadius: theme.radius.lg,
    paddingVertical: 12,
    alignItems: 'center',
  },
  completeText: { color: '#fff', fontSize: theme.font.body, fontWeight: '800' },
  resultOk: { fontSize: theme.font.body, color: theme.colors.green, fontWeight: '700' },
  resultError: { fontSize: theme.font.small, color: theme.colors.danger },
});
