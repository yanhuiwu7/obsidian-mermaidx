/**
 * Unified Theme System for MermaidX
 *
 * Supports swimlane, architecture, and knowledge graph diagrams.
 * Each theme is a set of color tokens consumed by all three renderers.
 *
 * Usage:
 *   import { getTheme, THEME_NAMES, type DiagramTheme } from './themes';
 *   const theme = getTheme('ocean');
 */

// ─── Theme name constants ───────────────────────────────────────────────────

export const THEME_NAMES = [
  'default', 'warm', 'dark',
  'ocean', 'forest', 'blueprint', 'ink',
] as const;
export type ThemeName = (typeof THEME_NAMES)[number];

// ─── Color token interfaces ────────────────────────────────────────────────

/** Swimlane diagram color tokens */
export interface SwimlaneTokens {
  /** Full background fill */
  background: string;
  /** Lane header band fill */
  laneHeaderBg: string;
  /** Lane header text color */
  laneHeaderText: string;
  /** Vertical lane divider + header bottom line stroke */
  laneDivider: string;
  /** Outer border stroke */
  outerBorder: string;

  /** Regular node (rect, round, diamond, ellipse) fill */
  nodeFill: string;
  /** Regular node border stroke */
  nodeBorder: string;
  /** Regular node label text */
  nodeText: string;

  /** Two-line node: top half fill */
  twoLineTopFill: string;
  /** Two-line node: bottom half fill */
  twoLineBotFill: string;
  /** Two-line node: label text (top) */
  twoLineTopText: string;
  /** Two-line node: operator text (bottom) */
  twoLineBotText: string;

  /** Start node circle fill */
  startFill: string;
  /** Start node circle border */
  startBorder: string;
  /** End node circle fill */
  endFill: string;
  /** End node circle border */
  endBorder: string;

  /** Link path stroke */
  linkColor: string;
  /** Link arrow fill (solid) */
  arrowColor: string;
  /** Link arrow fill (dashed) */
  arrowColorDashed: string;
  /** Link label text */
  linkLabelColor: string;
  /** Link label background fill */
  linkLabelBg: string;
}

/** Architecture diagram color tokens */
export interface ArchTokens {
  /** Background behind all layers */
  background: string;
  /** Layer container border */
  layerBorder: string;
  /** Layer title color */
  layerTitleColor: string;
  /** Group container background */
  groupBg: string;
  /** Link / arrow color */
  linkColor: string;
  /** Link label background */
  linkLabelBg: string;

  /** Per-type node colors (background, border, text) */
  nodeType: {
    user:     { fill: string; border: string; text: string };
    service:  { fill: string; border: string; text: string };
    infra:    { fill: string; border: string; text: string };
    external: { fill: string; border: string; text: string };
    monitor:  { fill: string; border: string; text: string };
    node:     { fill: string; border: string; text: string };
  };
}

/** Knowledge graph color tokens */
export interface KgTokens {
  /** Canvas background */
  background: string;
  /** Default fallback node color (when no @style) */
  fallbackNodeColor: string;
  /** Default link color (when no @style) */
  linkColor: string;
  /** Link label background fill */
  linkLabelBg: string;
  /** Link label border */
  linkLabelBorder: string;
  /** Arrow marker fill */
  arrowColor: string;
  /** Highlighted arrow marker fill */
  arrowHighlightColor: string;
  /** Loop (self-referencing) link color */
  loopColor: string;
  /** Dimmed loop link color (hover state) */
  loopDimColor: string;
  /** Dimmed link color (hover state) */
  linkDimColor: string;
  /** Node text fill */
  nodeTextFill: string;
}

/** Complete diagram theme */
export interface DiagramTheme {
  name: ThemeName;
  /** Display label shown in toolbar dropdown */
  label: string;
  swimlane: SwimlaneTokens;
  arch: ArchTokens;
  kg: KgTokens;
}

// ─── Theme definitions ─────────────────────────────────────────────────────

