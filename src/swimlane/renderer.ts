/**
 * Swimlane Diagram Renderer - D3.js Based
 * Row-based layout: no group/stage concept.
 * Each lane contains explicit rows; nodes in a row are placed side-by-side.
 */

import { getTheme, getAvailableThemes, getThemeLabel, type DiagramTheme } from '../common/themes';

import type {
  SwimlaneDiagram,
  SwimlaneRow,
  SwimlaneNode,
} from './types';

// ─── D3 type shims (same pattern as knowledge module) ───────────────────────

interface D3Selection {
  select: (selector: string) => D3Selection;
  selectAll: (selector: string) => D3Selection;
  append: (tag: string) => D3Selection;
  attr: (name: string, value?: unknown) => D3Selection;
  style: (name: string, value?: unknown) => D3Selection;
  classed: (cls: string, val?: boolean) => D3Selection;
  text: (t: string | ((d: unknown) => string)) => D3Selection;
  html: (t: string | ((d: unknown) => string)) => D3Selection;
  remove: () => void;
  each: (fn: (d: unknown, i: number, nodes: Element[]) => void) => D3Selection;
  data: <T>(data: T[]) => D3Selection;
  enter: () => D3Selection;
  exit: () => D3Selection;
  transition: () => D3Selection;
  duration: (ms: number) => D3Selection;
  call: (fn: unknown, ...args: unknown[]) => D3Selection;
  node: () => Element | null;
  insert: (tag: string, before: string) => D3Selection;
}

interface D3DragEvent {
  dx: number;
  dy: number;
  x: number;
  y: number;
  sourceEvent: MouseEvent;
  subject: unknown;
}

interface D3DragBehavior {
  on: (event: string, handler: (event: D3DragEvent, d: unknown) => void) => D3DragBehavior;
}

interface D3Instance {
  select: (el: Element | string) => D3Selection;
  selectAll: (selector: string) => D3Selection;
  drag: () => D3DragBehavior;
  zoom: () => unknown;
  zoomIdentity: { translate: (x: number, y: number) => unknown; scale: (s: number) => unknown };
  easeCubicOut: unknown;
}

// ─── Layout constants ────────────────────────────────────────────────────────

const LANE_HEADER_HEIGHT = 40;   // Top row: lane labels
const NODE_WIDTH        = 120;
const NODE_HEIGHT       = 48;
const CIRCLE_NODE_SIZE  = 40;
const NODE_GAP_X        = 16;   // Horizontal gap between nodes in same row (minimum, used when space is tight)
const ROW_GAP_Y         = 80;   // Vertical gap between rows in same lane
const LANE_PADDING_X    = 40;   // Preferred left/right padding inside lane
const LANE_PADDING_X_MIN = 20;  // Minimum left/right padding inside lane
const LANE_PADDING_TOP  = 20;   // Top padding inside lane (below header)
const LANE_PADDING_BOT  = 20;   // Bottom padding inside lane
const MIN_LANE_HEIGHT   = 80;   // Minimum total content height (excl. header)

// ─── D3 loader ───────────────────────────────────────────────────────────────

let d3LoadPromise: Promise<D3Instance | null> | null = null;

function ensureD3(): Promise<D3Instance | null> {
  const win = window as unknown as Record<string, unknown>;
  if (win['d3']) return Promise.resolve(win['d3'] as D3Instance);
  if (d3LoadPromise) return d3LoadPromise;

  d3LoadPromise = new Promise(resolve => {
    const script = document.createElement('script');
    script.src = 'https://d3js.org/d3.v7.min.js';
    script.onload = () => {
      d3LoadPromise = null;
      const d3 = (window as unknown as Record<string, unknown>)['d3'] as D3Instance;
      resolve(d3 ?? null);
    };
    script.onerror = err => {
      d3LoadPromise = null;
      console.error('[MermaidX Swimlane] Failed to load D3.js:', err);
      resolve(null);
    };
    document.head.appendChild(script);
  });

  return d3LoadPromise;
}

// ─── Layout types ─────────────────────────────────────────────────────────────

interface NodeLayout {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface LayoutData {
  totalWidth: number;
  totalHeight: number;
  /** Width of each lane (all lanes share the same width) */
  laneWidth: number;
  /** X position (left edge) of each lane, indexed by lane index */
  laneX: number[];
  /** Computed height of each lane content area (excluding header) */
  laneContentHeight: number[];
  nodeLayouts: Map<string, NodeLayout>;
}

// ─── SwimlaneRenderer ────────────────────────────────────────────────────────

export class SwimlaneRenderer {
  private container: HTMLElement;
  private diagram: SwimlaneDiagram;
  private d3: D3Instance | null = null;
  private svg: D3Selection | null = null;
  private nodePositions: Map<string, { x: number; y: number; pinned: boolean }> = new Map();
  private layout: LayoutData = {
    totalWidth: 0,
    totalHeight: 0,
    laneWidth: 0,
    laneX: [],
    laneContentHeight: [],
    nodeLayouts: new Map(),
  };
  private saveTimeout: ReturnType<typeof setTimeout> | null = null;
  private theme: DiagramTheme;
  private onThemeChange?: (themeName: string) => void;

