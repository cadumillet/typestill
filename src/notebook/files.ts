// Browser file helpers for backups and exports.

/** Offers `text` as a file download named `name`. */
export function downloadText(name: string, text: string, type = "application/json"): void {
  downloadBlob(name, new Blob([text], { type }));
}

/** Offers a blob as a file download named `name`. */
export function downloadBlob(name: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
