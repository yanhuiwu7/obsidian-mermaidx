import { Plugin, MarkdownPostProcessorContext, Component, TFile } from 'obsidian';
import { parseDiagramSource } from './common/parser';
import { parseArchDiagram } from './arch/parser';
import { renderArchDiagram } from './arch/renderer';
import { KnowledgeGraphRenderer } from './knowledge/renderer';
import { parseSwimlane } from './swimlane/parser';
import { SwimlaneRenderer } from './swimlane/renderer';

const CODEBLOCK_LANG = 'mermaidX';

// Minimal interface for checking duplicate code block processor registration
// This is needed for hot-reload scenarios
interface MetadataCacheProcessors {
  [language: string]: unknown;
}

interface MetadataCacheWithProcessors {
  processors?: MetadataCacheProcessors;
}

// ============================================
// Plugin settings
// ============================================
interface MermaidxSettings {
  nodePositions: Record<string, Record<string, { x: number; y: number }>>;
  swimlanePositions: Record<string, Record<string, { x: number; y: number; pinned: boolean }>>;
}

const DEFAULT_SETTINGS: MermaidxSettings = {
  nodePositions: {},
  swimlanePositions: {},
};

export default class MermaidXPlugin extends Plugin {
  private settings: MermaidxSettings = { ...DEFAULT_SETTINGS };

  async onload() {
    await this.loadSettings();

    // Register mermaidX code block processor
    // Guard against duplicate registration during hot-reload
    const metaCache = this.app.metadataCache as unknown as MetadataCacheWithProcessors;
    const existingProcessor = metaCache.processors?.[CODEBLOCK_LANG];
    if (!existingProcessor) {
      this.registerMarkdownCodeBlockProcessor(
        CODEBLOCK_LANG,
        this.processCodeBlock.bind(this)
      );
    }

    // Register file rename event for position key migration
    this.registerEvent(
      this.app.vault.on('rename', (file, oldPath) => {
        void this.migratePositionKeys(file.path, oldPath);
      })
    );
  }

  async processCodeBlock(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) {
    try {
      // Ensure settings are loaded before processing (async race condition fix)
      await this.loadSettings();

      // Parse source
      const result = parseDiagramSource(source);

      if (!result.success) {
        el.createEl('div', {
          text: `Error: ${result.error}`,
          cls: 'mermaidx-error'
        });
        return;
      }

      const { diagramType } = result;
      const themeName = result.frontmatter.theme || null;

      // Helper: update theme in code block frontmatter
      // Uses ctx.sourcePath + source section to locate the exact code block
      const updateThemeInSource = (newTheme: string): void => {
        if (!ctx?.sourcePath) return;
        const file = this.app.vault.getAbstractFileByPath(ctx.sourcePath);
        if (!(file instanceof TFile)) return;
        void this.app.vault.read(file).then((content) => {
          const newContent = this.replaceCodeBlockFrontmatter(content, source, 'theme', newTheme);
          if (newContent !== content) {
            void this.app.vault.modify(file, newContent);
          }
        });
      };

      // Route to appropriate diagram processor
      switch (diagramType) {
        case 'archDiagram':
        case 'arch': {
          const archData = parseArchDiagram(result.frontmatter, result.diagramSource);
          renderArchDiagram(el, archData, themeName, updateThemeInSource);
          break;
        }

        case 'knowledgeGraph':
        case 'knowledge': {
          // Create a fresh renderer + component per code block (like old plugin)
          const component = new Component();
          component.load();
          const renderer = new KnowledgeGraphRenderer(this.app, component);
          renderer.setPositionCallbacks(
            this.saveNodePositions.bind(this),
            this.loadNodePositions.bind(this),
            this.clearNodePositions.bind(this)
          );
          void renderer.render(source, el, ctx, themeName, updateThemeInSource);
          break;
        }

        case 'swimlane': {
          // Parse swimlane diagram
          const swimlaneResult = parseSwimlane(source);
          if (swimlaneResult.diagram.lanes.length === 0) {
            el.createEl('div', {
              text: 'No swimlanes defined. Use "swimlane" or "lane" to define swimlanes.',
              cls: 'swimlane-error'
            });
            break;
          }
          // Create swimlane renderer
          const swimlaneRenderer = new SwimlaneRenderer(el, swimlaneResult.diagram, themeName, updateThemeInSource);

          // Set up position persistence
          const sourcePath = ctx?.sourcePath || 'unknown';
          const positionKey = this.generateSwimlaneKey(sourcePath, source);
          swimlaneRenderer.setPositionCallbacks(
            this.saveSwimlanePositions.bind(this, positionKey),
            this.loadSwimlanePositions.bind(this, positionKey),
            () => this.clearSwimlanePositions(positionKey)
          );

          // Load saved positions before render
          const savedPositions = this.loadSwimlanePositions(positionKey);
          if (savedPositions) {
            swimlaneRenderer.loadPositions(savedPositions);
          }

          void swimlaneRenderer.render();
          break;
        }

        default:
          el.createEl('div', {
            text: `Unknown diagram type: ${diagramType}. Use type: archDiagram, knowledgeGraph, or swimlane in frontmatter.`,
            cls: 'mermaidx-error'
          });
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      el.createEl('div', {
        text: `Error processing diagram: ${message}`,
        cls: 'mermaidx-error'
      });
    }
  }

  // ============================================
  // Settings persistence
  // ============================================
  private async loadSettings() {
    const saved = await this.loadData() as Partial<MermaidxSettings>;
    this.settings = Object.assign({}, DEFAULT_SETTINGS, saved);
    if (saved?.nodePositions) {
      this.settings.nodePositions = saved.nodePositions;
    }
    if (saved?.swimlanePositions) {
      this.settings.swimlanePositions = saved.swimlanePositions;
    }
  }

  private async saveSettings() {
    await this.saveData(this.settings);
  }

  // ============================================
  // Node position persistence
  // ============================================
  private async saveNodePositions(
    key: string,
    positions: Record<string, { x: number; y: number }>
  ): Promise<void> {
    if (!this.settings.nodePositions) {
      this.settings.nodePositions = {};
    }
    this.settings.nodePositions[key] = positions;
    await this.saveSettings();
  }

  private loadNodePositions(
    key: string
  ): Record<string, { x: number; y: number }> | undefined {
    return this.settings.nodePositions?.[key];
  }

  private async clearNodePositions(key: string): Promise<void> {
    if (this.settings.nodePositions && key in this.settings.nodePositions) {
      delete this.settings.nodePositions[key];
      await this.saveSettings();
    }
  }

  private async migratePositionKeys(newPath: string, oldPath: string): Promise<void> {
    if (!this.settings.nodePositions) return;

    const oldPrefix = `${oldPath}::`;
    const newPrefix = `${newPath}::`;
    const positions = this.settings.nodePositions;

    for (const [key, value] of Object.entries(positions)) {
      if (key.startsWith(oldPrefix)) {
        const newKey = newPrefix + key.slice(oldPrefix.length);
        positions[newKey] = value;
        delete positions[key];
      }
    }

    // Also migrate swimlane positions
    if (this.settings.swimlanePositions) {
      for (const [key, value] of Object.entries(this.settings.swimlanePositions)) {
        if (key.startsWith(oldPrefix)) {
          const newKey = newPrefix + key.slice(oldPrefix.length);
          this.settings.swimlanePositions[newKey] = value;
          delete this.settings.swimlanePositions[key];
        }
      }
    }

    await this.saveSettings();
  }

  // ============================================
  // Swimlane position persistence
  // ============================================

  /**
   * Generate a unique key for swimlane positions based on source content
   */
  private generateSwimlaneKey(sourcePath: string, source: string): string {
    // Create a simple hash of the source content
    const hash = this.simpleHash(source);
    return `${sourcePath}::swimlane::${hash}`;
  }

  /**
   * Simple hash function for content
   */
  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(36);
  }

