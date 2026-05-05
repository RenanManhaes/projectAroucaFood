import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { collection, onSnapshot, query, where } from 'firebase/firestore';

import { auth, db } from '@/config/firebase';
import type { Order } from '@/types/Order';
import { getOrderDisplayCode } from '@/utils/orderCode';
import { BRAND_PRIMARY } from '@/constants/ui/colors';

const BRAND = BRAND_PRIMARY;
const WHATSAPP_NUMBER = '5511947224546';

const normalizeOptionalString = (value: unknown) => {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
};

const getOrderStatusLabel = (status: Order['status']) => {
  if (status === 'novo') return 'Aguardando o aceite da loja';
  if (status === 'em_preparo') return 'Em preparo';
  if (status === 'pronto') return 'Pedido pronto';
  if (status === 'em_rota') return 'Pedido em rota';
  if (status === 'entregue') return 'Pedido concluido';
  return 'Pedido cancelado';
};

const getOrderStatusColor = (status: Order['status']) => {
  if (status === 'cancelado') return '#9f2d2d';
  if (status === 'entregue') return '#5e6d63';
  if (status === 'em_rota') return '#1f5fbf';
  if (status === 'pronto') return '#1f8f4a';
  if (status === 'em_preparo') return '#b17600';
  return '#2f65b8';
};

