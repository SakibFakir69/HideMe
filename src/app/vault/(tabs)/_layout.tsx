import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { useEffect } from 'react';
import { StyleSheet, View, type ColorValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Fonts } from '@/constants/theme';
import { VAULT_ACCENTS, type VaultAccent } from '@/constants/vault-theme';
import { useVaultPalette } from '@/hooks/use-vault-palette';
import { mark } from '@/lib/perf';

/** Space the icons + labels need above the system navigation bar. */
const TAB_BAR_CONTENT_HEIGHT = 58;

export default function VaultTabsLayout() {
  const palette = useVaultPalette();
  const insets = useSafeAreaInsets();

  // "The vault is on screen" — paired with unlock.done this isolates how much
  // of the PIN → vault wait is key derivation and how much is navigation/render.
  useEffect(() => {
    mark('vault.ready');
  }, []);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: palette.accent,
        tabBarInactiveTintColor: palette.textSecondary,
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
            backgroundColor: palette.surface,
            borderTopColor: 'transparent',
          },
        ],
        tabBarLabelStyle: styles.tabLabel,
        sceneStyle: { backgroundColor: palette.background },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarActiveTintColor: VAULT_ACCENTS.emerald.base,
          tabBarIcon: ({ color, focused }) => (
            <TabIcon
              name="home-outline"
              active="home"
              focused={focused}
              color={color}
              accent="emerald"
            />
          ),
        }}
      />
      <Tabs.Screen
        name="files"
        options={{
          title: 'Files',
          tabBarActiveTintColor: VAULT_ACCENTS.emerald.base,
          tabBarIcon: ({ color, focused }) => (
            <TabIcon
              name="document-outline"
              active="document"
              focused={focused}
              color={color}
              accent="emerald"
            />
          ),
        }}
      />
      <Tabs.Screen
        name="gallery"
        options={{
          title: 'Gallery',
          tabBarActiveTintColor: VAULT_ACCENTS.emerald.base,
          tabBarIcon: ({ color, focused }) => (
            <TabIcon
              name="images-outline"
              active="images"
              focused={focused}
              color={color}
              accent="emerald"
            />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarActiveTintColor: VAULT_ACCENTS.emerald.base,
          tabBarIcon: ({ color, focused }) => (
            <TabIcon
              name="settings-outline"
              active="settings"
              focused={focused}
              color={color}
              accent="emerald"
            />
          ),
        }}
      />
    </Tabs>
  );
}

/** One tab icon — the filled glyph plus the focus indicator. */
function TabIcon({
  name,
  active,
  focused,
  color,
  accent,
}: {
  name: keyof typeof Ionicons.glyphMap;
  active: keyof typeof Ionicons.glyphMap;
  focused: boolean;
  color: ColorValue;
  accent: VaultAccent;
}) {
  return (
    <View style={styles.iconWrap}>
      <Ionicons name={focused ? active : name} size={22} color={color as string} />
      {focused && (
        <View style={[styles.indicator, { backgroundColor: VAULT_ACCENTS[accent].base }]} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    paddingTop: 8,
    borderTopWidth: 0,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: 'hidden',
    elevation: 12,
  },
  tabLabel: {
    fontSize: 11,
    fontFamily: Fonts.sansSemiBold,
  },
  iconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  indicator: {
    width: 22,
    height: 3,
    borderRadius: 2,
  },
});
