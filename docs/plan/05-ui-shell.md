# Stage 5 — UI shell (M4)

## Goal

The editor looks and feels like a product: a Miro-style floating toolbar, a floating top bar, a draw.io-style format panel that appears on selection, a slide-out shape drawer, and zoom controls. All of it reads from and writes to the existing stores; no canvas logic changes.

## Layout

| Region | Component | Built with |
|---|---|---|
| Left edge, floating | Tool toolbar | shadcn `ToggleGroup`, lucide icons, `Tooltip` with shortcut |
| Top bar, floating | Board title, undo/redo, export, account | shadcn `DropdownMenu` |
| Right, on selection only | Format panel | shadcn `Sheet`/panel, `Popover`, `Slider` |
| Left, slide-out | Shape drawer | shadcn `Sheet` |
| Bottom center, floating | AI prompt bar (placeholder, disabled) | shadcn `Input`, `Button` |
| Bottom right | Zoom controls | Buttons bound to `uiStore.viewport` |

The canvas stays full-bleed underneath; every panel floats over it with a card look (rounded, subtle shadow, border). Panels must stop pointer events from reaching the Stage.

## Tasks

### 1. Editor layout (`features/editor/EditorLayout.tsx` or in `app/`)

Absolutely positioned slots over the Stage. Add shadcn components as needed: `toggle-group`, `tooltip`, `dropdown-menu`, `sheet`, `popover`, `slider`, `select`, `separator`, `input`, `button`, `dialog`.

### 2. Toolbar (`features/toolbar/`)

- Vertical `ToggleGroup` bound to `uiStore.activeTool`: select, pan, sticky, text, rect, ellipse, pen, plus a "Shapes" button that opens the drawer.
- Tooltips show name + shortcut. Active tool highlighted.
- Sticky tool gets a small colour chooser on long-press or a secondary popover (Miro's sticky colours), stored in `uiStore` as the default for new stickies.

### 3. Top bar (`features/toolbar/TopBar.tsx`)

- Back to boards; inline-editable board title (saves through the same `PUT`, or a debounced title save).
- Undo/redo buttons — wire them to no-ops or disable them now; Stage 6 connects zundo.
- Export dropdown (PNG, SVG) — disabled until Stage 6.
- Save status indicator from Stage 3.
- Account menu: name/email, plan badge (Free/Pro from `authStore`), log out.

### 4. Format panel (`features/format-panel/`)

Visible only when `selectedIds.length > 0`. Sections, draw.io style, shown based on what's selected:

- **Style:** fill colour, stroke colour, stroke width (Slider), opacity (Slider). A `ColorPicker` component: a `Popover` with a swatch grid plus a hex input.
- **Text** (text, sticky, rect/ellipse with text): font size, font family (2–3 options), alignment, bold.
- **Arrange:** x, y, width, height, rotation as number inputs; bring to front / forward / backward / to back (reorders `scene.order`); duplicate; delete.
- Multi-select: show only fields that apply to all selected shapes. When values differ, show an empty/"mixed" state; editing applies to all.

Implement each change as **one store action per user commit** (on slider release / input blur / colour pick), not per pointer move, so autosave and Stage 6's undo stay clean. For live slider preview, update the Konva node directly during the drag and commit to the store on release, or accept a store update per frame and use zundo's `handleSet` throttling in Stage 6 — pick one approach and use it everywhere.

Add store actions as needed: `updateStyle(ids, partialStyle)`, `reorder(ids, "front" | "forward" | "backward" | "back")`, `duplicate(ids)`.

### 5. Shape drawer (`features/shape-drawer/`)

Left `Sheet` with a grid of shape presets: rectangle, rounded rectangle, ellipse, sticky (each colour), text heading/body. Click inserts at the viewport centre (`toWorld` of the screen centre); drag-and-drop onto the canvas inserts at the drop point (HTML5 drag → `stage.setPointersPositions(e)` → `toWorld`).

Rounded rectangle needs a `cornerRadius` in `Style` — add it as **optional** in `packages/shared/scene.ts` so saved boards stay valid.

### 6. Zoom controls (`features/toolbar/ZoomControls.tsx`)

`−`, current % (click to reset to 100%), `+`, and "Fit to content" (bounding box of all shapes with padding). Zoom buttons zoom around the viewport centre. Shortcuts: `Ctrl/⌘ +`, `Ctrl/⌘ −`, `Shift+1` fit, `Shift+0` 100%.

### 7. AI prompt bar placeholder (`features/ai-prompt/`)

Render the bar with a disabled state and "Coming soon" tooltip, so the layout is final. Stage 7 wires it up.

## Done when

- [ ] Every action from Stage 4's temporary buttons is reachable from the toolbar, drawer or panel; the temporary buttons are gone.
- [ ] Selecting a shape opens the format panel; changing fill, stroke, opacity, font and size updates the canvas and survives reload.
- [ ] Multi-select with mixed fills shows "mixed" and sets all on pick.
- [ ] Z-order buttons change stacking and survive reload.
- [ ] Drag a shape from the drawer onto the canvas at 50% zoom: it lands under the cursor.
- [ ] Clicking or scrolling on any panel never pans, zooms or deselects the canvas.
- [ ] Works at 1280×720 without panels overlapping each other.

## Gotchas

- Keyboard shortcuts must ignore events from inputs inside the panels (check `e.target` for `input`, `textarea`, `[contenteditable]`).
- shadcn `Sheet` is modal by default and adds an overlay; for the format panel you likely want a non-modal floating card instead, or `modal={false}`.
- Keep panel components selecting narrow slices of the store; a panel that re-renders on every scene change will make dragging stutter.
