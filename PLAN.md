# typestill

A digital notebook made to be the bridge between digital notes and real commonplace notebooks and zines. Opinionated but flexible, with simplicity at its core. Built on top of Excalidraw for drawing.

The idea: a notebook where each side has its own character. On the left, fixed-size lined pages you write on like a simple note editor, in Excalidraw's handwriting font, always on the lines. On the right, one infinite Excalidraw canvas per notebook for drawings, diagrams and images, with an optional grid that snaps. Pages remember where they left the canvas, so each page opens next to its own part of the drawing. Pages come in two kinds: lined pages for writing, and zine pages for images with a little text. No productivity-app machinery.

Status (2026-09-18): Phase 1 is complete and on `main`: the store, the page editor, the canvas panel and split view, storage wiring with autosave and per-page canvas views, backup download and restore, notebook settings, the left rail and the bare notebook switcher. Phase 2 is under way: text formatting, the notebook cover, zine pages, the media pool, themes (Ruled and Plain), Dark with the app appearance setting, the divider drag, tags, hover thumbnails, the two-page spread and the date stamp and page number are done; the backup format is at version 5. Next is the page settings panel, the last Phase 2 item. Visual refinement is deliberately left for the end; the page's paper look should be settled before export work starts.

---

## 1. Product principles

- It should feel like a Moleskine with a drafting table next to it, not like a productivity app.
- Writing and drawing are different activities and get different surfaces: pages for text, one canvas for everything else.
- Pages are appended in creation order. Never reordered.
- Pages have no title. They have a date, an optional tag, and content.
- The app is not opinionated about organization. Tags and filters are the only structure.
- Text is on the lines by construction. The user never nudges things to keep a page tidy.
- Everything drawn on the canvas is plain Excalidraw. We only build the shell around it.
- Simplicity over features. Each page kind does one thing well: lined pages hold writing, zine pages hold images. Images never go into lined pages.
- The owner holds the data: browser storage plus backup files they keep. No accounts, no backend.
- It behaves like a real notebook in human hands. Things stay tied together, and the user plays by its rules rather than the app quietly untying them.

## 2. Product spec

### Notebooks
- Multiple notebooks. Each one is a separate storage record with its own backup.
- A simple shelf screen on launch (name, page count, last opened). Notebooks are created, renamed and deleted only from the shelf.
- Inside a notebook there is a switcher in the header.
- A notebook has many pages and exactly one canvas.
- Every notebook has a cover: a colour from a small palette, an optional emoji or initial, the name, and an optional subtitle. The cover is what the notebook looks like when closed: the card on the shelf, and a small swatch next to the name in the switcher and the app bar. It is set in notebook settings. Image covers are not planned.

### Layout: the split view
- The text column on the left is the app. Its bar holds the page navigation (previous, next, new page) on the left, the notebook name in the middle, and on the right: page settings, the notebook menu (settings, backup), preview and the canvas panel toggle. Controls are icon buttons with a hover tooltip showing the label and, once one exists, the keyboard shortcut.
- The canvas is a rounded side panel on the right, like an artifact panel next to a chat. It is resized from the gap between the two, the width is remembered per browser, and it can be closed and reopened from the bar. The text column is always visible.
- The text column shows one page, fit to the available space at the paper's aspect ratio. With the panel closed: two-page spread of consecutive pages (Phase 2).
- The two sides navigate independently. Flipping pages never moves the canvas by itself; opening a page restores the canvas view that page remembers (see Canvas).

