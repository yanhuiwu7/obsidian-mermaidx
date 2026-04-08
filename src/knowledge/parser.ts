import * as yaml from 'js-yaml';
import { GraphConfig, NodeTypeConfig, Triple } from './types';
import { DiagramFrontmatter } from '../common/types';

// ============================================
// Parse knowledge graph source code
// Supports:
// 1. YAML style types: block
// 2. YAML style nodes: and links: blocks
// 3. Legacy @type directives
// 4. Triple format: subject, predicate, object
// ============================================

export interface ParseResult {
  config: GraphConfig;
  errors: string[];
}

export function parseKnowledgeGraph(frontmatter: DiagramFrontmatter, source: string): ParseResult {
  const errors: string[] = [];
  const lines = source.split("\n");

  let name = frontmatter.name || frontmatter.title || 'Knowledge Graph';
  let description = frontmatter.description || '';
  let height: number | undefined = frontmatter.height;
  const nodeTypes: NodeTypeConfig[] = [];
  const triples: Triple[] = [];

  // Auto-assigned color palette
  const autoColors = [
    "#6366f1", "#f59e0b", "#10b981", "#ef4444",
    "#3b82f6", "#ec4899", "#14b8a6", "#f97316",
    "#8b5cf6", "#06b6d4", "#84cc16", "#a855f7",
  ];

  let typeColorIdx = 0;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();

    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("%%")) continue;

    // types: (YAML block start)
    if (trimmed.startsWith("types:") || trimmed.startsWith("types :")) {
      const yamlResult = parseYamlTypesBlock(lines, i, typeColorIdx, autoColors);
      errors.push(...yamlResult.errors);
      if (yamlResult.nodeTypes) {
        nodeTypes.push(...yamlResult.nodeTypes);
        typeColorIdx += yamlResult.nodeTypes.length;
      }
      i = yamlResult.endIndex;
      continue;
    }

    // @type node type definition (legacy)
    if (trimmed.startsWith("@type ")) {
      const typeResult = parseTypeDirective(trimmed, typeColorIdx, autoColors);
      if (typeResult.error) {
        errors.push(`Line ${i + 1}: ${typeResult.error}`);
      } else if (typeResult.nodeType) {
        nodeTypes.push(typeResult.nodeType);
        typeColorIdx++;
      }
      continue;
    }

    // nodes: (YAML block for node definitions)
    if (trimmed.startsWith("nodes:") || trimmed.startsWith("nodes :")) {
      const yamlResult = parseYamlNodesBlock(lines, i);
      errors.push(...yamlResult.errors);
      // Add default type for nodes if no type specified
      for (const node of yamlResult.nodes || []) {
        if (!nodeTypes.some(t => t.nodes?.includes(node.id))) {
          nodeTypes.push({
            id: `type_${typeColorIdx}`,
            label: 'Node',
            color: autoColors[typeColorIdx % autoColors.length],
            nodes: [node.id],
          });
          typeColorIdx++;
        }
      }
      const newTriples = yamlResult.triples || [];
      triples.push(...newTriples);
      i = yamlResult.endIndex;
      continue;
    }

    // links: (YAML block for link definitions)
    if (trimmed.startsWith("links:") || trimmed.startsWith("links :")) {
      const yamlResult = parseYamlLinksBlock(lines, i);
      errors.push(...yamlResult.errors);
      const newTriples = yamlResult.triples || [];
      triples.push(...newTriples);
      i = yamlResult.endIndex;
      continue;
    }

    // Triple: subject, predicate, object
    const parts = trimmed.split(",").map((s) => s.trim()).filter(Boolean);
    if (parts.length >= 3) {
      const triple: Triple = {
        subject: parts[0],
        predicate: parts[1],
        object: parts.slice(2).join(",").trim(),
      };
      triples.push(triple);
    } else if (parts.length > 0) {
      errors.push(`Line ${i + 1}: "${trimmed}" has invalid format. Triples should use commas to separate three parts (subject, predicate, object)`);
    }
  }

  const config: GraphConfig = {
    id: generateId(name),
    name,
    description,
    height,
    triples,
    nodeTypes,
  };

  return { config, errors };
}

