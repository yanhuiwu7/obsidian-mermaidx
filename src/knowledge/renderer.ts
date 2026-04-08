import { MarkdownRenderer, Component, App, MarkdownPostProcessorContext, TFile } from "obsidian";
import * as yaml from 'js-yaml';
import { GraphConfig, GraphNode, GraphLink, Triple, NodeShape } from "./types";
import { parseKnowledgeGraph } from "./parser";
import { getTheme, getAvailableThemes, getThemeLabel, type DiagramTheme } from '../common/themes';

// Auto-assigned color palette
const AUTO_COLOR_PALETTE = [
  "#6366f1", "#f59e0b", "#10b981", "#ef4444",
  "#3b82f6", "#ec4899", "#14b8a6", "#f97316",
  "#8b5cf6", "#06b6d4", "#84cc16", "#a855f7",
];
const DEFAULT_FALLBACK_COLOR = "#64748b";

// ============================================
// D3 type definitions (subset used by this plugin)
// ============================================
// D3 datum type: can be GraphNode, GraphLink, or other bound data
type D3Datum = GraphNode | GraphLink | unknown;

type D3Selection = {
  attr: (name: string, value?: unknown) => D3Selection;
  style: (name: string, value?: unknown) => D3Selection;
  append: (tag: string) => D3Selection;
  select: (selector: string) => D3Selection;
  selectAll: (selector: string) => D3Selection;
  data: (data: unknown[]) => D3Selection;
  enter: () => D3Selection;
  text: (t: string | ((d: D3Datum) => string)) => D3Selection;
  call: (fn: unknown, ...args: unknown[]) => D3Selection;
  on: (event: string, handler: unknown) => D3Selection;
  remove: () => void;
  classed: (cls: string, val: boolean) => D3Selection;
  each: (fn: (d: D3Datum, i: number, nodes: Element[]) => void) => D3Selection;
  transition: () => D3Selection;
  duration: (ms: number) => D3Selection;
  ease: (fn: unknown) => D3Selection;
};

type D3Simulation = {
  force: (name: string, force?: unknown) => D3Simulation;
  on: (event: string, handler: () => void) => D3Simulation;
  stop: () => void;
  alpha: (v: number) => D3Simulation;
  alphaTarget: (v: number) => D3Simulation;
  alphaDecay: (v: number) => D3Simulation;
  velocityDecay: (v: number) => D3Simulation;
  restart: () => D3Simulation;
};

type D3ZoomBehavior = {
  scaleExtent: (extent: [number, number]) => D3ZoomBehavior;
  on: (event: string, handler: (event: D3ZoomEvent) => void) => D3ZoomBehavior;
  transform: unknown;
};

type D3ZoomEvent = {
  transform: { k: number; x: number; y: number };
};

type D3DragEvent = {
  x: number;
  y: number;
  active: number;
};

type D3ForceChainable = {
  id: (fn: (d: GraphNode) => string) => D3ForceChainable;
  distance: (v: number) => D3ForceChainable;
  strength: (v: number) => D3ForceChainable;
  distanceMax: (v: number) => D3ForceChainable;
  radius: (fn: (d: GraphNode) => number) => D3ForceChainable;
};

type D3ForceX = {
  strength: (v: number) => D3ForceChainable;
};

type D3ForceY = {
  strength: (v: number) => D3ForceChainable;
};

type D3DragBehavior = {
  on: (event: "start" | "drag" | "end", handler: (event: D3DragEvent, d: GraphNode) => void) => D3DragBehavior;
};

type D3Instance = {
  select: (el: Element) => D3Selection;
  zoom: () => D3ZoomBehavior;
  zoomIdentity: { translate: (x: number, y: number) => { scale: (k: number) => unknown } };
  drag: () => D3DragBehavior;
  forceSimulation: (nodes: GraphNode[]) => D3Simulation;
  forceLink: (links: GraphLink[]) => D3ForceChainable;
  forceManyBody: () => D3ForceChainable;
  forceCenter: (x: number, y: number) => D3ForceChainable;
  forceCollide: () => D3ForceChainable;
  forceX: (x: number) => D3ForceX;
  forceY: (y: number) => D3ForceY;
  easeCubicOut: unknown;
};

// ============================================
// Ensure D3 is loaded (global singleton)
// ============================================
let d3LoadPromise: Promise<D3Instance | null> | null = null;

function ensureD3(): Promise<D3Instance | null> {
  const win = window as unknown as Record<string, unknown>;
  if (win["d3"]) return Promise.resolve(win["d3"] as D3Instance);
  if (d3LoadPromise) return d3LoadPromise;

  d3LoadPromise = new Promise((resolve) => {
    const script = document.createElement("script");
    script.src = "https://d3js.org/d3.v7.min.js";
    script.onload = () => {
      d3LoadPromise = null;
      const d3 = (window as unknown as Record<string, unknown>)["d3"] as D3Instance;
      if (d3) {
        resolve(d3);
      } else {
        console.error("[MermaidX Knowledge Graph] D3.js loaded but not available globally");
        resolve(null);
      }
    };
    script.onerror = (error) => {
      d3LoadPromise = null;
      console.error("[MermaidX Knowledge Graph] Failed to load D3.js:", error);
      resolve(null);
    };
    document.head.appendChild(script);
  });

  return d3LoadPromise;
}

// ============================================
// Utility: extract string ID from a D3-resolved node/string union
// ============================================
function nodeId(ref: GraphNode | string): string {
  return typeof ref === "string" ? ref : ref.id;
}

// ============================================
// Utility: Debounce function
// ============================================
function debounce<T extends (...args: unknown[]) => void>(fn: T, delay: number): T {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return ((...args: Parameters<T>) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  }) as T;
}

// ============================================
// Code block renderer
// ============================================
export class KnowledgeGraphRenderer {
  private app: App;
  private component: Component;
  private positionCallbacks: {
    onSave?: (key: string, positions: Record<string, { x: number; y: number }>) => void;
    onLoad?: (key: string) => Record<string, { x: number; y: number }> | undefined;
    onClear?: (key: string) => void;
  } = {};

  constructor(app: App, component: Component) {
    this.app = app;
    this.component = component;
  }

  setPositionCallbacks(
    onSave?: (key: string, positions: Record<string, { x: number; y: number }>) => void,
    onLoad?: (key: string) => Record<string, { x: number; y: number }> | undefined,
    onClear?: (key: string) => void
  ): void {
    this.positionCallbacks = { onSave, onLoad, onClear };
  }

  async render(source: string, container: HTMLElement, ctx?: MarkdownPostProcessorContext, themeName?: string | null, onThemeChange?: (themeName: string) => void): Promise<void> {
    container.empty();
    container.addClass("kg-codeblock-wrap");

    // Parse source using the knowledge graph parser
    // Since common/parser already extracts frontmatter, we need raw source here
    const parseResult = this.parseRawSource(source);
    const { config, errors } = parseResult;

    // Show parse errors (don't block rendering)
    if (errors.length > 0) {
      const errBox = container.createDiv({ cls: "kg-cb-errors" });
      errBox.createEl("strong", { text: "Syntax hints" });
      errors.forEach((e) => errBox.createEl("div", { text: e, cls: "kg-cb-error-item" }));
    }

    if (config.triples.length === 0) {
      container.createDiv({ cls: "kg-cb-empty", text: "No graph content, please add triples" });
      return;
    }

    // Height settings
    const DEFAULT_H = 420;
    const MIN_H = 200;
    const MAX_H = 1200;
    const clampH = (v: number) => Math.min(MAX_H, Math.max(MIN_H, v));
    const initH = clampH(config.height ?? DEFAULT_H);

    // Save height to md file
    const saveHeight = async (h: number) => {
      if (!ctx) return;
      const filePath = ctx.sourcePath;
      const file = this.app.vault.getAbstractFileByPath(filePath);
      if (!(file instanceof TFile)) return;
      const content = await this.app.vault.read(file);
      config.height = h;
      // Simple regex replace for height in frontmatter
      const newContent = content.replace(
        /height:\s*\d+/,
        `height: ${h}`
      );
      if (newContent !== content) {
        await this.app.vault.modify(file, newContent);
      }
    };

    // Layout skeleton
    const graphWrap = container.createDiv({ cls: "kg-cb-graph-wrap" });
    // Force position:relative via inline style — CSS class may be overridden by Obsidian theme
    graphWrap.style.position = "relative";

    // Toolbar
    const toolbar = graphWrap.createDiv({ cls: "kg-cb-toolbar" });
    toolbar.createEl("span", { cls: "kg-cb-title", text: config.name });
    const btnRow = toolbar.createDiv({ cls: "kg-cb-btn-row" });

    // Theme selector (first position, consistent with swimlane & arch)
    const kgTheme = getTheme(themeName);
    const themeSelect = btnRow.createEl("select", { cls: "kg-cb-theme-select" });
    for (const name of getAvailableThemes()) {
      const opt = themeSelect.createEl("option", { value: name, text: getThemeLabel(name) });
      if (name === kgTheme.name) opt.selected = true;
    }
    themeSelect.addEventListener("change", () => {
      onThemeChange?.(themeSelect.value);
    });

    const btnFit = btnRow.createEl("button", { cls: "kg-cb-btn", text: "Fit" });
    const btnLabel = btnRow.createEl("button", { cls: "kg-cb-btn", text: "Label" });
    const btnLayout = btnRow.createEl("button", { cls: "kg-cb-btn", text: "Restart" });

    // Canvas area
    const canvasWrap = graphWrap.createDiv({ cls: "kg-cb-canvas-wrap" });
    canvasWrap.style.height = initH + "px";
    // Force position:relative via inline style to ensure canvasWrap is the containing block
    // for absolute-positioned Legend/Desc panels. CSS class may be overridden by Obsidian theme.
    canvasWrap.style.position = "relative";
    canvasWrap.style.overflow = "visible";

    // SVG
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "kg-cb-svg");
    canvasWrap.appendChild(svg);

