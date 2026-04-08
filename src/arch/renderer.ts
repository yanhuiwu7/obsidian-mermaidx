import { ArchDiagramData, ArchLayer, ArchGroup, ArchNode, type ArchLink } from './types';
import { getTheme, getAvailableThemes, getThemeLabel, type DiagramTheme } from '../common/themes';

// Extended container interface for storing arch diagram data
interface ArchContainer extends HTMLElement {
  __archData?: ArchDiagramData;
  __archChild?: ArchDiagramChild;
}

/**
 * Render architecture diagram to container
 */
export function renderArchDiagram(
  container: HTMLElement,
  data: ArchDiagramData,
  themeName?: string | null,
  _onThemeChange?: (themeName: string) => void
): void {
  const archContainer = container as ArchContainer;
  
  // Create wrapper
  container.addClass('arch-wrap');
  
  // Store data for later use
  archContainer.__archData = data;
  
  // Theme
  let currentTheme = getTheme(themeName);
  
  // Create toolbar
  const toolbar = container.createDiv({ cls: 'arch-toolbar' });
  
  const title = toolbar.createDiv({ cls: 'arch-title' });
  title.textContent = data.frontmatter.title || 'Architecture Diagram';
  
  const btnRow = toolbar.createDiv({ cls: 'arch-btn-row' });
  
  // Theme selector
  const themeSelect = btnRow.createEl('select', { cls: 'arch-theme-select' });
  for (const name of getAvailableThemes()) {
    const opt = themeSelect.createEl('option', { value: name, text: getThemeLabel(name) });
    if (name === currentTheme.name) opt.selected = true;
  }
  themeSelect.addEventListener('change', () => {
    currentTheme = getTheme(themeSelect.value);
    // Update child's theme so MutationObserver redraws use the new theme
    archContainer.__archChild?.setTheme(currentTheme);
    // Temporarily pause MutationObserver to avoid cascading redraws from style changes
    archContainer.__archChild?.pauseObserver();
    // Apply theme to all nodes/layers/groups via !important inline styles
    const diagramContent = container.querySelector('.arch-diagram-content') as HTMLElement;
    if (diagramContent) {
      applyThemeClasses(diagramContent, currentTheme, data.nodeStyles);
    }
    // Resume observer and force a single redraw with the new theme
    archContainer.__archChild?.resumeObserver();
    archContainer.__archChild?.forceRedraw();
    // Note: intentionally NOT calling onThemeChange here to avoid vault.modify
    // which triggers Obsidian to re-render the entire code block, causing a flash.
    // The theme is applied live in-memory. Persistence is handled via frontmatter only.
  });

  const btnToggleLinks = btnRow.createEl('button', {
    text: 'Hide links',
    cls: 'arch-btn active'
  });

  const btnToggleLabels = btnRow.createEl('button', {
    text: 'Hide labels',
    cls: 'arch-btn active'
  });

  const btnReset = btnRow.createEl('button', {
    text: 'Reset highlight',
    cls: 'arch-btn'
  });
  
  // Create diagram content
  const diagramContent = container.createDiv({ cls: 'arch-diagram-content' });
  
  // Render left layer
  if (data.leftLayer) {
    renderLayer(diagramContent, data.leftLayer, 'left');
  }
  
  // Render middle layers
  const middleContainer = diagramContent.createDiv({ cls: 'arch-middle' });
  for (const layer of data.middleLayers) {
    renderLayer(middleContainer, layer, 'middle');
  }
  
  // Render right layer
      if (data.rightLayer) {
    renderLayer(diagramContent, data.rightLayer, 'right');
  }
  
  // Apply theme + @style custom colors AFTER all nodes are created
  applyThemeClasses(diagramContent, currentTheme, data.nodeStyles);
  
  // Setup interactions
  const child = new ArchDiagramChild(container, data, currentTheme);
  archContainer.__archChild = child;
  
  // Button event handlers
  btnToggleLinks.addEventListener('click', () => {
    const isActive = btnToggleLinks.classList.contains('active');
    btnToggleLinks.classList.toggle('active');
    btnToggleLinks.textContent = isActive ? 'Show links' : 'Hide links';
    child.toggleLinks(!isActive);
  });
  
  btnToggleLabels.addEventListener('click', () => {
    const isActive = btnToggleLabels.classList.contains('active');
    btnToggleLabels.classList.toggle('active');
    btnToggleLabels.textContent = isActive ? 'Show labels' : 'Hide labels';
    child.toggleLabels(!isActive);
  });
  
  btnReset.addEventListener('click', () => {
    resetHighlight(diagramContent);
  });
  
  // Initialize after a delay to ensure layout is ready
  setTimeout(() => {
    child.initialize();
  }, 100);
}

