import { DiagramData } from '../common/types';

/**
 * Architecture Diagram Node
 */
export interface ArchNode {
  id: string;
  name: string;
  type: 'user' | 'service' | 'infra' | 'external' | 'monitor' | 'node';
  description?: string;
  shape?: 'rect' | 'round' | 'circle';
}

/**
 * Architecture Diagram Group
 */
export interface ArchGroup {
  id: string;
  label: string;
  nodes: ArchNode[];
  direction?: 'LR' | 'TD' | 'RL' | 'BT';
  columns?: number;
}

/**
 * Architecture Diagram Layer
 */
export interface ArchLayer {
  id: string;
  label: string;
  groups?: ArchGroup[];
  nodes?: ArchNode[];
  direction?: 'LR' | 'TD' | 'TB' | 'RL' | 'BT';
  columns?: number;
  nodeType?: 'user' | 'service' | 'infra' | 'external' | 'monitor' | 'node';
}

/**
 * Architecture Diagram Link
 */
export interface ArchLink {
  from: string;
  to: string;
  label?: string;
  style?: 'solid' | 'dashed' | 'thick';
}

/**
 * Architecture Diagram Data
 */
export interface ArchDiagramData extends DiagramData {
  type: 'archDiagram';
  leftLayer?: ArchLayer;
  middleLayers: ArchLayer[];
  rightLayer?: ArchLayer;
  links: ArchLink[];
  // Custom node styles: node name -> hex color
  nodeStyles?: Map<string, string>;
}
