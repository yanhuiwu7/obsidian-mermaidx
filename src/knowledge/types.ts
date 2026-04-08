// ============================================
// Type Definitions for Knowledge Graph
// ============================================

// Node shapes supported in knowledge graph
export type NodeShape = "circle" | "rect" | "roundrect" | "ellipse" | "diamond" | "hexagon";

// Triple with optional line style
export interface Triple {
  subject: string;
  predicate: string;
  object: string;
  // Line animation style
  animated?: boolean;
}

export interface NodeTypeConfig {
  id: string;
  label: string;
  color?: string;
  nodes: string[];
}

export interface GraphConfig {
  id: string;
  name: string;
  description?: string;
  height?: number;
  triples: Triple[];
  nodeTypes?: NodeTypeConfig[];
  defaultType?: {
    id: string;
    label: string;
    color?: string;
  };
  // Node styles: node name -> { color, label? }
  nodeStyles?: Map<string, { color: string; label?: string }>;
  // Relation styles: relation name -> { color, label? }
  relationStyles?: Map<string, { color: string; label?: string }>;
  // Node shapes: node name -> shape type
  nodeShapes?: Map<string, NodeShape>;
}

// D3 runtime node (with coordinates)
export interface GraphNode {
  id: string;
  name: string;
  shape?: NodeShape;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  fx?: number | null;
  fy?: number | null;
  pinned?: boolean;
}

// D3 runtime link
export interface GraphLink {
  source: GraphNode | string;
  target: GraphNode | string;
  relation: string;
  animated?: boolean;
  totalLinks?: number;
  linkIndex?: number;
  isForwardDir?: boolean;
}
