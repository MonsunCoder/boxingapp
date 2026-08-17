import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { theme } from '@/constants/theme';
import { supabase } from '../../lib/supabase';

/**
 * Day 36 — The Coach's Queue (moderators/admins only; server enforces).
 *
 * One list: everything held by the keyword filter + everything kids reported.
 * Two verbs: Approve (goes/stays up, reports dismissed) and Remove (hidden,
 * reports resolved, author gets the mod notice in their bell).
 *
 * Kept deliberately simple — the playbook's line is right: you don't need
 * perfect AI moderation now, you need report + filter + a way to act.
 * The LLM screening layer slots in front of this queue before launch.
 */

type QueueItem = {
  type: 'post' | 'comment';
  id: string;
  status: string;
  author_name: string;
  title: string | null;
  body: string;
  created_at: string;
  open_reports: string[];
};

export default function ModQueueScreen() {
  const router = useRouter();
  const [items, setItems] = useState<QueueItem[] | null>(null);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error: rpcError } = await supabase.rpc('moderation_queue');
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    if (data && !Array.isArray(data) && (data as { error?: string }).error) {
      setError('This area is for coaches.');
      return;
    }
    setError('');
    setItems((data as QueueItem[]) ?? []);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const act = async (item: QueueItem, action: 'approve' | 'remove') => {
    setBusyId(item.id);
    await supabase.rpc('moderate_content', { p_type: item.type, p_id: item.id, p_action: action });
    setBusyId(null);
    await load();
  };

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{error}</Text>
        <Pressable style={styles.quietBtn} onPress={() => router.back()}>
          <Text style={styles.quietText}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  if (!items) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={theme.colors.gold} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.headerWrap}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Text style={styles.back}>‹ Account</Text>
        </Pressable>
        <Text style={styles.header}>🛡️ Coach&apos;s Queue</Text>
        <Text style={styles.sub}>
          {items.length === 0
            ? 'All clear. The room is holding the TRUST code on its own.'
            : `${items.length} item${items.length === 1 ? '' : 's'} waiting on your judgment.`}
        </Text>
      </View>
      <FlatList
        data={items}
        keyExtractor={(i) => i.id}
        contentContainerStyle={{ padding: theme.space.md, paddingBottom: theme.space.xl }}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.meta}>
              {item.type === 'post' ? '📄 Post' : '💬 Reply'} · {item.author_name} ·{' '}
              <Text style={item.status === 'pending_review' ? styles.held : styles.visible}>
                {item.status === 'pending_review' ? 'HELD BY FILTER' : item.status.toUpperCase()}
              </Text>
            </Text>
            {item.title ? <Text style={styles.title}>{item.title}</Text> : null}
            <Text style={styles.body}>{item.body}</Text>
            {item.open_reports.length > 0 && (
              <Text style={styles.reports}>⚑ {item.open_reports.join(' · ')}</Text>
            )}
            <View style={styles.btnRow}>
              <Pressable
                style={[styles.btn, styles.approveBtn, busyId === item.id && styles.btnOff]}
                disabled={busyId !== null}
                onPress={() => act(item, 'approve')}>
                <Text style={styles.btnText}>✓ Approve</Text>
              </Pressable>
              <Pressable
                style={[styles.btn, styles.removeBtn, busyId === item.id && styles.btnOff]}
                disabled={busyId !== null}
                onPress={() => act(item, 'remove')}>
                <Text style={styles.btnText}>✕ Remove</Text>
              </Pressable>
            </View>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.bg },
  center: {
    flex: 1,
    backgroundColor: theme.colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.space.md,
    padding: theme.space.lg,
  },
  headerWrap: { paddingTop: 64, paddingHorizontal: theme.space.md, gap: 6 },
  back: { fontSize: theme.font.body, color: theme.colors.muted },
  header: { fontSize: theme.font.title, fontWeight: '800', color: theme.colors.text },
  sub: { fontSize: theme.font.small, color: theme.colors.muted, marginBottom: theme.space.sm },
  errorText: { fontSize: theme.font.body, color: theme.colors.danger, textAlign: 'center' },

  card: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.gold,
    borderWidth: 1,
    borderRadius: theme.radius.md,
    padding: theme.space.md,
    marginBottom: theme.space.sm,
    gap: 6,
  },
  meta: { fontSize: theme.font.small, color: theme.colors.muted },
  held: { color: theme.colors.gold, fontWeight: '800' },
  visible: { color: theme.colors.muted, fontWeight: '700' },
  title: { fontSize: theme.font.body, fontWeight: '800', color: theme.colors.text },
  body: { fontSize: theme.font.body, color: theme.colors.text, lineHeight: 21 },
  reports: { fontSize: theme.font.small, color: theme.colors.danger },

  btnRow: { flexDirection: 'row', gap: theme.space.sm, marginTop: theme.space.xs },
  btn: { flex: 1, borderRadius: theme.radius.lg, paddingVertical: 11, alignItems: 'center' },
  approveBtn: { backgroundColor: theme.colors.green },
  removeBtn: { backgroundColor: theme.colors.danger },
  btnOff: { opacity: 0.5 },
  btnText: { color: '#fff', fontSize: theme.font.body, fontWeight: '800' },

  quietBtn: {
    backgroundColor: theme.colors.line,
    borderRadius: theme.radius.pill,
    paddingHorizontal: theme.space.lg,
    paddingVertical: 10,
  },
  quietText: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '700' },
});
