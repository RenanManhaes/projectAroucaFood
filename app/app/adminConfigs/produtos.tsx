import React, { useCallback, useEffect, useMemo, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import {
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  Image,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { addDoc, collection, doc, getDoc, onSnapshot, orderBy, query, serverTimestamp, updateDoc } from 'firebase/firestore';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { auth, db } from '@/config/firebase';
import { isAdminEmail } from '@/constants/auth/adminEmails';
import { getProductImage } from '@/constants/media/productImages';
import { BRAND_PRIMARY } from '@/constants/ui/colors';
import { deleteProductImage, uploadProductImage } from '@/services/products/productImageStorage';
import { formatExpiryInput, toDisplayExpiryDate, toStorageExpiryDate } from '@/utils/expiry';

const BRAND = BRAND_PRIMARY;
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

type Category = { id: string; name: string };
const mapDefaultCategories = (): Category[] => DEFAULT_CATEGORIES.map((c) => ({ id: `default-${c}`, name: c }));

type FormState = {
  id: string;
  name: string;
  price: string;
  category: string;
  highlights: boolean;
  stock: string;
  expiryDate: string;
  image: string;
  imageStoragePath: string;
};

type PendingUpload = {
  uri: string;
  fileName: string;
  mimeType?: string | null;
};

type ProductRow = {
  id: string;
  name: string;
  category: string;
  price: number;
  highlights: boolean;
  stock: number;
  expiryDate: string;
  image: string;
  imageStoragePath: string;
};

const getErrorMessage = (error: unknown, fallback: string) => {
  return error instanceof Error ? error.message : fallback;
};

const resolveImageSource = (imageValue?: string | null) => {
  const value = typeof imageValue === 'string' ? imageValue.trim() : '';
  if (!value) return null;

  if (
    value.startsWith('http://') ||
    value.startsWith('https://') ||
    value.startsWith('file://') ||
    value.startsWith('content://')
  ) {
    return { uri: value };
  }

  return getProductImage(value);
};

export default function ProdutosScreen() {
  const router = useRouter();
  const user = auth.currentUser;
  const { width } = useWindowDimensions();
  const isCompact = width < 390;

  const [categories, setCategories] = useState<Category[]>(mapDefaultCategories());
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [productSearch, setProductSearch] = useState('');

  const [form, setForm] = useState<FormState>({
    id: '',
    name: '',
    price: '',
    category: DEFAULT_CATEGORIES[0],
    highlights: false,
    stock: '',
    expiryDate: '',
    image: '',
    imageStoragePath: '',
  });
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [prefillLoading, setPrefillLoading] = useState(false);
  const [pendingUpload, setPendingUpload] = useState<PendingUpload | null>(null);
  const [categoryPickerVisible, setCategoryPickerVisible] = useState(false);
  const { editId } = useLocalSearchParams<{ editId?: string }>();

  const isAdmin = useMemo(() => {
    return isAdminEmail(user?.email);
  }, [user]);

  const resetForm = useCallback(() => {
    setForm({
      id: '',
      name: '',
      price: '',
      category: categories[0]?.name ?? DEFAULT_CATEGORIES[0],
      highlights: false,
      stock: '',
      expiryDate: '',
      image: '',
      imageStoragePath: '',
    });
    setPendingUpload(null);
  }, [categories]);

  const parseNumber = (value: string) => Number(value.replace(',', '.').trim());

  const filteredProducts = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    if (!q) return products;
    return products.filter((product) => {
      return (
        product.name.toLowerCase().includes(q) ||
        product.category.toLowerCase().includes(q)
      );
    });
  }, [productSearch, products]);

  const fillFormFromProduct = (product: ProductRow) => {
    setPendingUpload(null);
    setForm({
      id: product.id,
      name: product.name,
      price: String(product.price),
      category: product.category,
      highlights: Boolean(product.highlights),
      stock: String(product.stock),
      expiryDate: toDisplayExpiryDate(product.expiryDate, true),
      image: product.image,
      imageStoragePath: product.imageStoragePath,
    });
  };

  useEffect(() => {
    if (!isAdmin) {
      Alert.alert('Acesso restrito', 'Você será redirecionado.', [
        {
          text: 'OK',
          onPress: () => router.replace('/'),
        },
      ]);
      return;
    }
  }, [isAdmin, router]);

  useEffect(() => {
    if (!isAdmin) return;

    const unsub = onSnapshot(
      collection(db, 'categorias'),
      (snap) => {
        const fetched: Category[] = snap.docs
          .map((d) => {
            const data = d.data();
            const name = typeof data?.nome === 'string' ? data.nome.trim() : typeof data?.name === 'string' ? data.name.trim() : '';
            return name ? { id: d.id, name } : null;
          })
          .filter(Boolean) as Category[];

        const unique = new Map<string, Category>();
        [...fetched, ...mapDefaultCategories()].forEach((cat) => {
          const key = cat.name.toLowerCase();
          if (!unique.has(key)) unique.set(key, cat);
        });

        const list = Array.from(unique.values());
        setCategories(list);
        setForm((f) => ({ ...f, category: f.category || list[0]?.name || '' }));
      },
      (err) => {
        console.warn('Falha ao carregar categorias', err);
      }
    );

    return unsub;
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin) return;

    const q = query(collection(db, 'produtos'), orderBy('name', 'asc'));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: ProductRow[] = snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            name: typeof data?.name === 'string' ? data.name : 'Produto sem nome',
            category: typeof data?.category === 'string' ? data.category : 'Sem categoria',
            price: Number(data?.price) || 0,
            highlights: Boolean(data?.highlights),
            stock: Number(data?.stock) || 0,
            expiryDate: typeof data?.expiryDate === 'string' ? data.expiryDate : '',
            image: typeof data?.image === 'string' ? data.image : '',
            imageStoragePath: typeof data?.imageStoragePath === 'string' ? data.imageStoragePath : '',
          };
        });
        setProducts(list);
      },
      (err) => {
        console.warn('Falha ao carregar produtos', err);
      }
    );

    return unsub;
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin) return;

    if (!editId) {
      resetForm();
      return;
    }

    const loadProduct = async () => {
      setPrefillLoading(true);
      try {
        const snap = await getDoc(doc(db, 'produtos', String(editId)));
        if (snap.exists()) {
          const data = snap.data();
          const incomingCat = typeof data?.category === 'string' && data.category.trim() ? data.category.trim() : DEFAULT_CATEGORIES[0];
          setCategories((prev) => {
            const exists = prev.some((c) => c.name.toLowerCase() === incomingCat.toLowerCase());
            return exists ? prev : [...prev, { id: `temp-${incomingCat}`, name: incomingCat }];
          });
          setForm({
            id: snap.id,
            name: data?.name ?? '',
            price: data?.price != null ? String(data.price) : '',
            category: incomingCat,
            highlights: Boolean(data?.highlights),
            stock: data?.stock != null ? String(data.stock) : '',
            expiryDate: toDisplayExpiryDate(typeof data?.expiryDate === 'string' ? data.expiryDate : '', true),
            image: typeof data?.image === 'string' ? data.image : '',
            imageStoragePath: typeof data?.imageStoragePath === 'string' ? data.imageStoragePath : '',
          });
          setPendingUpload(null);
        } else {
          Alert.alert('Produto não encontrado', 'Verifique se ele ainda existe.');
          resetForm();
        }
      } catch {
        Alert.alert('Erro', 'Falha ao carregar produto para edição.');
        resetForm();
      } finally {
        setPrefillLoading(false);
      }
    };

    loadProduct();
  }, [editId, isAdmin, resetForm]);

  const handlePickImage = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permissão necessária', 'Permita o acesso às fotos para enviar imagens dos produtos.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.9,
    });

    if (result.canceled || !result.assets?.[0]) {
      return;
    }

    const asset = result.assets[0];
    setPendingUpload({
      uri: asset.uri,
      fileName: asset.fileName ?? asset.uri.split('/').pop() ?? 'produto.jpg',
      mimeType: asset.mimeType,
    });
    setForm((f) => ({
      ...f,
      image: asset.uri,
    }));
  };

  const handleRemoveImage = () => {
    setPendingUpload(null);
    setForm((f) => ({
      ...f,
      image: '',
    }));
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.price.trim()) {
      Alert.alert('Atenção', 'Informe nome e preço.');
      return;
    }

    const priceNumber = parseNumber(form.price);
    if (Number.isNaN(priceNumber)) {
      Alert.alert('Atenção', 'Preço inválido.');
      return;
    }

    const stockNumber = form.stock === '' ? 0 : parseNumber(form.stock);
    if (Number.isNaN(stockNumber) || stockNumber < 0) {
      Alert.alert('Atenção', 'Estoque deve ser um número zero ou positivo.');
      return;
    }

    const category = form.category.trim();
    if (!category) {
      Alert.alert('Atenção', 'Informe uma categoria.');
      return;
    }

    const previousStoragePath = form.imageStoragePath.trim() || null;
    let nextImage = form.image?.trim() || '';
    let nextImageStoragePath = form.imageStoragePath.trim() || '';
    const expiryDateInput = form.expiryDate.trim();
    const expiryDateNormalized = toStorageExpiryDate(expiryDateInput);

    if (!expiryDateNormalized.valid) {
      Alert.alert('Atenção', 'Data de validade inválida. Use o formato DD/MM/AA.');
      return;
    }

    setCategories((prev) => {
      const exists = prev.some((c) => c.name.toLowerCase() === category.toLowerCase());
      return exists ? prev : [...prev, { id: `temp-${category}`, name: category }];
    });

    try {
      setSaving(true);
      if (pendingUpload) {
        setUploadingImage(true);
        const uploaded = await uploadProductImage(
          {
            uri: pendingUpload.uri,
            fileName: pendingUpload.fileName,
            mimeType: pendingUpload.mimeType,
          },
          form.id || undefined
        );
        nextImage = uploaded.downloadURL;
        nextImageStoragePath = uploaded.storagePath;
      }

      if (form.id) {
        await updateDoc(doc(db, 'produtos', form.id), {
          name: form.name.trim(),
          price: priceNumber,
          category,
          image: nextImage || null,
          imageStoragePath: nextImageStoragePath || null,
          highlights: form.highlights,
          stock: stockNumber,
          expiryDate: expiryDateNormalized.value || null,
          updatedAt: serverTimestamp(),
        });
      } else {
        await addDoc(collection(db, 'produtos'), {
          name: form.name.trim(),
          price: priceNumber,
          category,
          image: nextImage || null,
          imageStoragePath: nextImageStoragePath || null,
          highlights: form.highlights,
          stock: stockNumber,
          expiryDate: expiryDateNormalized.value || null,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      if (previousStoragePath && previousStoragePath !== nextImageStoragePath) {
        try {
          await deleteProductImage(previousStoragePath);
        } catch {
          console.warn('Falha ao remover imagem antiga do produto');
        }
      }

      setPendingUpload(null);
      resetForm();
    } catch (err: unknown) {
      console.error('Erro ao salvar produto', err);
      Alert.alert('Erro', getErrorMessage(err, 'Não foi possível salvar.'));
    } finally {
      setUploadingImage(false);
      setSaving(false);
    }
  };

  if (!isAdmin) {
    return null;
  }

  const previewSource = pendingUpload?.uri
    ? { uri: pendingUpload.uri }
    : resolveImageSource(form.image);
  const showImagePreview = Boolean(previewSource);

  return (
    <SafeAreaView style={[styles.safe, isCompact && styles.safeCompact]} edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>Produtos</Text>
          <Text style={styles.subtitle}>Edite ou crie produtos rapidamente.</Text>

          <View style={styles.formCard}>
            <View style={styles.formSection}>
              <Text style={styles.formSectionTitle}>Buscar produto</Text>
              <View style={styles.field}>
                <TextInput
                  value={productSearch}
                  onChangeText={setProductSearch}
                  placeholder="Buscar por nome ou categoria"
                  style={styles.input}
                />
                <Text style={styles.helperInline}>
                  {filteredProducts.length} resultado(s)
                </Text>
              </View>

              {productSearch.trim() ? (
                <View style={styles.searchResultsWrap}>
                  <ScrollView nestedScrollEnabled style={styles.searchResultsScroll}>
                    {filteredProducts.slice(0, 20).map((product) => (
                      <Pressable
                        key={product.id}
                        style={styles.searchResultItem}
                        onPress={() => fillFormFromProduct(product)}
                      >
                        <Text style={styles.searchResultTitle} numberOfLines={1}>{product.name}</Text>
                        <Text style={styles.searchResultMeta} numberOfLines={1}>
                          {product.category} • R$ {product.price.toFixed(2)} • estoque {product.stock}
                        </Text>
                      </Pressable>
                    ))}
                    {filteredProducts.length === 0 ? (
                      <Text style={styles.helperInline}>Nenhum produto encontrado.</Text>
                    ) : null}
                  </ScrollView>
                </View>
              ) : null}
            </View>

            <Text style={styles.formTitle}>{form.id ? 'Editar produto' : 'Novo produto'}</Text>
            <View style={styles.formSection}>
              <Text style={styles.formSectionTitle}>Informações básicas</Text>
              <View style={styles.field}>
                <Text style={styles.label}>Nome</Text>
                <TextInput
                  value={form.name}
                  onChangeText={(t) => setForm((f) => ({ ...f, name: t }))}
                  placeholder="Nome do produto"
                  style={styles.input}
                />
              </View>
              <View style={styles.field}>
                <Text style={styles.label}>Preço</Text>
                <TextInput
                  value={form.price}
                  onChangeText={(t) => setForm((f) => ({ ...f, price: t }))}
                  placeholder="Ex: 79.90"
                  keyboardType="decimal-pad"
                  style={styles.input}
                />
              </View>
              <View style={styles.field}>
                <Text style={styles.label}>Categoria</Text>
                <Pressable
                  style={styles.dropdownTrigger}
                  onPress={() => setCategoryPickerVisible(true)}
                  disabled={saving || uploadingImage}
                >
                  <Text style={styles.dropdownValue} numberOfLines={1}>
                    {form.category || 'Selecionar categoria'}
                  </Text>
                  <Text style={styles.dropdownCaret}>▼</Text>
                </Pressable>
                <Text style={styles.helperInline}>Toque para abrir a lista de categorias.</Text>
              </View>
              <View style={styles.field}>
                <Text style={styles.label}>Estoque</Text>
                <TextInput
                  value={form.stock}
                  onChangeText={(t) => setForm((f) => ({ ...f, stock: t }))}
                  placeholder="Ex: 10"
                  keyboardType="number-pad"
                  style={styles.input}
                />
              </View>
            </View>

            <View style={styles.formSection}>
              <Text style={styles.formSectionTitle}>Imagem do produto</Text>
              <View style={styles.field}>
                {showImagePreview ? (
                  <>
                    <View style={styles.imagePreviewWrap}>
                      <Image source={previewSource!} style={styles.imagePreview} resizeMode="cover" />
                    </View>
                    <Text style={styles.helperInline}>
                      {pendingUpload ? `Nova imagem selecionada: ${pendingUpload.fileName}` : 'Imagem atual do produto.'}
                    </Text>
                  </>
                ) : (
                  <Text style={styles.helperInline}>Nenhuma imagem selecionada.</Text>
                )}
                <Text style={styles.helperInline}>
                  Nesta versão mobile o envio é somente por upload. O ajuste de delimitações será aplicado depois.
                </Text>
                <View style={[styles.imageActionsRow, isCompact && styles.stackRowCompact]}>
                  <Pressable style={[styles.button, styles.primary, styles.imageActionButton]} onPress={handlePickImage} disabled={saving || uploadingImage}>
                    <Text style={styles.buttonText}>{uploadingImage ? 'Enviando...' : 'Enviar imagem'}</Text>
                  </Pressable>
                  <Pressable style={[styles.button, styles.secondary, styles.imageActionButton]} onPress={handleRemoveImage} disabled={saving || uploadingImage}>
                    <Text style={[styles.buttonText, styles.secondaryText]}>Remover</Text>
                  </Pressable>
                </View>
              </View>
            </View>

            <View style={styles.formSection}>
              <Text style={styles.formSectionTitle}>Configurações</Text>
              <View style={styles.field}>
                <Text style={styles.label}>Data de validade</Text>
                <TextInput
                  value={form.expiryDate}
                  onChangeText={(t) => setForm((f) => ({ ...f, expiryDate: formatExpiryInput(t) }))}
                  placeholder="DD/MM/AA (opcional)"
                  keyboardType="number-pad"
                  maxLength={8}
                  autoCapitalize="none"
                  style={styles.input}
                />
                <Text style={styles.helperInline}>Digite apenas os números. Exemplo: 030426</Text>
              </View>
              <View style={[styles.field, styles.switchRow]}>
                <Text style={styles.label}>Destaque (Promoções)</Text>
                <Switch
                  value={form.highlights}
                  onValueChange={(v) => setForm((f) => ({ ...f, highlights: v }))}
                  trackColor={{ true: BRAND, false: '#ccc' }}
                  thumbColor={form.highlights ? '#fff' : '#f4f3f4'}
                />
              </View>
            </View>

            <View style={[styles.actionsRow, isCompact && styles.stackRowCompact]}>
              <Pressable style={[styles.button, styles.secondary]} onPress={() => { setPendingUpload(null); resetForm(); }} disabled={saving || uploadingImage}>
                <Text style={[styles.buttonText, styles.secondaryText]}>Limpar</Text>
              </Pressable>
              <Pressable style={[styles.button, styles.primary]} onPress={handleSave} disabled={saving || uploadingImage}>
                <Text style={styles.buttonText}>{saving || uploadingImage ? 'Salvando...' : form.id ? 'Atualizar' : 'Criar'}</Text>
              </Pressable>
            </View>
            {uploadingImage ? <ActivityIndicator color={BRAND} style={styles.uploadingIndicator} /> : null}
          </View>
          {prefillLoading ? <Text style={styles.loading}>Carregando produto...</Text> : null}
          <Text style={styles.helper}>Use as abas Estoque e Categorias para gerenciar itens e classificações.</Text>
        </ScrollView>

        <Modal
          visible={categoryPickerVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setCategoryPickerVisible(false)}
        >
          <View style={styles.categoryModalBackdrop}>
            <View style={styles.categoryModalCard}>
              <View style={styles.categoryModalHeader}>
                <Text style={styles.categoryModalTitle}>Selecionar categoria</Text>
                <Pressable onPress={() => setCategoryPickerVisible(false)}>
                  <Text style={styles.categoryModalClose}>✕</Text>
                </Pressable>
              </View>

              <ScrollView contentContainerStyle={styles.categoryListContent}>
                {categories.map((cat) => {
                  const selected = form.category === cat.name;
                  return (
                    <Pressable
                      key={cat.id}
                      style={[styles.categoryOption, selected && styles.categoryOptionSelected]}
                      onPress={() => {
                        setForm((f) => ({ ...f, category: cat.name }));
                        setCategoryPickerVisible(false);
                      }}
                    >
                      <Text style={[styles.categoryOptionText, selected && styles.categoryOptionTextSelected]}>
                        {cat.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          </View>
        </Modal>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#faf6f0' },
  safeCompact: { paddingBottom: 4 },
  content: { padding: 16, paddingBottom: 24, gap: 14 },
  title: { fontSize: 22, fontWeight: '800', color: '#2c1b12' },
  subtitle: { color: '#6e5a4b' },
  formCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#eadfd2',
    gap: 10,
  },
  formTitle: { fontWeight: '800', color: '#2c1b12' },
  formSection: {
    borderWidth: 1,
    borderColor: '#f0e7de',
    borderRadius: 12,
    padding: 10,
    gap: 10,
    backgroundColor: '#fffdfa',
  },
  formSectionTitle: {
    fontWeight: '800',
    color: '#6b4b34',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  field: { gap: 6 },
  label: { fontWeight: '700', color: '#3c2b1e' },
  helperInline: { color: '#6e5a4b', fontSize: 12 },
  input: {
    borderWidth: 1,
    borderColor: '#d9cfc2',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 10,
    backgroundColor: '#fdfaf6',
  },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  actionsRow: { flexDirection: 'row', gap: 10 },
  stackRowCompact: { flexDirection: 'column' },
  button: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primary: { backgroundColor: BRAND },
  primaryText: { color: '#fff' },
  secondary: { borderWidth: 1, borderColor: BRAND, backgroundColor: 'transparent' },
  dangerButton: { backgroundColor: BRAND },
  secondaryText: { color: BRAND },
  buttonText: { fontWeight: '800', color: '#fff' },
  loading: { color: '#6e5a4b' },
  helper: { color: '#6e5a4b', marginTop: -2 },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#f0f0f0',
    borderWidth: 1,
    borderColor: '#d9cfc2',
  },
  chipSelected: {
    backgroundColor: BRAND,
    borderColor: BRAND,
  },
  chipText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#3c2b1e',
  },
  chipTextSelected: {
    color: '#fff',
  },
  dropdownTrigger: {
    borderWidth: 1,
    borderColor: '#d9cfc2',
    borderRadius: 10,
    backgroundColor: '#fdfaf6',
    paddingHorizontal: 12,
    paddingVertical: 11,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  dropdownValue: {
    color: '#2c1b12',
    fontWeight: '700',
    flex: 1,
  },
  dropdownCaret: {
    color: '#6e5a4b',
    fontSize: 12,
    fontWeight: '800',
  },
  categoryModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  categoryModalCard: {
    width: '100%',
    maxWidth: 420,
    maxHeight: '70%',
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#eadfd2',
    overflow: 'hidden',
  },
  categoryModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0e7de',
    backgroundColor: '#fffaf5',
  },
  categoryModalTitle: {
    color: '#2c1b12',
    fontWeight: '800',
    fontSize: 15,
  },
  categoryModalClose: {
    color: '#6e5a4b',
    fontSize: 18,
    fontWeight: '800',
  },
  categoryListContent: {
    padding: 10,
    gap: 8,
  },
  categoryOption: {
    borderWidth: 1,
    borderColor: '#eadfd2',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    backgroundColor: '#fff',
  },
  categoryOptionSelected: {
    borderColor: BRAND,
    backgroundColor: '#fff5f3',
  },
  categoryOptionText: {
    color: '#3c2b1e',
    fontWeight: '700',
  },
  categoryOptionTextSelected: {
    color: BRAND,
  },
  searchResultsWrap: {
    borderWidth: 1,
    borderColor: '#eadfd2',
    borderRadius: 10,
    backgroundColor: '#fff',
    maxHeight: 180,
    overflow: 'hidden',
  },
  searchResultsScroll: {
    maxHeight: 180,
  },
  searchResultItem: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f0e7de',
    gap: 2,
  },
  searchResultTitle: {
    color: '#2c1b12',
    fontWeight: '700',
  },
  searchResultMeta: {
    color: '#6e5a4b',
    fontSize: 12,
  },
  imagePreviewWrap: {
    borderWidth: 1,
    borderColor: '#d9cfc2',
    borderRadius: 12,
    backgroundColor: '#fdfaf6',
    overflow: 'hidden',
  },
  imagePreview: {
    width: '100%',
    height: 180,
    backgroundColor: '#f1e8de',
  },
  imagePreviewPlaceholder: {
    width: '100%',
    height: 180,
    backgroundColor: '#f1e8de',
    alignItems: 'center',
    justifyContent: 'center',
  },
  imagePreviewPlaceholderText: {
    color: '#8b7867',
    fontWeight: '700',
  },
  imageActionsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  imageActionButton: {
    flex: 1,
  },
  uploadingIndicator: {
    marginTop: 4,
  },
});
