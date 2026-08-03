import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { theme } from '@/constants/theme';
import { supabase } from '../../lib/supabase';

/**
 * Day 26 — The Scenario Player. The signature feature, alive.
 *
 * A LESSON scenario is a branching graph (content_items.config.scenario):
 *   nodes: { [id]: { text, choices?: [{label, next}], tone?: 'good'|'bad' } }
 * A node WITH choices is a decision point. A node WITHOUT choices is an
 * ending — its tone colors the card (green: the discipline held; red: the
 * hallway won). EVERY path funnels into the TRUTHFUL reflection, then the
 * completion event. Choosing badly still completes the LESSON — consequences
 * are the teacher here, not the grade. The rank gate only asks that the kid
 * went through it honestly.
 *
 * "Run it back" replays from the top — complete_activity dedupes XP
 * server-side, so replays teach for free without farming.
 *
 * D9 note: with this player live, scenario-equipped ethics items no longer
 * complete through the reading page's button — the scenario IS the gate.
 */

export type ScenarioNode = {
  text: string;
  tone?: 'good' | 'bad';
  choices?: { label: string; next: string }[];
};

export type Scenario = {
  start: string;
  nodes: Record<string, ScenarioNode>;
  reflection: string;
};

type Props = {
  item: { id: string; title: string; xp_value: number };
  scenario: Scenario;
};

type Beat = { nodeId: string; chosen?: string }; // the path walked so far

