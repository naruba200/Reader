import type { DictionaryEntry, LanguageCode } from "../types";
import { consumeNdJsonStream } from "./ndjson";
import type { PackInfo } from "./pack";
import { DICTIONARY_PACKS, packUrl, type PackDefinition } from "./packs";
import { getDictionaryStore } from "./persistentStore";
import { loadWifiOnly } from "./downloadSettings";

export interface DownloadProgress {
  received: number;
  total?: number;
  count: number;
  phase: "download" | "write";
}

/** Key identifying a specific pack: "ja:JMDict", "en:WordNet", etc. */
export type PackKey = string;

/** A download the user paused: byte offset (+ optional total) for resume. */
export interface PausedDownload {
  offset: number;
  total?: number;
}

interface DownloadManagerState {
  infos: Partial<Record<PackKey, PackInfo>>;
  progress: Partial<Record<PackKey, DownloadProgress>>;
  errors: Partial<Record<PackKey, string>>;
  paused: Partial<Record<PackKey, PausedDownload>>;
}

type Listener = (state: DownloadManagerState) => void;

const BATCH_SIZE = 500;
const PROGRESS_INTERVAL_MS = 200;

/** localStorage keys for resume offsets (survive reloads). */
const OFFSET_KEY_PREFIX = "smart-reader-dl-offset:";
const TOTAL_KEY_PREFIX = "smart-reader-dl-total:";

/** Create a stable key for a pack definition. */
export function packKey(def: PackDefinition): PackKey {
  return `${def.language}:${def.source}`;
}

/**
 * Drop the partial NDJSON line at the start of a resumed (Range) stream:
 * the bytes before the first "\n" are the tail of a line whose head was
 * already received before the pause, so they must not be parsed again.
 */
function dropPartialFirstLine(
  stream: ReadableStream<Uint8Array>,
): ReadableStream<Uint8Array> {
  let dropped = false;
  let carry: Uint8Array = new Uint8Array(0);
  const concat = (a: Uint8Array, b: Uint8Array): Uint8Array => {
    const out = new Uint8Array(a.length + b.length);
    out.set(a, 0);
    out.set(b, a.length);
    return out;
  };
  return stream.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        if (dropped) {
          controller.enqueue(chunk);
          return;
        }
        const buf = carry.length > 0 ? concat(carry, chunk) : chunk;
        const idx = buf.indexOf(10); // "\n"
        if (idx === -1) {
          carry = buf;
          return;
        }
        dropped = true;
        carry = new Uint8Array(0);
        if (idx + 1 < buf.length) controller.enqueue(buf.slice(idx + 1));
      },
    }),
  );
}

/**
 * Module-level singleton that owns dictionary pack download/import/delete state.
 * Living outside the React tree means downloads keep running and progress is
 * preserved while the user navigates between pages.
 */
class DownloadManager {
  private state: DownloadManagerState = { infos: {}, progress: {}, errors: {}, paused: {} };
  private listeners = new Set<Listener>();
  private controllers = new Map<PackKey, AbortController>();
  /** Unthrottled received-byte counts per in-flight download (for pause). */
  private receivedBytes = new Map<PackKey, number>();
  private lastProgressUpdate = 0;

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getState(): DownloadManagerState {
    return this.state;
  }

  private emit() {
    for (const listener of this.listeners) listener(this.state);
  }

  async refresh(languages: readonly LanguageCode[]): Promise<void> {
    const infos: Partial<Record<PackKey, PackInfo>> = {};
    const paused: Partial<Record<PackKey, PausedDownload>> = { ...this.state.paused };
    for (const lang of languages) {
      const packs = DICTIONARY_PACKS[lang] ?? [];
      for (const def of packs) {
        const key = packKey(def);
        try {
          const store = getDictionaryStore(lang);
          const info = await store.packInfo(def.source);
          if (info) infos[key] = info;
        } catch (err) {
          console.warn(`Failed to check pack status for ${key}`, err);
        }
        // Rehydrate paused downloads whose offsets survived a reload.
        if (!infos[key] && !paused[key]) {
          const offset = this.getPersistedOffset(key);
          if (offset > 0) {
            paused[key] = { offset, total: this.getPersistedTotal(key) };
          }
        }
      }
    }
    this.state = { ...this.state, infos: { ...this.state.infos, ...infos }, paused };
    this.emit();
  }

  private setProgress(key: PackKey, _lang: LanguageCode, value: DownloadProgress | undefined) {
    const now = Date.now();
    if (value && now - this.lastProgressUpdate < PROGRESS_INTERVAL_MS) return;
    this.lastProgressUpdate = now;
    this.state = {
      ...this.state,
      progress: { ...this.state.progress, [key]: value },
    };
    this.emit();
  }

