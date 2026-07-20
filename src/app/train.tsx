import { StyleSheet, Text, View } from 'react-native';

import { theme } from '@/constants/theme';

export default function TrainScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Train</Text>
      <Text style={styles.tagline}>Round timer arrives Day 16 🔔</Text>
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