function renderLayer(container: HTMLElement, layer: ArchLayer, position: 'left' | 'middle' | 'right') {
  const hasGroups = layer.groups && layer.groups.length > 0;
  const hasDirectNodes = layer.nodes && layer.nodes.length > 0;
  const directionClass = (hasGroups && layer.direction) ? `arch-layer-${layer.direction}` : '';
  const layerEl = container.createDiv({
    cls: `arch-layer arch-layer-${position} ${directionClass}`,
    attr: { 'data-id': layer.id, 'data-name': layer.label }
  });
  
  if (layer.label) {
    layerEl.createEl('h4', { text: layer.label, cls: 'arch-layer-title' });
  }
  
  // Always create content container to maintain layer size for links
  const contentContainer = layerEl.createDiv({ cls: 'arch-layer-content' });
  
  if (hasGroups) {
    const groupsContainer = contentContainer.createDiv({ cls: 'arch-groups' });
    for (const group of layer.groups!) {
      renderGroup(groupsContainer, group);
    }
  }
  
  if (hasDirectNodes) {
    const nodesDirectionClass = layer.direction ? `arch-nodes-${layer.direction}` : '';
    const nodesContainer = contentContainer.createDiv({ cls: `arch-nodes ${nodesDirectionClass}` });
    for (const node of layer.nodes!) {
      renderNode(nodesContainer, node);
    }
  }
}

function renderGroup(container: HTMLElement, group: ArchGroup) {
  const directionClass = group.direction ? `arch-group-${group.direction}` : '';
  const groupEl = container.createDiv({
    cls: `arch-group ${directionClass}`,
    attr: { 'data-id': group.id, 'data-name': group.label }
  });
  
  if (group.label) {
    groupEl.createEl('h5', { text: group.label, cls: 'arch-group-title' });
  }
  
  // Always create nodes container
  const nodesContainer = groupEl.createDiv({ cls: 'arch-nodes' });
  for (const node of group.nodes) {
    renderNode(nodesContainer, node);
  }
}

/**
 * Apply theme colors to arch diagram elements via inline styles.
 * Directly sets style attribute to guarantee override of CSS class colors.
 * @style custom colors override theme defaults.
 */
