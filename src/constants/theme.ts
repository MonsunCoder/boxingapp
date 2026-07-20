/**
 * Design tokens for BoxingApp (Day 15).
 *
 * A single dark theme — colors, radii, spacing, and font sizes — used across
 * every screen. Import `theme` and reference tokens directly:
 *
 *   import { theme } from '@/constants/theme';
 *   backgroundColor: theme.colors.bg
 */

import '@/global.css';

import { Platform } from 'react-native';

export const theme = {
  colors: {
    bg: '#0E0F12', // app background (dark charcoal)
    surface: '#17181C', // cards, tab bar
    line: '#26272C', // borders/dividers
    text: '#F5F5F2', // primary text
    muted: '#9A9AA2', // secondary text
    red: '#E6394B', // primary action (boxing red)
    gold: '#F4B942', // XP, rank, streak highlights
    green: '#3DBE7B', // success / rest phase
    danger: '#FF5A5A', // errors
  },
  radius: { sm: 8, md: 14, lg: 24, pill: 28 },
  space: { xs: 4, sm: 8, md: 16, lg: 24, xl: 36 },
  font: { title: 26, header: 20, body: 16, small: 13 },
} as const;

/* ------------------------------------------------------------------ *
 * Legacy tokens — kept for the Expo starter components that still
 * import them (themed-text, themed-view, collapsible, etc.). Not used
 * by Day 15 screens; leave in place until those files are retired.
 * ------------------------------------------------------------------ */

export const Colors = {
  light: {
    text: '#000000',
    background: '#ffffff',
    backgroundElement: '#F0F0F3',
    backgroundSelected: '#E0E1E6',
    textSecondary: '#60646C',
  },
  dark: {
    text: '#ffffff',
    background: '#000000',
    backgroundElement: '#212225',
    backgroundSelected: '#2E3135',
    textSecondary: '#B0B4BA',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    serif: 'ui-serif',
    rounded: 'ui-rounded',
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