  private setError(key: PackKey, message: string | undefined) {
    this.state = {
      ...this.state,
      errors: { ...this.state.errors, [key]: message },
    };
    this.emit();
  }

  private setInfo(key: PackKey, info: PackInfo | undefined) {
    this.state = {
      ...this.state,
      infos: { ...this.state.infos, [key]: info },
    };
    this.emit();
  }

  private setPaused(key: PackKey, value: PausedDownload | undefined) {
    this.state = {
      ...this.state,
      paused: { ...this.state.paused, [key]: value },
    };
    this.emit();
  }

  // ----- pause/resume persistence -----

  private getPersistedOffset(key: PackKey): number {
    try {
      const raw = localStorage.getItem(OFFSET_KEY_PREFIX + key);
      const n = raw ? Number(raw) : 0;
      return Number.isFinite(n) && n > 0 ? n : 0;
    } catch {
      return 0;
    }
  }

  private getPersistedTotal(key: PackKey): number | undefined {
    try {
      const raw = localStorage.getItem(TOTAL_KEY_PREFIX + key);
      const n = raw ? Number(raw) : 0;
      return Number.isFinite(n) && n > 0 ? n : undefined;
    } catch {
      return undefined;
    }
  }

  private persistOffset(key: PackKey, offset: number): void {
    try {
      if (offset > 0) {
        localStorage.setItem(OFFSET_KEY_PREFIX + key, String(offset));
      } else {
        localStorage.removeItem(OFFSET_KEY_PREFIX + key);
      }
    } catch {
      /* storage unavailable */
    }
  }

  private persistTotal(key: PackKey, total: number | undefined): void {
    try {
      if (total !== undefined && total > 0) {
        localStorage.setItem(TOTAL_KEY_PREFIX + key, String(total));
      } else {
        localStorage.removeItem(TOTAL_KEY_PREFIX + key);
      }
    } catch {
      /* storage unavailable */
    }
  }

  private clearPausedState(key: PackKey): void {
    this.persistOffset(key, 0);
    this.persistTotal(key, undefined);
    this.setPaused(key, undefined);
  }

  // ----- Wi-Fi-only gating -----

  /**
   * Enforce the Wi-Fi-only preference before starting a download.
   * Returns true when the download may proceed. Uses the Network Information
   * API when available; WebViews without it fall through (graceful degradation).
   */
  private checkWifiAllowed(key: PackKey): boolean {
    if (!loadWifiOnly()) return true;
    const conn = (
      navigator as unknown as { connection?: { type?: string } }
    ).connection;
    if (conn?.type === "cellular") {
      this.setError(key, "Wi-Fi only is enabled");
      return false;
    }
    if (conn?.type === "none") {
      this.setError(key, "No connection");
      return false;
    }
    return true;
  }

  private async streamIntoStore(
    language: LanguageCode,
    source: string,
    stream: ReadableStream<Uint8Array>,
    key: PackKey,
    total?: number,
    initialReceived = 0,
  ): Promise<{ count: number; bytes: number }> {
    const store = getDictionaryStore(language);
    let pending: DictionaryEntry[] = [];
    let written = 0;
    let received = initialReceived;

    const flush = async () => {
      if (pending.length === 0) return;
      const batch = pending;
      pending = [];
      await store.bulkPut(batch, source);
      written += batch.length;
      this.setProgress(key, language, { received, total, count: written, phase: "write" });
    };

    try {
      const result = await consumeNdJsonStream(stream, {
        onProgress: (bytes) => {
          received = initialReceived + bytes;
          this.receivedBytes.set(key, received);
          this.setProgress(key, language, {
            received,
            total,
            count: written,
            phase: written > 0 ? "write" : "download",
          });
        },
        onEntry: async (entry) => {
          pending.push(entry);
          if (pending.length >= BATCH_SIZE) await flush();
        },
      });
      await flush();
      return { count: result.count, bytes: initialReceived + result.bytes };
    } finally {
      // On abort (pause/cancel), persist whatever complete entries were
      // received so a later resume does not lose them.
      await flush().catch(() => {});
    }
  }