function applyThemeClasses(container: HTMLElement, theme: DiagramTheme, nodeStyles?: Map<string, string>): void {
  const nt = theme.arch.nodeType;

  const typeMap: Record<string, { fill: string; border: string; text: string }> = {
    user: nt.user,
    service: nt.service,
    infra: nt.infra,
    external: nt.external,
    monitor: nt.monitor,
    node: nt.node,
  };

  // Apply inline styles directly to nodes
  const nodes = container.querySelectorAll('.arch-node');
  nodes.forEach(nodeEl => {
    const el = nodeEl as HTMLElement;
    const nodeType = el.dataset.type;
    const nodeId = el.dataset.id;
    const nodeName = el.dataset.name;
    // @style matches either node id or node name
    const customColor = nodeStyles?.get(nodeId || '') || nodeStyles?.get(nodeName || '');
    const colors = typeMap[nodeType || 'node'] || typeMap.node;
    // Use cssText to fully override any CSS class-based styles
    if (customColor) {
      // Custom color: use it as fill, with a darker border and appropriate text
      el.setAttribute('style', `background:${customColor}!important;border:1px solid ${customColor}!important;color:#ffffff!important;`);
    } else {
      el.setAttribute('style', `background:${colors.fill}!important;border:1px solid ${colors.border}!important;color:${colors.text}!important;`);
    }
  });

  // Apply layer borders
  const layers = container.querySelectorAll('.arch-layer');
  layers.forEach(layerEl => {
    const el = layerEl as HTMLElement;
    const existing = el.getAttribute('style') || '';
    // Remove any previous theme border, then add new one
    el.setAttribute('style', existing.replace(/border-color:[^;]*!important;?/g, '') + `border-color:${theme.arch.layerBorder}!important;`);
  });

  // Apply group backgrounds
  const groups = container.querySelectorAll('.arch-group');
  groups.forEach(groupEl => {
    const el = groupEl as HTMLElement;
    const existing = el.getAttribute('style') || '';
    el.setAttribute('style', existing.replace(/background:[^;]*!important;?/g, '') + `background:${theme.arch.groupBg}!important;`);
  });
}

function renderNode(container: HTMLElement, node: ArchNode) {
  const shapeClass = node.shape === 'round' ? 'arch-node-round' : node.shape === 'circle' ? 'arch-node-circle' : '';
  const nodeEl = container.createDiv({
    cls: `arch-node arch-node-${node.type} ${shapeClass}`,
    attr: { 'data-id': node.id, 'data-name': node.name, 'data-type': node.type }
  });
  nodeEl.createEl('div', { text: node.name, cls: 'arch-node-text' });
  
  if (node.description) {
    nodeEl.createEl('div', { text: node.description, cls: 'arch-node-desc' });
  }
}

/**
 * Resolve layer/group name to a boundary node for link drawing
 * Finds the node closest to the link direction
 */
function resolveLayerToNode(
  container: HTMLElement,
  fromName: string,
  toName: string,
  containerRect: DOMRect
): [HTMLElement | null, HTMLElement | null] {
  let fromEl: HTMLElement | null = null;
  let toEl: HTMLElement | null = null;
  
  // Find the layer/group by id (data-id)
  const fromLayer = container.querySelector(`.arch-layer[data-id="${fromName}"], .arch-group[data-id="${fromName}"]`) as HTMLElement;
  const toLayer = container.querySelector(`.arch-layer[data-id="${toName}"], .arch-group[data-id="${toName}"]`) as HTMLElement;
  
  if (fromLayer) {
    // Find nodes in the layer/group
    const fromNodes = fromLayer.querySelectorAll('.arch-node');
    if (fromNodes.length > 0) {
      // Determine direction based on layer position
      const direction = fromLayer.classList.contains('arch-layer-left') ? 'right' :
                       fromLayer.classList.contains('arch-layer-right') ? 'left' :
                       fromLayer.classList.contains('arch-layer-LR') || fromLayer.classList.contains('arch-nodes-LR') ? 'right' : 'bottom';
      
      fromEl = findBoundaryNode(fromNodes as NodeListOf<HTMLElement>, direction, containerRect);
    } else {
      // No nodes in layer, use layer element itself as boundary
      fromEl = fromLayer;
    }
  }
  
  if (toLayer) {
    const toNodes = toLayer.querySelectorAll('.arch-node');
    if (toNodes.length > 0) {
      const direction = toLayer.classList.contains('arch-layer-left') ? 'right' :
                       toLayer.classList.contains('arch-layer-right') ? 'left' :
                       toLayer.classList.contains('arch-layer-LR') || toLayer.classList.contains('arch-nodes-LR') ? 'left' : 'top';
      
      toEl = findBoundaryNode(toNodes as NodeListOf<HTMLElement>, direction, containerRect);
    } else {
      // No nodes in layer, use layer element itself as boundary
      toEl = toLayer;
    }
  }
  
  return [fromEl, toEl];
}

