import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  addDoc,
  collection,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { auth, db } from '@/config/firebase';
import type { Order, OrderStatus } from '@/types/Order';
import {
  ORDER_STATUS_COLORS,
  ORDER_STATUS_FLOW,
  ORDER_STATUS_LABELS,
} from '@/types/Order';
import { BRAND_PRIMARY } from '@/constants/ui/colors';

const BRAND = BRAND_PRIMARY;

const BOARD_SECTIONS: { key: OrderStatus; title: string }[] = [
  { key: 'novo', title: 'Aguardando aceite' },
  { key: 'em_preparo', title: 'Em preparo' },
  { key: 'pronto', title: 'Pronto para coleta/entrega' },
  { key: 'cancelado', title: 'Cancelados' },
  { key: 'entregue', title: 'Concluídos' },
];

type CancelModalState = {
  order: Order;
  reason: string;
};

const LOCAL_STATUS_LABELS: Record<OrderStatus, string> = {
  ...ORDER_STATUS_LABELS,
  novo: 'Aguardando aceite',
  entregue: 'Concluído',
};

const normalizeOptionalString = (value: unknown) => {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
};

const confirmAction = async (title: string, message: string, confirmText = 'Confirmar') => {
  if (Platform.OS === 'web') {
    return globalThis.confirm?.(`${title}\n\n${message}`) ?? false;
  }

  return new Promise<boolean>((resolve) => {
    Alert.alert(
      title,
      message,
      [
        { text: 'Cancelar', style: 'cancel', onPress: () => resolve(false) },
        { text: confirmText, onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) }
    );
  });
};

const getPaymentLabel = (order: Order) => {
  const value =
    order.paymentMethod ??
    null;

  if (!value || typeof value !== 'string') return '-';
  return value;
};

