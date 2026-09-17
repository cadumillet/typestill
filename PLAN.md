# typestill

A commonplace notebook built on top of Excalidraw.

The idea: a notebook where each side has its own character. On the left, fixed-size lined pages you write on like a simple note editor, in Excalidraw's handwriting font, always on the lines. On the right, one infinite Excalidraw canvas per notebook for drawings, diagrams and images, with an optional grid that snaps. Pages remember where they left the canvas, so each page opens next to its own part of the drawing. No productivity-app machinery.

Status (2026-09-17): Phase 1 is implemented except the bare notebook switcher. On `main`: the store, the page editor, the canvas panel and split view, storage wiring with autosave and per-page canvas views, backup download and restore, notebook settings. On `claude/phase-1-rail`: the left rail. Text formatting is specified for Phase 2 (sections 2 and 5). Visual refinement is deliberately left for the end; the page's paper look should be settled before export work starts.

---

## 1. Product principles

- It should feel like a Moleskine with a drafting table next to it, not like a productivity app.
- Writing and drawing are different activities and get different surfaces: pages for text, one canvas for everything else.
- Pages are appended in creation order. Never reordered.
- Pages have no title. They have a date, an optional tag, and content.
- The app is not opinionated about organization. Tags and filters are the only structure.
- Text is on the lines by construction. The user never nudges things to keep a page tidy.
- Everything drawn on the canvas is plain Excalidraw. We only build the shell around it.

## 2. Product spec

### Notebooks
- Multiple notebooks. Each one is a separate storage record with its own backup.
- A simple shelf screen on launch (name, page count, last opened). Notebooks are created, renamed and deleted only from the shelf.
- Inside a notebook there is a switcher in the header.
- A notebook has many pages and exactly one canvas.

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
- Basic formatting (Phase 2): bold, italic, text colour from a small palette shared with the canvas, and paragraph alignment (left, centre, right). Alignment works like Google Docs: it applies to the whole paragraph, including its wrapped lines and any line breaks inside it, and to every paragraph a selection touches. Enter starts a new paragraph; Shift+Enter breaks a line within the paragraph. Nothing else: no font sizes, lists or links. The text stays on the lines whatever the formatting.
- Pages can be deleted (with a confirm). Remaining pages are renumbered, since the number is just the position in the notebook.
- Optional date stamp in the top right corner, formatted like "September 16, 2026".
- Optional page number at the bottom center.
- Date stamp and page number are per-page toggles, with a notebook-level default for new pages. They are rendered by the shell as overlays and composited into exports.
- Preview: the page without rules, margin and divider, read-only.

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
  tagId: string | null
  showDate: boolean
  showPageNumber: boolean
  margin: number                       // margin line offset in mm
  columns: Column[]                    // one or two columns
  divider: number | null               // mm from the left edge, null for one column
  canvasView: { scrollX, scrollY, zoom } | null
}

Column {
  text: string                         // plain text: search, capacity checks, Phase 1 content
  doc?: EditorDocument                 // Phase 2: paragraphs with alignment, runs with bold/italic/colour
}

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
- Backup file = notebook, pages, canvas and files as one JSON document, images base64 inside.
- Page thumbnails are cached separately in IndexedDB and are not part of the file.

## 4. Tech stack

- React + TypeScript + Vite, pnpm
- `@excalidraw/excalidraw` (MIT) for the canvas, embedded, not forked
- Our own page editor in Excalifont, self-hosted from Excalidraw's font files: a plain-text contenteditable in Phase 1, ProseMirror from Phase 2 for formatting (schema: paragraphs with alignment; marks bold, italic, colour)
- Dexie for IndexedDB
- Excalidraw's `exportToBlob` / `exportToCanvas` for the canvas; SVG foreignObject rendering for pages
- pdf-lib to assemble page images into a PDF
- No backend in v1

## 5. How the tricky parts get solved

**Text on the lines.** One plain-text contenteditable block per column, in Excalifont, with the line height equal to the rule pitch and the top placed so the first baseline sits on the first rule. Wrapping at the column edge and everything else (caret, selection, undo, input methods, paste) is the browser's. A contenteditable rather than a text area so text can later wrap around images floated in the column. Line breaks always go through the browser's insert-line-break command so the DOM stays plain text, and Chrome's placeholder newline after a trailing one is normalised on read and write. Capacity is the number of rules on the page: an edit that would push text past the last rule is rejected before it happens, by measuring the candidate text in a hidden mirror with the column's width. The font comes from the woff2 subsets Excalidraw ships; a script writes the matching `@font-face` rules at install time.

**Two columns.** Two text areas side by side. The divider is a shell element positioned at the page's divider offset, dragged in 10mm steps. Text does not flow between columns; each column is its own text.

