import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, Modal, Pressable, RefreshControl, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { collection, deleteDoc, doc, getDocs } from 'firebase/firestore';
import { useRouter } from 'expo-router';

import { isAdminEmail } from '@/constants/auth/adminEmails';
import { BRAND_PRIMARY } from '@/constants/ui/colors';
import { auth, db } from '@/config/firebase';
import type { Product } from '@/types/Product';
import { getExpiryMeta, toDisplayExpiryDate } from '@/utils/expiry';

const BRAND = BRAND_PRIMARY;
type ExpiryFilter = 'all' | 'warning' | 'expired';

const getExpiryStatus = (expiryDate?: string | null) => {
  const meta = getExpiryMeta(expiryDate);
  if (meta.diffDays === null) {
    return { label: 'Validade: -', expired: false, warning: false };
  }

  const diffDays = meta.diffDays;

  if (diffDays < 0) {
    return { label: 'Validade: Vencido', expired: true, warning: false };
  }

  if (diffDays === 0) {
    return { label: 'Validade: Vence hoje', expired: false, warning: true };
  }

  if (diffDays === 1) {
    return { label: 'Validade: 1 dia', expired: false, warning: true };
  }

  return {
    label: `Validade: ${diffDays} dias`,
    expired: false,
    warning: diffDays < 30,
  };
};

const formatExpiryDate = (expiryDate?: string | null) => {
  return toDisplayExpiryDate(expiryDate) || '-';
};

