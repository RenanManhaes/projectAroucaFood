import React, { useCallback, useEffect, useMemo, useState } from "react";
import { BlurView } from "expo-blur";
import {
  Alert,
  FlatList,
  Image,
  Modal,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ProductModal } from "@/components/ProductModal";
import { db } from "@/config/firebase";
import type { Product } from "@/types/Product";
import { collection, getDocs } from "firebase/firestore";
import { addOrIncrementItem, getCart } from "@/services/cart/cart";
import { styles } from "@/styles/index.styles";
import { getProductImage } from "@/constants/media/productImages";

type ProductWithCategory = Product & { category?: string | null };
type Category = { id: string; name: string };

const DEFAULT_CATEGORIES = [
  "Churrasco",
  "Suínos e Frangos",
  "Bebidas",
  "Cervejas",
  "Espetos",
  "Itens para churrasco",
  "Hamburguer",
  "Acompanhamentos",
  "Kits",
];

const mapDefaultCategories = (): Category[] => DEFAULT_CATEGORIES.map((c) => ({ id: c, name: c }));

const normalize = (value: string | null | undefined) =>
  value?.toString().normalize("NFD").replace(/\p{Diacritic}/gu, "").trim().toLowerCase() || "";

export default function HomeScreen() {
  const [query, setQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [products, setProducts] = useState<ProductWithCategory[]>([]);
  const [categories, setCategories] = useState<Category[]>(mapDefaultCategories());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cartCount, setCartCount] = useState(0);
  const [cartSuccessMessage, setCartSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    if (selectedCategory && !categories.some((c) => normalize(c.id) === normalize(selectedCategory))) {
      setSelectedCategory(null);
    }
  }, [categories, selectedCategory]);

  useEffect(() => {
    let active = true;

    const loadCategories = async () => {
      try {
        const snap = await getDocs(collection(db, "categorias"));
        if (!active) return;

        const fetched: Category[] = snap.docs
          .map((d) => {
            const data = d.data();
            const name = typeof data?.nome === "string" ? data.nome.trim() : typeof data?.name === "string" ? data.name.trim() : "";
            return name ? { id: d.id, name } : null;
          })
          .filter(Boolean) as Category[];

        const unique = new Map<string, Category>();
        mapDefaultCategories().forEach((cat) => unique.set(normalize(cat.name), cat));
        fetched.forEach((cat) => {
          const key = normalize(cat.name);
          if (!unique.has(key)) unique.set(key, cat);
        });

        setCategories(Array.from(unique.values()));
      } catch (err) {
        console.warn("Falha ao carregar categorias", err);
        setCategories(mapDefaultCategories());
      }
    };

    loadCategories();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    const syncCart = async () => {
      try {
        const items = await getCart();
        if (!active) return;
        const total = items.reduce((sum, item) => sum + item.qty, 0);
        setCartCount(total);
      } catch (err) {
        console.warn("Falha ao carregar carrinho", err);
      }
    };

    const fetchProducts = async () => {
      setLoading(true);
      setError(null);

      try {
        const snapshot = await getDocs(collection(db, "produtos"));
        if (!active) return;

        const list: ProductWithCategory[] = snapshot.docs.map((doc) => {
          const data = doc.data();
          return {
            id: doc.id,
            name: data?.name ?? "Produto sem nome",
            price: Number(data?.price) || 0,
            category: data?.category ?? null,
            image: typeof data?.image === "string" ? data.image : null,
            highlights: Boolean(data?.highlights),
            stock: Number(data?.stock ?? 0),
            expiryDate: typeof data?.expiryDate === "string" ? data.expiryDate : null,
            createdAt: data?.createdAt ?? null,
            updatedAt: data?.updatedAt ?? null,
          };
        });

        setProducts(list);
      } catch {
        if (active) {
          setError("Erro ao buscar produtos. Tente novamente.");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    syncCart();
    fetchProducts();

    return () => {
      active = false;
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      let active = true;

      const syncCart = async () => {
        try {
          const items = await getCart();
          if (!active) return;
          const total = items.reduce((sum, item) => sum + item.qty, 0);
          setCartCount(total);
        } catch (err) {
          console.warn("Falha ao carregar carrinho", err);
        }
      };

      syncCart();

      return () => {
        active = false;
      };
    }, [])
  );

  const filteredProducts = useMemo(() => {
    const normalizedQuery = normalize(query);
    return products.filter((product) => {
      const matchesQuery = normalizedQuery
        ? normalize(product.name).includes(normalizedQuery) || normalize(product.category).includes(normalizedQuery)
        : true;
      const matchesCategory = selectedCategory
        ? normalize(product.category) === normalize(selectedCategory)
        : true;

      return matchesQuery && matchesCategory;
    });
  }, [products, query, selectedCategory]);

  const highlightedProducts = useMemo(
    () => filteredProducts.filter((product) => product.highlights),
    [filteredProducts]
  );

  const hasActiveFilters = Boolean(query.trim()) || Boolean(selectedCategory);

  const clearFilters = () => {
    setQuery("");
    setSelectedCategory(null);
  };

  const openProduct = (product: ProductWithCategory) => {
    setSelectedProduct(product);
    setModalVisible(true);
  };

  const handleAddToCart = async (product: Product, quantity = 1) => {
    try {
      const available = typeof product.stock === "number" ? Math.max(0, product.stock) : undefined;
      const currentItems = await getCart();
      const currentQty = currentItems.find((item) => item.productId === product.id)?.qty ?? 0;

      if (available !== undefined && available <= 0) {
        Alert.alert("Indisponível", "Produto sem estoque no momento.");
        return;
      }

      const quantityToAdd =
        available !== undefined ? Math.min(quantity, Math.max(available - currentQty, 0)) : quantity;

      if (quantityToAdd <= 0) {
        Alert.alert("Limite atingido", "A quantidade máxima disponível desse item já está no carrinho.");
        return;
      }

      const updated = await addOrIncrementItem(product, quantityToAdd);
      const total = updated.reduce((sum, item) => sum + item.qty, 0);
      const adjustedByStock = quantityToAdd < quantity;

      setCartCount(total);
      setCartSuccessMessage(
        adjustedByStock
          ? `Adicionamos ${quantityToAdd} unidade(s) de ${product.name} conforme o estoque disponível.`
          : `${product.name} adicionado ao carrinho com sucesso.`
      );
      setModalVisible(false);
        } catch {
      Alert.alert("Erro", "Não foi possível adicionar ao carrinho. Tente novamente.");
    }
  };

  const renderPromoItem = ({ item }: { item: ProductWithCategory }) => {
    const imageSource = getProductImage(item.image);
    const isUnavailable = (item.stock ?? 0) <= 0;

    return (
      <BlurView intensity={60} tint="light" style={styles.promoCard}>
        {imageSource ? (
          <Image source={imageSource} style={styles.promoImage} resizeMode="cover" />
        ) : null}

        <View style={styles.promoContent}>
          <View style={styles.promoHeaderRow}>
            <Text style={styles.promoBadge}>Promoção</Text>
            <Text style={styles.stockText}>{isUnavailable ? "Sem estoque" : "Disponível"}</Text>
          </View>

          <Text style={styles.cardTitle} numberOfLines={2}>
            {item.name}
          </Text>
          <Text style={styles.cardPrice}>R$ {item.price.toFixed(2)}</Text>

          <Pressable
            style={[styles.addBtn, isUnavailable && styles.disabledButton]}
            disabled={isUnavailable}
            onPress={() => openProduct(item)}
          >
            <Text style={styles.addBtnText}>{isUnavailable ? "Indisponível" : "Ver mais"}</Text>
          </Pressable>
        </View>
      </BlurView>
    );
  };

  const renderProductItem = ({ item }: { item: ProductWithCategory }) => {
    const imageSource = getProductImage(item.image);
    const isUnavailable = (item.stock ?? 0) <= 0;

    return (
      <BlurView intensity={35} tint="light" style={styles.card}>
        {imageSource ? (
          <Image source={imageSource} style={styles.cardImage} resizeMode="cover" />
        ) : null}

        <View style={styles.cardContent}>
          <Text style={styles.cardTitle} numberOfLines={2}>
            {item.name}
          </Text>
          <Text style={styles.cardMeta}>{item.category || "Sem categoria"}</Text>
          <Text style={styles.cardPrice}>R$ {item.price.toFixed(2)}</Text>
          <Text style={styles.stockText}>{isUnavailable ? "Sem estoque" : "Disponível"}</Text>
        </View>

        <Pressable
          style={[styles.addBtn, isUnavailable && styles.disabledButton]}
          disabled={isUnavailable}
          onPress={() => openProduct(item)}
        >
          <Text style={styles.addBtnText}>{isUnavailable ? "Indisponível" : "Ver mais"}</Text>
        </Pressable>
      </BlurView>
    );
  };

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.headerSafe} edges={["top"]}>
        <View style={styles.header}>
          <Image
            source={require("@/assets/images/logo-emporio-arouca.png")}
            style={styles.headerLogo}
            resizeMode="contain"
          />
        </View>
      </SafeAreaView>

      <FlatList
        data={filteredProducts}
        keyExtractor={(item) => item.id}
        renderItem={renderProductItem}
        ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <>
            <View style={styles.searchWrap}>
              <TextInput
                placeholder="Buscar por nome ou categoria..."
                placeholderTextColor="#8a8a8a"
                value={query}
                onChangeText={setQuery}
                style={styles.search}
              />
            </View>

            <View style={styles.summaryCard}>
              <View style={styles.summaryRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.summaryTitle}>Compra inteligente</Text>
                  <Text style={styles.summaryText}>
                    {cartCount === 0
                      ? "Seu carrinho está vazio no momento."
                      : `Seu carrinho tem ${cartCount} item(ns).`}
                  </Text>
                  <Text style={styles.summaryText}>
                    {filteredProducts.length} produto(s) encontrado(s)
                    {selectedCategory ? ` em ${selectedCategory}` : ""}.
                  </Text>
                </View>

                {hasActiveFilters ? (
                  <Pressable style={styles.clearFiltersBtn} onPress={clearFilters}>
                    <Text style={styles.clearFiltersText}>Limpar filtros</Text>
                  </Pressable>
                ) : null}
              </View>

            </View>

            <Text style={styles.sectionTitle}>Categorias</Text>
            <FlatList
              data={categories}
              keyExtractor={(item) => item.id}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.categoriesRow}
              ItemSeparatorComponent={() => <View style={{ width: 10 }} />}
              renderItem={({ item }) => {
                const selected = selectedCategory === item.name;
                return (
                  <Pressable
                    style={[styles.categoryChip, selected && styles.categoryChipSelected]}
                    onPress={() => setSelectedCategory((prev) => (prev === item.name ? null : item.name))}
                  >
                    <Text
                      style={[styles.categoryChipText, selected && styles.categoryChipTextSelected]}
                    >
                      {item.name}
                    </Text>
                  </Pressable>
                );
              }}
            />

            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Promoções</Text>
              <Text style={styles.link}>{highlightedProducts.length} item(ns)</Text>
            </View>

            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            {loading ? (
              <Text style={styles.loadingText}>Carregando produtos...</Text>
            ) : highlightedProducts.length > 0 ? (
              <FlatList
                data={highlightedProducts}
                keyExtractor={(item) => `promo-${item.id}`}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.promoListContent}
                ItemSeparatorComponent={() => <View style={{ width: 12 }} />}
                renderItem={renderPromoItem}
              />
            ) : (
              <Text style={styles.emptyText}>Nenhum produto em promoção para os filtros atuais.</Text>
            )}

            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Todos os produtos</Text>
              <Text style={styles.link}>
                {hasActiveFilters ? "Resultados filtrados" : "Catálogo completo"}
              </Text>
            </View>
          </>
        }
        ListEmptyComponent={
          !loading ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>Nenhum produto encontrado.</Text>
              <Text style={styles.emptyHint}>
                Tente buscar sem acentos, limpar os filtros ou escolher outra categoria.
              </Text>
            </View>
          ) : null
        }
      />

      <ProductModal
        visible={modalVisible}
        product={selectedProduct}
        onClose={() => setModalVisible(false)}
        onAdd={(product, qty) => handleAddToCart(product, qty)}
      />

      <Modal
        visible={!!cartSuccessMessage}
        transparent
        animationType="fade"
        onRequestClose={() => setCartSuccessMessage(null)}
      >
        <View style={styles.feedbackBackdrop}>
          <View style={styles.feedbackCard}>
            <View style={styles.feedbackIconWrap}>
              <Ionicons name="checkmark" size={26} color="#fff" />
            </View>
            <Text style={styles.feedbackTitle}>Item adicionado</Text>
            <Text style={styles.feedbackText}>{cartSuccessMessage || "Produto adicionado com sucesso."}</Text>
            <Pressable style={styles.feedbackButton} onPress={() => setCartSuccessMessage(null)}>
              <Text style={styles.feedbackButtonText}>Fechar</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}
