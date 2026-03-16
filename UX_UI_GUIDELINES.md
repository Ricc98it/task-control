# UX/UI Guidelines - Reusable Visual and Interaction System

Version: 1.0  
Source baseline: current `task-control` UI (as implemented in `src/app/globals.css` and core UI components).  
Goal: this document defines the visual language and UX behavior so it can be transplanted into other products, even with different business domain.

## 1) Intent and Design Principles

This system must feel:

1. Clear: information hierarchy is immediate.
2. Light: avoid "box inside box inside box".
3. Focused: only one primary action per context.
4. Centered: key interactions are visually centered.
5. Breathing: preserve vertical and horizontal "respiro" between major blocks.

Hard rules:

1. Keep dark glassmorphism aesthetic with subtle gradients and blur.
2. Keep compact but readable cards.
3. Keep strong visual state differentiation (today, past, active, danger, success).
4. Keep keyboard-first UX (`Enter`, `Esc`, arrows).

## 2) Design Tokens (Canonical)

Use these exact tokens as system defaults.

### 2.1 Colors

```txt
--bg: #0a0f1a
--surface: rgba(15, 23, 42, 0.78)
--surface-soft: rgba(15, 23, 42, 0.5)
--surface-strong: rgba(10, 15, 26, 0.92)
--border: rgba(148, 163, 184, 0.18)
--border-strong: rgba(148, 163, 184, 0.32)
--muted: rgba(148, 163, 184, 0.75)
--ink: #f1f5f9

--accent: #0a84ff
--accent-soft: rgba(10, 132, 255, 0.18)
--accent-green: #34c759

--priority-p0: #ff453a
--priority-p1: #ff9f0a
--priority-p2: #0a84ff
--priority-p3: #34c759

--type-work: #0a84ff
--type-personal: #34c759

--status-inbox: #ffd60a
--status-open: #0a84ff
--status-done: #34c759
```

### 2.2 Elevation, Radius, Space

```txt
--shadow-1: 0 8px 20px rgba(2, 6, 23, 0.35)
--shadow-2: 0 22px 48px rgba(2, 6, 23, 0.45)

--radius-sm: 10px
--radius-md: 14px
--radius-lg: 18px
--radius-xl: 24px

--space-1: 6px
--space-2: 10px
--space-3: 14px
--space-4: 18px
--space-5: 24px
--space-6: 32px
```

### 2.3 Typography

1. Primary font: Geist Sans (`--font-geist-sans`).
2. Mono font: Geist Mono (`--font-geist-mono`) for technical snippets only.
3. Typical sizes:
   - Hero/CTA titles: `clamp(30px, 4vw, 44px)`
   - Page title: `30px`
   - Section title: `17px`
   - Primary body/meta: `13px`
   - Dense meta: `11px` to `12px`

## 3) Background and Surfaces

1. Body background is layered:
   - radial blue glow
   - radial green glow
   - dark vertical gradient
2. Main cards/surfaces use translucent dark fills with thin soft borders.
3. Blur is used for overlays/nav only, not everywhere.

## 4) Layout Geometry

1. Global page shell width: `70%` centered.
2. Home shell width: `100%`.
3. Vertical stacking uses explicit spacing blocks, not random margins.
4. Scroll should live inside content areas (columns/lists), not whole page when avoidable.
5. Empty states should be centered both axes in content area.

Reference offsets in current system:

1. Projects top create row offset: `25px` (`.projects-create-row-offset`).
2. Projects content top spacing: `60px` (`.projects-content`).
3. Home week board top spacing: `40px` (`.week-board-shell`).

## 5) Navigation Bar Pattern

1. Sticky top bar with blur and border-bottom.
2. Main nav cards are centered as one block.
3. Home card and Logout card have equal visual size.
4. Primary add button (`+ task`) sits separated on the far right of nav section.
5. Plus button is blue gradient, reduced glow, compact footprint, symbol large and clear.

## 6) Card System

### 6.1 Generic Row Card

1. Rounded corners (`radius-lg`), soft border, translucent fill.
2. Hover = slightly brighter background + border-strong + tiny upward lift.
3. Compact variants reduce padding and gaps.

### 6.2 Weekly Board Cards

1. Five columns baseline for desktop.
2. Today column has accent border.
3. Past-day columns must look clearly disabled:
   - lower opacity
   - grayscale/saturation reduction
   - muted text
   - subtle dark overlay
4. Deadline chips support drag cursor states (`grab`/`grabbing`).

### 6.3 Task Cards in Lists

1. Task cards are slimmer than default rows.
2. Task title color maps to priority.
3. Project label fallback is mandatory: `NESSUN PROGETTO`.
4. Completion action is explicit button (`Completa`), green semantic styling.