  // Callbacks
  private onPositionSave?: (positions: Record<string, { x: number; y: number; pinned: boolean }>) => void;
  private onPositionLoad?: () => Record<string, { x: number; y: number; pinned: boolean }> | undefined;
  private onPositionClear?: () => void;

  constructor(
    container: HTMLElement,
    diagram: SwimlaneDiagram,
    themeName?: string | null,
    onThemeChange?: (themeName: string) => void
  ) {
    this.container = container;
    this.diagram = diagram;
    this.theme = getTheme(themeName);
    this.onThemeChange = onThemeChange;
  }

  public setPositionCallbacks(
    onSave: (positions: Record<string, { x: number; y: number; pinned: boolean }>) => void,
    onLoad: () => Record<string, { x: number; y: number; pinned: boolean }> | undefined,
    onClear: () => void
  ): void {
    this.onPositionSave = onSave;
    this.onPositionLoad = onLoad;
    this.onPositionClear = onClear;
  }

  public loadPositions(positions: Record<string, { x: number; y: number; pinned: boolean }>): void {
    this.nodePositions = new Map(Object.entries(positions));
  }

  public getPositions(): Record<string, { x: number; y: number; pinned: boolean }> {
    const result: Record<string, { x: number; y: number; pinned: boolean }> = {};
    this.nodePositions.forEach((pos, id) => { result[id] = pos; });
    return result;
  }

  public setTheme(themeName: string): void {
    this.theme = getTheme(themeName);
    void this.render();
  }

  // ── Public: render ──────────────────────────────────────────────────────────

  public async render(): Promise<void> {
    this.container.empty();
    this.nodePositions.clear();

    this.d3 = await ensureD3();
    if (!this.d3) {
      const errorDiv = document.createElement('div');
      errorDiv.className = 'swimlane-error';
      errorDiv.textContent = 'Failed to load diagram library';
      this.container.appendChild(errorDiv);
      return;
    }

    // Restore saved positions
    if (this.onPositionLoad) {
      const saved = this.onPositionLoad();
      if (saved) this.nodePositions = new Map(Object.entries(saved));
    }

    // Wrapper
    const wrapper = document.createElement('div');
    wrapper.className = 'swimlane-wrap';

    // Header bar (title + reset button)
    const header = this.createHeader();
    wrapper.appendChild(header);

    // SVG host
    const svgContainer = document.createElement('div');
    svgContainer.className = 'swimlane-svg-container';
    wrapper.appendChild(svgContainer);

    this.container.appendChild(wrapper);

    // Layout
    const containerWidth = svgContainer.clientWidth || 800;
    this.calculateLayout(containerWidth);

    // Create SVG
    this.svg = this.d3.select(svgContainer)
      .append('svg')
      .attr('class', 'swimlane-svg')
      .attr('width', this.layout.totalWidth)
      .attr('height', this.layout.totalHeight)
      .attr('xmlns', 'http://www.w3.org/2000/svg');

    // Inject keyframes inside SVG so the dashed-flow animation works
    // even when the external styles.css is not loaded (e.g. standalone HTML).
    this.svg.append('defs').append('style').text(`
      @keyframes swimlane-dash-flow {
        from { stroke-dashoffset: 9; }
        to   { stroke-dashoffset: 0; }
      }
      .swimlane-link-dashed {
        stroke-dasharray: 6 3;
        stroke-dashoffset: 0;
        animation: swimlane-dash-flow 0.6s linear infinite;
      }
    `);

    // Render layers
    this.renderBackground();
    this.renderLaneHeaders();
    this.renderNodes();
    this.renderLinks();
    this.attachDragBehavior();
  }

  // ── Header ──────────────────────────────────────────────────────────────────

  private createHeader(): HTMLElement {
    const header = document.createElement('div');
    header.className = 'swimlane-header';

    const title = document.createElement('span');
    title.className = 'swimlane-title';
    title.textContent = this.diagram.title || '';
    header.appendChild(title);

    // Spacer to push controls to the right
    const spacer = document.createElement('span');
    spacer.setCssProps({ flex: '1' });
    header.appendChild(spacer);

    // Theme selector
    const themeSelect = document.createElement('select');
    themeSelect.className = 'swimlane-theme-select';
    for (const name of getAvailableThemes()) {
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = getThemeLabel(name);
      if (name === this.theme.name) opt.selected = true;
      themeSelect.appendChild(opt);
    }
    themeSelect.addEventListener('change', () => {
      const newTheme = themeSelect.value;
      this.setTheme(newTheme);
      this.onThemeChange?.(newTheme);
    });
    header.appendChild(themeSelect);

    const resetBtn = document.createElement('button');
    resetBtn.className = 'swimlane-btn';
    resetBtn.textContent = 'Reset';
    resetBtn.addEventListener('click', () => this.resetPositions());
    header.appendChild(resetBtn);

    return header;
  }

  private resetPositions(): void {
    this.onPositionClear?.();
    this.nodePositions.clear();

    this.layout.nodeLayouts.forEach((pos, nodeId) => {
      this.svg?.select(`[data-node-id="${nodeId}"]`)
        .attr('transform', `translate(${pos.x}, ${pos.y})`);
    });

    this.updateAllLinks();
  }

  // ── Layout calculation ───────────────────────────────────────────────────────

