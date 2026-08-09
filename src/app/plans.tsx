import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/components/auth/AuthProvider';
import { theme } from '@/constants/theme';
import { supabase } from '../../lib/supabase';

/**
 * Day 31 — Meal Plans (the Level 8 "Meal Plan Customizer", basic form).
 *
 * Decided design: PICK-A-PLAN TEMPLATES. Pre-built budget weekly menus
 * (cut / maintain / build) the kid browses and saves as "my plan". No
 * personal data is collected — saving copies the template into meal_plans.
 *
 * The "Tailored plan" card is the PAID placeholder (pitch split: tailored/AI
 * nutrition is Pro). It marks where premium sits; the real paywall arrives
 * Day 38, the real AI tailoring with the coach build. Level-gating this
 * screen (L8) arrives with the unlocks pass.
 *
 * Content is placeholder like everything else — menus get punched up by the
 * client (he knows what his kids' kitchens actually hold).
 */

type PlanDay = { day: string; meals: Record<string, string> };
type Template = {
  id: string;
  title: string;
  goal: 'cut' | 'maintain' | 'build';
  budget_tier: string;
  description: string | null;
  days: PlanDay[];
  sort_order: number;
};
type MyPlan = { id: string; config: { template_id?: string; title?: string; days?: PlanDay[] } };

const GOAL_LABEL: Record<string, string> = {
  cut: '⚖️ Make weight',
  maintain: '🔁 Hold steady',
  build: '🧱 Build',
};

const MEAL_ORDER = ['breakfast', 'lunch', 'dinner', 'snack'];

