import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';

import { auth, db } from '@/config/firebase';
import { BRAND_PRIMARY } from '@/constants/ui/colors';
import type { Order, OrderStatus } from '@/types/Order';
import { ORDER_STATUS_COLORS, ORDER_STATUS_FLOW, ORDER_STATUS_LABELS } from '@/types/Order';
import { generateOrderCode, getOrderDisplayCode } from '@/utils/orderCode';
import { updateOrderStatusWithLock } from '@/services/orders/orderLifecycle';

const BRAND = BRAND_PRIMARY;

const BOARD_SECTIONS: { key: OrderStatus; title: string }[] = [
  { key: 'novo', title: 'Aguardando aceite' },
  { key: 'em_preparo', title: 'Em preparo' },
  { key: 'pronto', title: 'Pronto' },
  { key: 'em_rota', title: 'Em rota' },
  { key: 'cancelado', title: 'Cancelados' },
  { key: 'entregue', title: 'Concluídos' },
];

type CancelModalState = {
  order: Order;
  reason: string;
};

type OrdersFilter = 'all' | OrderStatus;

const LOCAL_STATUS_LABELS: Record<OrderStatus, string> = {
  ...ORDER_STATUS_LABELS,
  novo: 'Aguardando aceite',
  em_rota: 'Pedido em rota',
  entregue: 'Concluído',
};

