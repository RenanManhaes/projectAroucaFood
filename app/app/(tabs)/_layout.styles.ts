import { Colors } from '@/constants/theme';

export const getTabScreenOptions = (colorScheme: 'light' | 'dark') => ({
  tabBarActiveTintColor: Colors[colorScheme].tint,
  headerShown: false,
});