  /**
   * Calculate full layout.
   *
   * Lane content height = sum of row heights + gaps + top/bottom padding.
   * Row height = max node height in that row.
   * All lanes share the same content height (= max across all lanes) so grid lines are aligned.
   */
  private calculateLayout(containerWidth: number): void {
    const numLanes = this.diagram.lanes.length;
    if (numLanes === 0) {
      this.layout.totalWidth = containerWidth;
      this.layout.totalHeight = LANE_HEADER_HEIGHT;
      return;
    }

    const laneWidth = containerWidth / numLanes;
    this.layout.laneWidth = laneWidth;

    // For each lane, compute the required content height based on its rows
    const perLaneHeight: number[] = this.diagram.lanes.map(lane => {
      const rows = this.diagram.rows.filter(r => r.laneId === lane.id);
      if (rows.length === 0) return MIN_LANE_HEIGHT;

      let h = LANE_PADDING_TOP;
      rows.forEach((row, idx) => {
        const rowHeight = this.getRowHeight(row);
        h += rowHeight;
        if (idx < rows.length - 1) h += ROW_GAP_Y;
      });
      h += LANE_PADDING_BOT;
      return Math.max(h, MIN_LANE_HEIGHT);
    });

    // All lanes share the tallest height so dividers align
    const maxContentHeight = Math.max(...perLaneHeight);

    // Compute laneX for each lane
    this.layout.laneX = this.diagram.lanes.map((_, i) => i * laneWidth);
    this.layout.laneContentHeight = this.diagram.lanes.map(() => maxContentHeight);

    this.layout.totalWidth = containerWidth;
    this.layout.totalHeight = LANE_HEADER_HEIGHT + maxContentHeight;

    // Compute node positions
    this.layout.nodeLayouts.clear();
    for (const node of this.diagram.nodes) {
      const pos = this.computeNodeLayout(node);
      this.layout.nodeLayouts.set(node.id, pos);
    }
  }

  /** Height of a row = max node height among all nodes in it */
  private getRowHeight(row: SwimlaneRow): number {
    let h = NODE_HEIGHT;
    for (const nid of row.nodeIds) {
      const node = this.diagram.nodes.find(n => n.id === nid);
      const isCircle = node && (node.isStartNode || node.isEndNode || node.shape === 'circle');
      if (isCircle) {
        h = Math.max(h, CIRCLE_NODE_SIZE);
      } else if (node && node.operator) {
        // Two-line node: same height as regular nodes
        h = Math.max(h, NODE_HEIGHT);
      }
    }
    return h;
  }

  /** Total width of all nodes in a row including gaps */
  private getRowWidth(row: SwimlaneRow): number {
    let w = 0;
    row.nodeIds.forEach((nid, i) => {
      const node = this.diagram.nodes.find(n => n.id === nid);
      if (!node) return;
      
      // Determine width: phantom uses phantomStyle, others use shape
      let isCircle = false;
      if (node.shape === 'phantom' && node.phantomStyle === 'circle') {
        isCircle = true;
      } else if (node.shape !== 'phantom') {
        isCircle = node.isStartNode || node.isEndNode || node.shape === 'circle';
      }
      
      const nw = isCircle ? CIRCLE_NODE_SIZE : NODE_WIDTH;
      w += nw;
      if (i < row.nodeIds.length - 1) w += NODE_GAP_X;
    });
    return w;
  }

