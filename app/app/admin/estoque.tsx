import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  addDoc,
  collection,
  doc,
  getDocs,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import { useRouter } from 'expo-router';
import { auth, db } from '@/firebaseConfig';
import { ADMIN_EMAILS } from '@/constants/adminEmails';
import type { Product } from '@/types/Product';

const BRAND = '#942229';

export default function EstoqueScreen() {
  const router = useRouter();
  const user = auth.currentUser;

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    id: '',
    name: '',
    price: '',
    category: '',
    highlights: false,
  });
  const [saving, setSaving] = useState(false);

  const isAdmin = useMemo(() => {
    const email = user?.email?.toLowerCase();
    return email ? ADMIN_EMAILS.map((e) => e.toLowerCase()).includes(email) : false;
  }, [user]);

  useEffect(() => {
    if (!isAdmin) {
      Alert.alert('Acesso restrito', 'Você será redirecionado.', [
        {
          text: 'OK',
          onPress: () => router.replace('/(tabs)'),
        },
      ]);
      return;
    }

    const load = async () => {
      setLoading(true);
      try {
        const snap = await getDocs(collection(db, 'produtos'));
        const list: Product[] = snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            name: data?.name ?? 'Produto',
            price: Number(data?.price) || 0,
            category: data?.category ?? '',
            highlights: Boolean(data?.highlights),
            createdAt: data?.createdAt ?? null,
            updatedAt: data?.updatedAt ?? null,
          };
        });
        setProducts(list);
      } catch (err) {
        Alert.alert('Erro', 'Falha ao carregar produtos.');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [isAdmin, router]);

  const handleEdit = (p: Product) => {
    setForm({
      id: p.id,
      name: p.name,
      price: String(p.price),
      category: p.category ?? '',
      highlights: Boolean(p.highlights),
    });
  };

  const resetForm = () =>
    setForm({ id: '', name: '', price: '', category: '', highlights: false });

  const handleSave = async () => {
    if (!form.name.trim() || !form.price.trim()) {
      Alert.alert('Atenção', 'Informe nome e preço.');
      return;
    }
    const priceNumber = Number(form.price.replace(',', '.'));
    if (Number.isNaN(priceNumber)) {
      Alert.alert('Atenção', 'Preço inválido.');
      return;
    }

    try {
      setSaving(true);
      if (form.id) {
        await updateDoc(doc(db, 'produtos', form.id), {
          name: form.name.trim(),
          price: priceNumber,
          category: form.category.trim(),
          highlights: form.highlights,
          updatedAt: serverTimestamp(),
        });
      } else {
        await addDoc(collection(db, 'produtos'), {
          name: form.name.trim(),
          price: priceNumber,
          category: form.category.trim(),
          highlights: form.highlights,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      resetForm();
      // reload
      const snap = await getDocs(collection(db, 'produtos'));
      const list: Product[] = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          name: data?.name ?? 'Produto',
          price: Number(data?.price) || 0,
          category: data?.category ?? '',
          highlights: Boolean(data?.highlights),
          createdAt: data?.createdAt ?? null,
          updatedAt: data?.updatedAt ?? null,
        };
      });
      setProducts(list);
    } catch (err) {
      Alert.alert('Erro', 'Não foi possível salvar.');
    } finally {
      setSaving(false);
    }
  };

  const renderItem = ({ item }: { item: Product }) => (
    <Pressable style={styles.card} onPress={() => handleEdit(item)}>
      <View style={{ flex: 1 }}>
        <Text style={styles.cardTitle}>{item.name}</Text>
        <Text style={styles.cardMeta}>Categoria: {item.category || '-'} • Destaque: {item.highlights ? 'Sim' : 'Não'}</Text>
        <Text style={styles.cardPrice}>R$ {item.price.toFixed(2)}</Text>
      </View>
      <Text style={styles.editHint}>Editar</Text>
    </Pressable>
  );

  if (!isAdmin) {
    return null;
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>Estoque</Text>
          <Text style={styles.subtitle}>Edite ou crie produtos rapidamente.</Text>

          <View style={styles.formCard}>
            <Text style={styles.formTitle}>{form.id ? 'Editar produto' : 'Novo produto'}</Text>
            <View style={styles.field}>
              <Text style={styles.label}>Nome</Text>
              <TextInput
                value={form.name}
                onChangeText={(t) => setForm((f) => ({ ...f, name: t }))}
                placeholder="Nome do produto"
                style={styles.input}
              />
            </View>
            <View style={styles.field}>
              <Text style={styles.label}>Preço</Text>
              <TextInput
                value={form.price}
                onChangeText={(t) => setForm((f) => ({ ...f, price: t }))}
                placeholder="Ex: 79.90"
                keyboardType="decimal-pad"
                style={styles.input}
              />
            </View>
            <View style={styles.field}>
              <Text style={styles.label}>Categoria</Text>
              <TextInput
                value={form.category}
                onChangeText={(t) => setForm((f) => ({ ...f, category: t }))}
                placeholder="Ex: Churrasco"
                style={styles.input}
              />
            </View>
            <View style={[styles.field, styles.switchRow]}>
              <Text style={styles.label}>Destaque (Promoções)</Text>
              <Switch
                value={form.highlights}
                onValueChange={(v) => setForm((f) => ({ ...f, highlights: v }))}
                trackColor={{ true: BRAND, false: '#ccc' }}
                thumbColor={form.highlights ? '#fff' : '#f4f3f4'}
              />
            </View>

            <View style={styles.actionsRow}>
              <Pressable style={[styles.button, styles.secondary]} onPress={resetForm} disabled={saving}>
                <Text style={[styles.buttonText, styles.secondaryText]}>Limpar</Text>
              </Pressable>
              <Pressable style={[styles.button, styles.primary]} onPress={handleSave} disabled={saving}>
                <Text style={styles.buttonText}>{saving ? 'Salvando...' : form.id ? 'Atualizar' : 'Criar'}</Text>
              </Pressable>
            </View>
          </View>

          <Text style={styles.listTitle}>Produtos</Text>
          {loading ? (
            <Text style={styles.loading}>Carregando...</Text>
          ) : (
            <FlatList
              data={products}
              keyExtractor={(item) => item.id}
              renderItem={renderItem}
              ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
              scrollEnabled={false}
            />
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#faf6f0' },
  content: { padding: 16, paddingBottom: 24, gap: 14 },
  title: { fontSize: 22, fontWeight: '800', color: '#2c1b12' },
  subtitle: { color: '#6e5a4b' },
  formCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#eadfd2',
    gap: 10,
  },
  formTitle: { fontWeight: '800', color: '#2c1b12' },
  field: { gap: 6 },
  label: { fontWeight: '700', color: '#3c2b1e' },
  input: {
    borderWidth: 1,
    borderColor: '#d9cfc2',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 10,
    backgroundColor: '#fdfaf6',
  },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  actionsRow: { flexDirection: 'row', gap: 10 },
  button: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primary: { backgroundColor: BRAND },
  primaryText: { color: '#fff' },
  secondary: { borderWidth: 1, borderColor: BRAND, backgroundColor: 'transparent' },
  secondaryText: { color: BRAND },
  buttonText: { fontWeight: '800', color: '#fff' },
  listTitle: { fontWeight: '800', fontSize: 16, color: '#2c1b12' },
  loading: { color: '#6e5a4b' },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#eadfd2',
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },
  cardTitle: { fontWeight: '800', fontSize: 15, color: '#2c1b12' },
  cardMeta: { color: '#6e5a4b' },
  cardPrice: { color: BRAND, fontWeight: '800', marginTop: 4 },
  editHint: { color: BRAND, fontWeight: '700' },
});
