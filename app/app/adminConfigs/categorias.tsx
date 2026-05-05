import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { addDoc, collection, deleteDoc, doc, getDocs, serverTimestamp, updateDoc } from 'firebase/firestore';

import { auth, db } from '@/config/firebase';
import { isAdminEmail } from '@/constants/auth/adminEmails';
import { BRAND_PRIMARY } from '@/constants/ui/colors';

const BRAND = BRAND_PRIMARY;
const DEFAULT_CATEGORIES = [
  'Churrasco',
  'Suínos e Frangos',
  'Bebidas',
  'Cervejas',
  'Espetos',
  'Itens para churrasco',
  'Hamburguer',
  'Acompanhamentos',
  'Kits',
];

type Category = { id: string; name: string; isDefault?: boolean };

const mapDefaultCategories = (): Category[] =>
  DEFAULT_CATEGORIES.map((name) => ({ id: `default-${name}`, name, isDefault: true }));

export default function CategoriasScreen() {
  const user = auth.currentUser;
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [newCategory, setNewCategory] = useState('');
  const [renameTarget, setRenameTarget] = useState<Category | null>(null);

  const isAdmin = useMemo(() => isAdminEmail(user?.email), [user]);

  const loadCategories = useCallback(async () => {
    try {
      const snap = await getDocs(collection(db, 'categorias'));
      const fetched: Category[] = snap.docs
        .map((d) => {
          const data = d.data();
          const name =
            typeof data?.nome === 'string'
              ? data.nome.trim()
              : typeof data?.name === 'string'
                ? data.name.trim()
                : '';
          return name ? { id: d.id, name } : null;
        })
        .filter(Boolean) as Category[];

      const unique = new Map<string, Category>();
      [...fetched, ...mapDefaultCategories()].forEach((cat) => {
        const key = cat.name.toLowerCase();
        if (!unique.has(key)) unique.set(key, cat);
      });

      const list = Array.from(unique.values()).sort((a, b) =>
        a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' })
      );
      setCategories(list);
    } catch {
      Alert.alert('Erro', 'Não foi possível carregar categorias.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    void loadCategories();
  }, [isAdmin, loadCategories]);

  const handleAddCategory = async () => {
    const value = newCategory.trim();
    if (!value) return;

    if (renameTarget) {
      const duplicate = categories.some(
        (c) => c.id !== renameTarget.id && c.name.toLowerCase() === value.toLowerCase()
      );
      if (duplicate) {
        Alert.alert('Atenção', 'Já existe uma categoria com esse nome.');
        return;
      }

      try {
        if (!renameTarget.id.startsWith('default-')) {
          await updateDoc(doc(db, 'categorias', renameTarget.id), {
            nome: value,
            updatedAt: serverTimestamp(),
          });
        }
        setRenameTarget(null);
        setNewCategory('');
        await loadCategories();
      } catch {
        Alert.alert('Erro', 'Não foi possível renomear a categoria.');
      }
      return;
    }

    try {
      const exists = categories.some((c) => c.name.toLowerCase() === value.toLowerCase());
      if (exists) {
        Alert.alert('Atenção', 'Essa categoria já existe.');
        return;
      }

      await addDoc(collection(db, 'categorias'), {
        nome: value,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setNewCategory('');
      await loadCategories();
    } catch {
      Alert.alert('Erro', 'Não foi possível criar a categoria.');
    }
  };

  const handleRemoveCategory = (cat: Category) => {
    if (cat.id.startsWith('default-')) {
      Alert.alert('Não permitido', 'Categorias padrão não podem ser removidas.');
      return;
    }

    Alert.alert('Remover categoria', `Deseja remover "${cat.name}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Remover',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteDoc(doc(db, 'categorias', cat.id));
            await loadCategories();
          } catch {
            Alert.alert('Erro', 'Não foi possível remover a categoria.');
          }
        },
      },
    ]);
  };

  if (!isAdmin) return null;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Categorias</Text>
        <Text style={styles.subtitle}>Gerencie as categorias do catálogo</Text>
      </View>

      <View style={styles.formCard}>
        <TextInput
          value={newCategory}
          onChangeText={setNewCategory}
          placeholder={renameTarget ? 'Novo nome da categoria' : 'Nova categoria'}
          style={styles.input}
        />
        <View style={styles.formActions}>
          {renameTarget ? (
            <Pressable
              style={[styles.button, styles.secondaryButton]}
              onPress={() => {
                setRenameTarget(null);
                setNewCategory('');
              }}
            >
              <Text style={[styles.buttonText, styles.secondaryText]}>Cancelar</Text>
            </Pressable>
          ) : null}
          <Pressable style={[styles.button, styles.primaryButton]} onPress={handleAddCategory}>
            <Text style={styles.buttonText}>{renameTarget ? 'Salvar nome' : 'Criar'}</Text>
          </Pressable>
        </View>
      </View>

      <FlatList
        data={categories}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => {
          setRefreshing(true);
          void loadCategories();
        }} />}
        ListEmptyComponent={!loading ? <Text style={styles.emptyText}>Nenhuma categoria encontrada.</Text> : null}
        renderItem={({ item }) => (
          <View style={styles.categoryItem}>
            <View style={{ flex: 1 }}>
              <Text style={styles.categoryName}>{item.name}</Text>
              {item.id.startsWith('default-') ? <Text style={styles.defaultTag}>Padrão</Text> : null}
            </View>
            <View style={styles.rowActions}>
              <Pressable
                style={[styles.button, styles.secondaryButton, styles.smallButton]}
                onPress={() => {
                  setRenameTarget(item);
                  setNewCategory(item.name);
                }}
              >
                <Text style={[styles.buttonText, styles.secondaryText]}>Renomear</Text>
              </Pressable>
              {!item.id.startsWith('default-') ? (
                <Pressable
                  style={[styles.button, styles.primaryButton, styles.smallButton]}
                  onPress={() => handleRemoveCategory(item)}
                >
                  <Text style={styles.buttonText}>Remover</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#faf6f0', padding: 16 },
  headerRow: { marginBottom: 12 },
  title: { fontSize: 22, fontWeight: '800', color: '#2c1b12' },
  subtitle: { color: '#6e5a4b', marginTop: 2 },
  formCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#eadfd2',
    gap: 10,
    marginBottom: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: '#d9cfc2',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 10,
    backgroundColor: '#fdfaf6',
  },
  formActions: { flexDirection: 'row', gap: 8, justifyContent: 'flex-end' },
  listContent: { paddingBottom: 24, gap: 8 },
  emptyText: { color: '#6e5a4b', textAlign: 'center', marginTop: 24 },
  categoryItem: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#eadfd2',
    padding: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  categoryName: { color: '#2c1b12', fontWeight: '700', fontSize: 14 },
  defaultTag: { marginTop: 2, color: '#8b7867', fontSize: 11, fontWeight: '700' },
  rowActions: { flexDirection: 'row', gap: 6 },
  button: {
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButton: { backgroundColor: BRAND },
  secondaryButton: { borderWidth: 1, borderColor: BRAND, backgroundColor: '#fff' },
  smallButton: { paddingVertical: 8 },
  buttonText: { color: '#fff', fontWeight: '800' },
  secondaryText: { color: BRAND },
});
