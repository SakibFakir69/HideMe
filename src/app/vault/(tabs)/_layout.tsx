import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Fonts, Palette } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** Space the icons + labels need above the system navigation bar. */
const TAB_BAR_CONTENT_HEIGHT = 58;

export default function VaultTabsLayout() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: Palette.primary,
        tabBarInactiveTintColor: theme.textSecondary,
        // Lift the keyboard instead of squashing the bar behind it.
        tabBarHideOnKeyboard: true,
        // The Android navigation bar (3-button) or gesture pill overlays the
        // bottom edge when edge-to-edge is enabled, so the bar owns that
        // inset itself — otherwise the labels sit under the system buttons.
        tabBarStyle: [
          styles.tabBar,
          {
            height: TAB_BAR_CONTENT_HEIGHT + insets.bottom,
            paddingBottom: insets.bottom + 6,
            backgroundColor: theme.backgroundElement,
            borderTopColor: theme.border,
          },
        ],
        tabBarLabelStyle: styles.tabLabel,
        sceneStyle: { backgroundColor: theme.background },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'home' : 'home-outline'} size={22} color={color as string} />
          ),
        }}
      />
      <Tabs.Screen
        name="files"
        options={{
          title: 'Files',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'document' : 'document-outline'} size={22} color={color as string} />
          ),
        }}
      />
      <Tabs.Screen
        name="gallery"
        options={{
          title: 'Gallery',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'images' : 'images-outline'} size={22} color={color as string} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'settings' : 'settings-outline'} size={22} color={color as string} />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    paddingTop: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  tabLabel: {
    fontSize: 11,
    fontFamily: Fonts.sansSemiBold,
  },
});