  private computeNodeLayout(node: SwimlaneNode): NodeLayout {
    const laneIndex = this.diagram.lanes.findIndex(l => l.id === node.laneId);
    const laneX = this.layout.laneX[laneIndex] ?? 0;
    const laneWidth = this.layout.laneWidth;

    const row = this.diagram.rows.find(r => r.id === node.rowId);
    if (!row) return { x: laneX, y: LANE_HEADER_HEIGHT, width: NODE_WIDTH, height: NODE_HEIGHT };

    // Y: accumulate heights of preceding rows in the same lane
    const laneRows = this.diagram.rows.filter(r => r.laneId === node.laneId);
    let rowY = LANE_HEADER_HEIGHT + LANE_PADDING_TOP;
    for (const lr of laneRows) {
      if (lr.id === row.id) break;
      rowY += this.getRowHeight(lr) + ROW_GAP_Y;
    }

    const rowHeight = this.getRowHeight(row);
    // Circle nodes: isStartNode, isEndNode, or shape === 'circle'
    const isCircle = node.isStartNode || node.isEndNode || node.shape === 'circle';
    const nodeW = isCircle ? CIRCLE_NODE_SIZE : NODE_WIDTH;
    const nodeH = isCircle ? CIRCLE_NODE_SIZE : NODE_HEIGHT;

    // ── Horizontal layout (justify / spread) ──────────────────────────────────
    // Available width inside the lane (subtract preferred padding on both sides).
    // If nodes don't fit with preferred padding, fall back to minimum padding.
    const rowWidth = this.getRowWidth(row);
    const padding = rowWidth <= laneWidth - LANE_PADDING_X * 2 ? LANE_PADDING_X : LANE_PADDING_X_MIN;
    const availWidth = laneWidth - padding * 2;

    const nodeCount = row.nodeIds.length;
    let nodeX: number;

    if (nodeCount <= 1) {
      // Single node: center it
      nodeX = laneX + padding + Math.max(0, (availWidth - nodeW) / 2);
    } else {
      // Multiple nodes: justify (spread evenly)
      // Total node widths
      let totalNodeWidth = 0;
      for (const nid of row.nodeIds) {
        const n = this.diagram.nodes.find(nd => nd.id === nid);
        // Phantom uses phantomStyle; normal nodes use shape
        let nIsCircle = false;
        if (n) {
          if (n.shape === 'phantom' && n.phantomStyle === 'circle') {
            nIsCircle = true;
          } else if (n.shape !== 'phantom') {
            nIsCircle = n.isStartNode || n.isEndNode || n.shape === 'circle';
          }
        }
        totalNodeWidth += nIsCircle ? CIRCLE_NODE_SIZE : NODE_WIDTH;
      }
      // Gap between nodes = distribute remaining space
      const totalGap = Math.max(availWidth - totalNodeWidth, (nodeCount - 1) * NODE_GAP_X);
      const gap = totalGap / (nodeCount - 1);

      // X for current node = start + sum of preceding node widths + preceding gaps
      nodeX = laneX + padding;
      for (let i = 0; i < node.colIndex; i++) {
        const prevId = row.nodeIds[i];
        const prevNode = this.diagram.nodes.find(n => n.id === prevId);
        let prevIsCircle = false;
        if (prevNode) {
          if (prevNode.shape === 'phantom' && prevNode.phantomStyle === 'circle') {
            prevIsCircle = true;
          } else if (prevNode.shape !== 'phantom') {
            prevIsCircle = prevNode.isStartNode || prevNode.isEndNode || prevNode.shape === 'circle';
          }
        }
        const pw = prevIsCircle ? CIRCLE_NODE_SIZE : NODE_WIDTH;
        nodeX += pw + gap;
      }
    }

    // Vertically center node within the row (important for circle vs rect height diff)
    const nodeY = rowY + (rowHeight - nodeH) / 2;

    return { x: nodeX, y: nodeY, width: nodeW, height: nodeH };
  }

  // ── Background ───────────────────────────────────────────────────────────────

  private renderBackground(): void {
    if (!this.svg) return;
    const bg = this.svg.append('g').attr('class', 'swimlane-bg');

    // Full background
    bg.append('rect')
      .attr('width', this.layout.totalWidth)
      .attr('height', this.layout.totalHeight)
      .attr('fill', this.theme.swimlane.background);

    // Lane header band
    bg.append('rect')
      .attr('width', this.layout.totalWidth)
      .attr('height', LANE_HEADER_HEIGHT)
      .attr('fill', this.theme.swimlane.laneHeaderBg);

    // Vertical lane dividers
    for (let i = 1; i < this.diagram.lanes.length; i++) {
      const x = this.layout.laneX[i];
      bg.append('line')
        .attr('x1', x).attr('y1', 0)
        .attr('x2', x).attr('y2', this.layout.totalHeight)
        .attr('stroke', this.theme.swimlane.laneDivider)
        .attr('stroke-width', '1');
    }

    // Bottom border of header band
    bg.append('line')
      .attr('x1', 0).attr('y1', LANE_HEADER_HEIGHT)
      .attr('x2', this.layout.totalWidth).attr('y2', LANE_HEADER_HEIGHT)
      .attr('stroke', this.theme.swimlane.laneDivider)
      .attr('stroke-width', '1');

    // Outer border
    bg.append('rect')
      .attr('width', this.layout.totalWidth)
      .attr('height', this.layout.totalHeight)
      .attr('fill', 'none')
      .attr('stroke', this.theme.swimlane.outerBorder)
      .attr('stroke-width', '1');
  }

  // ── Lane headers ─────────────────────────────────────────────────────────────

  private renderLaneHeaders(): void {
    if (!this.svg) return;
    const g = this.svg.append('g').attr('class', 'swimlane-lane-headers');

    this.diagram.lanes.forEach((lane, i) => {
      const cx = this.layout.laneX[i] + this.layout.laneWidth / 2;
      const cy = LANE_HEADER_HEIGHT / 2 + 5;
      g.append('text')
        .attr('x', cx).attr('y', cy)
        .attr('text-anchor', 'middle')
        .attr('font-size', '13')
        .attr('font-weight', '500')
        .attr('fill', this.theme.swimlane.laneHeaderText)
        .text(lane.title);
    });
  }

  // ── Nodes ─────────────────────────────────────────────────────────────────────

