/**
 * Swimlane Diagram Parser
 *
 * New Syntax (no groups, no nodesPerRow, no startLane):
 *
 *   lane LaneName
 *     [Node1],[Node2]          <- row 0: two nodes side by side
 *     [Node3],[Node4],[Node5]  <- row 1: three nodes side by side
 *     [Node6]                  <- row 2: one node
 *
 * - Each indented, non-empty line inside a lane defines one row.
 * - Nodes on the same line are comma-separated: [A],[B]  or  A,B  or  (A),(B)
 * - Start node: declare `[Start]`, `(Start)`, `Start` etc. in any lane.
 *   There can be only ONE Start node in the whole diagram.
 *   The Start node is identified by the reserved label "Start" (case-insensitive).
 * - End nodes: declare `[End]`, `(End)`, `End` etc. in any lane.
 *   Multiple End nodes are allowed. Each End node belongs to its lane.
 *   Connections to End nodes are validated later by the renderer if desired.
 *
 * Connections (below the lane definitions or inline):
 *   A --> B          solid straight
 *   A ~~> B          solid curve
 *   A -.-> B         dashed straight
 *   A ~~~> B         dashed curve
 *   A -->|label| B   with label
 */

import * as yaml from 'js-yaml';
import type {
  SwimlaneDiagram,
  SwimlaneLane,
  SwimlaneRow,
  SwimlaneNode,
  SwimlaneLink,
  SwimlaneConfig,
  NodeShape,
  LineType,
  LineStyle,
} from './types';

interface ParsingState {
  lanes: SwimlaneLane[];
  rows: SwimlaneRow[];
  nodes: SwimlaneNode[];
  links: SwimlaneLink[];
  nodeIdCounter: number;
  rowIdCounter: number;
  linkIdCounter: number;
}

// ─── helpers ────────────────────────────────────────────────────────────────

function generateNodeId(state: ParsingState): string {
  return `sl-node-${++state.nodeIdCounter}`;
}

function generateRowId(state: ParsingState): string {
  return `sl-row-${++state.rowIdCounter}`;
}

function generateLinkId(state: ParsingState): string {
  return `sl-link-${++state.linkIdCounter}`;
}

function getIndentLevel(line: string): number {
  let indent = 0;
  for (const char of line) {
    if (char === ' ' || char === '\t') indent++;
    else break;
  }
  return indent;
}

function isIgnorableLine(line: string): boolean {
  const t = line.trim();
  return !t || t.startsWith('%') || t.startsWith('//');
}

// ─── node shape parser ───────────────────────────────────────────────────────

function parseNodeShape(raw: string): { shape: NodeShape; content: string; operator?: string; phantomStyle?: 'rect' | 'circle' | 'round' | 'diamond' } {
  const text = raw.trim();

  // Empty brackets → phantom (invisible placeholder), preserve original style for layout
  if (text === '[]') {
    return { shape: 'phantom', content: '', phantomStyle: 'rect' };
  }
  if (text === '(())') {
    return { shape: 'phantom', content: '', phantomStyle: 'circle' };
  }
  if (text === '()') {
    return { shape: 'phantom', content: '', phantomStyle: 'round' };
  }
  if (text === '{}') {
    return { shape: 'phantom', content: '', phantomStyle: 'diamond' };
  }
  if (text === '[[]]') {
    return { shape: 'phantom', content: '', phantomStyle: 'rect' };
  }

  if (text.startsWith('[[')) {
    const m = text.match(/^\[\[(.+?)\]\]$/);
    if (m) return { shape: 'subprocess', content: m[1] };
  }
  if (text.startsWith('((')) {
    const m = text.match(/^\(\((.+?)\)\)$/);
    if (m) return { shape: 'circle', content: m[1] };
  }
  if (text.startsWith('(')) {
    const m = text.match(/^\((.+?)\)$/);
    if (m) return { shape: 'round', content: m[1] };
  }
  if (text.startsWith('{')) {
    const m = text.match(/^\{(.+?)\}$/);
    if (m) return { shape: 'diamond', content: m[1] };
  }
  if (text.startsWith('[')) {
    const m = text.match(/^\[(.+?)\]$/);
    if (m) {
      // Check for pipe separator: [NodeTitle|OperatorName]
      const parts = m[1].split('|');
      if (parts.length >= 2) {
        return { shape: 'rect', content: parts[0].trim(), operator: parts.slice(1).join('|').trim() };
      }
      return { shape: 'rect', content: m[1] };
    }
  }
  // Bare label (no brackets) — if empty, treat as phantom placeholder
  return { shape: text ? 'rect' : 'phantom', content: text };
}

/**
 * Split a row line into individual node tokens.
 * Handles: [A],[B]  (A),(B)  A,B  [A], (B), C  etc.
 * Strategy: split on commas that are NOT inside brackets.
 */