const themes: Record<ThemeName, DiagramTheme> = {
  // ── Default (current style, unchanged) ──────────────────────────────────
  default: {
    name: 'default',
    label: '⬜ Default',
    swimlane: {
      background:      '#fafafa',
      laneHeaderBg:    '#f0f0f0',
      laneHeaderText:  '#333',
      laneDivider:     '#ddd',
      outerBorder:     '#ccc',
      nodeFill:        '#fff',
      nodeBorder:      '#e0e0e0',
      nodeText:        '#333',
      twoLineTopFill:  '#ffffff',
      twoLineBotFill:  '#f1f5f9',
      twoLineTopText:  '#334155',
      twoLineBotText:  '#64748b',
      startFill:       '#f0fdf4',
      startBorder:     '#22c55e',
      endFill:         '#fef2f2',
      endBorder:       '#ef4444',
      linkColor:       '#64748b',
      arrowColor:      '#64748b',
      arrowColorDashed:'#94a3b8',
      linkLabelColor:  '#64748b',
      linkLabelBg:     '#fafafa',
    },
    arch: {
      background:       '#ffffff',
      layerBorder:      '#e0e0e0',
      layerTitleColor:  '#333',
      groupBg:          '#fafafa',
      linkColor:        '#94a3b8',
      linkLabelBg:      '#f5f5f5',
      nodeType: {
        user:     { fill: '#e0f7fa', border: '#4dd0e1', text: '#006064' },
        service:  { fill: '#c8e6c9', border: '#81c784', text: '#1b5e20' },
        infra:    { fill: '#ffe0b2', border: '#ffb74d', text: '#e65100' },
        external: { fill: '#bbdefb', border: '#64b5f6', text: '#0d47a1' },
        monitor:  { fill: '#f5f5f5', border: '#9e9e9e', text: '#616161' },
        node:     { fill: '#f5f5f5', border: '#bdbdbd', text: '#424242' },
      },
    },
    kg: {
      background:           '#ffffff',
      fallbackNodeColor:    '#64748b',
      linkColor:            '#cbd5e1',
      linkLabelBg:          'rgba(245,247,250,0.92)',
      linkLabelBorder:      '#e2e8f0',
      arrowColor:           '#94a3b8',
      arrowHighlightColor:  '#a5b4fc',
      loopColor:            '#8b5cf6',
      loopDimColor:         '#7c3aed',
      linkDimColor:         '#cbd5e1',
      nodeTextFill:         '#ffffff',
    },
  },

  // ── Warm (cozy, beige/orange tones) ────────────────────────────────────
  warm: {
    name: 'warm',
    label: '🌤️ Warm',
    swimlane: {
      background:      '#fdf8f3',
      laneHeaderBg:    '#f5ebe0',
      laneHeaderText:  '#5c3d2e',
      laneDivider:     '#e0d2c5',
      outerBorder:     '#c9b8a8',
      nodeFill:        '#fffdfb',
      nodeBorder:      '#e8d5c4',
      nodeText:        '#5c3d2e',
      twoLineTopFill:  '#fffdfb',
      twoLineBotFill:  '#fef3e7',
      twoLineTopText:  '#5c3d2e',
      twoLineBotText:  '#8b7355',
      startFill:       '#fef3c7',
      startBorder:     '#f59e0b',
      endFill:         '#fee2e2',
      endBorder:       '#ef4444',
      linkColor:       '#8b7355',
      arrowColor:      '#8b7355',
      arrowColorDashed:'#b8a48e',
      linkLabelColor:  '#8b7355',
      linkLabelBg:     '#fdf8f3',
    },
    arch: {
      background:       '#fdf8f3',
      layerBorder:      '#e8d5c4',
      layerTitleColor:  '#5c3d2e',
      groupBg:          '#fef3e7',
      linkColor:        '#b8a48e',
      linkLabelBg:      '#f5ebe0',
      nodeType: {
        user:     { fill: '#fef3c7', border: '#fbbf24', text: '#78350f' },
        service:  { fill: '#fde68a', border: '#f59e0b', text: '#78350f' },
        infra:    { fill: '#fed7aa', border: '#fb923c', text: '#7c2d12' },
        external: { fill: '#fecaca', border: '#f87171', text: '#7f1d1d' },
        monitor:  { fill: '#f5ebe0', border: '#d4c5b2', text: '#78716c' },
        node:     { fill: '#f5ebe0', border: '#d4c5b2', text: '#78716c' },
      },
    },
    kg: {
      background:           '#fdf8f3',
      fallbackNodeColor:    '#d97706',
      linkColor:            '#d4c5b2',
      linkLabelBg:          'rgba(245,235,224,0.92)',
      linkLabelBorder:      '#e8d5c4',
      arrowColor:           '#b8a48e',
      arrowHighlightColor:  '#f59e0b',
      loopColor:            '#ea580c',
      loopDimColor:         '#c2410c',
      linkDimColor:         '#e8d5c4',
      nodeTextFill:         '#ffffff',
    },
  },

  // ── Dark (dark mode, Catppuccin Mocha) ──────────────────────────────────
  dark: {
    name: 'dark',
    label: '🌙 Dark',
    swimlane: {
      background:      '#1e1e2e',
      laneHeaderBg:    '#181825',
      laneHeaderText:  '#cdd6f4',
      laneDivider:     '#313244',
      outerBorder:     '#45475a',
      nodeFill:        '#1e1e2e',
      nodeBorder:      '#45475a',
      nodeText:        '#cdd6f4',
      twoLineTopFill:  '#1e1e2e',
      twoLineBotFill:  '#181825',
      twoLineTopText:  '#cdd6f4',
      twoLineBotText:  '#a6adc8',
      startFill:       '#1e3a2e',
      startBorder:     '#a6e3a1',
      endFill:         '#3a1e1e',
      endBorder:       '#f38ba8',
      linkColor:       '#a6adc8',
      arrowColor:      '#a6adc8',
      arrowColorDashed:'#6c7086',
      linkLabelColor:  '#a6adc8',
      linkLabelBg:     '#1e1e2e',
    },
    arch: {
      background:       '#1e1e2e',
      layerBorder:      '#45475a',
      layerTitleColor:  '#cdd6f4',
      groupBg:          '#181825',
      linkColor:        '#6c7086',
      linkLabelBg:      '#181825',
      nodeType: {
        user:     { fill: '#1e2d3d', border: '#89b4fa', text: '#b4befe' },
        service:  { fill: '#1e332e', border: '#a6e3a1', text: '#a6e3a1' },
        infra:    { fill: '#332e1e', border: '#f9e2af', text: '#f9e2af' },
        external: { fill: '#2d1e33', border: '#cba6f7', text: '#cba6f7' },
        monitor:  { fill: '#1e1e2e', border: '#585b70', text: '#a6adc8' },
        node:     { fill: '#1e1e2e', border: '#585b70', text: '#a6adc8' },
      },
    },
    kg: {
      background:           '#1e1e2e',
      fallbackNodeColor:    '#89b4fa',
      linkColor:            '#585b70',
      linkLabelBg:          'rgba(30,30,46,0.92)',
      linkLabelBorder:      '#45475a',
      arrowColor:           '#6c7086',
      arrowHighlightColor:  '#89b4fa',
      loopColor:            '#cba6f7',
      loopDimColor:         '#a6adc8',
      linkDimColor:         '#313244',
      nodeTextFill:         '#cdd6f4',
    },
  },

  // ── Ocean (deep blue & teal tones) ──────────────────────────────────────
  ocean: {
    name: 'ocean',
    label: '🌊 Ocean',
    swimlane: {
      background:      '#f0f7ff',
      laneHeaderBg:    '#daeaf7',
      laneHeaderText:  '#0c3547',
      laneDivider:     '#b8d4e8',
      outerBorder:     '#7fb3d3',
      nodeFill:        '#ffffff',
      nodeBorder:      '#b8d4e8',
      nodeText:        '#0c3547',
      twoLineTopFill:  '#ffffff',
      twoLineBotFill:  '#e8f4fd',
      twoLineTopText:  '#0c3547',
      twoLineBotText:  '#2d6a82',
      startFill:       '#d0f0f6',
      startBorder:     '#0097a7',
      endFill:         '#ffe0d0',
      endBorder:       '#e65100',
      linkColor:       '#2d6a82',
      arrowColor:      '#2d6a82',
      arrowColorDashed:'#7fb3d3',
      linkLabelColor:  '#2d6a82',
      linkLabelBg:     '#e8f4fd',
    },
    arch: {
      background:       '#f0f7ff',
      layerBorder:      '#b8d4e8',
      layerTitleColor:  '#0c3547',
      groupBg:          '#e8f4fd',
      linkColor:        '#7fb3d3',
      linkLabelBg:      '#daeaf7',
      nodeType: {
        user:     { fill: '#d0f0f6', border: '#0097a7', text: '#004d55' },
        service:  { fill: '#b3e5fc', border: '#039be5', text: '#01579b' },
        infra:    { fill: '#b2dfdb', border: '#26a69a', text: '#004d40' },
        external: { fill: '#e0f2f1', border: '#80cbc4', text: '#00695c' },
        monitor:  { fill: '#e8f4fd', border: '#7fb3d3', text: '#2d6a82' },
        node:     { fill: '#e8f4fd', border: '#7fb3d3', text: '#2d6a82' },
      },
    },
    kg: {
      background:           '#f0f7ff',
      fallbackNodeColor:    '#0097a7',
      linkColor:            '#b8d4e8',
      linkLabelBg:          'rgba(218,234,247,0.92)',
      linkLabelBorder:      '#b8d4e8',
      arrowColor:           '#7fb3d3',
      arrowHighlightColor:  '#0097a7',
      loopColor:            '#0097a7',
      loopDimColor:         '#00838f',
      linkDimColor:         '#daeaf7',
      nodeTextFill:         '#ffffff',
    },
  },

  // ── Forest (green & earth tones) ────────────────────────────────────────
  forest: {
    name: 'forest',
    label: '🌲 Forest',
    swimlane: {
      background:      '#f2f8f0',
      laneHeaderBg:    '#dce9d6',
      laneHeaderText:  '#1b3a13',
      laneDivider:     '#b8ccb2',
      outerBorder:     '#8aaa7e',
      nodeFill:        '#ffffff',
      nodeBorder:      '#b8ccb2',
      nodeText:        '#1b3a13',
      twoLineTopFill:  '#ffffff',
      twoLineBotFill:  '#e6f2e3',
      twoLineTopText:  '#1b3a13',
      twoLineBotText:  '#3d6b32',
      startFill:       '#d5ecd0',
      startBorder:     '#43a047',
      endFill:         '#fde8e8',
      endBorder:       '#c62828',
      linkColor:       '#3d6b32',
      arrowColor:      '#3d6b32',
      arrowColorDashed:'#8aaa7e',
      linkLabelColor:  '#3d6b32',
      linkLabelBg:     '#e6f2e3',
    },
    arch: {
      background:       '#f2f8f0',
      layerBorder:      '#b8ccb2',
      layerTitleColor:  '#1b3a13',
      groupBg:          '#e6f2e3',
      linkColor:        '#8aaa7e',
      linkLabelBg:      '#dce9d6',
      nodeType: {
        user:     { fill: '#c8e6c9', border: '#4caf50', text: '#1b5e20' },
        service:  { fill: '#a5d6a7', border: '#66bb6a', text: '#2e7d32' },
        infra:    { fill: '#dcedc8', border: '#9ccc65', text: '#558b2f' },
        external: { fill: '#e6d5c0', border: '#a1887f', text: '#4e342e' },
        monitor:  { fill: '#e6f2e3', border: '#8aaa7e', text: '#3d6b32' },
        node:     { fill: '#e6f2e3', border: '#8aaa7e', text: '#3d6b32' },
      },
    },
    kg: {
      background:           '#f2f8f0',
      fallbackNodeColor:    '#43a047',
      linkColor:            '#b8ccb2',
      linkLabelBg:          'rgba(220,233,214,0.92)',
      linkLabelBorder:      '#b8ccb2',
      arrowColor:           '#8aaa7e',
      arrowHighlightColor:  '#43a047',
      loopColor:            '#2e7d32',
      loopDimColor:         '#1b5e20',
      linkDimColor:         '#dce9d6',
      nodeTextFill:         '#ffffff',
    },
  },

  // ── Blueprint (engineering blueprint style) ─────────────────────────────
  blueprint: {
    name: 'blueprint',
    label: '📐 Blueprint',
    swimlane: {
      background:      '#0a1929',
      laneHeaderBg:    '#0d2137',
      laneHeaderText:  '#80cbc4',
      laneDivider:     '#1a3a5c',
      outerBorder:     '#2a5080',
      nodeFill:        '#0d2137',
      nodeBorder:      '#2a5080',
      nodeText:        '#b0d4f1',
      twoLineTopFill:  '#0d2137',
      twoLineBotFill:  '#0a1929',
      twoLineTopText:  '#b0d4f1',
      twoLineBotText:  '#6090b0',
      startFill:       '#0a2a3a',
      startBorder:     '#4dd0e1',
      endFill:         '#2a1a1a',
      endBorder:       '#ef5350',
      linkColor:       '#4dd0e1',
      arrowColor:      '#4dd0e1',
      arrowColorDashed:'#2a5080',
      linkLabelColor:  '#80cbc4',
      linkLabelBg:     '#0a1929',
    },
    arch: {
      background:       '#0a1929',
      layerBorder:      '#2a5080',
      layerTitleColor:  '#80cbc4',
      groupBg:          '#0d2137',
      linkColor:        '#4dd0e1',
      linkLabelBg:      '#0a1929',
      nodeType: {
        user:     { fill: 'rgba(77,208,225,0.1)', border: '#4dd0e1', text: '#b2ebf2' },
        service:  { fill: 'rgba(129,199,132,0.1)', border: '#81c784', text: '#c8e6c9' },
        infra:    { fill: 'rgba(255,183,77,0.1)',  border: '#ffb74d', text: '#ffe0b2' },
        external: { fill: 'rgba(100,181,246,0.1)', border: '#64b5f6', text: '#bbdefb' },
        monitor:  { fill: 'rgba(144,164,174,0.08)', border: '#90a4ae', text: '#b0bec5' },
        node:     { fill: 'rgba(144,164,174,0.08)', border: '#2a5080', text: '#90a4ae' },
      },
    },
    kg: {
      background:           '#0a1929',
      fallbackNodeColor:    '#4dd0e1',
      linkColor:            '#1a3a5c',
      linkLabelBg:          'rgba(10,25,41,0.92)',
      linkLabelBorder:      '#2a5080',
      arrowColor:           '#4dd0e1',
      arrowHighlightColor:  '#80cbc4',
      loopColor:            '#4dd0e1',
      loopDimColor:         '#0097a7',
      linkDimColor:         '#0d2137',
      nodeTextFill:         '#b0d4f1',
    },
  },

  // ── Ink / Chinese ink painting (black-white-red seal) ────────────────────
  ink: {
    name: 'ink',
    label: '🖌️ Ink',
    swimlane: {
      background:      '#faf8f5',
      laneHeaderBg:    '#f0ebe5',
      laneHeaderText:  '#1a1a1a',
      laneDivider:     '#d0c8c0',
      outerBorder:     '#3a3a3a',
      nodeFill:        '#ffffff',
      nodeBorder:      '#3a3a3a',
      nodeText:        '#1a1a1a',
      twoLineTopFill:  '#ffffff',
      twoLineBotFill:  '#f5f0eb',
      twoLineTopText:  '#1a1a1a',
      twoLineBotText:  '#666666',
      startFill:       '#f5f0eb',
      startBorder:     '#1a1a1a',
      endFill:         '#fde8e8',
      endBorder:       '#cc2200',
      linkColor:       '#555555',
      arrowColor:      '#555555',
      arrowColorDashed:'#aaaaaa',
      linkLabelColor:  '#333333',
      linkLabelBg:     '#faf8f5',
    },
    arch: {
      background:       '#faf8f5',
      layerBorder:      '#3a3a3a',
      layerTitleColor:  '#1a1a1a',
      groupBg:          '#f5f0eb',
      linkColor:        '#555555',
      linkLabelBg:      '#f5f0eb',
      nodeType: {
        user:     { fill: '#ffffff', border: '#1a1a1a', text: '#1a1a1a' },
        service:  { fill: '#f5f5f0', border: '#555555', text: '#1a1a1a' },
        infra:    { fill: '#eeeeea', border: '#888888', text: '#333333' },
        external: { fill: '#fde8e8', border: '#cc2200', text: '#991100' },
        monitor:  { fill: '#f5f0eb', border: '#aaaaaa', text: '#555555' },
        node:     { fill: '#faf8f5', border: '#3a3a3a', text: '#1a1a1a' },
      },
    },
    kg: {
      background:           '#faf8f5',
      fallbackNodeColor:    '#333333',
      linkColor:            '#d0c8c0',
      linkLabelBg:          'rgba(250,248,245,0.92)',
      linkLabelBorder:      '#d0c8c0',
      arrowColor:           '#555555',
      arrowHighlightColor:  '#cc2200',
      loopColor:            '#cc2200',
      loopDimColor:         '#991100',
      linkDimColor:         '#f0ebe5',
      nodeTextFill:         '#ffffff',
    },
  },

};

// ─── Public API ────────────────────────────────────────────────────────────

/** Get a theme by name, falls back to 'default' */
export function getTheme(name?: string | null): DiagramTheme {
  const key = (name && themes[name as ThemeName]) ? name as ThemeName : 'default';
  return themes[key];
}

/** Get all available theme names */
export function getAvailableThemes(): ThemeName[] {
  return [...THEME_NAMES];
}

/** Get theme display label */
export function getThemeLabel(name: ThemeName | string): string {
  const theme = themes[name as ThemeName];
  return theme?.label ?? 'Default';
}
