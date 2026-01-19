import React from "react";
import { Modal, View, Text, Pressable, StyleSheet } from "react-native";
import type { Product } from "@/types/Product";

interface ProductModalProps {
  visible: boolean;
  product: Product | null;
  onClose: () => void;
}

export function ProductModal({ visible, product, onClose }: ProductModalProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.content}>
          <Text style={styles.title}>{product?.name}</Text>
          <Text style={styles.price}>Preço: R$ {product?.price?.toFixed(2)}</Text>
          <Pressable onPress={onClose} style={styles.closeBtn}>
            <Text style={styles.closeBtnText}>Fechar</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.3)",
    justifyContent: "center",
    alignItems: "center",
  },
  content: {
    backgroundColor: "#fff",
    padding: 24,
    borderRadius: 12,
    alignItems: "center",
  },
  title: {
    fontSize: 18,
    fontWeight: "bold",
  },
  price: {
    marginVertical: 8,
  },
  closeBtn: {
    marginTop: 12,
    paddingHorizontal: 18,
    paddingVertical: 10,
    backgroundColor: "#7B2D2D",
    borderRadius: 8,
  },
  closeBtnText: {
    color: "#fff",
    fontWeight: "bold",
  },
});
