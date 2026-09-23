# Stage 4 — Core canvas (M3)

## Goal

An infinite canvas you can pan and zoom, with tools to create rectangles, ellipses, text, sticky notes and freehand strokes, and a select tool that moves, resizes and rotates one or many shapes. All of it goes through the scene store and autosaves.

Toolbar UI is temporary here (plain buttons or keyboard shortcuts); Stage 5 builds the real one.

## Tasks

### 1. `uiStore`

`store/uiStore.ts` (not saved, not undoable):
- `activeTool`: `"select" | "pan" | "rect" | "ellipse" | "text" | "sticky" | "freehand"`.
- `selectedIds: string[]`.
- `viewport: { x, y, scale }`.
- `editingTextId: string | null`.

### 2. Stage, pan and zoom (`canvas/Stage.tsx`)

- Bind the Stage's `x`, `y`, `scaleX/Y` to `uiStore.viewport`.
- Wheel: zoom around the pointer (keep the world point under the cursor fixed). Ctrl/⌘+wheel and trackpad pinch both arrive as wheel events with `ctrlKey`; plain wheel pans. Clamp scale to e.g. 0.1–4.
- Pan: space+drag, middle mouse drag, or the pan tool.
- `canvas/coords.ts`: `toWorld(stage, pointer)` using `stage.getAbsoluteTransform().copy().invert().point(pointer)`. **Every** tool uses this; never use raw pointer coordinates to create or move shapes.
- Layers: `shapesLayer`, `connectorsLayer` (empty until Stage 6), `overlayLayer` (Transformer, selection rectangle, in-progress drawing). Set `listening={false}` on layers/nodes that don't need events.
- Optional background: a dot grid drawn in screen space via `sceneFunc`, so it doesn't cost one node per dot.

### 3. Shape components (`canvas/shapes/`)

One component per type: `RectShape`, `EllipseShape`, `TextShape`, `StickyShape`, `FreehandShape`, plus an `ImageShape` stub for Stage 7. A `ShapeRenderer` switches on `type` and renders shapes in `scene.order` (that's the z-order).

- Each shape node gets `id={shape.id}` and `name="shape"` so the Transformer and hit tests can find it.
- Sticky: a `Group` with a `Rect` (the note colour, slight shadow) and a `Text` that wraps and auto-shrinks.
- Ellipse: store the bounding box (`x, y, width, height`) like rect, and render `Ellipse` offset to its centre, so resize logic is the same for both.

### 4. Tools (`canvas/tools/`)

A tool is an object with `onPointerDown/Move/Up(e, worldPos)` and optional key handlers. `Stage.tsx` forwards events to the active tool. Tools dispatch store actions only.

- **rect / ellipse / sticky:** drag to size (click alone creates a default size). Show a preview in `overlayLayer` while dragging; commit one `addShape` on pointer up. Switch back to select afterwards (Miro behaviour) and select the new shape.
- **text:** click to create an empty text shape and immediately enter editing.
- **freehand:** collect world points on pointer move into a local ref (not the store — 60 updates a second would flood autosave and, later, undo history). On pointer up, simplify (Ramer–Douglas–Peucker, `simplify-js`, tolerance scaled by `1/scale`), then one `addShape`. Store points relative to the shape's `x, y`.
- **select:**
  - click a shape → select it; shift-click → toggle; click empty → clear.
  - drag on empty → marquee rectangle; select shapes whose client rect intersects.
  - drag a selected shape → moves all selected. Update the store on `dragend`, not on every `dragmove`.
  - Delete/Backspace → delete selected (unless editing text).
  - Double-click text/sticky/rect → edit text.

### 5. Transform (`canvas/transform/`)

- `SelectionTransformer.tsx`: Konva `Transformer` in `overlayLayer`, `nodes` = the Konva nodes for `selectedIds` (find them with `stage.findOne("#" + id)` after render).
- On `transformend`, **bake the scale into size**: read `scaleX/scaleY`, set `width = max(min, width * scaleX)`, same for height, reset scale to 1, then `updateShape` with the new `x, y, width, height, rotation`. For freehand, multiply the points instead. For text, change `fontSize` (or width) rather than stretching glyphs.
- Keep proportions for sticky notes (`keepRatio`, corner anchors only); rotation snaps at 15° with shift (`rotationSnaps`).
- `ignoreStroke: true` so stroke width doesn't grow the box.

### 6. Text editing (`canvas/transform/TextEditor.tsx`)

The standard Konva approach: on edit, hide the Konva text and position an absolutely positioned `<textarea>` over it. Its screen position is the node's `getAbsolutePosition()` plus the Stage container offset; font size and width are multiplied by `viewport.scale`; apply `rotation` with a CSS transform. Commit on blur or Ctrl/⌘+Enter, cancel on Escape. Delete empty text shapes on commit.

### 7. Shortcuts

`V` select, `H` pan, `R` rect, `O` ellipse, `T` text, `S` sticky, `P` pen, `Delete`, `Escape` (clear selection / cancel), `Ctrl/⌘+A` select all. Ignore shortcuts while a text input has focus.

## Done when

- [ ] Each tool creates its shape at the cursor at 25%, 100% and 300% zoom.
- [ ] Select, move, resize and rotate a single shape and a multi-selection — **tested at 50% and 200% zoom**, not just 100% (this is where the milestone usually overruns).
- [ ] After resize, reload the board: sizes are correct and `scaleX/scaleY` never appear in the saved JSON.
- [ ] A long freehand stroke saves a few dozen points, not hundreds.
- [ ] Editing text on a rotated, zoomed sticky puts the textarea exactly over the note.
- [ ] Dragging 200 shapes stays smooth (only `shapesLayer` and `overlayLayer` redraw).

## Gotchas

- Konva events fire on the node you hit; check `e.target === e.target.getStage()` for "clicked empty canvas".
- React re-rendering all shapes on every store change gets slow. Select per-shape state with `useSceneStore(s => s.scene.shapes[id])` and memoize shape components.
- When the Transformer holds several nodes, `transformend` fires once per node. Collect updates and commit them in one store action so autosave (and Stage 6's undo) sees one change.
