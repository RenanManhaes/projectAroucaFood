import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  ScrollView,
  Pressable,
  FlatList,
} from "react-native";
import { ProductModal } from "@/components/ProductModal";

type Category = { id: string; name: string };
import type { Product } from "@/types/Product";

export default function HomeScreen() {
  const [query, setQuery] = useState("");
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  const categories: Category[] = useMemo(
    () => [
      { id: "bebidas", name: "Bebidas" },
      { id: "mercearia", name: "Mercearia" },
      { id: "frios", name: "Frios" },
      { id: "doces", name: "Doces" },
    ],
    []
  );

  const featured: Product[] = useMemo(
    () => [
      { id: "p1", name: "Cerveja Heineken 600ml", price: 12 },
      { id: "p2", name: "Queijo Gouda (200g)", price: 25 },
      { id: "p3", name: "Picanha Selecionada 1,1 Kg", price: 189.99 },
    ],
    []
  );

  const filtered = featured.filter((p) =>
    p.name.toLowerCase().includes(query.trim().toLowerCase())
  );

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Empório Arouca</Text>
      </View>

      <View style={styles.searchWrap}>
        <TextInput
          placeholder="Buscar produtos..."
          placeholderTextColor="#8a8a8a"
          value={query}
          onChangeText={setQuery}
          style={styles.search}
        />
      </View>

      <View style={styles.banner}>
        <Text style={styles.bannerTitle}>Ofertas do dia</Text>
        <Text style={styles.bannerSubtitle}>
          Produtos selecionados com preço especial.
        </Text>

        <Pressable style={styles.bannerBtn}>
          <Text style={styles.bannerBtnText}>Ver promoções</Text>
        </Pressable>
      </View>

      <Text style={styles.sectionTitle}>Categorias</Text>
      <View style={styles.categoriesRow}>
        {categories.map((c) => (
          <Pressable key={c.id} style={styles.categoryChip}>
            <Text style={styles.categoryChipText}>{c.name}</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Destaques</Text>
        <Pressable>
          <Text style={styles.link}>Ver todos</Text>
        </Pressable>
      </View>

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
      <ProductModal
        visible={modalVisible}
        product={selectedProduct}
        onClose={() => setModalVisible(false)}
      />
    </ScrollView>
  );
}

const BRAND = "#7B2D2D"; // tom vinho/marrom aproximado do logo

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#F7F5F2" },
  content: { padding: 16, paddingBottom: 28 },

  header: {
    alignItems: "center",
    paddingVertical: 16,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: "800",
    color: BRAND,
    marginTop: 28,
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
    marginTop: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionTitle: { marginTop: 18, fontSize: 18, fontWeight: "800", color: "#111" },
  link: { color: BRAND, fontWeight: "700" },

  categoriesRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 10,
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
