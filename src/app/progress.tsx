import { StyleSheet, Text, View } from 'react-native';

import { theme } from '@/constants/theme';

export default function ProgressScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Progress</Text>
      <Text style={styles.tagline}>XP, ranks, and streaks land soon 📈</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.space.lg,
    gap: theme.space.sm,
  },
  title: { fontSize: theme.font.title, fontWeight: '800', color: theme.colors.text },
  tagline: { fontSize: theme.font.body, color: theme.colors.muted, textAlign: 'center' },
});