/**
 * Find node at the specified boundary of a node list
 */
function findBoundaryNode(
  nodes: NodeListOf<HTMLElement>,
  direction: 'left' | 'right' | 'top' | 'bottom',
  containerRect: DOMRect
): HTMLElement {
  let bestNode: HTMLElement = nodes[0];
  let bestScore = -Infinity;
  
  nodes.forEach(node => {
    const rect = node.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2 - containerRect.left;
    const centerY = rect.top + rect.height / 2 - containerRect.top;
    
    let score = 0;
    switch (direction) {
      case 'right': score = centerX; break;
      case 'left': score = -centerX; break;
      case 'bottom': score = centerY; break;
      case 'top': score = -centerY; break;
    }
    
    if (score > bestScore) {
      bestScore = score;
      bestNode = node;
    }
  });
  
  return bestNode;
}

function renderLinks(container: HTMLElement, links: ArchLink[], showLinks: boolean = true, showLabels: boolean = true, theme?: DiagramTheme) {
  const t = theme ?? getTheme('default');
  if (links.length === 0) return;
  
  const diagramContent = container.querySelector('.arch-diagram-content') as HTMLElement;
  if (!diagramContent) return;
  
  // Remove existing SVG
  const existingSvg = diagramContent.querySelector('.arch-links-svg');
  if (existingSvg) existingSvg.remove();
  
  const containerRect = diagramContent.getBoundingClientRect();
  if (containerRect.width === 0 || containerRect.height === 0) return;
  if (!isFinite(containerRect.left) || !isFinite(containerRect.top)) return;
  
  // Create SVG overlay
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.classList.add('arch-links-svg');
  svg.setAttribute('width', '100%');
  svg.setAttribute('height', '100%');
  diagramContent.appendChild(svg);
  
  // Define arrow markers
  const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
  svg.appendChild(defs);
  
  const arrowColor = t.arch.linkColor;
  const marker = document.createElementNS("http://www.w3.org/2000/svg", "marker");
  marker.setAttribute('id', 'arrow');
  marker.setAttribute('markerWidth', '7');
  marker.setAttribute('markerHeight', '6');
  marker.setAttribute('refX', '7');
  marker.setAttribute('refY', '3');
  marker.setAttribute('orient', 'auto');
  defs.appendChild(marker);
  
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute('d', 'M0,0 L7,3 L0,6 Z');
  path.setAttribute('fill', arrowColor);
  marker.appendChild(path);
  
  // Draw links
  links.forEach((link) => {
    // Find from and to elements
    let fromEl = (diagramContent.querySelector(`[data-id="${link.from}"]`) ||
                  diagramContent.querySelector(`[data-name="${link.from}"]`)) as HTMLElement;
    let toEl = (diagramContent.querySelector(`[data-id="${link.to}"]`) ||
                diagramContent.querySelector(`[data-name="${link.to}"]`)) as HTMLElement;
    
    // If not found as node, try finding as layer/group
    if (!fromEl || !toEl) {
      const [resolvedFrom, resolvedTo] = resolveLayerToNode(diagramContent, link.from, link.to, containerRect);
      fromEl = fromEl || resolvedFrom;
      toEl = toEl || resolvedTo;
    }
    
    if (!fromEl || !toEl) return;
    
    const fromRect = fromEl.getBoundingClientRect();
    const toRect = toEl.getBoundingClientRect();
    
    if (!isFinite(fromRect.left) || !isFinite(fromRect.top) ||
        !isFinite(toRect.left) || !isFinite(toRect.top)) return;
    if (fromRect.width === 0 || fromRect.height === 0 ||
        toRect.width === 0 || toRect.height === 0) return;
    
    // Calculate connection points
    const fromCenterX = fromRect.left + fromRect.width / 2 - containerRect.left;
    const fromCenterY = fromRect.top + fromRect.height / 2 - containerRect.top;
    const toCenterX = toRect.left + toRect.width / 2 - containerRect.left;
    const toCenterY = toRect.top + toRect.height / 2 - containerRect.top;
    
    const dx = toCenterX - fromCenterX;
    const dy = toCenterY - fromCenterY;
    
    // Calculate start point (from node edge)
    let x1: number, y1: number;
    if (Math.abs(dx) > Math.abs(dy)) {
      if (dx > 0) {
        x1 = fromRect.left + fromRect.width - containerRect.left;
        y1 = fromCenterY;
      } else {
        x1 = fromRect.left - containerRect.left;
        y1 = fromCenterY;
      }
    } else {
      if (dy > 0) {
        x1 = fromCenterX;
        y1 = fromRect.top + fromRect.height - containerRect.top;
      } else {
        x1 = fromCenterX;
        y1 = fromRect.top - containerRect.top;
      }
    }
    
    // Calculate end point (to node edge)
    let x2: number, y2: number;
    if (Math.abs(dx) > Math.abs(dy)) {
      if (dx > 0) {
        x2 = toRect.left - containerRect.left;
        y2 = toCenterY;
      } else {
        x2 = toRect.left + toRect.width - containerRect.left;
        y2 = toCenterY;
      }
    } else {
      if (dy > 0) {
        x2 = toCenterX;
        y2 = toRect.top - containerRect.top;
      } else {
        x2 = toCenterX;
        y2 = toRect.top + toRect.height - containerRect.top;
      }
    }
    
    // Padding
    const padding = 2;
    if (x1 === fromRect.left - containerRect.left) x1 += padding;
    else if (x1 === fromRect.left + fromRect.width - containerRect.left) x1 -= padding;
    if (y1 === fromRect.top - containerRect.top) y1 += padding;
    else if (y1 === fromRect.top + fromRect.height - containerRect.top) y1 -= padding;
    if (x2 === toRect.left - containerRect.left) x2 += padding;
    else if (x2 === toRect.left + toRect.width - containerRect.left) x2 -= padding;
    if (y2 === toRect.top - containerRect.top) y2 += padding;
    else if (y2 === toRect.top + toRect.height - containerRect.top) y2 -= padding;
    
    if (!isFinite(x1) || !isFinite(y1) || !isFinite(x2) || !isFinite(y2)) return;
    
    // Link style
    const linkColor = t.arch.linkColor;
    const strokeWidth = link.style === 'thick' ? '3' : '1.5';
    
    // Draw path
    if (showLinks) {
      const pathEl = document.createElementNS("http://www.w3.org/2000/svg", "path");
      pathEl.classList.add('arch-link-path');
      
      if (link.style === 'dashed') {
        pathEl.classList.add('arch-link-dashed');
      }
      
      const dist = Math.sqrt(dx * dx + dy * dy);
      const curveOffset = Math.min(dist * 0.25, 50);
      
      let d: string;
      if (Math.abs(dx) > Math.abs(dy)) {
        const ctrlX1 = x1 + curveOffset * Math.sign(dx);
        const ctrlX2 = x2 - curveOffset * Math.sign(dx);
        d = `M ${x1} ${y1} C ${ctrlX1} ${y1}, ${ctrlX2} ${y2}, ${x2} ${y2}`;
      } else {
        const ctrlY1 = y1 + curveOffset * Math.sign(dy);
        const ctrlY2 = y2 - curveOffset * Math.sign(dy);
        d = `M ${x1} ${y1} C ${x1} ${ctrlY1}, ${x2} ${ctrlY2}, ${x2} ${y2}`;
      }
      
      pathEl.setAttribute('d', d);
      pathEl.setAttribute('fill', 'none');
      pathEl.setAttribute('stroke', linkColor);
      pathEl.setAttribute('stroke-width', strokeWidth);
      pathEl.setAttribute('marker-end', 'url(#arrow)');
      pathEl.setAttribute('data-from', link.from);
      pathEl.setAttribute('data-to', link.to);
      pathEl.setAttribute('data-style', link.style || 'solid');
      svg.appendChild(pathEl);
    }
    
    // Draw label
    if (link.label && showLabels) {
      const mx = (x1 + x2) / 2;
      const my = (y1 + y2) / 2;
      
      if (isFinite(mx) && isFinite(my)) {
        const tw = link.label.length * 6 + 10;
        const bg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        bg.classList.add('arch-link-label-bg');
        bg.setAttribute('x', (mx - tw / 2).toString());
        bg.setAttribute('y', (my - 7).toString());
        bg.setAttribute('width', tw.toString());
        bg.setAttribute('height', '14');
        bg.setAttribute('rx', '4');
        svg.appendChild(bg);
        
        const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
        text.classList.add('arch-link-label');
        text.setAttribute('x', mx.toString());
        text.setAttribute('y', (my + 4).toString());
        text.setAttribute('text-anchor', 'middle');
        text.textContent = link.label;
        svg.appendChild(text);
      }
    }
  });
}

