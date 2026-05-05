import AsyncStorage from "@react-native-async-storage/async-storage";
import { auth, db } from "@/config/firebase";
import { isAdminEmail } from "@/constants/auth/adminEmails";
import type { Product } from "@/types/Product";
import { deleteDoc, doc, getDoc, serverTimestamp, setDoc, Timestamp } from "firebase/firestore";

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
const GUEST_CART_TTL_MS = 12 * 60 * 60 * 1000;
const USER_CART_TTL_MS = 2 * 24 * 60 * 60 * 1000;

type LocalCartPayload = {
  items: unknown;
  expiresAt?: number;
  scope?: "guest" | "user";
  ownerId?: string | null;
};

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

const parseTimestampMs = (value: unknown) => {
  if (!value) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value instanceof Date) return value.getTime();
  if (typeof (value as { toMillis?: unknown }).toMillis === "function") {
    try {
      return (value as { toMillis: () => number }).toMillis();
    } catch {
      return null;
    }
  }
  return null;
};

const resolveLocalCartTtl = () => (auth.currentUser ? USER_CART_TTL_MS : GUEST_CART_TTL_MS);

const isLocalPayload = (value: unknown): value is LocalCartPayload => {
  return !!value && typeof value === "object" && Array.isArray((value as LocalCartPayload).items);
};

const isCurrentUserAdmin = () => isAdminEmail(auth.currentUser?.email);

async function clearAdminCartIfNeeded(): Promise<void> {
  if (!auth.currentUser?.uid || !isCurrentUserAdmin()) return;
  await saveCart([]);
  await saveRemoteCart(auth.currentUser.uid, []);
}

async function loadRemoteCart(userId: string): Promise<CartItem[]> {
  try {
    const snapshot = await getDoc(doc(db, REMOTE_CART_COLLECTION, userId));
    if (!snapshot.exists()) return [];
    const data = snapshot.data();
    const expiresAtMs = parseTimestampMs(data?.expiresAt);
    if (typeof expiresAtMs === "number" && Date.now() > expiresAtMs) {
      await deleteDoc(doc(db, REMOTE_CART_COLLECTION, userId));
      return [];
    }
    return normalizeItems(data?.items);
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
        expiresAt: Timestamp.fromMillis(Date.now() + USER_CART_TTL_MS),
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

    if (Array.isArray(parsed)) {
      return normalizeItems(parsed);
    }

    if (isLocalPayload(parsed)) {
      const expiresAtMs = Number(parsed.expiresAt) || 0;
      if (expiresAtMs > 0 && Date.now() > expiresAtMs) {
        await AsyncStorage.removeItem(CART_KEY);
        return [];
      }
      return normalizeItems(parsed.items);
    }

    return [];
  } catch (err) {
    console.warn("Falha ao carregar carrinho", err);
    return [];
  }
}

async function saveCart(items: CartItem[]): Promise<void> {
  try {
    const payload: LocalCartPayload = {
      items,
      expiresAt: Date.now() + resolveLocalCartTtl(),
      scope: auth.currentUser ? "user" : "guest",
      ownerId: auth.currentUser?.uid ?? null,
    };
    await AsyncStorage.setItem(CART_KEY, JSON.stringify(payload));
  } catch (err) {
    console.warn("Falha ao salvar carrinho", err);
  }
}

export async function addOrIncrementItem(product: Product, quantity = 1): Promise<CartItem[]> {
  if (isCurrentUserAdmin()) {
    await clearAdminCartIfNeeded();
    return [];
  }

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
  if (isCurrentUserAdmin()) {
    await clearAdminCartIfNeeded();
    return [];
  }

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
  if (isCurrentUserAdmin()) {
    await clearAdminCartIfNeeded();
    return [];
  }

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
  if (isCurrentUserAdmin()) {
    await clearAdminCartIfNeeded();
    return [];
  }

  if (!auth.currentUser) {
    return loadCart();
  }

  return syncAuthenticatedCart();
}

export async function syncCartWithCurrentUser(): Promise<CartItem[]> {
  if (isCurrentUserAdmin()) {
    await clearAdminCartIfNeeded();
    return [];
  }

  return syncAuthenticatedCart();
}

// Para quando fizer login: mescla carrinho local com remoto antes de sincronizar.
export function mergeCarts(localItems: CartItem[], remoteItems: CartItem[]): CartItem[] {
  const mergedMap = new Map<string, CartItem>();

  [...remoteItems, ...localItems].forEach((item) => {
    const existing = mergedMap.get(item.productId);
    if (existing) {
      const mergedStock = sanitizeStock(existing.stock ?? item.stock);
      // Local e remoto costumam representar o mesmo estado sincronizado.
      // Usar soma aqui gera efeito 2x/4x ao abrir o carrinho repetidas vezes.
      mergedMap.set(item.productId, {
        ...existing,
        category: existing.category ?? item.category ?? null,
        image: existing.image ?? item.image ?? null,
        stock: mergedStock,
        qty: clampQtyByStock(Math.max(existing.qty, item.qty), mergedStock),
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