## 7) Inputs, Selects, Date Picker

1. Inputs and select buttons share same base styling (shape, border, fill).
2. Placeholders are informative and centered where applicable (wizard details step).
3. Selects always show caret.
4. Date fields visually communicate "selectable" (caret/calendar indicator).
5. Project names in selectors are uppercase.
6. Select menus can include "create new" inline input at top.
7. Where required, options list has internal scroll with max visible items (e.g. 3 projects).

## 8) Switch Pattern (Work/Personal)

1. Pill container, rounded full.
2. Two large pill buttons (`Lavoro`, `Personale`), visually separated and readable.
3. Active state is blue filled pill with shadow.
4. This switch style is shared across:
   - task wizard
   - task section filter mode
   - project-type picker

## 9) Wizard UX Pattern (Multi-step)

This is a key reusable pattern.

### 9.1 Structure

1. No heavy outer card for the modal content.
2. CTA title centered in upper area.
3. Main step content centered in viewport.
4. Work/Personal switch persists across all steps in fixed lower zone.
5. `Annulla` link under the switch.
6. Step arrows are independent controls, positioned outside content block.

### 9.2 Step logic

1. Step 1: only task title field.
2. Step 2: detail selectors grid:
   - Criticita / Progetto
   - Scadenza / Quando ci lavori?
3. Step 3: notes field and final confirm.

### 9.3 Keyboard and Validation

1. `Enter` advances step or submits on final step.
2. `Esc` closes wizard and resets data.
3. Empty title on step 1:
   - no text alert popup
   - input turns red
   - shake animation
   - returns to normal after `550ms`
4. Multi-date selection requires explicit confirm (`✓`) before progressing.

## 10) Confirmation and Overlay Pattern

1. Confirmations open at center with blurred full-screen overlay.
2. Visual style is minimal (avoid boxed dialog chrome).
3. Buttons semantics:
   - neutral: soft gray
   - danger: red
   - success/complete: green
4. `Esc` equals cancel in confirmation dialogs.
5. Task feedback overlays:
   - `Task aggiunto` and `Task completato`
   - centered pill message
   - smooth fade/raise animation
   - duration around `1500ms`

## 11) Content and Label Rules

1. Projects are always displayed in uppercase.
2. Task names remain natural case (not forced uppercase).
3. Keep labels short and direct.
4. Remove non-essential emoji in dense controls (filters, priorities), keep emoji where section identity helps.
5. Home contextual sentence is dynamic and random among all currently valid hints.
6. Dynamic contextual sentence appears only in Home.

## 12) Data-to-Visual Rules

1. Sort tasks by priority in weekly and relevant task views.
2. Use priority color both in chips and in task title emphasis.
3. Past-time states must be visibly weaker than active states.
4. Distinguish Work and Personal consistently in every section where grouping exists.

## 13) Motion Guidelines

Allowed motion:

1. Micro-lift on hover for cards/buttons.
2. Gentle overlays (`fade-up` style).
3. Validation shake only for invalid critical fields.

Forbidden motion:

1. Long bouncy animations.
2. Constant distracting loops in core task areas.

Respect `prefers-reduced-motion` by disabling non-essential animation and transitions.

## 14) Responsive Rules

1. <= 1023px:
   - app shell expands to full width
   - weekly board becomes auto-fit grid
2. <= 900px:
   - nav cards reflow into grid layout
   - detached plus CTA becomes inline block
3. <= 640px:
   - wizard switches to stacked layout
   - detail grid is single column
   - task rows full width

## 15) Accessibility Baseline

1. Focus-visible outlines are always present and high contrast.
2. Dialogs use `role="dialog"` and `aria-modal="true"`.
3. Buttons and controls have explicit `aria-label` when icon-only.
4. Keyboard path must support full completion of key flows.

## 16) Transfer Checklist (for another project)

When porting to a new domain, keep these unchanged:

1. Token palette, spacing scale, radii, shadows.
2. Dark glass surface language.
3. Wizard structure, keyboard rules, and validation behavior.
4. Confirmation/overlay visual style and semantics.
5. Work/Personal switch shape and active treatment.
6. Compact card rhythm and internal scroll strategy.

When adapting domain specifics, change only:

1. Labels and copy.
2. Data entities (tasks/projects -> new entities).
3. Domain-specific filters and metrics.

Do not change:

1. Interaction grammar (`Enter`, `Esc`, centered modal logic).
2. Visual hierarchy proportions.
3. Color semantics for priority/danger/success/accent.

---

If this spec is used as prompt/context in another project, treat every section marked as rule or hard rule as mandatory.
