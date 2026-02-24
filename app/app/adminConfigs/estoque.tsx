import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
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
import { addDoc, collection, doc, getDoc, getDocs, serverTimestamp, updateDoc } from 'firebase/firestore';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { auth, db } from '@/firebaseConfig';
import { ADMIN_EMAILS } from '@/constants/adminEmails';

const BRAND = '#942229';
const DEFAULT_CATEGORIES = ['Churrasco', 'Suínos e Frangos', 'Kits', 'Bebidas'];

export default function EstoqueScreen() {
  const router = useRouter();
  const user = auth.currentUser;

  const [categories, setCategories] = useState<string[]>(DEFAULT_CATEGORIES);

  const [form, setForm] = useState({
    id: '',
    name: '',
    price: '',
    category: DEFAULT_CATEGORIES[0],
    highlights: false,
    stock: '',
  });
  const [saving, setSaving] = useState(false);
  const [prefillLoading, setPrefillLoading] = useState(false);
  const [newCategory, setNewCategory] = useState('');
  const { editId } = useLocalSearchParams<{ editId?: string }>();

  const isAdmin = useMemo(() => {
    const email = user?.email?.toLowerCase();
    return email ? ADMIN_EMAILS.map((e) => e.toLowerCase()).includes(email) : false;
  }, [user]);

  const parseNumber = (value: string) => Number(value.replace(',', '.').trim());

  useEffect(() => {
    if (!isAdmin) {
      Alert.alert('Acesso restrito', 'Você será redirecionado.', [
        {
          text: 'OK',
          onPress: () => router.replace('/'),
        },
      ]);
      return;
    }
  }, [isAdmin, router]);

  useEffect(() => {
    if (!isAdmin) return;

    const loadCategories = async () => {
      try {
        const snap = await getDocs(collection(db, 'produtos'));
        const unique = new Set<string>(DEFAULT_CATEGORIES);
        snap.docs.forEach((d) => {
          const data = d.data();
          const cat = typeof data?.category === 'string' ? data.category.trim() : '';
          if (cat) unique.add(cat);
        });
        const list = Array.from(unique);
        setCategories(list);
        setForm((f) => ({ ...f, category: f.category || list[0] || '' }));
      } catch (err) {
        console.warn('Falha ao carregar categorias', err);
      }
    };

    loadCategories();
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin) return;

    if (!editId) {
      resetForm();
      return;
    }

    const loadProduct = async () => {
      setPrefillLoading(true);
      try {
        const snap = await getDoc(doc(db, 'produtos', String(editId)));
        if (snap.exists()) {
          const data = snap.data();
          const incomingCat = typeof data?.category === 'string' && data.category.trim() ? data.category.trim() : DEFAULT_CATEGORIES[0];
          setCategories((prev) => {
            const exists = prev.some((c) => c.toLowerCase() === incomingCat.toLowerCase());
            return exists ? prev : [...prev, incomingCat];
          });
          setForm({
            id: snap.id,
            name: data?.name ?? '',
            price: data?.price != null ? String(data.price) : '',
            category: incomingCat,
            highlights: Boolean(data?.highlights),
            stock: data?.stock != null ? String(data.stock) : '',
          });
        } else {
          Alert.alert('Produto não encontrado', 'Verifique se ele ainda existe.');
          resetForm();
        }
      } catch (err) {
        Alert.alert('Erro', 'Falha ao carregar produto para edição.');
        resetForm();
      } finally {
        setPrefillLoading(false);
      }
    };

    loadProduct();
  }, [editId, isAdmin]);

  const resetForm = () =>
    setForm({ id: '', name: '', price: '', category: categories[0] ?? DEFAULT_CATEGORIES[0], highlights: false, stock: '' });

  const handleAddCategory = () => {
    const value = newCategory.trim();
    if (!value) return;
    setCategories((prev) => {
      const exists = prev.some((c) => c.toLowerCase() === value.toLowerCase());
      if (exists) return prev;
      return [...prev, value];
    });
    setForm((f) => ({ ...f, category: value }));
    setNewCategory('');
    // Força recarregar a tela para garantir que a nova categoria apareça em todos os componentes
    setTimeout(() => router.replace('/adminConfigs/estoque'), 50);
  };

  const handleRemoveCategory = (cat: string) => {
    Alert.alert('Remover categoria', `Deseja remover "${cat}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Remover',
        style: 'destructive',
        onPress: () => {
          setCategories((prev) => {
            const next = prev.filter((c) => c !== cat);
            if (next.length === 0) return prev; // mantém pelo menos uma
            if (form.category === cat) {
              setForm((f) => ({ ...f, category: next[0] }));
            }
            return next;
          });
        },
      },
    ]);
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.price.trim()) {
      Alert.alert('Atenção', 'Informe nome e preço.');
      return;
    }
    const priceNumber = parseNumber(form.price);
    if (Number.isNaN(priceNumber)) {
      Alert.alert('Atenção', 'Preço inválido.');
      return;
    }

    const stockNumber = form.stock === '' ? 0 : parseNumber(form.stock);
    if (Number.isNaN(stockNumber) || stockNumber < 0) {
      Alert.alert('Atenção', 'Estoque deve ser um número zero ou positivo.');
      return;
    }

    const category = form.category.trim();
    if (!category) {
      Alert.alert('Atenção', 'Informe uma categoria.');
      return;
    }
    setCategories((prev) => {
      const exists = prev.some((c) => c.toLowerCase() === category.toLowerCase());
      return exists ? prev : [...prev, category];
    });

    try {
      setSaving(true);
      if (form.id) {
        await updateDoc(doc(db, 'produtos', form.id), {
          name: form.name.trim(),
          price: priceNumber,
          category,
          highlights: form.highlights,
          stock: stockNumber,
          updatedAt: serverTimestamp(),
        });
      } else {
        await addDoc(collection(db, 'produtos'), {
          name: form.name.trim(),
          price: priceNumber,
          category,
          highlights: form.highlights,
          stock: stockNumber,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      resetForm();
    } catch (err: any) {
      console.error('Erro ao salvar produto', err);
      Alert.alert('Erro', err?.message ?? 'Não foi possível salvar.');
    } finally {
      setSaving(false);
    }
  };

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
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 8, paddingVertical: 4 }}
              >
                {categories.map((cat) => {
                  const selected = form.category === cat;
                  return (
                    <Pressable
                      key={cat}
                      style={[styles.chip, selected && styles.chipSelected]}
                      onPress={() => setForm((f) => ({ ...f, category: cat }))}
                      onLongPress={() => handleRemoveCategory(cat)}
                    >
                      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{cat}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
            <View style={styles.field}>
              <Text style={styles.label}>Estoque</Text>
              <TextInput
                value={form.stock}
                onChangeText={(t) => setForm((f) => ({ ...f, stock: t }))}
                placeholder="Ex: 10"
                keyboardType="number-pad"
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

          <View style={styles.categoryCard}>
            <Text style={styles.formTitle}>Criar ou Remover categorias</Text>
            <View style={styles.addCategoryRow}>
              <TextInput
                value={newCategory}
                onChangeText={setNewCategory}
                placeholder="Nova categoria"
                style={[styles.input, styles.addCategoryInput]}
              />
              <Pressable style={[styles.button, styles.primary, styles.addCategoryButton]} onPress={handleAddCategory}>
                <Text style={styles.buttonText}>Criar</Text>
              </Pressable>
            </View>
            <View style={styles.categoryList}>
              {categories.map((cat) => (
                <View key={cat} style={styles.categoryItem}>
                  <Text style={styles.categoryName}>{cat}</Text>
                  <Pressable
                    style={[styles.button, styles.secondary, styles.removeButton]}
                    onPress={() => handleRemoveCategory(cat)}
                  >
                    <Text style={[styles.buttonText, styles.secondaryText]}>Remover</Text>
                  </Pressable>
                </View>
              ))}
            </View>
          </View>

          {prefillLoading ? <Text style={styles.loading}>Carregando produto...</Text> : null}
          <Text style={styles.helper}>Use a aba Produtos para listar e escolher itens para editar.</Text>
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
  categoryCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#eadfd2',
    gap: 10,
  },
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
  loading: { color: '#6e5a4b' },
  helper: { color: '#6e5a4b', marginTop: -2 },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#f0f0f0',
    borderWidth: 1,
    borderColor: '#d9cfc2',
  },
  chipSelected: {
    backgroundColor: BRAND,
    borderColor: BRAND,
  },
  chipText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#3c2b1e',
  },
  chipTextSelected: {
    color: '#fff',
  },
  addCategoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  addCategoryInput: {
    flex: 1,
  },
  addCategoryButton: {
    paddingHorizontal: 16,
  },
  categoryList: {
    gap: 8,
    marginTop: 4,
  },
  categoryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#eadfd2',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: '#fdfaf6',
  },
  categoryName: {
    fontWeight: '700',
    color: '#2c1b12',
  },
  removeButton: {
    flex: 0,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
});
