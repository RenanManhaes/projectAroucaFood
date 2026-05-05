import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  ImageBackground,
  Modal,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "@/config/firebase";
import { clearCart, getCart, setQuantity, removeItem, type CartItem } from "@/services/cart/cart";
import { getProductImage } from "@/constants/media/productImages";
import { BRAND_PRIMARY } from "@/constants/ui/colors";
import { generateOrderCode } from "@/utils/orderCode";
import { styles } from "@/styles/cart.styles";
import { createOrderWithActiveLock, getActiveOrderLock } from "@/services/orders/orderLifecycle";

const BRAND = BRAND_PRIMARY;
const bgImage = require("../../assets/images/cartBackground.jpeg");
const placeholderProduct = require("../../assets/images/logo.png");

export default function CartScreen() {
  const router = useRouter();
  const [items, setItems] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [authPromptVisible, setAuthPromptVisible] = useState(false);
  const [checkoutVisible, setCheckoutVisible] = useState(false);
  const [placingOrder, setPlacingOrder] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"pix" | "credito" | "debito" | "dinheiro" | "">("");
  const [notes, setNotes] = useState("");
  const [successOrderCode, setSuccessOrderCode] = useState<string | null>(null);
  const [activeOrderCode, setActiveOrderCode] = useState<string | null>(null);
  const [activeOrderModalVisible, setActiveOrderModalVisible] = useState(false);
  const [profilePreview, setProfilePreview] = useState<{
    name: string;
    phone: string;
    cpf: string;
    address: string;
    addressNumber: string;
    complement?: string | null;
    cep: string;
    email: string;
  } | null>(null);

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

  const openCheckout = async () => {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      setAuthPromptVisible(true);
      return;
    }

    try {
      const profileSnap = await getDoc(doc(db, "users", currentUser.uid));
      const data = profileSnap.exists() ? profileSnap.data() : null;

      const required = {
        name: typeof data?.name === "string" ? data.name.trim() : "",
        cpf: typeof data?.cpf === "string" ? data.cpf.trim() : "",
        phone: typeof data?.phone === "string" ? data.phone.trim() : "",
        address: typeof data?.address === "string" ? data.address.trim() : "",
        addressNumber: typeof data?.addressNumber === "string" ? data.addressNumber.trim() : "",
        cep: typeof data?.cep === "string" ? data.cep.trim() : "",
        complement: typeof data?.complement === "string" ? data.complement.trim() : null,
      };

      const hasMissingFields =
        !required.name ||
        !required.cpf ||
        !required.phone ||
        !required.address ||
        !required.addressNumber ||
        !required.cep;

      if (hasMissingFields) {
        Alert.alert(
          "Cadastro incompleto",
          "Para finalizar a compra, complete nome, CPF, telefone e endereço no seu perfil.",
          [
            { text: "Cancelar", style: "cancel" },
            { text: "Ir para perfil", onPress: () => router.push("/userConfigs/profile") },
          ]
        );
        return;
      }

      setProfilePreview({
        ...required,
        email: currentUser.email ?? "",
      });
      setCheckoutVisible(true);
    } catch {
      Alert.alert("Erro", "Não foi possível validar seus dados para concluir o pedido.");
    }
  };

  const confirmCheckout = async () => {
    if (!paymentMethod) {
      Alert.alert("Atenção", "Selecione a forma de pagamento.");
      return;
    }

    const currentUser = auth.currentUser;
    if (!currentUser || !profilePreview) {
      Alert.alert("Sessão inválida", "Faça login novamente para concluir seu pedido.");
      setCheckoutVisible(false);
      setAuthPromptVisible(true);
      return;
    }

    const liveItems = await getCart();
    if (!liveItems.length) {
      Alert.alert("Carrinho vazio", "Adicione produtos para finalizar a compra.");
      setCheckoutVisible(false);
      return;
    }

    try {
      const activeLock = await getActiveOrderLock(currentUser.uid);
      if (activeLock?.activeOrderId) {
        const activeCode =
          activeLock.activeOrderCode && activeLock.activeOrderCode.trim()
            ? `#${activeLock.activeOrderCode.trim()}`
            : `#${activeLock.activeOrderId.slice(-6).toUpperCase()}`;

        setCheckoutVisible(false);
        setActiveOrderCode(activeCode);
        setActiveOrderModalVisible(true);
        return;
      }
    } catch {
      Alert.alert("Erro", "Não foi possível validar se você já possui pedido ativo. Tente novamente.");
      return;
    }

    const orderCode = generateOrderCode();
    const totalValue = liveItems.reduce((sum, item) => sum + item.price * item.qty, 0);
    const formattedAddress = `${profilePreview.address}, ${profilePreview.addressNumber}${
      profilePreview.complement ? ` - ${profilePreview.complement}` : ""
    } - CEP: ${profilePreview.cep}`;

    try {
      setPlacingOrder(true);
      await createOrderWithActiveLock({
        orderCode,
        customerId: currentUser.uid,
        customerName: profilePreview.name,
        customerEmail: (profilePreview.email || currentUser.email || "").trim().toLowerCase() || null,
        customerPhone: profilePreview.phone,
        customerAddress: formattedAddress,
        customerCpf: profilePreview.cpf,
        items: liveItems.map((item) => ({
          productId: item.productId,
          name: item.name,
          price: item.price,
          qty: item.qty,
          category: item.category ?? null,
          image: item.image ?? null,
        })),
        total: Number(totalValue.toFixed(2)),
        status: "novo",
        origem: "app",
        paymentMethod,
        notes: notes.trim() || null,
        updatedBy: currentUser.email ?? null,
      });

      await clearCart();
      setItems([]);
      setCheckoutVisible(false);
      setPaymentMethod("");
      setNotes("");
      setSuccessOrderCode(`#${orderCode}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (message === "ACTIVE_ORDER_EXISTS") {
        try {
          const activeLock = await getActiveOrderLock(currentUser.uid);
          const activeCode =
            activeLock?.activeOrderCode && activeLock.activeOrderCode.trim()
              ? `#${activeLock.activeOrderCode.trim()}`
              : activeLock?.activeOrderId
                ? `#${activeLock.activeOrderId.slice(-6).toUpperCase()}`
                : null;

          setCheckoutVisible(false);
          setActiveOrderCode(activeCode);
          setActiveOrderModalVisible(true);
          return;
        } catch {
          Alert.alert("Pedido em andamento", "Você já possui um pedido ativo.");
          return;
        }
      }
      Alert.alert("Erro", "Não foi possível finalizar o pedido. Tente novamente.");
    } finally {
      setPlacingOrder(false);
    }
  };

  const renderItem = ({ item }: { item: CartItem }) => (
    <View style={styles.card}>
      <Image
        source={getProductImage(item.image) ?? placeholderProduct}
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
        {typeof item.stock === "number" ? (
          <Text style={styles.stockInfo}>{item.stock > 0 ? "Disponível" : "Sem estoque"}</Text>
        ) : null}

        <View style={styles.qtyRow}>
          <View style={styles.qtyControl}>
            <Pressable style={styles.qtyBtn} onPress={() => handleQty(item.productId, item.qty - 1)}>
              <Text style={styles.qtyBtnText}>-</Text>
            </Pressable>
            <View style={styles.qtyValueBox}>
              <Text style={styles.qtyText}>{item.qty}</Text>
            </View>
            <Pressable
              style={[styles.qtyBtn, typeof item.stock === "number" && item.qty >= item.stock && styles.qtyBtnDisabled]}
              disabled={typeof item.stock === "number" && item.qty >= item.stock}
              onPress={() => handleQty(item.productId, item.qty + 1)}
            >
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
        ) : successOrderCode ? (
          <View style={styles.successState}>
            <View style={styles.successBadge}>
              <Ionicons name="checkmark" size={42} color="#ffffff" />
            </View>
            <Text style={styles.successTitle}>Pedido efetuado com sucesso!</Text>
            <Text style={styles.successSubtitle}>Seu pedido ja entrou na fila da loja.</Text>
            <View style={styles.successCodeWrap}>
              <Text style={styles.successCodeLabel}>Numero do pedido</Text>
              <Text style={styles.successCode}>{successOrderCode}</Text>
            </View>
            <Pressable
              style={styles.checkoutBtn}
              onPress={() => {
                setSuccessOrderCode(null);
                router.push("/userConfigs/pedidos");
              }}
            >
              <Text style={styles.checkoutText}>Ver pedido</Text>
            </Pressable>
          </View>
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
                <Pressable style={styles.checkoutBtn} onPress={openCheckout}>
                  <Text style={styles.checkoutText}>Finalizar compra</Text>
                </Pressable>
              </View>
            )}
          />
        )}

        <Modal
          visible={authPromptVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setAuthPromptVisible(false)}
        >
          <View style={styles.modalBackdrop}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Entrar para continuar</Text>
              <Text style={styles.modalText}>
                Para finalizar a compra, faça login ou crie sua conta.
              </Text>
              <View style={styles.modalActions}>
                <Pressable
                  style={[styles.modalButton, styles.modalGhostButton]}
                  onPress={() => setAuthPromptVisible(false)}
                >
                  <Text style={styles.modalGhostText}>Agora não</Text>
                </Pressable>
                <Pressable
                  style={[styles.modalButton, styles.modalPrimaryButton]}
                  onPress={() => {
                    setAuthPromptVisible(false);
                    router.push({ pathname: "/userConfigs/profile", params: { mode: "login", fromCheckout: "1" } });
                  }}
                >
                  <Text style={styles.modalPrimaryText}>Fazer login</Text>
                </Pressable>
                <Pressable
                  style={[styles.modalButton, styles.modalPrimaryButton]}
                  onPress={() => {
                    setAuthPromptVisible(false);
                    router.push({ pathname: "/userConfigs/profile", params: { mode: "signup", fromCheckout: "1" } });
                  }}
                >
                  <Text style={styles.modalPrimaryText}>Criar conta</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>

        <Modal
          visible={activeOrderModalVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setActiveOrderModalVisible(false)}
        >
          <View style={styles.modalBackdrop}>
            <View style={styles.modalCard}>
              <View style={styles.activeOrderIconWrap}>
                <Ionicons name="hourglass" size={22} color="#fff" />
              </View>

              <Text style={styles.modalTitle}>Pedido em andamento</Text>
              <Text style={styles.modalText}>
                Você já possui um pedido ativo {activeOrderCode ? `(${activeOrderCode})` : ""}. Finalize ou aguarde este pedido para criar um novo.
              </Text>

              <View style={styles.modalActions}>
                <Pressable
                  style={[styles.modalButton, styles.modalGhostButton]}
                  onPress={() => setActiveOrderModalVisible(false)}
                >
                  <Text style={styles.modalGhostText}>Agora nao</Text>
                </Pressable>
                <Pressable
                  style={[styles.modalButton, styles.modalPrimaryButton]}
                  onPress={() => {
                    setActiveOrderModalVisible(false);
                    router.push("/userConfigs/pedidos");
                  }}
                >
                  <Text style={styles.modalPrimaryText}>Ver pedido</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>

        <Modal
          visible={checkoutVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setCheckoutVisible(false)}
        >
          <View style={styles.modalBackdrop}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Confirmar pedido</Text>
              <Text style={styles.modalText}>
                Revise os dados e selecione a forma de pagamento.
              </Text>

              {profilePreview ? (
                <View style={styles.profileSummary}>
                  <Text style={styles.profileSummaryText}>Nome: {profilePreview.name}</Text>
                  <Text style={styles.profileSummaryText}>CPF: {profilePreview.cpf}</Text>
                  <Text style={styles.profileSummaryText}>Telefone: {profilePreview.phone}</Text>
                  <Text style={styles.profileSummaryText}>
                    Endereço: {profilePreview.address}, {profilePreview.addressNumber}
                    {profilePreview.complement ? ` - ${profilePreview.complement}` : ""}
                  </Text>
                </View>
              ) : null}

              <Text style={styles.sectionLabel}>Pagamento</Text>
              <View style={styles.paymentRow}>
                {[
                  { key: "pix", label: "PIX" },
                  { key: "credito", label: "Crédito" },
                  { key: "debito", label: "Débito" },
                  { key: "dinheiro", label: "Dinheiro" },
                ].map((option) => (
                  <Pressable
                    key={option.key}
                    style={[
                      styles.paymentChip,
                      paymentMethod === option.key && styles.paymentChipSelected,
                    ]}
                    onPress={() => setPaymentMethod(option.key as "pix" | "credito" | "debito" | "dinheiro")}
                  >
                    <Text
                      style={[
                        styles.paymentChipText,
                        paymentMethod === option.key && styles.paymentChipTextSelected,
                      ]}
                    >
                      {option.label}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Text style={styles.sectionLabel}>Observações (opcional)</Text>
              <TextInput
                value={notes}
                onChangeText={setNotes}
                placeholder="Ex: tocar interfone, sem cebola..."
                style={styles.notesInput}
                multiline
              />

              <View style={styles.modalActions}>
                <Pressable
                  style={[styles.modalButton, styles.modalGhostButton]}
                  disabled={placingOrder}
                  onPress={() => setCheckoutVisible(false)}
                >
                  <Text style={styles.modalGhostText}>Voltar</Text>
                </Pressable>
                <Pressable
                  style={[styles.modalButton, styles.modalPrimaryButton, placingOrder && styles.disabledModalButton]}
                  disabled={placingOrder}
                  onPress={confirmCheckout}
                >
                  <Text style={styles.modalPrimaryText}>{placingOrder ? "Processando..." : "Confirmar pedido"}</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    </ImageBackground>
  );
}