  private async saveSwimlanePositions(
    key: string,
    positions: Record<string, { x: number; y: number; pinned: boolean }>
  ): Promise<void> {
    if (!this.settings.swimlanePositions) {
      this.settings.swimlanePositions = {};
    }
    this.settings.swimlanePositions[key] = positions;
    await this.saveSettings();
  }

  private loadSwimlanePositions(
    key: string
  ): Record<string, { x: number; y: number; pinned: boolean }> | undefined {
    return this.settings.swimlanePositions?.[key];
  }

  private clearSwimlanePositions(key: string): void {
    if (this.settings.swimlanePositions && key in this.settings.swimlanePositions) {
      delete this.settings.swimlanePositions[key];
      void this.saveSettings();
    }
  }

  /**
   * Replace or add a field inside a specific mermaidX code block's YAML frontmatter.
   * Locates the code block by matching the raw source, then modifies its frontmatter.
   */
  private replaceCodeBlockFrontmatter(
    fileContent: string,
    codeBlockSource: string,
    field: string,
    value: string
  ): string {
    // Find the mermaidX code block in the file that contains the matching source
    const codeBlockRegex = /```mermaidX\s*\n([\s\S]*?)```/g;
    let match: RegExpExecArray | null;

    while ((match = codeBlockRegex.exec(fileContent)) !== null) {
      const blockContent = match[1];
      // Normalize both for comparison (handle trailing newline differences)
      if (blockContent.trimEnd() === codeBlockSource.trimEnd()) {
        // Found the matching code block — now modify its frontmatter
        const blockStart = match.index + match[0].indexOf(blockContent);
        const lines = blockContent.split('\n');
        let fmStart = -1;
        let fmEnd = -1;

        for (let i = 0; i < lines.length; i++) {
          if (lines[i].trim() === '---') {
            if (fmStart === -1) {
              fmStart = i;
            } else if (fmEnd === -1) {
              fmEnd = i;
              break;
            }
          }
        }

        if (fmStart === -1 || fmEnd === -1) {
          // No frontmatter in code block — insert one
          const indent = lines[0]?.match(/^(\s*)/)?.[1] || '';
          const newFm = `${indent}---\n${indent}${field}: ${value}\n${indent}---\n`;
          return (
            fileContent.slice(0, blockStart) +
            newFm +
            blockContent +
            fileContent.slice(blockStart + blockContent.length)
          );
        }

        // Check if field already exists
        const fieldPattern = new RegExp(`^\\s*${field}:\\s*`);
        let fieldIndex = -1;
        for (let i = fmStart + 1; i < fmEnd; i++) {
          if (fieldPattern.test(lines[i])) {
            fieldIndex = i;
            break;
          }
        }

        if (fieldIndex !== -1) {
          lines[fieldIndex] = `${field}: ${value}`;
        } else {
          lines.splice(fmEnd, 0, `${field}: ${value}`);
        }

        const newBlockContent = lines.join('\n');
        return (
          fileContent.slice(0, blockStart) +
          newBlockContent +
          fileContent.slice(blockStart + blockContent.length)
        );
      }
    }

    // No matching code block found — do nothing
    return fileContent;
  }
}
