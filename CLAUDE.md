# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Repo Is

A design system repository:

**Production component library** — repo root (`src/`, `package.json`), published as `@tinkermonkey/heimdall-ui`, built with Vite + TypeScript + Tailwind CSS 3.

## Scratch Files

When capturing screenshots, saving debug images, or writing any temporary working files during a session, always write them to `.scratch/` at the repo root. This directory is gitignored. Never write temporary files to the repo root or any tracked directory.

## Running Things

```bash
# Production package — dev server (run from repo root)
npm run dev

# Production package — build
npm run build

# Visual regression tests (Playwright) — see "Running the visual regression
# suite" under Visual Regression Tests below before running this: the suite
# is large and CI runs it single-threaded, so a full run genuinely takes a
# long time and that is expected, not a hang.
npm test
```

**Before starting any dev server**, check whether one is already running to avoid accumulating orphaned processes:

```bash
# Check for an existing Vite dev server
lsof -ti :5173 -ti :5174 -ti :5175 -ti :5176 2>/dev/null | head -1
# or
pgrep -fl "vite" 2>/dev/null
```

If a server is already running, use its existing port rather than starting a new instance. Only start a new server if none is found.

## Repository Structure

```
(repo root)                        # Production component library (@tinkermonkey/heimdall-ui)
  src/
    components/                # All components (each has .tsx + .css)
    tokens/tokens.css          # CSS custom properties (design tokens)
    index.css                  # Global base styles + font imports
    index.ts                   # Public API barrel export
    hooks/                     # useBodyOverflow, useFocusTrap
    test-pages/                # Per-category test pages for Playwright
  tailwind.config.ts           # Tailwind theme wired to CSS custom properties
  tests/                       # Playwright visual regression tests

design-reference/              # Design reference documentation
docs/                          # Vite + React docs app (showcase pages)
```

## Production Component Library

### Component Inventory

**Primitives:** `Icon`, `Button`, `Chip`, `Badge` / `StatusBadge`

**Inputs:** `TextInput`, `TextArea`, `NumberInput`, `Select`, `TriState`, `Field` (label/error wrapper)

**Data display:** `StatTile`, `StatGrid`, `Table`

**Navigation:** `NavItem`, `Sidebar`, `Topbar`, `TabBar`

**Shell / layout:** `Titlebar`, `Statusbar`, `ShellLayout`, `SplitPane`, `Drawer`, `Panel`

**Overlays:** `Modal`, `ConfirmDialog`, `Toast`, `CommandPalette`

All components are exported from `src/index.ts` with their TypeScript prop types.

### Tech Stack

- React 18 + TypeScript
- Tailwind CSS 3 — theme is fully wired to CSS custom properties (see `tailwind.config.ts`)
- Vite build + `vite-plugin-dts` for type declarations
- Playwright for visual regression tests
- Fonts bundled locally in `public/fonts/` (Inter + JetBrains Mono)

### CSS Architecture

Tokens live in `src/tokens/tokens.css` as CSS custom properties. Tailwind's theme maps every color, radius, shadow, font, spacing, and font-size token to those properties, so Tailwind utility classes automatically respect the two-surface system.

Dark canvas is toggled by adding `dark-canvas` class to `<body>` — the token file overrides all `--canvas-*` variables under `.dark-canvas`. Never use `filter()` or `invert()`.

### React Pattern

Components are standard functional React with TypeScript. State management is props + React context only — no external state libraries.

```tsx
import { Button, Icon, StatTile } from '@tinkermonkey/heimdall-ui'
import '@tinkermonkey/heimdall-ui/css'  // import tokens + base styles once at app entry
```

## Design System Architecture

### Two-Surface System

Every screen is built from exactly two surfaces — shell and canvas:

| Surface | Light canvas | Dark canvas |
|---|---|---|
| Shell bg | `#0F1729` | `#0F1729` (always dark — slate navy) |
| Canvas bg | `#FFFFFF` | `#0B1426` |

