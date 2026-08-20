import type { DictionaryEntry, LanguageCode } from "../types";
import { consumeNdJsonStream } from "./ndjson";
import type { PackInfo } from "./pack";
import { DICTIONARY_PACKS, packUrl, type PackDefinition } from "./packs";
import { getDictionaryStore } from "./persistentStore";

export interface DownloadProgress {
  received: number;
  total?: number;
  count: number;
  phase: "download" | "write";
}

/** Key identifying a specific pack: "ja:JMDict", "en:WordNet", etc. */
export type PackKey = string;

interface DownloadManagerState {
  infos: Partial<Record<PackKey, PackInfo>>;
  progress: Partial<Record<PackKey, DownloadProgress>>;
  errors: Partial<Record<PackKey, string>>;
}

type Listener = (state: DownloadManagerState) => void;

const BATCH_SIZE = 500;
const PROGRESS_INTERVAL_MS = 200;

/** Create a stable key for a pack definition. */
export function packKey(def: PackDefinition): PackKey {
  return `${def.language}:${def.source}`;
}

/**
 * Module-level singleton that owns dictionary pack download/import/delete state.
 * Living outside the React tree means downloads keep running and progress is
 * preserved while the user navigates between pages.
 */
class DownloadManager {
  private state: DownloadManagerState = { infos: {}, progress: {}, errors: {} };
  private listeners = new Set<Listener>();
  private controllers = new Map<PackKey, AbortController>();
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
    for (const lang of languages) {
      const packs = DICTIONARY_PACKS[lang] ?? [];
      for (const def of packs) {
        const key = packKey(def);
        const store = getDictionaryStore(lang);
        infos[key] = await store.packInfo(def.source);
      }
    }
    this.state = { ...this.state, infos: { ...this.state.infos, ...infos } };
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

  private async streamIntoStore(
    language: LanguageCode,
    source: string,
    stream: ReadableStream<Uint8Array>,
    key: PackKey,
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
      await store.bulkPut(batch, source);
      written += batch.length;
      this.setProgress(key, language, { received, total, count: written, phase: "write" });
    };

    const result = await consumeNdJsonStream(stream, {
      onProgress: (bytes) => {
        received = bytes;
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
    return { count: result.count, bytes: result.bytes };
  }

  async download(def: PackDefinition): Promise<void> {
    const key = packKey(def);
    const store = getDictionaryStore(def.language);
    const controller = new AbortController();
    this.controllers.set(key, controller);
    this.setProgress(key, def.language, { received: 0, count: 0, phase: "download" });
    this.setError(key, undefined);
    try {
      const res = await fetch(packUrl(def), { signal: controller.signal });
      if (!res.ok || !res.body) {
        throw new Error(`Download failed (HTTP ${res.status})`);
      }
      const total = Number(res.headers.get("Content-Length") || 0) || undefined;
      const { count, bytes } = await this.streamIntoStore(def.language, def.source, res.body, key, total);
      await store.installPack({
        language: def.language,
        source: def.source,
        version: def.version,
        count,
        sizeBytes: bytes,
        downloadedAt: Date.now(),
      });
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
    } finally {
      this.controllers.delete(key);
    }
  }

  cancel(key: PackKey): void {
    this.controllers.get(key)?.abort();
  }

  async remove(def: PackDefinition): Promise<void> {
    const key = packKey(def);
    const store = getDictionaryStore(def.language);
    await store.removePack(def.source);
    this.setInfo(key, undefined);
    this.setError(key, undefined);
  }

  async importFile(language: LanguageCode, file: File): Promise<void> {
    const key = `import:${language}:${file.name}`;
    const store = getDictionaryStore(language);
    this.setProgress(key, language, { received: 0, count: 0, phase: "download" });
    this.setError(key, undefined);
    try {
      const { count, bytes } = await this.streamIntoStore(language, file.name, file.stream(), key);
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