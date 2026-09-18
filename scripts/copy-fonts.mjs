// Copies the fonts bundled with @excalidraw/excalidraw into public/fonts so the app
// serves them itself (index.html sets window.EXCALIDRAW_ASSET_PATH = "/") instead of
// pulling them from a CDN at runtime, and writes public/fonts/excalifont.css and
// public/fonts/typefaces.css so the page editor can use Excalifont, Assistant and
// Cascadia Code as normal web fonts. Runs on postinstall. public/fonts is gitignored.
import { cpSync, existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = resolve(root, "node_modules/@excalidraw/excalidraw/dist/prod");
const source = resolve(dist, "fonts");
const target = resolve(root, "public/fonts");

if (!existsSync(source)) {
  console.warn("copy-fonts: Excalidraw fonts not found, skipping");
  process.exit(0);
}

rmSync(target, { recursive: true, force: true });
cpSync(source, target, { recursive: true });
console.log("copy-fonts: copied Excalidraw fonts to public/fonts");

// Excalidraw declares each Excalifont subset as `var X = "./fonts/Excalifont/<file>"` and
// `{ uri: X, descriptors: { unicodeRange: "..." } }` somewhere in its chunks. Turn those
// into @font-face rules. Fail loudly if the layout changes, so it is noticed.
const faces = [];
for (const name of readdirSync(dist).filter((f) => f.endsWith(".js"))) {
  const js = readFileSync(resolve(dist, name), "utf8");
  const files = new Map(
    [...js.matchAll(/(\w+)="\.\/fonts\/Excalifont\/([^"]+)"/g)].map((m) => [m[1], m[2]]),
  );
  if (files.size === 0) continue;
  for (const m of js.matchAll(/\{uri:(\w+),descriptors:\{unicodeRange:"([^"]+)"\}\}/g)) {
    const file = files.get(m[1]);
    if (file) faces.push({ file, unicodeRange: m[2] });
  }
}
if (faces.length === 0) {
  console.error("copy-fonts: could not find Excalifont subsets in the Excalidraw bundle");
  process.exit(1);
}
const css = faces
  .map(
    ({ file, unicodeRange }) =>
      `@font-face {\n  font-family: "Excalifont";\n  src: url("/fonts/Excalifont/${file}") format("woff2");\n  unicode-range: ${unicodeRange};\n  font-display: swap;\n}\n`,
  )
  .join("\n");
writeFileSync(resolve(target, "excalifont.css"), css);
console.log(`copy-fonts: wrote excalifont.css with ${faces.length} subsets`);

// The typefaces ship as whole files, one per weight: Assistant for zine text and
// Cascadia Code for the Plain theme. One @font-face file covers them.
const typefaces = [
  ["Assistant", "Assistant/Assistant-Regular.woff2", 400],
  ["Assistant", "Assistant/Assistant-Bold.woff2", 700],
  ["Cascadia Code", "Cascadia/CascadiaCode-Regular.woff2", 400],
];
for (const [, file] of typefaces) {
  if (!existsSync(resolve(target, file))) {
    console.error(`copy-fonts: ${file} not found in the Excalidraw bundle`);
    process.exit(1);
  }
}
writeFileSync(
  resolve(target, "typefaces.css"),
  typefaces
    .map(
      ([family, file, weight]) =>
        `@font-face {\n  font-family: "${family}";\n  src: url("/fonts/${file}") format("woff2");\n  font-weight: ${weight};\n  font-display: swap;\n}\n`,
    )
    .join("\n"),
);
console.log("copy-fonts: wrote typefaces.css");
