/**
 * HideMe design tokens — source: DESIGN.md (design board).
 * Dark-first slate surfaces with an indigo→violet brand gradient.
 */

import '@/global.css';

import { Platform } from 'react-native';

/** Brand palette (theme-independent). */
export const Palette = {
  primary: '#6366F1',
  secondary: '#8B5CF6',
  success: '#10B981',
  warning: '#F59E0B',
  error: '#EF4444',
} as const;

/** Primary identity gradient — logo, FAB, primary buttons. */
export const BrandGradient = ['#6366F1', '#8B5CF6'] as const;

/** Vault home category tiles. */
export const CategoryColor = {
  photo: '#8B5CF6',
  video: '#3B82F6',
  document: '#10B981',
  all: '#F59E0B',
} as const;

export const Colors = {
  light: {
    text: '#0F172A',
    background: '#F8FAFC',
    backgroundElement: '#FFFFFF',
    backgroundSelected: '#E2E8F0',
    textSecondary: '#64748B',
    border: '#E2E8F0',
    tint: Palette.primary,
  },
  dark: {
    text: '#F8FAFC',
    background: '#0F172A',
    backgroundElement: '#1E293B',
    backgroundSelected: '#334155',
    textSecondary: '#94A3B8',
    border: '#334155',
    tint: Palette.primary,
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

/**
 * Bundled Inter families (loaded in `src/app/_layout.tsx`).
 * Android cannot synthesise weights for a custom family, so each weight has
 * its own family name — always pick the matching constant instead of
 * combining a custom fontFamily with `fontWeight`.
 */
export const Fonts = {
  sans: 'Inter_400Regular',
  sansMedium: 'Inter_500Medium',
  sansSemiBold: 'Inter_600SemiBold',
  sansBold: 'Inter_700Bold',
  mono: Platform.select({
    ios: 'ui-monospace',
    default: 'monospace',
    web: 'var(--font-mono)',
  }),
} as const;

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

/** Corner radii — cards 16, buttons 14, pills fully round. */
export const Radius = {
  sm: 10,
  md: 14,
  lg: 16,
  xl: 24,
  pill: 999,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
