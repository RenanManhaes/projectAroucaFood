import { deleteObject, getDownloadURL, ref, uploadBytes } from 'firebase/storage';

import { storage } from '@/config/firebase';

type NativeImageUpload = {
  uri: string;
  fileName?: string | null;
  mimeType?: string | null;
};

type ProductImageUpload = File | NativeImageUpload;

const sanitizeFileName = (fileName: string) => {
  const normalized = fileName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '-');

  return normalized.replace(/-+/g, '-').toLowerCase();
};

const isWebFile = (file: ProductImageUpload): file is File => {
  return typeof File !== 'undefined' && file instanceof File;
};

const getUploadName = (file: ProductImageUpload) => {
  if (isWebFile(file)) {
    return file.name || 'produto.jpg';
  }

  return file.fileName || file.uri.split('/').pop() || 'produto.jpg';
};

const getUploadContentType = (file: ProductImageUpload) => {
  if (isWebFile(file)) {
    return file.type || 'image/jpeg';
  }

  return file.mimeType || 'image/jpeg';
};

const getUploadBlob = async (file: ProductImageUpload) => {
  if (isWebFile(file)) {
    return file;
  }

  try {
    const response = await fetch(file.uri);
    if (!response.ok) {
      throw new Error(`Falha ao carregar imagem local (${response.status})`);
    }
    return await response.blob();
  } catch {
    return await new Promise<Blob>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.onerror = () => reject(new Error('Falha ao converter imagem para upload.'));
      xhr.onload = () => resolve(xhr.response as Blob);
      xhr.responseType = 'blob';
      xhr.open('GET', file.uri, true);
      xhr.send();
    });
  }
};

export async function uploadProductImage(file: ProductImageUpload, productId?: string) {
  const safeName = sanitizeFileName(getUploadName(file));
  const folder = productId ? `products/${productId}` : 'products/drafts';
  const storagePath = `${folder}/${Date.now()}-${safeName}`;
  const storageRef = ref(storage, storagePath);
  try {
    const uploadBlob = await getUploadBlob(file);

    await uploadBytes(storageRef, uploadBlob, {
      contentType: getUploadContentType(file),
    });

    const downloadURL = await getDownloadURL(storageRef);
    return { downloadURL, storagePath };
  } catch (err: unknown) {
    const parsed = err as { serverResponse?: string; code?: string };
    const serverResponse = parsed?.serverResponse ? ` | server: ${parsed.serverResponse}` : '';
    throw new Error(`Falha ao enviar imagem para o Storage (${parsed?.code ?? 'sem-codigo'})${serverResponse}`);
  }
}

export async function deleteProductImage(storagePath?: string | null) {
  if (!storagePath) return;
  const storageRef = ref(storage, storagePath);
  await deleteObject(storageRef);
}
