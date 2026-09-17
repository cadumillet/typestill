// Copies the fonts bundled with @excalidraw/excalidraw into public/fonts so the app
// serves them itself (index.html sets window.EXCALIDRAW_ASSET_PATH = "/") instead of
// pulling them from a CDN at runtime. Runs on postinstall. public/fonts is gitignored.
import { cpSync, existsSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = resolve(root, "node_modules/@excalidraw/excalidraw/dist/prod/fonts");
const target = resolve(root, "public/fonts");

if (!existsSync(source)) {
  console.warn("copy-fonts: Excalidraw fonts not found, skipping");
  process.exit(0);
}

rmSync(target, { recursive: true, force: true });
cpSync(source, target, { recursive: true });
console.log("copy-fonts: copied Excalidraw fonts to public/fonts");