function splitRowTokens(line: string): string[] {
  const tokens: string[] = [];
  let depth = 0;
  let current = '';

  for (const ch of line) {
    if (ch === '[' || ch === '(' || ch === '{') {
      depth++;
      current += ch;
    } else if (ch === ']' || ch === ')' || ch === '}') {
      depth--;
      current += ch;
    } else if (ch === ',' && depth === 0) {
      // Always push (even empty string) to preserve placeholder positions
      tokens.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  // Push last token (may be empty)
  tokens.push(current.trim());
  // Filter out trailing empty token only if the line didn't end with a comma
  // (i.e., only keep empty tokens that are mid-row placeholders)
  return tokens;
}

// ─── link parser ─────────────────────────────────────────────────────────────

function parseLink(line: string, state: ParsingState): SwimlaneLink | null {
  const patterns: Array<[RegExp, LineType, LineStyle]> = [
    [/^(.+?)\s+~~~>\s*(?:\|(.+?)\|\s*)?(.+)$/, 'dashed', 'curve'],
    [/^(.+?)\s+-\.->s*(?:\|(.+?)\|\s*)?(.+)$/, 'dashed', 'straight'],
    [/^(.+?)\s+-\.->\s*(?:\|(.+?)\|\s*)?(.+)$/, 'dashed', 'straight'],
    [/^(.+?)\s+~~>\s*(?:\|(.+?)\|\s*)?(.+)$/, 'solid', 'curve'],
    [/^(.+?)\s+-->\s*(?:\|(.+?)\|\s*)?(.+)$/, 'solid', 'straight'],
  ];

  for (const [pattern, lineType, lineStyle] of patterns) {
    const m = line.match(pattern);
    if (m) {
      return {
        id: generateLinkId(state),
        source: m[1].trim(),
        target: m[3].trim(),
        label: m[2]?.trim(),
        lineType,
        lineStyle,
      };
    }
  }
  return null;
}

// ─── main parser ─────────────────────────────────────────────────────────────

export function parseSwimlaneSource(source: string, _config?: SwimlaneConfig): SwimlaneDiagram {
  const state: ParsingState = {
    lanes: [],
    rows: [],
    nodes: [],
    links: [],
    nodeIdCounter: 0,
    rowIdCounter: 0,
    linkIdCounter: 0,
  };

  const lines = source.split('\n');
  let currentLane: SwimlaneLane | null = null;
  let currentLaneRowCount = 0;
  const nodeStyles: Map<string, string> = new Map();

  for (const line of lines) {
    if (isIgnorableLine(line)) continue;

    const trimmed = line.trim();

    // ── @style directive ──────────────────────────────────────────────────
    // Syntax: @style #color node1, node2, ...
    if (trimmed.startsWith('@style ')) {
      const rest = trimmed.slice(7).trim();
      const colorMatch = rest.match(/#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/);
      if (colorMatch) {
        const color = colorMatch[0];
        const remaining = rest.replace(colorMatch[0], '').trim();
        const names = remaining.split(',').map(s => s.trim()).filter(Boolean);
        names.forEach(name => nodeStyles.set(name, color));
      }
      continue;
    }

    // ── Link line ──────────────────────────────────────────────────────────
    if (
      trimmed.includes('-->') ||
      trimmed.includes('~~>') ||
      trimmed.includes('-.->') ||
      trimmed.includes('~~~>')
    ) {
      const link = parseLink(trimmed, state);
      if (link) state.links.push(link);
      continue;
    }

    // ── Lane declaration ───────────────────────────────────────────────────
    if (trimmed.startsWith('lane ')) {
      const laneName = trimmed.slice(5).trim();
      currentLane = {
        id: `sl-lane-${state.lanes.length + 1}`,
        title: laneName,
      };
      state.lanes.push(currentLane);
      currentLaneRowCount = 0;
      continue;
    }

    // ── Node row (indented line inside a lane) ─────────────────────────────
    if (getIndentLevel(line) > 0 && currentLane) {
      const tokens = splitRowTokens(trimmed);
      if (tokens.length === 0) continue;
      // Skip rows that are entirely empty (single empty token after trimming)
      if (tokens.length === 1 && tokens[0] === '') continue;

      const row: SwimlaneRow = {
        id: generateRowId(state),
        laneId: currentLane.id,
        rowIndex: currentLaneRowCount++,
        nodeIds: [],
      };
      state.rows.push(row);

      tokens.forEach((token, colIndex) => {
        const { shape, content, operator, phantomStyle } = parseNodeShape(token);
        const label = content;

        const node: SwimlaneNode = {
          id: generateNodeId(state),
          label,
          shape,
          laneId: currentLane!.id,
          rowId: row.id,
          colIndex,
          x: 0,
          y: 0,
          operator,
          phantomStyle,
        };

        // Detect Start node (reserved label, case-insensitive)
        if (label.toLowerCase() === 'start') {
          node.isStartNode = true;
          node.shape = 'circle';
        }

        // Detect End node (reserved label, case-insensitive)
        if (label.toLowerCase() === 'end') {
          node.isEndNode = true;
          node.shape = 'circle';
        }

        state.nodes.push(node);
        row.nodeIds.push(node.id);
      });
    }
  }

  // Validate: at most one Start node
  const startNodes = state.nodes.filter(n => n.isStartNode);
  if (startNodes.length > 1) {
    // Keep only the first one; demote the rest
    for (let i = 1; i < startNodes.length; i++) {
      startNodes[i].isStartNode = false;
      startNodes[i].shape = 'rect';
    }
  }

  // Resolve link references (labels → node ids)
  resolveLinkReferences(state);

  return {
    lanes: state.lanes,
    rows: state.rows,
    nodes: state.nodes,
    links: state.links,
    nodeStyles: nodeStyles.size > 0 ? nodeStyles : undefined,
  };
}

// ─── resolve link references ─────────────────────────────────────────────────

function resolveLinkReferences(state: ParsingState): void {
  // Build label → node id map (last-wins for duplicate labels).
  // End nodes are stored separately per lane so we can do lane-aware routing.
  const labelToId = new Map<string, string>();
  // laneId → End node id (each lane can have at most one End)
  const laneEndId = new Map<string, string>();

  for (const node of state.nodes) {
    if (node.isEndNode) {
      // Multiple End nodes: keep first per lane; global map points to the last one
      // as fallback only.
      if (!laneEndId.has(node.laneId)) {
        laneEndId.set(node.laneId, node.id);
      }
      // Also register as lowercase "end" fallback
      labelToId.set('end', node.id);
    } else {
      labelToId.set(node.label, node.id);
      labelToId.set(node.label.toLowerCase(), node.id);
    }
  }

  for (const link of state.links) {
    // Resolve source
    const srcId = labelToId.get(link.source) ?? labelToId.get(link.source.toLowerCase());
    if (srcId) link.source = srcId;

    // Resolve target: if target label is "End" (case-insensitive), route to the
    // End node in the SAME lane as the (already-resolved) source node.
    const tgtLabel = link.target.trim();
    if (tgtLabel.toLowerCase() === 'end') {
      // Find source node's lane
      const srcNode = state.nodes.find(n => n.id === link.source);
      if (srcNode) {
        const sameLaneEnd = laneEndId.get(srcNode.laneId);
        if (sameLaneEnd) {
          link.target = sameLaneEnd;
          continue;
        }
      }
      // Fallback: use global "end" mapping
      const globalEnd = labelToId.get('end');
      if (globalEnd) link.target = globalEnd;
    } else {
      const tgtId = labelToId.get(link.target) ?? labelToId.get(link.target.toLowerCase());
      if (tgtId) link.target = tgtId;
    }
  }
}

// ─── frontmatter / top-level parse ───────────────────────────────────────────

export function parseSwimlaneConfig(frontmatter: string): SwimlaneConfig {
  if (!frontmatter.trim()) return {};
  try {
    return (yaml.load(frontmatter) as SwimlaneConfig) || {};
  } catch {
    return {};
  }
}

export function parseSwimlane(content: string): { config: SwimlaneConfig; diagram: SwimlaneDiagram } {
  const lines = content.split('\n');
  const frontmatterLines: string[] = [];
  let diagramSourceStart = 0;
  let inFrontmatter = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line === '---') {
      if (!inFrontmatter) {
        inFrontmatter = true;
        frontmatterLines.push(line);
      } else {
        frontmatterLines.push(line);
        diagramSourceStart = i + 1;
        break;
      }
    } else if (inFrontmatter) {
      frontmatterLines.push(line);
    }
  }

  // Skip blank lines
  while (diagramSourceStart < lines.length && !lines[diagramSourceStart]?.trim()) {
    diagramSourceStart++;
  }
  // Skip "swimlane" type indicator
  if (diagramSourceStart < lines.length && lines[diagramSourceStart].trim() === 'swimlane') {
    diagramSourceStart++;
  }
  // Skip blank lines after type
  while (diagramSourceStart < lines.length && !lines[diagramSourceStart]?.trim()) {
    diagramSourceStart++;
  }

  const config = parseSwimlaneConfig(
    frontmatterLines.filter(l => l !== '---').join('\n')
  );
  const diagramSource = lines.slice(diagramSourceStart).join('\n');
  const diagram = parseSwimlaneSource(diagramSource, config);
  diagram.title = config.title;

  return { config, diagram };
}