const normalizeOptionalString = (value: unknown) => {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
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

export default function PedidosMobileScreen() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<OrdersFilter>('all');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [cancelModal, setCancelModal] = useState<CancelModalState | null>(null);

  useEffect(() => {
    const q = query(collection(db, 'pedidos'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: Order[] = snap.docs.map((d) => {
          const data = d.data();

          if (typeof data?.orderCode !== 'string' || !data.orderCode.trim()) {
            void updateDoc(doc(db, 'pedidos', d.id), {
              orderCode: generateOrderCode(),
              updatedAt: serverTimestamp(),
              updatedBy: auth.currentUser?.email ?? 'admin-mobile',
            }).catch(() => {
              // Ignore backfill failures to keep list responsive.
            });
          }

          return {
            id: d.id,
            orderCode: normalizeOptionalString(data?.orderCode),
            customerId: normalizeOptionalString(data?.customerId),
            customerName: normalizeOptionalString(data?.customerName) ?? '-',
            customerEmail: normalizeOptionalString(data?.customerEmail),
            customerPhone: normalizeOptionalString(data?.customerPhone),
            customerAddress: normalizeOptionalString(data?.customerAddress),
            items: Array.isArray(data?.items) ? data.items : [],
            itemsCount: Number(data?.itemsCount) || undefined,
            firstItemName: normalizeOptionalString(data?.firstItemName),
            total: Number(data?.total) || 0,
            status: data?.status ?? 'novo',
            isActive: typeof data?.isActive === 'boolean' ? data.isActive : undefined,
            origem: data?.origem ?? null,
            notes: normalizeOptionalString(data?.notes),
            paymentMethod: normalizeOptionalString(data?.paymentMethod ?? data?.payment?.method ?? data?.formaPagamento),
            cancellationReason: normalizeOptionalString(data?.cancellationReason ?? data?.cancelReason ?? data?.cancelamentoMotivo),
            createdAt: data?.createdAt ?? null,
            statusUpdatedAt: data?.statusUpdatedAt ?? null,
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

  const searchedOrders = useMemo(() => {
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

  const filteredOrders = useMemo(() => {
    if (activeFilter === 'all') return searchedOrders;
    return searchedOrders.filter((order) => order.status === activeFilter);
  }, [activeFilter, searchedOrders]);

  const filterCounts = useMemo(() => {
    return {
      all: searchedOrders.length,
      novo: searchedOrders.filter((order) => order.status === 'novo').length,
      em_preparo: searchedOrders.filter((order) => order.status === 'em_preparo').length,
      pronto: searchedOrders.filter((order) => order.status === 'pronto').length,
      em_rota: searchedOrders.filter((order) => order.status === 'em_rota').length,
      entregue: searchedOrders.filter((order) => order.status === 'entregue').length,
      cancelado: searchedOrders.filter((order) => order.status === 'cancelado').length,
    };
  }, [searchedOrders]);

  const ordersByStatus = useMemo(() => {
    const grouped: Record<OrderStatus, Order[]> = {
      novo: [],
      em_preparo: [],
      pronto: [],
      em_rota: [],
      entregue: [],
      cancelado: [],
    };

    filteredOrders.forEach((order) => grouped[order.status].push(order));
    return grouped;
  }, [filteredOrders]);

  const delayedTotal = useMemo(() => {
    return filteredOrders.filter((order) => isOrderDelayed(order)).length;
  }, [filteredOrders]);

  const visibleSections = useMemo(() => {
    if (activeFilter === 'all') {
      return BOARD_SECTIONS;
    }
    return BOARD_SECTIONS.filter((section) => section.key === activeFilter);
  }, [activeFilter]);

  const getNextStatus = (current: OrderStatus): OrderStatus | null => {
    const idx = ORDER_STATUS_FLOW.indexOf(current);
    if (idx === -1 || idx === ORDER_STATUS_FLOW.length - 1) return null;
    return ORDER_STATUS_FLOW[idx + 1];
  };

  const handleStatusChange = async (order: Order, newStatus: OrderStatus) => {
    if (order.status === newStatus) return;
    setUpdatingStatus(true);
    try {
      await updateOrderStatusWithLock({
        orderId: order.id,
        customerId: order.customerId,
        orderCode: order.orderCode,
        newStatus,
        cancellationReason: newStatus === 'cancelado' ? order.cancellationReason ?? null : null,
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
      await updateOrderStatusWithLock({
        orderId: cancelModal.order.id,
        customerId: cancelModal.order.customerId,
        orderCode: cancelModal.order.orderCode,
        newStatus: 'cancelado',
        cancellationReason: reason,
        updatedBy: auth.currentUser?.email ?? null,
      });
      setCancelModal(null);
    } catch {
      Alert.alert('Erro', 'Não foi possível cancelar o pedido.');
    } finally {
      setUpdatingStatus(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Pedidos</Text>
        <Text style={styles.subtitle}>{filteredOrders.length} pedidos • {delayedTotal} atrasados</Text>
      </View>

      <TextInput
        style={styles.searchInput}
        placeholder="Buscar por cliente, telefone, endereço, item ou ID..."
        value={search}
        onChangeText={setSearch}
      />

      <View style={styles.summaryRow}>
        <Pressable
          style={[styles.summaryCard, activeFilter === 'all' && styles.summaryCardActive]}
          onPress={() => setActiveFilter('all')}
        >
          <Text style={styles.summaryLabel}>Todos</Text>
          <Text style={styles.summaryValue}>{filterCounts.all}</Text>
        </Pressable>
        <Pressable
          style={[styles.summaryCard, activeFilter === 'novo' && styles.summaryCardActive]}
          onPress={() => setActiveFilter('novo')}
        >
          <Text style={styles.summaryLabel}>Aguardando</Text>
          <Text style={styles.summaryValue}>{filterCounts.novo}</Text>
        </Pressable>
        <Pressable
          style={[styles.summaryCard, activeFilter === 'em_preparo' && styles.summaryCardActive]}
          onPress={() => setActiveFilter('em_preparo')}
        >
          <Text style={styles.summaryLabel}>Preparo</Text>
          <Text style={styles.summaryValue}>{filterCounts.em_preparo}</Text>
        </Pressable>
        <Pressable
          style={[styles.summaryCard, activeFilter === 'pronto' && styles.summaryCardActive]}
          onPress={() => setActiveFilter('pronto')}
        >
          <Text style={styles.summaryLabel}>Pronto</Text>
          <Text style={styles.summaryValue}>{filterCounts.pronto}</Text>
        </Pressable>
        <Pressable
          style={[styles.summaryCard, activeFilter === 'em_rota' && styles.summaryCardActive]}
          onPress={() => setActiveFilter('em_rota')}
        >
          <Text style={styles.summaryLabel}>Em rota</Text>
          <Text style={styles.summaryValue}>{filterCounts.em_rota}</Text>
        </Pressable>
        <Pressable
          style={[styles.summaryCard, styles.summaryExpiredCard, activeFilter === 'cancelado' && styles.summaryCardActive]}
          onPress={() => setActiveFilter('cancelado')}
        >
          <Text style={styles.summaryLabel}>Cancelados</Text>
          <Text style={styles.summaryValue}>{filterCounts.cancelado}</Text>
        </Pressable>
        <Pressable
          style={[styles.summaryCard, activeFilter === 'entregue' && styles.summaryCardActive]}
          onPress={() => setActiveFilter('entregue')}
        >
          <Text style={styles.summaryLabel}>Pedidos concluídos</Text>
          <Text style={styles.summaryValue}>{filterCounts.entregue}</Text>
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.centered}><ActivityIndicator color={BRAND} /></View>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.boardContent}>
          {visibleSections.map((section) => {
            const list = ordersByStatus[section.key] ?? [];
            return (
              <View key={section.key} style={styles.sectionCard}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>{section.title}</Text>
                  <View style={styles.sectionBadge}><Text style={styles.sectionBadgeText}>{list.length}</Text></View>
                </View>

                <ScrollView contentContainerStyle={styles.sectionList}>
                  {list.length === 0 ? (
                    <View style={styles.sectionEmpty}><Text style={styles.emptyText}>Sem pedidos nesta etapa.</Text></View>
                  ) : (
                    list.map((order) => {
                      const nextStatus = getNextStatus(order.status);
                      const delayed = isOrderDelayed(order);
                      return (
                        <Pressable key={order.id} style={[styles.orderCard, delayed && styles.orderCardDelayed]} onPress={() => setSelectedOrder(order)}>
                          <View style={styles.orderCardHeader}>
                            <Text style={styles.orderId}>{getOrderDisplayCode(order)}</Text>
                            <Text style={styles.orderTime}>{getElapsedLabel(order)}</Text>
                          </View>

                          <Text style={styles.orderCustomer} numberOfLines={1}>{order.customerName}</Text>
                          <Text style={styles.orderMeta} numberOfLines={1}>{order.itemsCount ?? order.items.length} item(s) • R$ {order.total.toFixed(2)}</Text>
                          <Text style={styles.orderMeta} numberOfLines={1}>{order.customerPhone || 'Sem telefone'}</Text>

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
                                  {order.status === 'novo' ? 'Aceitar' : LOCAL_STATUS_LABELS[nextStatus]}
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
                </ScrollView>
              </View>
            );
          })}
        </ScrollView>
      )}

      <Modal visible={!!selectedOrder} transparent animationType="fade" onRequestClose={() => setSelectedOrder(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            {selectedOrder ? (
              <>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Pedido {getOrderDisplayCode(selectedOrder)}</Text>
                  <Pressable onPress={() => setSelectedOrder(null)}><Text style={styles.closeText}>✕</Text></Pressable>
                </View>

                <ScrollView contentContainerStyle={styles.modalBody}>
                  <View style={styles.detailSection}>
                    <Text style={styles.detailTitle}>Cliente</Text>
                    <Text style={styles.detailText}>{selectedOrder.customerName || '-'}</Text>
                    <Text style={styles.detailMeta}>Telefone: {selectedOrder.customerPhone || '-'}</Text>
                    <Text style={styles.detailMeta}>Endereço: {selectedOrder.customerAddress || '-'}</Text>
                  </View>

                  <View style={styles.detailSection}>
                    <Text style={styles.detailTitle}>Itens</Text>
                    {selectedOrder.items.map((item, idx) => (
                      <View key={`${selectedOrder.id}-${idx}`} style={styles.itemRow}>
                        <Text style={styles.itemName} numberOfLines={1}>{item.qty}x {item.name}</Text>
                        <Text style={styles.itemPrice}>R$ {(item.qty * item.price).toFixed(2)}</Text>
                      </View>
                    ))}
                    <View style={[styles.itemRow, styles.totalRow]}>
                      <Text style={styles.totalLabel}>Total</Text>
                      <Text style={styles.totalValue}>R$ {selectedOrder.total.toFixed(2)}</Text>
                    </View>
                  </View>

                  <View style={styles.detailSection}>
                    <Text style={styles.detailTitle}>Informações</Text>
                    <Text style={styles.detailMeta}>Status: {LOCAL_STATUS_LABELS[selectedOrder.status]}</Text>
                    <Text style={styles.detailMeta}>Criado em: {formatDateTime(selectedOrder)}</Text>
                    <Text style={styles.detailMeta}>Pagamento: {selectedOrder.paymentMethod || '-'}</Text>
                    {selectedOrder.cancellationReason ? (
                      <Text style={styles.detailMeta}>Motivo do cancelamento: {selectedOrder.cancellationReason}</Text>
                    ) : null}
                  </View>

                  <View style={styles.detailSection}>
                    <Text style={styles.detailTitle}>Ações</Text>
                    <View style={styles.statusFlow}>
                      {ORDER_STATUS_FLOW.map((status) => {
                        const isCurrent = selectedOrder.status === status;
                        const isDisabled = updatingStatus || selectedOrder.status === 'cancelado' || isCurrent;
                        return (
                          <Pressable
                            key={status}
                            style={[
                              styles.statusBtn,
                              isCurrent && { backgroundColor: ORDER_STATUS_COLORS[status], borderColor: ORDER_STATUS_COLORS[status] },
                              isDisabled && !isCurrent && styles.statusBtnDisabled,
                            ]}
                            onPress={() => handleStatusChange(selectedOrder, status)}
                            disabled={isDisabled}
                          >
                            <Text style={[styles.statusBtnText, isCurrent && { color: '#fff' }]}>{LOCAL_STATUS_LABELS[status]}</Text>
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

      <Modal visible={!!cancelModal} transparent animationType="fade" onRequestClose={() => setCancelModal(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.cancelCard}>
            <Text style={styles.cancelTitle}>Cancelar pedido</Text>
            <Text style={styles.cancelSubtitle}>Informe o motivo para continuar.</Text>
            <TextInput
              style={styles.cancelInput}
              value={cancelModal?.reason ?? ''}
              onChangeText={(text) => setCancelModal((prev) => (prev ? { ...prev, reason: text } : prev))}
              placeholder="Motivo do cancelamento"
              multiline
            />
            <View style={styles.cancelActions}>
              <Pressable style={styles.cancelGhostBtn} onPress={() => setCancelModal(null)}>
                <Text style={styles.cancelGhostText}>Voltar</Text>
              </Pressable>
              <Pressable style={styles.cancelPrimaryBtn} onPress={handleCancelWithReason}>
                <Text style={styles.cancelPrimaryText}>Confirmar</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#faf6f0', padding: 12, gap: 10 },
  headerRow: { gap: 2 },
  title: { fontSize: 24, fontWeight: '800', color: '#2c1b12' },
  subtitle: { fontSize: 13, color: '#6e5a4b' },
  searchInput: {
    borderWidth: 1,
    borderColor: '#d9cfc2',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#fff',
    fontSize: 14,
  },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  summaryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  summaryCard: {
    minWidth: '30%',
    flexGrow: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: '#eadfd2',
  },
  summaryCardActive: {
    borderWidth: 2,
    borderColor: '#2c1b12',
  },
  summaryWarningCard: {
    backgroundColor: '#fff7d6',
    borderColor: '#e5c24d',
  },
  summaryExpiredCard: {
    backgroundColor: '#fde2e2',
    borderColor: '#e48d8d',
  },
  summaryLabel: {
    color: '#6e5a4b',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 4,
  },
  summaryValue: {
    color: '#2c1b12',
    fontSize: 20,
    fontWeight: '800',
  },

  boardContent: { gap: 12, paddingBottom: 24 },
  sectionCard: {
    width: 320,
    maxWidth: 320,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e8ddd4',
    padding: 10,
    gap: 8,
    maxHeight: '92%',
  },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitle: { fontSize: 13, fontWeight: '800', color: '#2c1b12' },
  sectionBadge: {
    minWidth: 24,
    borderRadius: 999,
    backgroundColor: '#2c1b12',
    paddingHorizontal: 8,
    paddingVertical: 3,
    alignItems: 'center',
  },
  sectionBadgeText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  sectionList: { gap: 8, paddingBottom: 8 },
  sectionEmpty: {
    minHeight: 72,
    borderRadius: 10,
    backgroundColor: '#f8f4f0',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  emptyText: { color: '#6e5a4b' },

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
  orderCustomer: { fontSize: 15, color: '#2c1b12', fontWeight: '800' },
  orderMeta: { fontSize: 12, color: '#5f4b3c' },
  orderFooterRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
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
  delayBadge: { fontSize: 11, color: '#9f2d2d', fontWeight: '800' },
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

  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(28, 20, 14, 0.48)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 16,
  },
  modalCard: {
    width: '100%',
    maxHeight: '94%',
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e8ddd4',
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e8ddd4',
  },
  modalTitle: { fontSize: 16, fontWeight: '800', color: '#2c1b12' },
  closeText: { fontSize: 18, color: '#6e5a4b', fontWeight: '700' },
  modalBody: { padding: 16, gap: 10, paddingBottom: 28 },
  detailSection: {
    gap: 6,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f0e8e0',
  },
  detailTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#a08060',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  detailText: { fontSize: 14, color: '#2c1b12', fontWeight: '600' },
  detailMeta: { fontSize: 13, color: '#6e5a4b' },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 3 },
  itemName: { flex: 1, fontSize: 14, color: '#2c1b12' },
  itemPrice: { fontSize: 14, color: '#2c1b12', fontWeight: '600' },
  totalRow: { borderTopWidth: 1, borderTopColor: '#f0e8e0', marginTop: 4, paddingTop: 8 },
  totalLabel: { fontSize: 14, fontWeight: '800', color: '#2c1b12' },
  totalValue: { fontSize: 15, fontWeight: '800', color: BRAND },
  statusFlow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  statusBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d9cfc2',
    backgroundColor: '#fff',
  },
  statusBtnDisabled: { opacity: 0.45 },
  statusBtnText: { fontSize: 12, fontWeight: '700', color: '#6e5a4b' },
  cancelOrderBtn: {
    borderWidth: 1,
    borderColor: BRAND,
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
    marginTop: 4,
  },
  cancelOrderBtnText: { color: BRAND, fontWeight: '700', fontSize: 13 },

  cancelCard: {
    width: '100%',
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e8ddd4',
    padding: 16,
    gap: 10,
  },
  cancelTitle: { fontSize: 18, fontWeight: '800', color: '#2c1b12' },
  cancelSubtitle: { fontSize: 13, color: '#6e5a4b' },
  cancelInput: {
    borderWidth: 1,
    borderColor: '#d9cfc2',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    backgroundColor: '#fdfaf6',
    minHeight: 90,
    textAlignVertical: 'top',
  },
  cancelActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
  cancelGhostBtn: {
    borderWidth: 1,
    borderColor: '#d9cfc2',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  cancelGhostText: { color: '#6e5a4b', fontWeight: '700', fontSize: 13 },
  cancelPrimaryBtn: {
    backgroundColor: BRAND,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  cancelPrimaryText: { color: '#fff', fontWeight: '800', fontSize: 13 },
});
