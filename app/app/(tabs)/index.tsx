import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  FlatList,
  Image,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ProductModal } from "@/components/ProductModal";
import { db } from "@/firebaseConfig";
import type { Product } from "@/types/Product";
import { collection, getDocs } from "firebase/firestore";
import { addOrIncrementItem, getCart } from "@/storage/cart";
import { styles } from "./index.styles";

type ProductWithCategory = Product & { category?: string | null };

const normalize = (value: string | null | undefined) =>
  value?.toString().normalize("NFD").replace(/\p{Diacritic}/gu, "").trim().toLowerCase() || "";

export default function HomeScreen() {
  const [query, setQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [products, setProducts] = useState<ProductWithCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cartCount, setCartCount] = useState(0);
  const [cartMessage, setCartMessage] = useState<string | null>(null);

  const categories = useMemo(
    () => [
      { id: "Churrasco", name: "Churrasco" },
      { id: "Suínos e Frangos", name: "Suínos e Frangos" },
      { id: "Kits", name: "Kits" },
      { id: "Bebidas", name: "Bebidas" },
    ],
    []
  );

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
    syncCart();

    async function fetchProducts() {
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
          };
        });

        setProducts(list);
      } catch (err) {
        if (active) {
          setError("Erro ao buscar produtos. Tente novamente.");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

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

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return products.filter((p) => {
      const matchesQuery = normalizedQuery
        ? p.name.toLowerCase().includes(normalizedQuery)
        : true;
      const matchesCategory = selectedCategory
        ? normalize(p.category) === normalize(selectedCategory)
        : true;
      return matchesQuery && matchesCategory;
    });
  }, [products, query, selectedCategory]);

  const handleAddToCart = async (product: Product, quantity = 1) => {
    try {
      const updated = await addOrIncrementItem(product, quantity);
      const total = updated.reduce((sum, item) => sum + item.qty, 0);
      setCartCount(total);
      setCartMessage(`${product.name} adicionado ao carrinho`);
      setTimeout(() => setCartMessage(null), 1800);
      setModalVisible(false);
    } catch (err) {
      Alert.alert("Erro", "Não foi possível adicionar ao carrinho. Tente novamente.");
    }
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

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.searchWrap}>
          <TextInput
            placeholder="Buscar produtos..."
            placeholderTextColor="#8a8a8a"
            value={query}
            onChangeText={setQuery}
            style={styles.search}
          />
        </View>

        <View style={styles.cartInfoRow}>
          <Text style={styles.cartInfo}>Carrinho: {cartCount} item(s)</Text>
          {cartMessage ? <Text style={styles.cartMessage}>{cartMessage}</Text> : null}
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
            const selected = selectedCategory === item.id;
            return (
              <Pressable
                style={[styles.categoryChip, selected && styles.categoryChipSelected]}
                onPress={() =>
                  setSelectedCategory((prev) => (prev === item.id ? null : item.id))
                }
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
          <Text style={styles.sectionTitle}>Destaques</Text>
          <Pressable>
            <Text style={styles.link}>Ver todos</Text>
          </Pressable>
        </View>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        {loading ? (
          <Text style={styles.loadingText}>Carregando produtos...</Text>
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(item) => item.id}
            scrollEnabled={false}
            ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
            ListEmptyComponent={
              !loading ? (
                <Text style={styles.emptyText}>Nenhum produto encontrado.</Text>
              ) : null
            }
            renderItem={({ item }) => (
              <View style={styles.card}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>{item.name}</Text>
                  <Text style={styles.cardPrice}>R$ {item.price.toFixed(2)}</Text>
                </View>

                <Pressable
                  style={styles.addBtn}
                  onPress={() => {
                    setSelectedProduct(item);
                    setModalVisible(true);
                  }}
                >
                  <Text style={styles.addBtnText}>Adicionar</Text>
                </Pressable>
              </View>
            )}
          />
        )}

        <ProductModal
          visible={modalVisible}
          product={selectedProduct}
          onClose={() => setModalVisible(false)}
          onAdd={(product, qty) => handleAddToCart(product, qty)}
        />
      </ScrollView>
    </View>
  );
}
