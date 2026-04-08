/**
 * Diagram Type Registry
 * Each diagram type must implement this interface
 */
export interface DiagramType {
  /** Unique type identifier */
  type: string;
  /** Display name */
  name: string;
  /** Description */
  description: string;
  /** Parse frontmatter and source */
  parse(frontmatter: DiagramFrontmatter, source: string): DiagramData;
  /** Render diagram to DOM element */
  render(container: HTMLElement, data: DiagramData): void;
}

/**
 * Common frontmatter structure
 */
export interface DiagramFrontmatter {
  type?: string;
  title?: string;
  name?: string;
  description?: string;
  height?: number;
  theme?: string;
  [key: string]: unknown;
}

/**
 * Base diagram data structure
 */
export interface DiagramData {
  type: string;
  frontmatter: DiagramFrontmatter;
}

/**
 * Diagram processor result
 */
export interface ProcessResult {
  success: boolean;
  data?: DiagramData;
  error?: string;
}
