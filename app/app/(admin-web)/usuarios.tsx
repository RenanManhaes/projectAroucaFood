import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { collection, deleteDoc, doc, onSnapshot, serverTimestamp, updateDoc } from 'firebase/firestore';
import { auth, db } from '@/config/firebase';
import { isAdminEmail } from '@/constants/auth/adminEmails';

type UserRow = {
  id: string;
  name: string;
  email: string;
  phone: string;
  cartItemsCount: number;
  cartUpdatedAtMs: number | null;
  role: 'admin' | 'usuario';
  createdAtLabel: string;
};

type UserFilterMode = 'all' | 'callback' | 'admin' | 'usuario';

type CallbackSignal = {
  count: number;
  updatedAtMs: number | null;
};

const normalizeOptionalString = (value: unknown) => {
  if (typeof value !== 'string') return '';
  return value.trim();
};

const getErrorMessage = (error: unknown, fallback: string) => {
  return error instanceof Error ? error.message : fallback;
};

const hasToDate = (value: unknown): value is { toDate: () => Date } => {
  return !!value && typeof (value as { toDate?: unknown }).toDate === 'function';
};

const formatDate = (value: unknown) => {
  if (!hasToDate(value)) {
    return '-';
  }
  return value.toDate().toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const getTimestampMs = (value: unknown) => {
  if (!value) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value instanceof Date) return value.getTime();
  if (typeof (value as { toMillis?: unknown }).toMillis === 'function') {
    try {
      return (value as { toMillis: () => number }).toMillis();
    } catch {
      return null;
    }
  }
  return null;
};

const normalizePhoneDigits = (value: string) => value.replace(/\D/g, '');