  private renderNodes(): void {
    if (!this.svg) return;
    const g = this.svg.append('g').attr('class', 'swimlane-nodes');

    for (const node of this.diagram.nodes) {
      const nl = this.layout.nodeLayouts.get(node.id);
      if (!nl) continue;
      // Phantom nodes are invisible placeholders — skip rendering entirely
      if (node.shape === 'phantom') continue;

      const saved = this.nodePositions.get(node.id);
      const x = saved?.pinned ? saved.x : nl.x;
      const y = saved?.pinned ? saved.y : nl.y;

      // Check for custom style color
      const customColor = this.diagram.nodeStyles?.get(node.label);

      const nodeG = g.append('g')
        .attr('class', 'swimlane-node')
        .attr('data-node-id', node.id)
        .attr('transform', `translate(${x}, ${y})`)
        .style('cursor', 'move');

      if (node.isStartNode || node.isEndNode) {
        const r = nl.width / 2 - 2;
        nodeG.append('circle')
          .attr('cx', nl.width / 2)
          .attr('cy', nl.height / 2)
          .attr('r', r)
          .attr('fill', node.isStartNode ? (customColor || this.theme.swimlane.startFill) : (customColor || this.theme.swimlane.endFill))
          .attr('stroke', node.isStartNode ? (customColor || this.theme.swimlane.startBorder) : (customColor || this.theme.swimlane.endBorder))
          .attr('stroke-width', '2');
      } else if (node.shape === 'circle') {
        const r = Math.min(nl.width, nl.height) / 2 - 2;
        nodeG.append('ellipse')
          .attr('cx', nl.width / 2)
          .attr('cy', nl.height / 2)
          .attr('rx', r)
          .attr('ry', r)
          .attr('fill', customColor || this.theme.swimlane.nodeFill)
          .attr('stroke', customColor || this.theme.swimlane.nodeBorder)
          .attr('stroke-width', '1');
      } else if (node.shape === 'diamond') {
        const hw = nl.width / 2;
        const hh = nl.height / 2;
        const pts = `${hw},0 ${nl.width},${hh} ${hw},${nl.height} 0,${hh}`;
        nodeG.append('polygon')
          .attr('points', pts)
          .attr('fill', customColor || this.theme.swimlane.nodeFill)
          .attr('stroke', customColor || this.theme.swimlane.nodeBorder)
          .attr('stroke-width', '1');
      } else if (node.operator) {
        // Two-line node: single outer border, inner color split with no visible divider
        const halfH = nl.height / 2;
        // Bottom half (operator) - slightly darker, drawn first so top half covers its top edge
        nodeG.append('rect')
          .attr('y', halfH)
          .attr('width', nl.width)
          .attr('height', halfH)
          .attr('rx', 4)
          .attr('ry', 4)
          .attr('fill', customColor || this.theme.swimlane.twoLineBotFill)
          .attr('stroke', 'none');
        // Top half (label) - white, drawn over bottom to hide any gap artifacts
        nodeG.append('rect')
          .attr('width', nl.width)
          .attr('height', halfH)
          .attr('rx', 4)
          .attr('ry', 4)
          .attr('fill', this.theme.swimlane.twoLineTopFill)
          .attr('stroke', 'none');
        // Single outer border drawn last (on top of both fills)
        nodeG.append('rect')
          .attr('width', nl.width)
          .attr('height', nl.height)
          .attr('rx', 4)
          .attr('ry', 4)
          .attr('fill', 'none')
          .attr('stroke', customColor || this.theme.swimlane.nodeBorder)
          .attr('stroke-width', '1');
        // Label text (top)
        nodeG.append('text')
          .attr('x', nl.width / 2)
          .attr('y', halfH / 2 + 5)
          .attr('text-anchor', 'middle')
          .attr('font-size', '12')
          .attr('font-weight', '500')
          .attr('fill', this.theme.swimlane.twoLineTopText)
          .text(node.label);
        // Operator text (bottom)
        nodeG.append('text')
          .attr('x', nl.width / 2)
          .attr('y', halfH + halfH / 2 + 5)
          .attr('text-anchor', 'middle')
          .attr('font-size', '11')
          .attr('fill', this.theme.swimlane.twoLineBotText)
          .text(node.operator);
      } else if (node.shape === 'round') {
        nodeG.append('rect')
          .attr('width', nl.width)
          .attr('height', nl.height)
          .attr('rx', nl.height / 2)
          .attr('fill', customColor || this.theme.swimlane.nodeFill)
          .attr('stroke', customColor || this.theme.swimlane.nodeBorder)
          .attr('stroke-width', '1');
      } else {
        nodeG.append('rect')
          .attr('width', nl.width)
          .attr('height', nl.height)
          .attr('rx', '4')
          .attr('fill', customColor || this.theme.swimlane.nodeFill)
          .attr('stroke', customColor || this.theme.swimlane.nodeBorder)
          .attr('stroke-width', '1');
      }

      // Label (only for non-two-line nodes)
      if (!node.operator) {
        nodeG.append('text')
          .attr('x', nl.width / 2)
          .attr('y', nl.height / 2 + 4)
          .attr('text-anchor', 'middle')
          .attr('font-size', '12')
          .attr('fill', this.theme.swimlane.nodeText)
          .text(node.label);
      }
    }
  }

  // ── Links ─────────────────────────────────────────────────────────────────────

  private renderLinks(): void {
    if (!this.svg) return;
    const g = this.svg.append('g').attr('class', 'swimlane-links');

    for (const link of this.diagram.links) {
      const isDashed = link.lineType === 'dashed';
      const isCurve = link.lineStyle === 'curve';

      const coords = this.getLinkCoords(link.source, link.target);
      if (!coords) continue;

      const [sx, sy, ex, ey] = coords;
      const pathD = isCurve
        ? this.buildCurvePath(sx, sy, ex, ey)
        : this.buildOrthogonalPath(link.source, link.target, sx, sy, ex, ey);

      g.append('path')
        .attr('class', `swimlane-link${isDashed ? ' swimlane-link-dashed' : ''}`)
        .attr('data-source', link.source)
        .attr('data-target', link.target)
        .attr('data-curve', isCurve ? 'true' : 'false')
        .attr('data-label', link.label || '')
        .attr('d', pathD)
        .attr('stroke', this.theme.swimlane.linkColor)
        .attr('stroke-width', '1.5')
        .attr('fill', 'none');

      this.drawArrow(g, link.source, link.target, sx, sy, ex, ey, isDashed);

      if (link.label) {
        this.drawLinkLabel(g, link.label, sx, sy, ex, ey);
      }
    }
  }

