import type { BottomTabNavigationOptions } from '@react-navigation/bottom-tabs';

export const getTabScreenOptions = (colorScheme: 'light' | 'dark'): BottomTabNavigationOptions => ({
  headerShown: false,
  tabBarActiveTintColor: '#fff',
  tabBarInactiveTintColor: '#e7e7e7',
  tabBarLabelStyle: { fontWeight: '700', fontSize: 12 },
  tabBarStyle: {
    backgroundColor: 'rgba(0,0,0,0.78)',
    borderTopWidth: 0,
    elevation: 0,
    shadowOpacity: 0,
    height: 72,
    paddingBottom: 10,
    paddingTop: 10,
  },
});
