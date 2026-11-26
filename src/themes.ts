export type ThemeId =
  | 'obsidian-aurora'
  | 'noir-velvet'
  | 'atelier-ivory'
  | 'arctic-frost'
  | 'midnight-botanical';

export interface ThemeDef {
  id: ThemeId;
  name: string;
  subtitle: string;
  isLight: boolean;
  swatch: [string, string, string];
}

export const THEMES: ThemeDef[] = [
  {
    id: 'obsidian-aurora',
    name: 'Obsidian Aurora',
    subtitle: 'Canlı zümrüt & kobalt mesh',
    isLight: false,
    swatch: ['#090A0C', '#10B981', '#3B82F6'],
  },
  {
    id: 'noir-velvet',
    name: 'Noir Velvet',
    subtitle: 'Bordo-mürdüm & bakır şampanya',
    isLight: false,
    swatch: ['#120A10', '#E11D48', '#F59E0B'],
  },
  {
    id: 'atelier-ivory',
    name: 'Atelier Ivory',
    subtitle: 'Sıcak fildişi editoryal dergi',
    isLight: true,
    swatch: ['#F5F1E8', '#141311', '#059669'],
  },
  {
    id: 'arctic-frost',
    name: 'Arctic Frost',
    subtitle: 'visionOS gece buzlu cam',
    isLight: false,
    swatch: ['#070D16', '#38BDF8', '#A5F3FC'],
  },
  {
    id: 'midnight-botanical',
    name: 'Midnight Botanical',
    subtitle: 'Orman yeşili & sıcak kehribar',
    isLight: false,
    swatch: ['#08100D', '#34D399', '#D97706'],
  },
];

export function applyThemeToDom(themeId: string) {
  const valid = THEMES.some((t) => t.id === themeId) ? themeId : 'obsidian-aurora';
  document.documentElement.setAttribute('data-theme', valid);
}
