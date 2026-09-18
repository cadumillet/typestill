// Exports: PDF of every page, PNG of one page (and, dormant, PNG of the canvas). Pages
// are rendered off screen at zoom 1 in preview mode (no rules, margin or divider; the
// drawing stays; no side, so the paper is rectangular) through the
// same renderer as thumbnails, at 2x, so they wrap exactly as on screen; the PDF places
// each image on a page of the paper's physical size.

import { exportToBlob } from "@excalidraw/excalidraw";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { BinaryFileData, BinaryFiles } from "@excalidraw/excalidraw/types";
import { PDFDocument } from "pdf-lib";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { primeDrawingStill } from "../page/stills";
import { pageGeometry, pageMm } from "../page/paper";
import { renderPage } from "../page/render";
import { TextPage } from "../page/TextPage";
import { ZinePage } from "../page/ZinePage";
import type { Notebook, Page } from "../store/model";
import { primeBaseline } from "../theme/baseline";
import type { Theme } from "../theme/theme";
import { getTheme } from "../theme/themes";

export { exportFileName } from "./exportName";

/** Output scale over the paper's size at 96 dpi: 2x, about 192 dpi. */
const EXPORT_SCALE = 2;
const PT_PER_MM = 72 / 25.4;

export interface ExportSource {
  notebook: Notebook;
  files: Record<string, BinaryFileData>;
}

function pageElement(page: Page, source: ExportSource, theme: Theme) {
  const { notebook } = source;
  const common = {
    size: notebook.pageSize,
    orientation: notebook.orientation,
    theme,
    zoom: 1,
    preview: true,
    readOnly: true,
    drawing: page.drawing,
    drawingLayer: page.drawingLayer,
  };
  return page.kind === "zine" && page.zine ? (
    <ZinePage {...common} zine={page.zine} files={source.files} />
  ) : (
    <TextPage
      {...common}
      margin={page.margin}
      columns={page.columns}
      divider={page.divider}
      files={source.files}
    />
  );
}

/** A turn of the event loop, so the committed DOM is laid out. Not a frame: hidden tabs get none. */
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/**
 * Renders pages one at a time in a hidden host and hands each PNG to `each`. The host is
 * off screen but laid out, which is what the renderer needs.
 */
async function renderPages(
  pages: readonly Page[],
  indexes: readonly number[],
  source: ExportSource,
  each: (blob: Blob, index: number) => Promise<void>,
): Promise<void> {
  const theme = getTheme(source.notebook.themeId);
  const geometry = pageGeometry(source.notebook.pageSize, source.notebook.orientation);
  const pitch =
    (geometry.height / pageMm(source.notebook.pageSize, source.notebook.orientation).height) *
    theme.lined.pitchMm;
  // The fonts must be loaded and measured before the first render, so the pages come
  // out with their baselines on the rules rather than the fallback ratio; the drawings'
  // stills likewise, so a page finds its still on its first render.
  const { pageSize, orientation } = source.notebook;
  await Promise.all([
    primeBaseline(theme.lined.font, pitch / theme.lined.font.lineHeight, pitch),
    primeBaseline(theme.zine.font, pitch / theme.zine.font.lineHeight, pitch),
    ...indexes
      .filter((index) => pages[index].drawing.length > 0)
      .map((index) => primeDrawingStill(pages[index].drawing, source.files, pageSize, orientation)),
  ]);

  const host = document.createElement("div");
  host.className = "export-host";
  host.style.cssText = "position:fixed;left:-20000px;top:0;pointer-events:none";
  document.body.appendChild(host);
  const root = createRoot(host);
  try {
    for (const index of indexes) {
      flushSync(() => root.render(pageElement(pages[index], source, theme)));
      await settle();
      const element = host.querySelector<HTMLElement>(".text-page");
      if (!element) throw new Error("The page did not render");
      const canvas = await renderPage(element, {
        width: geometry.width * EXPORT_SCALE,
        preview: true,
      });
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error("PNG encoding failed"))),
          "image/png",
        ),
      );
      await each(blob, index);
    }
  } finally {
    root.unmount();
    host.remove();
  }
}

/** Every page as a PDF at the paper's physical size, in notebook order. */
export async function exportPdf(pages: readonly Page[], source: ExportSource): Promise<Blob> {
  const doc = await PDFDocument.create();
  doc.setTitle(source.notebook.name);
  doc.setProducer("typestill");
  const mm = pageMm(source.notebook.pageSize, source.notebook.orientation);
  const size: [number, number] = [mm.width * PT_PER_MM, mm.height * PT_PER_MM];
  await renderPages(
    pages,
    pages.map((_, i) => i),
    source,
    async (blob) => {
      const image = await doc.embedPng(await blob.arrayBuffer());
      const page = doc.addPage(size);
      page.drawImage(image, { x: 0, y: 0, width: size[0], height: size[1] });
    },
  );
  return new Blob([new Uint8Array(await doc.save())], { type: "application/pdf" });
}

/** One page as a PNG at 2x the paper's size at 96 dpi. */
export async function exportPagePng(
  pages: readonly Page[],
  index: number,
  source: ExportSource,
): Promise<Blob> {
  let out: Blob | null = null;
  await renderPages(pages, [index], source, async (blob) => {
    out = blob;
  });
  if (!out) throw new Error("The page did not render");
  return out;
}

/** The canvas as a PNG by content bounds, on white, without the grid. Dormant (PLAN.md section 8). */
export async function exportCanvasPng(
  elements: readonly ExcalidrawElement[],
  files: BinaryFiles,
): Promise<Blob> {
  const live = elements.filter((element) => !element.isDeleted);
  if (live.length === 0) throw new Error("The canvas is empty");
  return exportToBlob({
    elements: live,
    files,
    mimeType: "image/png",
    exportPadding: 24,
    appState: { exportBackground: true, viewBackgroundColor: "#ffffff", exportWithDarkMode: false },
    getDimensions: (width: number, height: number) => ({
      width: width * 2,
      height: height * 2,
      scale: 2,
    }),
  });
}
