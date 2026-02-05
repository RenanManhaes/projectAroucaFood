import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { SafeAreaView } from "react-native-safe-area-context";
import { getCart, setQuantity, removeItem, clearCart, type CartItem } from "@/storage/cart";

const BRAND = "#942229";

export default function CartScreen() {
  const [items, setItems] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const data = await getCart();
    setItems(data);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  useEffect(() => {
    load();
  }, [load]);

  const total = items.reduce((sum, item) => sum + item.price * item.qty, 0);

  const handleQty = async (productId: string, qty: number) => {
    const updated = await setQuantity(productId, Math.max(0, qty));
    setItems(updated);
  };

  const handleRemove = async (productId: string) => {
    const updated = await removeItem(productId);
    setItems(updated);
  };

  const handleClear = async () => {
    await clearCart();
    setItems([]);
  };

  const renderItem = ({ item }: { item: CartItem }) => (
    <View style={styles.card}>
      <View style={{ flex: 1 }}>
        <Text style={styles.cardTitle}>{item.name}</Text>
        <Text style={styles.cardCategory}>{item.category || ""}</Text>
        <Text style={styles.cardPrice}>R$ {item.price.toFixed(2)}</Text>
      </View>

      <View style={styles.qtyWrap}>
        <Pressable style={styles.qtyBtn} onPress={() => handleQty(item.productId, item.qty - 1)}>
          <Text style={styles.qtyBtnText}>-</Text>
        </Pressable>
        <Text style={styles.qtyText}>{item.qty}</Text>
        <Pressable style={styles.qtyBtn} onPress={() => handleQty(item.productId, item.qty + 1)}>
          <Text style={styles.qtyBtnText}>+</Text>
        </Pressable>
      </View>

      <Pressable style={styles.removeBtn} onPress={() => handleRemove(item.productId)}>
        <Text style={styles.removeBtnText}>Remover</Text>
      </Pressable>
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Meu Carrinho</Text>
        <Text style={styles.headerSubtitle}>
          {items.length} item(s) • Total R$ {total.toFixed(2)}
        </Text>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 24 }} color={BRAND} />
      ) : items.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>Seu carrinho está vazio</Text>
          <Text style={styles.emptySubtitle}>Adicione produtos na Home para vê-los aqui.</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.productId}
          contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
          renderItem={renderItem}
          ListFooterComponent={() => (
            <View style={styles.footer}>
              <Text style={styles.totalText}>Total: R$ {total.toFixed(2)}</Text>
              <Pressable style={styles.clearBtn} onPress={handleClear}>
                <Text style={styles.clearBtnText}>Limpar carrinho</Text>
              </Pressable>
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F7F5F2",
  },
  header: {
    paddingTop: 12,
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: "#111",
  },
  headerSubtitle: {
    marginTop: 4,
    color: "#444",
    fontWeight: "600",
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#111",
    textAlign: "center",
  },
  emptySubtitle: {
    marginTop: 6,
    color: "#666",
    textAlign: "center",
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E7E2DA",
    borderRadius: 14,
    padding: 14,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#111",
  },
  cardCategory: {
    color: "#666",
    marginTop: 2,
  },
  cardPrice: {
    marginTop: 6,
    fontSize: 15,
    fontWeight: "700",
    color: BRAND,
  },
  qtyWrap: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 10,
    gap: 8,
  },
  qtyBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: "#F0EBE5",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#E0D8CE",
  },
  qtyBtnText: {
    fontSize: 18,
    fontWeight: "800",
    color: "#222",
  },
  qtyText: {
    minWidth: 26,
    textAlign: "center",
    fontWeight: "800",
    color: "#111",
  },
  removeBtn: {
    marginTop: 12,
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: "#f1d6d6",
  },
  removeBtnText: {
    color: BRAND,
    fontWeight: "700",
  },
  footer: {
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#E7E2DA",
    gap: 12,
  },
  totalText: {
    fontSize: 16,
    fontWeight: "800",
    color: "#111",
  },
  clearBtn: {
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: BRAND,
  },
  clearBtnText: {
    color: "#fff",
    fontWeight: "800",
  },
});