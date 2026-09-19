// Rendering a page's DOM to an image: the page element is cloned into an SVG
// foreignObject together with the app's stylesheets and the fonts it uses (as data URLs,
// since an image cannot load fonts from the network), and drawn onto a canvas. The same
// DOM wraps identically on screen and in the image, so thumbnails and exports match the
// page exactly.

/** Parts of the page that are editing chrome, not content. */
const STRIPPED = [
  ".format-bar",
  ".text-page__mirror",
  ".text-page__full",
  ".text-page__divider-handle",
  ".page-chrome",
  ".zine-chrome",
];

export interface RenderOptions {
  /** Output width in px; the height follows the page's aspect ratio. */
  width: number;
  /** Render bare: no rules, margin line, divider or placeholders (the exports). */
  bare?: boolean;
}

/** Rules a page render needs: the page styles, the fonts, and the colour tokens. */
const PAGE_RULE = /\.(text-page|zine-)|@font-face|:root/;

/** The CSS rules of the app's stylesheets that concern pages, as text. */
function collectCss(): string {
  const parts: string[] = [];
  for (const sheet of document.styleSheets) {
    try {
      for (const rule of sheet.cssRules) {
        if (PAGE_RULE.test(rule.cssText)) parts.push(rule.cssText);
      }
    } catch {
      // A cross-origin sheet; nothing of ours is in it.
    }
  }
  return parts.join("\n");
}

const fontData = new Map<string, Promise<string>>();

/** A font file as a data URL, fetched once per session. */
function fontAsDataUrl(url: string): Promise<string> {
  let pending = fontData.get(url);
  if (!pending) {
    pending = fetch(url)
      .then((response) => response.blob())
      .then(
        (blob) =>
          new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(blob);
          }),
      );
    fontData.set(url, pending);
  }
  return pending;
}

/** Font family names a page uses: the page's own and its columns'. */
function fontFamiliesOf(page: HTMLElement): Set<string> {
  const families = new Set<string>();
  const parts = page.querySelectorAll<HTMLElement>(".text-page__column");
  for (const element of [page, ...parts]) {
    const first = getComputedStyle(element).fontFamily.split(",")[0];
    families.add(first.trim().replace(/^["']|["']$/g, ""));
  }
  return families;
}

/**
 * The @font-face rules of the given families with their files inlined. Other rules are
 * dropped: an image cannot fetch them, and they would only delay the render.
 */
async function inlineFontFaces(css: string, families: Set<string>): Promise<string> {
  const faces = css.match(/@font-face\s*{[^}]*}/g) ?? [];
  const wanted = faces.filter((face) => {
    const family = /font-family:\s*["']?([^;"']+)/.exec(face)?.[1].trim();
    return family !== undefined && families.has(family);
  });
  return (
    await Promise.all(
      wanted.map(async (face) => {
        const urls = [...face.matchAll(/url\(["']?([^"')]+)["']?\)/g)].map((m) => m[1]);
        let out = face;
        for (const url of urls) out = out.replace(url, await fontAsDataUrl(url));
        return out;
      }),
    )
  ).join("\n");
}

/** The stylesheet text without its @font-face rules. */
const withoutFontFaces = (css: string) => css.replace(/@font-face\s*{[^}]*}/g, "");

/**
 * Renders a page element to a canvas `options.width` px wide. The page must be in the
 * document, laid out, with its fonts loaded.
 */
export async function renderPage(
  page: HTMLElement,
  options: RenderOptions,
): Promise<HTMLCanvasElement> {
  const box = page.getBoundingClientRect();
  const clone = page.cloneNode(true) as HTMLElement;
  for (const selector of STRIPPED) clone.querySelectorAll(selector).forEach((el) => el.remove());
  // The sided corners are screen chrome: the image is the rectangular paper. Thumbnails
  // are rounded where they are shown, from the page's position at that moment.
  clone.classList.remove("side-left", "side-right");
  if (options.bare) clone.classList.add("is-bare");
  clone
    .querySelectorAll("[contenteditable]")
    .forEach((el) => el.removeAttribute("contenteditable"));

  const css = collectCss();
  const fonts = await inlineFontFaces(css, fontFamiliesOf(page));
  const html = new XMLSerializer().serializeToString(clone);
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${box.width}" height="${box.height}">` +
    `<foreignObject width="100%" height="100%">` +
    `<div xmlns="http://www.w3.org/1999/xhtml"><style><![CDATA[${cdata(withoutFontFaces(css))}\n${cdata(fonts)}]]></style>${html}</div>` +
    `</foreignObject></svg>`;

  const image = new Image();
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await image.decode();

  const scale = options.width / box.width;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(box.width * scale);
  canvas.height = Math.round(box.height * scale);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not draw the page");
  context.scale(scale, scale);
  context.drawImage(image, 0, 0, box.width, box.height);
  return canvas;
}

/** CSS goes into the XHTML as a CDATA section, so only its terminator needs care. */
const cdata = (css: string) => css.replace(/]]>/g, "]]]]><![CDATA[>");

/** Renders a page element to a PNG data URL. */
export async function renderPageToPng(page: HTMLElement, options: RenderOptions): Promise<string> {
  return (await renderPage(page, options)).toDataURL("image/png");
}
