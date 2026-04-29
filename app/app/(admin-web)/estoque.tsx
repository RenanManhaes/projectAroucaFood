import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import { deleteProductImage, uploadProductImage } from '@/services/products/productImageStorage';
import { db } from '@/config/firebase';
import { BRAND_PRIMARY } from '@/constants/ui/colors';
import {
  getProductImage,
  getProductImageLabel,
} from '@/constants/media/productImages';
import type { Product } from '@/types/Product';
import { formatExpiryInput, getExpiryMeta, toDisplayExpiryDate, toStorageExpiryDate } from '@/utils/expiry';

const BRAND = BRAND_PRIMARY;
const CROP_FRAME_SIZE = 280;
const PRODUCT_IMAGE_TARGET_SIZE = 2000;
const DEFAULT_CATEGORIES = [
  'Churrasco',
  'Suínos e Frangos',
  'Bebidas',
  'Cervejas',
  'Espetos',
  'Itens para churrasco',
  'Hamburguer',
  'Acompanhamentos',
  'Kits',
];

type ExpiryFilter = 'all' | 'warning' | 'expired';
type SortDirection = 'asc' | 'desc';
type SortColumn = 'name' | 'category' | 'price' | 'stock' | 'expiryDate' | 'highlights';

type SortState = {
  column: SortColumn;
  direction: SortDirection;
} | null;

const getExpiryStatus = (expiryDate?: string | null) => {
  const meta = getExpiryMeta(expiryDate);
  if (meta.diffDays === null) return { label: '-', expired: false, warning: false };
  const diff = meta.diffDays;
  if (diff < 0) return { label: 'Vencido', expired: true, warning: false };
  if (diff === 0) return { label: 'Vence hoje', expired: false, warning: true };
  if (diff < 30) return { label: `${diff}d`, expired: false, warning: true };
  return { label: `${diff}d`, expired: false, warning: false };
};

const isTemporaryImageUri = (value?: string | null) => {
  if (!value) return false;
  return value.startsWith('blob:');
};

const getErrorMessage = (error: unknown, fallback: string) => {
  return error instanceof Error ? error.message : fallback;
};

type FormState = {
  id: string;
  name: string;
  price: string;
  category: string;
  stock: string;
  expiryDate: string;
  highlights: boolean;
  image: string;
  imageStoragePath: string;
};

type PendingUpload = {
  file: File;
  previewUrl: string;
  fileName: string;
};

type CropDraft = {
  file: File;
  previewUrl: string;
  fileName: string;
  width: number;
  height: number;
};

const emptyForm = (): FormState => ({
  id: '', name: '', price: '', category: '', stock: '', expiryDate: '', highlights: false, image: '', imageStoragePath: '',
});

