/**
 * The vault's own palette: deep navy surfaces and a single emerald accent.
 *
 * The app's slate theme is the board the whole app is drawn on; the vault
 * screens (home, gallery, settings) add one step deeper — a darker, cooler
 * background with a green light source in the corner. The light values keep
 * the same layout when the user picks the light theme.
 */

export interface VaultPalette {
  /** The screen behind the cards. */
  background: string;
  /** One step deeper — the settings console. */
  backgroundDeep: string;
  /** Card surface: rows, tiles, the tab bar. */
  surface: string;
  /** Raised surface. */
  surfaceHigh: string;
  border: string;
  text: string;
  textSecondary: string;
  /** The one accent: emerald. */
  accent: string;
  accentBright: string;
  /** Translucent accent wash behind the accent icons. */
  accentWash: string;
  /** Background of the small pills. */
  chip: string;
  /** The corner light source. */
  glow: string;
  isDark: boolean;
}

export const VAULT_DARK: VaultPalette = {
  background: '#0A1220',
  backgroundDeep: '#070C13',
  surface: '#121C2E',
  surfaceHigh: '#1A2637',
  border: 'rgba(148,163,184,0.12)',
  text: '#F1F5F9',
  textSecondary: '#93A4BF',
  accent: '#22C55E',
  accentBright: '#4ADE80',
  accentWash: 'rgba(34,197,94,0.14)',
  chip: 'rgba(148,163,184,0.14)',
  glow: 'rgba(34,197,94,0.13)',
  isDark: true,
};

export const VAULT_LIGHT: VaultPalette = {
  background: '#F4F6FA',
  backgroundDeep: '#EDF1F7',
  surface: '#FFFFFF',
  surfaceHigh: '#FFFFFF',
  border: 'rgba(15,23,42,0.08)',
  text: '#0F172A',
  textSecondary: '#64748B',
  accent: '#16A34A',
  accentBright: '#22C55E',
  accentWash: 'rgba(34,197,94,0.12)',
  chip: 'rgba(15,23,42,0.06)',
  glow: 'rgba(34,197,94,0.07)',
  isDark: false,
};

/**
 * Icon tile tints — every icon carries its own hue, the way the reference
 * design does: green for the code, violet for the fingerprint, blue for the
 * timer, amber for the lock.
 */
export const VAULT_TONES = {
  green: { color: '#4ADE80', wash: 'rgba(34,197,94,0.14)' },
  violet: { color: '#C4B5FD', wash: 'rgba(139,92,246,0.18)' },
  blue: { color: '#93C5FD', wash: 'rgba(59,130,246,0.18)' },
  amber: { color: '#FCD34D', wash: 'rgba(245,158,11,0.18)' },
  slate: { color: '#CBD5E1', wash: 'rgba(148,163,184,0.18)' },
} as const;

export type VaultTone = keyof typeof VAULT_TONES;

/**
 * The screen accents. Every vault screen picks one: the home and the
 * settings are emerald, the gallery is violet, the files are blue.
 */
export const VAULT_ACCENTS = {
  emerald: {
    base: '#22C55E',
    bright: '#4ADE80',
    wash: 'rgba(34,197,94,0.14)',
    gradient: ['#34D399', '#10B981'],
  },
  violet: {
    base: '#8B5CF6',
    bright: '#A78BFA',
    wash: 'rgba(139,92,246,0.18)',
    gradient: ['#8B5CF6', '#6D28D9'],
  },
  blue: {
    base: '#3B82F6',
    bright: '#60A5FA',
    wash: 'rgba(59,130,246,0.18)',
    gradient: ['#3B82F6', '#6366F1'],
  },
} as const;

export type VaultAccent = keyof typeof VAULT_ACCENTS;

/** The four category tiles: one gradient and one watermark each. */
export const VAULT_CATEGORIES = {
  photo: {
    gradient: ['#6D28D9', '#A855F7'],
    icon: 'image',
    watermark: 'image',
  },
  video: {
    gradient: ['#1D4ED8', '#3B82F6'],
    icon: 'videocam',
    watermark: 'play',
  },
  document: {
    gradient: ['#047857', '#10B981'],
    icon: 'document-text',
    watermark: 'document-text',
  },
  audio: {
    gradient: ['#BE185D', '#EC4899'],
    icon: 'musical-notes',
    watermark: 'musical-notes',
  },
} as const;