  // ── Link path helpers ─────────────────────────────────────────────────────────

  /**
   * Returns [startX, startY, endX, endY] for a link.
   *
   * Flow direction is determined by the *dominant* axis between the two nodes:
   *
   * Vertical flow (exit bottom / enter top, or reversed):
   *   - Same lane AND |ΔY| > |ΔX|  (nodes are stacked in different rows)
   *
   * Horizontal flow (exit right / enter left, or reversed):
   *   - Different lanes
   *   - OR same lane but |ΔX| >= |ΔY| (nodes are on the same row, side by side)
   *
   * For circle nodes (isStartNode/isEndNode), connection points are on the circle
   * edge rather than the bounding box edge.
   */
  private getLinkCoords(sourceId: string, targetId: string): [number, number, number, number] | null {
    const srcL = this.layout.nodeLayouts.get(sourceId);
    const tgtL = this.layout.nodeLayouts.get(targetId);
    if (!srcL || !tgtL) return null;

    const srcSaved = this.nodePositions.get(sourceId);
    const tgtSaved = this.nodePositions.get(targetId);
    const sx0 = srcSaved?.pinned ? srcSaved.x : srcL.x;
    const sy0 = srcSaved?.pinned ? srcSaved.y : srcL.y;
    const tx0 = tgtSaved?.pinned ? tgtSaved.x : tgtL.x;
    const ty0 = tgtSaved?.pinned ? tgtSaved.y : tgtL.y;

    const srcNode = this.diagram.nodes.find(n => n.id === sourceId);
    const tgtNode = this.diagram.nodes.find(n => n.id === targetId);
    const sameLane = !!(srcNode && tgtNode && srcNode.laneId === tgtNode.laneId);

    // Circle nodes: isStartNode, isEndNode, or shape === 'circle'
    const srcIsCircle = !!(srcNode && (srcNode.isStartNode || srcNode.isEndNode || srcNode.shape === 'circle'));
    const tgtIsCircle = !!(tgtNode && (tgtNode.isStartNode || tgtNode.isEndNode || tgtNode.shape === 'circle'));

    // Center X/Y of each node
    const srcCX = sx0 + srcL.width  / 2;
    const srcCY = sy0 + srcL.height / 2;
    const tgtCX = tx0 + tgtL.width  / 2;
    const tgtCY = ty0 + tgtL.height / 2;

    const absDX = Math.abs(tgtCX - srcCX);
    const absDY = Math.abs(tgtCY - srcCY);

    // Use vertical flow only when same-lane AND the nodes are more vertically
    // separated than horizontally (i.e. they live in different rows, not the same row).
    const useVertical = sameLane && absDY > absDX;

    let startX: number, startY: number, endX: number, endY: number;

    if (useVertical) {
      // Vertical flow: exit bottom-center, enter top-center (or reversed)
      const goDown = tgtCY >= srcCY;
      if (srcIsCircle) {
        // For circle source: compute point on circle edge in vertical direction
        const r = srcL.width / 2 - 2;
        startX = srcCX;
        startY = goDown ? sy0 + srcL.height / 2 + r : sy0 + srcL.height / 2 - r;
      } else {
        startX = srcCX;
        startY = goDown ? sy0 + srcL.height : sy0;
      }
      if (tgtIsCircle) {
        // For circle target: compute point on circle edge in vertical direction
        const r = tgtL.width / 2 - 2;
        endX = tgtCX;
        endY = goDown ? ty0 + tgtL.height / 2 - r : ty0 + tgtL.height / 2 + r;
      } else {
        endX = tgtCX;
        endY = goDown ? ty0 : ty0 + tgtL.height;
      }
    } else {
      // Horizontal flow: exit right-center, enter left-center (or reversed)
      const goRight = tgtCX >= srcCX;
      if (srcIsCircle) {
        // For circle source: compute point on circle edge in horizontal direction
        const r = srcL.width / 2 - 2;
        startX = goRight ? sx0 + srcL.width / 2 + r : sx0 + srcL.width / 2 - r;
        startY = srcCY;
      } else {
        startX = goRight ? sx0 + srcL.width : sx0;
        startY = srcCY;
      }
      if (tgtIsCircle) {
        // For circle target: compute point on circle edge in horizontal direction
        const r = tgtL.width / 2 - 2;
        endX = goRight ? tx0 + tgtL.width / 2 - r : tx0 + tgtL.width / 2 + r;
        endY = tgtCY;
      } else {
        endX = goRight ? tx0 : tx0 + tgtL.width;
        endY = tgtCY;
      }
    }

    return [startX, startY, endX, endY];
  }