const formatDateTime = (order: Order) => {
  if (!order.createdAt || typeof order.createdAt?.toDate !== 'function') return '-';
  return order.createdAt.toDate().toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const getElapsedMinutes = (order: Order) => {
  if (!order.createdAt || typeof order.createdAt?.toDate !== 'function') return null;
  const created = order.createdAt.toDate().getTime();
  const now = Date.now();
  return Math.max(0, Math.floor((now - created) / 60000));
};

const getElapsedLabel = (order: Order) => {
  const mins = getElapsedMinutes(order);
  if (mins === null) return '-';
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h ${m}min`;
};

const isOrderDelayed = (order: Order) => {
  const mins = getElapsedMinutes(order);
  if (mins === null) return false;

  if (order.status === 'novo') return mins > 10;
  if (order.status === 'em_preparo') return mins > 25;
  if (order.status === 'pronto') return mins > 10;
  return false;
};

export default function PedidosWebScreen() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [cancelModal, setCancelModal] = useState<CancelModalState | null>(null);
  const [managingTestOrders, setManagingTestOrders] = useState(false);

  useEffect(() => {
    const q = query(collection(db, 'pedidos'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: Order[] = snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            customerName: normalizeOptionalString(data?.customerName) ?? '-',
            customerEmail: normalizeOptionalString(data?.customerEmail),
            customerPhone: normalizeOptionalString(data?.customerPhone),
            customerAddress: normalizeOptionalString(data?.customerAddress),
            items: Array.isArray(data?.items) ? data.items : [],
            total: Number(data?.total) || 0,
            status: data?.status ?? 'novo',
            origem: data?.origem ?? null,
            notes: normalizeOptionalString(data?.notes),
            paymentMethod: normalizeOptionalString(data?.paymentMethod ?? data?.payment?.method ?? data?.formaPagamento),
            cancellationReason: normalizeOptionalString(data?.cancellationReason ?? data?.cancelReason ?? data?.cancelamentoMotivo),
            createdAt: data?.createdAt ?? null,
            updatedAt: data?.updatedAt ?? null,
            updatedBy: normalizeOptionalString(data?.updatedBy),
          };
        });

        setOrders(list);
        setLoading(false);

        setSelectedOrder((current) => {
          if (!current) return current;
          const refreshed = list.find((o) => o.id === current.id);
          return refreshed ?? null;
        });

        setCancelModal((current) => {
          if (!current) return current;
          const refreshed = list.find((o) => o.id === current.order.id);
          return refreshed ? { ...current, order: refreshed } : null;
        });
      },
      () => {
        setOrders([]);
        setLoading(false);
      }
    );
    return unsub;
  }, []);

  const filteredOrders = useMemo(() => {
    let list = [...orders];
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (o) =>
          o.customerName.toLowerCase().includes(q) ||
          (o.customerPhone ?? '').includes(q) ||
          (o.customerAddress ?? '').toLowerCase().includes(q) ||
          o.id.toLowerCase().includes(q) ||
          o.items.some((item) => item.name.toLowerCase().includes(q))
      );
    }
    return list;
  }, [orders, search]);

  const ordersByStatus = useMemo(() => {
    const grouped: Record<OrderStatus, Order[]> = {
      novo: [],
      em_preparo: [],
      pronto: [],
      entregue: [],
      cancelado: [],
    };
    filteredOrders.forEach((order) => grouped[order.status].push(order));
    return grouped;
  }, [filteredOrders]);

  const delayedTotal = useMemo(() => {
    return filteredOrders.filter((order) => isOrderDelayed(order)).length;
  }, [filteredOrders]);

  const handleStatusChange = async (order: Order, newStatus: OrderStatus) => {
    if (order.status === newStatus) return;
    setUpdatingStatus(true);
    try {
      await updateDoc(doc(db, 'pedidos', order.id), {
        status: newStatus,
        cancellationReason: newStatus === 'cancelado' ? order.cancellationReason ?? null : null,
        updatedAt: serverTimestamp(),
        updatedBy: auth.currentUser?.email ?? null,
      });
    } catch {
      Alert.alert('Erro', 'Não foi possível atualizar o status.');
    } finally {
      setUpdatingStatus(false);
    }
  };

  const openCancelModal = (order: Order) => {
    setCancelModal({ order, reason: '' });
  };

  const handleCancelWithReason = async () => {
    if (!cancelModal) return;
    const reason = cancelModal.reason.trim();
    if (!reason) {
      Alert.alert('Atenção', 'Informe um motivo para o cancelamento.');
      return;
    }

    setUpdatingStatus(true);
    try {
      await updateDoc(doc(db, 'pedidos', cancelModal.order.id), {
        status: 'cancelado',
        cancellationReason: reason,
        updatedAt: serverTimestamp(),
        updatedBy: auth.currentUser?.email ?? null,
      });
      setCancelModal(null);
    } catch {
      Alert.alert('Erro', 'Não foi possível cancelar o pedido.');
    } finally {
      setUpdatingStatus(false);
    }
  };

  const getNextStatus = (current: OrderStatus): OrderStatus | null => {
    const idx = ORDER_STATUS_FLOW.indexOf(current);
    if (idx === -1 || idx === ORDER_STATUS_FLOW.length - 1) return null;
    return ORDER_STATUS_FLOW[idx + 1];
  };

  const isTestOrder = (order: Partial<Order>) => {
    const name = String(order.customerName ?? '').toLowerCase();
    const notes = String(order.notes ?? '').toLowerCase();
    const email = String(order.customerEmail ?? '').toLowerCase();
    return (
      name.startsWith('teste ') ||
      name.startsWith('cliente teste') ||
      notes.includes('pedido teste') ||
      email === 'cliente.teste@exemplo.com'
    );
  };

  const handleCreateTestOrders = async () => {
    const confirmed = await confirmAction(
      'Criar pedidos teste',
      'Deseja criar pedidos de teste na base?',
      'Criar'
    );
    if (!confirmed) return;

    setManagingTestOrders(true);
    try {
      const basePayload = {
        customerEmail: 'cliente.teste@exemplo.com',
        customerPhone: '(11) 98888-0000',
        customerAddress: 'Rua Teste Fluxo, 456',
        origem: 'manual' as const,
        paymentMethod: 'pix',
        updatedBy: auth.currentUser?.email ?? 'admin-web',
      };

      const testOrders = [
        {
          customerName: 'Teste Novo',
          status: 'novo' as OrderStatus,
          notes: 'Pedido teste - aguardando aceite',
          items: [
            { name: 'Contra File 500g', price: 54.9, qty: 1 },
            { name: 'Carvao 3kg', price: 19.9, qty: 1 },
          ],
          total: 74.8,
        },
        {
          customerName: 'Teste Preparo',
          status: 'em_preparo' as OrderStatus,
          notes: 'Pedido teste - em preparo',
          items: [{ name: 'Picanha 700g', price: 89.9, qty: 1 }],
          total: 89.9,
        },
        {
          customerName: 'Teste Cancelado',
          status: 'cancelado' as OrderStatus,
          notes: 'Pedido teste - cancelado',
          cancellationReason: 'Cliente desistiu do pedido',
          items: [{ name: 'Espeto Frango', price: 14.9, qty: 3 }],
          total: 44.7,
        },
        {
          customerName: 'Teste Concluido',
          status: 'entregue' as OrderStatus,
          notes: 'Pedido teste - concluido',
          items: [{ name: 'Linguica Toscana 1kg', price: 32.9, qty: 2 }],
          total: 65.8,
        },
      ];

      for (const item of testOrders) {
        await addDoc(collection(db, 'pedidos'), {
          ...basePayload,
          ...item,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      Alert.alert('Sucesso', 'Pedidos de teste criados com sucesso.');
    } catch {
      Alert.alert('Erro', 'Não foi possível criar os pedidos de teste.');
    } finally {
      setManagingTestOrders(false);
    }
  };

  const handleClearTestOrders = async () => {
    const confirmed = await confirmAction(
      'Limpar pedidos teste',
      'Deseja remover todos os pedidos de teste?',
      'Remover'
    );
    if (!confirmed) return;

    setManagingTestOrders(true);
    try {
      const snap = await getDocs(collection(db, 'pedidos'));
      const refsToDelete = snap.docs.filter((docSnap) => {
        const data = docSnap.data();
        return isTestOrder({
          customerName: typeof data.customerName === 'string' ? data.customerName : undefined,
          notes: typeof data.notes === 'string' ? data.notes : undefined,
          customerEmail: typeof data.customerEmail === 'string' ? data.customerEmail : undefined,
        });
      });

      if (!refsToDelete.length) {
        Alert.alert('Aviso', 'Nenhum pedido de teste encontrado.');
        return;
      }

      const batch = writeBatch(db);
      refsToDelete.forEach((docSnap) => {
        batch.delete(docSnap.ref);
      });
      await batch.commit();

      Alert.alert('Sucesso', `${refsToDelete.length} pedido(s) de teste removido(s).`);
    } catch {
      Alert.alert('Erro', 'Não foi possível limpar os pedidos de teste.');
    } finally {
      setManagingTestOrders(false);
    }
  };

  return (
    <View style={styles.root}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content}>
        <View style={styles.topRow}>
          <View>
            <Text style={styles.pageTitle}>Pedidos</Text>
            <Text style={styles.pageSubtitle}>
              {filteredOrders.length} pedidos • {delayedTotal} atrasados
            </Text>
          </View>
          <View style={styles.topActionsRow}>
            <Pressable
              style={[styles.topActionBtn, styles.topActionPrimary, managingTestOrders && styles.topActionDisabled]}
              onPress={handleCreateTestOrders}
              disabled={managingTestOrders}
            >
              <Text style={styles.topActionPrimaryText}>Criar pedidos teste</Text>
            </Pressable>
            <Pressable
              style={[styles.topActionBtn, styles.topActionDanger, managingTestOrders && styles.topActionDisabled]}
              onPress={handleClearTestOrders}
              disabled={managingTestOrders}
            >
              <Text style={styles.topActionDangerText}>Limpar pedidos teste</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.toolbarRow}>
          <TextInput
            style={styles.searchInput}
            placeholder="Buscar por cliente, telefone, endereço, item ou ID..."
            value={search}
            onChangeText={setSearch}
          />
        </View>

        {loading ? (
          <View style={styles.centered}><ActivityIndicator color={BRAND} /></View>
        ) : (
          <View style={styles.boardGrid}>
            {BOARD_SECTIONS.map((section) => {
              const list = ordersByStatus[section.key] ?? [];
              return (
                <View key={section.key} style={styles.sectionCard}>
                  <View style={styles.sectionHeader}>
                    <Text style={styles.sectionTitle}>{section.title}</Text>
                    <View style={styles.sectionBadge}>
                      <Text style={styles.sectionBadgeText}>{list.length}</Text>
                    </View>
                  </View>

                  {list.length === 0 ? (
                    <View style={styles.sectionEmpty}>
                      <Text style={styles.emptyText}>Nenhum pedido nesta etapa.</Text>
                    </View>
                  ) : (
                    list.map((order) => {
                      const nextStatus = getNextStatus(order.status);
                      const delayed = isOrderDelayed(order);
                      return (
                        <Pressable
                          key={order.id}
                          style={[styles.orderCard, delayed && styles.orderCardDelayed]}
                          onPress={() => setSelectedOrder(order)}
                        >
                          <View style={styles.orderCardHeader}>
                            <Text style={styles.orderId}>#{order.id.slice(-6).toUpperCase()}</Text>
                            <Text style={styles.orderTime}>{getElapsedLabel(order)}</Text>
                          </View>

                          <Text style={styles.orderCustomer} numberOfLines={1}>{order.customerName}</Text>
                          <Text style={styles.orderMeta} numberOfLines={1}>
                            {order.items.length} item(s) • R$ {order.total.toFixed(2)}
                          </Text>
                          <Text style={styles.orderMeta} numberOfLines={1}>
                            {order.customerPhone || 'Sem telefone'}
                          </Text>

                          <View style={styles.orderFooterRow}>
                            <Text style={[styles.statusBadge, { backgroundColor: ORDER_STATUS_COLORS[order.status] }]}>
                              {LOCAL_STATUS_LABELS[order.status]}
                            </Text>
                            {delayed ? <Text style={styles.delayBadge}>Atrasado</Text> : null}
                          </View>

                          <View style={styles.orderActionsRow}>
                            {nextStatus && order.status !== 'cancelado' ? (
                              <Pressable
                                style={styles.advanceBtn}
                                onPress={() => handleStatusChange(order, nextStatus)}
                                disabled={updatingStatus}
                              >
                                <Text style={styles.advanceBtnText}>
                                  {order.status === 'novo' ? 'Aceitar pedido' : LOCAL_STATUS_LABELS[nextStatus]}
                                </Text>
                              </Pressable>
                            ) : null}
                            {order.status !== 'cancelado' && order.status !== 'entregue' ? (
                              <Pressable
                                style={styles.cancelInlineBtn}
                                onPress={() => openCancelModal(order)}
                                disabled={updatingStatus}
                              >
                                <Text style={styles.cancelInlineBtnText}>Cancelar</Text>
                              </Pressable>
                            ) : null}
                          </View>
                        </Pressable>
                      );
                    })
                  )}
                </View>
              );
            })}
            {filteredOrders.length === 0 ? (
              <View style={styles.emptyRow}>
                <Text style={styles.emptyText}>Nenhum pedido encontrado para o filtro.</Text>
              </View>
            ) : null}
          </View>
        )}
      </ScrollView>

      <Modal
        visible={!!selectedOrder}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedOrder(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            {selectedOrder ? (
              <>
                <View style={styles.sidePanelHeader}>
                  <Text style={styles.sidePanelTitle}>Pedido #{selectedOrder.id.slice(-6).toUpperCase()}</Text>
                  <Pressable onPress={() => setSelectedOrder(null)}>
                    <Text style={styles.closeBtnText}>✕</Text>
                  </Pressable>
                </View>

                <ScrollView contentContainerStyle={styles.detailContent}>
                  <View style={styles.detailSection}>
                    <Text style={styles.detailSectionTitle}>Cliente</Text>
                    <Text style={styles.detailText}>{selectedOrder.customerName || '-'}</Text>
                    <Text style={styles.detailMeta}>Telefone: {selectedOrder.customerPhone || '-'}</Text>
                    <Text style={styles.detailMeta}>Endereço: {selectedOrder.customerAddress || '-'}</Text>
                    <Text style={styles.detailMeta}>E-mail: {selectedOrder.customerEmail || '-'}</Text>
                  </View>

                  <View style={styles.detailSection}>
                    <Text style={styles.detailSectionTitle}>Pedido</Text>
                    {selectedOrder.items.map((item, i) => (
                      <View key={`${selectedOrder.id}-${i}`} style={styles.itemRow}>
                        <Text style={styles.itemName} numberOfLines={1}>{item.qty}x {item.name}</Text>
                        <Text style={styles.itemPrice}>R$ {(item.price * item.qty).toFixed(2)}</Text>
                      </View>
                    ))}
                    <View style={[styles.itemRow, styles.totalRow]}>
                      <Text style={styles.totalLabel}>Total</Text>
                      <Text style={styles.totalValue}>R$ {selectedOrder.total.toFixed(2)}</Text>
                    </View>
                  </View>

                  <View style={styles.detailSection}>
                    <Text style={styles.detailSectionTitle}>Informações</Text>
                    <Text style={styles.detailMeta}>Forma de pagamento: {getPaymentLabel(selectedOrder)}</Text>
                    <Text style={styles.detailMeta}>Status: {LOCAL_STATUS_LABELS[selectedOrder.status]}</Text>
                    <Text style={styles.detailMeta}>Criado em: {formatDateTime(selectedOrder)}</Text>
                    <Text style={styles.detailMeta}>Origem: {selectedOrder.origem || '-'}</Text>
                    {selectedOrder.updatedBy ? (
                      <Text style={styles.detailMeta}>Atualizado por: {selectedOrder.updatedBy}</Text>
                    ) : null}
                    {selectedOrder.cancellationReason ? (
                      <Text style={styles.detailMeta}>Motivo do cancelamento: {selectedOrder.cancellationReason}</Text>
                    ) : null}
                  </View>

                  {selectedOrder.notes ? (
                    <View style={styles.detailSection}>
                      <Text style={styles.detailSectionTitle}>Observações</Text>
                      <Text style={styles.detailText}>{selectedOrder.notes}</Text>
                    </View>
                  ) : null}

                  <View style={styles.detailSection}>
                    <Text style={styles.detailSectionTitle}>Ações</Text>
                    <View style={styles.statusFlow}>
                      {ORDER_STATUS_FLOW.map((status) => {
                        const isCurrent = selectedOrder.status === status;
                        const isDisabled = updatingStatus || selectedOrder.status === 'cancelado' || isCurrent;
                        return (
                          <Pressable
                            key={status}
                            style={[
                              styles.statusFlowBtn,
                              isCurrent && { backgroundColor: ORDER_STATUS_COLORS[status], borderColor: ORDER_STATUS_COLORS[status] },
                              isDisabled && !isCurrent && styles.statusFlowBtnDisabled,
                            ]}
                            onPress={() => handleStatusChange(selectedOrder, status)}
                            disabled={isDisabled}
                          >
                            <Text style={[styles.statusFlowBtnText, isCurrent && { color: '#fff' }]}>
                              {LOCAL_STATUS_LABELS[status]}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                    {selectedOrder.status !== 'cancelado' && selectedOrder.status !== 'entregue' ? (
                      <Pressable style={styles.cancelOrderBtn} onPress={() => openCancelModal(selectedOrder)}>
                        <Text style={styles.cancelOrderBtnText}>Cancelar pedido</Text>
                      </Pressable>
                    ) : null}
                  </View>
                </ScrollView>
              </>
            ) : null}
          </View>
        </View>
      </Modal>

      <Modal
        visible={!!cancelModal}
        transparent
        animationType="fade"
        onRequestClose={() => setCancelModal(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.cancelCard}>
            <Text style={styles.cancelTitle}>Cancelar pedido</Text>
            <Text style={styles.cancelSubTitle}>
              Informe o motivo do cancelamento para o pedido
              {cancelModal ? ` #${cancelModal.order.id.slice(-6).toUpperCase()}` : ''}.
            </Text>
            <TextInput
              style={styles.cancelReasonInput}
              value={cancelModal?.reason ?? ''}
              onChangeText={(text) => setCancelModal((prev) => (prev ? { ...prev, reason: text } : prev))}
              placeholder="Motivo do cancelamento"
              multiline
            />
            <View style={styles.cancelActions}>
              <Pressable style={styles.cancelModalGhostBtn} onPress={() => setCancelModal(null)}>
                <Text style={styles.cancelModalGhostText}>Voltar</Text>
              </Pressable>
              <Pressable style={styles.cancelModalPrimaryBtn} onPress={handleCancelWithReason}>
                <Text style={styles.cancelModalPrimaryText}>Confirmar cancelamento</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 32, paddingBottom: 60, gap: 16 },
  centered: { padding: 32, alignItems: 'center' },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  pageTitle: { fontSize: 26, fontWeight: '800', color: '#2c1b12' },
  pageSubtitle: { fontSize: 13, color: '#6e5a4b' },
  topActionsRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' },
  topActionBtn: {
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topActionPrimary: {
    backgroundColor: '#2c1b12',
    borderColor: '#2c1b12',
  },
  topActionDanger: {
    backgroundColor: '#fff',
    borderColor: '#e1bcbc',
  },
  topActionPrimaryText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  topActionDangerText: { color: '#9f2d2d', fontSize: 12, fontWeight: '800' },
  topActionDisabled: { opacity: 0.6 },
  toolbarRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  searchInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#d9cfc2',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#fff',
    fontSize: 14,
  },

  boardGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
    alignItems: 'flex-start',
  },
  sectionCard: {
    flexBasis: 360,
    flexGrow: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e8ddd4',
    padding: 12,
    gap: 10,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 4,
  },
  sectionTitle: { fontSize: 14, fontWeight: '800', color: '#2c1b12' },
  sectionBadge: {
    minWidth: 24,
    borderRadius: 999,
    backgroundColor: '#2c1b12',
    paddingHorizontal: 8,
    paddingVertical: 3,
    alignItems: 'center',
  },
  sectionBadgeText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  sectionEmpty: {
    minHeight: 80,
    borderRadius: 10,
    backgroundColor: '#f8f4f0',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 12,
  },

  orderCard: {
    borderWidth: 1,
    borderColor: '#eadfd6',
    borderRadius: 10,
    padding: 10,
    backgroundColor: '#fffdfa',
    gap: 5,
  },
  orderCardDelayed: {
    borderColor: '#e16c6c',
    backgroundColor: '#fff4f4',
  },
  orderCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  orderId: { fontSize: 12, color: '#8f7766', fontWeight: '700' },
  orderTime: { fontSize: 12, color: '#8f7766' },
  orderCustomer: { fontSize: 16, color: '#2c1b12', fontWeight: '800' },
  orderMeta: { fontSize: 12, color: '#5f4b3c' },
  orderFooterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 2,
  },
  statusBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    color: '#fff',
    fontWeight: '700',
    fontSize: 12,
    overflow: 'hidden',
  },
  delayBadge: {
    fontSize: 11,
    color: '#9f2d2d',
    fontWeight: '800',
  },
  orderActionsRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  advanceBtn: {
    flex: 1,
    borderRadius: 8,
    backgroundColor: '#2c1b12',
    paddingVertical: 8,
    alignItems: 'center',
  },
  advanceBtnText: { color: '#fff', fontWeight: '800', fontSize: 12 },
  cancelInlineBtn: {
    borderRadius: 8,
    backgroundColor: '#fde2e2',
    borderWidth: 1,
    borderColor: '#f6c8c8',
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  cancelInlineBtnText: { color: '#9f2d2d', fontWeight: '700', fontSize: 12 },

  emptyRow: { padding: 24, alignItems: 'center' },
  emptyText: { color: '#6e5a4b' },

  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(28, 20, 14, 0.48)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 20,
  },
  modalCard: {
    width: '92%',
    maxWidth: 760,
    maxHeight: '92%',
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e8ddd4',
    overflow: 'hidden',
  },
  sidePanelHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: '#e8ddd4' },
  sidePanelTitle: { fontSize: 17, fontWeight: '800', color: '#2c1b12' },
  closeBtnText: { fontSize: 18, color: '#6e5a4b', fontWeight: '700' },
  detailContent: { padding: 20, gap: 8, paddingBottom: 40 },
  detailSection: { gap: 6, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: '#f0e8e0' },
  detailSectionTitle: { fontSize: 12, fontWeight: '800', color: '#a08060', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  detailText: { fontSize: 15, color: '#2c1b12', fontWeight: '600' },
  detailMeta: { fontSize: 13, color: '#6e5a4b' },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 },
  itemName: { flex: 1, fontSize: 14, color: '#2c1b12' },
  itemPrice: { fontSize: 14, color: '#2c1b12', fontWeight: '600' },
  totalRow: { borderTopWidth: 1, borderTopColor: '#f0e8e0', marginTop: 4, paddingTop: 8 },
  totalLabel: { fontSize: 15, fontWeight: '800', color: '#2c1b12' },
  totalValue: { fontSize: 16, fontWeight: '800', color: BRAND },
  statusFlow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  statusFlowBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: '#d9cfc2', backgroundColor: '#fff' },
  statusFlowBtnDisabled: { opacity: 0.45 },
  statusFlowBtnText: { fontSize: 12, fontWeight: '700', color: '#6e5a4b' },
  cancelOrderBtn: { borderWidth: 1, borderColor: BRAND, borderRadius: 8, paddingVertical: 8, alignItems: 'center', marginTop: 4 },
  cancelOrderBtnText: { color: BRAND, fontWeight: '700', fontSize: 13 },

  cancelCard: {
    width: '92%',
    maxWidth: 560,
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e8ddd4',
    padding: 20,
    gap: 12,
  },
  cancelTitle: { fontSize: 20, fontWeight: '800', color: '#2c1b12' },
  cancelSubTitle: { fontSize: 13, color: '#6e5a4b' },
  cancelReasonInput: {
    borderWidth: 1,
    borderColor: '#d9cfc2',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    backgroundColor: '#fdfaf6',
    minHeight: 92,
    textAlignVertical: 'top',
  },
  cancelActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 2 },
  cancelModalGhostBtn: {
    borderWidth: 1,
    borderColor: '#d9cfc2',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  cancelModalGhostText: { color: '#6e5a4b', fontWeight: '700', fontSize: 13 },
  cancelModalPrimaryBtn: {
    backgroundColor: BRAND,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  cancelModalPrimaryText: { color: '#fff', fontWeight: '800', fontSize: 13 },
});