export default function EstoqueScreen() {
  const router = useRouter();
  const user = auth.currentUser;
  const { width } = useWindowDimensions();
  const isCompact = width < 390;

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState<Product | null>(null);
  const [optionsVisible, setOptionsVisible] = useState(false);
  const [activeFilter, setActiveFilter] = useState<ExpiryFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const isAdmin = useMemo(() => {
    return isAdminEmail(user?.email);
  }, [user]);

  const loadProducts = useCallback(async () => {
    try {
      const snap = await getDocs(collection(db, 'produtos'));
      const list: Product[] = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          name: data?.name ?? 'Produto',
          price: Number(data?.price) || 0,
          category: data?.category ?? '-',
          highlights: Boolean(data?.highlights),
          stock: Number(data?.stock ?? 0),
          expiryDate: typeof data?.expiryDate === 'string' ? data.expiryDate : null,
          createdAt: data?.createdAt ?? null,
          updatedAt: data?.updatedAt ?? null,
        };
      });
      setProducts(list);
    } catch {
      Alert.alert('Erro', 'Falha ao carregar produtos.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

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
    loadProducts();
  }, [isAdmin, loadProducts, router]);

  useFocusEffect(
    useCallback(() => {
      if (!isAdmin) return;
      setRefreshing(true);
      loadProducts();
    }, [isAdmin, loadProducts])
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadProducts();
  }, [loadProducts]);

  const summary = useMemo(() => {
    return products.reduce(
      (acc, product) => {
        const expiryStatus = getExpiryStatus(product.expiryDate);

        acc.total += 1;

        if (expiryStatus.expired) {
          acc.expired += 1;
        } else if (expiryStatus.warning) {
          acc.warning += 1;
        }

        return acc;
      },
      { total: 0, warning: 0, expired: 0 }
    );
  }, [products]);

  const statusFilteredProducts = useMemo(() => {
    if (activeFilter === 'all') {
      return products;
    }

    return products.filter((product) => {
      const expiryStatus = getExpiryStatus(product.expiryDate);

      if (activeFilter === 'expired') {
        return expiryStatus.expired;
      }

      return expiryStatus.warning && !expiryStatus.expired;
    });
  }, [activeFilter, products]);

  const filteredProducts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return statusFilteredProducts;

    return statusFilteredProducts.filter((product) => {
      return product.name.toLowerCase().includes(q) || (product.category || '').toLowerCase().includes(q);
    });
  }, [searchQuery, statusFilteredProducts]);

  const openOptions = (item: Product) => {
    setSelected(item);
    setOptionsVisible(true);
  };

  const closeOptions = () => {
    setOptionsVisible(false);
    setSelected(null);
  };

  const handleEdit = () => {
    if (!selected) return;
    closeOptions();
    router.push({ pathname: '/adminConfigs/produtos', params: { editId: selected.id } });
  };

  const handleDelete = () => {
    if (!selected) return;
    Alert.alert('Excluir produto', `Deseja excluir "${selected.name}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteDoc(doc(db, 'produtos', selected.id));
            await loadProducts();
            closeOptions();
          } catch {
            Alert.alert('Erro', 'Não foi possível excluir.');
          }
        },
      },
    ]);
  };

  const renderItem = ({ item }: { item: Product }) => {
    const expiryStatus = getExpiryStatus(item.expiryDate);
    const outOfStock = (item.stock ?? 0) <= 0;
    const cardStyle = expiryStatus.expired
      ? styles.cardExpired
      : expiryStatus.warning
        ? styles.cardWarning
        : null;

    return (
      <Pressable style={[styles.card, cardStyle]} onPress={() => openOptions(item)}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.cardTitle}>{item.name}</Text>
          <Text style={styles.cardMeta}>Categoria: {item.category || '-'}</Text>
          <Text style={styles.cardMeta}>Destaque: {item.highlights ? 'Sim' : 'Não'}</Text>
          <Text style={[styles.cardMeta, outOfStock && styles.cardMetaAlert]}>
            Estoque: {outOfStock ? 'Sem estoque' : item.stock ?? 0}
          </Text>
          <Text
            style={[
              styles.cardMeta,
              (expiryStatus.expired || expiryStatus.warning) && styles.cardMetaAlert,
              expiryStatus.warning && !expiryStatus.expired && styles.cardMetaWarning,
            ]}>
            {expiryStatus.label}
          </Text>
          {activeFilter !== 'all' && item.expiryDate ? (
            <Text style={styles.cardMeta}>Data de validade: {formatExpiryDate(item.expiryDate)}</Text>
          ) : null}
          <Text style={styles.cardPrice}>R$ {item.price.toFixed(2)}</Text>
        </View>
        <Text style={styles.editHint}>Editar</Text>
      </Pressable>
    );
  };

  if (!isAdmin) {
    return null;
  }

  return (
    <SafeAreaView style={[styles.safe, isCompact && styles.safeCompact]} edges={["top", "bottom"]}>
      <View style={[styles.headerRow, isCompact && styles.headerRowCompact]}>
        <Text style={styles.title}>Estoque</Text>
        <Pressable style={[styles.button, styles.primary, isCompact && styles.headerButtonCompact]} onPress={() => router.push('/adminConfigs/produtos')}>
          <Text style={styles.buttonText}>Novo</Text>
        </Pressable>
      </View>

      <View style={[styles.summaryRow, isCompact && styles.summaryRowCompact]}>
        <Pressable
          style={[styles.summaryCard, isCompact && styles.summaryCardCompact, activeFilter === 'all' && styles.summaryCardActive]}
          onPress={() => setActiveFilter('all')}>
          <Text style={styles.summaryLabel}>Total</Text>
          <Text style={styles.summaryValue}>{summary.total}</Text>
        </Pressable>
        <Pressable
          style={[
            styles.summaryCard,
            isCompact && styles.summaryCardCompact,
            styles.summaryWarningCard,
            activeFilter === 'warning' && styles.summaryCardActive,
          ]}
          onPress={() => setActiveFilter('warning')}>
          <Text style={styles.summaryLabel}>A vencer</Text>
          <Text style={styles.summaryValue}>{summary.warning}</Text>
        </Pressable>
        <Pressable
          style={[
            styles.summaryCard,
            isCompact && styles.summaryCardCompact,
            styles.summaryExpiredCard,
            activeFilter === 'expired' && styles.summaryCardActive,
          ]}
          onPress={() => setActiveFilter('expired')}>
          <Text style={styles.summaryLabel}>Vencidos</Text>
          <Text style={styles.summaryValue}>{summary.expired}</Text>
        </Pressable>
      </View>

      <Text style={styles.filterHint}>
        {activeFilter === 'all'
          ? 'Exibindo todos os itens de estoque.'
          : activeFilter === 'warning'
            ? 'Exibindo somente itens de estoque a vencer.'
            : 'Exibindo somente itens de estoque vencidos.'}
      </Text>

      <TextInput
        style={styles.searchInput}
        value={searchQuery}
        onChangeText={setSearchQuery}
        placeholder="Buscar por nome ou categoria"
        placeholderTextColor="#967f6d"
        autoCapitalize="none"
      />

      {loading ? (
        <Text style={styles.loading}>Carregando...</Text>
      ) : (
        <FlatList
          data={filteredProducts}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          contentContainerStyle={[
            styles.listContent,
            filteredProducts.length === 0 && styles.listContentEmpty,
          ]}
          ListEmptyComponent={<Text style={styles.emptyText}>Nenhum item de estoque encontrado nesse filtro.</Text>}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        />
      )}

      <Modal transparent visible={optionsVisible} animationType="fade" onRequestClose={closeOptions}>
        <View style={styles.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={closeOptions} />
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{selected?.name ?? 'Produto'}</Text>
            <View style={[styles.modalButtons, isCompact && styles.modalButtonsCompact]}>
              <Pressable style={[styles.button, styles.secondary, styles.modalButton]} onPress={handleEdit}>
                <Text style={[styles.buttonText, styles.secondaryText]}>Editar</Text>
              </Pressable>
              <Pressable style={[styles.button, styles.primary, styles.modalButton]} onPress={handleDelete}>
                <Text style={styles.buttonText}>Excluir</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#faf6f0', padding: 16 },
  safeCompact: { paddingHorizontal: 12, paddingVertical: 10 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  headerRowCompact: {
    gap: 10,
    flexWrap: 'wrap',
    alignItems: 'flex-start',
  },
  headerButtonCompact: { alignSelf: 'flex-start' },
  title: { fontSize: 22, fontWeight: '800', color: '#2c1b12' },
  button: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primary: { backgroundColor: BRAND },
  secondary: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: BRAND,
  },
  buttonText: { fontWeight: '800', color: '#fff' },
  secondaryText: { color: BRAND },
  loading: { color: '#6e5a4b' },
  listContent: { paddingBottom: 24 },
  summaryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 14,
  },
  summaryRowCompact: { gap: 8 },
  summaryCard: {
    flex: 1,
    minWidth: 96,
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: '#eadfd2',
  },
  summaryCardCompact: { minWidth: '48%', flexGrow: 1 },
  summaryCardActive: {
    borderWidth: 2,
    borderColor: '#2c1b12',
  },
  summaryWarningCard: {
    backgroundColor: '#fff7d6',
    borderColor: '#e5c24d',
  },
  summaryExpiredCard: {
    backgroundColor: '#fde2e2',
    borderColor: '#e48d8d',
  },
  summaryLabel: {
    color: '#6e5a4b',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 4,
  },
  summaryValue: {
    color: '#2c1b12',
    fontSize: 22,
    fontWeight: '800',
  },
  filterHint: {
    color: '#6e5a4b',
    marginBottom: 12,
    fontWeight: '600',
  },
  searchInput: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2d2c4',
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#2c1b12',
    marginBottom: 12,
  },
  listContentEmpty: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  emptyText: {
    textAlign: 'center',
    color: '#6e5a4b',
    fontWeight: '600',
  },
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
  cardWarning: {
    backgroundColor: '#fff7d6',
    borderColor: '#e5c24d',
  },
  cardExpired: {
    backgroundColor: '#fde2e2',
    borderColor: '#e48d8d',
  },
  cardTitle: { fontWeight: '800', fontSize: 15, color: '#2c1b12' },
  cardMeta: { color: '#6e5a4b' },
  cardMetaAlert: { color: BRAND, fontWeight: '800' },
  cardMetaWarning: { color: '#8a6a00' },
  cardPrice: { color: BRAND, fontWeight: '800', marginTop: 4 },
  editHint: { color: BRAND, fontWeight: '700' },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalCard: {
    width: '100%',
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: '#eadfd2',
  },
  modalTitle: { fontSize: 16, fontWeight: '800', color: '#2c1b12' },
  modalButtons: { flexDirection: 'row', gap: 10 },
  modalButtonsCompact: { flexDirection: 'column' },
  modalButton: { flex: 1, paddingVertical: 12 },
});
