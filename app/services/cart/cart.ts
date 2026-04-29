import AsyncStorage from "@react-native-async-storage/async-storage";
import { auth, db } from "@/config/firebase";
import type { Product } from "@/types/Product";
import { deleteDoc, doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";

export type CartItem = {
  productId: string;
  name: string;
  price: number;
  qty: number;
  category?: string | null;
  image?: string | null;
  stock?: number | null;
};

const CART_KEY = "@aroucafood/cart/v1";
const REMOTE_CART_COLLECTION = "carts";

const sanitizeStock = (stock: unknown) => {
  if (typeof stock !== "number" || Number.isNaN(stock)) return null;
  return Math.max(0, stock);
};

const clampQtyByStock = (qty: number, stock?: number | null) => {
  if (typeof stock !== "number") return qty;
  return Math.min(qty, Math.max(0, stock));
};

const normalizeItems = (items: unknown): CartItem[] => {
  if (!Array.isArray(items)) return [];

  return items
    .map((item) => {
      if (!item || typeof item !== "object") return null;

      const stock = sanitizeStock((item as CartItem).stock);
      const qty = clampQtyByStock(Number((item as CartItem).qty) || 0, stock);
      if (qty <= 0) return null;

      return {
        productId: String((item as CartItem).productId ?? ""),
        name: String((item as CartItem).name ?? "Produto"),
        price: Number((item as CartItem).price) || 0,
        qty,
        category: typeof (item as CartItem).category === "string" ? (item as CartItem).category : null,
        image: typeof (item as CartItem).image === "string" ? (item as CartItem).image : null,
        stock,
      } satisfies CartItem;
    })
    .filter(Boolean) as CartItem[];
};

const sortItems = (items: CartItem[]) =>
  [...items].sort((a, b) => a.productId.localeCompare(b.productId, "pt-BR"));

const areCartsEqual = (left: CartItem[], right: CartItem[]) =>
  JSON.stringify(sortItems(left)) === JSON.stringify(sortItems(right));

async function loadRemoteCart(userId: string): Promise<CartItem[]> {
  try {
    const snapshot = await getDoc(doc(db, REMOTE_CART_COLLECTION, userId));
    if (!snapshot.exists()) return [];
    return normalizeItems(snapshot.data()?.items);
  } catch (err) {
    console.warn("Falha ao carregar carrinho remoto", err);
    return [];
  }
}

async function saveRemoteCart(userId: string, items: CartItem[]): Promise<void> {
  try {
    if (items.length === 0) {
      await deleteDoc(doc(db, REMOTE_CART_COLLECTION, userId));
      return;
    }

    await setDoc(
      doc(db, REMOTE_CART_COLLECTION, userId),
      {
        items,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  } catch (err) {
    console.warn("Falha ao salvar carrinho remoto", err);
  }
}

async function persistCart(items: CartItem[]): Promise<void> {
  await saveCart(items);

  const userId = auth.currentUser?.uid;
  if (!userId) return;

  await saveRemoteCart(userId, items);
}

async function syncAuthenticatedCart(localItems?: CartItem[]): Promise<CartItem[]> {
  const userId = auth.currentUser?.uid;
  const nextLocal = localItems ?? (await loadCart());

  if (!userId) {
    return nextLocal;
  }

  const remoteItems = await loadRemoteCart(userId);
  const merged = mergeCarts(nextLocal, remoteItems);

  if (!areCartsEqual(nextLocal, merged)) {
    await saveCart(merged);
  }

  if (!areCartsEqual(remoteItems, merged)) {
    await saveRemoteCart(userId, merged);
  }

  return merged;
}

async function loadCart(): Promise<CartItem[]> {
  try {
    const raw = await AsyncStorage.getItem(CART_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return normalizeItems(parsed);
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
  const productStock = sanitizeStock(product.stock);

  if (idx >= 0) {
    cart[idx] = {
      ...cart[idx],
      category: product.category ?? cart[idx].category ?? null,
      image: product.image ?? cart[idx].image ?? null,
      stock: productStock,
      qty: clampQtyByStock(cart[idx].qty + quantity, productStock),
    };
  } else {
    cart.push({
      productId: product.id,
      name: product.name,
      price: product.price,
      qty: clampQtyByStock(quantity, productStock),
      category: product.category ?? null,
      image: product.image ?? null,
      stock: productStock,
    });
  }

  const next = cart.filter((item) => item.qty > 0);
  await persistCart(next);
  return next;
}

export async function setQuantity(productId: string, qty: number): Promise<CartItem[]> {
  const cart = await loadCart();
  const next = cart
    .map((item) =>
      item.productId === productId
        ? { ...item, qty: clampQtyByStock(Math.max(0, qty), item.stock) }
        : item
    )
    .filter((item) => item.qty > 0);
  await persistCart(next);
  return next;
}

export async function removeItem(productId: string): Promise<CartItem[]> {
  const cart = (await loadCart()).filter((item) => item.productId !== productId);
  await persistCart(cart);
  return cart;
}

export async function clearCart(): Promise<void> {
  await persistCart([]);
}

export async function clearLocalCartCache(): Promise<void> {
  await saveCart([]);
}

export async function getCart(): Promise<CartItem[]> {
  if (!auth.currentUser) {
    return loadCart();
  }

  return syncAuthenticatedCart();
}

export async function syncCartWithCurrentUser(): Promise<CartItem[]> {
  return syncAuthenticatedCart();
}

// Para quando fizer login: mescla carrinho local com remoto antes de sincronizar.
export function mergeCarts(localItems: CartItem[], remoteItems: CartItem[]): CartItem[] {
  const mergedMap = new Map<string, CartItem>();

  [...remoteItems, ...localItems].forEach((item) => {
    const existing = mergedMap.get(item.productId);
    if (existing) {
      const mergedStock = sanitizeStock(existing.stock ?? item.stock);
      mergedMap.set(item.productId, {
        ...existing,
        category: existing.category ?? item.category ?? null,
        image: existing.image ?? item.image ?? null,
        stock: mergedStock,
        qty: clampQtyByStock(existing.qty + item.qty, mergedStock),
      });
    } else {
      mergedMap.set(item.productId, {
        ...item,
        stock: sanitizeStock(item.stock),
        qty: clampQtyByStock(item.qty, sanitizeStock(item.stock)),
      });
    }
  });

  return Array.from(mergedMap.values());
}