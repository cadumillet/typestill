import { useMemo, useState, type CSSProperties } from "react";
import { PageCanvas } from "./page/PageCanvas";
import {
  DOT_PITCH_MM,
  GRID_PITCH_MM,
  MARGIN_LEFT_MM,
  RULE_PITCH_MM,
  RULE_TOP_MM,
  fitPage,
  mmToCssPx,
  pageGeometry,
  type Paper,
} from "./page/paper";
import { useElementSize } from "./page/useElementSize";

// Phase 0 spike: a single hardcoded page.
const PAGE_SIZE = "A5";
const ORIENTATION = "portrait";

// Space kept free around the page for Excalidraw's floating UI: toolbar on top,
// undo/redo at the bottom, properties panel on the left.
const INSET = { top: 88, right: 48, bottom: 64, left: 48 };

export function App() {
  const [paper, setPaper] = useState<Paper>("lined");
  const geometry = useMemo(() => pageGeometry(PAGE_SIZE, ORIENTATION), []);
  const [deskRef, desk] = useElementSize<HTMLElement>();

  const layout = useMemo(() => {
    if (!desk) return null;
    const inner = {
      width: desk.width - INSET.left - INSET.right,
      height: desk.height - INSET.top - INSET.bottom,
    };
    if (inner.width < 50 || inner.height < 50) return null;
    const fit = fitPage(geometry, inner);
    return {
      ...fit,
      left: Math.round(INSET.left + (inner.width - fit.width) / 2),
      top: Math.round(INSET.top + (inner.height - fit.height) / 2),
    };
  }, [desk, geometry]);

  const pageStyle = layout
    ? ({
        left: layout.left,
        top: layout.top,
        width: layout.width,
        height: layout.height,
        "--rule-pitch": `${mmToCssPx(RULE_PITCH_MM, layout.zoom)}px`,
        "--rule-top": `${mmToCssPx(RULE_TOP_MM, layout.zoom)}px`,
        "--dot-pitch": `${mmToCssPx(DOT_PITCH_MM, layout.zoom)}px`,
        "--grid-pitch": `${mmToCssPx(GRID_PITCH_MM, layout.zoom)}px`,
        "--margin-left": `${mmToCssPx(MARGIN_LEFT_MM, layout.zoom)}px`,
      } as CSSProperties)
    : undefined;

  return (
    <div className="app">
      <header className="app-header">
        <span className="wordmark">typestill</span>
        <span className="meta">
          {PAGE_SIZE} · {ORIENTATION}
        </span>
        <label className="paper-picker">
          Paper
          <select value={paper} onChange={(event) => setPaper(event.target.value as Paper)}>
            <option value="blank">Blank</option>
            <option value="lined">Lined</option>
            <option value="dotted">Dotted</option>
            <option value="grid">Grid</option>
          </select>
        </label>
      </header>
      <main className="desk" ref={deskRef}>
        {layout && (
          <>
            <div className={`page paper-${paper}`} style={pageStyle} aria-hidden="true" />
            <PageCanvas
              zoom={layout.zoom}
              box={{ x: layout.left, y: layout.top, width: layout.width, height: layout.height }}
            />
          </>
        )}
      </main>
    </div>
  );
}