export default function EstoqueWebScreen() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [expiryFilter, setExpiryFilter] = useState<ExpiryFilter>('all');
  const [form, setForm] = useState<FormState>(emptyForm());
  const [pendingUpload, setPendingUpload] = useState<PendingUpload | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [saving, setSaving] = useState(false);
  const [panel, setPanel] = useState(false);
  const [sortState, setSortState] = useState<SortState>(null);
  const [categoryMenuOpen, setCategoryMenuOpen] = useState(false);
  const [dbCategories, setDbCategories] = useState<string[]>([]);
  const [cropDraft, setCropDraft] = useState<CropDraft | null>(null);
  const [cropScale, setCropScale] = useState(1);
  const [cropOffsetX, setCropOffsetX] = useState(0);
  const [cropOffsetY, setCropOffsetY] = useState(0);
  const [preparingCrop, setPreparingCrop] = useState(false);

  const categoryOptions = useMemo(() => {
    const unique = new Map<string, string>();

    const pushCategory = (value?: string | null) => {
      const name = typeof value === 'string' ? value.trim() : '';
      if (!name) return;
      const key = name.toLowerCase();
      if (!unique.has(key)) unique.set(key, name);
    };

    DEFAULT_CATEGORIES.forEach(pushCategory);
    dbCategories.forEach(pushCategory);
    products.forEach((product) => pushCategory(product.category));

    return Array.from(unique.values());
  }, [dbCategories, products]);

  useEffect(() => {
    return () => {
      if (pendingUpload?.previewUrl) {
        URL.revokeObjectURL(pendingUpload.previewUrl);
      }
    };
  }, [pendingUpload]);

  useEffect(() => {
    return () => {
      if (cropDraft?.previewUrl) {
        URL.revokeObjectURL(cropDraft.previewUrl);
      }
    };
  }, [cropDraft]);

  useEffect(() => {
    let mounted = true;

    const loadCategories = async () => {
      try {
        const snap = await getDocs(collection(db, 'categorias'));
        const fetched = snap.docs
          .map((d) => {
            const data = d.data();
            if (typeof data?.nome === 'string') return data.nome.trim();
            if (typeof data?.name === 'string') return data.name.trim();
            return '';
          })
          .filter(Boolean);
        if (mounted) {
          setDbCategories(fetched);
        }
      } catch {
        if (mounted) {
          setDbCategories([]);
        }
      }
    };

    void loadCategories();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'produtos'),
      (snap) => {
        const list: Product[] = snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            name: data?.name ?? '',
            price: Number(data?.price) || 0,
            category: data?.category ?? '-',
            image: typeof data?.image === 'string' ? data.image : null,
            imageStoragePath: typeof data?.imageStoragePath === 'string' ? data.imageStoragePath : null,
            highlights: Boolean(data?.highlights),
            stock: Number(data?.stock ?? 0),
            expiryDate: typeof data?.expiryDate === 'string' ? data.expiryDate : null,
          };
        });
        setProducts(list);
        setLoading(false);
      },
      () => {
        setProducts([]);
        setLoading(false);
      }
    );
    return unsub;
  }, []);

  const summary = useMemo(() => {
    const warning = products.filter((p) => { const s = getExpiryStatus(p.expiryDate); return s.warning && !s.expired; }).length;
    const expired = products.filter((p) => getExpiryStatus(p.expiryDate).expired).length;
    return { total: products.length, warning, expired };
  }, [products]);

  const filtered = useMemo(() => {
    let list = products;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((p) => p.name.toLowerCase().includes(q) || (p.category ?? '').toLowerCase().includes(q));
    }
    if (expiryFilter === 'warning') list = list.filter((p) => { const s = getExpiryStatus(p.expiryDate); return s.warning && !s.expired; });
    if (expiryFilter === 'expired') list = list.filter((p) => getExpiryStatus(p.expiryDate).expired);
    return list;
  }, [products, search, expiryFilter]);

  const sortedProducts = useMemo(() => {
    if (!sortState) return filtered;

    const sorted = [...filtered];
    const directionFactor = sortState.direction === 'asc' ? 1 : -1;

    const compareText = (a: string, b: string) =>
      a.localeCompare(b, 'pt-BR', { sensitivity: 'base' });

    const compareNumber = (a: number, b: number) => a - b;

    const compareExpiry = (a?: string | null, b?: string | null) => {
      const aTime = a ? new Date(`${a}T00:00:00`).getTime() : Number.POSITIVE_INFINITY;
      const bTime = b ? new Date(`${b}T00:00:00`).getTime() : Number.POSITIVE_INFINITY;
      const safeATime = Number.isNaN(aTime) ? Number.POSITIVE_INFINITY : aTime;
      const safeBTime = Number.isNaN(bTime) ? Number.POSITIVE_INFINITY : bTime;
      return safeATime - safeBTime;
    };

    sorted.sort((left, right) => {
      let result = 0;

      if (sortState.column === 'name') {
        result = compareText(left.name ?? '', right.name ?? '');
      } else if (sortState.column === 'category') {
        result = compareText(left.category ?? '', right.category ?? '');
      } else if (sortState.column === 'price') {
        result = compareNumber(Number(left.price) || 0, Number(right.price) || 0);
      } else if (sortState.column === 'stock') {
        result = compareNumber(Number(left.stock) || 0, Number(right.stock) || 0);
      } else if (sortState.column === 'expiryDate') {
        result = compareExpiry(left.expiryDate, right.expiryDate);
      } else if (sortState.column === 'highlights') {
        result = compareNumber(left.highlights ? 1 : 0, right.highlights ? 1 : 0);
      }

      if (result === 0) {
        return compareText(left.name ?? '', right.name ?? '');
      }

      return result * directionFactor;
    });

    return sorted;
  }, [filtered, sortState]);

  const toggleSort = (column: SortColumn) => {
    setSortState((current) => {
      if (!current || current.column !== column) {
        return { column, direction: 'asc' };
      }

      if (current.direction === 'asc') {
        return { column, direction: 'desc' };
      }

      return null;
    });
  };

  const getSortIndicator = (column: SortColumn) => {
    if (!sortState || sortState.column !== column) return '↕';
    return sortState.direction === 'asc' ? '↑' : '↓';
  };

  const clearPendingUpload = () => {
    if (pendingUpload?.previewUrl) {
      URL.revokeObjectURL(pendingUpload.previewUrl);
    }
    setPendingUpload(null);
  };

  const closeCropModal = () => {
    if (cropDraft?.previewUrl) {
      URL.revokeObjectURL(cropDraft.previewUrl);
    }
    setCropDraft(null);
    setCropScale(1);
    setCropOffsetX(0);
    setCropOffsetY(0);
    setPreparingCrop(false);
  };

  const clampCropOffsets = (nextScale: number, nextX: number, nextY: number) => {
    if (!cropDraft) return { x: nextX, y: nextY };
    const coverScale = Math.max(CROP_FRAME_SIZE / cropDraft.width, CROP_FRAME_SIZE / cropDraft.height);
    const displayedWidth = cropDraft.width * coverScale * nextScale;
    const displayedHeight = cropDraft.height * coverScale * nextScale;
    const maxOffsetX = Math.max(0, (displayedWidth - CROP_FRAME_SIZE) / 2);
    const maxOffsetY = Math.max(0, (displayedHeight - CROP_FRAME_SIZE) / 2);
    return {
      x: Math.max(-maxOffsetX, Math.min(maxOffsetX, nextX)),
      y: Math.max(-maxOffsetY, Math.min(maxOffsetY, nextY)),
    };
  };

  const applyCropScale = (value: number) => {
    const bounded = Math.max(1, Math.min(3, Number(value.toFixed(2))));
    const clamped = clampCropOffsets(bounded, cropOffsetX, cropOffsetY);
    setCropScale(bounded);
    setCropOffsetX(clamped.x);
    setCropOffsetY(clamped.y);
  };

  const nudgeCrop = (axis: 'x' | 'y', delta: number) => {
    const nextX = axis === 'x' ? cropOffsetX + delta : cropOffsetX;
    const nextY = axis === 'y' ? cropOffsetY + delta : cropOffsetY;
    const clamped = clampCropOffsets(cropScale, nextX, nextY);
    setCropOffsetX(clamped.x);
    setCropOffsetY(clamped.y);
  };

  const confirmCropSelection = async () => {
    if (!cropDraft || typeof document === 'undefined') return;

    try {
      const coverScale = Math.max(CROP_FRAME_SIZE / cropDraft.width, CROP_FRAME_SIZE / cropDraft.height);
      const effectiveScale = coverScale * cropScale;
      const displayedWidth = cropDraft.width * effectiveScale;
      const displayedHeight = cropDraft.height * effectiveScale;

      const left = (CROP_FRAME_SIZE - displayedWidth) / 2 + cropOffsetX;
      const top = (CROP_FRAME_SIZE - displayedHeight) / 2 + cropOffsetY;

      const sourceX = Math.max(0, -left / effectiveScale);
      const sourceY = Math.max(0, -top / effectiveScale);
      const sourceW = Math.min(cropDraft.width - sourceX, CROP_FRAME_SIZE / effectiveScale);
      const sourceH = Math.min(cropDraft.height - sourceY, CROP_FRAME_SIZE / effectiveScale);

      const image = new window.Image();
      image.src = cropDraft.previewUrl;

      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error('Falha ao preparar recorte.'));
      });

      const canvas = document.createElement('canvas');
      canvas.width = PRODUCT_IMAGE_TARGET_SIZE;
      canvas.height = PRODUCT_IMAGE_TARGET_SIZE;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Falha ao preparar o editor de imagem.');

      ctx.drawImage(image, sourceX, sourceY, sourceW, sourceH, 0, 0, PRODUCT_IMAGE_TARGET_SIZE, PRODUCT_IMAGE_TARGET_SIZE);

      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((result) => {
          if (!result) {
            reject(new Error('Não foi possível gerar a imagem recortada.'));
            return;
          }
          resolve(result);
        }, 'image/jpeg', 0.95);
      });

      clearPendingUpload();

      const croppedFile = new File([blob], cropDraft.fileName.replace(/\.[^.]+$/, '.jpg'), {
        type: 'image/jpeg',
      });
      const croppedPreviewUrl = URL.createObjectURL(blob);

      setPendingUpload({
        file: croppedFile,
        previewUrl: croppedPreviewUrl,
        fileName: croppedFile.name,
      });
      setForm((current) => ({
        ...current,
        image: croppedPreviewUrl,
        imageStoragePath: current.imageStoragePath,
      }));

      closeCropModal();
    } catch (err: unknown) {
      Alert.alert('Erro', getErrorMessage(err, 'Não foi possível finalizar o recorte.'));
    }
  };

  const openNew = () => {
    clearPendingUpload();
    closeCropModal();
    setForm({ ...emptyForm(), category: categoryOptions[0] ?? '' });
    setCategoryMenuOpen(false);
    setPanel(true);
  };

  const openEdit = (p: Product) => {
    clearPendingUpload();
    closeCropModal();
    setForm({
      id: p.id,
      name: p.name,
      price: String(p.price),
      category: p.category ?? '',
      stock: String(p.stock ?? 0),
      expiryDate: toDisplayExpiryDate(p.expiryDate, true),
      highlights: p.highlights ?? false,
      image: p.image ?? '',
      imageStoragePath: p.imageStoragePath ?? '',
    });
    setCategoryMenuOpen(false);
    setPanel(true);
  };

  const closePanel = () => {
    clearPendingUpload();
    closeCropModal();
    setCategoryMenuOpen(false);
    setPanel(false);
  };

  const pickImageFile = () => {
    if (typeof document === 'undefined') {
      Alert.alert('Indisponível', 'O upload de imagem está disponível na versão web.');
      return;
    }

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';

    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;

      if (cropDraft?.previewUrl) {
        URL.revokeObjectURL(cropDraft.previewUrl);
      }

      const previewUrl = URL.createObjectURL(file);
      const imageValidation = new window.Image();
      setPreparingCrop(true);

      imageValidation.onload = () => {
        if (imageValidation.width < 2000 || imageValidation.height < 2000) {
          URL.revokeObjectURL(previewUrl);
          setPreparingCrop(false);
          Alert.alert('Dimensão inválida', 'A imagem precisa ter no mínimo 2000x2000 px para permitir o recorte.');
          return;
        }

        setCropDraft({
          file,
          previewUrl,
          fileName: file.name,
          width: imageValidation.width,
          height: imageValidation.height,
        });
        setCropScale(1);
        setCropOffsetX(0);
        setCropOffsetY(0);
        setPreparingCrop(false);
      };

      imageValidation.onerror = () => {
        URL.revokeObjectURL(previewUrl);
        setPreparingCrop(false);
        Alert.alert('Erro', 'Não foi possível ler a imagem selecionada.');
      };

      imageValidation.src = previewUrl;
    };

    input.click();
  };

  const removeImage = () => {
    closeCropModal();
    clearPendingUpload();
    setForm((current) => ({
      ...current,
      image: '',
      imageStoragePath: '',
    }));
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.price.trim()) {
      Alert.alert('Atenção', 'Informe nome e preço.');
      return;
    }
    const price = Number(form.price.replace(',', '.'));
    if (Number.isNaN(price)) { Alert.alert('Atenção', 'Preço inválido.'); return; }
    const stock = form.stock === '' ? 0 : Number(form.stock);
    if (Number.isNaN(stock) || stock < 0) { Alert.alert('Atenção', 'Estoque inválido.'); return; }
    const { value: expiryDate, valid } = toStorageExpiryDate(form.expiryDate);
    if (!valid) { Alert.alert('Atenção', 'Data de validade inválida. Use DD/MM/AA.'); return; }

    const previousStoragePath = form.imageStoragePath || null;
    let nextImage = form.image.trim() || null;
    let nextStoragePath = form.imageStoragePath.trim() || null;
    let uploadedStoragePath: string | null = null;

    if (!pendingUpload && isTemporaryImageUri(nextImage)) {
      nextImage = null;
      nextStoragePath = null;
    }

    if (!nextImage) {
      nextStoragePath = null;
    }

    if (pendingUpload) {
      setUploadingImage(true);
      try {
        const uploaded = await uploadProductImage(pendingUpload.file, form.id || undefined);
        nextImage = uploaded.downloadURL;
        nextStoragePath = uploaded.storagePath;
        uploadedStoragePath = uploaded.storagePath;
      } catch (err: unknown) {
        Alert.alert('Erro', getErrorMessage(err, 'Falha ao enviar a imagem.'));
        setUploadingImage(false);
        return;
      }
      setUploadingImage(false);
    }

    const payload = {
      name: form.name.trim(),
      price,
      category: form.category.trim() || '-',
      stock,
      image: nextImage,
      imageStoragePath: nextStoragePath,
      expiryDate: expiryDate || null,
      highlights: form.highlights,
      updatedAt: serverTimestamp(),
    };

    setSaving(true);
    try {
      if (form.id) {
        await updateDoc(doc(db, 'produtos', form.id), payload);
      } else {
        await addDoc(collection(db, 'produtos'), { ...payload, createdAt: serverTimestamp() });
      }
      if (previousStoragePath && previousStoragePath !== nextStoragePath) {
        try {
          await deleteProductImage(previousStoragePath);
        } catch {
          console.warn('Falha ao remover imagem antiga do produto');
        }
      }

      closePanel();
      setForm(emptyForm());
    } catch (err: unknown) {
      if (uploadedStoragePath) {
        try {
          await deleteProductImage(uploadedStoragePath);
        } catch {
          console.warn('Falha ao limpar upload após erro de salvamento');
        }
      }
      Alert.alert('Erro', getErrorMessage(err, 'Falha ao salvar.'));
    } finally {
      setSaving(false);
      setUploadingImage(false);
    }
  };

  const handleDelete = (p: Product) => {
    const confirmDelete = async () => {
      try {
        await deleteDoc(doc(db, 'produtos', p.id));
      } catch {
        Alert.alert('Erro', 'Não foi possível excluir.');
      }
    };

    if (typeof window !== 'undefined' && typeof window.confirm === 'function') {
      const ok = window.confirm(`Excluir "${p.name}"?`);
      if (ok) {
        void confirmDelete();
      }
      return;
    }

    Alert.alert('Excluir', `Excluir "${p.name}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: () => {
          void confirmDelete();
        },
      },
    ]);
  };

  return (
    <View style={styles.root}>
      {/* Main table area */}
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content}>
        <View style={styles.topRow}>
          <View>
            <Text style={styles.pageTitle}>Estoque</Text>
            <Text style={styles.pageSubtitle}>{summary.total} produtos</Text>
          </View>
          <Pressable style={styles.primaryBtn} onPress={openNew}>
            <Text style={styles.primaryBtnText}>+ Novo produto</Text>
          </Pressable>
        </View>

        {/* Filtros */}
        <View style={styles.filterRow}>
          <TextInput
            style={styles.searchInput}
            placeholder="Buscar por nome ou categoria..."
            value={search}
            onChangeText={setSearch}
          />
          <View style={styles.tabRow}>
            {([
              { key: 'all' as ExpiryFilter, label: `Todos (${summary.total})` },
              { key: 'warning' as ExpiryFilter, label: `⚠️ A vencer (${summary.warning})` },
              { key: 'expired' as ExpiryFilter, label: `🔴 Vencidos (${summary.expired})` },
            ] as const).map((tab) => (
              <Pressable
                key={tab.key}
                style={[styles.tabBtn, expiryFilter === tab.key && styles.tabBtnActive]}
                onPress={() => setExpiryFilter(tab.key)}>
                <Text style={[styles.tabBtnText, expiryFilter === tab.key && styles.tabBtnTextActive]}>
                  {tab.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {loading ? (
          <View style={styles.centered}><ActivityIndicator color={BRAND} /></View>
        ) : (
          <View style={styles.table}>
            <View style={[styles.tableRow, styles.tableHeader]}>
              <Pressable style={[styles.sortHeaderBtn, styles.colProduct]} onPress={() => toggleSort('name')}>
                <Text style={styles.thText}>Produto</Text>
                <Text style={styles.sortHeaderIcon}>{getSortIndicator('name')}</Text>
              </Pressable>
              <Pressable style={[styles.sortHeaderBtn, styles.colCategory]} onPress={() => toggleSort('category')}>
                <Text style={styles.thText}>Categoria</Text>
                <Text style={styles.sortHeaderIcon}>{getSortIndicator('category')}</Text>
              </Pressable>
              <Pressable style={[styles.sortHeaderBtn, styles.colPrice]} onPress={() => toggleSort('price')}>
                <Text style={styles.thText}>Preço</Text>
                <Text style={styles.sortHeaderIcon}>{getSortIndicator('price')}</Text>
              </Pressable>
              <Pressable style={[styles.sortHeaderBtn, styles.colStock]} onPress={() => toggleSort('stock')}>
                <Text style={styles.thText}>Estoque</Text>
                <Text style={styles.sortHeaderIcon}>{getSortIndicator('stock')}</Text>
              </Pressable>
              <Pressable style={[styles.sortHeaderBtn, styles.colExpiry]} onPress={() => toggleSort('expiryDate')}>
                <Text style={styles.thText}>Validade</Text>
                <Text style={styles.sortHeaderIcon}>{getSortIndicator('expiryDate')}</Text>
              </Pressable>
              <Pressable style={[styles.sortHeaderBtn, styles.colHighlight]} onPress={() => toggleSort('highlights')}>
                <Text style={styles.thText}>Destaque</Text>
                <Text style={styles.sortHeaderIcon}>{getSortIndicator('highlights')}</Text>
              </Pressable>
              <Text style={[styles.th, styles.colActions, styles.actionsHeader]}>Ações</Text>
            </View>
            {sortedProducts.map((p) => {
              const exp = getExpiryStatus(p.expiryDate);
              const outOfStock = (p.stock ?? 0) <= 0;
              return (
                <View
                  key={p.id}
                  style={[
                    styles.tableRow,
                    exp.expired && styles.rowExpired,
                    exp.warning && !exp.expired && styles.rowWarning,
                  ]}>
                  <View style={[styles.td, styles.productCell, styles.colProduct]}>
                    {getProductImage(p.image) ? (
                      <Image source={getProductImage(p.image)!} style={styles.tableThumb} resizeMode="cover" />
                    ) : (
                      <View style={styles.tableThumbPlaceholder}>
                        <Text style={styles.tableThumbPlaceholderText}>IMG</Text>
                      </View>
                    )}
                    <Text style={styles.productName} numberOfLines={1}>
                      {p.name}{p.highlights ? ' ⭐' : ''}
                    </Text>
                  </View>
                  <Text style={[styles.td, styles.colCategory]} numberOfLines={1}>{p.category}</Text>
                  <Text style={[styles.td, styles.colPrice]}>R$ {p.price.toFixed(2)}</Text>
                  <Text style={[styles.td, styles.colStock, outOfStock && styles.tdAlert]}>{outOfStock ? 'Sem estoque' : p.stock}</Text>
                  <Text style={[styles.td, styles.colExpiry, exp.expired && styles.tdAlert, exp.warning && !exp.expired && styles.tdWarning]}>
                    {p.expiryDate ? toDisplayExpiryDate(p.expiryDate, true) : '-'}
                  </Text>
                  <Text style={[styles.td, styles.colHighlight]}>{p.highlights ? 'Sim' : 'Não'}</Text>
                  <View style={[styles.td, styles.colActions, styles.actionsCell]}>
                    <Pressable style={styles.editBtn} onPress={() => openEdit(p)}>
                      <Text style={styles.editBtnText}>Editar</Text>
                    </Pressable>
                    <Pressable style={styles.deleteBtn} onPress={() => handleDelete(p)}>
                      <Text style={styles.deleteBtnText}>✕</Text>
                    </Pressable>
                  </View>
                </View>
              );
            })}
            {sortedProducts.length === 0 && (
              <View style={styles.emptyRow}>
                <Text style={styles.emptyText}>Nenhum produto encontrado.</Text>
              </View>
            )}
          </View>
        )}
      </ScrollView>

      <Modal visible={panel} transparent animationType="fade" onRequestClose={closePanel}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.sidePanelHeader}>
              <View style={styles.headerTitleWrap}>
                <Text style={styles.sidePanelTitle}>{form.id ? 'Editar produto' : 'Novo produto'}</Text>
                <Text style={styles.sidePanelSubtitle}>Atualize os dados e salve para aplicar no estoque.</Text>
              </View>
              <Pressable onPress={closePanel}>
                <Text style={styles.closeBtn}>✕</Text>
              </Pressable>
            </View>
            <ScrollView style={styles.modalBodyScroll} contentContainerStyle={styles.formContent}>
              <View style={[styles.formSection, categoryMenuOpen && styles.formSectionRaised]}>
                <Text style={styles.formSectionTitle}>Informações básicas</Text>
                <View style={styles.formGrid}>
                  <View style={[styles.formField, styles.formFieldHalf]}>
                    <Text style={styles.formLabel}>Nome</Text>
                    <TextInput
                      style={styles.formInput}
                      placeholder="Nome do produto"
                      value={form.name}
                      onChangeText={(t) => setForm((f) => ({ ...f, name: t }))}
                    />
                  </View>

                  <View style={[styles.formField, styles.formFieldHalf]}>
                    <Text style={styles.formLabel}>Preço</Text>
                    <TextInput
                      style={styles.formInput}
                      placeholder="Ex: 79.90"
                      value={form.price}
                      onChangeText={(t) => setForm((f) => ({ ...f, price: t }))}
                      keyboardType="decimal-pad"
                    />
                  </View>

                  <View style={[styles.formField, styles.formFieldHalf, styles.categoryField]}>
                    <Text style={styles.formLabel}>Categoria</Text>
                    <Pressable
                      style={styles.categorySelect}
                      onPress={() => setCategoryMenuOpen((prev) => !prev)}
                    >
                      <Text style={[styles.categorySelectText, !form.category && styles.categorySelectPlaceholder]}>
                        {form.category || 'Selecionar categoria'}
                      </Text>
                      <Text style={styles.categorySelectArrow}>{categoryMenuOpen ? '▴' : '▾'}</Text>
                    </Pressable>

                    {categoryMenuOpen ? (
                      <View style={styles.categoryDropdown}>
                        <ScrollView nestedScrollEnabled style={styles.categoryDropdownScroll}>
                          {categoryOptions.map((category) => {
                            const selected = form.category.trim().toLowerCase() === category.toLowerCase();
                            return (
                              <Pressable
                                key={category}
                                style={[styles.categoryOption, selected && styles.categoryOptionSelected]}
                                onPress={() => {
                                  setForm((f) => ({ ...f, category }));
                                  setCategoryMenuOpen(false);
                                }}
                              >
                                <Text style={[styles.categoryOptionText, selected && styles.categoryOptionTextSelected]}>
                                  {category}
                                </Text>
                              </Pressable>
                            );
                          })}
                        </ScrollView>
                      </View>
                    ) : null}
                  </View>

                  <View style={[styles.formField, styles.formFieldHalf]}>
                    <Text style={styles.formLabel}>Estoque</Text>
                    <TextInput
                      style={styles.formInput}
                      placeholder="Ex: 10"
                      value={form.stock}
                      onChangeText={(t) => setForm((f) => ({ ...f, stock: t }))}
                      keyboardType="number-pad"
                    />
                  </View>
                </View>
              </View>

              <View style={styles.formSection}>
                <Text style={styles.formSectionTitle}>Imagem do produto</Text>
                <View style={styles.formField}>
                  {getProductImage(form.image) ? (
                    <Image source={getProductImage(form.image)!} style={styles.previewImage} resizeMode="cover" />
                  ) : (
                    <View style={styles.previewPlaceholder}>
                      <Text style={styles.previewPlaceholderText}>Sem imagem</Text>
                    </View>
                  )}
                  <Text style={styles.formHelper}>
                    {pendingUpload
                      ? `Nova imagem: ${pendingUpload.fileName}`
                      : getProductImageLabel(form.image) || 'Envie uma imagem e ajuste o recorte em uma tela separada.'}
                  </Text>
                  {preparingCrop ? <Text style={styles.formHelper}>Preparando editor de recorte...</Text> : null}
                  <View style={styles.imageActionRow}>
                    <Pressable style={styles.secondaryActionBtn} onPress={pickImageFile} disabled={saving || uploadingImage}>
                      <Text style={styles.secondaryActionText}>{uploadingImage ? 'Enviando...' : 'Enviar imagem'}</Text>
                    </Pressable>
                    <Pressable style={styles.ghostActionBtn} onPress={removeImage} disabled={saving || uploadingImage}>
                      <Text style={styles.ghostActionText}>Remover</Text>
                    </Pressable>
                  </View>
                </View>
              </View>

              <View style={styles.formSection}>
                <Text style={styles.formSectionTitle}>Configurações</Text>
                <View style={styles.formGrid}>
                  <View style={[styles.formField, styles.formFieldHalf]}>
                    <Text style={styles.formLabel}>Data de validade</Text>
                    <TextInput
                      style={styles.formInput}
                      placeholder="DD/MM/AA (opcional)"
                      value={form.expiryDate}
                      onChangeText={(t) => setForm((f) => ({ ...f, expiryDate: formatExpiryInput(t) }))}
                      keyboardType="number-pad"
                      maxLength={8}
                    />
                    <Text style={styles.formHelper}>Digite apenas números. Ex: 030426</Text>
                  </View>
                  <View style={[styles.formField, styles.formFieldHalf, styles.switchRow]}>
                    <Text style={styles.formLabel}>Destaque (Promoções)</Text>
                    <Switch
                      value={form.highlights}
                      onValueChange={(v) => setForm((f) => ({ ...f, highlights: v }))}
                      trackColor={{ true: BRAND, false: '#ccc' }}
                    />
                  </View>
                </View>
              </View>
            </ScrollView>

            <View style={styles.modalFooter}>
              <Pressable style={styles.modalCancelBtn} onPress={closePanel} disabled={saving || uploadingImage}>
                <Text style={styles.modalCancelBtnText}>Cancelar</Text>
              </Pressable>
              <Pressable style={styles.modalPrimaryBtn} onPress={handleSave} disabled={saving || uploadingImage}>
                <Text style={styles.modalPrimaryBtnText}>
                  {saving || uploadingImage ? 'Salvando...' : form.id ? 'Salvar alterações' : 'Criar produto'}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={!!cropDraft} transparent animationType="fade" onRequestClose={closeCropModal}>
        <View style={styles.modalBackdrop}>
          <View style={styles.cropModalCard}>
            <View style={styles.sidePanelHeader}>
              <View style={styles.headerTitleWrap}>
                <Text style={styles.sidePanelTitle}>Ajustar recorte</Text>
                <Text style={styles.sidePanelSubtitle}>Defina como o produto será exibido no app ({PRODUCT_IMAGE_TARGET_SIZE}x{PRODUCT_IMAGE_TARGET_SIZE}).</Text>
              </View>
              <Pressable onPress={closeCropModal}>
                <Text style={styles.closeBtn}>✕</Text>
              </Pressable>
            </View>

            <View style={styles.cropModalBody}>
              <View style={styles.cropFrame}>
                {cropDraft ? (
                  <Image
                    source={{ uri: cropDraft.previewUrl }}
                    style={[
                      styles.cropImage,
                      {
                        transform: [
                          { scale: cropScale },
                          { translateX: cropOffsetX },
                          { translateY: cropOffsetY },
                        ],
                      },
                    ]}
                    resizeMode="cover"
                  />
                ) : null}
              </View>

              <View style={styles.cropControls}>
                <Text style={styles.formLabel}>Zoom</Text>
                <View style={styles.cropControlRow}>
                  <Pressable style={styles.cropControlBtn} onPress={() => applyCropScale(cropScale - 0.1)}>
                    <Text style={styles.cropControlText}>-</Text>
                  </Pressable>
                  <Text style={styles.cropScaleText}>{cropScale.toFixed(1)}x</Text>
                  <Pressable style={styles.cropControlBtn} onPress={() => applyCropScale(cropScale + 0.1)}>
                    <Text style={styles.cropControlText}>+</Text>
                  </Pressable>
                </View>

                <Text style={styles.formLabel}>Posição</Text>
                <View style={styles.cropPadGrid}>
                  <Pressable style={styles.cropPadBtn} onPress={() => nudgeCrop('y', -12)}><Text style={styles.cropControlText}>↑</Text></Pressable>
                  <View style={styles.cropPadMiddle}>
                    <Pressable style={styles.cropPadBtn} onPress={() => nudgeCrop('x', -12)}><Text style={styles.cropControlText}>←</Text></Pressable>
                    <Pressable style={styles.cropPadBtn} onPress={() => nudgeCrop('x', 12)}><Text style={styles.cropControlText}>→</Text></Pressable>
                  </View>
                  <Pressable style={styles.cropPadBtn} onPress={() => nudgeCrop('y', 12)}><Text style={styles.cropControlText}>↓</Text></Pressable>
                </View>

                <Pressable
                  style={styles.cropResetBtn}
                  onPress={() => {
                    setCropOffsetX(0);
                    setCropOffsetY(0);
                    setCropScale(1);
                  }}>
                  <Text style={styles.cropResetBtnText}>Centralizar</Text>
                </Pressable>
              </View>
            </View>

            <View style={styles.modalFooter}>
              <Pressable style={styles.modalCancelBtn} onPress={closeCropModal}>
                <Text style={styles.modalCancelBtnText}>Cancelar</Text>
              </Pressable>
              <Pressable style={styles.modalPrimaryBtn} onPress={confirmCropSelection}>
                <Text style={styles.modalPrimaryBtnText}>Usar recorte</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 32, paddingBottom: 60, gap: 16 },
  centered: { padding: 32, alignItems: 'center' },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  pageTitle: { fontSize: 26, fontWeight: '800', color: '#2c1b12' },
  pageSubtitle: { fontSize: 13, color: '#6e5a4b' },
  filterRow: { flexDirection: 'row', alignItems: 'center', gap: 16, flexWrap: 'wrap' },
  searchInput: {
    flex: 1,
    minWidth: 200,
    borderWidth: 1,
    borderColor: '#d9cfc2',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#fff',
    fontSize: 14,
  },
  tabRow: { flexDirection: 'row', gap: 8 },
  tabBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d9cfc2',
    backgroundColor: '#fff',
  },
  tabBtnActive: { backgroundColor: '#2c1b12', borderColor: '#2c1b12' },
  tabBtnText: { fontSize: 13, color: '#6e5a4b', fontWeight: '600' },
  tabBtnTextActive: { color: '#fff' },
  primaryBtn: {
    backgroundColor: BRAND,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  primaryBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  // Table
  table: { backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#e8ddd4', overflow: 'hidden' },
  tableHeader: { backgroundColor: '#f8f4f0' },
  tableRow: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: '#f0e8e0', gap: 6,
  },
  rowWarning: {
    backgroundColor: '#fff4d6',
    borderLeftWidth: 3,
    borderLeftColor: '#d09a00',
  },
  rowExpired: {
    backgroundColor: '#ffe3e3',
    borderLeftWidth: 3,
    borderLeftColor: '#d63a3a',
  },
  th: { flex: 1, fontWeight: '700', color: '#3c2b1e', fontSize: 12 },
  thText: { fontWeight: '700', color: '#3c2b1e', fontSize: 12 },
  sortHeaderBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  sortHeaderIcon: { fontSize: 11, color: '#8f7766', fontWeight: '800' },
  td: { flex: 1, fontSize: 13, color: '#2c1b12' },
  colProduct: { flex: 2.5 },
  colCategory: { flex: 1.2 },
  colPrice: { flex: 0.9 },
  colStock: { flex: 1 },
  colExpiry: { flex: 1.1 },
  colHighlight: { flex: 0.9 },
  colActions: { flex: 0.95 },
  productCell: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  productName: { flex: 1, fontSize: 13, color: '#2c1b12' },
  tableThumb: { width: 36, height: 36, borderRadius: 8, backgroundColor: '#f2ece6' },
  tableThumbPlaceholder: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#efe5dc',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tableThumbPlaceholderText: { color: '#9e8a7a', fontWeight: '700', fontSize: 11 },
  tdAlert: { color: BRAND, fontWeight: '700' },
  tdWarning: { color: '#92600a', fontWeight: '700' },
  actionsHeader: { textAlign: 'center' },
  actionsCell: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6 },
  editBtn: {
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6,
    borderWidth: 1, borderColor: BRAND, backgroundColor: '#fff',
  },
  editBtnText: { color: BRAND, fontWeight: '700', fontSize: 12 },
  deleteBtn: {
    paddingHorizontal: 8, paddingVertical: 6, borderRadius: 6, backgroundColor: '#fde2e2',
  },
  deleteBtnText: { color: BRAND, fontWeight: '700', fontSize: 12 },
  emptyRow: { padding: 24, alignItems: 'center' },
  emptyText: { color: '#6e5a4b' },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(25, 18, 12, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 20,
  },
  modalCard: {
    width: '92%',
    maxWidth: 860,
    maxHeight: '92%',
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e8ddd4',
    overflow: 'hidden',
  },
  sidePanelHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e8ddd4',
  },
  headerTitleWrap: {
    flex: 1,
    gap: 2,
    paddingRight: 12,
  },
  sidePanelTitle: { fontSize: 17, fontWeight: '800', color: '#2c1b12' },
  sidePanelSubtitle: { fontSize: 12, color: '#8f7766', fontWeight: '500' },
  closeBtn: { fontSize: 18, color: '#6e5a4b', fontWeight: '700' },
  modalBodyScroll: { flex: 1 },
  formContent: { padding: 20, gap: 16, paddingBottom: 24 },
  formSection: {
    borderWidth: 1,
    borderColor: '#eee4db',
    borderRadius: 12,
    padding: 14,
    gap: 10,
    backgroundColor: '#fffdfa',
    position: 'relative',
    overflow: 'visible',
    zIndex: 1,
  },
  formSectionRaised: {
    zIndex: 40,
  },
  formSectionTitle: { fontSize: 12, fontWeight: '800', color: '#8a6d58', textTransform: 'uppercase', letterSpacing: 0.4 },
  formGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, overflow: 'visible' },
  formField: { gap: 6 },
  formFieldHalf: { flexBasis: 240, flexGrow: 1 },
  categoryField: {
    position: 'relative',
    zIndex: 20,
  },
  formLabel: { fontWeight: '700', fontSize: 13, color: '#3c2b1e' },
  formInput: {
    borderWidth: 1, borderColor: '#d9cfc2', borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, backgroundColor: '#fdfaf6',
  },
  categorySelect: {
    borderWidth: 1,
    borderColor: '#d9cfc2',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#fdfaf6',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 42,
  },
  categorySelectText: {
    fontSize: 14,
    color: '#2c1b12',
    flex: 1,
    paddingRight: 8,
  },
  categorySelectPlaceholder: { color: '#9e8a7a' },
  categorySelectArrow: { color: '#6e5a4b', fontSize: 12, fontWeight: '700' },
  categoryDropdown: {
    position: 'absolute',
    top: 76,
    left: 0,
    right: 0,
    borderWidth: 1,
    borderColor: '#d9cfc2',
    borderRadius: 8,
    backgroundColor: '#fff',
    overflow: 'hidden',
    maxHeight: 180,
    zIndex: 30,
    elevation: 6,
  },
  categoryDropdownScroll: { maxHeight: 180 },
  categoryOption: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f1e8e0',
  },
  categoryOptionSelected: { backgroundColor: '#fff2f2' },
  categoryOptionText: { color: '#4a382c', fontSize: 13, fontWeight: '600' },
  categoryOptionTextSelected: { color: BRAND, fontWeight: '700' },
  formHelper: { fontSize: 11, color: '#a08060' },
  previewImage: {
    width: '100%',
    height: 180,
    borderRadius: 12,
    backgroundColor: '#f2ece6',
  },
  previewPlaceholder: {
    width: '100%',
    height: 180,
    borderRadius: 12,
    backgroundColor: '#f5eee7',
    borderWidth: 1,
    borderColor: '#e3d6c9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewPlaceholderText: { color: '#9e8a7a', fontWeight: '700' },
  imageActionRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  secondaryActionBtn: {
    flex: 1,
    borderRadius: 8,
    backgroundColor: '#2c1b12',
    paddingVertical: 10,
    alignItems: 'center',
  },
  secondaryActionText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  ghostActionBtn: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d9cfc2',
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ghostActionText: { color: '#6e5a4b', fontWeight: '700', fontSize: 13 },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  modalFooter: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: '#e8ddd4',
    backgroundColor: '#fff',
  },
  modalCancelBtn: {
    flex: 1, borderWidth: 1, borderColor: '#d9cfc2', borderRadius: 10,
    paddingVertical: 12, alignItems: 'center',
  },
  modalCancelBtnText: { color: '#6e5a4b', fontWeight: '700' },
  modalPrimaryBtn: {
    flex: 1,
    backgroundColor: BRAND,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  modalPrimaryBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  cropModalCard: {
    width: '92%',
    maxWidth: 760,
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e8ddd4',
    overflow: 'hidden',
  },
  cropModalBody: {
    flexDirection: 'row',
    gap: 18,
    padding: 20,
    alignItems: 'flex-start',
    justifyContent: 'center',
    flexWrap: 'wrap',
  },
  cropFrame: {
    width: CROP_FRAME_SIZE,
    height: CROP_FRAME_SIZE,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#d9cfc2',
    overflow: 'hidden',
    backgroundColor: '#f2ece6',
  },
  cropImage: {
    width: '100%',
    height: '100%',
  },
  cropControls: {
    minWidth: 220,
    maxWidth: 280,
    gap: 12,
  },
  cropControlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  cropControlBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d9cfc2',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  cropControlText: {
    color: '#2c1b12',
    fontWeight: '800',
    fontSize: 16,
  },
  cropScaleText: {
    minWidth: 56,
    textAlign: 'center',
    color: '#6e5a4b',
    fontWeight: '700',
  },
  cropPadGrid: {
    gap: 8,
    alignItems: 'center',
  },
  cropPadMiddle: {
    flexDirection: 'row',
    gap: 8,
  },
  cropPadBtn: {
    width: 40,
    height: 40,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d9cfc2',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  cropResetBtn: {
    marginTop: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d9cfc2',
    paddingVertical: 10,
    alignItems: 'center',
  },
  cropResetBtnText: {
    color: '#6e5a4b',
    fontWeight: '700',
  },
});
