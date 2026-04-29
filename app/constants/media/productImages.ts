import { ImageSourcePropType } from "react-native";

export type ProductImageKey = never;

export const PRODUCT_IMAGES: Record<string, ImageSourcePropType> = {};

export const PRODUCT_IMAGE_LABELS: Record<string, string> = {};

export const PRODUCT_IMAGE_OPTIONS: ProductImageKey[] = [];

const REMOTE_IMAGE_PATTERN = /^(https?:\/\/|blob:|data:image\/|file:\/\/|content:\/\/|ph:\/\/|assets-library:\/\/)/i;

export function isLocalProductImageKey(value?: string | null): value is ProductImageKey {
  if (!value) return false;
  return value.trim() in PRODUCT_IMAGES;
}

export function getProductImage(key?: string | null) {
  if (!key) return null;
  const normalized = key.trim();
  if (REMOTE_IMAGE_PATTERN.test(normalized)) {
    return { uri: normalized } as ImageSourcePropType;
  }
  if (isLocalProductImageKey(normalized)) {
    return PRODUCT_IMAGES[normalized];
  }
  return null;
}

export function getProductImageLabel(key?: string | null) {
  if (!key) return '';
  const normalized = key.trim();
  if (REMOTE_IMAGE_PATTERN.test(normalized)) {
    return 'Imagem enviada';
  }
  if (isLocalProductImageKey(normalized)) {
    return PRODUCT_IMAGE_LABELS[normalized];
  }
  return normalized.replace(/\.[^.]+$/, '');
}