export default function ScenarioPlayer({ item, scenario }: Props) {
  const router = useRouter();
  const [path, setPath] = useState<Beat[]>([{ nodeId: scenario.start }]);
  const [phase, setPhase] = useState<'playing' | 'reflection' | 'done'>('playing');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState('');

  const current = path[path.length - 1];
  const node = scenario.nodes[current.nodeId];
  const atEnding = !!node && (!node.choices || node.choices.length === 0);

  const choose = (label: string, next: string) => {
    if (!scenario.nodes[next]) return; // malformed data — refuse to walk off the graph
    setPath((p) => [...p.slice(0, -1), { ...p[p.length - 1], chosen: label }, { nodeId: next }]);
  };

  const runItBack = () => {
    setPath([{ nodeId: scenario.start }]);
    setPhase('playing');
  };

  const complete = async () => {
    setBusy(true);
    const { data, error } = await supabase.rpc('complete_activity', {
      p_content_id: item.id,
      p_event_type: 'completion',
      p_client_event_id: `scenario-${item.id}-${Date.now()}`,
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

  if (!node) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>This scenario has a broken step — content needs fixing.</Text>
        <Pressable style={styles.quietBtn} onPress={() => router.back()}>
          <Text style={styles.quietBtnText}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Text style={styles.back}>‹ Back</Text>
        </Pressable>

        <View style={styles.chip}>
          <Text style={styles.chipText}>🕊️ LESSON</Text>
        </View>
        <Text style={styles.title}>{item.title}</Text>

        {/* The path so far — beats the kid already walked, dimmed */}
        {path.slice(0, -1).map((beat, i) => (
          <View key={i} style={styles.pastBeat}>
            <Text style={styles.pastText}>{scenario.nodes[beat.nodeId]?.text}</Text>
            {beat.chosen && <Text style={styles.pastChoice}>▸ {beat.chosen}</Text>}
          </View>
        ))}

        {phase === 'playing' && (
          <>
            {/* The live beat */}
            <View
              style={[
                styles.beat,
                atEnding && node.tone === 'good' && styles.beatGood,
                atEnding && node.tone === 'bad' && styles.beatBad,
              ]}>
              <Text style={styles.beatText}>{node.text}</Text>
            </View>

            {!atEnding &&
              node.choices!.map((c) => (
                <Pressable
                  key={c.next}
                  style={({ pressed }) => [styles.choiceBtn, pressed && styles.pressed]}
                  onPress={() => choose(c.label, c.next)}>
                  <Text style={styles.choiceText}>{c.label}</Text>
                </Pressable>
              ))}

            {atEnding && (
              <Pressable
                style={({ pressed }) => [styles.continueBtn, pressed && styles.pressed]}
                onPress={() => setPhase('reflection')}>
                <Text style={styles.continueText}>Sit with it ›</Text>
              </Pressable>
            )}
          </>
        )}

        {phase !== 'playing' && (
          <>
            {/* Ending stays visible above the reflection */}
            <View
              style={[
                styles.beat,
                node.tone === 'good' && styles.beatGood,
                node.tone === 'bad' && styles.beatBad,
              ]}>
              <Text style={styles.beatText}>{node.text}</Text>
            </View>

            <View style={styles.reflectCard}>
              <Text style={styles.reflectLabel}>TRUTHFUL</Text>
              <Text style={styles.reflectQuestion}>{scenario.reflection}</Text>
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
                  <View style={styles.doneRow}>
                    <Pressable style={styles.quietBtn} onPress={runItBack}>
                      <Text style={styles.quietBtnText}>Run it back ↺</Text>
                    </Pressable>
                    <Pressable style={styles.completeBtn} onPress={() => router.back()}>
                      <Text style={styles.completeText}>Done</Text>
                    </Pressable>
                  </View>
                </>
              )}
            </View>
          </>
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

  pastBeat: { opacity: 0.55, gap: 4 },
  pastText: { fontSize: theme.font.small, color: theme.colors.muted, lineHeight: 18 },
  pastChoice: { fontSize: theme.font.small, color: theme.colors.gold, fontWeight: '700' },

  beat: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.line,
    borderWidth: 1,
    borderRadius: theme.radius.md,
    padding: theme.space.md,
  },
  beatGood: { borderColor: theme.colors.green, borderWidth: 2 },
  beatBad: { borderColor: theme.colors.danger, borderWidth: 2 },
  beatText: { fontSize: theme.font.body, color: theme.colors.text, lineHeight: 23 },

  choiceBtn: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.red,
    borderWidth: 1.5,
    borderRadius: theme.radius.lg,
    paddingVertical: 14,
    paddingHorizontal: theme.space.md,
  },
  choiceText: { fontSize: theme.font.body, color: theme.colors.text, fontWeight: '700', textAlign: 'center' },
  pressed: { opacity: 0.7 },

  continueBtn: {
    backgroundColor: theme.colors.red,
    borderRadius: theme.radius.lg,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: theme.space.xs,
  },
  continueText: { color: '#fff', fontSize: theme.font.body, fontWeight: '800' },

  reflectCard: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.green,
    borderWidth: 1,
    borderRadius: theme.radius.md,
    padding: theme.space.md,
    gap: theme.space.sm,
    marginTop: theme.space.xs,
  },
  reflectLabel: {
    fontSize: theme.font.small,
    color: theme.colors.green,
    fontWeight: '800',
    letterSpacing: 3,
  },
  reflectQuestion: { fontSize: theme.font.body, color: theme.colors.text, fontWeight: '700', lineHeight: 22 },
  reflectHint: { fontSize: theme.font.small, color: theme.colors.muted, fontStyle: 'italic' },

  completeBtn: {
    backgroundColor: theme.colors.red,
    borderRadius: theme.radius.lg,
    paddingVertical: 12,
    paddingHorizontal: theme.space.lg,
    alignItems: 'center',
  },
  completeText: { color: '#fff', fontSize: theme.font.body, fontWeight: '800' },
  resultOk: { fontSize: theme.font.body, color: theme.colors.green, fontWeight: '700' },
  resultError: { fontSize: theme.font.small, color: theme.colors.danger },
  doneRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  quietBtn: {
    backgroundColor: theme.colors.line,
    borderRadius: theme.radius.pill,
    paddingVertical: 10,
    paddingHorizontal: theme.space.lg,
  },
  quietBtnText: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '700' },
});
