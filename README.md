# typestill

A commonplace notebook built on top of Excalidraw. Fixed-size pages, one after the other, in one file. See [PLAN.md](PLAN.md) for the product spec, data model and phases.

Status: the MVP is complete (Phases 1 to 3) and its feedback round (Phase 4) is in: lined and zine pages composed from blocks, real facing spreads, one infinite canvas per notebook, a media pool, themes, tags, search, PDF and PNG exports, JSON and zip backups, one notebook at a time (another is opened from its backup). Visual refinement comes next.

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