// ============================================
// Parse YAML types block
// ============================================
function parseYamlTypesBlock(
  lines: string[],
  startIndex: number,
  baseColorIdx: number,
  autoColors: string[]
): { nodeTypes?: NodeTypeConfig[]; errors: string[]; endIndex: number } {
  const errors: string[] = [];
  const nodeTypes: NodeTypeConfig[] = [];

  const yamlLines: string[] = [];
  let i = startIndex + 1;
  let hasContent = false;

  for (; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed && !line.startsWith("\t") && !line.startsWith(" ") && !trimmed.startsWith("#")) {
      break;
    }

    if (!trimmed || trimmed.startsWith("#")) continue;

    yamlLines.push(line);
    hasContent = true;
  }

  if (!hasContent) {
    return { errors: [`Line ${startIndex + 1}: types: block is empty`], endIndex: i };
  }

  try {
    const raw = yamlLines.join("\n");
    const normalized = raw.replace(/,(\s*[\]}\]])/g, "$1");
    const parsed = yaml.load(normalized);

    if (!parsed || typeof parsed !== "object") {
      throw new Error("types: block must be a YAML list");
    }

    const typesList = parsed as unknown[];
    if (!Array.isArray(typesList)) {
      throw new Error("types: must be a YAML array starting with '- '");
    }

    let colorIdx = baseColorIdx;
    for (const item of typesList) {
      if (!item || typeof item !== "object") {
        errors.push(`Invalid type entry: must be an object`);
        continue;
      }

      const entry = item as Record<string, unknown>;
      const labelRaw = entry.label ?? "";
      const label = typeof labelRaw === "string" ? labelRaw : "";
      const colorRaw = entry.color;
      const color = typeof colorRaw === "string" ? colorRaw : autoColors[colorIdx % autoColors.length];

      let nodes: string[] = [];
      if (entry.nodes) {
        if (Array.isArray(entry.nodes)) {
          nodes = entry.nodes.map((n) => String(n)).filter(Boolean);
        } else if (typeof entry.nodes === "string") {
          nodes = String(entry.nodes).split(",").map((s) => s.trim()).filter(Boolean);
        }
      }

      if (!label) {
        errors.push(`Type entry missing required field: label`);
        continue;
      }

      nodeTypes.push({
        id: `type_${label}_${colorIdx}`,
        label,
        color,
        nodes,
      });
      colorIdx++;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(`Line ${startIndex + 1}: Failed to parse types: block - ${msg}`);
  }

  return { nodeTypes, errors, endIndex: i };
}

