import { Redirect } from "expo-router";
import { Platform } from "react-native";

export default function Index() {
  if (Platform.OS === 'web') {
    return <Redirect href="/(admin-web)" />;
  }

  // Redirect root to the tabs navigator (home)
  return <Redirect href="/userConfigs" />;
}