export default function UsuariosWebScreen() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [actionMessage, setActionMessage] = useState('');
  const [search, setSearch] = useState('');
  const [filterMode, setFilterMode] = useState<UserFilterMode>('all');
  const [editingUserId, setEditingUserId] = useState('');
  const [editingName, setEditingName] = useState('');
  const [savingUserId, setSavingUserId] = useState('');
  const [deletingUserId, setDeletingUserId] = useState('');
  const [callbackByUserId, setCallbackByUserId] = useState<Record<string, CallbackSignal>>({});

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'carts'),
      (snap) => {
        const now = Date.now();
        const next: Record<string, CallbackSignal> = {};

        snap.docs.forEach((docSnap) => {
          const data = docSnap.data();
          const expiresAtMs = getTimestampMs(data?.expiresAt);
          if (typeof expiresAtMs === 'number' && expiresAtMs > 0 && expiresAtMs < now) {
            return;
          }

          const items = Array.isArray(data?.items) ? data.items : [];
          const qtyCount = items.reduce((sum, item) => {
            const qty = Number((item as { qty?: unknown })?.qty) || 0;
            return sum + Math.max(0, qty);
          }, 0);
          const updatedAtMs = getTimestampMs(data?.updatedAt);

          if (qtyCount > 0) {
            next[docSnap.id] = {
              count: qtyCount,
              updatedAtMs,
            };
          }
        });

        setCallbackByUserId(next);
      },
      () => {
        setCallbackByUserId({});
      }
    );

    return unsub;
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'users'), (snap) => {
      const byEmail = new Map<string, UserRow>();
      setErrorMessage('');

      snap.docs.forEach((docSnap) => {
        const data = docSnap.data();
        const email = normalizeOptionalString(data?.email).toLowerCase();
        const name = normalizeOptionalString(data?.name);
        const phone = normalizeOptionalString(data?.phone);
        const role = isAdminEmail(email) ? 'admin' : 'usuario';
        const cartSignal = callbackByUserId[docSnap.id];
        const row: UserRow = {
          id: docSnap.id,
          name: name || '-',
          email: email || '-',
          phone: phone || '-',
          cartItemsCount: role === 'admin' ? 0 : cartSignal?.count ?? 0,
          cartUpdatedAtMs: role === 'admin' ? null : cartSignal?.updatedAtMs ?? null,
          role,
          createdAtLabel: formatDate(data?.createdAt),
        };

        if (email) {
          byEmail.set(email, row);
        } else {
          byEmail.set(docSnap.id, row);
        }
      });

      const merged = Array.from(byEmail.values()).sort((a, b) => {
        if (a.role !== b.role) return a.role === 'admin' ? -1 : 1;
        return a.name.localeCompare(b.name, 'pt-BR');
      });

      setUsers(merged);
      setLoading(false);
    }, (error) => {
      setUsers([]);
      setLoading(false);
      setErrorMessage(error?.message || 'Não foi possível carregar usuários.');
    });

    return unsub;
  }, [callbackByUserId]);

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = users;

    if (filterMode === 'callback') {
      list = list.filter((user) => user.role === 'usuario' && user.cartItemsCount > 0);
      list = [...list].sort((a, b) => {
        const left = typeof a.cartUpdatedAtMs === 'number' ? a.cartUpdatedAtMs : Number.MAX_SAFE_INTEGER;
        const right = typeof b.cartUpdatedAtMs === 'number' ? b.cartUpdatedAtMs : Number.MAX_SAFE_INTEGER;
        if (left !== right) return left - right;
        return b.cartItemsCount - a.cartItemsCount;
      });
    } else if (filterMode === 'admin') {
      list = list.filter((user) => user.role === 'admin');
    } else if (filterMode === 'usuario') {
      list = list.filter((user) => user.role === 'usuario');
    }

    if (!q) return list;

    return list.filter((user) => {
      return (
        user.name.toLowerCase().includes(q) ||
        user.email.toLowerCase().includes(q) ||
        user.phone.toLowerCase().includes(q)
      );
    });
  }, [users, search, filterMode]);

  const copyText = async (text: string) => {
    try {
      if (!text) {
        setActionMessage('Contato vazio para copiar.');
        return;
      }

      const nav = (globalThis as { navigator?: { clipboard?: { writeText?: (value: string) => Promise<void> } } }).navigator;
      if (nav?.clipboard?.writeText) {
        await nav.clipboard.writeText(text);
        setActionMessage(`Copiado: ${text}`);
        return;
      }

      setActionMessage(`Copie manualmente: ${text}`);
    } catch {
      setActionMessage('Não foi possível copiar automaticamente.');
    }
  };

  const handleCopyPhone = async (user: UserRow) => {
    const raw = normalizeOptionalString(user.phone);
    const digits = normalizePhoneDigits(raw);
    if (!digits) {
      setActionMessage('Usuário sem telefone para copiar.');
      return;
    }
    await copyText(digits);
  };

  const totals = useMemo(() => {
    const admins = users.filter((u) => u.role === 'admin').length;
    const callbacks = users.filter((u) => u.role === 'usuario' && u.cartItemsCount > 0).length;
    return {
      all: users.length,
      admins,
      callbacks,
      regular: users.length - admins,
    };
  }, [users]);

  const startEdit = (user: UserRow) => {
    setActionMessage('');
    setEditingUserId(user.id);
    setEditingName(user.name === '-' ? '' : user.name);
  };

  const cancelEdit = () => {
    setEditingUserId('');
    setEditingName('');
  };

  const saveName = async (user: UserRow) => {
    const normalizedName = editingName.replace(/\s+/g, ' ').trim();
    if (!normalizedName) {
      setActionMessage('Informe um nome válido para salvar.');
      return;
    }

    setSavingUserId(user.id);
    setActionMessage('');
    try {
      await updateDoc(doc(db, 'users', user.id), {
        name: normalizedName,
        updatedAt: serverTimestamp(),
      });
      cancelEdit();
      setActionMessage('Nome atualizado com sucesso.');
    } catch (error: unknown) {
      setActionMessage(getErrorMessage(error, 'Não foi possível atualizar o nome.'));
    } finally {
      setSavingUserId('');
    }
  };

  const deleteUserProfile = async (user: UserRow) => {
    if (user.id === auth.currentUser?.uid) {
      setActionMessage('Não é permitido excluir o próprio perfil por aqui.');
      return;
    }

    const doDelete = async () => {
      cancelEdit();
      setDeletingUserId(user.id);
      setActionMessage('');
      try {
        await deleteDoc(doc(db, 'users', user.id));
        await deleteDoc(doc(db, 'carts', user.id));
        setActionMessage('Perfil excluído com sucesso no Firestore.');
      } catch (error: unknown) {
        setActionMessage(getErrorMessage(error, 'Não foi possível excluir o perfil.'));
      } finally {
        setDeletingUserId('');
      }
    };

    if (typeof window !== 'undefined' && typeof window.confirm === 'function') {
      const confirmed = window.confirm(`Excluir o perfil de ${user.name}?`);
      if (confirmed) {
        await doDelete();
      }
      return;
    }

    Alert.alert('Excluir perfil', `Excluir o perfil de ${user.name}?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Excluir', style: 'destructive', onPress: () => { void doDelete(); } },
    ]);
  };

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Text style={styles.pageTitle}>Usuários</Text>
      <Text style={styles.pageSubtitle}>Todos os usuários reais cadastrados no Firestore</Text>

      {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
      {actionMessage ? <Text style={styles.infoText}>{actionMessage}</Text> : null}

      <View style={styles.statsRow}>
        <Pressable
          style={[styles.statCard, filterMode === 'all' && styles.statCardActive]}
          onPress={() => setFilterMode('all')}
        >
          <Text style={styles.statValue}>{totals.all}</Text>
          <Text style={styles.statLabel}>Total</Text>
        </Pressable>
        <Pressable
          style={[styles.statCard, filterMode === 'admin' && styles.statCardActive]}
          onPress={() => setFilterMode('admin')}
        >
          <Text style={styles.statValue}>{totals.admins}</Text>
          <Text style={styles.statLabel}>Admins</Text>
        </Pressable>
        <Pressable
          style={[styles.statCard, filterMode === 'callback' && styles.statCardActive]}
          onPress={() => setFilterMode('callback')}
        >
          <Text style={styles.statValue}>{totals.callbacks}</Text>
          <Text style={styles.statLabel}>Callback</Text>
        </Pressable>
        <Pressable
          style={[styles.statCard, filterMode === 'usuario' && styles.statCardActive]}
          onPress={() => setFilterMode('usuario')}
        >
          <Text style={styles.statValue}>{totals.regular}</Text>
          <Text style={styles.statLabel}>Usuários</Text>
        </Pressable>
      </View>

      <TextInput
        style={styles.searchInput}
        placeholder="Buscar por nome, e-mail ou telefone..."
        value={search}
        onChangeText={setSearch}
      />

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#7a3f19" />
        </View>
      ) : (
        <View style={styles.table}>
          <View style={[styles.row, styles.headerRow]}>
            <Text style={[styles.headerCell, { flex: 2 }]}>Nome</Text>
            <Text style={[styles.headerCell, { flex: 2 }]}>E-mail</Text>
            <Text style={[styles.headerCell, { flex: 1 }]}>Telefone</Text>
            <Text style={[styles.headerCell, { flex: 0.8 }]}>Carrinho</Text>
            <Text style={[styles.headerCell, { flex: 1 }]}>Perfil</Text>
            <Text style={[styles.headerCell, { flex: 1 }]}>Cadastro</Text>
            <Text style={[styles.headerCell, { flex: 1.8 }]}>Ações</Text>
          </View>

          {filteredUsers.map((user) => (
            <View key={user.id} style={styles.row}>
              {editingUserId === user.id ? (
                <TextInput
                  value={editingName}
                  onChangeText={setEditingName}
                  style={[styles.editInput, { flex: 2 }]}
                  placeholder="Nome"
                  maxLength={80}
                />
              ) : (
                <Text style={[styles.cell, { flex: 2 }]} numberOfLines={1}>{user.name}</Text>
              )}
              <Text style={[styles.cell, { flex: 2 }]} numberOfLines={1}>{user.email}</Text>
              <Text style={[styles.cell, { flex: 1 }]} numberOfLines={1}>{user.phone}</Text>
              <View style={{ flex: 0.8 }}>
                <Text style={[styles.cartBadge, user.cartItemsCount > 0 ? styles.cartBadgeActive : styles.cartBadgeEmpty]}>
                  {user.cartItemsCount}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.roleBadge, user.role === 'admin' ? styles.adminBadge : styles.userBadge]}>
                  {user.role === 'admin' ? 'Admin' : 'Usuário'}
                </Text>
              </View>
              <Text style={[styles.cell, { flex: 1, color: '#8f7a6a' }]}>{user.createdAtLabel}</Text>
              <View style={[styles.actionsCell, { flex: 1.8 }]}>
                {editingUserId === user.id ? (
                  <>
                    <Pressable
                      style={[styles.actionBtn, styles.saveBtn, savingUserId === user.id && styles.actionBtnDisabled]}
                      onPress={() => { void saveName(user); }}
                      disabled={savingUserId === user.id || deletingUserId === user.id}
                    >
                      <Text style={styles.actionBtnText}>{savingUserId === user.id ? 'Salvando...' : 'Salvar'}</Text>
                    </Pressable>
                    <Pressable style={[styles.actionBtn, styles.cancelBtn]} onPress={cancelEdit} disabled={savingUserId === user.id}>
                      <Text style={styles.cancelBtnText}>Cancelar</Text>
                    </Pressable>
                  </>
                ) : (
                  <>
                    {user.cartItemsCount > 0 ? (
                      <>
                        <Pressable
                          style={[styles.actionBtn, styles.contactBtn]}
                          onPress={() => {
                            void handleCopyPhone(user);
                          }}
                        >
                          <Text style={styles.actionBtnText}>Copiar tel</Text>
                        </Pressable>
                      </>
                    ) : null}
                    <Pressable
                      style={[styles.actionBtn, styles.editBtn]}
                      onPress={() => startEdit(user)}
                      disabled={deletingUserId === user.id || savingUserId === user.id}>
                      <Text style={styles.actionBtnText}>Editar</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.actionBtn, styles.deleteBtn, deletingUserId === user.id && styles.actionBtnDisabled]}
                      onPress={() => { void deleteUserProfile(user); }}
                      disabled={deletingUserId === user.id || savingUserId === user.id}
                    >
                      <Text style={styles.actionBtnText}>{deletingUserId === user.id ? 'Excluindo...' : 'Excluir'}</Text>
                    </Pressable>
                  </>
                )}
              </View>
            </View>
          ))}

          {!filteredUsers.length ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>Nenhum usuário encontrado para esse filtro.</Text>
            </View>
          ) : null}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 32, paddingBottom: 60, gap: 12 },
  pageTitle: { fontSize: 28, fontWeight: '800', color: '#2c1b12' },
  pageSubtitle: { fontSize: 14, color: '#6e5a4b', marginBottom: 8 },
  errorText: {
    color: '#9f2d2d',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 6,
  },
  infoText: {
    color: '#2f5f2d',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 6,
  },
  statsRow: { flexDirection: 'row', gap: 12, marginBottom: 2 },
  statCard: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e8ddd4',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 18,
    minWidth: 120,
  },
  statCardActive: {
    borderColor: '#c3865c',
    backgroundColor: '#fff7ef',
  },
  statValue: { fontSize: 28, fontWeight: '800', color: '#2c1b12' },
  statLabel: { fontSize: 12, color: '#6e5a4b', fontWeight: '700' },
  searchInput: {
    borderWidth: 1,
    borderColor: '#d8ccbf',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    backgroundColor: '#fff',
    fontSize: 14,
  },
  centered: {
    paddingVertical: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  table: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e8ddd4',
    overflow: 'hidden',
  },
  headerRow: { backgroundColor: '#f8f4f0' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1e8e0',
  },
  headerCell: { fontSize: 12, fontWeight: '800', color: '#3f2e22' },
  cell: { fontSize: 13, color: '#2c1b12' },
  editInput: {
    borderWidth: 1,
    borderColor: '#d8ccbf',
    borderRadius: 8,
    backgroundColor: '#fffaf5',
    paddingHorizontal: 10,
    paddingVertical: 7,
    fontSize: 13,
    color: '#2c1b12',
  },
  actionsCell: {
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'flex-end',
  },
  actionBtn: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnDisabled: { opacity: 0.7 },
  editBtn: { backgroundColor: '#8a5c3d' },
  saveBtn: { backgroundColor: '#2f5f2d' },
  cancelBtn: {
    backgroundColor: '#ede3da',
    borderWidth: 1,
    borderColor: '#d8ccbf',
  },
  deleteBtn: { backgroundColor: '#9f2d2d' },
  contactBtn: { backgroundColor: '#2b6f6b' },
  actionBtnText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  cancelBtnText: { color: '#5c4534', fontSize: 12, fontWeight: '800' },
  roleBadge: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    fontSize: 12,
    fontWeight: '800',
    overflow: 'hidden',
  },
  adminBadge: {
    backgroundColor: '#7a3f19',
    color: '#fff',
  },
  userBadge: {
    backgroundColor: '#e6d7cb',
    color: '#5c4534',
  },
  cartBadge: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    fontSize: 12,
    fontWeight: '800',
    overflow: 'hidden',
  },
  cartBadgeActive: {
    backgroundColor: '#fef2d7',
    color: '#8a4b10',
  },
  cartBadgeEmpty: {
    backgroundColor: '#e6d7cb',
    color: '#5c4534',
  },
  emptyState: {
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: { color: '#6e5a4b' },
});