// ============================================
// Parse @type directive (legacy)
// ============================================
function parseTypeDirective(
  line: string,
  colorIdx: number,
  autoColors: string[]
): { nodeType?: NodeTypeConfig; error?: string } {
  const rest = line.slice(6).trim();
  if (!rest) return { error: "@type directive missing content" };

  const colorMatch = rest.match(/#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/);
  let color = autoColors[colorIdx % autoColors.length];
  let remaining = rest;

  if (colorMatch) {
    color = colorMatch[0];
    remaining = rest.replace(colorMatch[0], "").trim();
  }

  const tokens = remaining.split(/\s+/);
  const label = tokens[0];
  if (!label) return { error: "@type missing type name" };

  const nodesRaw = tokens.slice(1).join(" ");
  const nodes = nodesRaw
    ? nodesRaw.split(",").map((s) => s.trim()).filter(Boolean)
    : [];

  return {
    nodeType: {
      id: `type_${label}_${colorIdx}`,
      label,
      color,
      nodes,
    },
  };
}

// ============================================
// Parse YAML nodes: block
// Format: nodes: - id: xxx, name: XXX, type: xxx, description: xxx, url: xxx
// ============================================
interface ParsedNode {
  id: string;
  name?: string;
  type?: string;
  description?: string;
  color?: string;
  url?: string;
}

function parseYamlNodesBlock(
  lines: string[],
  startIndex: number
): { nodes?: ParsedNode[]; triples?: Triple[]; errors: string[]; endIndex: number } {
  const errors: string[] = [];
  const nodes: ParsedNode[] = [];

  const yamlLines: string[] = [];
  let i = startIndex + 1;
  let hasContent = false;

  for (; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed && !line.startsWith("\t") && !line.startsWith(" ") && !trimmed.startsWith("#")) {
      break;
    }

    if (!trimmed || trimmed.startsWith("#")) continue;

    yamlLines.push(line);
    hasContent = true;
  }

  if (!hasContent) {
    return { errors: [`Line ${startIndex + 1}: nodes: block is empty`], endIndex: i };
  }

  try {
    const raw = yamlLines.join("\n");
    const normalized = raw.replace(/,(\s*[\]}\]])/g, "$1");
    const parsed = yaml.load(normalized);

    if (!parsed || typeof parsed !== "object") {
      throw new Error("nodes: block must be a YAML list");
    }

    const nodesList = parsed as unknown[];
    if (!Array.isArray(nodesList)) {
      throw new Error("nodes: must be a YAML array starting with '- '");
    }

    for (const item of nodesList) {
      if (!item || typeof item !== "object") {
        errors.push(`Invalid node entry: must be an object`);
        continue;
      }

      const entry = item as Record<string, unknown>;
      const idRaw = entry.id ?? entry.name ?? entry.label;
      const id = typeof idRaw === "string" ? idRaw : String(idRaw);
      const name = typeof entry.name === "string" ? entry.name : (typeof entry.label === "string" ? entry.label : id);

      if (!id) {
        errors.push(`Node entry missing required field: id or name`);
        continue;
      }

      nodes.push({
        id,
        name,
        type: typeof entry.type === "string" ? entry.type : undefined,
        description: typeof entry.description === "string" ? entry.description : undefined,
        color: typeof entry.color === "string" ? entry.color : undefined,
        url: typeof entry.url === "string" ? entry.url : undefined,
      });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(`Line ${startIndex + 1}: Failed to parse nodes: block - ${msg}`);
  }

  return { nodes, errors, endIndex: i };
}

// ============================================
// Parse YAML links: block
// Format: links: - source: xxx, target: xxx, label: xxx, color: xxx
// ============================================
function parseYamlLinksBlock(
  lines: string[],
  startIndex: number
): { triples?: Triple[]; errors: string[]; endIndex: number } {
  const errors: string[] = [];
  const triples: Triple[] = [];

  const yamlLines: string[] = [];
  let i = startIndex + 1;
  let hasContent = false;

  for (; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed && !line.startsWith("\t") && !line.startsWith(" ") && !trimmed.startsWith("#")) {
      break;
    }

    if (!trimmed || trimmed.startsWith("#")) continue;

    yamlLines.push(line);
    hasContent = true;
  }

  if (!hasContent) {
    return { errors: [`Line ${startIndex + 1}: links: block is empty`], endIndex: i };
  }

  try {
    const raw = yamlLines.join("\n");
    const normalized = raw.replace(/,(\s*[\]}\]])/g, "$1");
    const parsed = yaml.load(normalized);

    if (!parsed || typeof parsed !== "object") {
      throw new Error("links: block must be a YAML list");
    }

    const linksList = parsed as unknown[];
    if (!Array.isArray(linksList)) {
      throw new Error("links: must be a YAML array starting with '- '");
    }

    for (const item of linksList) {
      if (!item || typeof item !== "object") {
        errors.push(`Invalid link entry: must be an object`);
        continue;
      }

      const entry = item as Record<string, unknown>;
      const source = typeof entry.source === "string" ? entry.source : String(entry.source ?? "");
      const target = typeof entry.target === "string" ? entry.target : String(entry.target ?? "");
      const label = typeof entry.label === "string" ? entry.label :
                    typeof entry.relation === "string" ? entry.relation :
                    typeof entry.predicate === "string" ? entry.predicate : "";

      if (!source || !target) {
        errors.push(`Link entry missing required fields: source or target`);
        continue;
      }

      triples.push({
        subject: source,
        predicate: label,
        object: target,
      });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(`Line ${startIndex + 1}: Failed to parse links: block - ${msg}`);
  }

  return { triples, errors, endIndex: i };
}

// ============================================
// Utility
// ============================================
function generateId(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[\s]+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
    .slice(0, 20);
  return `kg_${slug || "graph"}_${Date.now().toString(36)}`;
}
