// The document reader runs in the browser, and everything it needs is served by
// this site from public/reader: the reader's own scripts (copied from the
// doc-reader repository) and its libraries in public/reader/vendor (Tesseract
// 5.1.1 with its worker, core and Arabic and English data, and pdf.js 3.11.174).
// Nothing is fetched from another site, so a change to the reader reaches the
// platform only through a reviewed commit here. Scripts load once, on first use.
const READER = "/reader/";
const VENDOR = READER + "vendor/";
// Bump when the files in public/reader change, so browsers fetch the new copy.
const READER_VERSION = "620cd5e-1";
const LIBS = [VENDOR + "tesseract.min.js", VENDOR + "pdf.min.js"];
const PARTS = ["digit-templates.js", "digits.js", "image.js", "fields.js", "ocr.js", "api.js"];

export type ReadField = { key: string; label: string; value: string; state: "ok" | "check" | "missing" };
export type ReadResult = { type: string; label: string; fields: ReadField[] };
type Reader = {
  version: number;
  read: (file: File, opts?: { type?: string; onProgress?: (msg: string) => void }) => Promise<ReadResult>;
  learn: (corrections: Record<string, string>) => number;
  types: () => { key: string; label: string }[];
};

const script = (src: string) => new Promise<void>((resolve, reject) => {
  const s = document.createElement("script");
  s.src = src; s.async = false;
  s.onload = () => resolve(); s.onerror = () => reject(new Error("reader_load"));
  document.head.appendChild(s);
});

let loading: Promise<Reader> | null = null;
export function loadReader(): Promise<Reader> {
  const w = window as any;
  if (w.DocReader) return Promise.resolve(w.DocReader);
  loading ||= (async () => {
    // The engine's worker starts from a blob, so its paths must be absolute.
    w.DocReaderBase = window.location.origin + VENDOR;
    for (const src of LIBS) await script(`${src}?v=${READER_VERSION}`);
    w.pdfjsLib.GlobalWorkerOptions.workerSrc = `${VENDOR}pdf.worker.min.js?v=${READER_VERSION}`;
    for (const p of PARTS) await script(`${READER}${p}?v=${READER_VERSION}`);
    if (!w.DocReader) throw new Error("reader_load");
    return w.DocReader as Reader;
  })().catch((e) => { loading = null; throw e; });
  return loading;
}

// A read date ("2027/03/08", "8/3/2027", Arabic or Latin digits) as yyyy-mm-dd, or null.
export function toIsoDate(text: string): string | null {
  const t = String(text || "").replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
  let m = t.match(/(\d{4})\s*[\/\-.]\s*(\d{1,2})\s*[\/\-.]\s*(\d{1,2})/);
  let y: number, mo: number, d: number;
  if (m) { y = +m[1]; mo = +m[2]; d = +m[3]; }
  else if ((m = t.match(/(\d{1,2})\s*[\/\-.]\s*(\d{1,2})\s*[\/\-.]\s*(\d{4})/))) { d = +m[1]; mo = +m[2]; y = +m[3]; }
  else return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d || y < 1990 || y > 2100) return null;
  return dt.toISOString().slice(0, 10);
}
