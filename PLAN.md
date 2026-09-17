# typestill

A common place notebook built on top of Excalidraw.

The idea: keep everything Excalidraw already does for in-canvas editing, but deliver it in the shape of a real notebook. Fixed-size pages, one after the other, in one file. You fill a page, you jump to the next one. No infinite canvas, no productivity-app machinery.

Status: Phase 0 spike in progress.

---

## 1. Product principles

- It should feel like a Moleskine, not like a productivity app.
- Pages are appended in creation order. Never reordered.
- Pages have no title. They have a date, an optional tag, and content.
- The app is not opinionated about organization. Tags and filters are the only structure.
- Everything drawn on a page is plain Excalidraw. We only build the shell around it.

## 2. Product spec

### Notebooks
- Multiple notebooks. Each one is a separate file / storage record with its own backup.
- A simple shelf screen on launch (name, page count, last opened). Notebooks are created, renamed and deleted only from the shelf.
- Inside a notebook there is a switcher in the header.

### Pages
- Page size is set per notebook: A5, A4 or Letter.
- Orientation is set per notebook: portrait or landscape.
- Paper type is set per page: blank, lined or dotted. A new page inherits the paper of the page you were on.
- Strict fit-to-screen. The canvas is the page. No pan, no zoom.
- In portrait mode the user can toggle between single page and two-page spread.
- Pages can be deleted (with a confirm). Remaining pages are renumbered, since the number is just the position in the notebook.
- Optional date stamp in the top right corner, formatted like "September 16, 2026".
- Optional page number at the bottom center.
- Date stamp and page number are per-page toggles, with a notebook-level default for new pages. They are rendered by the shell as overlays, not as Excalidraw elements, so they can't be selected or erased, and they are composited into exports.

### Tags
- One tag per page, or none.
- Tags have a name and a color, defined at notebook level.
- The tag color is what colors the page's square in the left rail. Untagged pages are neutral gray.

### Left rail (page navigator)
- A vertical stack of small squares, one per page, in notebook order. Think GitHub contribution squares.
- Hovering a square shows a minified preview of the page.
- Clicking jumps to the page.
- The rail can be filtered by tag. Filtering only hides squares; page order and numbering stay the same. Deleting from a filtered view deletes from the real notebook.

### Editing
- Stripped-down Excalidraw toolbar: pen, text, a few shapes, arrow, eraser, image paste.
- Copy and paste works across pages (both are Excalidraw).
- No linking between pages, no complex references.

### Search
- Full-text search across all pages of the current notebook. Results jump to the page.

### Storage
- Browser storage (IndexedDB), autosave on every change.
- Download the notebook as a backup file. Open a backup file to restore.

### Export
- PDF of the whole notebook.
- PNG of the current page.

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
  pageSize: "A5" | "A4" | "Letter"
  orientation: "portrait" | "landscape"
  defaults: {
    paper: "blank" | "lined" | "dotted"
    showDate: boolean
    showPageNumber: boolean
  }
  tags: [{ id: string, name: string, color: string }]
  pages: [Page]
  files: { [fileId]: BinaryFileData }   // images, shared across pages
}