    // Tooltip
    const tooltip = canvasWrap.createDiv({ cls: "kg-tooltip" });

    // Legend panel - rendered into graphWrap (position:relative) - BELOW TOOLBAR
    let legendRendererRef: GraphRenderer | null = null;
    if ((config.nodeStyles && config.nodeStyles.size > 0) || 
        (config.relationStyles && config.relationStyles.size > 0)) {
      this.renderLegendPanel(graphWrap, config, (label, color) => {
        legendRendererRef?.filterByLegend(label, color);
      });
    }

    // Description panel - also in graphWrap
    if (config.description?.trim()) {
      this.renderDescPanel(graphWrap, config);
    }

    // Stats bar
    const stats = graphWrap.createDiv({ cls: "kg-cb-stats" });

    // Resize handle
    const resizeHandle = graphWrap.createDiv({ cls: "kg-cb-resize-handle" });
    resizeHandle.createDiv({ cls: "kg-cb-resize-dots" });
    this.attachResizeHandle(resizeHandle, canvasWrap, svg, MIN_H, MAX_H, saveHeight);

    // Load D3
    const loadingEl = canvasWrap.createDiv({ cls: "kg-loading" });
    const spinnerEl = loadingEl.createDiv({ cls: "kg-spinner" });
    spinnerEl.setAttribute("aria-hidden", "true");
    loadingEl.createSpan({ text: "Loading..." });

    const d3 = await ensureD3();
    loadingEl.remove();

    if (!d3) {
      canvasWrap.createDiv({ cls: "kg-cb-error", text: "⚠ D3.js failed to load, please check network connection and refresh" });
      return;
    }

    // Render graph
    const renderer = new GraphRenderer(d3, svg, tooltip, config, kgTheme);
    legendRendererRef = renderer;
    renderer.setPositionCallbacks(
      this.positionCallbacks.onSave,
      this.positionCallbacks.onLoad,
      this.positionCallbacks.onClear
    );
    // Generate stable position key from file path + content hash
    const positionKey = ctx ? generatePositionKey(ctx.sourcePath, config) : "";
    renderer.setPositionKey(positionKey);
    renderer.render();

    const data = renderer.getData();

    // Stats bar
    stats.empty();
    const statNode = stats.createSpan({ cls: "kg-cb-stat" });
    statNode.createEl("strong", { text: String(data.nodes.length) });
    statNode.appendText(" nodes");
    stats.createSpan({ cls: "kg-cb-stat-sep", text: "·" });
    const statEdge = stats.createSpan({ cls: "kg-cb-stat" });
    statEdge.createEl("strong", { text: String(data.links.length) });
    statEdge.appendText(" edges");

    // Height input
    const heightGroup = stats.createDiv({ cls: "kg-cb-height-group" });
    heightGroup.createSpan({ cls: "kg-cb-height-label", text: "Height" });
    const heightInput = heightGroup.createEl("input", { cls: "kg-cb-height-input" });
    heightGroup.createSpan({ cls: "kg-cb-height-unit", text: "px" });
    heightInput.type = "number";
    heightInput.min = String(MIN_H);
    heightInput.max = String(MAX_H);
    heightInput.value = String(initH);
    heightInput.title = "Enter height (px) and press enter to confirm";

    const applyHeightFromInput = (h: number) => {
      const clamped = clampH(h);
      canvasWrap.style.height = clamped + "px";
      svg.setAttribute("height", String(clamped));
      heightInput.value = String(clamped);
      void saveHeight(clamped);
    };