**Text formatting (Phase 2).** Bold, italic, colour and paragraph alignment need a structured document rather than a string, and reliable caret, undo, paste and input-method handling around marks is exactly where hand-rolled editors bleed time. The column moves onto ProseMirror with a tiny schema: a document of paragraphs, each with an alignment attribute; text with bold, italic and colour marks; a hard break node for Shift+Enter; nothing else. Enter splits the paragraph, so alignment is a block property exactly as in Google Docs: it applies to the whole paragraph (wrapped lines and hard breaks included) and to every paragraph a selection touches, never to a single visual line. Paragraphs render with zero margin and the rule pitch as line height, so the visual result is identical to today and text stays on the rules. Cmd+B and Cmd+I toggle marks; a small floating bar on a selection offers bold, italic, the colour palette (the same swatches as the canvas) and the three alignments. Capacity is still measured by height; floats for images still work because the editor's content is not a new block formatting context; export still renders the same DOM. Storage: each column keeps a plain `text` mirror for search and a `doc` in ProseMirror's JSON; the backup format goes to version 2 with a converter that turns version 1 strings into one paragraph per line (each existing line break becomes a paragraph boundary, since that is what Enter meant before).

**Page export with identical wrapping.** Render the page's DOM into an SVG foreignObject with the font inlined as data URLs, draw it to a canvas at 2x, then composite the date stamp and page number. The same DOM wraps identically on screen and in the export. Print CSS is the fallback if foreignObject proves unreliable.

**Canvas.** Plain Excalidraw with no viewport constraint. Grid is `gridModeEnabled` with `gridSize` set from the notebook's grid pitch. The toolbar is stripped with CSS, since UIOptions cannot hide individual tools and disabling the image tool breaks paste. The editor must stay wider than about 730px or Excalidraw switches to its mobile layout: collapse the text side rather than squeezing the canvas below that.

**Canvas view per page.** Excalidraw's `onScrollChange` reports scroll and zoom. The latest value is stored on the open page, debounced, and restored through `updateScene` when a page opens.

**Thumbnails.** The same foreignObject render at roughly 120px wide, debounced after each change, stored in IndexedDB keyed by page id.

**Date stamp and page number.** HTML overlays positioned over the page. For exports, drawn on top of the rendered page before saving.

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
- Bare notebook switcher (create / open) so the app is never single-notebook by design

### Phase 2: notebook feel
- Text formatting: bold, italic, colour, alignment; the page editor moves onto ProseMirror (section 5)
- Divider drag and inheritance polish (two columns exist since Phase 1)
- Tags: create, assign, color; rail coloring and filtering
- Hover thumbnails in the rail
- Two-page spread when the canvas is collapsed
- Per-page date stamp and page number, with notebook defaults
- Page settings panel
- Clear view

### Phase 3: get it out
- Full-text search
- PDF export (all pages)
- PNG export (current page, canvas)
- Delete page with confirm
- Keyboard shortcuts for page navigation
- Proper shelf screen
- First-run onboarding

### Later, not now
- Images on text pages, with the text wrapping around them on the rule grid. Feasible: floats placed at the start of a column with a top margin sit at fixed lines regardless of the text, and the text flows around them. Needs the page editor to move from a text area to a plain-text contenteditable, since a text area cannot wrap around anything. See the assessment of 2026-09-17 in the decisions log.
- Cursor alternatives for pages: highlighting the active rule, or only the piece of rule under the next character, instead of a caret. Tried on 2026-09-17, not adopted for now.
- Tag-based links between pages and canvas areas
- Multiple notebooks polish (sorting, covers)
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
- App bar controls are icon buttons with hover tooltips (label plus shortcut). Page navigation sits at the left of the bar; page settings, the notebook menu, preview and the panel toggle at the right.
- "Clear view" is called Preview.
- "Two columns" lives in page settings, with the page's metadata.
- The page has a thin border and rounded corners and no shadow, like the canvas panel.
- Visual and branding refinement is deferred to the end; the control layout is settled when the rail arrives, and the paper look before export.
- The divider snaps to 10mm steps and defaults to the midpoint of the writable area. The margin line offset is a notebook default, adjustable per page.
- The caret is drawn by the shell, centred between rules, because a native text caret spans the whole line box and straddles the rule. Known issue: in the user's Chrome the caret still appears to cross the rule below it, while the built-in browser shows it centred; to be investigated in that Chrome directly.
- The left rail sits under the app bar, to the left of the desk, with its first square aligned to the top of the page. The list scrolls on its own and keeps the open page's square in view; the hover label (and later the hover preview) floats beside the rail rather than inside the scrolling list, so it is never clipped.
- Images on text pages (assessed 2026-09-17, not scheduled): possible with fixed-position floats now that the editor is a contenteditable. The editor switch was done on 2026-09-17.
