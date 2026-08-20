import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { theme } from '@/constants/theme';
import { supabase } from '../../lib/supabase';

/**
 * Day 38 — Free vs Pro (screen A6), by its own rules:
 *  - Transparent two-column comparison, no dark patterns.
 *  - "Keep training free" dismiss at EQUAL visual weight to the trial CTA.
 *  - All LESSONS marked free forever, always.
 *  - Day 39 rides along: "Have an access code?" — the scholarship door.
 *    A redeemed code IS Pro. No second-class markers, ever (pitch promise).
 *
 * Purchases are STUBBED: real store products + RevenueCat SDK + sandbox
 * testing require the EAS build and store accounts (pre-launch list).
 * The buttons say so honestly. Entitlement (my_entitlement/is_premium)
 * is fully live — codes grant real premium today.
 */

const FREE_SIDE = [
  'All LESSONS — every ethics scenario and film. Forever.',
  'Basic boxing pathways + the full Train loop',
  'Basic nutrition + budget recipes + meal plans',
  'The HOPE feed, posting, challenges',
  'Everything progression: XP, levels, belts, streaks, quests',
];

const PRO_SIDE = [
  'Advanced & specialized boxing pathways',
  'Tailored / AI-personalized nutrition',
  'Advanced stats & analytics',
  'AI coach — recommendations + Q&A',
  'Premium community features',
];

type Entitlement = { premium: boolean; source: string | null };

