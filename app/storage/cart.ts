import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Product } from "@/types/Product";

export type CartItem = {
  productId: string;
  name: string;
  price: number;
  qty: number;
  category?: string | null;
};

const CART_KEY = "@aroucafood/cart/v1";

async function loadCart(): Promise<CartItem[]> {
  try {
    const raw = await AsyncStorage.getItem(CART_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.warn("Falha ao carregar carrinho", err);
    return [];
  }
}

async function saveCart(items: CartItem[]): Promise<void> {
  try {
    await AsyncStorage.setItem(CART_KEY, JSON.stringify(items));
  } catch (err) {
    console.warn("Falha ao salvar carrinho", err);
  }
}

export async function addOrIncrementItem(product: Product, quantity = 1): Promise<CartItem[]> {
  const cart = await loadCart();
  const idx = cart.findIndex((i) => i.productId === product.id);
  if (idx >= 0) {
    cart[idx].qty += quantity;
  } else {
    cart.push({
      productId: product.id,
      name: product.name,
      price: product.price,
      qty: quantity,
      category: (product as any)?.category ?? null,
    });
  }
  await saveCart(cart);
  return cart;
}

export async function setQuantity(productId: string, qty: number): Promise<CartItem[]> {
  const cart = await loadCart();
  const next = cart
    .map((item) => (item.productId === productId ? { ...item, qty } : item))
    .filter((item) => item.qty > 0);
  await saveCart(next);
  return next;
}

export async function removeItem(productId: string): Promise<CartItem[]> {
  const cart = (await loadCart()).filter((item) => item.productId !== productId);
  await saveCart(cart);
  return cart;
}

export async function clearCart(): Promise<void> {
  await saveCart([]);
}

export async function getCart(): Promise<CartItem[]> {
  return loadCart();
}

// Para quando fizer login: mescla carrinho local com remoto antes de sincronizar.
export function mergeCarts(localItems: CartItem[], remoteItems: CartItem[]): CartItem[] {
  const mergedMap = new Map<string, CartItem>();

  [...remoteItems, ...localItems].forEach((item) => {
    const existing = mergedMap.get(item.productId);
    if (existing) {
      mergedMap.set(item.productId, {
        ...existing,
        qty: existing.qty + item.qty,
      });
    } else {
      mergedMap.set(item.productId, item);
    }
  });

  return Array.from(mergedMap.values());
}