import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useAuth } from '@/components/auth/AuthProvider';
import { theme } from '@/constants/theme';
import { supabase } from '../../lib/supabase';

/**
 * Day 34 — Connect: the HOPE feed (Helping Other People Excel).
 *
 * Teen-safe by construction, not by moderation-after-the-fact:
 *  - ONE shared public feed. No DMs, no private spaces — those tables don't
 *    exist and never will (standing rule; child-safety decision).
 *  - Topics are fixed (C2 five) until admin-approved creation ships (L9).
 *  - Posting requires can_post() server-side (consent-safe).
 *  - "See More" is a deliberate button — never infinite scroll (D8).
 *  - Milestone posts (🏅) come from the rank-up celebration share.
 *
 * Replies + the Activity bell arrive Day 35; the moderation pipeline
 * (keyword filter -> LLM screen -> human queue) is Day 36. Post status
 * defaults 'visible' until then.
 */

type Post = {
  id: string;
  topic_id: string;
  topic_title: string;
  author_name: string;
  title: string | null;
  body: string;
  created_at: string;
  like_count: number;
  liked_by_me: boolean;
  is_mine: boolean;
};

type Topic = { id: string; title: string; description: string | null };

const PAGE = 20;

function timeAgo(iso: string): string {
  const mins = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

export default function ConnectScreen() {
  const { session } = useAuth();
  const [topics, setTopics] = useState<Topic[]>([]);
  const [topicFilter, setTopicFilter] = useState<string | null>(null);
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [composer, setComposer] = useState(false);
  const [draftTopic, setDraftTopic] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftBody, setDraftBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const loadFeed = useCallback(
    async (topic: string | null, before: string | null, append: boolean) => {
      const { data, error: rpcError } = await supabase.rpc('feed_page', {
        p_topic: topic,
        p_before: before,
        p_limit: PAGE,
      });
      if (rpcError) {
        setError(rpcError.message);
        return;
      }
      setError('');
      const page = (data as Post[]) ?? [];
      setPosts((prev) => (append && prev ? [...prev, ...page] : page));
      setHasMore(page.length === PAGE);
    },
    [],
  );

  const loadAll = useCallback(async () => {
    const { data } = await supabase
      .from('forum_topics')
      .select('id, title, description')
      .eq('status', 'approved')
      .order('created_at');
    setTopics((data as Topic[]) ?? []);
    await loadFeed(topicFilter, null, false);
  }, [loadFeed, topicFilter]);

  useFocusEffect(
    useCallback(() => {
      loadAll();
    }, [loadAll]),
  );

  const seeMore = async () => {
    if (!posts || posts.length === 0) return;
    setLoadingMore(true);
    await loadFeed(topicFilter, posts[posts.length - 1].created_at, true);
    setLoadingMore(false);
  };

  const like = async (post: Post) => {
    // Optimistic flip; server result settles it.
    setPosts((prev) =>
      (prev ?? []).map((p) =>
        p.id === post.id
          ? { ...p, liked_by_me: !p.liked_by_me, like_count: p.like_count + (p.liked_by_me ? -1 : 1) }
          : p,
      ),
    );
    const { data, error: rpcError } = await supabase.rpc('toggle_like', { p_post: post.id });
    if (rpcError) {
      await loadFeed(topicFilter, null, false); // resync on failure
      return;
    }
    const d = data as { liked: boolean; like_count: number };
    setPosts((prev) =>
      (prev ?? []).map((p) => (p.id === post.id ? { ...p, liked_by_me: d.liked, like_count: d.like_count } : p)),
    );
  };

  const submitPost = async () => {
    const body = draftBody.trim();
    const topicId = draftTopic ?? topics[0]?.id;
    if (!session || !topicId || body.length < 2) return;
    setBusy(true);
    setError('');
    const title = draftTitle.trim() || body.slice(0, 60);
    const { error: insError } = await supabase.from('forum_posts').insert({
      topic_id: topicId,
      author_id: session.user.id,
      title,
      body,
    });
    setBusy(false);
    if (insError) {
      setError(insError.message);
      return;
    }
    setComposer(false);
    setDraftTitle('');
    setDraftBody('');
    await loadFeed(topicFilter, null, false);
  };

  const milestone = (p: Post) => (p.title ?? '').startsWith('🏅');

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.header}>Connect</Text>
          <Text style={styles.hopeLine}>HOPE — Helping Other People Excel</Text>
        </View>
        <Pressable style={styles.newBtn} onPress={() => setComposer(true)}>
          <Text style={styles.newBtnText}>+ Post</Text>
        </Pressable>
      </View>

      {/* Topic chips (D8: visible topics above the feed) */}
      <View style={styles.chipsRow}>
        <Pressable
          style={[styles.chip, topicFilter === null && styles.chipOn]}
          onPress={() => setTopicFilter(null)}>
          <Text style={[styles.chipText, topicFilter === null && styles.chipTextOn]}>All</Text>
        </Pressable>
        {topics.map((t) => (
          <Pressable
            key={t.id}
            style={[styles.chip, topicFilter === t.id && styles.chipOn]}
            onPress={() => setTopicFilter(topicFilter === t.id ? null : t.id)}>
            <Text style={[styles.chipText, topicFilter === t.id && styles.chipTextOn]}>
              t/{t.title.replace(' ', '-')}
            </Text>
          </Pressable>
        ))}
      </View>

      {error !== '' && <Text style={styles.errorText}>{error}</Text>}

      {!posts ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.colors.gold} />
        </View>
      ) : (
        <FlatList
          data={posts}
          keyExtractor={(p) => p.id}
          contentContainerStyle={{ paddingBottom: theme.space.xl }}
          ListEmptyComponent={
            <Text style={styles.empty}>
              Nothing here yet. Be the first voice in the room — that takes the most heart.
            </Text>
          }
          renderItem={({ item }) => (
            <View style={[styles.post, milestone(item) && styles.postMilestone]}>
              <Text style={styles.postMeta}>
                <Text style={styles.author}>{item.author_name}</Text>
                {'  ·  t/'}
                {item.topic_title.replace(' ', '-')}
                {'  ·  '}
                {timeAgo(item.created_at)}
              </Text>
              {item.title && item.title !== item.body.slice(0, 60) ? (
                <Text style={styles.postTitle}>{item.title}</Text>
              ) : null}
              <Text style={styles.postBody}>{item.body}</Text>
              <Pressable style={styles.likeRow} onPress={() => like(item)} hitSlop={8}>
                <Text style={[styles.likeText, item.liked_by_me && styles.likedText]}>
                  {item.liked_by_me ? '❤️' : '🤍'} {item.like_count}
                </Text>
              </Pressable>
            </View>
          )}
          ListFooterComponent={
            hasMore ? (
              <Pressable style={styles.moreBtn} disabled={loadingMore} onPress={seeMore}>
                <Text style={styles.moreText}>{loadingMore ? 'Loading…' : 'See More'}</Text>
              </Pressable>
            ) : null
          }
        />
      )}

      {/* Composer */}
      <Modal visible={composer} transparent animationType="slide">
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.composerWrap}>
          <View style={styles.composerCard}>
            <Text style={styles.composerTitle}>New post</Text>
            <Text style={styles.trustLine}>
              TRUST: be the corner, not the crowd. Coaches read everything.
            </Text>
            <View style={styles.chipsRow}>
              {topics.map((t) => (
                <Pressable
                  key={t.id}
                  style={[styles.chip, (draftTopic ?? topics[0]?.id) === t.id && styles.chipOn]}
                  onPress={() => setDraftTopic(t.id)}>
                  <Text
                    style={[
                      styles.chipText,
                      (draftTopic ?? topics[0]?.id) === t.id && styles.chipTextOn,
                    ]}>
                    t/{t.title.replace(' ', '-')}
                  </Text>
                </Pressable>
              ))}
            </View>
            <TextInput
              style={styles.input}
              value={draftTitle}
              onChangeText={setDraftTitle}
              placeholder="Title (optional)"
              placeholderTextColor={theme.colors.muted}
              maxLength={80}
            />
            <TextInput
              style={[styles.input, styles.bodyInput]}
              value={draftBody}
              onChangeText={setDraftBody}
              placeholder="Say something worth reading…"
              placeholderTextColor={theme.colors.muted}
              multiline
              maxLength={800}
            />
            {error !== '' && <Text style={styles.errorText}>{error}</Text>}
            <View style={styles.composerBtns}>
              <Pressable style={styles.quietBtn} disabled={busy} onPress={() => setComposer(false)}>
                <Text style={styles.quietText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.postBtn, (busy || draftBody.trim().length < 2) && styles.btnOff]}
                disabled={busy || draftBody.trim().length < 2}
                onPress={submitPost}>
                <Text style={styles.postBtnText}>{busy ? 'Posting…' : 'Post'}</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
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
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  header: { fontSize: theme.font.title, fontWeight: '800', color: theme.colors.text },
  hopeLine: { fontSize: theme.font.small, color: theme.colors.muted, marginTop: 2 },
  newBtn: {
    backgroundColor: theme.colors.red,
    borderRadius: theme.radius.pill,
    paddingHorizontal: theme.space.lg,
    paddingVertical: 8,
  },
  newBtnText: { color: '#fff', fontSize: theme.font.body, fontWeight: '800' },

  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: theme.space.sm },
  chip: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.line,
    borderWidth: 1,
    borderRadius: theme.radius.pill,
    paddingHorizontal: theme.space.md,
    paddingVertical: 6,
  },
  chipOn: { borderColor: theme.colors.red },
  chipText: { fontSize: theme.font.small, color: theme.colors.muted, fontWeight: '700' },
  chipTextOn: { color: theme.colors.red },

  errorText: { fontSize: theme.font.small, color: theme.colors.danger, marginBottom: theme.space.xs },
  empty: { fontSize: theme.font.body, color: theme.colors.muted, textAlign: 'center', marginTop: 40, lineHeight: 22 },

  post: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.line,
    borderWidth: 1,
    borderRadius: theme.radius.md,
    padding: theme.space.md,
    marginBottom: theme.space.sm,
    gap: 6,
  },
  postMilestone: { borderColor: theme.colors.gold },
  postMeta: { fontSize: theme.font.small, color: theme.colors.muted },
  author: { color: theme.colors.text, fontWeight: '700' },
  postTitle: { fontSize: theme.font.body, fontWeight: '800', color: theme.colors.text },
  postBody: { fontSize: theme.font.body, color: theme.colors.text, lineHeight: 21 },
  likeRow: { alignSelf: 'flex-start', marginTop: 2 },
  likeText: { fontSize: theme.font.small, color: theme.colors.muted, fontWeight: '700' },
  likedText: { color: theme.colors.red },

  moreBtn: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.line,
    borderWidth: 1,
    borderRadius: theme.radius.lg,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: theme.space.xs,
  },
  moreText: { fontSize: theme.font.body, color: theme.colors.text, fontWeight: '700' },

  composerWrap: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  composerCard: {
    backgroundColor: theme.colors.bg,
    borderTopLeftRadius: theme.radius.lg,
    borderTopRightRadius: theme.radius.lg,
    padding: theme.space.lg,
    gap: theme.space.sm,
  },
  composerTitle: { fontSize: theme.font.header, fontWeight: '800', color: theme.colors.text },
  trustLine: { fontSize: theme.font.small, color: theme.colors.green, fontStyle: 'italic' },
  input: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.line,
    borderWidth: 1,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.space.md,
    paddingVertical: 10,
    fontSize: theme.font.body,
    color: theme.colors.text,
  },
  bodyInput: { minHeight: 110, textAlignVertical: 'top' },
  composerBtns: { flexDirection: 'row', justifyContent: 'flex-end', gap: theme.space.sm },
  quietBtn: {
    backgroundColor: theme.colors.line,
    borderRadius: theme.radius.pill,
    paddingHorizontal: theme.space.lg,
    paddingVertical: 10,
  },
  quietText: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '700' },
  postBtn: {
    backgroundColor: theme.colors.red,
    borderRadius: theme.radius.pill,
    paddingHorizontal: theme.space.lg,
    paddingVertical: 10,
  },
  btnOff: { opacity: 0.5 },
  postBtnText: { color: '#fff', fontSize: theme.font.body, fontWeight: '800' },
});
