import { Tabs } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Redirect, Slot, usePathname } from 'expo-router';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { HapticTab } from '@/components/haptic-tab';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { getTabScreenOptions } from '../../styles/tabLayout';
import { auth } from '@/config/firebase';
import { isAdminEmail } from '@/constants/auth/adminEmails';
import { BRAND_PRIMARY } from '@/constants/ui/colors';

export default function AdminLayout() {
  const colorScheme = useColorScheme();
  const pathname = usePathname();
  const [user, setUser] = useState<User | null | undefined>(undefined);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (nextUser) => setUser(nextUser));
    return unsub;
  }, []);

  const isAdmin = useMemo(() => isAdminEmail(user?.email), [user]);

  if (user === undefined) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={BRAND_PRIMARY} />
      </View>
    );
  }

  if (!isAdmin) {
    if (pathname !== '/adminConfigs/login') {
      return <Redirect href="/adminConfigs/login" />;
    }
    return <Slot />;
  }

  if (pathname === '/adminConfigs/login') {
    return <Redirect href="/adminConfigs/estoque" />;
  }

  return (
    <Tabs
      screenOptions={{
        ...getTabScreenOptions(colorScheme ?? 'light'),
        tabBarButton: HapticTab,
      }}
    >
      <Tabs.Screen
        name="estoque"
        options={{
          title: 'Estoque',
          tabBarIcon: ({ color }) => <IconSymbol size={26} name="tray.full" color={color} />,
        }}
      />
      <Tabs.Screen
        name="produtos"
        options={{
          title: 'Produtos',
          tabBarIcon: ({ color }) => <IconSymbol size={26} name="list.bullet" color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Perfil',
          tabBarIcon: ({ color }) => <IconSymbol size={26} name="person.crop.circle" color={color} />,
        }}
      />
      <Tabs.Screen
        name="login"
        options={{
          href: null,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