const compareByCreatedAtDesc = (left: Order, right: Order) => {
  const leftTime = typeof left.createdAt?.toDate === 'function' ? left.createdAt.toDate().getTime() : 0;
  const rightTime = typeof right.createdAt?.toDate === 'function' ? right.createdAt.toDate().getTime() : 0;
  return rightTime - leftTime;
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

export default function UserPedidosScreen() {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (nextUser) => setUser(nextUser));
    return unsub;
  }, []);

  useEffect(() => {
    if (!user) {
      setOrders([]);
      setLoading(false);
      setLoadError(null);
      return;
    }

    setLoading(true);
    setLoadError(null);
    const byIdMap = new Map<string, Order>();
    const byEmailMap = new Map<string, Order>();

    const buildOrder = (d: { id: string; data: () => any }): Order => {
      const data = d.data();
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
    };

    const syncOrders = () => {
      const merged = new Map<string, Order>();
      byEmailMap.forEach((order, key) => merged.set(key, order));
      byIdMap.forEach((order, key) => merged.set(key, order));
      setOrders(Array.from(merged.values()).sort(compareByCreatedAtDesc));
      setLoading(false);
    };

    const qById = query(collection(db, 'pedidos'), where('customerId', '==', user.uid));
    const unsubById = onSnapshot(
      qById,
      (snap) => {
        byIdMap.clear();
        snap.docs.forEach((d) => {
          byIdMap.set(d.id, buildOrder(d));
        });
        syncOrders();
      },
      (error) => {
        byIdMap.clear();
        setLoadError(error?.message || 'Não foi possível carregar seus pedidos.');
        syncOrders();
      }
    );

    const email = (user.email ?? '').trim().toLowerCase();
    let unsubByEmail: (() => void) | null = null;

    if (email) {
      const qByEmail = query(collection(db, 'pedidos'), where('customerEmail', '==', email));
      unsubByEmail = onSnapshot(
        qByEmail,
        (snap) => {
          byEmailMap.clear();
          snap.docs.forEach((d) => {
            byEmailMap.set(d.id, buildOrder(d));
          });
          syncOrders();
        },
        (error) => {
          byEmailMap.clear();
          setLoadError(error?.message || 'Não foi possível carregar seus pedidos.');
          syncOrders();
        }
      );
    }

    return () => {
      unsubById();
      if (unsubByEmail) unsubByEmail();
    };
  }, [user]);

  const hasOpenOrders = useMemo(
    () => orders.some((order) => order.status !== 'cancelado' && order.status !== 'entregue'),
    [orders]
  );

  const openWhatsapp = async () => {
    const text = encodeURIComponent('Olá, preciso de ajuda com o cancelamento do meu pedido.');
    const url = `https://wa.me/${WHATSAPP_NUMBER}?text=${text}`;
    const supported = await Linking.canOpenURL(url);
    if (!supported) return;
    await Linking.openURL(url);
  };

  if (user === undefined) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.centered}>
          <ActivityIndicator color={BRAND} />
        </View>
      </SafeAreaView>
    );
  }

  if (!user) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.emptyWrap}>
          <Text style={styles.title}>Pedidos</Text>
          <Text style={styles.emptyText}>Faça login para acessar seus pedidos.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Pedidos</Text>
        <Text style={styles.subtitle}>{orders.length} pedido(s)</Text>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={BRAND} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {loadError ? (
            <View style={styles.errorWrap}>
              <Text style={styles.errorText}>Erro ao carregar pedidos: {loadError}</Text>
            </View>
          ) : null}

          {orders.length === 0 ? (
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyText}>Você ainda não realizou pedidos.</Text>
            </View>
          ) : (
            orders.map((order) => (
              <View key={order.id} style={styles.orderCard}>
                <View style={styles.orderHeader}>
                  <Text style={styles.orderCode}>{getOrderDisplayCode(order)}</Text>
                  <Text style={styles.orderDate}>{formatDateTime(order)}</Text>
                </View>

                <Text style={[styles.orderStatus, { color: getOrderStatusColor(order.status) }]}>
                  {getOrderStatusLabel(order.status)}
                </Text>

                <Text style={styles.orderMeta}> {order.itemsCount ?? order.items.length} item(s) • R$ {order.total.toFixed(2)}</Text>
                <Text style={styles.orderMeta}>Pagamento: {order.paymentMethod || '-'}</Text>
                {order.notes ? <Text style={styles.orderMeta}>Obs: {order.notes}</Text> : null}
                {order.cancellationReason ? <Text style={styles.orderMeta}>Motivo: {order.cancellationReason}</Text> : null}
              </View>
            ))
          )}

          {hasOpenOrders ? (
            <View style={styles.helpCard}>
              <Text style={styles.helpTitle}>Para cancelar um pedido</Text>
              <Text style={styles.helpText}>Entre em contato conosco via WhatsApp.</Text>
              <Pressable style={styles.whatsBtn} onPress={openWhatsapp}>
                <Text style={styles.whatsBtnText}>Falar no WhatsApp</Text>
              </Pressable>
            </View>
          ) : null}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#faf6f0', paddingHorizontal: 14, paddingTop: 8 },
  headerRow: { gap: 2, marginBottom: 10 },
  title: { fontSize: 24, fontWeight: '800', color: '#2c1b12' },
  subtitle: { fontSize: 13, color: '#6e5a4b' },
  content: { gap: 10, paddingBottom: 28 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyWrap: {
    borderWidth: 1,
    borderColor: '#eadfd2',
    borderRadius: 12,
    backgroundColor: '#fff',
    padding: 14,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  emptyText: { color: '#6e5a4b', textAlign: 'center' },
  errorWrap: {
    borderWidth: 1,
    borderColor: '#f0d4d4',
    borderRadius: 12,
    backgroundColor: '#fff5f5',
    padding: 10,
  },
  errorText: { color: '#9f2d2d', fontSize: 12, fontWeight: '700' },

  orderCard: {
    borderWidth: 1,
    borderColor: '#eadfd2',
    borderRadius: 12,
    backgroundColor: '#fff',
    padding: 12,
    gap: 6,
  },
  orderHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  orderCode: { color: '#2c1b12', fontWeight: '800' },
  orderDate: { color: '#8f7766', fontSize: 12 },
  orderStatus: { fontSize: 14, fontWeight: '800' },
  orderMeta: { color: '#5f4b3c', fontSize: 12 },

  helpCard: {
    marginTop: 4,
    borderWidth: 1,
    borderColor: '#d9cfc2',
    borderRadius: 12,
    padding: 12,
    backgroundColor: '#fffaf4',
    gap: 8,
  },
  helpTitle: { color: '#2c1b12', fontWeight: '800' },
  helpText: { color: '#6e5a4b' },
  whatsBtn: {
    alignSelf: 'flex-start',
    borderRadius: 10,
    backgroundColor: '#1f8f4a',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  whatsBtnText: { color: '#fff', fontWeight: '800' },
});
