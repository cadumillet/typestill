// The stored form of a column's content: ProseMirror's JSON for the page editor's schema
// (see editor/schema.ts). Paragraphs carry an alignment; text carries bold, italic and
// colour marks; a hard break is a line break inside a paragraph. These helpers work on
// the JSON alone so the store, the backup converter and their tests need no editor.

export type Alignment = "left" | "center" | "right";
export const ALIGNMENTS: readonly Alignment[] = ["left", "center", "right"];

export type MarkJson = { type: "bold" | "italic" } | { type: "color"; attrs: { color: string } };

export interface TextJson {
  type: "text";
  text: string;
  marks?: MarkJson[];
}

export interface HardBreakJson {
  type: "hard_break";
  marks?: MarkJson[];
}

export type InlineJson = TextJson | HardBreakJson;

export interface ParagraphJson {
  type: "paragraph";
  attrs: { align: Alignment };
  content?: InlineJson[];
}

export interface EditorDocument {
  type: "doc";
  content: ParagraphJson[];
}

/** A column: the document, plus its plain text for search and capacity checks. */
export interface Column {
  text: string;
  doc: EditorDocument;
}

export function paragraph(text = "", align: Alignment = "left"): ParagraphJson {
  const node: ParagraphJson = { type: "paragraph", attrs: { align } };
  if (text) node.content = [{ type: "text", text }];
  return node;
}

export function emptyDocument(): EditorDocument {
  return { type: "doc", content: [paragraph()] };
}

/**
 * One paragraph per line. Before formatting, Enter inserted a line break, so each line
 * break of a plain-text column is a paragraph boundary.
 */
export function documentFromText(text: string): EditorDocument {
  return { type: "doc", content: text.split("\n").map((line) => paragraph(line)) };
}

/** The document's plain text: paragraphs and hard breaks become line breaks. */
export function textFromDocument(doc: EditorDocument): string {
  return doc.content
    .map((node) =>
      (node.content ?? []).map((inline) => (inline.type === "text" ? inline.text : "\n")).join(""),
    )
    .join("\n");
}

export function columnFromText(text: string): Column {
  return { text, doc: documentFromText(text) };
}

export function columnFromDocument(doc: EditorDocument): Column {
  return { text: textFromDocument(doc), doc };
}

export function isBlankDocument(doc: EditorDocument): boolean {
  return doc.content.length === 1 && !doc.content[0].content?.length;
}

/** The paragraphs of both documents, one after the other. A blank document adds nothing. */
export function joinDocuments(first: EditorDocument, second: EditorDocument): EditorDocument {
  if (isBlankDocument(first)) return second;
  if (isBlankDocument(second)) return first;
  return { type: "doc", content: [...first.content, ...second.content] };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function isMark(value: unknown): value is MarkJson {
  if (!isRecord(value)) return false;
  if (value.type === "bold" || value.type === "italic") return true;
  return value.type === "color" && isRecord(value.attrs) && typeof value.attrs.color === "string";
}

function isInline(value: unknown): value is InlineJson {
  if (!isRecord(value)) return false;
  if (value.marks !== undefined && !(Array.isArray(value.marks) && value.marks.every(isMark))) {
    return false;
  }
  if (value.type === "hard_break") return true;
  return value.type === "text" && typeof value.text === "string";
}

function isParagraph(value: unknown): value is ParagraphJson {
  return (
    isRecord(value) &&
    value.type === "paragraph" &&
    isRecord(value.attrs) &&
    ALIGNMENTS.includes(value.attrs.align as Alignment) &&
    (value.content === undefined || (Array.isArray(value.content) && value.content.every(isInline)))
  );
}

/** Whether a value is a document the editor can load: the shape above, one paragraph at least. */
export function isEditorDocument(value: unknown): value is EditorDocument {
  return (
    isRecord(value) &&
    value.type === "doc" &&
    Array.isArray(value.content) &&
    value.content.length > 0 &&
    value.content.every(isParagraph)
  );
}

export function isColumn(value: unknown): value is Column {
  return isRecord(value) && typeof value.text === "string" && isEditorDocument(value.doc);
}
