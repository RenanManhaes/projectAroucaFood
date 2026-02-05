import React, { useEffect, useState } from "react";
import { Modal, View, Text, Pressable, StyleSheet } from "react-native";
import type { Product } from "@/types/Product";

interface ProductModalProps {
  visible: boolean;
  product: Product | null;
  onClose: () => void;
  onAdd: (product: Product, quantity: number) => void;
}

export function ProductModal({ visible, product, onClose, onAdd }: ProductModalProps) {
  const [qty, setQty] = useState(1);

  useEffect(() => {
    if (visible) {
      setQty(1);
    }
  }, [visible, product]);

  if (!product) return null;

  const handleAdd = () => {
    if (!product) return;
    onAdd(product, Math.max(1, qty));
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.content}>
          <Pressable style={styles.closeX} onPress={onClose}>
            <Text style={styles.closeXText}>×</Text>
          </Pressable>

          <Text style={styles.title}>{product.name}</Text>
          <Text style={styles.price}>Preço: R$ {product.price.toFixed(2)}</Text>

          <View style={styles.qtyRow}>
            <Pressable
              style={styles.qtyBtn}
              onPress={() => setQty((n) => Math.max(1, n - 1))}
            >
              <Text style={styles.qtyBtnText}>-</Text>
            </Pressable>
            <Text style={styles.qtyText}>{qty}</Text>
            <Pressable style={styles.qtyBtn} onPress={() => setQty((n) => n + 1)}>
              <Text style={styles.qtyBtnText}>+</Text>
            </Pressable>
          </View>

          <Pressable style={styles.addBtn} onPress={handleAdd}>
            <Text style={styles.addBtnText}>Adicionar ao carrinho</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 16,
  },
  content: {
    backgroundColor: "#fff",
    padding: 24,
    borderRadius: 16,
    alignItems: "center",
    width: "100%",
    maxWidth: 380,
  },
  closeX: {
    position: "absolute",
    top: 12,
    right: 12,
    padding: 6,
  },
  closeXText: {
    fontSize: 20,
    fontWeight: "800",
    color: "#333",
  },
  title: {
    fontSize: 18,
    fontWeight: "800",
    color: "#111",
  },
  price: {
    marginTop: 8,
    marginBottom: 14,
    color: "#444",
    fontWeight: "700",
  },
  qtyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 16,
  },
  qtyBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E0D8CE",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F4EFE8",
  },
  qtyBtnText: {
    fontSize: 18,
    fontWeight: "800",
    color: "#222",
  },
  qtyText: {
    minWidth: 32,
    textAlign: "center",
    fontSize: 16,
    fontWeight: "800",
    color: "#111",
  },
  addBtn: {
    marginTop: 4,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: "#7B2D2D",
  },
  addBtnText: {
    color: "#fff",
    fontWeight: "800",
  },
});
