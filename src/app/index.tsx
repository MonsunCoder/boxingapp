import { useAuth } from '@/components/auth/AuthProvider';
import { theme } from '@/constants/theme';
import { useEffect, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { supabase } from '../../lib/supabase';

type ContentItem = {
  id: string;
  title: string;
  type: string;
  xp_value: number;
};

export default function HomeScreen() {
  const { session } = useAuth();
  const [items, setItems] = useState<ContentItem[]>([]);
  const [status, setStatus] = useState('Loading…');

  useEffect(() => {
    supabase
      .from('content_items')
      .select('id, title, type, xp_value')
      .then(({ data, error }) => {
        if (error) setStatus(`Error: ${error.message}`);
        else if (!data || data.length === 0) setStatus('Connected — but no rows found.');
        else {
          setItems(data);
          setStatus('');
        }
      });
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Learn 🥊</Text>
      <Text style={styles.signedIn}>Signed in as {session?.user.email}</Text>
      {status !== '' && <Text style={styles.status}>{status}</Text>}
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.title}>{item.title}</Text>
            <Text style={styles.meta}>
              {item.type} · <Text style={styles.xp}>+{item.xp_value} XP</Text>
            </Text>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.bg,
    paddingTop: 80,
    paddingHorizontal: theme.space.lg,
  },
  header: { fontSize: theme.font.title, fontWeight: '800', color: theme.colors.text },
  signedIn: {
    fontSize: theme.font.small,
    color: theme.colors.muted,
    marginBottom: theme.space.md,
  },
  status: { fontSize: theme.font.body, color: theme.colors.muted, marginBottom: theme.space.sm },
  card: {
    backgroundColor: theme.colors.surface,
    padding: theme.space.md,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.line,
    marginBottom: theme.space.sm,
  },
  title: { fontSize: 17, fontWeight: '600', color: theme.colors.text },
  meta: { fontSize: theme.font.small, color: theme.colors.muted, marginTop: theme.space.xs },
  xp: { color: theme.colors.gold, fontWeight: '700' },
});
