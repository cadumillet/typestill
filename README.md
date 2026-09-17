# typestill

A commonplace notebook built on top of Excalidraw. Fixed-size pages, one after the other, in one file. See [PLAN.md](PLAN.md) for the product spec, data model and phases.

Status: Phase 0 spike. One hardcoded A5 portrait page, fit to screen, stripped toolbar, lined paper. No storage yet.

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