export default function PlansScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const [templates, setTemplates] = useState<Template[] | null>(null);
  const [myPlan, setMyPlan] = useState<MyPlan | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    const [{ data: tpl }, { data: mine }] = await Promise.all([
      supabase.from('meal_plan_templates').select('*').order('sort_order'),
      supabase
        .from('meal_plans')
        .select('id, config')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    setTemplates((tpl as Template[]) ?? []);
    setMyPlan((mine as MyPlan) ?? null);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const adopt = async (t: Template) => {
    if (!session) return;
    setBusy(true);
    setMessage('');
    // One active plan: clear previous saves, then copy the template in.
    await supabase.from('meal_plans').delete().eq('user_id', session.user.id);
    const { error } = await supabase.from('meal_plans').insert({
      user_id: session.user.id,
      config: { template_id: t.id, title: t.title, goal: t.goal, days: t.days },
      is_ai_generated: false,
    });
    setBusy(false);
    if (error) {
      setMessage(`⚠ ${error.message}`);
      return;
    }
    setMessage(`✓ ${t.title} is now your plan`);
    await load();
  };

  if (!templates) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={theme.colors.gold} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Pressable onPress={() => router.back()} hitSlop={12}>
        <Text style={styles.back}>‹ Learn</Text>
      </Pressable>
      <Text style={styles.title}>Meal Plans</Text>
      <Text style={styles.subtitle}>
        Cheap, real food in a weekly rhythm. Pick the week that matches your goal.
      </Text>

      {/* My plan */}
      {myPlan?.config?.title && (
        <View style={styles.myPlanCard}>
          <Text style={styles.myPlanLabel}>MY PLAN</Text>
          <Text style={styles.myPlanTitle}>🍽️ {myPlan.config.title}</Text>
          <Text style={styles.meta}>Tap the same plan below to review it any time.</Text>
        </View>
      )}
      {message !== '' && <Text style={styles.message}>{message}</Text>}

      {/* Templates */}
      {templates.map((t) => {
        const open = openId === t.id;
        const isMine = myPlan?.config?.template_id === t.id;
        return (
          <View key={t.id} style={[styles.card, isMine && styles.cardMine]}>
            <Pressable
              style={({ pressed }) => [styles.cardHead, pressed && styles.pressed]}
              onPress={() => setOpenId(open ? null : t.id)}>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>{t.title}</Text>
                <Text style={styles.meta}>
                  {GOAL_LABEL[t.goal] ?? t.goal} · budget-friendly{isMine ? '  ·  ✓ my plan' : ''}
                </Text>
                {t.description ? <Text style={styles.cardDesc}>{t.description}</Text> : null}
              </View>
              <Text style={styles.chevron}>{open ? '▾' : '▸'}</Text>
            </Pressable>

            {open && (
              <View style={styles.week}>
                {t.days.map((d) => (
                  <View key={d.day} style={styles.dayRow}>
                    <Text style={styles.dayName}>{d.day}</Text>
                    <View style={{ flex: 1 }}>
                      {MEAL_ORDER.filter((m) => d.meals[m]).map((m) => (
                        <Text key={m} style={styles.mealLine}>
                          <Text style={styles.mealLabel}>{m}: </Text>
                          {d.meals[m]}
                        </Text>
                      ))}
                    </View>
                  </View>
                ))}
                <Pressable
                  style={[styles.adoptBtn, (busy || isMine) && styles.btnOff]}
                  disabled={busy || isMine}
                  onPress={() => adopt(t)}>
                  <Text style={styles.adoptText}>
                    {isMine ? '✓ This is my plan' : busy ? 'Saving…' : 'Make this my plan'}
                  </Text>
                </Pressable>
              </View>
            )}
          </View>
        );
      })}

      {/* Paid tailored plan — placeholder (pitch split: AI nutrition is Pro) */}
      <View style={styles.proCard}>
        <Text style={styles.proTitle}>💰 Tailored Plan — Pro</Text>
        <Text style={styles.meta}>
          A plan built around your goals, schedule, and kitchen — coming with the AI coach. This is
          where Pro begins; everything above stays free forever.
        </Text>
        <View style={styles.proBadge}>
          <Text style={styles.proBadgeText}>COMING SOON · PRO</Text>
        </View>
      </View>
    </ScrollView>
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
  center: { flex: 1, backgroundColor: theme.colors.bg, alignItems: 'center', justifyContent: 'center' },
  back: { fontSize: theme.font.body, color: theme.colors.muted },
  title: { fontSize: theme.font.title, fontWeight: '800', color: theme.colors.text },
  subtitle: { fontSize: theme.font.small, color: theme.colors.muted },
  message: { fontSize: theme.font.small, color: theme.colors.green, fontWeight: '700' },

  myPlanCard: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.gold,
    borderWidth: 2,
    borderRadius: theme.radius.md,
    padding: theme.space.md,
    gap: 4,
  },
  myPlanLabel: { fontSize: theme.font.small, color: theme.colors.muted, letterSpacing: 2, fontWeight: '700' },
  myPlanTitle: { fontSize: theme.font.header, fontWeight: '800', color: theme.colors.gold },

  card: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.line,
    borderWidth: 1,
    borderRadius: theme.radius.md,
  },
  cardMine: { borderColor: theme.colors.gold },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: theme.space.sm, padding: theme.space.md },
  pressed: { opacity: 0.75 },
  cardTitle: { fontSize: theme.font.body, fontWeight: '800', color: theme.colors.text },
  cardDesc: { fontSize: theme.font.small, color: theme.colors.muted, marginTop: 4 },
  meta: { fontSize: theme.font.small, color: theme.colors.muted, marginTop: 2 },
  chevron: { fontSize: 18, color: theme.colors.muted },

  week: {
    borderTopWidth: 1,
    borderTopColor: theme.colors.line,
    padding: theme.space.md,
    gap: theme.space.sm,
  },
  dayRow: { flexDirection: 'row', gap: theme.space.sm },
  dayName: { width: 42, fontSize: theme.font.small, fontWeight: '800', color: theme.colors.gold },
  mealLine: { fontSize: theme.font.small, color: theme.colors.text, lineHeight: 18 },
  mealLabel: { color: theme.colors.muted, textTransform: 'capitalize' },
  adoptBtn: {
    backgroundColor: theme.colors.red,
    borderRadius: theme.radius.lg,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: theme.space.xs,
  },
  btnOff: { backgroundColor: theme.colors.line },
  adoptText: { color: '#fff', fontSize: theme.font.body, fontWeight: '800' },

  proCard: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.line,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: theme.radius.md,
    padding: theme.space.md,
    gap: theme.space.sm,
    marginTop: theme.space.sm,
    opacity: 0.85,
  },
  proTitle: { fontSize: theme.font.body, fontWeight: '800', color: theme.colors.text },
  proBadge: {
    alignSelf: 'flex-start',
    backgroundColor: theme.colors.line,
    borderRadius: theme.radius.pill,
    paddingHorizontal: theme.space.md,
    paddingVertical: 4,
  },
  proBadgeText: { fontSize: theme.font.small, color: theme.colors.muted, fontWeight: '800', letterSpacing: 1 },
});
