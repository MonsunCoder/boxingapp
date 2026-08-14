import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useAuth } from '@/components/auth/AuthProvider';
import { theme } from '@/constants/theme';
import { supabase } from '../../../lib/supabase';

/**
 * Day 35 — Post thread: a post and its replies.
 *
 * This is the ONLY conversation surface in the app — public, topic-based,
 * attached to a post, readable by every coach and parent. The playbook's
 * "group chat" was overridden by the forums-only standing rule; this screen
 * is what it became. Replies feed the D8 Activity bell for the post author.
 * Report buttons + the moderation pipeline attach here on Day 36.
 */

type Reply = { id: string; body: string; author_name: string; is_mine: boolean; created_at: string };
type ThreadPost = {
  id: string;
  topic_title: string;
  title: string | null;
  body: string;
  author_name: string;
  created_at: string;
  like_count: number;
  liked_by_me: boolean;
};

function timeAgo(iso: string): string {
  const mins = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

export default function PostThreadScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [post, setPost] = useState<ThreadPost | null>(null);
  const [replies, setReplies] = useState<Reply[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!id) return;
    const { data, error: rpcError } = await supabase.rpc('post_thread', { p_post: id });
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    setError('');
    const t = data as { post: ThreadPost | null; replies: Reply[] };
    setPost(t.post);
    setReplies(t.replies ?? []);
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      // Screen instance is reused across posts (tab-nested route) — reset.
      setPost(null);
      setReplies([]);
      setDraft('');
      load();
    }, [load]),
  );

  const like = async () => {
    if (!post) return;
    setPost({ ...post, liked_by_me: !post.liked_by_me, like_count: post.like_count + (post.liked_by_me ? -1 : 1) });
    const { data } = await supabase.rpc('toggle_like', { p_post: post.id });
    const d = data as { liked: boolean; like_count: number } | null;
    if (d) setPost((p) => (p ? { ...p, liked_by_me: d.liked, like_count: d.like_count } : p));
  };

  const sendReply = async () => {
    const body = draft.trim();
    if (!session || !post || body.length < 1) return;
    setBusy(true);
    setError('');
    const { error: insError } = await supabase.from('forum_replies').insert({
      post_id: post.id,
      author_id: session.user.id,
      body,
    });
    setBusy(false);
    if (insError) {
      setError(insError.message);
      return;
    }
    setDraft('');
    await load();
  };

  if (error && !post) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{error}</Text>
        <Pressable style={styles.quietBtn} onPress={() => router.back()}>
          <Text style={styles.quietText}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  if (!post) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={theme.colors.gold} />
      </View>
    );
  }

  const milestone = (post.title ?? '').startsWith('🏅');

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.screen}>
      <FlatList
        data={replies}
        keyExtractor={(r) => r.id}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <>
            <Pressable onPress={() => router.back()} hitSlop={12}>
              <Text style={styles.back}>‹ Connect</Text>
            </Pressable>
            <View style={[styles.post, milestone && styles.postMilestone]}>
              <Text style={styles.postMeta}>
                <Text style={styles.author}>{post.author_name}</Text>
                {'  ·  t/'}
                {post.topic_title.replace(' ', '-')}
                {'  ·  '}
                {timeAgo(post.created_at)}
              </Text>
              {post.title && post.title !== post.body.slice(0, 60) ? (
                <Text style={styles.postTitle}>{post.title}</Text>
              ) : null}
              <Text style={styles.postBody}>{post.body}</Text>
              <Pressable style={styles.likeRow} onPress={like} hitSlop={8}>
                <Text style={[styles.likeText, post.liked_by_me && styles.likedText]}>
                  {post.liked_by_me ? '❤️' : '🤍'} {post.like_count}
                </Text>
              </Pressable>
            </View>
            <Text style={styles.repliesHead}>
              {replies.length === 0 ? 'No replies yet — be the corner.' : `${replies.length} repl${replies.length === 1 ? 'y' : 'ies'}`}
            </Text>
          </>
        }
        renderItem={({ item }) => (
          <View style={[styles.reply, item.is_mine && styles.replyMine]}>
            <Text style={styles.postMeta}>
              <Text style={styles.author}>{item.author_name}</Text>
              {'  ·  '}
              {timeAgo(item.created_at)}
            </Text>
            <Text style={styles.postBody}>{item.body}</Text>
          </View>
        )}
      />

      <View style={styles.composerBar}>
        <TextInput
          style={styles.input}
          value={draft}
          onChangeText={setDraft}
          placeholder="Reply like a teammate…"
          placeholderTextColor={theme.colors.muted}
          maxLength={800}
          multiline
        />
        <Pressable
          style={[styles.sendBtn, (busy || draft.trim().length < 1) && styles.btnOff]}
          disabled={busy || draft.trim().length < 1}
          onPress={sendReply}>
          <Text style={styles.sendText}>{busy ? '…' : 'Reply'}</Text>
        </Pressable>
      </View>
      {error !== '' && post && <Text style={[styles.errorText, { paddingHorizontal: 16 }]}>{error}</Text>}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.bg },
  content: { paddingTop: 64, paddingHorizontal: theme.space.md, paddingBottom: theme.space.lg },
  center: {
    flex: 1,
    backgroundColor: theme.colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.space.md,
    padding: theme.space.lg,
  },
  back: { fontSize: theme.font.body, color: theme.colors.muted, marginBottom: theme.space.sm },
  errorText: { fontSize: theme.font.small, color: theme.colors.danger },

  post: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.line,
    borderWidth: 1,
    borderRadius: theme.radius.md,
    padding: theme.space.md,
    gap: 6,
  },
  postMilestone: { borderColor: theme.colors.gold },
  postMeta: { fontSize: theme.font.small, color: theme.colors.muted },
  author: { color: theme.colors.text, fontWeight: '700' },
  postTitle: { fontSize: theme.font.header, fontWeight: '800', color: theme.colors.text },
  postBody: { fontSize: theme.font.body, color: theme.colors.text, lineHeight: 21 },
  likeRow: { alignSelf: 'flex-start', marginTop: 2 },
  likeText: { fontSize: theme.font.small, color: theme.colors.muted, fontWeight: '700' },
  likedText: { color: theme.colors.red },

  repliesHead: {
    fontSize: theme.font.small,
    color: theme.colors.muted,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginVertical: theme.space.sm,
  },
  reply: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.line,
    borderWidth: 1,
    borderRadius: theme.radius.md,
    padding: theme.space.md,
    marginBottom: theme.space.xs,
    gap: 4,
  },
  replyMine: { borderColor: theme.colors.gold },

  composerBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: theme.space.sm,
    borderTopWidth: 1,
    borderTopColor: theme.colors.line,
    backgroundColor: theme.colors.surface,
    padding: theme.space.md,
  },
  input: {
    flex: 1,
    backgroundColor: theme.colors.bg,
    borderColor: theme.colors.line,
    borderWidth: 1,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.space.md,
    paddingVertical: 8,
    fontSize: theme.font.body,
    color: theme.colors.text,
    maxHeight: 110,
  },
  sendBtn: {
    backgroundColor: theme.colors.red,
    borderRadius: theme.radius.pill,
    paddingHorizontal: theme.space.lg,
    paddingVertical: 10,
  },
  btnOff: { opacity: 0.5 },
  sendText: { color: '#fff', fontSize: theme.font.body, fontWeight: '800' },
  quietBtn: {
    backgroundColor: theme.colors.line,
    borderRadius: theme.radius.pill,
    paddingHorizontal: theme.space.lg,
    paddingVertical: 10,
  },
  quietText: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '700' },
});
