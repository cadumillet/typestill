# typestill

A commonplace notebook built on top of Excalidraw. Fixed-size pages, one after the other, in one file. See [PLAN.md](PLAN.md) for the product spec, data model and phases.

Status: the MVP is complete through Phase 10: a notebook of fixed size (64, 96, 128 or 192 pages, in sheets of four) made whole at creation, lined pages you write on and draw on (drawing mode keeps the drawing as a still while writing), sections as cuts on sheet boundaries, an overview of the notebook's spreads with the pages written, zine pages behind a feature flag, a media pool, themes, search, PDF and PNG exports, JSON and zip backups, one notebook at a time (another is opened from its backup). Visual refinement comes next.

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
