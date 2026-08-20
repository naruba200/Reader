import { useEffect, useMemo, useState } from "react";
import type { LanguageCode } from "../types";
import { dictionaryManager } from "./downloadManager";
import type { DownloadProgress, PackKey } from "./downloadManager";
import type { PackInfo } from "./pack";
import type { PackDefinition } from "./packs";

export type { DownloadProgress };

export interface DictionaryManager {
  infos: Partial<Record<PackKey, PackInfo>>;
  progress: Partial<Record<PackKey, DownloadProgress>>;
  errors: Partial<Record<PackKey, string>>;
  download: (def: PackDefinition) => Promise<void>;
  cancel: (key: PackKey) => void;
  remove: (def: PackDefinition) => Promise<void>;
  importFile: (language: LanguageCode, file: File) => Promise<void>;
  refresh: () => Promise<void>;
}

/**
 * Thin React binding over the module-level {@link dictionaryManager} singleton.
 * Downloads keep running and progress is preserved even while this hook is not
 * mounted (i.e. the user left the Dictionary page).
 */
export function useDictionaryManager(
  languages: readonly LanguageCode[],
): DictionaryManager {
  const [state, setState] = useState(() => dictionaryManager.getState());
  const languagesKey = languages.join(",");

  useEffect(() => {
    const unsubscribe = dictionaryManager.subscribe(setState);
    void dictionaryManager.refresh(languages);
    return unsubscribe;
    // languages is a stable module-level constant; keyed by its joined value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [languagesKey]);

  return useMemo(
    () => ({
      infos: state.infos,
      progress: state.progress,
      errors: state.errors,
      download: (def) => dictionaryManager.download(def),
      cancel: (key) => dictionaryManager.cancel(key),
      remove: (def) => dictionaryManager.remove(def),
      importFile: (language, file) => dictionaryManager.importFile(language, file),
      refresh: () => dictionaryManager.refresh(languages),
    }),
    [state, languagesKey, languages],
  );
}