/**
 * KanjiVG stroke-order diagrams, lazy-downloaded one kanji at a time and
 * cached in IndexedDB (never bundled — the full set is ~22 MB).
 *
 * URL pattern (verified): the file name is the kanji's codepoint as a
 * 5-digit lowercase hex string, e.g. 日 (U+65E5) → 065e5.svg.
 * Data: KanjiVG, CC BY-SA 3.0 (https://github.com/KanjiVG/kanjivg).
 */

const KANJIVG_BASE =
  "https://raw.githubusercontent.com/KanjiVG/kanjivg/master/kanji";

const DB_NAME = "smart-reader-kanjivg";
const STORE_NAME = "svg";

/** Download URL for a kanji's KanjiVG stroke-order SVG. */
export function kanjivgUrl(char: string): string {
  const cp = char.codePointAt(0);
  if (cp === undefined) throw new Error("kanjivgUrl: empty character");
  return `${KANJIVG_BASE}/${cp.toString(16).padStart(5, "0")}.svg`;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet(key: string): Promise<string | undefined> {
  if (typeof indexedDB === "undefined") return undefined;
  try {
    const db = await openDb();
    try {
      return await new Promise<string | undefined>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readonly");
        const req = tx.objectStore(STORE_NAME).get(key);
        req.onsuccess = () => resolve(req.result as string | undefined);
        req.onerror = () => reject(req.error);
      });
    } finally {
      db.close();
    }
  } catch {
    return undefined;
  }
}

async function idbPut(key: string, value: string): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  try {
    const db = await openDb();
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        tx.objectStore(STORE_NAME).put(value, key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } finally {
      db.close();
    }
  } catch {
    /* cache is best-effort */
  }
}

export type StrokeOrderResult =
  | { status: "ok"; svg: string }
  | { status: "needs-connection" }
  | { status: "not-found" };

/**
 * Fetch a kanji's stroke-order SVG: IndexedDB cache first, then download.
 * Offline with no cached copy reports "needs-connection" (never a broken
 * image); a 404 (KanjiVG lacks some rare characters) reports "not-found".
 */
export async function getStrokeOrderSvg(
  char: string,
): Promise<StrokeOrderResult> {
  const url = kanjivgUrl(char);
  const cached = await idbGet(url);
  if (cached) return { status: "ok", svg: cached };
  let resp: Response;
  try {
    resp = await fetch(url);
  } catch {
    return { status: "needs-connection" };
  }
  if (resp.status === 404) return { status: "not-found" };
  if (!resp.ok) return { status: "needs-connection" };
  const svg = await resp.text();
  await idbPut(url, svg);
  return { status: "ok", svg };
}