  /**
   * Returns true when the two nodes should be connected via a vertical
   * (top/bottom) flow:  same lane AND nodes are more vertically separated
   * than horizontally (i.e. they live in different rows, not the same row).
   *
   * Returns false (horizontal flow) for cross-lane or same-row connections.
   */
  private isVerticalFlow(sourceId: string, targetId: string): boolean {
    const srcNode = this.diagram.nodes.find(n => n.id === sourceId);
    const tgtNode = this.diagram.nodes.find(n => n.id === targetId);
    if (!srcNode || !tgtNode || srcNode.laneId !== tgtNode.laneId) return false;

    const srcL = this.layout.nodeLayouts.get(sourceId);
    const tgtL = this.layout.nodeLayouts.get(targetId);
    if (!srcL || !tgtL) return false;

    const absDX = Math.abs((tgtL.x + tgtL.width / 2) - (srcL.x + srcL.width / 2));
    const absDY = Math.abs((tgtL.y + tgtL.height / 2) - (srcL.y + srcL.height / 2));
    return absDY > absDX;
  }

  private buildOrthogonalPath(
    sourceId: string, targetId: string,
    sx: number, sy: number, ex: number, ey: number
  ): string {
    const dx = ex - sx;
    const dy = ey - sy;

    if (Math.abs(dx) < 2) return `M ${sx} ${sy} L ${ex} ${ey}`;
    if (Math.abs(dy) < 2) return `M ${sx} ${sy} L ${ex} ${ey}`;

    // Reuse the same direction logic as getLinkCoords
    const useVertical = this.isVerticalFlow(sourceId, targetId);

    if (useVertical) {
      // Vertical flow: V then H then V
      const midY = (sy + ey) / 2;
      return `M ${sx} ${sy} V ${midY} H ${ex} V ${ey}`;
    }

    // Horizontal flow: H then V then H
    const midX = (sx + ex) / 2;
    return `M ${sx} ${sy} H ${midX} V ${ey} H ${ex}`;
  }

  private buildCurvePath(sx: number, sy: number, ex: number, ey: number): string {
    const dx = ex - sx;
    const dy = ey - sy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const c = Math.min(dist * 0.3, 60);

    if (Math.abs(dy) < 2) {
      // Horizontal
      return `M ${sx} ${sy} C ${sx} ${sy - c}, ${ex} ${ey - c}, ${ex} ${ey}`;
    }
    if (Math.abs(dx) < 2) {
      // Vertical
      return `M ${sx} ${sy} C ${sx - c} ${sy}, ${ex - c} ${ey}, ${ex} ${ey}`;
    }
    const midX = (sx + ex) / 2;
    const r = Math.min(Math.abs(dy) / 2, 30);
    if (r > 0) {
      return `M ${sx} ${sy} H ${midX - r} Q ${midX} ${sy} ${midX} ${sy + r} V ${ey - r} Q ${midX} ${ey} ${midX + r} ${ey} H ${ex}`;
    }
    return `M ${sx} ${sy} L ${ex} ${ey}`;
  }

  // ── Arrowhead ──────────────────────────────────────────────────────────────────

  private drawArrow(
    parent: D3Selection,
    sourceId: string, targetId: string,
    sx: number, sy: number,
    ex: number, ey: number,
    isDashed: boolean
  ): void {
    const arrowLen = 8;
    const arrowWidth = 5;
    const color = isDashed ? this.theme.swimlane.arrowColorDashed : this.theme.swimlane.arrowColor;

    // Arrow should point TOWARD the target center
    const tgtNode = this.diagram.nodes.find(n => n.id === targetId);
    if (!tgtNode) return;

    const tgtL = this.layout.nodeLayouts.get(targetId);
    const tgtSaved = this.nodePositions.get(targetId);
    const tx0 = tgtSaved?.pinned ? tgtSaved.x : (tgtL?.x ?? 0);
    const ty0 = tgtSaved?.pinned ? tgtSaved.y : (tgtL?.y ?? 0);
    const tgtW = tgtL?.width ?? NODE_WIDTH;
    const tgtH = tgtL?.height ?? NODE_HEIGHT;
    const tgtCX = tx0 + tgtW / 2;
    const tgtCY = ty0 + tgtH / 2;

    const angle = Math.atan2(tgtCY - ey, tgtCX - ex);

    const tipX = ex;
    const tipY = ey;
    const baseX = ex - arrowLen * Math.cos(angle);
    const baseY = ey - arrowLen * Math.sin(angle);
    const perpX = -Math.sin(angle) * arrowWidth;
    const perpY =  Math.cos(angle) * arrowWidth;

    parent.append('polygon')
      .attr('class', 'swimlane-arrowhead')
      .attr('points', `${tipX},${tipY} ${baseX + perpX},${baseY + perpY} ${baseX - perpX},${baseY - perpY}`)
      .attr('fill', color);
  }

  private lastSegmentAngle(
    sourceId: string, targetId: string,
    sx: number, sy: number,
    ex: number, ey: number
  ): number {
    const dx = ex - sx;
    const dy = ey - sy;

    if (Math.abs(dx) < 2) return dy >= 0 ? Math.PI / 2 : -Math.PI / 2;
    if (Math.abs(dy) < 2) return dx >= 0 ? 0 : Math.PI;

    // Reuse the same direction logic as getLinkCoords
    const useVertical = this.isVerticalFlow(sourceId, targetId);

    if (useVertical) {
      // Vertical path: V → H → V, last segment is vertical
      return dy >= 0 ? Math.PI / 2 : -Math.PI / 2;
    }
    // Horizontal path: H → V → H, last segment is horizontal
    return dx >= 0 ? 0 : Math.PI;
  }

