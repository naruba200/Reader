import { useEffect, useMemo, useState } from "react";
import type { LanguageCode } from "../types";
import { dictionaryManager } from "./downloadManager";
import type { DownloadProgress } from "./downloadManager";
import type { PackInfo } from "./pack";

export type { DownloadProgress };

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
      download: (language) => dictionaryManager.download(language),
      cancel: (language) => dictionaryManager.cancel(language),
      remove: (language) => dictionaryManager.remove(language),
      importFile: (language, file) => dictionaryManager.importFile(language, file),
      refresh: () => dictionaryManager.refresh(languages),
    }),
    [state, languagesKey, languages],
  );
}