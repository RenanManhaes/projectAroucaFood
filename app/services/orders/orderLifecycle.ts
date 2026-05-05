import {
  collection,
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
  type Transaction,
} from 'firebase/firestore';

import { db } from '@/config/firebase';
import { isActiveOrderStatus, type OrderStatus } from '@/types/Order';

export type ActiveOrderLock = {
  activeOrderId: string;
  activeOrderCode?: string | null;
  customerId: string;
  status: OrderStatus;
};

const normalizeString = (value: unknown) => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
};

const lockRefByUser = (userId: string) => doc(db, 'activeOrders', userId);

const upsertLockForOrder = (
  tx: Transaction,
  userId: string,
  orderId: string,
  orderCode: string | null,
  status: OrderStatus
) => {
  tx.set(
    lockRefByUser(userId),
    {
      customerId: userId,
      activeOrderId: orderId,
      activeOrderCode: normalizeString(orderCode),
      status,
      updatedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
    },
    { merge: true }
  );
};

const releaseLockIfMatchesOrder = async (tx: Transaction, userId: string, orderId: string) => {
  const lockRef = lockRefByUser(userId);
  const lockSnap = await tx.get(lockRef);
  if (!lockSnap.exists()) return;
  const lockData = lockSnap.data() as Partial<ActiveOrderLock> | undefined;
  if (lockData?.activeOrderId === orderId) {
    tx.delete(lockRef);
  }
};

export const getActiveOrderLock = async (userId: string) => {
  const ref = lockRefByUser(userId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  const data = snap.data() as Partial<ActiveOrderLock>;
  return {
    activeOrderId: normalizeString(data?.activeOrderId) ?? '',
    activeOrderCode: normalizeString(data?.activeOrderCode),
    customerId: normalizeString(data?.customerId) ?? userId,
    status: (normalizeString(data?.status) ?? 'novo') as OrderStatus,
  };
};

type CreateOrderPayload = {
  orderCode: string;
  customerId: string;
  customerName: string;
  customerEmail?: string | null;
  customerPhone?: string | null;
  customerAddress?: string | null;
  customerCpf?: string | null;
  items: Array<{
    productId: string;
    name: string;
    price: number;
    qty: number;
    category?: string | null;
    image?: string | null;
  }>;
  total: number;
  status: OrderStatus;
  origem?: 'app' | 'web' | 'manual' | null;
  paymentMethod?: string | null;
  notes?: string | null;
  updatedBy?: string | null;
};

export const createOrderWithActiveLock = async (payload: CreateOrderPayload) => {
  const orderRef = doc(collection(db, 'pedidos'));
  const lockRef = lockRefByUser(payload.customerId);

  await runTransaction(db, async (tx) => {
    const lockSnap = await tx.get(lockRef);
    if (lockSnap.exists()) {
      throw new Error('ACTIVE_ORDER_EXISTS');
    }

    const firstItem = payload.items[0];
    tx.set(orderRef, {
      ...payload,
      firstItemName: normalizeString(firstItem?.name),
      itemsCount: payload.items.reduce((acc, item) => acc + (Number(item.qty) || 0), 0),
      isActive: isActiveOrderStatus(payload.status),
      statusUpdatedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    upsertLockForOrder(tx, payload.customerId, orderRef.id, payload.orderCode, payload.status);
  });

  return orderRef.id;
};

export const updateOrderStatusWithLock = async (
  params: {
    orderId: string;
    customerId?: string | null;
    orderCode?: string | null;
    newStatus: OrderStatus;
    cancellationReason?: string | null;
    updatedBy?: string | null;
  }
) => {
  const orderRef = doc(db, 'pedidos', params.orderId);

  await runTransaction(db, async (tx) => {
    const orderSnap = await tx.get(orderRef);
    if (!orderSnap.exists()) {
      throw new Error('ORDER_NOT_FOUND');
    }

    const orderData = orderSnap.data() as {
      customerId?: string | null;
      orderCode?: string | null;
      cancellationReason?: string | null;
      status?: OrderStatus;
    };

    const ownerId = normalizeString(params.customerId ?? orderData?.customerId);
    const orderCode = normalizeString(params.orderCode ?? orderData?.orderCode);
    const cancellationReason =
      params.newStatus === 'cancelado'
        ? normalizeString(params.cancellationReason ?? orderData?.cancellationReason)
        : null;

    tx.update(orderRef, {
      status: params.newStatus,
      isActive: isActiveOrderStatus(params.newStatus),
      cancellationReason,
      statusUpdatedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      updatedBy: normalizeString(params.updatedBy),
    });

    if (!ownerId) return;

    if (isActiveOrderStatus(params.newStatus)) {
      upsertLockForOrder(tx, ownerId, params.orderId, orderCode, params.newStatus);
    } else {
      await releaseLockIfMatchesOrder(tx, ownerId, params.orderId);
    }
  });
};
