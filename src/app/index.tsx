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
      <Text style={styles.header}>BoxingApp — Day 12 🔔</Text>
      {status !== '' && <Text style={styles.status}>{status}</Text>}
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.title}>{item.title}</Text>
            <Text style={styles.meta}>{item.type} · +{item.xp_value} XP</Text>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 80, paddingHorizontal: 20 },
  header: { fontSize: 24, fontWeight: '700', marginBottom: 16 },
  status: { fontSize: 16, color: '#888', marginBottom: 12 },
  card: { padding: 16, borderRadius: 12, borderWidth: 1, borderColor: '#ddd', marginBottom: 10 },
  title: { fontSize: 17, fontWeight: '600' },
  meta: { fontSize: 13, color: '#666', marginTop: 4 },
});