export default function PaywallScreen() {
  const router = useRouter();
  const [ent, setEnt] = useState<Entitlement | null>(null);
  const [codeOpen, setCodeOpen] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useFocusEffect(
    useCallback(() => {
      supabase.rpc('my_entitlement').then(({ data }) => setEnt((data as Entitlement) ?? null));
    }, []),
  );

  const stubPurchase = (product: string) => {
    Alert.alert(
      'Coming with the store build',
      `${product} goes live when the app ships through the app stores (RevenueCat sandbox first). Nothing to pay today — and everything on the free side stays free forever.`,
    );
  };

  const redeem = async () => {
    const trimmed = code.trim();
    if (trimmed.length < 4) return;
    setBusy(true);
    setMessage('');
    const { data, error } = await supabase.rpc('redeem_code', { p_code: trimmed });
    setBusy(false);
    if (error) {
      setMessage(`⚠ ${error.message}`);
      return;
    }
    const d = data as { ok: boolean; reason?: string };
    if (d.ok) {
      setMessage('🎉 Welcome to Pro — the Access & Funding Program has your back.');
      setCode('');
      setCodeOpen(false);
      const { data: fresh } = await supabase.rpc('my_entitlement');
      setEnt((fresh as Entitlement) ?? null);
    } else {
      const reasons: Record<string, string> = {
        invalid_code: 'That code doesn’t exist — check the spelling.',
        expired: 'That code has expired.',
        all_seats_taken: 'All of that code’s seats are taken.',
        already_redeemed: 'You already used this code.',
      };
      setMessage(`⚠ ${reasons[d.reason ?? ''] ?? d.reason}`);
    }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Pressable onPress={() => router.back()} hitSlop={12}>
        <Text style={styles.back}>‹ Back</Text>
      </Pressable>
      <Text style={styles.title}>Free vs Pro</Text>
      <Text style={styles.subtitle}>
        The whole mission is free. Pro is extra depth for those who want it — and for those who
        can&apos;t pay, the Access &amp; Funding Program covers it. Same Pro, no asterisks.
      </Text>

      {ent?.premium && (
        <View style={styles.proBanner}>
          <Text style={styles.proBannerText}>
            💛 You&apos;re Pro{ent.source === 'code' ? ' — Access & Funding Program' : ''}. Everything below is yours.
          </Text>
        </View>
      )}

      {/* The transparent split */}
      <View style={styles.columns}>
        <View style={styles.col}>
          <Text style={styles.colHead}>Free — always</Text>
          {FREE_SIDE.map((f) => (
            <Text key={f} style={styles.colLine}>✓ {f}</Text>
          ))}
        </View>
        <View style={[styles.col, styles.proCol]}>
          <Text style={[styles.colHead, styles.proHead]}>Pro 💰</Text>
          {PRO_SIDE.map((p) => (
            <Text key={p} style={styles.colLine}>★ {p}</Text>
          ))}
        </View>
      </View>

      {!ent?.premium && (
        <>
          {/* Products (stubbed until the store build) */}
          <View style={styles.priceRow}>
            <Pressable style={styles.priceCard} onPress={() => stubPurchase('Monthly ($3.99/mo)')}>
              <Text style={styles.price}>$3.99</Text>
              <Text style={styles.priceMeta}>per month</Text>
            </Pressable>
            <Pressable style={[styles.priceCard, styles.priceBest]} onPress={() => stubPurchase('Yearly ($29.99/yr, 14-day free trial)')}>
              <View style={styles.trialBadge}><Text style={styles.trialText}>14-DAY FREE TRIAL</Text></View>
              <Text style={styles.price}>$29.99</Text>
              <Text style={styles.priceMeta}>per year</Text>
            </Pressable>
            <Pressable style={styles.priceCard} onPress={() => stubPurchase('Lifetime ($99.99 once)')}>
              <Text style={styles.price}>$99.99</Text>
              <Text style={styles.priceMeta}>forever</Text>
            </Pressable>
          </View>

          {/* Equal-weight choices — A6's whole point */}
          <View style={styles.choiceRow}>
            <Pressable style={styles.choiceBtn} onPress={() => stubPurchase('The 14-day trial')}>
              <Text style={styles.choiceText}>Start free trial</Text>
            </Pressable>
            <Pressable style={styles.choiceBtn} onPress={() => router.back()}>
              <Text style={styles.choiceText}>Keep training free</Text>
            </Pressable>
          </View>

          {/* Day 39: the scholarship door */}
          {!codeOpen ? (
            <Pressable onPress={() => setCodeOpen(true)} hitSlop={8}>
              <Text style={styles.codeLink}>Have an access code? 🎟️</Text>
            </Pressable>
          ) : (
            <View style={styles.codeRow}>
              <TextInput
                style={styles.codeInput}
                value={code}
                onChangeText={setCode}
                placeholder="HOPE-XXXXXX"
                placeholderTextColor={theme.colors.muted}
                autoCapitalize="characters"
                autoCorrect={false}
              />
              <Pressable
                style={[styles.redeemBtn, (busy || code.trim().length < 4) && { opacity: 0.5 }]}
                disabled={busy || code.trim().length < 4}
                onPress={redeem}>
                <Text style={styles.redeemText}>{busy ? '…' : 'Redeem'}</Text>
              </Pressable>
            </View>
          )}
        </>
      )}
      {message !== '' && <Text style={styles.message}>{message}</Text>}

      <Text style={styles.footnote}>
        Schools, gyms, and sponsors can fund seat blocks so kids train Pro for free — that&apos;s
        the Access &amp; Funding Program. Ask your coach.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.bg },
  content: { paddingTop: 64, paddingHorizontal: theme.space.md, paddingBottom: theme.space.xl, gap: theme.space.sm },
  back: { fontSize: theme.font.body, color: theme.colors.muted },
  title: { fontSize: theme.font.title, fontWeight: '800', color: theme.colors.text },
  subtitle: { fontSize: theme.font.small, color: theme.colors.muted, lineHeight: 19 },

  proBanner: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.gold,
    borderWidth: 2,
    borderRadius: theme.radius.md,
    padding: theme.space.md,
  },
  proBannerText: { fontSize: theme.font.body, color: theme.colors.gold, fontWeight: '800', textAlign: 'center' },

  columns: { flexDirection: 'row', gap: theme.space.xs },
  col: {
    flex: 1,
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.green,
    borderWidth: 1,
    borderRadius: theme.radius.md,
    padding: theme.space.sm,
    gap: 8,
  },
  proCol: { borderColor: theme.colors.gold },
  colHead: { fontSize: theme.font.small, fontWeight: '800', color: theme.colors.green, textTransform: 'uppercase', letterSpacing: 1 },
  proHead: { color: theme.colors.gold },
  colLine: { fontSize: 12, color: theme.colors.text, lineHeight: 17 },

  priceRow: { flexDirection: 'row', gap: theme.space.xs, marginTop: theme.space.xs },
  priceCard: {
    flex: 1,
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.line,
    borderWidth: 1,
    borderRadius: theme.radius.md,
    paddingVertical: theme.space.md,
    alignItems: 'center',
    gap: 2,
  },
  priceBest: { borderColor: theme.colors.gold },
  trialBadge: { backgroundColor: theme.colors.gold, borderRadius: theme.radius.pill, paddingHorizontal: 6, paddingVertical: 2, marginBottom: 4 },
  trialText: { fontSize: 8, fontWeight: '800', color: '#000', letterSpacing: 0.5 },
  price: { fontSize: theme.font.header, fontWeight: '800', color: theme.colors.text },
  priceMeta: { fontSize: theme.font.small, color: theme.colors.muted },

  choiceRow: { flexDirection: 'row', gap: theme.space.sm, marginTop: theme.space.xs },
  choiceBtn: {
    flex: 1,
    backgroundColor: theme.colors.red,
    borderRadius: theme.radius.lg,
    paddingVertical: 13,
    alignItems: 'center',
  },
  choiceText: { color: '#fff', fontSize: theme.font.body, fontWeight: '800' },

  codeLink: { fontSize: theme.font.body, color: theme.colors.gold, fontWeight: '700', textAlign: 'center', marginTop: theme.space.sm },
  codeRow: { flexDirection: 'row', gap: theme.space.sm, marginTop: theme.space.xs },
  codeInput: {
    flex: 1,
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.gold,
    borderWidth: 1,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.space.md,
    paddingVertical: 10,
    fontSize: theme.font.body,
    color: theme.colors.text,
    fontWeight: '700',
    letterSpacing: 1,
  },
  redeemBtn: { backgroundColor: theme.colors.gold, borderRadius: theme.radius.lg, paddingHorizontal: theme.space.lg, justifyContent: 'center' },
  redeemText: { color: '#000', fontSize: theme.font.body, fontWeight: '800' },
  message: { fontSize: theme.font.body, color: theme.colors.gold, fontWeight: '700', textAlign: 'center' },
  footnote: { fontSize: theme.font.small, color: theme.colors.muted, textAlign: 'center', lineHeight: 18, marginTop: theme.space.sm },
});
