# typestill

A commonplace notebook shell around Excalidraw: fixed-size pages, one after another, in one file. The product spec, data model, phases and decisions log live in PLAN.md. Read it before changing behaviour, and keep it updated when a decision changes.

## Commands

- `pnpm install` — also copies Excalidraw's fonts into `public/fonts` (gitignored) via `scripts/copy-fonts.mjs`
- `pnpm dev` / `pnpm build` / `pnpm preview`
- `pnpm typecheck`, `pnpm lint`, `pnpm test` (Vitest, node environment, `src/**/*.test.ts`)

## How the app is put together

- Two surfaces: lined text pages (`src/page/TextPage.tsx`, our own editor) and one infinite Excalidraw canvas per notebook (`src/canvas/Canvas.tsx`). `src/shell/SplitView.tsx` puts them side by side with a draggable handle; either side can collapse.
- Page editor: one plain-text contenteditable per column. Line breaks go through the browser's insert-line-break command so the DOM stays plain text; Chrome's placeholder newline after a trailing one is normalised in readText/writeText; edits that would pass the last rule are rejected in beforeinput by measuring the candidate text in a hidden mirror. Keep page-level logic outside the Column component so the editor stays easy to swap.
- Canvas: Excalidraw is embedded from npm and never forked. Control it only through props, the imperative API and the CSS overrides in `src/canvas/canvas.css`. Grid mode is the paper and the snapping. Excalidraw owns the grid toggle (Cmd+', canvas context menu, help dialog): the grid is passed only as initial state, never as the `gridModeEnabled` prop, because that prop disables Excalidraw's own toggle; the shell observes changes through onChange. The canvas container must stay wider than ~730px or Excalidraw switches to its mobile layout, so the shell collapses the text side rather than squeezing the canvas. `UIOptions` cannot hide individual toolbar tools (CSS does that) and `UIOptions.tools.image = false` breaks image paste.
- The drawing survives the canvas pane collapsing: the editor hands its latest content back on unmount and gets it as `initial` when it mounts again.
- Page geometry and unit conversions live in `src/page/paper.ts`. Paper units are millimetres; scene px = mm × 96/25.4.
- Storage is in `src/store` (Dexie). Pages, the canvas and files are separate records; tests run on fake-indexeddb.
