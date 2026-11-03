import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { ConnectStanding, standingLine } from '@/constants/conduct';
import { theme } from '@/constants/theme';

/**
 * Jigar (2026-11-03): when the word filter holds a post or reply, the kid
 * gets a severe, full-screen warning that names the consequence and must
 * tap "I understand" to close it — no tapping outside, no Android back.
 * The same warning is saved in their 🔔 (activity_page) so it isn't lost.
 *
 * This is the word filter's HELD path only. Hidden downvotes never show
 * anything to anyone (Decision 6) — never reuse this for burial.
 *
 * Copy is placeholder (content phase). The strike count under the warning
 * comes from the server's standing after this hold (src/constants/conduct.ts).
 */
export default function HeldWarningModal({
  kind,
  visible,
  standing,
  onUnderstand,
}: {
  kind: 'post' | 'reply';
  visible: boolean;
  standing?: ConnectStanding | null;
  onUnderstand: () => void;
}) {
  const strikeLine = standingLine(standing ?? null);
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => {}}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.icon}>⚠️</Text>
          <Text style={styles.title}>Warning</Text>
          <Text style={styles.body}>
            Your {kind} broke the TRUST code. It has been held and will not go up. A coach will
            review it.
          </Text>
          <Text style={styles.consequence}>
            Keep posting like this and your account can be suspended or banned from HOPE.
          </Text>
          {strikeLine !== '' && <Text style={styles.strike}>{strikeLine}</Text>}
          <Text style={styles.note}>This warning is saved in your 🔔.</Text>
          <Pressable
            style={({ pressed }) => [styles.button, pressed && { opacity: 0.8 }]}
            onPress={onUnderstand}>
            <Text style={styles.buttonText}>I understand</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.space.lg,
  },
  card: {
    width: '100%',
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.danger,
    borderWidth: 2,
    borderRadius: theme.radius.md,
    padding: theme.space.lg,
    gap: theme.space.sm,
    alignItems: 'center',
  },
  icon: { fontSize: 48 },
  title: { fontSize: theme.font.title, fontWeight: '800', color: theme.colors.danger, letterSpacing: 1 },
  body: { fontSize: theme.font.body, color: theme.colors.text, textAlign: 'center', lineHeight: 22 },
  consequence: {
    fontSize: theme.font.body,
    fontWeight: '800',
    color: theme.colors.danger,
    textAlign: 'center',
    lineHeight: 22,
  },
  strike: {
    fontSize: theme.font.body,
    fontWeight: '800',
    color: theme.colors.gold,
    textAlign: 'center',
    lineHeight: 22,
  },
  note: { fontSize: theme.font.small, color: theme.colors.muted, textAlign: 'center' },
  button: {
    alignSelf: 'stretch',
    backgroundColor: theme.colors.danger,
    borderRadius: theme.radius.pill,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: theme.space.sm,
  },
  buttonText: { color: '#fff', fontSize: theme.font.body, fontWeight: '800' },
});