Page {
  id: string
  createdAt: number
  tagId: string | null
  paper: "blank" | "lined" | "dotted"
  showDate: boolean
  showPageNumber: boolean
  elements: ExcalidrawElement[]        // untouched Excalidraw data
  appState: Partial<AppState>          // only the subset worth keeping
}
```

Notes:
- Every page's `elements` is valid Excalidraw data. Any page can be exported as a normal `.excalidraw` file at any time.
- Keeping element IDs and the Excalidraw shape means future sync/collab can reuse Excalidraw's own reconciliation instead of a custom one.
- Backup file = this object as JSON, images base64 inside.
- Page thumbnails are cached separately in IndexedDB and are not part of the file.

## 4. Tech stack

- React + TypeScript + Vite
- `@excalidraw/excalidraw` (MIT) as the editor, embedded, not forked
- Dexie for IndexedDB
- Excalidraw's `exportToBlob` / `exportToCanvas` for thumbnails and PNG export
- pdf-lib to assemble page PNGs into a PDF
- No backend in v1

## 5. How the tricky parts get solved

**Fit-to-screen page.** Excalidraw fills the whole desk area, not a page-sized container: below roughly 730px of container width it switches to its mobile layout, and an A5 page on a laptop screen is narrower than that. The page is a rectangle inside the editor. Compute the zoom from the page box width vs page width in paper units, pin `scrollX` and `scrollY` so scene (0,0) lands on the page box, and reset all three in `onScrollChange` when they drift. UI options cannot disable wheel zoom or hide toolbar tools: wheel, space-drag, middle-drag and zoom shortcuts are swallowed by a capture-phase listener on the wrapper, and unwanted tools are hidden with CSS. Hiding the image tool through UI options breaks image paste, so only its button is hidden.

**Lined / dotted paper.** A CSS pattern layer under the canvas, with Excalidraw's `viewBackgroundColor` set to transparent. Works because the canvas never moves. No Excalidraw internals touched.

**Two-page spread.** Two Excalidraw instances side by side, each with `handleKeyboardGlobally: false`, so shortcuts go to the focused page.

**Thumbnails.** Debounced `exportToCanvas` at roughly 120px wide after each change, stored in IndexedDB keyed by page id.

**Date stamp and page number.** HTML overlays positioned over the page container. For exports, render the page to a canvas and draw the overlays on top before saving.

**Search.** Walk every page's text elements (they carry a `.text` field). Fast enough for thousands of pages without an index.

**PDF.** Render each page to PNG at 2x and place it on a PDF page of the matching physical size (A5 148x210mm, A4 210x297mm, Letter 8.5x11in), respecting orientation.

**Multiple notebooks.** Each notebook is one IndexedDB record. The shelf reads only metadata. A notebook is loaded fully when opened.

## 6. Phases

### Phase 0: spike (2 to 3 days)
Goal: answer "does the constrained canvas feel like paper?" before building anything else.
- One page, A5 portrait, hardcoded
- Fit-to-screen clamping
- Stripped toolbar
- Lined paper via CSS layer
- No storage, no rail

If it feels fighty, adjust here first.

### Phase 1: MVP (start using it daily)
- Multiple pages: next / prev / new page
- Left rail with squares (no tags yet, no thumbnails yet)
- IndexedDB autosave
- Download backup / open backup
- Notebook settings: page size, orientation
- Bare notebook switcher (create / open) so the app is never single-notebook by design

### Phase 2: notebook feel
- Tags: create, assign, color; rail coloring and filtering
- Hover thumbnails in the rail
- Two-page spread toggle (portrait only)
- Per-page paper: blank / lined / dotted
- Per-page date stamp and page number, with notebook defaults
- Page settings panel
- Image paste

### Phase 3: get it out
- Full-text search
- PDF export (whole notebook)
- PNG export (current page)
- Delete page with confirm
- Keyboard shortcuts for page navigation
- Proper shelf screen
- First-run onboarding

### Later, not now
- Multiple notebooks polish (sorting, covers)
- Sync
- Collaboration
- Mobile / tablet

## 7. Decisions log

- No fork of Excalidraw. Embed the npm package and control it from outside.
- Pages never reorder. Date order is the only order.
- One tag per page.
- Page size and orientation are notebook-level. Paper type is page-level.
- Date stamp and page number are overlays, not canvas elements.
- Strict fit-to-screen for v1. Zoom inside a page can be reconsidered later.
- Drawing outside the page is clipped, not blocked. The editor is larger than the page, so strokes can spill onto the desk; they are hidden there and stay out of exports.
- Browser storage first, backups as downloadable files. No accounts, no backend.
