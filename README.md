# Heimdall UI Design System

Production component library for the Heimdall design system. Built with React 18, TypeScript, Tailwind CSS, and self-hosted fonts.

**Live component showcase:** https://tinkermonkey.github.io/heimdall/

## Phase 1: Foundation & Core Components

This phase establishes the token system, build infrastructure, and core component library.

### ✅ Completed

- Vite + React 18 + TypeScript + Tailwind CSS build pipeline
- CSS custom property token system (light canvas default mode)
- Cyan accent tokens (brand primary color)
- Self-hosted Inter and JetBrains Mono fonts (local file declarations)
- Tailwind theme extending with CSS variable references
- Playwright testing infrastructure with animation freezing utilities
- Base test utilities for font loading, dark-canvas toggle, and token validation
- 28 UI components across 7 categories (primitives, forms, data display, shell, navigation, dialogs, containers)
- Comprehensive test suite (5 spec files covering foundations, primitives, data display, shell, and overlays)

### Getting Started

```bash
# Install dependencies
npm install

# Development server
npm run dev

# Build for production
npm run build

# Run tests
npm test

# Run tests with UI
npm run test:ui
```

### Agent skills

The package ships `agent-skills/`: Claude Code skills that document every exported component (props with defaults, usage examples, gotchas) for coding agents building on Heimdall. Link them into a consumer project's `.claude/skills/` so they update with the package:

```bash
mkdir -p .claude/skills && for d in node_modules/@tinkermonkey/heimdall-ui/agent-skills/*; do ln -sfn "../../$d" ".claude/skills/$(basename "$d")"; done
```

| Skill | Covers |
| ----- | ------ |
| `heimdall-primitives` | Icon, Avatar, Button, Chip, Badge, StatusBadge, VersionPill, SegmentedControl |
| `heimdall-inputs` | TextInput, TextArea, NumberInput, Select, TriState, Field, FilterDropdown, EntityPicker, KeyValueEditor, OrderedList, RelationshipBuilder |
| `heimdall-data-display` | StatTile, StatGrid, Table, KVGrid, InspectorPanel, ResultCard, AssetCard, AssetGrid, MapCanvas |
| `heimdall-navigation` | NavItem, Sidebar, Topbar, TabBar |
| `heimdall-shell` | AppTitle, Titlebar, Statusbar, ShellLayout |
| `heimdall-overlays` | Modal, ConfirmDialog, Toast, Tooltip, Popover, CommandPalette, WorkspaceSwitcherDialog, Drawer |
| `heimdall-layout` | Panel, SplitPane, `useMediaQuery` |
| `heimdall-charts` | ChartWrapper, Sparkline, LineChart, BarChart, BarV, BarH, StackedBar, Donut, Heatmap, StatusTimeline, ProgressBar, MetricRow |
| `heimdall-page-patterns` | PageHeader, FilterBar, ActivityTimeline, AlertStrip, QuickAccessGrid, QuickAccessTile, ConfigTile, PipelineCard, FormCallout, RowMenu |
| `heimdall-chat` | ChatMessage, ToolBlock, ThinkingBlock, ChatDivider, ChatSuggestions, ChatComposer, ChatContainer, ChatMarkdownContent |
| `heimdall-graph` | GraphCanvas and its parts, the headless layout engines, HierarchyTree, DetailDrawer |
| `heimdall-observability` | TraceViewer (with OTLP and X-Ray adapters), LogStream, DiffViewer, HashSetDiff, SideBySideDiff, VersionTimeline, LineageRail |
| `heimdall-planning` | Calendar, MiniCalendar, KanbanBoard |

`npm run check:skills` fails when an exported component or utility has no skill coverage, or when a props table names a prop the code doesn't have or leaves one out. The category list lives in `.claude/commands/refine-component-skills.md`.

### Project Structure

```
src/
├── components/                # 28 UI components
│   ├── Icon.tsx              # Icon renderer
│   ├── Button.tsx            # Button component
│   ├── Modal.tsx             # Modal dialog
│   └── [24 more components]
├── test-pages/               # Test page implementations
├── fonts/
│   ├── fonts.css              # @font-face declarations
│   ├── inter/                 # Inter font files (self-hosted)
│   └── jetbrains-mono/        # JetBrains Mono files (self-hosted)
├── tokens/
│   └── tokens.css             # Design tokens as CSS custom properties
├── index.css                  # Main stylesheet (tokens + Tailwind)
├── index.ts                   # Barrel export (28 components)
├── main.tsx                   # Vite entry point
└── App.tsx                    # Root component

tests/
├── foundation.spec.ts         # Token system validation tests
├── primitives.spec.ts         # Primitive components tests
├── data-display.spec.ts       # Data display components tests
├── shell-framework.spec.ts    # Shell framework tests
├── overlay-components.spec.ts # Overlay components tests
├── overlay-advanced.spec.ts   # Advanced overlay tests
└── utils/
    └── test-helpers.ts        # Test utilities

tailwind.config.ts             # Tailwind theme extending CSS variables
playwright.config.ts           # Playwright testing configuration
postcss.config.js              # PostCSS + Tailwind + Autoprefixer
vite.config.ts                 # Vite build configuration
```

### Design Token Reference

#### Two-Surface Architecture

Every screen has exactly two surfaces:

- **Shell**: Always dark (`#0B0F14`)
- **Canvas**: Light default (`#FFFFFF`)

Token variables automatically resolve based on surface context. No component-level conditional rendering needed.

#### Accent Color (Cyan)

```css
--accent-primary:       #22d3ee   /* bright, active states */
--accent-primary-hover: #06b6d4   /* hover state */
--accent-primary-deep:  #0e7ea3   /* deep/CTA */
```

#### Semantic Status Colors

```css
--status-ok:       #22c55e   /* emerald, ok/running */
--status-warn:     #eab308   /* amber, warn/degraded */
--status-error:    #ef4444   /* rose, error/failed */
--status-emerald:  #10b981
--status-amber:    #f59e0b
--status-rose:     #f43f5e
--status-violet:   #8b5cf6
```

### Font Files

Font files are declared but not yet self-hosted. Download from:

- **Inter**: https://github.com/rsms/inter/releases (weights: 300–900)
- **JetBrains Mono**: https://github.com/JetBrains/JetBrainsMono/releases (weights: 400, 500, 600)

Place `.woff2` files in `src/fonts/{inter,jetbrains-mono}/` directories.

### Build Output

The library builds to ES modules with TypeScript types:

```
dist/
├── index.js        # Component library
├── index.d.ts      # TypeScript declarations
└── style.css       # Compiled CSS (tokens + components)
```

### Testing

Tests validate:

- Light canvas tokens applied by default
- Cyan accent color (brand primary)
- Semantic status colors
- Radius and spacing scale
- Animation freezing for consistent screenshots
- Font loading and dark-canvas class application

Run tests:

```bash
npm test              # Headless mode
npm run test:ui       # Interactive UI
```

## Upcoming Work

Future phases will expand the design system with:

- Advanced layout components
- Data visualization components
- Enhanced accessibility features
- Visual regression testing refinements
- Storybook documentation
