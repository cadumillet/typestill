# typestill

A commonplace notebook shell around Excalidraw: fixed-size pages, one after another, in one file. The product spec, data model, phases and decisions log live in PLAN.md. Read it before changing behaviour, and keep it updated when a decision changes.

## Commands

- `pnpm install` — also copies Excalidraw's fonts into `public/fonts` (gitignored) via `scripts/copy-fonts.mjs`
- `pnpm dev` / `pnpm build` / `pnpm preview`
- `pnpm typecheck`, `pnpm lint`, `pnpm test` (Vitest, node environment, `src/**/*.test.ts`)

## How the shell relates to Excalidraw

- Excalidraw is embedded from npm and never forked. Control it only through props, the imperative API (`excalidrawAPI`), and the CSS overrides in `src/styles/excalidraw.css`.
- Excalidraw fills the whole desk area; the page is a rectangle inside it. `PageCanvas` pins `scrollX`/`scrollY`/`zoom` so scene (0,0)–(page width, page height) always lands exactly on the page box, swallows wheel and zoom/pan shortcuts before Excalidraw sees them, and resets the hand tool. Mounting Excalidraw inside a page-sized container does not work: below ~730px wide it switches to its mobile layout.
- `UIOptions` cannot hide individual toolbar tools; that is done in CSS. Do not set `UIOptions.tools.image = false`: it makes image paste error out.
- The paper (lined/dotted) is a CSS layer under a transparent canvas (`viewBackgroundColor: "transparent"`), never Excalidraw elements. The same goes for future date stamp and page number overlays.
- Page geometry and unit conversions live in `src/page/paper.ts`. Paper units are millimetres; scene px = mm × 96/25.4.
