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
    </Tabs>
  );
}