Dark canvas mode: add `dark-canvas` to `<body>`. Every color has an explicit override — no `filter()`/`invert()`.

### Icon System

Icons live in `Icon.tsx` as a `ICONS` map of SVG path strings. Always render via `<Icon name="…" size={16} />`. Never paste raw SVG inline. Adding an icon = adding a key + path string to the `ICONS` map.

Icon spec: Lucide-style outline, 24×24 viewBox, `strokeWidth={1.75}`, `currentColor`, round caps/joins.

## Key Design Tokens

**Shell surface tokens (always dark — slate navy):**
```css
--shell-bg:        #0f1729   /* outermost shell */
--shell-bg-2:      #13203a   /* secondary shell layer */
--shell-surface:   #1b2949   /* surfaces/panels */
--shell-surface-2: #243763   /* elevated surfaces */
--shell-border:    #1e2a44   /* shell dividers */
--shell-border-2:  #2a3a5c   /* input border, scrollbar thumb */
```

**Accent — amber is the primary brand/highlight color:**
```css
--accent-primary:       #fbbf24   /* amber-400, active states */
--accent-primary-hover: #f59e0b   /* amber-500, hover */
--accent-primary-deep:  #b45309   /* amber-700, CTA / links in light canvas */
```

**Semantic status colors:** emerald=ok/running, rose=error/failed, cyan=updating/pulling, violet=secondary, neutral=stopped/idle.

**Typography:**
- Sans: Inter — UI, body, headings
- Mono: JetBrains Mono — all identifiers, eyebrow labels (`SCHEMA`, `UPTIME`), table headers, keyboard shortcuts, status bar, tabular numbers
- Body default: 14px (`text-sm`); page H1: 24px (IDE density, not typical web)
- Mono eyebrows: 10–11px, `letter-spacing: 0.06–0.12em`, uppercase, `canvas-fg-3` color

**Radius:** 4–6px chips/buttons/inputs (`rounded-sm`), 8px cards/panels (`rounded-md`), 10–12px modals only (`rounded-lg`). No pills except env badges and dots.

**Shadows:** almost never. Modal: `shadow-modal` (`0 24px 64px -16px rgba(0,0,0,0.55)`). Cards use border only.

## Content & Voice Rules

- Sentence case for headings; UPPER + monospace for section eyebrow labels
- Identifiers always monospace lowercase snake_case: `life.organism`, `cls_4f3a`
- Terse, impersonal. No "we", no exclamation marks, no emoji — ever
- Empty states: _"No individuals match these filters."_ not _"Looks like nothing here yet!"_
- Confirmations state the consequence: _"Delete `cls_organism`? 47 individuals will be unlinked."_

## Component Conventions

- **Active nav:** 2px amber left border + `shell-surface` background (never a tint fill)
- **Focus ring:** `var(--focus-ring)` (`0 0 0 3px rgba(251, 191, 36, 0.18)`, amber-400) on inputs and buttons
- **Hover:** background lifts one neutral step, never a color tint
- **Status pulse (live indicator):** `1.6s ease-out infinite` scale 0.6→1.4 + opacity 0.5→0 on an absolutely-positioned glow circle behind a solid colored dot
- **Animations:** 80–180ms ease for hovers and modals. No bouncy easing, no transforms on press, no ripples.

## Layout Primitives

- **`SplitPane`:** two resizable panes (`first`, `second`), `direction` `'horizontal'` (default) or `'vertical'`. The split is a percentage: `initialSplitPercent` (default 50), or controlled with `splitPercent` + `onSplitChange`; it's clamped by `minSize`/`maxSize` in px (defaults 200/800). For a fixed-width side pane, use `DetailDrawer` or a flex layout instead.
- **`Sidebar`:** 256px expanded, 64px collapsed (icons only)
- **`StatGrid`:** 4-column grid, 14px gap; each `StatTile` has a 2px colored left bar
- **`ShellLayout`:** composes `Sidebar` + `Topbar` + `Statusbar` into the full IDE chrome
- Canvas inner padding: `22px 26px 32px`, reduced at `1024px` and `640px` breakpoints (no min-width — canvas reflows instead of scrolling horizontally)

