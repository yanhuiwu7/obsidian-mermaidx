# MermaidX Diagrams

A modern Obsidian plugin for creating interactive diagrams using a unified syntax.

## Features

- **Architecture Diagrams** - Visualize system architecture with layers, groups, and connections
- **Knowledge Graphs** - Create interactive knowledge graphs with drag, zoom, and pin functionality
- **Swimlane Diagrams** - Process flows with lanes, roles, and two-line nodes
- **Unified Syntax** - Use a consistent `mermaidX` code block for all diagram types
- **Theme System** - 7 built-in themes (Default, Warm, Dark, Ocean, Forest, Blueprint, Ink)
- **Custom Node Colors** - `@style` directive for per-node color customization

## Supported Diagrams

| Type | Aliases | Description |
|------|---------|-------------|
| `archDiagram` | `arch` | System architecture visualization |
| `knowledgeGraph` | `knowledge` | Interactive knowledge graph |
| `swimlane` | - | Swimlane/Process diagram |

## Quick Start

````markdown
```mermaidX
---
title: My Architecture
---
archDiagram
left: Client
  web[Web Browser]
end

subgraph Backend
  api[API Server]
  db[(Database)]
end

web -->|HTTP| api
api --> db
```
````

## Installation

1. Download the latest release
2. Copy `main.js`, `manifest.json`, and `styles.css` to your vault's `.obsidian/plugins/obsidian-mermaidx/` folder
3. Enable the plugin in Obsidian settings

## License

MIT License - see LICENSE file for details.
