import type { ReactNode } from "react";
import "./panel.css";

/** A rounded side panel, like an artifact panel next to a chat. */
export function Panel({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="panel" aria-label={label}>
      {children}
    </section>
  );
}
