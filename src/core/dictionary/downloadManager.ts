import type { DictionaryEntry, LanguageCode } from "../types";
import { consumeNdJsonStream } from "./ndjson";
import type { PackInfo } from "./pack";
import { DICTIONARY_PACKS, packUrl } from "./packs";
import { getDictionaryStore } from "./persistentStore";

export interface DownloadProgress {
  received: number;
  total?: number;
  count: number;
  phase: "download" | "write";
}

interface DownloadManagerState {
  infos: Partial<Record<LanguageCode, PackInfo>>;
  progress: Partial<Record<LanguageCode, DownloadProgress>>;
  errors: Partial<Record<LanguageCode, string>>;
}

type Listener = (state: DownloadManagerState) => void;

const BATCH_SIZE = 500;
const PROGRESS_INTERVAL_MS = 200;

/**
 * Module-level singleton that owns dictionary pack download/import/delete state.
 * Living outside the React tree means downloads keep running and progress is
 * preserved while the user navigates between pages.
 */
class DownloadManager {
  private state: DownloadManagerState = { infos: {}, progress: {}, errors: {} };
  private listeners = new Set<Listener>();
  private controllers = new Map<LanguageCode, AbortController>();
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
    const infos: Partial<Record<LanguageCode, PackInfo>> = {};
    for (const lang of languages) {
      const store = getDictionaryStore(lang);
      infos[lang] = await store.packInfo();
    }
    this.state = { ...this.state, infos: { ...this.state.infos, ...infos } };
    this.emit();
  }

  private setProgress(lang: LanguageCode, value: DownloadProgress | undefined) {
    const now = Date.now();
    if (value && now - this.lastProgressUpdate < PROGRESS_INTERVAL_MS) return;
    this.lastProgressUpdate = now;
    this.state = {
      ...this.state,
      progress: { ...this.state.progress, [lang]: value },
    };
    this.emit();
  }

  private setError(lang: LanguageCode, message: string | undefined) {
    this.state = {
      ...this.state,
      errors: { ...this.state.errors, [lang]: message },
    };
    this.emit();
  }

  private setInfo(lang: LanguageCode, info: PackInfo | undefined) {
    this.state = {
      ...this.state,
      infos: { ...this.state.infos, [lang]: info },
    };
    this.emit();
  }

  private async streamIntoStore(
    language: LanguageCode,
    stream: ReadableStream<Uint8Array>,
    total?: number,
  ): Promise<{ count: number; bytes: number }> {
    const store = getDictionaryStore(language);
    let pending: DictionaryEntry[] = [];
    let written = 0;
    let received = 0;

    const flush = async () => {
      if (pending.length === 0) return;
      const batch = pending;
      pending = [];
      await store.bulkPut(batch);
      written += batch.length;
      this.setProgress(language, { received, total, count: written, phase: "write" });
    };

    const result = await consumeNdJsonStream(stream, {
      onProgress: (bytes) => {
        received = bytes;
        this.setProgress(language, {
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
    return { count: result.count, bytes: result.bytes };
  }

  async download(language: LanguageCode): Promise<void> {
    const def = DICTIONARY_PACKS[language];
    if (!def) return;
    const store = getDictionaryStore(language);
    const controller = new AbortController();
    this.controllers.set(language, controller);
    this.setProgress(language, { received: 0, count: 0, phase: "download" });
    this.setError(language, undefined);
    try {
      const res = await fetch(packUrl(def), { signal: controller.signal });
      if (!res.ok || !res.body) {
        throw new Error(`Download failed (HTTP ${res.status})`);
      }
      const total = Number(res.headers.get("Content-Length") || 0) || undefined;
      const { count, bytes } = await this.streamIntoStore(language, res.body, total);
      await store.installPack({
        language,
        source: def.source,
        version: def.version,
        count,
        sizeBytes: bytes,
        downloadedAt: Date.now(),
      });
      this.setProgress(language, undefined);
      this.setInfo(language, {
        language,
        source: def.source,
        version: def.version,
        count,
        sizeBytes: bytes,
        downloadedAt: Date.now(),
      });
    } catch (err) {
      this.setProgress(language, undefined);
      if (!controller.signal.aborted) {
        this.setError(language, err instanceof Error ? err.message : String(err));
      }
    } finally {
      this.controllers.delete(language);
    }
  }

  cancel(language: LanguageCode): void {
    this.controllers.get(language)?.abort();
  }

  async remove(language: LanguageCode): Promise<void> {
    const store = getDictionaryStore(language);
    await store.removePack();
    this.setInfo(language, undefined);
    this.setError(language, undefined);
  }

  async importFile(language: LanguageCode, file: File): Promise<void> {
    const store = getDictionaryStore(language);
    this.setProgress(language, { received: 0, count: 0, phase: "download" });
    this.setError(language, undefined);
    try {
      const { count, bytes } = await this.streamIntoStore(language, file.stream());
      await store.installPack({
        language,
        source: file.name,
        version: "local",
        count,
        sizeBytes: bytes,
        downloadedAt: Date.now(),
      });
      this.setProgress(language, undefined);
      this.setInfo(language, {
        language,
        source: file.name,
        version: "local",
        count,
        sizeBytes: bytes,
        downloadedAt: Date.now(),
      });
    } catch (err) {
      this.setProgress(language, undefined);
      this.setError(language, err instanceof Error ? err.message : String(err));
    }
  }
}

/** Shared, module-level manager: survives page navigation. */
export const dictionaryManager = new DownloadManager();