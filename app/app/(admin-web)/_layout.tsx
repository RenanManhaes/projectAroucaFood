import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Slot, usePathname, useRouter } from 'expo-router';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut, type User } from 'firebase/auth';
import { auth } from '@/config/firebase';
import { isAdminEmail } from '@/constants/auth/adminEmails';
import { BRAND_PRIMARY } from '@/constants/ui/colors';

const BRAND = BRAND_PRIMARY;
const SIDEBAR_W = 220;

type AdminWebPath = '/(admin-web)/estoque' | '/(admin-web)/pedidos' | '/(admin-web)/usuarios';

const NAV_ITEMS: { label: string; path: AdminWebPath; icon: string }[] = [
  { label: 'Estoque', path: '/(admin-web)/estoque', icon: '📦' },
  { label: 'Pedidos', path: '/(admin-web)/pedidos', icon: '🛒' },
  { label: 'Usuários', path: '/(admin-web)/usuarios', icon: '👥' },
];

export default function AdminWebLayout() {
  const router = useRouter();
  const pathname = usePathname();

  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUser(u));
    return unsub;
  }, []);

  const isAdmin = useMemo(() => {
    return isAdminEmail(user?.email);
  }, [user]);

  const handleLogin = async () => {
    if (!loginEmail.trim() || !loginPassword.trim()) {
      setLoginError('Preencha e-mail e senha.');
      return;
    }
    setLoggingIn(true);
    setLoginError('');
    try {
      await signInWithEmailAndPassword(auth, loginEmail.trim(), loginPassword);
    } catch {
      setLoginError('E-mail ou senha inválidos.');
    } finally {
      setLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    setLoginEmail('');
    setLoginPassword('');
  };

  if (user === undefined) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={BRAND} />
      </View>
    );
  }

  if (!user || !isAdmin) {
    return (
      <View style={styles.centered}>
        <View style={styles.loginCard}>
          <Text style={styles.loginTitle}>AroucaFood</Text>
          <Text style={styles.loginSubtitle}>Painel Administrativo</Text>

          <TextInput
            style={styles.loginInput}
            placeholder="E-mail"
            value={loginEmail}
            onChangeText={setLoginEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TextInput
            style={styles.loginInput}
            placeholder="Senha"
            value={loginPassword}
            onChangeText={setLoginPassword}
            secureTextEntry
          />
          {loginError ? <Text style={styles.loginError}>{loginError}</Text> : null}
          <Pressable style={styles.loginBtn} onPress={handleLogin} disabled={loggingIn}>
            <Text style={styles.loginBtnText}>{loggingIn ? 'Entrando...' : 'Entrar'}</Text>
          </Pressable>
          {user && !isAdmin ? (
            <Text style={styles.loginError}>
              Acesso restrito a administradores.
            </Text>
          ) : null}
        </View>
      </View>
    );
  }

  const activePath = pathname.replace(/\/$/, '');

  return (
    <View style={styles.root}>
      {/* Sidebar */}
      <View style={styles.sidebar}>
        <View style={styles.sidebarHeader}>
          <Text style={styles.sidebarLogo}>🥩</Text>
          <Text style={styles.sidebarBrand}>AroucaFood</Text>
          <Text style={styles.sidebarRole}>Admin</Text>
        </View>

        <View style={styles.navList}>
          {NAV_ITEMS.map((item) => {
            const isActive = activePath === item.path || activePath === item.path.replace('/(admin-web)', '');
            return (
              <Pressable
                key={item.path}
                style={[styles.navItem, isActive && styles.navItemActive]}
                onPress={() => router.push(item.path)}
              >
                <Text style={styles.navIcon}>{item.icon}</Text>
                <Text style={[styles.navLabel, isActive && styles.navLabelActive]}>
                  {item.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.sidebarFooter}>
          <Text style={styles.sidebarEmail} numberOfLines={1}>{user.email}</Text>
          <Pressable style={styles.logoutBtn} onPress={handleLogout}>
            <Text style={styles.logoutText}>Sair</Text>
          </Pressable>
        </View>
      </View>

      {/* Content */}
      <View style={styles.content}>
        <Slot />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#f4f1ee',
    minHeight: '100%',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f4f1ee',
  },
  // Login
  loginCard: {
    width: 360,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 32,
    borderWidth: 1,
    borderColor: '#e0d6ce',
    gap: 14,
  },
  loginTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: BRAND,
    textAlign: 'center',
  },
  loginSubtitle: {
    fontSize: 14,
    color: '#6e5a4b',
    textAlign: 'center',
    marginTop: -8,
    marginBottom: 6,
  },
  loginInput: {
    borderWidth: 1,
    borderColor: '#d9cfc2',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    backgroundColor: '#fdfaf6',
  },
  loginError: {
    color: BRAND,
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  loginBtn: {
    backgroundColor: BRAND,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  loginBtnText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 15,
  },
  // Sidebar
  sidebar: {
    width: SIDEBAR_W,
    backgroundColor: '#2c1b12',
    flexDirection: 'column',
    paddingTop: 24,
    paddingBottom: 24,
    minHeight: '100%',
  },
  sidebarHeader: {
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#3e2a1a',
    gap: 4,
  },
  sidebarLogo: { fontSize: 32 },
  sidebarBrand: { fontSize: 18, fontWeight: '800', color: '#fff' },
  sidebarRole: {
    fontSize: 11,
    color: '#a08060',
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  navList: { flex: 1, paddingTop: 16, gap: 4, paddingHorizontal: 10 },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
  },
  navItemActive: { backgroundColor: BRAND },
  navIcon: { fontSize: 18 },
  navLabel: { fontSize: 14, fontWeight: '700', color: '#d4c4b0' },
  navLabelActive: { color: '#fff' },
  sidebarFooter: {
    paddingHorizontal: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#3e2a1a',
    gap: 8,
  },
  sidebarEmail: { fontSize: 11, color: '#a08060', fontWeight: '600' },
  logoutBtn: {
    borderWidth: 1,
    borderColor: '#a08060',
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
  },
  logoutText: { color: '#a08060', fontWeight: '700', fontSize: 13 },
  // Content
  content: {
    flex: 1,
    backgroundColor: '#f4f1ee',
    overflow: 'scroll',
  },
});