function resetHighlight(container: HTMLElement) {
  const nodes = container.querySelectorAll('.arch-node');
  nodes.forEach(n => {
    n.classList.remove('arch-node-highlighted', 'arch-node-dimmed');
  });
  
  const paths = container.querySelectorAll('.arch-link-path');
  paths.forEach(p => p.classList.remove('arch-link-active', 'arch-link-dimmed'));
}

function initInteractions(container: HTMLElement) {
  const nodes = container.querySelectorAll('.arch-node');
  
  nodes.forEach(node => {
    node.addEventListener('click', (e) => {
      e.stopPropagation();
      highlightNode(container, node as HTMLElement);
    });
  });
  
  container.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).classList.contains('arch-diagram-content')) {
      resetHighlight(container);
    }
  });
}

function highlightNode(container: HTMLElement, clickedNode: HTMLElement) {
  resetHighlight(container);
  
  const nodeName = clickedNode.dataset.id || clickedNode.dataset.name;
  clickedNode.classList.add('arch-node-highlighted');
  
  const connectedNodes = new Set<string>();
  const connectedLinks = new Set<SVGPathElement>();
  
  const links = container.querySelectorAll('.arch-link-path');
  links.forEach(link => {
    const fromId = link.getAttribute('data-from');
    const toId = link.getAttribute('data-to');
    const fromEl = (container.querySelector(`[data-id="${fromId}"]`) ||
                    container.querySelector(`[data-name="${fromId}"]`)) as HTMLElement;
    const toEl = (container.querySelector(`[data-id="${toId}"]`) ||
                  container.querySelector(`[data-name="${toId}"]`)) as HTMLElement;
    
    const fromMatch = fromEl?.dataset.id === nodeName || fromEl?.dataset.name === nodeName;
    const toMatch = toEl?.dataset.id === nodeName || toEl?.dataset.name === nodeName;
    
    if (fromMatch) {
      connectedNodes.add(toEl?.dataset.id || toEl?.dataset.name || '');
      connectedLinks.add(link as SVGPathElement);
      toEl?.classList.add('arch-node-highlighted');
    } else if (toMatch) {
      connectedNodes.add(fromEl?.dataset.id || fromEl?.dataset.name || '');
      connectedLinks.add(link as SVGPathElement);
      fromEl?.classList.add('arch-node-highlighted');
    }
  });
  
  container.querySelectorAll('.arch-node').forEach(node => {
    if (!node.classList.contains('arch-node-highlighted')) {
      node.classList.add('arch-node-dimmed');
    }
  });
  
  connectedLinks.forEach(link => {
    link.classList.add('arch-link-active');
  });
  
  links.forEach(link => {
    if (!link.classList.contains('arch-link-active')) {
      link.classList.add('arch-link-dimmed');
    }
  });
}