## Visual Regression Tests

Tests live in `tests/`. Each spec captures screenshots of test pages and compares against snapshots in `tests/*.spec.ts-snapshots/`. Run `npm test` to check; after an intentional visual change, run `npm test -- --update-snapshots` locally to regenerate baselines for both platforms (see [Playwright snapshot baselines are per-OS](#playwright-snapshot-baselines-are-per-os) below).

One spec file per component/feature area, named for what it covers (e.g. `primitives.spec.ts`, `graph-layout.spec.ts`, `overlay-advanced.spec.ts`). The suite has grown well past a size worth enumerating here and will keep growing — run `ls tests/*.spec.ts` for the current list rather than trusting a hard-coded one in this file.

### Running the visual regression suite

`npm test` runs the *entire* suite (there is no default subset) via `playwright.config.ts`, which in CI (`CI=1`/`CI=true`) sets `workers: 1` (single-threaded, so screenshots rasterize under consistent load) and `retries: 2` (each failing test reruns up to 2 more times before it counts as failed). With dozens of spec files, that combination makes a full CI run genuinely slow — tens of minutes is expected, not a sign anything is stuck or broken.

**Run it as a single blocking foreground command and wait for it to actually exit — do not background it, do not poll it with a separate watcher process, and do not end a turn on a status update like "tests are still running, I'll check back."** There is no later turn in which the result gets checked: whatever process runs `npm test` must be the one that blocks until Playwright's own summary line (or `PLAYWRIGHT_EXIT=...`, if you captured the exit code) appears in its output, however long that takes. Scope to one spec file (`npx playwright test tests/<name>.spec.ts`) when you only need to verify a change to one component — that's faster and still a single blocking call, not a workaround for waiting on the full suite.

### Playwright snapshot baselines are per-OS

Snapshot filenames are suffixed by platform (`-darwin.png`, `-linux.png`). You only ever generate `-darwin.png` locally; `release.yml`'s `Test` job runs on `ubuntu-latest` and checks the `-linux.png` baselines. **A change that passes `npm test` on your Mac can still fail the linux comparison in CI** — most often because your machine's Chromium build, installed font packages, or subpixel/hinting behavior isn't byte-identical to GitHub's hosted runner image, so the two environments rasterize the same DOM to slightly different pixels. Playwright's `toHaveScreenshot` tolerates up to 1% pixel difference (`maxDiffPixelRatio` in `playwright.config.ts`) before failing.

**If a Docker-based local regen doesn't clear that threshold either** — worth trying first, but Docker Desktop's Linux VM still isn't guaranteed to byte-match GitHub's hosted `ubuntu-latest` image — use the `Update Visual Snapshots` workflow (`.github/workflows/update-snapshots.yml`) to regenerate baselines *inside* an actual GitHub Actions runner:

1. From the Actions tab, run **Update Visual Snapshots** (or `gh workflow run update-snapshots.yml -f spec="tests/foo.spec.ts tests/bar.spec.ts"`). Leave `spec` blank to update the whole suite; passing specific spec file(s) is faster and keeps the diff reviewable.
2. It runs `npx playwright test --update-snapshots` on `ubuntu-latest`, then uploads only the changed `-linux.png` files as a build artifact named `updated-linux-snapshots` (nothing is committed automatically).
3. Download and apply: `gh run download <run-id> -n updated-linux-snapshots -D /tmp/updated-snapshots`, then copy the files into their matching `tests/*.spec.ts-snapshots/` paths.
4. **Visually review every changed PNG before committing** — this workflow updates on any mismatch, including ones that would be catching a real bug. Diff against `git show HEAD:<path>` for the pre-change version if you're not sure whether a difference is legitimate.
5. Commit the corrected baselines alongside your change.

This is also the tool to reach for if a release's `Test` job fails on baseline drift alone (see `RELEASE.md`) — regenerate against the exact failing spec files, verify, commit, and retag.
