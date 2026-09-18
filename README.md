# typestill

A commonplace notebook built on top of Excalidraw. Fixed-size pages, one after the other, in one file. See [PLAN.md](PLAN.md) for the product spec, data model and phases.

Status: the MVP is complete through Phase 8: lined and zine pages composed from blocks (zine pages behind a feature flag, off in production builds), drawing on the page in a drawing mode with the drawing kept as a still while writing, sections with divider leaves in real facing spreads, a media pool, themes, search, PDF and PNG exports, JSON and zip backups, one notebook at a time (another is opened from its backup). Visual refinement comes next.

## Development

Requires Node 22+ and pnpm.

```bash
pnpm install   # also copies Excalidraw's fonts into public/fonts
pnpm dev       # http://localhost:5173
pnpm test
pnpm typecheck
pnpm lint
pnpm build
```
