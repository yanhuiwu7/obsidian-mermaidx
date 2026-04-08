/**
 * Swimlane Diagram Types
 * Row-based swimlane diagram: nodes inside a lane are arranged in explicit rows.
 *
 * Syntax example:
 *   lane Applicant
 *     [Fill Form],[Submit]
 *     [Submit2],[Submit3]
 *     [Submit4]
 *
 * - Each indented line inside a lane = one row.
 * - Nodes on the same line (comma-separated) are placed in the same row.
 * - Start node is declared explicitly as `[Start]` / `(Start)` / `Start` in any lane.
 * - End nodes are declared explicitly as `[End]` / `(End)` / `End` (can be multiple).
 * - Each End node belongs to the lane it is declared in; links can only connect to
 *   the End node in the same lane as the source's final node.
 */

// Node shape types
// 'phantom' = invisible placeholder node (occupies space but is not rendered)
export type NodeShape = 'rect' | 'diamond' | 'circle' | 'subprocess' | 'round' | 'phantom';

/**
 * Represents a swimlane (vertical column)
 */
export interface SwimlaneLane {
  id: string;
  title: string;
}

/**
 * Represents a row of nodes inside a single lane.
 * All nodes in this row are laid out horizontally within the lane.
 */
export interface SwimlaneRow {
  id: string;
  laneId: string;
  /** Index within the lane (0-based) */
  rowIndex: number;
  /** Node ids that belong to this row, in declaration order */
  nodeIds: string[];
}

/**
 * Represents a node in the swimlane diagram
 */
export interface SwimlaneNode {
  id: string;
  label: string;
  shape: NodeShape;
  laneId: string;
  rowId: string;
  /** Column index within the row (0-based) */
  colIndex: number;
  // For multi-line nodes
  title?: string;
  content?: string;
  // Operator for two-line nodes (e.g., [NodeTitle|OperatorName])
  operator?: string;
  // Subprocess additional title
  subprocessTitle?: string;
  // Special node flags
  isStartNode?: boolean;
  isEndNode?: boolean;
  // Original bracket style for phantom nodes (for layout width calculation)
  phantomStyle?: 'rect' | 'circle' | 'round' | 'diamond';
  // Position - for drag persistence
  x: number;
  y: number;
}

/**
 * Connection line types
 */
export type LineType = 'solid' | 'dashed';
export type LineStyle = 'straight' | 'curve';

/**
 * Represents a connection between nodes
 */
export interface SwimlaneLink {
  id: string;
  source: string;
  target: string;
  label?: string;
  lineType: LineType;
  lineStyle: LineStyle;
}

/**
 * Complete swimlane diagram data
 */
export interface SwimlaneDiagram {
  title?: string;
  lanes: SwimlaneLane[];
  rows: SwimlaneRow[];
  nodes: SwimlaneNode[];
  links: SwimlaneLink[];
  // Custom node styles: node label -> hex color
  nodeStyles?: Map<string, string>;
  // Metadata
  sourcePath?: string;
}

/**
 * Parsed frontmatter for swimlane (simplified)
 */
export interface SwimlaneConfig {
  title?: string;
  theme?: string;
}

/**
 * Position data for persistence
 */
export interface NodePosition {
  x: number;
  y: number;
  pinned: boolean;
}

/**
 * Position data keyed by content hash
 */
export interface SwimlanePositions {
  [key: string]: {
    [nodeId: string]: NodePosition;
  };
}
