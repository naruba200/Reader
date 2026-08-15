import { useCallback, useEffect, useRef, useState } from "react";
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

export interface DictionaryManager {
  infos: Partial<Record<LanguageCode, PackInfo>>;
  progress: Partial<Record<LanguageCode, DownloadProgress>>;
  errors: Partial<Record<LanguageCode, string>>;
  download: (language: LanguageCode) => Promise<void>;
  cancel: (language: LanguageCode) => void;
  remove: (language: LanguageCode) => Promise<void>;
  importFile: (language: LanguageCode, file: File) => Promise<void>;
  refresh: () => Promise<void>;
}

const BATCH_SIZE = 500;
const PROGRESS_INTERVAL_MS = 200;

/**
 * Manages dictionary pack download/import/delete state for the given languages.
 * Packs are streamed as NDJSON and written to IndexedDB in batches so large
 * downloads (tens of MB) stay responsive on mobile.
 */
export function useDictionaryManager(
  languages: readonly LanguageCode[],
): DictionaryManager {
  const [infos, setInfos] = useState<Partial<Record<LanguageCode, PackInfo>>>({});
  const [progress, setProgress] = useState<Partial<Record<LanguageCode, DownloadProgress>>>({});
  const [errors, setErrors] = useState<Partial<Record<LanguageCode, string>>>({});
  const controllers = useRef(new Map<LanguageCode, AbortController>());
  const lastProgressUpdate = useRef(0);

  const refresh = useCallback(async () => {
    const next: Partial<Record<LanguageCode, PackInfo>> = {};
    for (const lang of languages) {
      const store = getDictionaryStore(lang);
      next[lang] = await store.packInfo();
    }
    setInfos((prev) => ({ ...prev, ...next }));
  }, [languages]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const setProgressThrottled = (
    lang: LanguageCode,
    value: DownloadProgress,
  ) => {
    const now = Date.now();
    if (now - lastProgressUpdate.current < PROGRESS_INTERVAL_MS) return;
    lastProgressUpdate.current = now;
    setProgress((p) => ({ ...p, [lang]: value }));
  };

  const streamIntoStore = async (
    language: LanguageCode,
    stream: ReadableStream<Uint8Array>,
    total?: number,
  ): Promise<{ count: number; bytes: number }> => {
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
      setProgressThrottled(language, {
        received,
        total,
        count: written,
        phase: "write",
      });
    };

    const result = await consumeNdJsonStream(stream, {
      onProgress: (bytes) => {
        received = bytes;
        setProgressThrottled(language, {
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
  };

  const download = useCallback(async (language: LanguageCode) => {
    const def = DICTIONARY_PACKS[language];
    if (!def) return;
    const store = getDictionaryStore(language);
    const controller = new AbortController();
    controllers.current.set(language, controller);
    setProgress((p) => ({ ...p, [language]: { received: 0, count: 0, phase: "download" } }));
    setErrors((e) => ({ ...e, [language]: undefined }));
    try {
      const res = await fetch(packUrl(def), { signal: controller.signal });
      if (!res.ok || !res.body) {
        throw new Error(`Download failed (HTTP ${res.status})`);
      }
      const total = Number(res.headers.get("Content-Length") || 0) || undefined;
      const { count, bytes } = await streamIntoStore(language, res.body, total);
      await store.installPack({
        language,
        source: def.source,
        version: def.version,
        count,
        sizeBytes: bytes,
        downloadedAt: Date.now(),
      });
      setProgress((p) => ({ ...p, [language]: undefined }));
      setInfos((i) => ({ ...i, [language]: { language, source: def.source, version: def.version, count, sizeBytes: bytes, downloadedAt: Date.now() } }));
    } catch (err) {
      setProgress((p) => ({ ...p, [language]: undefined }));
      if (!controller.signal.aborted) {
        setErrors((e) => ({
          ...e,
          [language]: err instanceof Error ? err.message : String(err),
        }));
      }
    } finally {
      controllers.current.delete(language);
    }
  }, [languages]);

  const cancel = useCallback((language: LanguageCode) => {
    controllers.current.get(language)?.abort();
  }, []);

  const remove = useCallback(async (language: LanguageCode) => {
    const store = getDictionaryStore(language);
    await store.removePack();
    setInfos((i) => ({ ...i, [language]: undefined }));
    setErrors((e) => ({ ...e, [language]: undefined }));
  }, []);

  const importFile = useCallback(async (language: LanguageCode, file: File) => {
    const store = getDictionaryStore(language);
    setProgress((p) => ({ ...p, [language]: { received: 0, count: 0, phase: "download" } }));
    setErrors((e) => ({ ...e, [language]: undefined }));
    try {
      const { count, bytes } = await streamIntoStore(language, file.stream());
      await store.installPack({
        language,
        source: file.name,
        version: "local",
        count,
        sizeBytes: bytes,
        downloadedAt: Date.now(),
      });
      setProgress((p) => ({ ...p, [language]: undefined }));
      setInfos((i) => ({
        ...i,
        [language]: { language, source: file.name, version: "local", count, sizeBytes: bytes, downloadedAt: Date.now() },
      }));
    } catch (err) {
      setProgress((p) => ({ ...p, [language]: undefined }));
      setErrors((e) => ({
        ...e,
        [language]: err instanceof Error ? err.message : String(err),
      }));
    }
  }, []);

  return { infos, progress, errors, download, cancel, remove, importFile, refresh };
}