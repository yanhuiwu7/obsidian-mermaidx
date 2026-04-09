# MermaidX Diagrams - Obsidian Plugin

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![GitHub release](https://img.shields.io/github/release/yanhuiwu7/obsidian-mermaidx)](https://github.com/yanhuiwu7/obsidian-mermaidx/releases)
[![Obsidian Plugin](https://img.shields.io/badge/Obsidian-Plugin-7c3aed)](https://obsidian.md)

A unified diagram plugin for Obsidian with **MermaidX syntax** - Architecture diagrams, Knowledge graphs, and Swimlane diagrams.

## Features

- 🏗️ **Architecture Diagrams** - Layered system architecture with Mermaid-like syntax
- 🧠 **Knowledge Graphs** - Interactive force-directed concept maps
- 📊 **Swimlane Diagrams** - Process flows with lanes and roles
- 🎨 **Theme System** - 7 built-in themes with toolbar selector
- 🖌️ **Custom Node Colors** - `@style` directive for per-node color customization
- 📝 **Unified Syntax** - Single `mermaidX` code block for all diagram types
- 📱 **Responsive** - Works on desktop and mobile

## Installation

### Manual Installation

1. Download the [latest release](https://github.com/yanhuiwu7/obsidian-mermaidx/releases)
2. Extract to: `your-vault/.obsidian/plugins/obsidian-mermaidx/`
3. Enable in Settings → Community Plugins

## Quick Start

```mermaidX
---
title: My First Diagram
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

---

## Syntax Reference

### Common Structure

All MermaidX diagrams follow this structure:

````markdown
```mermaidX
---
title: Diagram Title
description: Optional description
height: 600
---
diagramType
diagram source...
```
````

### Frontmatter (Optional)

```yaml
---
title: My Diagram
description: |
  - Bullet point 1
  - Bullet point 2
height: 600
---
```

### Supported Diagram Types

| Type | Aliases | Description |
|------|---------|-------------|
| `archDiagram` | `arch` | Architecture diagram |
| `knowledgeGraph` | `knowledge` | Knowledge graph |
| `swimlane` | - | Swimlane/Process diagram |

---

## Architecture Diagram (`archDiagram`)

### Structure Blocks

```
left: Name ... end          # Left sidebar (TD default)
right: Name ... end         # Right sidebar (TD default)
subgraph Name ... end       # Middle layer (LR default)
```

Or with custom ID for layer-to-layer links:

```
left: layerId[Display Name]
subgraph layerId[Display Name]
right: layerId[Display Name]
```

### Direction Override

```
subgraph Data Layer
  direction TD
  ...
end
```

**Options:** `LR`, `TD`/`TB`, `RL`, `BT`

### Node Formats

```
nodeId[Display Text]     # Rectangle
nodeId(Display Text)    # Rounded rectangle
nodeId((Display Text))  # Circle
NodeName                 # Plain name
```

### Link Styles

```
A --> B          # Solid arrow
A ==> B          # Thick arrow
A -.-> B         # Dashed arrow
A -->|Label| B   # With label
```

### Layer-to-Layer Links

You can connect directly between layers/groups by their IDs:

```
subgraph app1[Application Layer]
end

right: external[External Systems]
  payment[Payment Service]

app1 -->|HTTP| external  # Connect layer to layer
```

### Color Assignment

Colors are automatically assigned based on layer position:

| Position | Color | CSS Class |
|----------|-------|-----------|
| `left:` | Blue | `.arch-node-external` |
| 1st `subgraph` | Green | `.arch-node-service` |
| 2nd `subgraph` | Cyan | `.arch-node-user` |
| 3rd `subgraph` | Orange | `.arch-node-infra` |
| 4th `subgraph` | Purple | `.arch-node-monitor` |
| `right:` | Gray | `.arch-node-node` |

### Custom Node Colors (`@style`)

Override default colors for specific nodes:

```
@style #f59e0b alipay, wechat
@style node1, node2 #f59e0b
```

Matches by node ID or display name. For nodes declared as `alipay[支付宝]`, both `alipay` and `支付宝` work.

---

## Knowledge Graph (`knowledgeGraph`)

### YAML Structure

```yaml
nodes:
  - id: unique-id
    name: Display Name
    type: concept
    description: Optional description
    color: #hex
    url: https://...

links:
  - source: node-id
    target: node-id
    label: relationship
    color: #hex
```

### Triple Syntax (Inline)

```
Subject, predicate, Object
```

Example:
```
Alice, works at, Google
Bob, manages, Alice
Google, located in, Mountain View
```

### Relation Styles

```
@style predicateName #color [Legend Label]
```

Example:
```
@style works at #6366f1 [Employment]
@style manages #f59e0b [Management]

Alice, works at, Google
Bob, manages, Alice
```

### Comments

```
%% This is a comment
```

### Interactive Features

| Action | Effect |
|--------|--------|
| Scroll | Zoom in/out |
| Drag background | Pan canvas |
| Drag node | Move node (auto-fixed) |
| Click node | Toggle fixed position |
| Hover node | Highlight related nodes |
| Fit button | Auto-zoom to fit |
| Label button | Toggle link labels |
| Restart button | Re-trigger force layout |

---

## Swimlane Diagram (`swimlane`)

### Basic Syntax

```
lane Lane Name
  [Node1],[Node2]    # Same row, side by side
  [Node3]             # New row
```

### Special Nodes

| Node | Description |
|------|-------------|
| `[Start]` or `Start` | Start node (unique, green circle) |
| `[End]` or `End` | End node (multiple allowed, red circle) |
| `((NodeName))` | Custom circle node |
| `[Label\|Operator]` | Two-line node (name on top, operator on bottom) |
| `[]` / `{}` / `()` / `(())` | Phantom placeholder (occupies space, not rendered) |

### Link Styles

| Syntax | Line Type | Shape |
|--------|-----------|-------|
| `A --> B` | Solid | Orthogonal path |
| `A ~~> B` | Solid | Curved path |
| `A -.-> B` | Dashed | Orthogonal path |
| `A ~~~> B` | Dashed | Curved path |
| `A -->|Label| B` | With label | Orthogonal path |

### Custom Node Colors (`@style`)

Override default colors for specific nodes:

```
@style #f59e0b 审批节点, 通知节点
@style node1, node2 #f59e0b
```

Matches by node label (the part before `|` in `[Label|Operator]` nodes). Color only affects the bottom half and border; the top half stays white for readability.

### Complete Example

```mermaidX
---
title: Approval Process
---
swimlane

lane Applicant
  [Start]
  [Fill Form],[Submit]
  [End]

lane Finance
  [Pre-review]
  [Audit],[Review]

lane Manager
  [Final Approval]
  [End]

%% Links
Start --> Fill Form
Fill Form --> Submit
Submit -->|Approve| Pre-review
Pre-review --> Audit
Audit --> Review
Review --> Final Approval
Final Approval -->|Approve| End
```

---

## Examples

### Architecture: Three-Tier Web Application

```mermaidX
---
title: Three-Tier Web Application
---
archDiagram
left: External
  payment[Payment Gateway]
  sms[SMS Service]
end

subgraph Frontend
  mobile[Mobile App]
  web[Web Portal]
end

subgraph Backend
  gateway[API Gateway]
  auth[Auth Service]
  api[Core API]
end

subgraph Data
  direction TD
  db[(MySQL)]
  cache[(Redis)]
end

right: Monitoring
  prometheus[Prometheus]
  grafana[Grafana]
end

mobile -->|HTTPS| gateway
web -->|HTTPS| gateway
gateway --> auth
gateway --> api
auth --> db
api --> db
api -.->|Cache| cache
api -->|Metrics| prometheus
```

### Knowledge Graph: Technology Stack

```mermaidX
---
title: Technology Stack
height: 500
---
knowledgeGraph
nodes:
  - id: frontend
    name: Frontend
    type: layer
  - id: react
    name: React
    type: framework
  - id: vue
    name: Vue
    type: framework
  - id: backend
    name: Backend
    type: layer
  - id: nodejs
    name: Node.js
    type: runtime
  - id: python
    name: Python
    type: runtime

links:
  - source: frontend
    target: react
    label: includes
  - source: frontend
    target: vue
    label: includes
  - source: backend
    target: nodejs
    label: uses
  - source: backend
    target: python
    label: uses
```

### Swimlane: Business Process

```mermaidX
---
title: Order Processing
---
swimlane

lane Customer
  [Start]
  [Place Order]
  [End]

lane Sales
  [Verify Order]
  [Confirm Payment]

lane Warehouse
  [Pick Items]
  [Ship Order]
  [End]

Start --> Place Order
Place Order --> Verify Order
Verify Order --> Confirm Payment
Confirm Payment --> Pick Items
Pick Items --> Ship Order
Ship Order --> End
```

---

## Development

```bash
# Install dependencies
npm install

# Build for production
npm run build

# Watch mode for development
npm run dev
```

### Project Structure

```
src/
├── main.ts           # Plugin entry point
├── common/           # Shared types, parsers, and themes
│   ├── types.ts
│   ├── parser.ts
│   └── themes.ts
├── arch/             # Architecture diagram module
│   ├── types.ts
│   ├── parser.ts
│   └── renderer.ts
├── knowledge/         # Knowledge graph module
│   ├── types.ts
│   ├── parser.ts
│   └── renderer.ts
└── swimlane/         # Swimlane diagram module
    ├── types.ts
    ├── parser.ts
    └── renderer.ts
```

### Adding New Diagram Types

1. Create a new module in `src/<type>/`
2. Implement parser and renderer
3. Register in `src/main.ts`:

```typescript
case 'myDiagram':
  const myData = parseMyDiagram(frontmatter, diagramSource);
  renderMyDiagram(el, myData);
  break;
```

---

## Changelog

### v1.0.0
- Initial release
- Architecture diagrams support
- Knowledge graphs support
- Swimlane diagrams support
- Theme system with 7 built-in themes (Default, Warm, Dark, Ocean, Forest, Blueprint, Ink)
- `@style` directive for custom node colors in architecture and swimlane diagrams
- Two-line swimlane nodes: `[Label|Operator]` — name on top, operator on bottom
- Phantom placeholder nodes: `[]` / `{}` / `()` / `(())` — occupy layout space without rendering
- Layer-to-layer connections in architecture diagrams
- Toolbar theme selector for all diagram types
- Unified mermaidX syntax

---

## License

MIT License - see [LICENSE](LICENSE) for details.

---

## Support

- **Issues:** [GitHub Issues](https://github.com/yanhuiwu7/obsidian-mermaidx/issues)
- **Discussions:** [GitHub Discussions](https://github.com/yanhuiwu7/obsidian-mermaidx/discussions)

## Credits

Built for [Obsidian](https://obsidian.md) using the Plugin API.
