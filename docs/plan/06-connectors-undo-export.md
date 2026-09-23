# Stage 6 — Connectors, undo/redo, export (M5)

## Goal

Draw arrows between shapes that follow when the shapes move; undo and redo every scene change; export the board as PNG or SVG.

## Tasks

### 1. Connectors

**Model** (already in `scene.ts`): `{ id, fromId, toId, style, label? }`. Add optional fields if you want them, e.g. `style.arrowEnd`, `style.dash`, `routing: "straight" | "elbow"`. Keep them optional.

**Endpoint math** (`canvas/connectors/geometry.ts`, pure functions, unit-tested):
- `shapeBounds(shape)` → axis-aligned rect of the shape in world coords (account for rotation: rotate the four corners and take min/max, or treat rotated shapes approximately — decide and document it).
- `anchorPoint(bounds, towards)` → the point where the line from the bounds' centre towards `towards` crosses the bounds' edge. Use an ellipse intersection for ellipses.
- `connectorPoints(from, to)` → `[x1, y1, x2, y2]` computed **at render time** from both shapes' current bounds. Nothing about positions is stored on the connector, which is why arrows follow moved shapes for free.

**Rendering** (`canvas/connectors/ConnectorView.tsx`): Konva `Arrow` in `connectorsLayer`, points from the geometry, optional label as a `Label` at the midpoint. During a drag, positions come from the store only on `dragend`; to make arrows follow *while* dragging, also listen to `dragmove` and update a transient "live positions" map in a small non-saved store (or redraw `connectorsLayer` imperatively). Only the connectors layer needs to redraw.

**Connector tool** (add to toolbar, shortcut `C`, or a "+" handle on hover):
- Pointer down on a shape → start; show a preview arrow to the cursor in `overlayLayer`; highlight the shape under the cursor.
- Pointer up on a different shape → `addConnector(fromId, toId)`. On empty canvas → cancel (or create a new shape there, Miro-style — optional).
- Connectors are selectable (click the arrow, with a larger `hitStrokeWidth`), deletable, and styled from the format panel (stroke, width, dash, arrow head).
- **Deleting a shape deletes its connectors** in the same store action.
- Double-click a connector to edit its label (reuse the Stage 4 text editor).

### 2. Undo/redo with zundo

- Wrap `sceneStore` in zundo's `temporal` middleware around immer: `create()(temporal(immer((set) => ({ ... })), { ... }))`.
- `partialize` to track only `scene` (not transient fields).
- `limit: 100`.
- `equality` with a shallow/deep check so no-op updates don't create history entries.
- History discipline, which the earlier stages set up: one store action per user gesture (dragend, transformend, panel commit, stroke finished). If a gesture still produces several `set` calls, `pause()` at gesture start and `resume()` at the end.
- `loadScene` clears history: `useSceneStore.temporal.getState().clear()` right after loading, so undo can't go back to the previous board or an empty scene.
- Wire the top bar buttons and `Ctrl/⌘+Z`, `Ctrl/⌘+Shift+Z`, `Ctrl/⌘+Y`. Disable buttons when `pastStates`/`futureStates` are empty.
- Undo triggers autosave like any other change — that's correct.
- After undo, drop `selectedIds` that no longer exist.

### 3. Export (`lib/export.ts`)

**PNG:**
- Compute the content bounding box (all shapes + connectors) plus padding.
- Hide `overlayLayer` (Transformer, selection), then `stage.toDataURL({ x, y, width, height, pixelRatio: 2 })` with the box converted to screen coordinates for the current viewport — or, simpler and zoom-independent, temporarily reset the stage transform to identity, export the world box, and restore. Add a white background (draw a temporary rect or composite onto a canvas).
- Trigger a download named after the board title.

**SVG:** Konva has no SVG export, so write a small serializer from the **scene** (not from Konva):
- `rect` → `<rect>`, `ellipse` → `<ellipse>`, `text`/sticky text → `<text>` with `<tspan>` per wrapped line (reuse Konva's measured lines: `textNode.textArr`), `freehand` → `<path>` or `<polyline>`, `image` → `<image href="data:...">`, connectors → `<line>` + an arrow `<marker>`.
- Apply `transform="rotate(r cx cy)"` for rotation, and style attributes for fill/stroke/opacity.
- `viewBox` = content bounding box. Escape text content.
- Unit-test the serializer with a fixed scene → snapshot.

Enable the Export dropdown in the top bar. Optionally "Export selection" using the same functions with the selection's bounding box.

## Done when

- [ ] Connect two shapes; move, resize and rotate either — the arrow stays attached to the edges, including while dragging.
- [ ] Deleting a shape removes its connectors; undo brings both back.
- [ ] Undo/redo works for create, move, resize, rotate, style change, reorder, delete, connector add/remove, and text edit — each gesture is exactly one undo step.
- [ ] Opening a board and pressing undo does nothing.
- [ ] PNG export at 50% zoom and at 200% zoom produces the same image, cropped to content, without selection handles.
- [ ] SVG export opens correctly in a browser and in Inkscape/Figma, including rotated shapes, sticky text and arrows.

## Gotchas

- zundo stores whole snapshots of `scene`; with immer's structural sharing that's cheap, but don't put large transient data (live drag positions, in-progress strokes) in `sceneStore`.
- Freehand strokes should be hit-tested for connector endpoints by bounds only; per-point hit tests are slow and unnecessary.
- Exporting images with a remote `src` taints the canvas and `toDataURL` throws. Stage 7's chart images are data URLs, so they're safe; keep it that way.
