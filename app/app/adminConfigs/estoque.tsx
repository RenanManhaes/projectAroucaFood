import React, { useCallback, useEffect, useMemo, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import {
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Image,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, serverTimestamp, updateDoc } from 'firebase/firestore';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { auth, db } from '@/config/firebase';
import { isAdminEmail } from '@/constants/auth/adminEmails';
import { PRODUCT_IMAGE_OPTIONS, getProductImage, getProductImageLabel } from '@/constants/media/productImages';
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

const getErrorMessage = (error: unknown, fallback: string) => {
  return error instanceof Error ? error.message : fallback;
};

type ImageMode = 'database' | 'upload';

export default function EstoqueScreen() {
  const router = useRouter();
  const user = auth.currentUser;

  const [categories, setCategories] = useState<Category[]>(mapDefaultCategories());

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
  const [imageMode, setImageMode] = useState<ImageMode>('database');
  const [dbImageOptions, setDbImageOptions] = useState<string[]>([]);
  const [newCategory, setNewCategory] = useState('');
  const [renameTarget, setRenameTarget] = useState<Category | null>(null);
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
    setImageMode('database');
  }, [categories]);

  const parseNumber = (value: string) => Number(value.replace(',', '.').trim());

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

    const loadDbImageOptions = async () => {
      try {
        const snap = await getDocs(collection(db, 'produtos'));
        const unique = new Map<string, string>();

        snap.docs.forEach((d) => {
          const data = d.data();
          const value = typeof data?.image === 'string' ? data.image.trim() : '';
          if (!value) return;
          if (!unique.has(value)) {
            unique.set(value, value);
          }
        });

        const options = Array.from(unique.values());
        setDbImageOptions(options);
      } catch (err) {
        console.warn('Falha ao carregar imagens do banco', err);
      }
    };

    loadDbImageOptions();
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin) return;

    const loadCategories = async () => {
      try {
        const snap = await getDocs(collection(db, 'categorias'));
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
      } catch (err) {
        console.warn('Falha ao carregar categorias', err);
      }
    };

    loadCategories();
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
          setImageMode('database');
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

  const chooseDatabaseImage = (imageKey: string) => {
    setPendingUpload(null);
    setForm((f) => ({ ...f, image: imageKey }));
  };

  const handleSelectImageMode = (mode: ImageMode) => {
    setImageMode(mode);
    if (mode === 'database') {
      setPendingUpload(null);
      setForm((f) => ({
        ...f,
        image: f.image || dbImageOptions[0] || PRODUCT_IMAGE_OPTIONS[0] || '',
      }));
    }
  };

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

  const handleAddCategory = async () => {
    const value = newCategory.trim();
    if (!value) return;

    // Renomear categoria existente
    if (renameTarget) {
      const duplicate = categories.some(
        (c) => c.id !== renameTarget.id && c.name.toLowerCase() === value.toLowerCase()
      );
      if (duplicate) {
        Alert.alert('Atenção', 'Já existe uma categoria com esse nome.');
        return;
      }
      try {
        if (!renameTarget.id.startsWith('default-') && !renameTarget.id.startsWith('temp-')) {
          await updateDoc(doc(db, 'categorias', renameTarget.id), {
            nome: value,
            updatedAt: serverTimestamp(),
          });
        }
        setCategories((prev) =>
          prev.map((c) => (c.id === renameTarget.id ? { ...c, name: value } : c))
        );
        setForm((f) => ({ ...f, category: f.category === renameTarget.name ? value : f.category }));
        setRenameTarget(null);
        setNewCategory('');
        return;
      } catch {
        Alert.alert('Erro', 'Não foi possível renomear a categoria.');
        return;
      }
    }

    try {
      const exists = categories.some((c) => c.name.toLowerCase() === value.toLowerCase());
      if (exists) {
        setForm((f) => ({ ...f, category: value }));
        setNewCategory('');
        return;
      }

      const docRef = await addDoc(collection(db, 'categorias'), {
        nome: value,
        createdAt: serverTimestamp(),
      });

      const nextCat = { id: docRef.id, name: value };
      setCategories((prev) => [...prev, nextCat]);
      setForm((f) => ({ ...f, category: value }));
      setNewCategory('');
    } catch {
      Alert.alert('Erro', 'Não foi possível criar a categoria.');
    }
  };

  const handleRemoveCategory = (catId: string) => {
    const target = categories.find((c) => c.id === catId);
    if (!target) return;
    const isDefault = target.id.startsWith('default-');
    const isTemp = target.id.startsWith('temp-');
    if (isDefault) {
      Alert.alert('Não permitido', 'Categorias padrão não podem ser removidas.');
      return;
    }

    Alert.alert('Remover categoria', `Deseja remover "${target.name}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Remover',
        style: 'destructive',
        onPress: async () => {
          try {
            if (!isTemp) {
              await deleteDoc(doc(db, 'categorias', catId));
            }
            setCategories((prev) => {
              const next = prev.filter((c) => c.id !== catId);
              if (next.length === 0) return mapDefaultCategories();
              if (form.category === target.name) {
                setForm((f) => ({ ...f, category: next[0].name }));
              }
              return next;
            });
          } catch {
            Alert.alert('Erro', 'Não foi possível remover a categoria.');
          }
        },
      },
    ]);
  };

  const handleStartRename = (cat: Category) => {
    setRenameTarget(cat);
    setNewCategory(cat.name);
  };

  const handleCancelRename = () => {
    setRenameTarget(null);
    setNewCategory('');
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
    : getProductImage(form.image);
  const showImagePreview = Boolean(previewSource);

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>Estoque</Text>
          <Text style={styles.subtitle}>Edite ou crie produtos rapidamente.</Text>

          <View style={styles.formCard}>
            <Text style={styles.formTitle}>{form.id ? 'Editar produto' : 'Novo produto'}</Text>
            <View style={styles.field}>
              <Text style={styles.label}>Imagem atual do produto</Text>
              {showImagePreview ? (
                <>
                  <View style={styles.imagePreviewWrap}>
                    <Image source={previewSource!} style={styles.imagePreview} resizeMode="cover" />
                  </View>
                  <Text style={styles.helperInline}>
                    {pendingUpload ? `Nova imagem selecionada: ${pendingUpload.fileName}` : getProductImageLabel(form.image) || 'Nenhuma imagem selecionada.'}
                  </Text>
                </>
              ) : (
                <Text style={styles.helperInline}>Nenhuma imagem selecionada.</Text>
              )}
            </View>
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
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 8, paddingVertical: 4 }}
              >
                {categories.map((cat) => {
                  const selected = form.category === cat.name;
                  return (
                    <Pressable
                      key={cat.id}
                      style={[styles.chip, selected && styles.chipSelected]}
                      onPress={() => setForm((f) => ({ ...f, category: cat.name }))}
                      onLongPress={() => handleRemoveCategory(cat.id)}
                    >
                      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{cat.name}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
            <View style={styles.field}>
              <Text style={styles.label}>Imagem</Text>
              <View style={styles.imageModeRow}>
                <Pressable
                  style={[styles.chip, styles.imageModeChip, imageMode === 'database' && styles.chipSelected]}
                  onPress={() => handleSelectImageMode('database')}
                >
                  <Text numberOfLines={2} style={[styles.chipText, styles.imageModeChipText, imageMode === 'database' && styles.chipTextSelected]}>Usar imagem do banco</Text>
                </Pressable>
                <Pressable
                  style={[styles.chip, styles.imageModeChip, imageMode === 'upload' && styles.chipSelected]}
                  onPress={() => handleSelectImageMode('upload')}
                >
                  <Text numberOfLines={2} style={[styles.chipText, styles.imageModeChipText, imageMode === 'upload' && styles.chipTextSelected]}>Enviar nova imagem</Text>
                </Pressable>
              </View>
              <Text style={styles.helperInline}>Escolha se você vai usar uma imagem já existente ou enviar uma nova.</Text>
              {imageMode === 'upload' ? (
                <View style={styles.imageActionsRow}>
                  <Pressable style={[styles.button, styles.primary, styles.imageActionButton]} onPress={handlePickImage} disabled={saving || uploadingImage}>
                    <Text style={styles.buttonText}>{uploadingImage ? 'Enviando...' : 'Escolher arquivo'}</Text>
                  </Pressable>
                  <Pressable style={[styles.button, styles.secondary, styles.imageActionButton]} onPress={handleRemoveImage} disabled={saving || uploadingImage}>
                    <Text style={[styles.buttonText, styles.secondaryText]}>Remover</Text>
                  </Pressable>
                </View>
              ) : null}
              {imageMode === 'database' ? (
                dbImageOptions.length > 0 ? (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ gap: 10, paddingVertical: 4 }}
                  >
                    {dbImageOptions.map((img) => {
                      const selected = form.image === img && !pendingUpload;
                      const source = getProductImage(img);
                      return (
                        <Pressable
                          key={img}
                          style={[styles.imageChip, selected && styles.imageChipSelected]}
                          onPress={() => chooseDatabaseImage(img)}
                        >
                          {source ? <Image source={source} style={styles.imageThumb} resizeMode="cover" /> : null}
                          <Text style={[styles.imageText, selected && styles.imageTextSelected]} numberOfLines={1}>
                            {getProductImageLabel(img)}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                ) : (
                  <Text style={styles.helperInline}>Nenhuma imagem encontrada no banco de dados.</Text>
                )
              ) : null}
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

            <View style={styles.actionsRow}>
              <Pressable style={[styles.button, styles.secondary]} onPress={() => { setPendingUpload(null); resetForm(); }} disabled={saving || uploadingImage}>
                <Text style={[styles.buttonText, styles.secondaryText]}>Limpar</Text>
              </Pressable>
              <Pressable style={[styles.button, styles.primary]} onPress={handleSave} disabled={saving || uploadingImage}>
                <Text style={styles.buttonText}>{saving || uploadingImage ? 'Salvando...' : form.id ? 'Atualizar' : 'Criar'}</Text>
              </Pressable>
            </View>
            {uploadingImage ? <ActivityIndicator color={BRAND} style={styles.uploadingIndicator} /> : null}
          </View>

          <View style={styles.categoryCard}>
            <Text style={styles.formTitle}>Gerenciar categorias</Text>
            <View style={styles.addCategoryRow}>
              <TextInput
                value={newCategory}
                onChangeText={setNewCategory}
                placeholder={renameTarget ? "Novo nome da categoria" : "Nova categoria"}
                style={[styles.input, styles.addCategoryInput]}
              />
              <Pressable style={[styles.button, styles.primary, styles.addCategoryButton]} onPress={handleAddCategory}>
                <Text style={styles.buttonText}>{renameTarget ? 'Salvar nome' : 'Criar'}</Text>
              </Pressable>
            </View>
            <View>
              {renameTarget ? (
              <Pressable onPress={handleCancelRename} style={styles.cancelRenameBtn}>
                <Text style={styles.cancelRenameText}>Cancelar renomear</Text>
              </Pressable>
            ) : null}
            </View>
            <View style={styles.categoryList}>
              {categories.map((cat) => (
                <View key={cat.id} style={styles.categoryItem}>
                  <Text style={styles.categoryName}>{cat.name}</Text>

                  <View style={styles.categoryActions}>
                    <Pressable
                      style={[styles.button, styles.secondary, styles.categoryActionButton]}
                      onPress={() => handleStartRename(cat)}
                    >
                      <Text style={[styles.buttonText, styles.secondaryText]}>Renomear</Text>
                    </Pressable>

                    {!cat.id.startsWith('default-') ? (
                      <Pressable
                        style={[styles.button, styles.dangerButton, styles.categoryActionButton]}
                        onPress={() => handleRemoveCategory(cat.id)}
                      >
                        <Text style={styles.buttonText}>Remover</Text>
                      </Pressable>
                    ) : null}
                  </View>
                </View>
              ))}
            </View>
          </View>

          {prefillLoading ? <Text style={styles.loading}>Carregando produto...</Text> : null}
          <Text style={styles.helper}>Use a aba Produtos para listar e escolher itens para editar.</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#faf6f0' },
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
  categoryCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#eadfd2',
    gap: 10,
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
  cancelRenameBtn: {
    marginTop: 6,
    alignSelf: 'flex-start',
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  cancelRenameText: {
    color: BRAND,
    fontWeight: '800',
  },
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
  imageModeRow: {
    flexDirection: 'row',
    gap: 8,
    width: '100%',
  },
  imageModeChip: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  imageModeChipText: {
    textAlign: 'center',
    lineHeight: 18,
    flexShrink: 1,
  },
  imageChip: {
    width: 110,
    borderWidth: 1,
    borderColor: '#d9cfc2',
    borderRadius: 12,
    padding: 8,
    backgroundColor: '#fdfaf6',
    alignItems: 'center',
    gap: 6,
  },
  imageChipSelected: {
    borderColor: BRAND,
    shadowColor: BRAND,
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  imageThumb: { width: 70, height: 70, borderRadius: 10 },
  imageText: { fontSize: 12, textAlign: 'center', color: '#3c2b1e', fontWeight: '700' },
  imageTextSelected: { color: BRAND },
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
  addCategoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  addCategoryInput: {
    flex: 1,
  },
  addCategoryButton: {
    paddingHorizontal: 16,
  },
  categoryList: {
    gap: 8,
    marginTop: 4,
  },
  categoryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#eadfd2',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: '#fdfaf6',
  },
  categoryName: {
    fontWeight: '700',
    color: '#2c1b12',
    flex: 1,
    paddingRight: 12,
  },
  categoryActions: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  categoryActionButton: {
    flex: 0,
    minWidth: 96,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
});
