import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { theme } from '@/constants/theme';

/**
 * Day 37 — Settings & Reminders.
 *
 * Notifications are LOCAL and gentle by policy (SPEC): a morning quest nudge
 * and an evening streak guard, each a single daily notification the kid opts
 * into. No engagement-bait, no streak-shaming copy. Prefs live on-device
 * (AsyncStorage) because local notifications are scheduled on-device.
 *
 * Community-reply PUSH notifications need a server sender (push_tokens table
 * is ready) — that ships with the Edge Function pass, noted in SPEC.
 *
 * Expo Go caveat (dev builds only): scheduled notifications may not fire in
 * Expo Go, especially on Android (SDK 53+ removed support). The scheduling
 * code is real and correct; reliable delivery arrives with the EAS dev build
 * already planned for Apple Sign-In. The banner below says so honestly.
 */

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

type Prefs = { questReminder: boolean; streakReminder: boolean };
const PREFS_KEY = 'notificationPrefs';

const QUEST_ID_KEY = 'notifId_quest';
const STREAK_ID_KEY = 'notifId_streak';

export default function SettingsScreen() {
  const router = useRouter();
  const [prefs, setPrefs] = useState<Prefs>({ questReminder: false, streakReminder: false });
  const [permission, setPermission] = useState<string>('unknown');
  const [message, setMessage] = useState('');

  useFocusEffect(
    useCallback(() => {
      (async () => {
        const raw = await AsyncStorage.getItem(PREFS_KEY);
        if (raw) setPrefs(JSON.parse(raw));
        const p = await Notifications.getPermissionsAsync();
        setPermission(p.status);
      })();
    }, []),
  );

  const ensurePermission = async (): Promise<boolean> => {
    const current = await Notifications.getPermissionsAsync();
    if (current.status === 'granted') {
      setPermission('granted');
      return true;
    }
    const asked = await Notifications.requestPermissionsAsync();
    setPermission(asked.status);
    return asked.status === 'granted';
  };

  const savePrefs = async (next: Prefs) => {
    setPrefs(next);
    await AsyncStorage.setItem(PREFS_KEY, JSON.stringify(next));
  };

  const scheduleDaily = async (idKey: string, title: string, body: string, hour: number) => {
    const existing = await AsyncStorage.getItem(idKey);
    if (existing) await Notifications.cancelScheduledNotificationAsync(existing).catch(() => {});
    const id = await Notifications.scheduleNotificationAsync({
      content: { title, body },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour, minute: 0 },
    });
    await AsyncStorage.setItem(idKey, id);
  };

  const cancelScheduled = async (idKey: string) => {
    const existing = await AsyncStorage.getItem(idKey);
    if (existing) {
      await Notifications.cancelScheduledNotificationAsync(existing).catch(() => {});
      await AsyncStorage.removeItem(idKey);
    }
  };

  const toggleQuest = async (on: boolean) => {
    setMessage('');
    if (on && !(await ensurePermission())) return;
    if (on) {
      await scheduleDaily(
        QUEST_ID_KEY,
        'Today’s quests are up 🥊',
        'Three small wins waiting. Grab one before the day gets loud.',
        9,
      );
    } else {
      await cancelScheduled(QUEST_ID_KEY);
    }
    await savePrefs({ ...prefs, questReminder: on });
  };

  const toggleStreak = async (on: boolean) => {
    setMessage('');
    if (on && !(await ensurePermission())) return;
    if (on) {
      await scheduleDaily(
        STREAK_ID_KEY,
        'Keep the flame 🔥',
        'A few minutes tonight keeps the streak alive. One drill counts.',
        19,
      );
    } else {
      await cancelScheduled(STREAK_ID_KEY);
    }
    await savePrefs({ ...prefs, streakReminder: on });
  };

  const sendTest = async () => {
    setMessage('');
    if (!(await ensurePermission())) return;
    await Notifications.scheduleNotificationAsync({
      content: { title: 'Test bell 🔔', body: 'Notifications are working. Back to training.' },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 5 },
    });
    setMessage('✓ Test scheduled — should arrive in ~5 seconds (background the app to see it).');
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Pressable onPress={() => router.back()} hitSlop={12}>
        <Text style={styles.back}>‹ Account</Text>
      </Pressable>
      <Text style={styles.title}>Settings & Reminders</Text>

      {__DEV__ && (
        <View style={styles.devNote}>
          <Text style={styles.devNoteText}>
            🛠 DEV BUILD: in Expo Go (especially Android) scheduled notifications may not deliver —
            the code is real; reliable delivery comes with the EAS development build.
          </Text>
        </View>
      )}

      <Text style={styles.sectionTitle}>Gentle reminders</Text>
      <Text style={styles.sectionBlurb}>
        One nudge each, once a day, only if you want them. Never more.
      </Text>

      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text style={styles.rowTitle}>Morning quests · 9:00</Text>
          <Text style={styles.rowMeta}>“Today’s quests are up” — the day’s three small wins.</Text>
        </View>
        <Switch
          value={prefs.questReminder}
          onValueChange={toggleQuest}
          trackColor={{ true: theme.colors.red, false: theme.colors.line }}
        />
      </View>

      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text style={styles.rowTitle}>Evening streak guard · 19:00</Text>
          <Text style={styles.rowMeta}>“Keep the flame” — a heads-up before the day ends.</Text>
        </View>
        <Switch
          value={prefs.streakReminder}
          onValueChange={toggleStreak}
          trackColor={{ true: theme.colors.red, false: theme.colors.line }}
        />
      </View>

      <Pressable style={styles.testBtn} onPress={sendTest}>
        <Text style={styles.testText}>Send a test notification</Text>
      </Pressable>
      {message !== '' && <Text style={styles.message}>{message}</Text>}
      <Text style={styles.permLine}>
        System permission: {permission === 'granted' ? '✓ granted' : permission}
      </Text>

      <Text style={styles.sectionTitle}>Coming later</Text>
      <Text style={styles.sectionBlurb}>
        Reply notifications from the HOPE feed arrive with the server push build. Coach messages,
        same. Both will respect the same gentle-by-policy rule.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.bg },
  content: { paddingTop: 64, paddingHorizontal: theme.space.md, paddingBottom: theme.space.xl, gap: theme.space.sm },
  back: { fontSize: theme.font.body, color: theme.colors.muted },
  title: { fontSize: theme.font.title, fontWeight: '800', color: theme.colors.text },

  devNote: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.gold,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: theme.radius.md,
    padding: theme.space.sm,
  },
  devNoteText: { fontSize: 12, color: theme.colors.gold, lineHeight: 17 },

  sectionTitle: {
    fontSize: theme.font.header,
    fontWeight: '700',
    color: theme.colors.text,
    marginTop: theme.space.sm,
  },
  sectionBlurb: { fontSize: theme.font.small, color: theme.colors.muted },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.sm,
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.line,
    borderWidth: 1,
    borderRadius: theme.radius.md,
    padding: theme.space.md,
  },
  rowTitle: { fontSize: theme.font.body, fontWeight: '700', color: theme.colors.text },
  rowMeta: { fontSize: theme.font.small, color: theme.colors.muted, marginTop: 2 },

  testBtn: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.line,
    borderWidth: 1,
    borderRadius: theme.radius.lg,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: theme.space.xs,
  },
  testText: { fontSize: theme.font.body, color: theme.colors.text, fontWeight: '700' },
  message: { fontSize: theme.font.small, color: theme.colors.green, fontWeight: '700' },
  permLine: { fontSize: theme.font.small, color: theme.colors.muted },
});