/**
 * Child class to manage diagram lifecycle and redraws
 */
class ArchDiagramChild {
  private container: HTMLElement;
  private data: ArchDiagramData;
  private showLinks: boolean = true;
  private showLabels: boolean = true;
  private observer: MutationObserver | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private redrawTimeout: number | null = null;
  private retryCount: number = 0;
  private maxRetries: number = 50;
  private theme: DiagramTheme;
  
  constructor(container: HTMLElement, data: ArchDiagramData, theme: DiagramTheme) {
    this.container = container;
    this.data = data;
    this.theme = theme;
  }

  setTheme(theme: DiagramTheme) {
    this.theme = theme;
  }

  pauseObserver() {
    if (this.observer) this.observer.disconnect();
  }

  resumeObserver() {
    const content = this.container.querySelector('.arch-diagram-content') as HTMLElement;
    if (content) this.observeLayout(content);
  }

  forceRedraw() {
    if (this.redrawTimeout) clearTimeout(this.redrawTimeout);
    this.redrawTimeout = window.setTimeout(() => {
      renderLinks(this.container, this.data.links, this.showLinks, this.showLabels, this.theme);
    }, 150);
  }

  toggleLinks(show: boolean) {
    this.showLinks = show;
    this.redrawLinks();
  }
  
  toggleLabels(show: boolean) {
    this.showLabels = show;
    this.redrawLinks();
  }
  
