# Contributing to MermaidX Diagrams

Thank you for your interest in contributing to MermaidX Diagrams!

## Development Setup

1. Clone the repository
2. Install dependencies: `npm install`
3. Make changes in the `src/` directory
4. Build: `npm run build`
5. Test in Obsidian by copying `main.js`, `manifest.json`, and `styles.css` to your vault's `.obsidian/plugins/obsidian-mermaidx/` folder

## Code Style

- Use TypeScript for all new code
- Follow existing naming conventions
- Add JSDoc comments for public functions
- Keep functions focused and small

## Adding New Diagram Types

The plugin uses a modular architecture:

```
src/
  common/     # Shared utilities (themes, types)
  arch/       # Architecture diagram module
  knowledge/  # Knowledge graph module
  swimlane/   # Swimlane diagram module
```

To add a new diagram type:

1. Create a new module directory (e.g., `src/flow/`)
2. Implement the parser and renderer
3. Register the type in `src/main.ts`

## Pull Request Process

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Make your changes
4. Ensure the build passes: `npm run build`
5. Submit a pull request

## Reporting Issues

Please include:
- Obsidian version
- Plugin version
- Steps to reproduce
- Expected vs actual behavior