### Pages (text)
- Page size is set per notebook: A5, A4 or Letter. Orientation is set per notebook: portrait or landscape.
- A page is lined paper: horizontal rules at a fixed pitch, a top margin, and a light red margin line on the left. Text sits on the rules. The margin line position is a notebook default (20mm), adjustable per page in the page settings.
- Writing works like a simple note editor: typing, line breaks, wrapping at the column edge, caret, selection, undo, copy and paste. Plain text only. The font is Excalifont, Excalidraw's handwriting font.
- A page holds a fixed number of lines. When it is full, input stops. The user creates the next page.
- Optional divider: a light gray vertical line that splits the page into two columns of text. It defaults to the middle of the writable area (from the margin line to the right edge), snaps to 10mm steps when moved, and can be removed. A new page inherits the divider of the page it was created from. "Two columns" is toggled from the page settings popover, next to the page's metadata (number, date).
- The page is a white sheet with a thin border and rounded corners, no shadow, matching the canvas panel.
- Basic formatting: bold, italic, text colour from a small palette shared with the canvas (Excalidraw's five stroke colours), and paragraph alignment (left, centre, right). Alignment works like Google Docs: it applies to the whole paragraph, including its wrapped lines and any line breaks inside it, and to every paragraph a selection touches. Enter starts a new paragraph; Shift+Enter breaks a line within the paragraph. A small bar floats over a selection with bold, italic, the five swatches and the three alignments; the shortcuts are Cmd+B, Cmd+I and Cmd+Shift+L / E / R, as in Google Docs. Nothing else: no font sizes, lists or links. The text stays on the lines whatever the formatting.
- Pages can be deleted (with a confirm). Remaining pages are renumbered, since the number is just the position in the notebook.
- Optional date stamp in the top right corner, formatted like "September 16, 2026".
- Optional page number at the bottom center.
- Date stamp and page number are per-page toggles, with a notebook-level default for new pages. They are rendered by the shell as overlays and composited into exports.
- Preview: the page without rules, margin and divider, read-only.

### Pages (zine)
- A second page kind, for images, next to lined pages. A notebook mixes both freely. The kind is chosen when a page is created and can change only while the page is empty.
- A zine page is composed like a Behance project, but small: one media block, which is a single image or a grid of two to four images, plus optional text below the media, beside it, or both. Nothing else on the page; nothing is dragged.
- The media block fills the page. Padding is a page setting: zero means the images bleed to the page edges; otherwise the same margin on every side and the same gap between blocks.
- Text below reserves a fixed number of lines at the bottom (default four, a page setting). Text beside reserves a column on the right, a third of the page width (left is an option). Text blocks use the same editor as lined pages with the same formatting and the same hard stop when full, but no rules and the theme's zine font, a typeface rather than the handwriting of lined pages.
- Grid presets: two side by side, two stacked, two by two. Each cell fills with its image cropped to cover it; a per-image "fit" option letterboxes instead. Empty cells show a placeholder until an image is dropped in.
- Images come from paste, drop or a file picker. They are downscaled on import (long edge 2048px, re-encoded), stored once per notebook by content hash in the same files table the canvas uses, and inlined in backups.
- Zine pages remember a canvas view like lined pages, appear in the rail like any page, face each other in the two-page spread, and export at physical size like lined pages.

### Media pool
- Every notebook has one media pool: every image in the notebook, whether placed on a zine page or drawn onto the canvas. One image is one record, by content hash, however many places use it.
- The side panel shows the pool when a zine page is open and the canvas when a lined page is open. A control in the panel switches to the other for a look; the mode follows the page again on the next page change.
- Images enter the pool by dropping files on the pool or on a page, by paste, or with a file picker. They are downscaled on import (see section 5). The same file imported twice is one image.
- An image is placed by dragging it from the pool onto a cell of the page's media block, or by selecting a cell and clicking an image. Dropping onto a filled cell replaces the image there. Dragging an image onto the canvas adds it there as an Excalidraw image element.
- Each image in the pool shows where it is used: page numbers and the canvas. An image in use cannot be deleted; the user replaces it first. Deleting an unused image removes it from the notebook.

### Themes
- A theme is the look of the pages and nothing else: the fonts, the line grid, the rules and margin line, the colours, the zine defaults. The app's chrome is not themed.
- Every notebook references one theme. Changing it re-lays out every page at once; text keeps its lines, and the usual rule for text past the last line applies.
- Built-in themes come with the app. "Ruled" is today's look: Excalifont on lines at 7mm with the red margin line. "Plain" is a monospaced typeface with no visible rules and no margin line, on the same invisible grid. Rules can be lines, dots or none; the grid and the hard stop are always there, since they are the constraint, not the decoration.
- "Dark" is the third built-in theme, right after the first two: dark paper, light ink, dimmed rules and margin line, the same five colour picks. Because the pages are themed and the chrome is not, Dark comes with an app appearance setting, light, dark or system, that the chrome and the canvas follow (Excalidraw has its own dark theme). Picking the Dark theme suggests the dark appearance; the two stay separate settings.
- Custom themes come later: made in settings from the same fields, with user-provided font files stored in the notebook, travelling in backups. A notebook template, meaning a theme plus notebook defaults and a page size, is also later.

### Canvas (drawing)
- One infinite Excalidraw canvas per notebook. Pan and zoom as in Excalidraw.
- Tools: pen, text, rectangle, ellipse, line, arrow, eraser, image paste. Text on the canvas is free.
- Grid: a notebook-level toggle. Grid on shows Excalidraw's grid and snaps creation, moves and resizes to it. Grid off is free editing on a blank canvas.
- Each page remembers a canvas view (scroll and zoom). The view is captured while the page is open and restored when the page is opened again, so a page sits next to its own area of the drawing. A page with no remembered view leaves the canvas where it is.

### Tags
- One tag per page, or none.
- Tags have a name and a color, defined at notebook level.
- The tag color is what colors the page's square in the left rail. Untagged pages are neutral gray.

### Left rail (page navigator)
- A vertical stack of small squares, one per page, in notebook order. Think GitHub contribution squares.
- Hovering a square shows a minified preview of the page.
- Clicking jumps to the page and restores its canvas view.
- The rail can be filtered by tag. Filtering only hides squares; page order and numbering stay the same. Deleting from a filtered view deletes from the real notebook.

### Search
- Full-text search across all pages and the canvas's text of the current notebook. Results jump to the page, or pan the canvas to the element.

### Storage
- Browser storage (IndexedDB), autosave on every change.
- Download the notebook as a backup file. Open a backup file to restore.

### Export
- PDF of all pages, without rules, margin or divider. Date stamp and page number included when enabled.
- PNG of the current page, same treatment.
- PNG of the canvas, by content bounds, without the grid.

### Platform
- Desktop browsers only.
- Personal use first, but built so it can be shipped to others.
- Keep the door open for sync and collaboration later. Do not build them now.

## 3. Data model

```
Notebook {
  id: string
  name: string
  createdAt: number
  lastOpenedAt: number
  lastPageId: string | null            // the page the notebook opens at
  cover: { color: string, emoji: string | null, subtitle: string | null }
  themeId: string                      // a built-in theme, or later a custom one
  pageSize: "A5" | "A4" | "Letter"
  orientation: "portrait" | "landscape"
  defaults: {
    showDate: boolean
    showPageNumber: boolean
    margin: number                     // margin line offset in mm for new pages
    divider: number | null
  }
  tags: [{ id: string, name: string, color: string }]
}

Page {
  id: string
  notebookId: string
  createdAt: number                    // also the page order
  kind: "lined" | "zine"
  tagId: string | null
  showDate: boolean
  showPageNumber: boolean
  margin: number                       // margin line offset in mm
  columns: Column[]                    // lined pages: one or two columns
  zine?: Zine                          // zine pages
  divider: number | null               // mm from the left edge, null for one column
  canvasView: { scrollX, scrollY, zoom } | null
}

Column {
  text: string                         // plain text mirror of doc: search, and what a backup reader without the editor can use
  doc: EditorDocument                  // ProseMirror JSON: paragraphs with an align attr; text with bold, italic and colour marks; hard breaks
}

Zine {
  padding: number                      // mm; 0 = images bleed to the page edges
  media: {
    layout: "single" | "row" | "column" | "square"   // one image, 2 side by side, 2 stacked, 2 by 2
    images: ({ fileId: string, fit: "cover" | "contain" } | null)[]   // one slot per cell, null while empty
  }
  textBelow: Column | null             // reserves textRows lines at the bottom
  textBeside: Column | null            // reserves a column of a third of the width
  textSide: "right" | "left"
  textRows: number
}

Theme {
  id: string
  name: string
  lined: {
    font: Font
    pitchMm: number                    // rule pitch, and the text line height
    firstRuleMm: number
    bottomMm: number                   // no rule closer than this to the bottom edge
    rules: "lines" | "dots" | "none"
    marginLine: boolean
    defaultMarginMm: number
    textInsetMm: number
    rightInsetMm: number
  }
  zine: { font: Font, defaultPaddingMm: number, defaultTextRows: number }
  colours: { paper: string, ink: string, rule: string, margin: string, divider: string }
  page: { border: boolean, cornerMm: number }
}

Font {
  family: string
  source: "bundled" | "file"           // a font shipped with the app, or a file in the notebook
  fileId?: string
  lineHeight: number                   // unitless; the font size is the pitch divided by it
}                                      // the baseline offset is measured at runtime, never stored

Canvas {
  notebookId: string                   // one per notebook
  gridEnabled: boolean
  elements: ExcalidrawElement[]        // untouched Excalidraw data
}

NotebookFile { notebookId, id, data: BinaryFileData }   // images, referenced by the canvas
```

Notes:
- Pages, the canvas and files are separate records so autosave writes only what changed. The shelf reads notebook metadata only.
- The canvas's `elements` is valid Excalidraw data. It can be exported as a normal `.excalidraw` file at any time, and future sync/collab can reuse Excalidraw's own reconciliation instead of a custom one.
- Backup file = notebook, pages, canvas and files as one JSON document, images base64 inside. A zip backup with images as separate files is planned for Phase 3, for notebooks heavy with photos. Format version 5; version 1 files (plain-string columns) are converted on open, each line break becoming a paragraph boundary, files from before version 3 get the default cover, pages from before version 4 are lined, and notebooks from before version 5 use the Ruled theme. The IndexedDB schema has the same upgrades (Dexie versions 2 to 5).
- Page thumbnails are cached separately in IndexedDB (a `thumbnails` table, Dexie version 6) and are not part of the file, so the backup format stays at version 5.
- Built-in themes are code, not records. Custom themes (later) are records under the notebook and go into the backup with it.

## 4. Tech stack

- React + TypeScript + Vite, pnpm
- `@excalidraw/excalidraw` (MIT) for the canvas, embedded, not forked
- Our own page editor in Excalifont, self-hosted from Excalidraw's font files: ProseMirror with a tiny schema (paragraphs with alignment; marks bold, italic, colour; a hard break)
- Dexie for IndexedDB
- Excalidraw's `exportToBlob` / `exportToCanvas` for the canvas; SVG foreignObject rendering for pages
- pdf-lib to assemble page images into a PDF
- No backend in v1

## 5. How the tricky parts get solved

**Text on the lines.** One editor per column, in Excalifont, with the line height equal to the rule pitch and the top placed so the first baseline sits on the first rule; paragraphs have zero margin, so every baseline lands on a rule whatever the formatting. Wrapping at the column edge and everything else (caret, selection, input methods) is the browser's; ProseMirror keeps the document and the DOM in step. A contenteditable rather than a text area so text can later wrap around images floated in the column. Capacity is the number of rules on the page: every transaction that changes the document is measured first, by rendering the candidate document into a hidden mirror laid out like the column (with the trailing break ProseMirror adds to an empty last line), and one that would push text past the last rule is dropped. Text already past the last rule (after a page size change) can still be edited as long as the edit does not make it longer. The font comes from the woff2 subsets Excalidraw ships; a script writes the matching `@font-face` rules at install time. Excalifont has one weight, so bold and italic are the browser's synthetic ones.

**Two columns.** Two text areas side by side. The divider is a shell element positioned at the page's divider offset, dragged in 10mm steps. Text does not flow between columns; each column is its own text.

**Text formatting.** Bold, italic, colour and paragraph alignment need a structured document rather than a string, and reliable caret, undo, paste and input-method handling around marks is exactly where hand-rolled editors bleed time. The column is a ProseMirror editor with a tiny schema: a document of paragraphs, each with an alignment attribute; text with bold, italic and colour marks; a hard break node for Shift+Enter; nothing else. Enter splits the paragraph (the new one keeps the alignment and the marks being typed with), so alignment is a block property exactly as in Google Docs: it applies to the whole paragraph (wrapped lines and hard breaks included) and to every paragraph a selection touches, never to a single visual line. The colour palette is Excalidraw's default stroke picks; "black" is the page's ink, stored as no colour mark. Pasted HTML keeps bold, italic, alignment and palette colours and drops every other colour; pasted plain text becomes one paragraph per line, blank lines included. A small bar floats over a selection (after the pointer is released, so it does not chase a drag) with bold, italic, the swatches and the three alignments; the page positions it from the column's report of where the selection is. Capacity is still measured by height; floats for images still work because the editor's content is not a new block formatting context; export still renders the same DOM. Storage: each column keeps a `doc` in ProseMirror's JSON and a plain `text` mirror derived from it (paragraphs and hard breaks as line breaks); the backup format is version 2, with a converter that turns version 1 strings into one paragraph per line (each existing line break becomes a paragraph boundary, since that is what Enter meant before), and the IndexedDB schema upgrades the same way.

**Zine pages.** A zine page is a fixed layout, not a free canvas: the media block plus optional text below or beside it, computed from the page size, the padding and the text reservations. Nothing is dragged; the page settings popover holds the padding, the grid preset, the text placement and the rows reserved. The media block renders images with object-fit; the text blocks reuse the ProseMirror column with its capacity check and no rules. Export renders the same DOM as lined pages. Files are the notebook's existing files table, content-hashed and shared with the canvas; pruning walks zine pages as well as the canvas.

**Images.** Photos would swamp browser storage and backups, so images are downscaled on import with a canvas in the browser (long edge 2048px, JPEG at quality 0.85, PNG kept only when transparent) and stored as data URLs. A 2048px JPEG is a few hundred KB, so a notebook with a hundred images is tens of MB in IndexedDB and in its backup, which browsers handle but is worth showing in notebook settings. Nothing here needs a backend: the owner's browser holds the data and the owner holds the backups; only sync or collaboration would, and both stay "later".

**Media pool.** The pool is a view over the notebook's files table with a usage index: the image references of every zine page plus the file ids of the canvas's image elements, kept in the session and refreshed on save. The panel has two modes, canvas and pool, chosen from the open page's kind. Placing an image on a page writes its file id into the media block; dragging one onto the canvas goes through Excalidraw's API (add the file, then insert an image element). Deletion is refused while the usage index lists the image anywhere, and the pool shows those places.

**Themes.** The constants in the paper module (pitch, first rule, bottom margin, insets, the line height ratio) and the colour tokens become the fields of a theme, with today's values as the "Ruled" theme, and the page components take the theme as a prop and set the CSS custom properties from it. Two things stop being constants. Fonts load through the FontFace API from bundled files or from a file in the notebook's files table, never from the network. The baseline offset that puts text on the rules is measured at runtime per font and size (the browser reports a font's ascent and descent from a canvas text measurement) and cached, replacing the hand-tuned ratio, so any font lands on the rules without per-font numbers in the theme. Rules are drawn by CSS from the theme as lines, dots or nothing; the mirror-based capacity check does not change. The zine text font is a second font slot on the theme. Export renders the same DOM, so themes carry through to PDF and PNG.

**Page export with identical wrapping.** Render the page's DOM into an SVG foreignObject with the font inlined as data URLs, draw it to a canvas at 2x, then composite the date stamp and page number. The same DOM wraps identically on screen and in the export. Print CSS is the fallback if foreignObject proves unreliable.

**Canvas.** Plain Excalidraw with no viewport constraint. Grid is `gridModeEnabled` with `gridSize` set from the notebook's grid pitch. The toolbar is stripped with CSS, since UIOptions cannot hide individual tools and disabling the image tool breaks paste. The editor must stay wider than about 730px or Excalidraw switches to its mobile layout: collapse the text side rather than squeezing the canvas below that.

**Canvas view per page.** Excalidraw's `onScrollChange` reports scroll and zoom. The latest value is stored on the open page, debounced, and restored through `updateScene` when a page opens.

**Thumbnails.** The same foreignObject render at roughly 120px wide, debounced after each change, stored in IndexedDB keyed by page id.

**Date stamp and page number.** HTML overlays positioned inside the page element, so the page render (thumbnails, exports) carries them without a compositing step.

**Search.** Pages are plain strings. For the canvas, walk the text elements (they carry a `.text` field).

**PDF.** Render each page to PNG at 2x and place it on a PDF page of the matching physical size (A5 148x210mm, A4 210x297mm, Letter 8.5x11in), respecting orientation.

**Multiple notebooks.** Notebook metadata is one record; pages, canvas and files are their own records under the notebook id. The shelf reads only metadata. A notebook is loaded fully when opened.

## 6. Phases

### Phase 0: spike (done)
Asked "does a constrained page feel like paper?" with a pinned Excalidraw page. The look was right, but it showed that Excalidraw is the wrong tool for text on lines, which led to the split: our own editor for pages, Excalidraw for the canvas. What carried over: the scaffold, font self-hosting, toolbar stripping, the mobile breakpoint lesson, page geometry.

### Phase 1: MVP (start using it daily)
- Store: notebooks, pages, canvas, files, backup (done)
- Page editor: lines, margin, capacity, one column (done)
- Canvas: infinite Excalidraw with the grid toggle (done)
- Split view: text column plus resizable canvas panel (done)
- Multiple pages: next / prev / new page; canvas view per page (done)
- IndexedDB autosave for pages and canvas (done)
- Download backup / open backup (done)
- Notebook settings: page size, orientation (done)
- Left rail with squares: one per page, current page highlighted, click to jump (no tags, no thumbnails) (done)
- Bare notebook switcher (create / open) so the app is never single-notebook by design (done)

### Phase 2: notebook feel
- Text formatting: bold, italic, colour, alignment; the page editor moves onto ProseMirror (section 5) (done)
- Notebook cover: colour, optional emoji and subtitle, set in notebook settings; shown as a swatch in the switcher and the app bar (the shelf renders it as a card in Phase 3) (done)
- Zine pages: the page kind and its picker on new page, the media block (single image or grid preset), optional text below and beside, padding and reservations in page settings, image import with downscaling, files shared with the canvas (done)
- Media pool: the panel's pool mode on zine pages, usage index, placing by drag or click, drag onto the canvas, deletion refused while in use (done)
- Themes: the theme model with the built-in Ruled and Plain themes, a theme field on the notebook and a picker in settings, runtime baseline measurement, the zine text font (done)
- Dark: the built-in Dark theme, and the app appearance setting (light, dark, system) for the chrome and the canvas, right after the themes land (done)
- Divider drag and inheritance polish (two columns exist since Phase 1) (done)
- Tags: create, assign, color; rail coloring and filtering (done)
- Hover thumbnails in the rail (done)
- Two-page spread when the canvas is collapsed (done)
- Per-page date stamp and page number, with notebook defaults (done)
- Page settings panel
- Preview, the page without rules, margin or divider (done in Phase 1)

### Phase 3: get it out
- Full-text search
- PDF export (all pages)
- PNG export (current page, canvas)
- Zip backup with images as files; storage size shown in notebook settings; prune unreferenced images
- Delete page with confirm
- Keyboard shortcuts for page navigation
- Proper shelf screen, notebooks shown as their covers
- First-run onboarding

### Later, not now
- Images on text pages with text wrapping around them: superseded by zine pages on 2026-09-17. The float approach stays documented in the decisions log in case it is ever wanted.
- Cursor alternatives for pages: highlighting the active rule, or only the piece of rule under the next character, instead of a caret. Tried on 2026-09-17, not adopted for now.
- Custom themes made in settings, user font files stored in the notebook, and notebook templates (theme plus defaults plus page size)
- Tag-based links between pages and canvas areas
- Multiple notebooks polish (sorting)
- Sync
- Collaboration
- Mobile / tablet

## 7. Decisions log

- No fork of Excalidraw. Embed the npm package and control it from outside.
- Pages never reorder. Date order is the only order.
- One tag per page.
- Page size and orientation are notebook-level.
- Date stamp and page number are overlays, not canvas elements.
- Browser storage first, backups as downloadable files. No accounts, no backend.
- 2026-09-17: Pages are text only, written in our own editor on lined paper. Drawing lives on one infinite Excalidraw canvas per notebook. This replaces "every page is an Excalidraw canvas" and the paper snapping spec that followed it. Reason: Excalidraw has no document flow and no public way to start editing an element, so a note editor built on it would fight it forever, while its grid mode already gives live snapping for drawings.
- Blank, dotted and grid paper are gone. Pages are lined; the canvas has a grid toggle; "clear" is a view mode.
- One canvas per notebook. Pages remember a canvas view instead of owning canvases.
- A full page stops accepting input. The user creates the next page.
- Plain text only on pages in Phase 1. Basic formatting (bold, italic, colour, alignment) is in scope for Phase 2 and moves the page editor onto ProseMirror; columns stay plain strings until then.
- Text formatting (2026-09-17): the page editor is ProseMirror with the schema of section 5. The text colour palette is Excalidraw's five default stroke picks, so pages and the canvas share one set of colours; the black swatch means the page's ink and is stored as no mark. Alignment shortcuts follow Google Docs (Cmd+Shift+L / E / R). Bold and italic are synthetic, since Excalifont has one weight; a bolder handwriting face is not planned. Colours outside the palette are dropped on paste. Columns are `{ text, doc }`, with `text` derived from `doc`; the backup format and the IndexedDB schema are at version 2, and version 1 data is converted with one paragraph per old line.
- App bar controls are icon buttons with hover tooltips (label plus shortcut). Page navigation sits at the left of the bar; page settings, the notebook menu, preview and the panel toggle at the right.
- "Clear view" is called Preview.
- "Two columns" lives in page settings, with the page's metadata.
- The page has a thin border and rounded corners and no shadow, like the canvas panel.
- Visual and branding refinement is deferred to the end; the control layout is settled when the rail arrives, and the paper look before export.
- Notebook cover added to scope (2026-09-17): colour, optional emoji or initial, and subtitle, stored on the notebook and included in backups. Data and settings in Phase 2, the shelf card in Phase 3. Its exact look is part of the visual pass at the end.
- The divider snaps to 10mm steps and defaults to the midpoint of the writable area. The margin line offset is a notebook default, adjustable per page.
- The caret is drawn by the shell, centred between rules, because a native text caret spans the whole line box and straddles the rule. Known issue: in the user's Chrome the caret still appears to cross the rule below it, while the built-in browser shows it centred; to be investigated in that Chrome directly.
- The left rail sits under the app bar, to the left of the desk, with its first square aligned to the top of the page. The list scrolls on its own and keeps the open page's square in view; the hover label (and later the hover preview) floats beside the rail rather than inside the scrolling list, so it is never clipped.
- The notebook switcher is the notebook name in the app bar: it opens a list of every notebook (most recently opened first, with page counts) and a "New notebook…" entry that asks for a name with a browser prompt. Renaming and deleting wait for the shelf screen (Phase 3).
- Images on text pages (assessed 2026-09-17, not scheduled): possible with fixed-position floats now that the editor is a contenteditable. The editor switch was done on 2026-09-17. Superseded the same day by zine pages: images get their own page kind rather than a place inside lined pages.
- Mission (2026-09-17): typestill is a digital notebook made to be the bridge between digital notes and real commonplace notebooks and zines. Opinionated but flexible, simplicity at its core. Note-taking is close to its end behaviour; the remaining area is images, handled by zine pages.
- Zine pages (2026-09-17): a second page kind with one media block (a single image or a grid of up to four) and optional text below and/or beside it; padding as a page setting, no free placement, a fixed number of text rows. Text blocks reuse the lined editor without rules. Images are downscaled on import, stored in the notebook's files table by content hash and inlined in backups. No backend: browser storage plus owner-held backups remain the whole story.
- Page sizes: A4 may be descoped, since zine pages want small pages. Not decided.
- Media pool (2026-09-18): an image in use on a page or the canvas cannot be deleted from the pool. Replace it first, then delete. Things stay tied, as in a real notebook; the user plays by its rules. The pool is one per notebook, over the same files table the canvas uses, and the side panel shows it on zine pages in place of the canvas.
- Themes (2026-09-18): the page look is a theme the notebook references; built-in Ruled and Plain first, custom themes and templates later. Rules may be lines, dots or none, but the line grid and the hard stop are never themed away. Fonts are bundled or stored in the notebook, never fetched from the network; the baseline offset is measured at runtime rather than stored. This brings dot and blank paper back as theme choices without the page-level paper setting that was removed on 2026-09-17.
- Zine text blocks use the theme's zine font, a typeface rather than the lined pages' handwriting.
- Date stamp and page number, built (2026-09-18): both are elements inside the page (`src/page/PageMarks.tsx`), in the page's font and ink at 60% opacity, 3.2mm tall: the date 6mm from the top and right edges, the number 4mm from the bottom, centred. Being part of the page element they are in thumbnails and exports for free, so the export step composites nothing. They stay in the preview (only rules, margin and divider go). The date is the page's creation date in the browser's locale with the month in full. The toggles are in page settings; the notebook defaults for new pages are a "New pages" group in notebook settings. Zine pages show them too, over the image when it bleeds.
- Two-page spread, built (2026-09-18): with the panel closed the desk shows fixed pairs of pages, 1–2, 3–4 and so on, like a book lying open, so the open page stays put while its neighbour appears beside it; the last odd page sits alone on the left. The other page of the spread is read-only (dimmed a touch) until it is clicked, when it becomes the open page in the same click, before the pointer reaches its editor, so the caret lands where the click was; drops and pastes go to the open page only. Page settings, the tag and the thumbnail follow the open page.
- Hover thumbnails, built (2026-09-18): the page render is the foreignObject approach of section 5 (`src/page/render.ts`): the live page element is cloned into an SVG with the page's stylesheet rules and the fonts it uses inlined as data URLs, drawn to a canvas. Thumbnails are rendered 240px wide and shown at 120px, 1.2s after the open page's content or look last changed, and stored per page id in a `thumbnails` table (Dexie version 6; not in backups, which stay at version 5). Only the open page is re-rendered, so a theme or page size change refreshes other pages' thumbnails when they are next opened. Nothing is rendered while the preview is on. The same renderer will serve the PNG and PDF exports.
- Tags, built (2026-09-18): tags are managed in a Tags group of notebook settings (name, a colour from the cover palette, delete) and applied at once rather than on Save; a page's tag is a select in the page settings popover, with a "New tag…" entry that asks for a name and assigns it. New tags take the least used palette colour. Deleting a tag asks first and untags its pages. The rail colours tagged squares and rings the open one; its filter is a small button above the squares, per session (not stored), and a filter whose tag is gone counts as no filter.
- Divider drag, built (2026-09-18): the divider has a 12px grab area over the text; dragging moves it in 10mm steps from the left edge, the columns following live, and the offset is saved on release. It cannot come closer than 20mm of text to the margin line or the right edge. The default (the midpoint of the writable area) is not snapped; only moves are. Inheritance stays as built: a new page takes the divider of the page it was created from.
- Dark, built (2026-09-18): the appearance setting is per browser (localStorage, applied before the first paint from index.html), not part of the notebook or its backup, and lives in the App group of the settings dialog. The chrome's colours are tokens on `:root` with a `data-appearance="dark"` set; the canvas passes the resolved scheme to Excalidraw's `theme` prop. Picking a theme with dark paper (luminance below half) switches the appearance select to dark when the current scheme resolves to light; the user can put it back before saving. Empty zine cells are drawn relative to the paper, so they read on any theme.
- Themes, built (2026-09-18): built-in themes are code in `src/theme/themes.ts`; a notebook stores `themeId` and an unknown id falls back to Ruled. Plain's monospaced face is Cascadia Code, bundled from Excalidraw's fonts like Assistant; bundled fonts load through `@font-face` files written at install time, and the FontFace API path is reserved for user font files with custom themes (later). The baseline is measured per font and size from a canvas text measurement of "Hg" (half the line height plus half the ascent minus descent), cached once the font is loaded, with the old 0.7 ratio as the fallback until then; Excalifont measures at 0.696, Cascadia at 0.754, so the hand-tuned number would have been wrong for the second font. Zine text uses the theme's zine font but the lined pitch for its rows. The page corner radius is now the theme's `cornerMm`, so it scales with the page. Backup format and IndexedDB schema are at version 5.
- Media pool, built (2026-09-18): the panel's mode follows the open page's kind, and a control in the panel's corner peeks at the other until the next page change. The usage index is the zine pages' media blocks plus the file ids of the canvas's image elements, which the session tracks from every canvas change. Placing by click needs a chosen cell (the cell clicked on the page); with none chosen, the pool's images are drag-only. An image dropped on the canvas comes in centred on the drop point, at most 400 scene px on its long edge, as an undoable Excalidraw image element. Deletion asks first and is refused by the store while the image is in use; the pool shows the pages and the canvas that use it. The pool lists images newest first.
- Zine pages, built (2026-09-18): "New page" is a small menu, lined or zine, so the kind is chosen at creation; the page settings popover also switches the kind of an empty page (the store refuses otherwise). The media block's images array has one slot per cell, null while empty, so the grid presets can show placeholders. The padding is the gap between cells and blocks too; text beside runs the full height of the padded area and text below sits under the media only; text is inset 2mm inside its block (4mm when the page bleeds). Images enter by paste anywhere on the page (into the clicked cell, else the first empty one), by drop on a cell, or from the cell's file picker; the first goes into the chosen cell and the rest into the empty cells after it. Removing an image from a cell leaves it in the notebook's files (the media pool decides deletion). A layout with fewer cells, or turning off a text block with writing, asks first. Zine text is Assistant, bundled from Excalidraw's fonts, until themes make it a theme slot; zine defaults (8mm padding, four rows) are constants for the same reason. Backup format and IndexedDB schema are at version 4.
- Notebook cover, built (2026-09-18): the palette is eight classic notebook colours (black, red, orange, olive, green, blue, purple, brown), all dark enough for white lettering; a new notebook is black. The emoji field keeps one grapheme; without one, the swatch shows the name's initial. The subtitle appears under the name in the switcher list. Renaming stays out of the settings dialog, since the shelf owns naming. Backup format and IndexedDB schema are at version 3; older data gets the default cover.
- Dark (2026-09-18): a built-in Dark page theme, implemented right after the first themes, paired with an app appearance setting for the chrome and the canvas. Appearance is not part of a theme; themes stay page-only.
