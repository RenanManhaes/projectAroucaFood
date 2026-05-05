import type { Timestamp } from 'firebase/firestore';

export type OrderStatus =
  | 'novo'
  | 'em_preparo'
  | 'pronto'
  | 'em_rota'
  | 'entregue'
  | 'cancelado';

export type OrderItem = {
  productId?: string;
  name: string;
  price: number;
  qty: number;
  category?: string | null;
  image?: string | null;
};

export type Order = {
  id: string;
  orderCode?: string | null;
  customerId?: string | null;
  customerName: string;
  customerEmail?: string | null;
  customerPhone?: string | null;
  customerAddress?: string | null;
  items: OrderItem[];
  itemsCount?: number;
  firstItemName?: string | null;
  total: number;
  status: OrderStatus;
  isActive?: boolean;
  origem?: 'app' | 'web' | 'manual' | null;
  notes?: string | null;
  paymentMethod?: string | null;
  cancellationReason?: string | null;
  createdAt?: Timestamp | null;
  statusUpdatedAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
  updatedBy?: string | null;
};

export const ACTIVE_ORDER_STATUSES: OrderStatus[] = [
  'novo',
  'em_preparo',
  'pronto',
  'em_rota',
];

export const isActiveOrderStatus = (status: OrderStatus) => ACTIVE_ORDER_STATUSES.includes(status);

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  novo: 'Novo',
  em_preparo: 'Em preparo',
  pronto: 'Pronto',
  em_rota: 'Em rota',
  entregue: 'Entregue',
  cancelado: 'Cancelado',
};

export const ORDER_STATUS_COLORS: Record<OrderStatus, string> = {
  novo: '#3b82f6',
  em_preparo: '#f59e0b',
  pronto: '#22c55e',
  em_rota: '#2563eb',
  entregue: '#6b7280',
  cancelado: '#ef4444',
};

export const ORDER_STATUS_FLOW: OrderStatus[] = [
  'novo',
  'em_preparo',
  'pronto',
  'em_rota',
  'entregue',
];
