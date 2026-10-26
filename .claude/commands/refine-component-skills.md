# /refine-component-skills

Create and update the Heimdall consumer skill library at `agent-skills/`. These skills are distributed with the design system package and auto-discovered by Claude Code agents building applications with `@tinkermonkey/heimdall-ui`.

**Usage:** `/refine-component-skills`
**No arguments.**

---

## Your Task

Produce (or update) the category-level skill files listed under Category Definitions in `agent-skills/` at the repo root. Each file is a self-contained reference guide for a group of related Heimdall components — copy-paste ready, with full prop tables, usage examples, and gotchas.

Process categories **one at a time** via sub-agents and write the file after each category completes, so partial runs are recoverable. The target audience for these skills is a coding agent building a consumer application — not a design system contributor.

**How consumers use these skills:** The `agent-skills/` directory is distributed as part of the `@tinkermonkey/heimdall-ui` package. Consumer projects add it to their `.claude/skills/` by symlinking or copying — see the package README for setup instructions. Each `SKILL.md` file's `name` frontmatter field (`heimdall-primitives`, `heimdall-charts`, etc.) becomes the slash command name the agent uses to load it.

---

## Category Definitions

| Category slug            | Skill file                                     | Components                                                                                                                                                         | Also document (non-component exports)                                                                                                                                  |
| ------------------------ | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `heimdall-primitives`    | `agent-skills/heimdall-primitives/SKILL.md`    | Icon, Avatar, Button, Chip, Badge, StatusBadge, VersionPill, SegmentedControl                                                                                      | ICONS                                                                                                                                                                  |
| `heimdall-inputs`        | `agent-skills/heimdall-inputs/SKILL.md`        | TextInput, TextArea, NumberInput, Select, TriState, Field, FilterDropdown, EntityPicker, KeyValueEditor, OrderedList, RelationshipBuilder                          |                                                                                                                                                                        |
| `heimdall-data-display`  | `agent-skills/heimdall-data-display/SKILL.md`  | StatTile, StatGrid, Table, KVGrid, InspectorPanel, ResultCard, AssetCard, AssetGrid, MapCanvas                                                                     |                                                                                                                                                                        |
| `heimdall-navigation`    | `agent-skills/heimdall-navigation/SKILL.md`    | NavItem, Sidebar, Topbar, TabBar                                                                                                                                   |                                                                                                                                                                        |
| `heimdall-shell`         | `agent-skills/heimdall-shell/SKILL.md`         | AppTitle, Titlebar, Statusbar, ShellLayout                                                                                                                         |                                                                                                                                                                        |
| `heimdall-overlays`      | `agent-skills/heimdall-overlays/SKILL.md`      | Modal, ConfirmDialog, Toast, Tooltip, Popover, CommandPalette, WorkspaceSwitcherDialog, Drawer                                                                     |                                                                                                                                                                        |
| `heimdall-layout`        | `agent-skills/heimdall-layout/SKILL.md`        | Panel, SplitPane                                                                                                                                                   | useMediaQuery                                                                                                                                                          |
| `heimdall-charts`        | `agent-skills/heimdall-charts/SKILL.md`        | ChartWrapper, Sparkline, LineChart, BarChart, BarV, BarH, StackedBar, Donut, Heatmap, StatusTimeline, ProgressBar, MetricRow                                       |                                                                                                                                                                        |
| `heimdall-page-patterns` | `agent-skills/heimdall-page-patterns/SKILL.md` | PageHeader, FilterBar, ActivityTimeline, AlertStrip, QuickAccessGrid, QuickAccessTile, ConfigTile, PipelineCard, FormCallout, RowMenu                              |                                                                                                                                                                        |
| `heimdall-chat`          | `agent-skills/heimdall-chat/SKILL.md`          | ChatMessage, ToolBlock, ThinkingBlock, ChatDivider, ChatSuggestions, ChatComposer, ChatContainer, ChatMarkdownContent                                              |                                                                                                                                                                        |
| `heimdall-graph`         | `agent-skills/heimdall-graph/SKILL.md`         | GraphCanvas, GraphNode, GraphEdge, GraphEdgeShape, GraphToolbar, GraphCollapseControl, GraphInspector, GraphEdgeInspector, DetailDrawer, TopologyNode, HierarchyRow, HierarchyTree | useGraphCanvas, usePanZoom, the layout functions (forceLayout, clusteredForceLayout, organicLayout, …), the graph utilities (bezierPath, rectEdgePoint, louvainCluster, …) |
| `heimdall-observability` | `agent-skills/heimdall-observability/SKILL.md` | TraceViewer, LogStream, DiffViewer, HashSetDiff, SideBySideDiff, VersionTimeline, LineageRail                                                                      | fromOTLP, fromXRay, buildTraceModel and the other trace-model helpers, DEFAULT_SERVICE_PALETTE                                                                         |
| `heimdall-planning`      | `agent-skills/heimdall-planning/SKILL.md`      | Calendar, MiniCalendar, KanbanBoard                                                                                                                                |                                                                                                                                                                        |

