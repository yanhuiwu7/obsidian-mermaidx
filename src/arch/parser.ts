import { ArchDiagramData, ArchLayer, ArchGroup, ArchNode } from './types';
import { DiagramFrontmatter } from '../common/types';

/**
 * Parse architecture diagram source
 * Syntax compatible with Mermaid flowchart
 */
export function parseArchDiagram(frontmatter: DiagramFrontmatter, source: string): ArchDiagramData {
  const lines = source.split('\n');
  
  const data: ArchDiagramData = {
    type: 'archDiagram',
    frontmatter,
    middleLayers: [],
    links: [],
    nodeStyles: undefined,
  };

  // Color types for cycling
  const colorTypes: ('external' | 'service' | 'user' | 'infra' | 'monitor' | 'node')[] = [
    'external', 'service', 'user', 'infra', 'monitor', 'node'
  ];

  // Stack-based parser
  interface StackFrame {
    type: 'left' | 'right' | 'subgraph';
    layer?: ArchLayer;
    group?: ArchGroup;
  }
  
  const stack: StackFrame[] = [];

  const currentLayer = (): ArchLayer | null => {
    for (let k = stack.length - 1; k >= 0; k--) {
      if (stack[k].layer) return stack[k].layer!;
    }
    return null;
  };

  const currentGroup = (): ArchGroup | null => {
    for (let k = stack.length - 1; k >= 0; k--) {
      if (stack[k].group) return stack[k].group!;
    }
    return null;
  };

  // Parse lines
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Skip empty lines and comments
    if (!line || line.startsWith('%%')) continue;

    // @style directive: @style #color node1, node2, ...
    if (line.startsWith('@style ')) {
      const rest = line.slice(7).trim();
      const colorMatch = rest.match(/#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/);
      if (colorMatch) {
        const color = colorMatch[0];
        const remaining = rest.replace(colorMatch[0], '').trim();
        const names = remaining.split(',').map(s => s.trim()).filter(Boolean);
        if (!data.nodeStyles) data.nodeStyles = new Map();
        names.forEach(name => data.nodeStyles!.set(name, color));
      }
      continue;
    }

    // end block
    if (line === 'end') {
      stack.pop();
      continue;
    }

    // direction
    if (/^direction\s+(LR|TD|TB|RL|BT)$/.test(line)) {
      const rawDir = line.split(/\s+/)[1] as 'LR' | 'TD' | 'TB' | 'RL' | 'BT';
      const dir: 'LR' | 'TD' | 'RL' | 'BT' = rawDir === 'TB' ? 'TD' : rawDir;
      const topFrame = stack[stack.length - 1];
      if (topFrame?.group) {
        topFrame.group.direction = dir;
      } else if (topFrame?.layer) {
        topFrame.layer.direction = dir;
      }
      continue;
    }

    // columns N — constrain nodes per row (LR) or per column (TD)
    const columnsMatch = line.match(/^columns\s+(\d+)$/);
    if (columnsMatch) {
      const cols = parseInt(columnsMatch[1], 10);
      if (cols > 0) {
        const topFrame = stack[stack.length - 1];
        if (topFrame?.group) {
          topFrame.group.columns = cols;
        } else if (topFrame?.layer) {
          topFrame.layer.columns = cols;
        }
      }
      continue;
    }

    // left: id[label] or left: label
    if (line.startsWith('left:')) {
      const raw = line.substring(5).trim();
      const bracketMatch = raw.match(/^([\w\u4e00-\u9fa5-]+)\[(.+)\]$/);
      const id = bracketMatch ? bracketMatch[1] : raw;
      const label = bracketMatch ? bracketMatch[2] : raw;
      const layer: ArchLayer = {
        id,
        label,
        groups: [],
        nodes: [],
        direction: 'TD',
        nodeType: colorTypes[0]
      };
      data.leftLayer = layer;
      stack.push({ type: 'left', layer });
      continue;
    }

    // right: id[label] or right: label
    if (line.startsWith('right:')) {
      const raw = line.substring(6).trim();
      const bracketMatch = raw.match(/^([\w\u4e00-\u9fa5-]+)\[(.+)\]$/);
      const id = bracketMatch ? bracketMatch[1] : raw;
      const label = bracketMatch ? bracketMatch[2] : raw;
      const rightColorIndex = data.middleLayers.length + (data.leftLayer ? 1 : 0);
      const layer: ArchLayer = {
        id,
        label,
        groups: [],
        nodes: [],
        direction: 'TD',
        nodeType: colorTypes[rightColorIndex % colorTypes.length]
      };
      data.rightLayer = layer;
      stack.push({ type: 'right', layer });
      continue;
    }

    // subgraph id[label] or subgraph label
    if (line.startsWith('subgraph ') || line === 'subgraph') {
      const raw = line.startsWith('subgraph ') ? line.substring(9).trim() : '';
      // Parse id[label] or just label
      const bracketMatch = raw.match(/^([\w\u4e00-\u9fa5-]+)\[(.+)\]$/);
      const id = bracketMatch ? bracketMatch[1] : raw;
      const label = bracketMatch ? bracketMatch[2] : raw;
      const parentLayer = currentLayer();

      if (!parentLayer) {
        // Top-level subgraph → middle layer
        const idx = data.middleLayers.length + (data.leftLayer ? 1 : 0);
        const layer: ArchLayer = {
          id,
          label,
          groups: [],
          nodes: [],
          direction: 'LR',
          nodeType: colorTypes[idx % colorTypes.length]
        };
        data.middleLayers.push(layer);
        stack.push({ type: 'subgraph', layer });
      } else {
        // Nested subgraph → group
        const group: ArchGroup = {
          id,
          label,
          nodes: [],
          direction: 'LR'
        };
        if (parentLayer.groups) {
          parentLayer.groups.push(group);
        }
        stack.push({ type: 'subgraph', group });
      }
      continue;
    }

    // Links: nodeA -->|label| nodeB, nodeA ==> nodeB, nodeA -.-> nodeB
    const linkPattern = /^([\w\u4e00-\u9fa5-]+)\s*(-->|==>|-\.->)\s*(?:\|([^|]*)\|\s*)?([\w\u4e00-\u9fa5-]+)$/;
    const linkMatch = line.match(linkPattern);
    if (linkMatch) {
      const fromId = linkMatch[1].trim();
      const arrowType = linkMatch[2];
      const label = linkMatch[3]?.trim() || undefined;
      const toId = linkMatch[4].trim();
      let style: 'solid' | 'dashed' | 'thick' = 'solid';
      if (arrowType === '==>') style = 'thick';
      else if (arrowType === '-.->') style = 'dashed';
      data.links.push({ from: fromId, to: toId, label, style });
      continue;
    }

    // Skip lines with arrow patterns
    if (line.includes('-->') || line.includes('==>') || line.includes('.->')) continue;

    // Node formats
    const layer = currentLayer();
    const group = currentGroup();
    const nodeType = layer?.nodeType || 'service';

    // id[text] - rectangle
    const nodeIdTextMatch = line.match(/^([\w\u4e00-\u9fa5-]+)\[(.+)\]$/);
    if (nodeIdTextMatch) {
      const node: ArchNode = {
        id: nodeIdTextMatch[1],
        name: nodeIdTextMatch[2],
        type: nodeType,
        shape: 'rect'
      };
      if (group) group.nodes.push(node);
      else if (layer) {
        if (!layer.nodes) layer.nodes = [];
        layer.nodes.push(node);
      }
      continue;
    }

    // id((text)) - circle (must be before round)
    const nodeIdCircleMatch = line.match(/^([\w\u4e00-\u9fa5-]+)\(\((.+)\)\)$/);
    if (nodeIdCircleMatch) {
      const node: ArchNode = {
        id: nodeIdCircleMatch[1],
        name: nodeIdCircleMatch[2],
        type: nodeType,
        shape: 'circle'
      };
      if (group) group.nodes.push(node);
      else if (layer) {
        if (!layer.nodes) layer.nodes = [];
        layer.nodes.push(node);
      }
      continue;
    }

    // id(text) - rounded rectangle
    const nodeIdRoundMatch = line.match(/^([\w\u4e00-\u9fa5-]+)\((.+)\)$/);
    if (nodeIdRoundMatch) {
      const node: ArchNode = {
        id: nodeIdRoundMatch[1],
        name: nodeIdRoundMatch[2],
        type: nodeType,
        shape: 'round'
      };
      if (group) group.nodes.push(node);
      else if (layer) {
        if (!layer.nodes) layer.nodes = [];
        layer.nodes.push(node);
      }
      continue;
    }

    // Plain name (including Chinese characters, common punctuation like /, and emoji)
    const plainNodeMatch = line.match(/^[\w\u4e00-\u9fa5\-/\p{Emoji_Presentation}\p{Extended_Pictographic}\uFE0F\u200D]+$/u);
    if (plainNodeMatch) {
      const nodeId = line.toLowerCase().replace(/\s+/g, '-').replace(/[^\w\u4e00-\u9fa5\-/\p{Emoji_Presentation}\p{Extended_Pictographic}\uFE0F\u200D]/gu, '');
      const node: ArchNode = {
        id: nodeId,
        name: line,
        type: nodeType
      };
      if (group) group.nodes.push(node);
      else if (layer) {
        if (!layer.nodes) layer.nodes = [];
        layer.nodes.push(node);
      }
    }
  }

  return data;
}
