import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { APPEAL_REASONS, ConnectStanding } from '@/constants/conduct';
import { theme } from '@/constants/theme';
import { supabase } from '../../lib/supabase';

/**
 * Connect conduct banner (Jigar, 2026-11-03). Shows nothing in good
 * standing. Otherwise: the final warning, the fresh-start reminder, or the
 * read-only notice with "Ask for a fresh start" (one open request at a time;
 * coaches decide in the Coach's Queue). The server enforces read-only; this
 * only explains it. Copy is placeholder.
 */
export default function ConnectStandingBanner({
  standing,
  onChanged,
}: {
  standing: ConnectStanding | null;
  onChanged: () => void;
}) {
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState<(typeof APPEAL_REASONS)[number]['key'] | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (!standing) return null;

  const send = async () => {
    if (!reason) return;
    setBusy(true);
    setError('');
    const { data } = await supabase.rpc('submit_connect_appeal', { p_reason: reason, p_note: note });
    setBusy(false);
    const d = data as { ok: boolean; reason?: string } | null;
    if (!d?.ok && d?.reason !== 'already_open') {
      setError('That didn’t send. Try again.');
      return;
    }
    setAsking(false);
    setReason(null);
    setNote('');
    onChanged();
  };

  if (standing.state === 'final_warning') {
    return (
      <View style={[styles.banner, styles.warn]}>
        <Text style={styles.warnText}>
          ⚠️ Final warning: one more offense and Connect turns read-only for you.
        </Text>
      </View>
    );
  }

  if (standing.state === 'good') {
    if (!standing.fresh_start) return null;
    return (
      <View style={[styles.banner, styles.fresh]}>
        <Text style={styles.freshText}>
          🌱 Fresh start. Make it count: one more offense and Connect turns read-only again.
        </Text>
      </View>
    );
  }

  // banned: read-only
  return (
    <View style={[styles.banner, styles.locked]}>
      <Text style={styles.lockedTitle}>🔒 Connect is read-only for you</Text>
      <Text style={styles.lockedText}>
        You can read posts and challenges and report anything that isn’t right. Posting, replies and
        votes are off.
      </Text>
      {standing.appeal === 'open' ? (
        <Text style={styles.pending}>Your fresh-start request is with the coaches.</Text>
      ) : (
        <>
          {standing.appeal === 'denied' && (
            <Text style={styles.pending}>Not yet. Keep showing the TRUST code, then ask again.</Text>
          )}
          <Pressable style={styles.askBtn} onPress={() => setAsking(true)}>
            <Text style={styles.askText}>Ask for a fresh start</Text>
          </Pressable>
        </>
      )}

      <Modal visible={asking} transparent animationType="fade" onRequestClose={() => setAsking(false)}>
        <KeyboardAvoidingView style={styles.backdrop} behavior="padding">
          <View style={styles.card}>
            <Text style={styles.cardTitle}>🌱 Ask for a fresh start</Text>
            <Text style={styles.cardText}>
              A coach will read this. If they say yes, Connect opens again and your count starts
              over. One more offense after that and it turns read-only again.
            </Text>
            {APPEAL_REASONS.map((r) => (
              <Pressable
                key={r.key}
                style={[styles.reason, reason === r.key && styles.reasonOn]}
                onPress={() => setReason(r.key)}>
                <Text style={[styles.reasonText, reason === r.key && styles.reasonTextOn]}>{r.label}</Text>
              </Pressable>
            ))}
            <TextInput
              style={styles.note}
              value={note}
              onChangeText={(t) => setNote(t.slice(0, 300))}
              placeholder="Anything you want the coach to know (optional)"
              placeholderTextColor={theme.colors.muted}
              multiline
            />
            {error !== '' && <Text style={styles.error}>{error}</Text>}
            <View style={styles.row}>
              <Pressable style={styles.cancelBtn} onPress={() => setAsking(false)}>
                <Text style={styles.cancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.sendBtn, (!reason || busy) && { opacity: 0.5 }]}
                disabled={!reason || busy}
                onPress={send}>
                <Text style={styles.sendText}>{busy ? 'Sending…' : 'Send'}</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { borderWidth: 1, borderRadius: theme.radius.md, padding: theme.space.md, marginBottom: theme.space.sm, gap: 6 },
  warn: { borderColor: theme.colors.gold, backgroundColor: theme.colors.surface },
  warnText: { fontSize: theme.font.body, fontWeight: '800', color: theme.colors.gold },
  fresh: { borderColor: theme.colors.green, backgroundColor: theme.colors.surface },
  freshText: { fontSize: theme.font.small, fontWeight: '700', color: theme.colors.green },
  locked: { borderColor: theme.colors.danger, backgroundColor: theme.colors.surface },
  lockedTitle: { fontSize: theme.font.body, fontWeight: '800', color: theme.colors.danger },
  lockedText: { fontSize: theme.font.small, color: theme.colors.text, lineHeight: 18 },
  pending: { fontSize: theme.font.small, color: theme.colors.gold, fontWeight: '700' },
  askBtn: {
    alignSelf: 'flex-start',
    backgroundColor: theme.colors.green,
    borderRadius: theme.radius.pill,
    paddingHorizontal: theme.space.md,
    paddingVertical: 8,
    marginTop: theme.space.xs,
  },
  askText: { color: '#fff', fontSize: theme.font.small, fontWeight: '800' },

  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', padding: theme.space.lg },
  card: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.green,
    borderWidth: 1,
    borderRadius: theme.radius.md,
    padding: theme.space.lg,
    gap: theme.space.sm,
  },
  cardTitle: { fontSize: theme.font.header, fontWeight: '800', color: theme.colors.text },
  cardText: { fontSize: theme.font.small, color: theme.colors.muted, lineHeight: 18 },
  reason: { borderWidth: 1, borderColor: theme.colors.line, borderRadius: theme.radius.sm, padding: 10 },
  reasonOn: { borderColor: theme.colors.green },
  reasonText: { fontSize: theme.font.small, color: theme.colors.text },
  reasonTextOn: { color: theme.colors.green, fontWeight: '700' },
  note: {
    minHeight: 70,
    borderWidth: 1,
    borderColor: theme.colors.line,
    borderRadius: theme.radius.sm,
    padding: 10,
    color: theme.colors.text,
    fontSize: theme.font.small,
    textAlignVertical: 'top',
  },
  error: { fontSize: theme.font.small, color: theme.colors.danger },
  row: { flexDirection: 'row', gap: theme.space.sm, justifyContent: 'flex-end' },
  cancelBtn: { paddingHorizontal: theme.space.md, paddingVertical: 10 },
  cancelText: { color: theme.colors.muted, fontSize: theme.font.body, fontWeight: '700' },
  sendBtn: { backgroundColor: theme.colors.green, borderRadius: theme.radius.pill, paddingHorizontal: theme.space.lg, paddingVertical: 10 },
  sendText: { color: '#fff', fontSize: theme.font.body, fontWeight: '800' },
});