  // ── Link label ────────────────────────────────────────────────────────────────

  private drawLinkLabel(
    parent: D3Selection,
    label: string,
    sx: number, sy: number,
    ex: number, ey: number
  ): void {
    const midX = (sx + ex) / 2;
    const midY = (sy + ey) / 2 - 8;

    const labelG = parent.append('g').attr('class', 'swimlane-link-label-group');
    const textEl = labelG.append('text')
      .attr('class', 'swimlane-link-label')
      .attr('x', midX)
      .attr('y', midY)
      .attr('text-anchor', 'middle')
      .attr('font-size', '11')
      .attr('fill', this.theme.swimlane.linkLabelColor)
      .text(label);

    const textNode = textEl.node() as SVGTextElement | null;
    if (textNode) {
      const bbox = textNode.getBBox();
      labelG.insert('rect', 'text')
        .attr('x', bbox.x - 3).attr('y', bbox.y - 1)
        .attr('width', bbox.width + 6).attr('height', bbox.height + 2)
        .attr('rx', 3)
        .attr('fill', this.theme.swimlane.linkLabelBg).attr('opacity', '0.9');
    }
  }

  // ── Update links after drag ───────────────────────────────────────────────────

  private updateAllLinks(): void {
    if (!this.svg) return;

    this.svg.selectAll('.swimlane-arrowhead').remove();
    this.svg.selectAll('.swimlane-link-label-group').remove();

    const linksGroup = this.svg.select('.swimlane-links');

    this.svg.selectAll('.swimlane-link').each((_d: unknown, i: number, nodes: Element[]) => {
      const el = nodes[i] as SVGPathElement;
      const srcId = el.getAttribute('data-source');
      const tgtId = el.getAttribute('data-target');
      if (!srcId || !tgtId) return;

      const coords = this.getLinkCoords(srcId, tgtId);
      if (!coords) return;
      const [sx, sy, ex, ey] = coords;

      const isCurve = el.getAttribute('data-curve') === 'true';
      const isDashed = el.classList.contains('swimlane-link-dashed');

      const pathD = isCurve
        ? this.buildCurvePath(sx, sy, ex, ey)
        : this.buildOrthogonalPath(srcId, tgtId, sx, sy, ex, ey);
      el.setAttribute('d', pathD);

      this.drawArrow(linksGroup, srcId, tgtId, sx, sy, ex, ey, isDashed);

      const label = el.getAttribute('data-label');
      if (label) this.drawLinkLabel(linksGroup, label, sx, sy, ex, ey);
    });
  }

  // ── Drag ──────────────────────────────────────────────────────────────────────

  private attachDragBehavior(): void {
    if (!this.svg || !this.d3) return;

    const drag = this.d3.drag()
      .on('start', () => { /* nothing */ })
      .on('drag', ((event: D3DragEvent) => {
        const target = event.sourceEvent.target as Element;
        const nodeGroup = target.closest('.swimlane-node') as HTMLElement | null;
        if (!nodeGroup) return;
        const nodeId = nodeGroup.getAttribute('data-node-id');
        if (!nodeId) return;

        const transform = nodeGroup.getAttribute('transform') || 'translate(0,0)';
        const m = transform.match(/translate\(([^,]+),\s*([^)]+)\)/);
        let cx = m ? parseFloat(m[1]) : 0;
        let cy = m ? parseFloat(m[2]) : 0;
        cx += event.dx;
        cy += event.dy;

        // Clamp to SVG bounds
        const nl = this.layout.nodeLayouts.get(nodeId);
        if (nl) {
          cx = Math.max(0, Math.min(cx, this.layout.totalWidth - nl.width));
          cy = Math.max(LANE_HEADER_HEIGHT, Math.min(cy, this.layout.totalHeight - nl.height));
        }

        nodeGroup.setAttribute('transform', `translate(${cx}, ${cy})`);
        this.nodePositions.set(nodeId, { x: cx, y: cy, pinned: true });
        this.updateAllLinks();
      }) as unknown as (event: D3DragEvent, d: unknown) => void)
      .on('end', ((event: D3DragEvent) => {
        const target = event.sourceEvent.target as Element;
        const nodeGroup = target.closest('.swimlane-node') as HTMLElement | null;
        if (!nodeGroup) return;
        const nodeId = nodeGroup.getAttribute('data-node-id');
        if (!nodeId || !this.onPositionSave) return;

        if (this.saveTimeout) clearTimeout(this.saveTimeout);
        this.saveTimeout = setTimeout(() => {
          if (this.onPositionSave) {
            this.onPositionSave(this.getPositions());
          }
        }, 500);
      }) as unknown as (event: D3DragEvent, d: unknown) => void);

    (this.svg as unknown as { selectAll: (s: string) => { call: (fn: unknown) => void } })
      .selectAll('.swimlane-node')
      .call(drag as unknown as (sel: D3Selection) => void);
  }
}
