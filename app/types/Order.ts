import type { Timestamp } from 'firebase/firestore';

export type OrderStatus =
  | 'novo'
  | 'em_preparo'
  | 'pronto'
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
  customerName: string;
  customerEmail?: string | null;
  customerPhone?: string | null;
  customerAddress?: string | null;
  items: OrderItem[];
  total: number;
  status: OrderStatus;
  origem?: 'app' | 'web' | 'manual' | null;
  notes?: string | null;
  paymentMethod?: string | null;
  cancellationReason?: string | null;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
  updatedBy?: string | null;
};

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  novo: 'Novo',
  em_preparo: 'Em preparo',
  pronto: 'Pronto',
  entregue: 'Entregue',
  cancelado: 'Cancelado',
};

export const ORDER_STATUS_COLORS: Record<OrderStatus, string> = {
  novo: '#3b82f6',
  em_preparo: '#f59e0b',
  pronto: '#22c55e',
  entregue: '#6b7280',
  cancelado: '#ef4444',
};

export const ORDER_STATUS_FLOW: OrderStatus[] = [
  'novo',
  'em_preparo',
  'pronto',
  'entregue',
];
