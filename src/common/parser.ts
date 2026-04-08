import * as yaml from 'js-yaml';
import { DiagramFrontmatter, ProcessResult } from './types';

/**
 * Parse diagram source code
 * Format:
 * ```
 * ---
 * type: archDiagram | knowledgeGraph
 * title: ...
 * ---
 * diagram source...
 * ```
 * 
 * The diagram type is read from frontmatter's `type` field.
 * If not specified, defaults to 'archDiagram'.
 */
export function parseDiagramSource(source: string): ProcessResult & { 
  frontmatter: DiagramFrontmatter; 
  diagramType: string; 
  diagramSource: string 
} {
  const lines = source.split('\n');
  
  let frontmatterStart = -1;
  let frontmatterEnd = -1;
  
  // Find frontmatter boundaries
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    if (line === '---') {
      if (frontmatterStart === -1) {
        frontmatterStart = i;
      } else if (frontmatterEnd === -1) {
        frontmatterEnd = i;
        break;
      }
    }
  }
  
  // Parse frontmatter
  let frontmatter: DiagramFrontmatter = {};
  let diagramSourceStart = 0;
  
  if (frontmatterStart !== -1 && frontmatterEnd !== -1) {
    const fmLines = lines.slice(frontmatterStart + 1, frontmatterEnd).join('\n');
    try {
      frontmatter = yaml.load(fmLines) as DiagramFrontmatter || {};
    } catch (e: unknown) {
      const error = e instanceof Error ? e.message : String(e);
      return {
        success: false,
        error: `Failed to parse frontmatter: ${error}`,
        frontmatter: {},
        diagramType: '',
        diagramSource: ''
      };
    }
    diagramSourceStart = frontmatterEnd + 1;
  }
  
  // Extract diagram type from frontmatter's `type` field
  let diagramType = frontmatter.type as string || '';
  
  // If no type in frontmatter, check first non-empty line after frontmatter for legacy format
  if (!diagramType) {
    // Skip blank lines between frontmatter and diagram content
    while (diagramSourceStart < lines.length && !lines[diagramSourceStart]?.trim()) {
      diagramSourceStart++;
    }
    const firstLine = lines[diagramSourceStart]?.trim() || '';
    // Check if first line looks like a diagram type (single word, no special chars)
    if (firstLine && !firstLine.includes(':') && !firstLine.startsWith('subgraph') && 
        !firstLine.startsWith('left') && !firstLine.startsWith('right') &&
        !firstLine.startsWith('group ') &&
        !firstLine.includes(',') && !firstLine.includes('-->')) {
      diagramType = firstLine;
      diagramSourceStart++;
    }
  }
  
  // Default to archDiagram if no type specified
  if (!diagramType) {
    diagramType = 'archDiagram';
  }
  
  // Extract diagram source (everything after frontmatter)
  const diagramSource = lines.slice(diagramSourceStart).join('\n').trim();
  
  return {
    success: true,
    frontmatter,
    diagramType,
    diagramSource
  };
}

/**
 * Generate unique ID
 */
export function generateId(prefix: string = 'node'): string {
  return `${prefix}-${Math.random().toString(36).substring(2, 11)}`;
}
