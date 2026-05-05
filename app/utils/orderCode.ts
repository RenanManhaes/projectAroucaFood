import type { Order } from '@/types/Order';

const ORDER_CODE_PREFIX = 'RE';

const hasOrderCode = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

export const generateOrderCode = () => {
  const random = Math.floor(100000 + Math.random() * 900000);
  return `${ORDER_CODE_PREFIX}${random}`;
};

export const getOrderDisplayCode = (order: Pick<Order, 'id' | 'orderCode'>) => {
  const code = hasOrderCode(order.orderCode)
    ? order.orderCode.trim().toUpperCase()
    : `${ORDER_CODE_PREFIX}${order.id.slice(-6).toUpperCase()}`;

  return `#${code}`;
};