  /**
   * Shared download body for download() (offset 0) and resume() (offset > 0).
   * With a byte offset, a `Range` request is attempted; if the server answers
   * 206 the stream continues exactly where it stopped, otherwise the pack's
   * partial entries are discarded and a full fresh download starts.
   */
  private async runDownload(def: PackDefinition, offset: number): Promise<void> {
    const key = packKey(def);
    const store = getDictionaryStore(def.language);
    const controller = new AbortController();
    this.controllers.set(key, controller);
    this.receivedBytes.set(key, offset);
    this.setProgress(key, def.language, {
      received: offset,
      total: this.state.paused[key]?.total,
      count: 0,
      phase: "download",
    });
    this.setError(key, undefined);
    try {
      const res = await fetch(packUrl(def), {
        signal: controller.signal,
        headers: offset > 0 ? { Range: `bytes=${offset}-` } : undefined,
      });
      if (!res.ok || !res.body) {
        throw new Error(`Download failed (HTTP ${res.status})`);
      }
      let body: ReadableStream<Uint8Array> = res.body;
      let startOffset = offset;
      let total = Number(res.headers.get("Content-Length") || 0) || undefined;
      if (offset > 0 && res.status === 206) {
        body = dropPartialFirstLine(body);
        if (total !== undefined) total += offset;
      } else if (offset > 0) {
        // Server lacks Range support: discard partial entries, start fresh.
        await store.removePack(def.source);
        this.persistOffset(key, 0);
        this.persistTotal(key, undefined);
        startOffset = 0;
      }
      const { count, bytes } = await this.streamIntoStore(
        def.language,
        def.source,
        body,
        key,
        total,
        startOffset,
      );
      await store.installPack({
        language: def.language,
        source: def.source,
        version: def.version,
        count,
        sizeBytes: bytes,
        downloadedAt: Date.now(),
      });
      this.clearPausedState(key);
      this.setProgress(key, def.language, undefined);
      this.setInfo(key, {
        language: def.language,
        source: def.source,
        version: def.version,
        count,
        sizeBytes: bytes,
        downloadedAt: Date.now(),
      });
    } catch (err) {
      this.setProgress(key, def.language, undefined);
      if (!controller.signal.aborted) {
        this.setError(key, err instanceof Error ? err.message : String(err));
      }
      // Aborted: pause() recorded the resume state, cancel() cleared it.
    } finally {
      this.controllers.delete(key);
      this.receivedBytes.delete(key);
    }
  }

  /** Start (or restart) a full download of a pack. */
  async download(def: PackDefinition): Promise<void> {
    const key = packKey(def);
    if (!this.checkWifiAllowed(key)) return;
    // A fresh download supersedes any paused state for this pack.
    this.clearPausedState(key);
    await this.runDownload(def, 0);
  }

  /**
   * Pause an in-flight download: abort the fetch and persist the received
   * byte count so the download can be resumed later (even after a reload).
   */
  pause(key: PackKey): void {
    const controller = this.controllers.get(key);
    if (!controller) return;
    const received = this.receivedBytes.get(key) ?? this.state.progress[key]?.received ?? 0;
    const total = this.state.progress[key]?.total;
    this.persistOffset(key, received);
    this.persistTotal(key, total);
    this.setPaused(key, { offset: received, total });
    controller.abort();
  }

  /**
   * Resume a paused download. Uses `Range` when the server supports it;
   * otherwise discards the partial pack and downloads it fully from scratch.
   */
  async resume(def: PackDefinition): Promise<void> {
    const key = packKey(def);
    const offset = this.getPersistedOffset(key);
    if (offset <= 0 && !this.state.paused[key]) return;
    if (this.controllers.has(key)) return; // already downloading
    if (!this.checkWifiAllowed(key)) return;
    await this.runDownload(def, offset);
  }

  /** Cancel an in-flight download (or discard a paused one): no resume state kept. */
  cancel(key: PackKey): void {
    this.controllers.get(key)?.abort();
    this.clearPausedState(key);
  }

  async remove(def: PackDefinition): Promise<void> {
    const key = packKey(def);
    const store = getDictionaryStore(def.language);
    await store.removePack(def.source);
    this.clearPausedState(key);
    this.setInfo(key, undefined);
    this.setError(key, undefined);
  }

  async importFile(language: LanguageCode, file: File): Promise<void> {
    const key = `import:${language}:${file.name}`;
    const store = getDictionaryStore(language);
    this.setProgress(key, language, { received: 0, count: 0, phase: "download" });
    this.setError(key, undefined);
    try {
      const { count, bytes } = await this.streamIntoStore(
        language,
        file.name,
        file.stream(),
        key,
        undefined,
        0, // imports never resume
      );
      await store.installPack({
        language,
        source: file.name,
        version: "local",
        count,
        sizeBytes: bytes,
        downloadedAt: Date.now(),
      });
      this.setProgress(key, language, undefined);
      this.setInfo(key, {
        language,
        source: file.name,
        version: "local",
        count,
        sizeBytes: bytes,
        downloadedAt: Date.now(),
      });
    } catch (err) {
      this.setProgress(key, language, undefined);
      this.setError(key, err instanceof Error ? err.message : String(err));
    }
  }
}

/** Shared, module-level manager: survives page navigation. */
export const dictionaryManager = new DownloadManager();
