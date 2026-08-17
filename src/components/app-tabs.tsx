import { Tabs } from 'expo-router';
import { Platform, Text } from 'react-native';

import { theme } from '@/constants/theme';

/**
 * Five-tab bottom navigation shell (Day 15).
 * Order: Learn (index) · Train · Progress · Connect · Account.
 *
 * Icons are emoji rendered in a <Text> so they behave identically on iOS,
 * Android, and web without any asset/vector-icon dependency. Active/inactive
 * state is carried by the label tint plus icon opacity.
 *
 * Day 21: `ladder` is a real route but NOT a sixth tab — href: null keeps it
 * out of the tab bar. It is reached one tap deep from the Progress rank card
 * (screen-list decision D7: hub first, ladder behind "See Ladder").
 *
 * Day 22+23: `lesson/[id]` joins it — the lesson page opens from the Learn
 * list and from ladder requirement rows, never from the tab bar.
 *
 * Day 24: `pathway/[id]` — the Journey view, opened from Learn's pathway cards.
 */

function TabIcon({ glyph, focused }: { glyph: string; focused: boolean }) {
  return <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.55 }}>{glyph}</Text>;
}

export default function AppTabs() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.colors.red,
        tabBarInactiveTintColor: theme.colors.muted,
        tabBarStyle: {
          backgroundColor: theme.colors.surface,
          borderTopColor: theme.colors.line,
          borderTopWidth: Platform.OS === 'web' ? 1 : undefined,
        },
        tabBarLabelStyle: { fontSize: theme.font.small },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Learn',
          tabBarIcon: ({ focused }) => <TabIcon glyph="📖" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="train"
        options={{
          title: 'Train',
          tabBarIcon: ({ focused }) => <TabIcon glyph="🥊" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="progress"
        options={{
          title: 'Progress',
          tabBarIcon: ({ focused }) => <TabIcon glyph="📈" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="connect"
        options={{
          title: 'Connect',
          tabBarIcon: ({ focused }) => <TabIcon glyph="👥" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: 'Account',
          tabBarIcon: ({ focused }) => <TabIcon glyph="👤" focused={focused} />,
        }}
      />

      {/* Reachable by navigation, hidden from the tab bar. */}
      <Tabs.Screen name="ladder" options={{ href: null }} />
      <Tabs.Screen name="lesson/[id]" options={{ href: null }} />
      <Tabs.Screen name="pathway/[id]" options={{ href: null }} />
      <Tabs.Screen name="plans" options={{ href: null }} />
      <Tabs.Screen name="post/[id]" options={{ href: null }} />
      <Tabs.Screen name="modqueue" options={{ href: null }} />
    </Tabs>
  );
}