    heightInput.addEventListener("click", (e) => e.stopPropagation());
    heightInput.addEventListener("mousedown", (e) => e.stopPropagation());
    heightGroup.addEventListener("mousedown", (e) => e.stopPropagation());
    heightInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        const val = parseInt(heightInput.value);
        if (!isNaN(val)) applyHeightFromInput(val);
        heightInput.blur();
      }
      if (e.key === "Escape") heightInput.blur();
    });
    heightInput.addEventListener("blur", () => {
      const val = parseInt(heightInput.value);
      if (!isNaN(val)) applyHeightFromInput(val);
    });

    (resizeHandle as HTMLElement & { __syncInput?: (h: number) => void }).__syncInput = (h: number) => { heightInput.value = String(h); };

    // Button events
    btnFit.addEventListener("click", () => renderer.fitView());
    btnLayout.addEventListener("click", () => renderer.restart());

    let labelsVisible = true;
    btnLabel.addEventListener("click", () => {
      labelsVisible = !labelsVisible;
      renderer.setLabelsVisible(labelsVisible);
      btnLabel.textContent = labelsVisible ? "Hide labels" : "Show labels";
    });

    // Resize observer
    const ro = new ResizeObserver(() => renderer.onResize());
    ro.observe(canvasWrap);
    this.component.register(() => { ro.disconnect(); renderer.destroy(); });
  }

  /**
   * Parse raw source directly (frontmatter + content together)
   * This is needed because the raw source from the codeblock includes frontmatter
   */
  private parseRawSource(source: string): { config: GraphConfig; errors: string[] } {
    const lines = source.split("\n");

    let name = "Knowledge Graph";
    let description = "";
    let height: number | undefined;
    const triples: Triple[] = [];

    // Node styles: nodeName -> { color, label }
    const nodeStyles: Map<string, { color: string; label?: string }> = new Map();
    // Relation styles: relationName -> { color, label }
    const relationStyles: Map<string, { color: string; label?: string }> = new Map();
    const autoColors = [
      "#6366f1", "#f59e0b", "#10b981", "#ef4444",
      "#3b82f6", "#ec4899", "#14b8a6", "#f97316",
      "#8b5cf6", "#06b6d4", "#84cc16", "#a855f7",
    ];
    let styleColorIdx = 0;

    const errors: string[] = [];

    // Parse frontmatter using YAML
    let i = 0;
    if (lines[0]?.trim() === "---") {
      const fmLines: string[] = [];
      i = 1;
      while (i < lines.length && lines[i]?.trim() !== "---") {
        fmLines.push(lines[i]);
        i++;
      }
      i++; // Skip closing ---

      // Skip empty lines after frontmatter (but before content starts)
      while (i < lines.length && !lines[i]?.trim()) {
        i++;
      }

      // Use YAML parser for proper multi-line support
      try {
        const fmContent = fmLines.join("\n");
        const fmObj = yaml.load(fmContent) as Record<string, unknown> | null;
        if (fmObj && typeof fmObj === "object") {
          name = (typeof fmObj.name === "string" ? fmObj.name : 
                  typeof fmObj.title === "string" ? fmObj.title : "Knowledge Graph") as string;
          description = typeof fmObj.description === "string" ? fmObj.description : "";
          if (typeof fmObj.height === "number") {
            height = fmObj.height;
          } else if (typeof fmObj.height === "string") {
            const h = parseInt(fmObj.height as string);
            if (!isNaN(h) && h > 0) height = h;
          }
        }
      } catch (err) {
        errors.push(`Frontmatter parse error: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // Skip diagramType line if present
    if (i < lines.length) {
      const firstLine = lines[i]?.trim() || '';
      if (firstLine === 'knowledgeGraph' || firstLine === 'knowledge') {
        i++;
      }
    }

    // Skip empty lines after diagramType line
    while (i < lines.length && !lines[i]?.trim()) {
      i++;
    }

    // Helper: check if line is a comment (Mermaid style: %%)
    const isComment = (line: string): boolean => {
      const trimmed = line.trim();
      return trimmed.startsWith("%%");
    };

    // Helper: extract color from string (e.g., "#6366f1")
    const extractColor = (str: string, defaultColor: string): { color: string; remaining: string } => {
      const match = str.match(/#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/);
      if (match) {
        return { color: match[0], remaining: str.replace(match[0], "").trim() };
      }
      return { color: defaultColor, remaining: str.trim() };
    };

    // Helper: extract label from string (e.g., "[管理工作]" -> "管理工作") → "[NodeName]" -> "NodeName"
    const extractLabel = (str: string): { label: string | undefined; remaining: string } => {
      const match = str.match(/\[([^\]]+)\]/);
      if (match) {
        return { label: match[1], remaining: str.replace(match[0], "").trim() };
      }
      return { label: undefined, remaining: str.trim() };
    };

    // Node shapes map: [name] -> rect, (name) -> ellipse, {name} -> diamond, ((name)) -> hexagon
    const nodeShapes: Map<string, import("./types").NodeShape> = new Map();

    // Helper: extract node name and shape from bracket notation
    // [name] -> rect, (name) -> ellipse, {name} -> diamond, ((name)) -> hexagon, name -> circle
    const extractNode = (token: string): { name: string; shape: import("./types").NodeShape } => {
      const trimmed = token.trim();
      // Double parentheses: ((name)) -> hexagon
      const hexMatch = trimmed.match(/^\(\((.+)\)\)$/);
      if (hexMatch) {
        return { name: hexMatch[1].trim(), shape: "hexagon" };
      }
      // Single brackets: [name] -> rect
      const rectMatch = trimmed.match(/^\[(.+)\]$/);
      if (rectMatch) {
        return { name: rectMatch[1].trim(), shape: "rect" };
      }
      // Single parentheses: (name) -> ellipse
      const ellMatch = trimmed.match(/^\((.+)\)$/);
      if (ellMatch) {
        return { name: ellMatch[1].trim(), shape: "ellipse" };
      }
      // Braces: {name} -> diamond
      const diaMatch = trimmed.match(/^\{(.+)\}$/);
      if (diaMatch) {
        return { name: diaMatch[1].trim(), shape: "diamond" };
      }
      // No brackets -> circle (default)
      return { name: trimmed, shape: "circle" };
    };

    // Helper: parse new syntax triple line
    // Formats:
    //   [source]-->|predicate| target          (solid line)
    //   [source]-.->|predicate| target         (animated dashed line)
    //   source-->|predicate| [target]          (circle source, rect target)
    //   (source)-.->|predicate| {target}       (ellipse source, diamond target, animated)
    // Arrow patterns: --> or -.->
    const parseArrowTriple = (line: string): { subject: string; predicate: string; object: string; animated: boolean; srcShape: import("./types").NodeShape; tgtShape: import("./types").NodeShape } | null => {
      const trimmed = line.trim();

      const arrowMatch = trimmed.match(/^(.+?)\s*(-\.->|-->)\s*\|([^|]+)\|\s*(.+)$/);
      if (!arrowMatch) return null;

      const srcToken = arrowMatch[1].trim();
      const arrowType = arrowMatch[2].trim();
      const predicate = arrowMatch[3].trim();
      const tgtToken = arrowMatch[4].trim();

      const src = extractNode(srcToken);
      const tgt = extractNode(tgtToken);
      const animated = arrowType === "-.->";

      // Register shapes
      nodeShapes.set(src.name, src.shape);
      nodeShapes.set(tgt.name, tgt.shape);

      return {
        subject: src.name,
        predicate,
        object: tgt.name,
        animated,
        srcShape: src.shape,
        tgtShape: tgt.shape,
      };
    };

    // Phase 1: Parse all content first
    for (; i < lines.length; i++) {
      const raw = lines[i];
      const trimmed = raw.trim();
      if (!trimmed || isComment(trimmed)) continue;

      if (trimmed.startsWith("@style ")) continue;

      const triple = parseArrowTriple(trimmed);
      if (triple) {
        triples.push({ subject: triple.subject, predicate: triple.predicate, object: triple.object, animated: triple.animated });
      }
    }

    // Build predicate set for @style disambiguation
    const predicateSet = new Set(triples.map(t => t.predicate));

    // Phase 2: Parse @style directives
    // @style determines if name is node style or relation style based on whether it appears in predicates
    for (let j = 0; j < lines.length; j++) {
      const raw = lines[j];
      const trimmed = raw.trim();
      if (!trimmed || isComment(trimmed)) continue;
      
      if (trimmed.startsWith("@style ")) {
        const rest = trimmed.slice(7).trim();
        const { color, remaining } = extractColor(rest, autoColors[styleColorIdx % autoColors.length]);
        const { label, remaining: remaining2 } = extractLabel(remaining);
        // Split by comma to support multiple names
        const names = remaining2.split(",").map(s => s.trim()).filter(Boolean);
        
        if (names.length > 0) {
          names.forEach(name => {
            // If name appears as a predicate in triples, it's a relation style
            // Otherwise, it's a node style
            if (predicateSet.has(name)) {
              relationStyles.set(name, { color, label });
            } else {
              nodeStyles.set(name, { color, label });
            }
          });
          styleColorIdx++;
        }
      }
    }

    const slug = name.toLowerCase().replace(/[\s]+/g, "_").replace(/[^a-z0-9_]/g, "").slice(0, 20);
    const config: GraphConfig = {
      id: `kg_${slug || "graph"}_${Date.now().toString(36)}`,
      name,
      description,
      height,
      triples,
      nodeStyles,
      relationStyles,
      nodeShapes,
    };

    return { config, errors };
  }

  // Legend panel (top-right, BELOW TOOLBAR, in graphWrap) - shows node styles or relation styles
  private renderLegendPanel(container: HTMLElement, config: GraphConfig, onFilter?: (label: string | null, color: string | null) => void) {
    const panel = container.createDiv({ cls: "kg-cb-legend-panel" });
    // Force positioning via inline style WITH !important - highest priority
    panel.style.setProperty("position", "absolute", "important");
    panel.style.setProperty("top", "56px", "important");
    panel.style.setProperty("right", "10px", "important");
    panel.style.setProperty("left", "auto", "important"); // disable left
    panel.style.setProperty("bottom", "auto", "important"); // disable bottom
    panel.style.setProperty("z-index", "100", "important");

    const header = panel.createDiv({ cls: "kg-cb-legend-header" });
    header.createSpan({ cls: "kg-cb-legend-title", text: "Legend" });

    const toggleSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    toggleSvg.setAttribute("class", "kg-desc-toggle");
    toggleSvg.setAttribute("width", "12");
    toggleSvg.setAttribute("height", "12");
    toggleSvg.setAttribute("viewBox", "0 0 24 24");
    toggleSvg.setAttribute("fill", "none");
    toggleSvg.setAttribute("stroke", "currentColor");
    toggleSvg.setAttribute("stroke-width", "2.5");
    const polyline = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
    polyline.setAttribute("points", "6 9 12 15 18 9");
    toggleSvg.appendChild(polyline);
    header.appendChild(toggleSvg);

    // Toggle collapse on header click (but not when clicking legend items)
    header.addEventListener("click", () => panel.classList.toggle("collapsed"));

    const body = panel.createDiv({ cls: "kg-cb-legend-body" });

    let activeLabel: string | null = null;
    const allItems: HTMLElement[] = [];

    const createItem = (label: string, color: string) => {
      const item = body.createDiv({ cls: "kg-cb-legend-item" });
      allItems.push(item);
      const span = item.createSpan({ cls: "kg-cb-legend-label", text: label });
      span.style.color = color;
      span.style.setProperty("--legend-color", color);

      item.addEventListener("click", (e) => {
        e.stopPropagation(); // prevent collapsing panel
        if (activeLabel === label) {
          // Deactivate: clear filter
          activeLabel = null;
          allItems.forEach(el => el.classList.remove("active", "dimmed"));
          onFilter?.(null, null);
        } else {
          // Activate: highlight this, dim others
          activeLabel = label;
          allItems.forEach(el => {
            const elLabel = el.querySelector<HTMLElement>(".kg-cb-legend-label")?.textContent ?? "";
            el.classList.toggle("active", elLabel === label);
            el.classList.toggle("dimmed", elLabel !== label);
          });
          onFilter?.(label, color);
        }
      });
    };

    // Show node styles first (higher priority)
    // Deduplicate by label: same label+color only appears once
    if (config.nodeStyles && config.nodeStyles.size > 0) {
      const seen = new Map<string, string>(); // label -> color
      config.nodeStyles.forEach((style, nodeName) => {
        const displayLabel = style.label || nodeName;
        if (!seen.has(displayLabel)) {
          seen.set(displayLabel, style.color);
        }
      });
      seen.forEach((color, label) => createItem(label, color));
    }
    // Fallback to relation styles
    else if (config.relationStyles && config.relationStyles.size > 0) {
      const seen = new Map<string, string>(); // label -> color
      config.relationStyles.forEach((style, relation) => {
        const displayLabel = style.label || relation;
        if (!seen.has(displayLabel)) {
          seen.set(displayLabel, style.color);
        }
      });
      seen.forEach((color, label) => createItem(label, color));
    }
  }

  // Description panel (bottom-left, ABOVE STATS, in graphWrap, auto height)
  private renderDescPanel(container: HTMLElement, config: GraphConfig) {
    const panel = container.createDiv({ cls: "kg-cb-desc" });
    // Force positioning via inline style WITH !important - highest priority
    panel.style.setProperty("position", "absolute", "important");
    panel.style.setProperty("bottom", "64px", "important");
    panel.style.setProperty("left", "14px", "important");
    panel.style.setProperty("top", "auto", "important"); // disable top
    panel.style.setProperty("right", "auto", "important"); // disable right
    panel.style.setProperty("z-index", "100", "important");
    panel.style.setProperty("height", "auto", "important");
    panel.style.setProperty("max-height", "none", "important");
    panel.style.setProperty("width", "260px", "important");

    // Header is FIRST in DOM (flex-direction:column, normal top-to-bottom)
    const header = panel.createDiv({ cls: "kg-cb-desc-header" });

    const infoSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    infoSvg.setAttribute("width", "13");
    infoSvg.setAttribute("height", "13");
    infoSvg.setAttribute("viewBox", "0 0 24 24");
    infoSvg.setAttribute("fill", "none");
    infoSvg.setAttribute("stroke", "currentColor");
    infoSvg.setAttribute("stroke-width", "2.5");
    const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    circle.setAttribute("cx", "12"); circle.setAttribute("cy", "12"); circle.setAttribute("r", "10");
    const line1 = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line1.setAttribute("x1", "12"); line1.setAttribute("y1", "8"); line1.setAttribute("x2", "12"); line1.setAttribute("y2", "12");
    const line2 = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line2.setAttribute("x1", "12"); line2.setAttribute("y1", "16"); line2.setAttribute("x2", "12.01"); line2.setAttribute("y2", "16");
    infoSvg.appendChild(circle); infoSvg.appendChild(line1); infoSvg.appendChild(line2);
    header.appendChild(infoSvg);

    header.createSpan({ text: "Description" });

    const chevronSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    chevronSvg.setAttribute("class", "kg-desc-toggle");
    chevronSvg.setAttribute("width", "13"); chevronSvg.setAttribute("height", "13");
    chevronSvg.setAttribute("viewBox", "0 0 24 24");
    chevronSvg.setAttribute("fill", "none");
    chevronSvg.setAttribute("stroke", "currentColor");
    chevronSvg.setAttribute("stroke-width", "2.5");
    const chevron = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
    chevron.setAttribute("points", "6 9 12 15 18 9");
    chevronSvg.appendChild(chevron);
    header.appendChild(chevronSvg);

    header.addEventListener("click", () => panel.classList.toggle("expanded"));

    // Body is AFTER header in DOM; flex-direction:column-reverse makes it appear above header visually
    const body = panel.createDiv({ cls: "kg-cb-desc-body" });
    const content = body.createDiv({ cls: "kg-desc-content" });
    void MarkdownRenderer.render(this.app, config.description ?? "", content, "", this.component);
  }

  // Drag resize handle
  private attachResizeHandle(
    handle: HTMLElement,
    canvas: HTMLElement,
    svg: SVGSVGElement,
    minH: number,
    maxH: number,
    saveHeight: (h: number) => Promise<void>,
  ) {
    const clamp = (v: number) => Math.min(maxH, Math.max(minH, v));

    let startY = 0;
    let startH = 0;

    handle.addEventListener("mousedown", (e) => {
      e.preventDefault();
      startY = e.clientY;
      startH = canvas.offsetHeight;

      const onMove = (ev: MouseEvent) => {
        const clamped = clamp(startH + (ev.clientY - startY));
        canvas.style.height = clamped + "px";
        svg.setAttribute("height", String(clamped));
        const syncFn = (handle as HTMLElement & { __syncInput?: (h: number) => void }).__syncInput;
        if (syncFn) syncFn(clamped);
      };

      const onUp = (ev: MouseEvent) => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        const finalH = clamp(startH + (ev.clientY - startY));
        canvas.style.height = finalH + "px";
        svg.setAttribute("height", String(finalH));
        const syncFn = (handle as HTMLElement & { __syncInput?: (h: number) => void }).__syncInput;
        if (syncFn) syncFn(finalH);
        void saveHeight(finalH);
      };

      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    });
  }

}

// Graph rendering core (independent class, no Obsidian API dependency)
// ============================================
class GraphRenderer {
  private d3: D3Instance;
  private svgEl: SVGSVGElement;
  private tooltipEl: HTMLElement;
  private config: GraphConfig;
  private theme: DiagramTheme;
  private g: D3Selection | null = null;
  private simulation: D3Simulation | null = null;
  private zoomBehavior: D3ZoomBehavior | null = null;
  private nodeElements: D3Selection | null = null;
  private linkElements: D3Selection | null = null;
  private linkLabelElements: D3Selection | null = null;
  private colorMap: Map<string, string> = new Map();
  private nodeStyleMap: Map<string, string> = new Map();
  private relationStyleMap: Map<string, string> = new Map();
  private showLabels = true;
  private hoveredNode: GraphNode | null = null;
  private hoveredLink: GraphLink | null = null;
  private isDragging = false;
  private arrowBaseUrl: string;
  private arrowUrl = "";
  private arrowHlUrl = "";
  private data: { nodes: GraphNode[]; links: GraphLink[] };
  // Position persistence
  private positionKey = "";
  private positionCallbacks: {
    onSave?: (key: string, positions: Record<string, { x: number; y: number }>) => void;
    onLoad?: (key: string) => Record<string, { x: number; y: number }> | undefined;
    onClear?: (key: string) => void;
  } = {};
  private savePositionsDebounced: (positions: Record<string, { x: number; y: number }>) => void;

  constructor(d3: D3Instance, svgEl: SVGSVGElement, tooltipEl: HTMLElement, config: GraphConfig, theme: DiagramTheme) {
    this.d3 = d3;
    this.svgEl = svgEl;
    this.tooltipEl = tooltipEl;
    this.config = config;
    this.theme = theme;
    this.arrowBaseUrl = window.location.href.split("#")[0];
    this.assignNodeStyles();
    this.assignColors();
    this.assignRelationStyles();
    this.data = this.processData();
    // Debounced save function
    this.savePositionsDebounced = debounce((positions: Record<string, { x: number; y: number }>) => {
      if (this.positionCallbacks.onSave && this.positionKey) {
        this.positionCallbacks.onSave(this.positionKey, positions);
      }
    }, 500);
  }

  setPositionCallbacks(
    onSave?: (key: string, positions: Record<string, { x: number; y: number }>) => void,
    onLoad?: (key: string) => Record<string, { x: number; y: number }> | undefined,
    onClear?: (key: string) => void
  ): void {
    this.positionCallbacks = { onSave, onLoad, onClear };
  }

  setPositionKey(key: string): void {
    this.positionKey = key;
  }

  getData() { return this.data; }

  async render() {
    try {
      // Load saved positions before rendering (must await since onLoad is async)
      if (this.positionCallbacks.onLoad && this.positionKey) {
        const savedPositions = await this.positionCallbacks.onLoad(this.positionKey);
        if (savedPositions && typeof savedPositions === 'object' && !Array.isArray(savedPositions)) {
          this.data.nodes.forEach((node) => {
            const pos = savedPositions[node.name];
            if (pos) {
              node.fx = pos.x;
              node.fy = pos.y;
              node.pinned = true;
            }
          });
        }
      }

      this.initSVG();
      this.renderGraph();

      setTimeout(() => this.fitView(), 100);
      setTimeout(() => this.fitView(), 1500);
      setTimeout(() => this.fitView(), 3000);
      setTimeout(() => this.fitView(), 5000);
    } catch (error) {
      console.error("[MermaidX Knowledge Graph] Failed to render graph:", error);
    }
  }

  restart() {
    // Clear saved positions on restart
    if (this.positionCallbacks.onClear && this.positionKey) {
      this.positionCallbacks.onClear(this.positionKey);
    }

    this.data = this.processData();
    this.data.nodes.forEach((node) => {
      node.pinned = false;
    });
    this.render();
  }

  destroy() {
    this.simulation?.stop();
  }

  onResize() {
    const wrap = this.svgEl.parentElement;
    if (!wrap) return;
    const w = wrap.clientWidth;
    const h = wrap.clientHeight;
    this.d3.select(this.svgEl).attr("width", w).attr("height", h);
    // Don't restart simulation on resize since nodes are pinned after layout stabilizes
  }

  setLabelsVisible(visible: boolean) {
    this.showLabels = visible;
    this.linkLabelElements?.style("opacity", visible ? 1 : 0);
  }

  // Node styles assignment
  private assignNodeStyles() {
    this.nodeStyleMap.clear();
    if (this.config.nodeStyles) {
      this.config.nodeStyles.forEach((style, nodeName) => {
        this.nodeStyleMap.set(nodeName, style.color);
      });
    }
  }

  // Color assignment - nodes get color from nodeStyles first, then relation styles, then fallback
  private assignColors() {
    this.colorMap.clear();
    
    // Priority 1: If nodeStyles is defined, use it directly
    if (this.config.nodeStyles && this.config.nodeStyles.size > 0) {
      this.config.nodeStyles.forEach((style, nodeName) => {
        this.colorMap.set(nodeName, style.color);
      });
      return;
    }
    
    // Priority 2: If relationStyles is defined, nodes get color from their relations
    if (this.config.relationStyles && this.config.relationStyles.size > 0) {
      this.config.triples.forEach((t) => {
        // Set color for subject node
        if (!this.colorMap.has(t.subject)) {
          const style = this.config.relationStyles!.get(t.predicate);
          if (style) {
            this.colorMap.set(t.subject, style.color);
          }
        }
        // Set color for object node
        if (!this.colorMap.has(t.object)) {
          const style = this.config.relationStyles!.get(t.predicate);
          if (style) {
            this.colorMap.set(t.object, style.color);
          }
        }
      });
      return;
    }
    
    // Priority 3: Fallback to nodeTypes
    if (this.config.nodeTypes && this.config.nodeTypes.length > 0) {
      let idx = 0;
      this.config.nodeTypes.forEach((t) => {
        if (!t.color) t.color = AUTO_COLOR_PALETTE[idx % AUTO_COLOR_PALETTE.length];
        idx++;
        (t.nodes || []).forEach((n) => this.colorMap.set(n, t.color!));
      });
    }
  }

  // Relation style assignment
  private assignRelationStyles() {
    this.relationStyleMap.clear();
    if (this.config.relationStyles) {
      this.config.relationStyles.forEach((style, relation) => {
        this.relationStyleMap.set(relation, style.color);
      });
    }
  }

  // Get link color based on relation style
  private getLinkColor(relation: string): string {
    return this.relationStyleMap.get(relation) ?? this.theme.kg.linkColor;
  }

  private getNodeColor(name: string): string {
    return this.colorMap.get(name) ?? this.config.defaultType?.color ?? this.theme.kg.fallbackNodeColor;
  }

  private getNodeTypeLabel(name: string): string {
    // Try to get label from nodeStyles first
    if (this.config.nodeStyles) {
      const style = this.config.nodeStyles.get(name);
      if (style?.label) return style.label;
    }
    
    // Try to get label from nodeTypes
    if (this.config.nodeTypes) {
      for (const t of this.config.nodeTypes) {
        if (t.nodes?.includes(name)) return t.label;
      }
    }
    
    // Try to infer from relation styles
    if (this.config.relationStyles && this.config.relationStyles.size > 0) {
      for (const t of this.config.triples) {
        if (t.subject === name || t.object === name) {
          const style = this.config.relationStyles.get(t.predicate);
          if (style?.label) return style.label;
        }
      }
    }
    
    return this.config.defaultType?.label ?? "Entity";
  }

  private getNodeSize(node: GraphNode): number {
    const deg = this.data.links.filter((l) => {
      const sid = nodeId(l.source);
      const tid = nodeId(l.target);
      return sid === node.id || tid === node.id;
    }).length;
    return Math.min(38, Math.max(18, 22 + deg * 2.5));
  }

  // Get half-width for rectangular/diamond/hexagon nodes based on text length
  private getNodeHalfWidth(d: GraphNode): number {
    const charWidth = 8; // approximate Chinese character width in px at 12px font
    const nameLen = d.name.length;
    return Math.max(30, (nameLen * charWidth) / 2 + 16);
  }

  // Get half-height for rectangular/diamond/hexagon nodes
  private getNodeHalfHeight(d: GraphNode): number {
    return 18;
  }

  // Get effective radius for link endpoint calculation (shape-aware)
  private getNodeRadius(d: GraphNode): number {
    const shape = d.shape || "circle";
    if (shape === "circle") {
      return this.getNodeSize(d);
    } else if (shape === "ellipse") {
      const rx = this.getNodeSize(d) + 8;
      const ry = (this.getNodeSize(d) + 8) * 0.7;
      // Approximate ellipse radius based on angle will be handled per-case
      return Math.max(rx, ry);
    } else {
      // For rect/diamond/hexagon, use a generous approximation
      return Math.max(this.getNodeHalfWidth(d), this.getNodeHalfHeight(d));
    }
  }

  // Data processing
  private processData() {
    const nodes = new Map<string, GraphNode>();
    const links: GraphLink[] = [];

    this.config.triples.forEach((t) => {
      const srcShape = this.config.nodeShapes?.get(t.subject);
      const tgtShape = this.config.nodeShapes?.get(t.object);
      if (!nodes.has(t.subject)) nodes.set(t.subject, { id: t.subject, name: t.subject, shape: srcShape });
      else if (srcShape && !nodes.get(t.subject)!.shape) nodes.get(t.subject)!.shape = srcShape;
      if (!nodes.has(t.object)) nodes.set(t.object, { id: t.object, name: t.object, shape: tgtShape });
      else if (tgtShape && !nodes.get(t.object)!.shape) nodes.get(t.object)!.shape = tgtShape;
      links.push({ source: t.subject, target: t.object, relation: t.predicate, animated: t.animated });
    });

    const pairCount = new Map<string, number>();
    const pairIndex = new Map<string, number>();
    links.forEach((l) => {
      const sid = nodeId(l.source);
      const tid = nodeId(l.target);
      const key = [sid, tid].sort().join("||");
      pairCount.set(key, (pairCount.get(key) || 0) + 1);
    });
    links.forEach((l) => {
      const sid = nodeId(l.source);
      const tid = nodeId(l.target);
      const key = [sid, tid].sort().join("||");
      const total = pairCount.get(key)!;
      const idx = pairIndex.get(key) || 0;
      pairIndex.set(key, idx + 1);
      l.totalLinks = total;
      l.linkIndex = idx;
      const sorted = [sid, tid].sort();
      l.isForwardDir = (sid === sorted[0]);
    });

    return { nodes: Array.from(nodes.values()), links };
  }

  // SVG initialization
  private initSVG() {
    const d3 = this.d3;
    const svg = d3.select(this.svgEl);
    svg.selectAll("*").remove();

    const wrap = this.svgEl.parentElement!;
    const w = wrap.clientWidth || 700;
    const h = wrap.clientHeight || 420;
    svg.attr("width", w).attr("height", h);

    this.zoomBehavior = d3.zoom()
      .scaleExtent([0.08, 6])
      .on("zoom", (event: D3ZoomEvent) => this.g?.attr("transform", event.transform));

    svg.call(this.zoomBehavior).on("dblclick.zoom", null);
    this.g = svg.append("g");

    const defs = svg.append("defs");
    const arrowId = `kg-arrow-${this.config.id}`;
    const arrowHlId = `kg-arrow-hl-${this.config.id}`;
    this.appendArrow(defs, arrowId, this.theme.kg.arrowColor, 7, 6);
    this.appendArrow(defs, arrowHlId, this.theme.kg.arrowHighlightColor, 8, 6);
    this.arrowUrl = `${this.arrowBaseUrl}#${arrowId}`;
    this.arrowHlUrl = `${this.arrowBaseUrl}#${arrowHlId}`;
  }

  private appendArrow(defs: D3Selection, id: string, fill: string, size: number, refX: number) {
    defs.append("marker")
      .attr("id", id)
      .attr("viewBox", "0 -4 8 8")
      .attr("refX", refX).attr("refY", 0)
      .attr("orient", "auto")
      .attr("markerWidth", size).attr("markerHeight", size)
      .append("path")
      .attr("d", "M 0,-3.5 L 7,0 L 0,3.5 Z")
      .attr("fill", fill);
  }

  // Render graph
  private renderGraph() {
    const d3 = this.d3;
    const { nodes, links } = this.data;

    if (this.simulation) this.simulation.stop();

    const wrap = this.svgEl.parentElement!;
    const W = wrap.clientWidth || 700;
    const H = wrap.clientHeight || 420;

    const initPadding = 100;
    const centerX = W / 2;
    const centerY = H / 2;
    const safeRadius = 40;
    const safeMinX = initPadding + safeRadius;
    const safeMaxX = W - initPadding - safeRadius;
    const safeMinY = initPadding + safeRadius;
    const safeMaxY = H - initPadding - safeRadius;

    nodes.forEach((node: GraphNode) => {
      if (!node.pinned && node.fx === null && node.fy === null) {
        const spreadX = (safeMaxX - safeMinX) * 0.5;
        const spreadY = (safeMaxY - safeMinY) * 0.5;
        node.x = centerX + (Math.random() - 0.5) * spreadX;
        node.y = centerY + (Math.random() - 0.5) * spreadY;
        node.x = Math.max(safeMinX, Math.min(safeMaxX, node.x));
        node.y = Math.max(safeMinY, Math.min(safeMaxY, node.y));
        node.vx = 0;
        node.vy = 0;
      }
    });

    const nodeCount = nodes.length;
    const area = W * H;
    const padding = 50;

    // --- Adaptive layout parameters ---
    // Link distance: how long edges want to be (longer = more spread out)
    const optimalLinkDist = Math.min(
      Math.max(100, Math.sqrt(area / nodeCount) * 0.75),
      250
    );
    const linkDist = nodeCount > 30 ? optimalLinkDist * 0.8 : optimalLinkDist;

    // Charge strength: repulsion between all nodes (stronger = more spread out)
    // Use theta-based scaling: larger area needs stronger charge
    const baseCharge = Math.min(-300, -Math.sqrt(area / 3));
    const chargeStr = nodeCount > 30 ? baseCharge * 0.75 : baseCharge;
    const chargeDistMax = Math.max(400, Math.sqrt(area) * 0.6);

    // Collision radius: minimum gap between nodes (larger = more breathing room)
    const collisionPadding = nodeCount > 20 ? 18 : 24;

    // Center gravity: weaker = nodes can spread further from center
    const centerStrength = nodeCount > 30 ? 0.06 : 0.04;

    // Position distribution: weaker = less compression toward center
    const posStrength = nodeCount > 30 ? 0.03 : 0.02;

    // Link strength: how strictly edges enforce their target distance
    // Lower = nodes have more freedom to spread out
    const linkStrength = nodeCount > 20 ? 0.5 : 0.6;

    function boundaryForce(alpha: number) {
      for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        if (node.pinned || node.fx !== null || node.fy !== null) continue;
        const radius = 40;
        const minX = padding + radius;
        const maxX = W - padding - radius;
        const minY = padding + radius;
        const maxY = H - padding - radius;
        if (node.x !== undefined && node.x < minX) {
          const distance = minX - node.x;
          node.vx = (node.vx || 0) + distance * alpha * 20;
          if ((node.vx || 0) < 0) node.vx! *= -0.3;
        }
        if (node.x !== undefined && node.x > maxX) {
          const distance = node.x - maxX;
          node.vx = (node.vx || 0) - distance * alpha * 20;
          if ((node.vx || 0) > 0) node.vx! *= -0.3;
        }
        if (node.y !== undefined && node.y < minY) {
          const distance = minY - node.y;
          node.vy = (node.vy || 0) + distance * alpha * 20;
          if ((node.vy || 0) < 0) node.vy! *= -0.3;
        }
        if (node.y !== undefined && node.y > maxY) {
          const distance = node.y - maxY;
          node.vy = (node.vy || 0) - distance * alpha * 20;
          if ((node.vy || 0) > 0) node.vy! *= -0.3;
        }
      }
    }

    this.simulation = d3.forceSimulation(nodes)
      .force("link", d3.forceLink(links).id((d: GraphNode) => d.id).distance(linkDist).strength(linkStrength))
      .force("charge", d3.forceManyBody().strength(chargeStr).distanceMax(chargeDistMax))
      .force("center", d3.forceCenter(W / 2, H / 2).strength(centerStrength))
      .force("collision", d3.forceCollide().radius((d: GraphNode) => this.getNodeSize(d) + collisionPadding).strength(1.0))
      .force("x", d3.forceX(W / 2).strength(posStrength))
      .force("y", d3.forceY(H / 2).strength(posStrength))
      .force("boundary", boundaryForce as unknown)
      .alphaDecay(0.04)
      .velocityDecay(0.5)
      .on("end", () => this.onSimulationEnd());

    // Edges
    this.linkElements = this.g!.append("g").attr("class", "kg-links-layer")
      .selectAll("path").data(links).enter().append("path")
      .attr("class", (d: GraphLink) => `kg-link${d.animated ? " kg-link-animated" : ""}`)
      .attr("stroke", (d: GraphLink) => this.isLoop(d) ? this.theme.kg.loopColor : this.getLinkColor(d.relation))
      .attr("stroke-width", (d: GraphLink) => this.isLoop(d) ? 2.5 : 1.8)
      .attr("stroke-dasharray", (d: GraphLink) => d.animated ? "8 4" : null)
      .attr("fill", "none")
      .attr("marker-end", (d: GraphLink) => this.isLoop(d) ? "" : `url(${this.arrowUrl})`)
      .on("mouseover", (event: MouseEvent, d: GraphLink) => { this.hoveredLink = d; this.hoveredNode = null; this.applyLinkHover(d); void event; })
      .on("mouseout", () => this.handleMouseOut());

    // Edge labels
    const llGroup = this.g!.append("g").attr("class", "kg-link-labels-layer");
    const llGs = llGroup.selectAll("g").data(links).enter().append("g")
      .attr("class", "kg-link-label-g")
      .style("pointer-events", "none")
      .style("opacity", this.showLabels ? 1 : 0);
    llGs.append("rect").attr("class", "kg-link-label-bg")
      .attr("rx", 3).attr("ry", 3)
      .attr("fill", this.theme.kg.linkLabelBg).attr("stroke", this.theme.kg.linkLabelBorder).attr("stroke-width", 0.5);
    llGs.append("text").attr("class", "kg-link-label")
      .attr("text-anchor", "middle").attr("dominant-baseline", "middle")
      .text((d: GraphLink) => d.relation);
    this.linkLabelElements = llGs;

    // Nodes
    const dragBehavior: D3DragBehavior = d3.drag()
      .on("start", (event: D3DragEvent, d: GraphNode) => this.dragStart(event, d))
      .on("drag", (e: D3DragEvent, d: GraphNode) => { d.fx = e.x; d.fy = e.y; })
      .on("end", (e: D3DragEvent, d: GraphNode) => this.dragEnd(e, d));

    this.nodeElements = this.g!.append("g").attr("class", "kg-nodes-layer")
      .selectAll("g").data(nodes).enter().append("g")
      .attr("class", "kg-node")
      .call(dragBehavior)
      .on("mouseover", (event: MouseEvent, d: GraphNode) => this.handleNodeOver(event, d))
      .on("mouseout", () => this.handleMouseOut())
      .on("click", (event: MouseEvent, d: GraphNode) => this.handleNodeClick(event, d));

    // Glow (shape-aware)
    this.nodeElements.each((d: GraphNode, i: number, nodes: Element[]) => {
      const nodeGroup = this.d3.select(nodes[i]);
      const shape = d.shape || "circle";
      const color = this.getNodeColor(d.name);
      const r = this.getNodeSize(d);

      if (shape === "circle" || shape === "ellipse") {
        nodeGroup.append("ellipse").attr("class", "kg-node-glow")
          .attr("rx", r + 8).attr("ry", shape === "ellipse" ? (r + 8) * 0.7 : r + 8)
          .attr("fill", color).attr("opacity", 0.12).attr("pointer-events", "none");
      } else {
        // rect, roundrect, diamond, hexagon - use rect glow
        const hw = this.getNodeHalfWidth(d);
        const hh = this.getNodeHalfHeight(d);
        const glowPad = 8;
        nodeGroup.append("rect").attr("class", "kg-node-glow")
          .attr("x", -hw - glowPad).attr("y", -hh - glowPad)
          .attr("width", (hw + glowPad) * 2).attr("height", (hh + glowPad) * 2)
          .attr("rx", shape === "roundrect" ? 10 : 4).attr("ry", shape === "roundrect" ? 10 : 4)
          .attr("fill", color).attr("opacity", 0.12).attr("pointer-events", "none");
      }
    });

    // Main node shape (shape-aware)
    this.nodeElements.each((d: GraphNode, i: number, nodes: Element[]) => {
      const nodeGroup = this.d3.select(nodes[i]);
      const shape = d.shape || "circle";
      const color = this.getNodeColor(d.name);
      const r = this.getNodeSize(d);

      if (shape === "circle") {
        nodeGroup.append("circle").attr("class", "kg-node-body")
          .attr("r", r)
          .attr("fill", color).attr("stroke", color)
          .attr("stroke-width", 2.5).attr("stroke-opacity", 0.6);
      } else if (shape === "ellipse") {
        const rx = r + 8;
        const ry = (r + 8) * 0.7;
        nodeGroup.append("ellipse").attr("class", "kg-node-body")
          .attr("rx", rx).attr("ry", ry)
          .attr("fill", color).attr("stroke", color)
          .attr("stroke-width", 2.5).attr("stroke-opacity", 0.6);
      } else if (shape === "rect") {
        const hw = this.getNodeHalfWidth(d);
        const hh = this.getNodeHalfHeight(d);
        nodeGroup.append("rect").attr("class", "kg-node-body")
          .attr("x", -hw).attr("y", -hh).attr("width", hw * 2).attr("height", hh * 2)
          .attr("fill", color).attr("stroke", color)
          .attr("stroke-width", 2.5).attr("stroke-opacity", 0.6);
      } else if (shape === "roundrect") {
        const hw = this.getNodeHalfWidth(d);
        const hh = this.getNodeHalfHeight(d);
        nodeGroup.append("rect").attr("class", "kg-node-body")
          .attr("x", -hw).attr("y", -hh).attr("width", hw * 2).attr("height", hh * 2)
          .attr("rx", 8).attr("ry", 8)
          .attr("fill", color).attr("stroke", color)
          .attr("stroke-width", 2.5).attr("stroke-opacity", 0.6);
      } else if (shape === "diamond") {
        const hw = this.getNodeHalfWidth(d);
        const hh = this.getNodeHalfHeight(d);
        const points = `0,${-hh} ${hw},0 0,${hh} ${-hw},0`;
        nodeGroup.append("polygon").attr("class", "kg-node-body")
          .attr("points", points)
          .attr("fill", color).attr("stroke", color)
          .attr("stroke-width", 2.5).attr("stroke-opacity", 0.6);
      } else if (shape === "hexagon") {
        const hw = this.getNodeHalfWidth(d);
        const hh = this.getNodeHalfHeight(d);
        const inset = hw * 0.3;
        const points = `${-hw + inset},${-hh} ${hw - inset},${-hh} ${hw},0 ${hw - inset},${hh} ${-hw + inset},${hh} ${-hw},0`;
        nodeGroup.append("polygon").attr("class", "kg-node-body")
          .attr("points", points)
          .attr("fill", color).attr("stroke", color)
          .attr("stroke-width", 2.5).attr("stroke-opacity", 0.6);
      }
    });

    // Text stroke layer
    this.nodeElements.append("text").attr("class", "kg-node-text-stroke")
      .attr("text-anchor", "middle").attr("dy", "0.35em")
      .text((d: GraphNode) => d.name.length > 8 ? d.name.slice(0, 7) + "…" : d.name)
      .style("fill", "none")
      .style("stroke", (d: GraphNode) => this.getNodeColor(d.name))
      .style("stroke-width", "3px").style("stroke-opacity", "0.5")
      .style("font-size", (d: GraphNode) => this.getNodeSize(d) > 30 ? "13px" : "12px")
      .style("pointer-events", "none");

    // Text body layer
    this.nodeElements.append("text").attr("class", "kg-node-text")
      .attr("text-anchor", "middle").attr("dy", "0.35em")
      .text((d: GraphNode) => d.name.length > 8 ? d.name.slice(0, 7) + "…" : d.name)
      .style("fill", this.theme.kg.nodeTextFill)
      .style("font-size", (d: GraphNode) => this.getNodeSize(d) > 30 ? "13px" : "12px")
      .style("pointer-events", "none");

    this.simulation.on("tick", () => this.onTick());
  }

  // Auto-pin all nodes when simulation ends naturally (layout is stable)
  private onSimulationEnd() {
    // Only auto-pin if simulation ended on its own (alpha < threshold)
    // Don't interfere with user-initiated actions like drag
    const positions: Record<string, { x: number; y: number }> = {};
    this.data.nodes.forEach((node) => {
      if (!node.pinned) {
        // Pin the node at its current position
        node.fx = node.x;
        node.fy = node.y;
        node.pinned = true;
      }
      if (node.fx != null && node.fy != null) {
        positions[node.name] = { x: node.fx, y: node.fy };
      }
    });
    // Update visual: add pinned stroke style to all nodes
    this.nodeElements?.select(".kg-node-body")
      .attr("stroke-width", 3)
      .attr("stroke-dasharray", "5 3");
    // Save positions
    if (this.positionCallbacks.onSave && this.positionKey) {
      this.positionCallbacks.onSave(this.positionKey, positions);
    }
  }

  // Tick
  private onTick() {
    const wrap = this.svgEl.parentElement;
    if (wrap) {
      const W = wrap.clientWidth;
      const H = wrap.clientHeight;
      const padding = 80;

      this.data.nodes.forEach((d: GraphNode) => {
        if (!d.pinned && d.fx === null && d.fy === null) {
          const radius = this.getNodeRadius(d) + 20;
          if (d.x !== undefined && d.y !== undefined) {
            const minX = padding + radius;
            const maxX = W - padding - radius;
            const minY = padding + radius;
            const maxY = H - padding - radius;
            d.x = Math.max(minX, Math.min(maxX, d.x));
            d.y = Math.max(minY, Math.min(maxY, d.y));
            if (d.vx !== undefined) {
              if (d.x <= minX || d.x >= maxX) d.vx *= -0.15;
            }
            if (d.vy !== undefined) {
              if (d.y <= minY || d.y >= maxY) d.vy *= -0.15;
            }
            if (d.vx !== undefined && (d.x <= minX || d.x >= maxX)) {
              d.vx! *= 0.5;
            }
            if (d.vy !== undefined && (d.y <= minY || d.y >= maxY)) {
              d.vy! *= 0.5;
            }
          }
        }
      });
    }

    this.linkElements?.each((d: GraphNode, i: number, nodes: Element[]) => {
      this.d3.select(nodes[i]).attr("d", this.computePath(d as unknown as GraphLink));
    });

    this.linkLabelElements?.each((d: GraphNode, i: number, nodes: Element[]) => {
      const mid = this.computeMidpoint(d as unknown as GraphLink);
      const labelG = this.d3.select(nodes[i]);
      labelG.attr("transform", `translate(${mid.x},${mid.y})`);
      const textEl = nodes[i].querySelector("text");
      if (textEl) {
        try {
          const b = textEl.getBBox();
          const px = 4, py = 2;
          labelG.select("rect")
            .attr("x", b.x - px).attr("y", b.y - py)
            .attr("width", b.width + px * 2).attr("height", b.height + py * 2);
        } catch (err) {
          void err;
        }
      }
    });

    this.nodeElements?.attr("transform", (d: GraphNode) => `translate(${d.x},${d.y})`);
  }

  // Path calculation
  private isLoop(d: GraphLink): boolean {
    return nodeId(d.source) === nodeId(d.target);
  }

  private computePath(d: GraphLink): string {
    if (this.isLoop(d)) {
      const r = this.getNodeRadius(d.source as GraphNode);
      const lr = r + 25 + (d.linkIndex || 0) * 10;
      const x = (d.source as GraphNode).x!, y = (d.source as GraphNode).y!;
      const sa = -Math.PI / 12, ea = -Math.PI / 2;
      const x1 = x + Math.cos(sa) * r, y1 = y + Math.sin(sa) * r;
      const x2 = x + Math.cos(ea) * r, y2 = y + Math.sin(ea) * r;
      const cx = x + Math.cos(sa) * lr * 1.8, cy = y + Math.sin(sa) * lr * 1.8;
      return `M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`;
    }
    const src = d.source as GraphNode, tgt = d.target as GraphNode;
    const sx = src.x!, sy = src.y!, tx = tgt.x!, ty = tgt.y!;
    const dx = tx - sx, dy = ty - sy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 1) return "";
    const sr = this.getNodeRadius(src), tr = this.getNodeRadius(tgt);
    const ux = dx / dist, uy = dy / dist;
    const x1 = sx + ux * (sr + 2), y1 = sy + uy * (sr + 2);
    const x2 = tx - ux * (tr + 7), y2 = ty - uy * (tr + 7);
    if (d.totalLinks === 1) return `M ${x1} ${y1} L ${x2} ${y2}`;
    const curv = Math.min(60, Math.max(30, dist * 0.18));
    const offset = (d.linkIndex! - (d.totalLinks! - 1) / 2) * curv;
    const nx = -uy, ny = ux;
    const sign = d.isForwardDir ? 1 : -1;
    const mx = (x1 + x2) / 2 + nx * offset * sign;
    const my = (y1 + y2) / 2 + ny * offset * sign;
    return `M ${x1} ${y1} Q ${mx} ${my} ${x2} ${y2}`;
  }

  private computeMidpoint(d: GraphLink) {
    if (this.isLoop(d)) {
      const r = this.getNodeRadius(d.source as GraphNode);
      const lr = r + 25 + (d.linkIndex || 0) * 10;
      const sa = -Math.PI / 12, la = sa - Math.PI / 24;
      const src = d.source as GraphNode;
      return { x: src.x! + Math.cos(la) * lr * 1.5, y: src.y! + Math.sin(la) * lr * 1.5 };
    }
    const src = d.source as GraphNode, tgt = d.target as GraphNode;
    const sx = src.x!, sy = src.y!, tx = tgt.x!, ty = tgt.y!;
    const dx = tx - sx, dy = ty - sy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 1) return { x: sx, y: sy };
    if (d.totalLinks === 1) return { x: (sx + tx) / 2, y: (sy + ty) / 2 };
    const ux = dx / dist, uy = dy / dist;
    const sr = this.getNodeRadius(src), tr = this.getNodeRadius(tgt);
    const x1 = sx + ux * (sr + 2), y1 = sy + uy * (sr + 2);
    const x2 = tx - ux * (tr + 7), y2 = ty - uy * (tr + 7);
    const curv = Math.min(60, Math.max(30, dist * 0.18));
    const offset = (d.linkIndex! - (d.totalLinks! - 1) / 2) * curv;
    const nx = -uy, ny = ux;
    const sign = d.isForwardDir ? 1 : -1;
    const cx = (x1 + x2) / 2 + nx * offset * sign;
    const cy = (y1 + y2) / 2 + ny * offset * sign;
    return { x: 0.25 * x1 + 0.5 * cx + 0.25 * x2, y: 0.25 * y1 + 0.5 * cy + 0.25 * y2 };
  }

  // Drag
  private dragStart(event: D3DragEvent, d: GraphNode) {
    this.isDragging = true;
    if (!event.active) this.simulation?.alphaTarget(0.25).restart();
    d.fx = d.x; d.fy = d.y;
  }

  private dragEnd(e: D3DragEvent, d: GraphNode) {
    d.pinned = true;
    if (!e.active) this.simulation?.alphaTarget(0);
    setTimeout(() => { this.isDragging = false; }, 100);

    this.nodeElements?.each((node: GraphNode, i: number, nodes: Element[]) => {
      if (node.name === d.name) {
        const nodeGroup = this.d3.select(nodes[i]);
        nodeGroup.select(".kg-node-body")
          .attr("stroke-width", 3.5)
          .attr("stroke-dasharray", null);
      }
    });

    // Save positions after drag ends (debounced)
    const positions: Record<string, { x: number; y: number }> = {};
    this.data.nodes.forEach((node) => {
      if (node.pinned && node.fx != null && node.fy != null) {
        positions[node.name] = { x: node.fx!, y: node.fy! };
      }
    });
    this.savePositionsDebounced(positions);
  }

  // Mouse events
  private handleNodeOver(event: MouseEvent, d: GraphNode) {
    if (this.isDragging) return;
    this.hoveredNode = d; this.hoveredLink = null;

    const conns = this.data.links.filter((l) => {
      const sid = nodeId(l.source);
      const tid = nodeId(l.target);
      return sid === d.id || tid === d.id;
    }).length;

    this.tooltipEl.empty();
    this.tooltipEl.createEl("strong", { text: d.name });
    this.tooltipEl.createDiv({
      cls: "kg-tt-type",
      text: `${this.getNodeTypeLabel(d.name)} · ${conns} connections${d.pinned ? " · 📌 Pinned" : ""}`,
    });

    const container = this.tooltipEl.offsetParent as HTMLElement ?? this.tooltipEl.parentElement!;
    const containerRect = container.getBoundingClientRect();
    const GAP = 14;

    let left = event.clientX - containerRect.left + GAP;
    let top = event.clientY - containerRect.top - 10;

    this.tooltipEl.style.left = left + "px";
    this.tooltipEl.style.top = top + "px";
    this.tooltipEl.classList.add("measuring");

    const ttW = this.tooltipEl.offsetWidth;
    const ttH = this.tooltipEl.offsetHeight;
    const cW = container.clientWidth;
    const cH = container.clientHeight;

    if (left + ttW > cW - 8) {
      left = event.clientX - containerRect.left - ttW - GAP;
    }
    if (top + ttH > cH - 8) {
      top = event.clientY - containerRect.top - ttH - GAP;
    }
    left = Math.max(4, Math.min(left, cW - ttW - 4));
    top = Math.max(4, Math.min(top, cH - ttH - 4));

    this.tooltipEl.style.left = left + "px";
    this.tooltipEl.style.top = top + "px";
    this.tooltipEl.classList.remove("measuring");
    this.tooltipEl.classList.add("visible");

    this.applyNodeHover(d);
  }

  private handleMouseOut() {
    if (this.isDragging) return;
    this.hoveredNode = null; this.hoveredLink = null;
    this.tooltipEl.classList.remove("visible");

    this.linkElements
      ?.attr("stroke", (d: GraphLink) => this.isLoop(d) ? this.theme.kg.loopColor : this.getLinkColor(d.relation))
      .attr("stroke-opacity", 0.55)
      .attr("stroke-width", (d: GraphLink) => this.isLoop(d) ? 2.5 : 1.8)
      .attr("stroke-dasharray", (d: GraphLink) => d.animated ? "8 4" : null)
      .attr("marker-end", (d: GraphLink) => this.isLoop(d) ? "" : `url(${this.arrowUrl})`);

    this.nodeElements?.style("opacity", 1).select(".kg-node-body").attr("stroke-width", 2.5);
    if (this.showLabels) this.linkLabelElements?.style("opacity", 1);
  }

  private handleNodeClick(event: MouseEvent, d: GraphNode) {
    if (event.defaultPrevented) return;
    if (d.pinned) {
      d.pinned = false; d.fx = null; d.fy = null;
      this.d3.select((event.target as Element).closest(".kg-node")!)
        .classed("kg-pinned", false).select(".kg-node-body")
        .attr("stroke-width", 2.5)
        .attr("stroke-dasharray", null);
      this.simulation?.alpha(0.3).restart();
    } else {
      d.pinned = true; d.fx = d.x; d.fy = d.y;
      this.d3.select((event.target as Element).closest(".kg-node")!)
        .classed("kg-pinned", true).select(".kg-node-body")
        .attr("stroke-width", 3.5)
        .attr("stroke-dasharray", null);
    }
  }

  // Highlight
  private isConnected(link: GraphLink, node: GraphNode): boolean {
    return nodeId(link.source) === node.id || nodeId(link.target) === node.id;
  }

  private isNeighbor(n: GraphNode, d: GraphNode): boolean {
    return !!this.data.links.some((l) => {
      const sid = nodeId(l.source);
      const tid = nodeId(l.target);
      return (sid === d.id && tid === n.id) || (tid === d.id && sid === n.id);
    });
  }

  private applyNodeHover(d: GraphNode) {
    this.linkElements
      ?.attr("stroke", (l: GraphLink) => {
        if (this.isLoop(l)) return this.isConnected(l, d) ? this.theme.kg.loopColor : this.theme.kg.loopDimColor;
        return this.isConnected(l, d) ? this.getLinkColor(l.relation) : this.theme.kg.linkDimColor;
      })
      .attr("stroke-opacity", (l: GraphLink) => this.isConnected(l, d) ? 0.8 : 0.2)
      .attr("stroke-width", (l: GraphLink) => this.isConnected(l, d) ? 2.5 : 1.5)
      .attr("stroke-dasharray", (l: GraphLink) => {
        if (!l.animated) return null;
        return this.isConnected(l, d) ? "8 4" : "4 4";
      })
      .attr("marker-end", (l: GraphLink) => {
        if (this.isLoop(l)) return "";
        return this.isConnected(l, d) ? `url(${this.arrowHlUrl})` : `url(${this.arrowUrl})`;
      });

    this.nodeElements?.each((n: GraphNode, i: number, nodes: Element[]) => {
      const related = n.id === d.id || this.isNeighbor(n, d);
      this.d3.select(nodes[i]).style("opacity", related ? 1 : 0.3)
        .select(".kg-node-body").attr("stroke-width", n.id === d.id ? 4 : 2.5);
    });

    this.linkLabelElements?.each((l: GraphLink, i: number, nodes: Element[]) => {
      this.d3.select(nodes[i]).style("opacity",
        this.showLabels && this.isConnected(l, d) ? 1 : 0.15);
    });
  }

  private applyLinkHover(d: GraphLink) {
    this.linkElements
      ?.attr("stroke", (l: GraphLink) => {
        if (this.isLoop(l)) return l === d ? this.theme.kg.loopColor : this.theme.kg.loopDimColor;
        return l === d ? this.getLinkColor(l.relation) : this.theme.kg.linkDimColor;
      })
      .attr("stroke-opacity", (l: GraphLink) => l === d ? 1 : 0.2)
      .attr("stroke-width", (l: GraphLink) => l === d ? 2.8 : 1.5)
      .attr("stroke-dasharray", (l: GraphLink) => {
        if (!l.animated) return null;
        return l === d ? "8 4" : "4 4";
      })
      .attr("marker-end", (l: GraphLink) => {
        if (this.isLoop(l)) return "";
        return l === d ? `url(${this.arrowHlUrl})` : `url(${this.arrowUrl})`;
      });

    this.nodeElements?.each((n: GraphNode, i: number, nodes: Element[]) => {
      const sid = nodeId(d.source);
      const tid = nodeId(d.target);
      const rel = n.id === sid || n.id === tid;
      this.d3.select(nodes[i]).style("opacity", rel ? 1 : 0.25)
        .select(".kg-node-body").attr("stroke-width", rel ? 4 : 2.5);
    });

    this.linkLabelElements?.each((l: GraphLink, i: number, nodes: Element[]) => {
      this.d3.select(nodes[i]).style("opacity", this.showLabels && l === d ? 1 : 0.1);
    });
  }

  // Legend filter: gray out nodes/links not belonging to the selected legend label
  // label=null means clear filter (show all)
  filterByLegend(label: string | null, _color: string | null) {
    if (!label) {
      // Restore everything
      this.nodeElements?.style("opacity", 1).select(".kg-node-body").attr("stroke-width", 2.5);
      this.linkElements
        ?.attr("stroke", (d: GraphLink) => this.isLoop(d) ? this.theme.kg.loopColor : this.getLinkColor(d.relation))
        .attr("stroke-opacity", 0.55)
        .attr("stroke-width", (d: GraphLink) => this.isLoop(d) ? 2.5 : 1.8)
        .attr("stroke-dasharray", (d: GraphLink) => d.animated ? "8 4" : null)
        .attr("marker-end", (d: GraphLink) => this.isLoop(d) ? "" : `url(${this.arrowUrl})`);
      if (this.showLabels) this.linkLabelElements?.style("opacity", 1);
      return;
    }

    // Determine which nodes belong to this legend label
    // Strategy: nodeStyles map — find nodes whose style label matches
    //           relationStyles map — find nodes connected by a relation whose style label matches
    const matchedNodes = new Set<string>();

    if (this.config.nodeStyles && this.config.nodeStyles.size > 0) {
      // nodeStyles mode: nodes whose style.label (or nodeName if no label) === label
      this.config.nodeStyles.forEach((style, nodeName) => {
        const displayLabel = style.label || nodeName;
        if (displayLabel === label) {
          matchedNodes.add(nodeName);
        }
      });
    } else if (this.config.relationStyles && this.config.relationStyles.size > 0) {
      // relationStyles mode: collect all nodes connected by relations whose style label matches
      this.config.relationStyles.forEach((style, relation) => {
        const displayLabel = style.label || relation;
        if (displayLabel === label) {
          this.config.triples.forEach((t) => {
            if (t.predicate === relation) {
              matchedNodes.add(t.subject);
              matchedNodes.add(t.object);
            }
          });
        }
      });
    }

    // Apply opacity
    this.nodeElements?.each((d: GraphNode, i: number, nodes: Element[]) => {
      const inGroup = matchedNodes.has(d.name);
      this.d3.select(nodes[i]).style("opacity", inGroup ? 1 : 0.12);
    });

    this.linkElements?.each((d: GraphLink, i: number, nodes: Element[]) => {
      const sid = nodeId(d.source);
      const tid = nodeId(d.target);
      // Both endpoints must be in matched set for link to stay visible
      const inGroup = matchedNodes.has(sid) && matchedNodes.has(tid);
      this.d3.select(nodes[i])
        .attr("stroke-opacity", inGroup ? 0.7 : 0.08)
        .attr("stroke-width", inGroup ? 1.8 : 1);
    });

    this.linkLabelElements?.each((d: GraphLink, i: number, nodes: Element[]) => {
      const sid = nodeId(d.source);
      const tid = nodeId(d.target);
      // Both endpoints must be in matched set for label to stay visible
      const inGroup = matchedNodes.has(sid) && matchedNodes.has(tid);
      this.d3.select(nodes[i]).style("opacity", this.showLabels && inGroup ? 1 : 0.05);
    });
  }

  // View control
  fitView() {
    if (!this.data.nodes.length || !this.d3 || !this.svgEl) return;
    const wrap = this.svgEl.parentElement!;
    const W = wrap.clientWidth, H = wrap.clientHeight;
    const pad = 60;
    const xs = this.data.nodes.map((n) => n.x!).filter((v) => v != null);
    const ys = this.data.nodes.map((n) => n.y!).filter((v) => v != null);
    if (!xs.length) return;
    const minX = Math.min(...xs) - pad, maxX = Math.max(...xs) + pad;
    const minY = Math.min(...ys) - pad, maxY = Math.max(...ys) + pad;
    const scale = Math.min(W / (maxX - minX), H / (maxY - minY), 1.5);
    const tx = W / 2 - scale * (minX + maxX) / 2;
    const ty = H / 2 - scale * (minY + maxY) / 2;
    this.d3.select(this.svgEl).transition().duration(600).ease(this.d3.easeCubicOut)
      .call(this.zoomBehavior!.transform, this.d3.zoomIdentity.translate(tx, ty).scale(scale));
  }
}

// ============================================
// Utility: Compute string hash (djb2 algorithm)
// ============================================
function computeHash(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 33) ^ str.charCodeAt(i);
  }
  return hash >>> 0;
}

// ============================================
// Utility: Generate stable position key
// Key format: sourcePath::hash
// Hash is computed from core content (triples + nodeStyles) only
// ============================================
function generatePositionKey(sourcePath: string, config: GraphConfig): string {
  // Normalize core content for stable hash
  const parts: string[] = [];
  config.triples.forEach((t) => {
    parts.push(`${t.subject},${t.predicate},${t.object}`);
  });
  // Include node styles for stability
  if (config.nodeStyles && config.nodeStyles.size > 0) {
    const sorted = Array.from(config.nodeStyles.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    sorted.forEach(([name, style]) => {
      parts.push(`@style:${name}:${style.color}:${style.label || ""}`);
    });
  }
  const normalized = parts.join("|");
  const hash = computeHash(normalized);
  return `${sourcePath}::${hash.toString(16)}`;
}
