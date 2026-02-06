import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  ImageBackground,
  Pressable,
  Text,
  View,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { SafeAreaView } from "react-native-safe-area-context";
import { getCart, setQuantity, removeItem, clearCart, type CartItem } from "@/storage/cart";
import { styles } from "./cart.styles";

const BRAND = "#942229";
const bgImage = require("../../assets/images/cart-background.jpeg");
const placeholderProduct = require("../../assets/images/logo.png");

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
      <Image
        source={placeholderProduct}
        style={styles.productImg}
        resizeMode="cover"
      />

      <View style={styles.cardBody}>
        <View style={styles.cardHeaderRow}>
          <Text style={styles.cardTitle} numberOfLines={2}>
            {item.name}
          </Text>
          <Text style={styles.itemPrice}>R$ {item.price.toFixed(2)}</Text>
        </View>
        <Text style={styles.cardCategory}>{item.category || ""}</Text>

        <View style={styles.qtyRow}>
          <View style={styles.qtyControl}>
            <Pressable style={styles.qtyBtn} onPress={() => handleQty(item.productId, item.qty - 1)}>
              <Text style={styles.qtyBtnText}>-</Text>
            </Pressable>
            <View style={styles.qtyValueBox}>
              <Text style={styles.qtyText}>{item.qty}</Text>
            </View>
            <Pressable style={styles.qtyBtn} onPress={() => handleQty(item.productId, item.qty + 1)}>
              <Text style={styles.qtyBtnText}>+</Text>
            </Pressable>
          </View>
          <Pressable style={styles.removeLink} onPress={() => handleRemove(item.productId)}>
            <Text style={styles.removeLinkText}>Remover</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );

  return (
    <ImageBackground source={bgImage} style={styles.bg} imageStyle={styles.bgImage}>
      <View style={styles.bgOverlay} />
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <View style={styles.topBar}>
          <Text style={styles.topTitle}>Seu Carrinho</Text>
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
            contentContainerStyle={styles.listContent}
            ItemSeparatorComponent={() => <View style={{ height: 14 }} />}
            renderItem={renderItem}
            ListFooterComponent={() => (
              <View style={styles.summaryCard}>
                <View style={styles.totalRow}>
                  <View style={{ gap: 6 }}>
                    <Text style={styles.totalLabel}>Total:</Text>
                    {/* Hiperlink to clear cart
                    <Pressable onPress={handleClear} hitSlop={6}>
                      <Text style={styles.clearLink}>Limpar carrinho</Text>
                    </Pressable>
                    */}
                  </View>
                  <Text style={styles.totalValue}>R$ {total.toFixed(2)}</Text>
                </View>
                <Pressable style={styles.checkoutBtn} onPress={() => {}}>
                  <Text style={styles.checkoutText}>Finalizar compra</Text>
                </Pressable>
              </View>
            )}
          />
        )}
      </SafeAreaView>
    </ImageBackground>
  );
}

