import React, { useMemo, useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  ScrollView,
  Pressable,
  FlatList,
  Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ProductModal } from "@/components/ProductModal";
import type { Product } from "@/types/Product";
import { db } from "@/firebaseConfig";
import { collection, getDocs } from "firebase/firestore";

const BRAND = "#942229";

export default function HomeScreen() {
  const [query, setQuery] = useState("");
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const categories = useMemo(
    () => [
      { id: "churrasco", name: "Churrasco" },
      { id: "suinos_e_frangos", name: "Suínos e Frangos" },
      { id: "kits", name: "Kits" },
      { id: "bebidas", name: "Bebidas" },
    ],
    []
  );

  useEffect(() => {
    async function fetchProducts() {
      setLoading(true);
      setError(null);
      try {
        const querySnapshot = await getDocs(collection(db, "produtos"));
        const list: Product[] = [];
        querySnapshot.forEach((doc) => {
          const data = doc.data();
          list.push({
            id: doc.id,
            name: data.name,
            price: data.price,
          });
        });
        setProducts(list);
      } catch (e: any) {
        setError("Erro ao buscar produtos. Tente novamente.");
      } finally {
        setLoading(false);
      }
    }
    fetchProducts();
  }, []);

  const filtered = products.filter((p) =>
    p.name.toLowerCase().includes(query.trim().toLowerCase())
  );

  return (
    <View style={styles.container}>
      {/* HEADER FULL WIDTH */}
      <SafeAreaView style={styles.headerSafe} edges={["top"]}>
        <View style={styles.header}>
          <Image
            source={require("@/assets/images/logo-emporio-arouca.png")}
            style={styles.headerLogo}
            resizeMode="contain"
          />
        </View>
      </SafeAreaView>
      {/* CONTEÚDO COM PADDING */}
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
        {/* Desativei por enquanto, talvez mais pra frente eu reative
        <View style={styles.banner}>
          <Text style={styles.bannerTitle}>Ofertas do dia</Text>
          <Text style={styles.bannerSubtitle}>
            Produtos selecionados com preço especial.
          </Text>
          
          <Pressable style={styles.bannerBtn}>
            <Text style={styles.bannerBtnText}>Ver promoções</Text>
          </Pressable>
        </View>
          */}
        <Text style={styles.sectionTitle}>Categorias</Text>
        <FlatList
          data={categories}
          keyExtractor={(item) => item.id}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoriesRow}
          ItemSeparatorComponent={() => <View style={{ width: 10 }} />}
          renderItem={({ item }) => (
            <Pressable style={styles.categoryChip}>
              <Text style={styles.categoryChipText}>{item.name}</Text>
            </Pressable>
          )}
        />

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Destaques</Text>
          <Pressable>
            <Text style={styles.link}>Ver todos</Text>
          </Pressable>
        </View>

        {loading ? (
          <Text style={{ textAlign: "center", marginVertical: 24 }}>Carregando produtos...</Text>
        ) : error ? (
          <Text style={{ color: "#b00", textAlign: "center", marginVertical: 24 }}>{error}</Text>
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(item) => item.id}
            scrollEnabled={false}
            ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
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
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F7F5F2",
  },
  headerSafe: {
    backgroundColor: BRAND,
  },
  header: {
    width: "100%",
    height: 90,
    backgroundColor: BRAND,
    justifyContent: "center",
    alignItems: "center",
  },
  headerLogo: {
    width: "200%",
    height: 60,
  },
  content: {
    padding: 16,
    paddingBottom: 28,
  },

  searchWrap: { marginTop: 8 },
  search: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: "#E7E2DA",
    fontSize: 16,
    color: "#111",
  },

  banner: {
    marginTop: 14,
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: "#E7E2DA",
  },
  bannerTitle: { fontSize: 18, fontWeight: "700", color: "#111" },
  bannerSubtitle: { marginTop: 6, color: "#444", lineHeight: 20 },
  bannerBtn: {
    marginTop: 12,
    alignSelf: "flex-start",
    backgroundColor: BRAND,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
  },
  bannerBtnText: { color: "#fff", fontWeight: "700" },

  sectionHeader: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 48,
    marginVertical: 8,
  },
  sectionTitle: { marginTop: 18, fontSize: 20, fontWeight: "800", color: "#111" }, // fonte maior
  link: { color: BRAND, fontWeight: "700" },

  categoriesRow: {
    flexDirection: "row",
    marginTop: 10,
    paddingRight: 8,
  },
  categoryChip: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E7E2DA",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 999,
  },
  categoryChipText: { fontWeight: "700", color: "#222" },

  card: {
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E7E2DA",
    borderRadius: 18,
    padding: 14,
  },
  cardTitle: { fontSize: 16, fontWeight: "800", color: "#111" },
  cardPrice: { marginTop: 6, fontSize: 15, fontWeight: "700", color: BRAND },

  addBtn: {
    backgroundColor: BRAND,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
  },
  addBtnText: { color: "#fff", fontWeight: "800" },
});