  redrawLinks() {
    renderLinks(this.container, this.data.links, this.showLinks, this.showLabels, this.theme);
  }
  
  initialize() {
    this.waitForLayout();
  }
  
  private waitForLayout() {
    const checkLayout = () => {
      const content = this.container.querySelector('.arch-diagram-content') as HTMLElement;
      if (!content) {
        this.scheduleRetry(checkLayout);
        return;
      }
      
      const rect = content.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) {
        this.scheduleRetry(checkLayout);
        return;
      }
      
      const nodes = content.querySelectorAll('.arch-node');
      let allVisible = true;
      nodes.forEach(node => {
        const nodeRect = (node as HTMLElement).getBoundingClientRect();
        if (nodeRect.width === 0 || nodeRect.height === 0) {
          allVisible = false;
        }
      });
      
      if (!allVisible) {
        this.scheduleRetry(checkLayout);
        return;
      }
      
      // Layout ready
      renderLinks(this.container, this.data.links, this.showLinks, this.showLabels, this.theme);
      initInteractions(this.container);
      
      this.observeLayout(content);
      this.observeResize(content);
    };
    
    checkLayout();
  }
  
  private scheduleRetry(checkFn: () => void) {
    if (this.retryCount >= this.maxRetries) return;
    this.retryCount++;
    const delay = Math.min(100 * this.retryCount, 500);
    setTimeout(checkFn, delay);
  }
  
  private observeLayout(content: HTMLElement) {
    if (this.observer) {
      this.observer.disconnect();
    }
    
    this.observer = new MutationObserver((mutations) => {
      const isSvgMutation = mutations.some(mutation =>
        Array.from(mutation.addedNodes).some(node =>
          (node as HTMLElement).classList?.contains('arch-links-svg')
        )
      );
      
      if (isSvgMutation) return;
      
      if (this.redrawTimeout) {
        clearTimeout(this.redrawTimeout);
      }
      this.redrawTimeout = window.setTimeout(() => {
        renderLinks(this.container, this.data.links, this.showLinks, this.showLabels, this.theme);
      }, 100);
    });
    
    this.observer.observe(content, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['style', 'class']
    });
  }
  
  private observeResize(content: HTMLElement) {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }
    
    this.resizeObserver = new ResizeObserver(() => {
      if (this.redrawTimeout) {
        clearTimeout(this.redrawTimeout);
      }
      this.redrawTimeout = window.setTimeout(() => {
        renderLinks(this.container, this.data.links, this.showLinks, this.showLabels, this.theme);
      }, 100);
    });
    
    this.resizeObserver.observe(content);
  }
  
  destroy() {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    
    if (this.redrawTimeout) {
      clearTimeout(this.redrawTimeout);
      this.redrawTimeout = null;
    }
  }
}