Every value exported from `src/index.ts` belongs to exactly one row. When a component is added to `src/index.ts`, add it to a row here (or add a row) and give it a section in that skill. `npm run check:skills` (`scripts/check-skill-coverage.mjs`) enforces this: it fails when an exported component has no `## ComponentName` section, when a section is in a different skill than this table says, when a non-component export is never named in any skill, or when a skill documents a component or prop that the code does not export.

---

## Processing Instructions Per Category

For each category:

### Step 1: Research (spawn an Explore agent)

Instruct the Explore agent to:

- Read `src/components/<ComponentName>.tsx` for every component in this category
- Read the corresponding sections in `docs/src/showcases/` that demonstrate these components
- Report back: full props interface, default values, subcomponents/compound patterns, and any usage examples from the showcase

### Step 2: Write the SKILL.md

Create or overwrite `agent-skills/heimdall-<slug>/SKILL.md` with this exact structure:

```markdown
---
name: heimdall-<slug>
description: Heimdall component guide for <Category>: <comma-separated component list>
---

Import all components from `@tinkermonkey/heimdall-ui`. Import the CSS once at your app entry point:

\`\`\`tsx
import '@tinkermonkey/heimdall-ui/css'
\`\`\`

<one section per component, using the template below>
```

### Component Section Template

For each component in the category, write a section with this structure:

```markdown
## ComponentName

One sentence describing what this component is for and when to use it.

\`\`\`tsx
import { ComponentName } from '@tinkermonkey/heimdall-ui'
\`\`\`

### Props

| Prop         | Type   | Default    | Description      |
| ------------ | ------ | ---------- | ---------------- |
| `propName`   | `type` | `default`  | What it controls |
| `...divProps` |       |            | Remaining props spread onto the root `<div>` |

### Usage

\`\`\`tsx
// Minimal working example
<ComponentName
  requiredProp="value"
  optionalProp={handler}
/>
\`\`\`

\`\`\`tsx
// Full-featured example showing key capabilities
<ComponentName
...
/>
\`\`\`

### Compound subcomponents

(Only include this section if the component uses a compound pattern)

#### ComponentName.Sub

What it does, then its own props table in the same format as `### Props`.

### Gotchas

- Bullet list of common mistakes or non-obvious behaviors
```

### Step 3: Check coverage and props

Run `npm run check:skills`. Fix every reported problem before moving to the next category.

---

## Quality Rules for Generated Content

- **Props table must be complete** — every prop from the TypeScript interface, with accurate types and defaults. Do not omit props.
- **Usage examples must be copy-paste ready** — valid TypeScript/JSX that compiles without modification (aside from replacing placeholder data)
- **No made-up props** — only document props that actually exist in the source
- **Defaults from source** — copy defaults directly from the component source, not from memory
- **Gotchas from source** — identify real gotchas by reading the code (e.g., "FilterDropdown uses a compound pattern — you must include `<FilterDropdown.Trigger>` and `<FilterDropdown.Panel>` as children"), not generic advice
- **Audience is a consumer app developer** — explain how to use the component, not how it's implemented internally
- **Table format** — the first column of a props table is the prop name in backticks; a spread row (`...divProps`) starts with `...`. `npm run check:skills` reads these tables and fails on a prop the component type does not accept
- **One `## ComponentName` heading per component**, spelled exactly as exported. Sections that are not a component (utilities, hooks, recipes) use a heading of more than one word, such as `## Trace adapters`
- **No lists that silently go stale** — when a set of values lives in code (icon names, palette entries), point at the export that holds it (`Object.keys(ICONS)`) rather than copying the whole list
- **Voice** — follow the content rules in `CLAUDE.md`: terse and impersonal, sentence case, no "we", no exclamation marks, no emoji. Example data uses monospace snake_case identifiers
- **Concise** — prop descriptions should be ≤10 words; usage examples should show the minimal viable usage first, then the rich example

---

## Output After All Categories

When every file in the table is written:

```
## /refine-component-skills — Complete

Generated or updated N skill files in agent-skills/:

| File | Components | Lines |
|------|-----------|-------|
| heimdall-primitives/SKILL.md | 7 | ~N |
| ... | ... | ... |

Consumer agents load these skills via the `name` field in each SKILL.md frontmatter (e.g., `heimdall-primitives`). Consumer projects must symlink or copy `agent-skills/` into their `.claude/skills/` directory for auto-discovery to work.
```
