import { useState } from "react";
import type { BookDocument, LanguageCode } from "../core/types";
import { parserForFileName } from "../core/books";
import { Reader } from "../reader/Reader";
import { useTheme } from "./ThemeContext";
import { DictionaryPage } from "./DictionaryPage";

interface LibraryBook {
  id: string;
  title: string;
  language: string;
  chapters: number;
  doc: BookDocument;
}

type View = "library" | "reader" | "dictionary";

export function App() {
  const { theme, toggleTheme } = useTheme();
  const [books, setBooks] = useState<LibraryBook[]>([]);
  const [active, setActive] = useState<LibraryBook | null>(null);
  const [view, setView] = useState<View>("library");
  const [dictInitial, setDictInitial] = useState<{ language: LanguageCode; word?: string }>();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleFile = async (file: File) => {
    setError(null);
    setBusy(true);
    try {
      const parser = await parserForFileName(file.name);
      if (!parser) {
        throw new Error(`Unsupported file: ${file.name}`);
      }
      const doc = await parser.parse(file, file.name);
      const book: LibraryBook = {
        id: doc.id,
        title: doc.title,
        language: doc.language.toUpperCase(),
        chapters: doc.chapters.length,
        doc,
      };
      setBooks((prev) => [...prev, book]);
      setActive(book);
      setView("reader");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const openDictionary = (language: LanguageCode, word?: string) => {
    setDictInitial({ language, word });
    setView("dictionary");
  };

  return (
    <div className="flex h-full flex-col bg-gray-50 text-gray-900 dark:bg-gray-900 dark:text-gray-100">
      <header className="flex items-center gap-3 border-b border-gray-200 px-4 py-2 dark:border-gray-700">
        <button
          type="button"
          onClick={() => {
            setView("library");
            setActive(null);
          }}
          className="text-lg font-bold hover:text-gray-600 dark:hover:text-gray-300"
        >
          Smart Reader
        </button>
        <span className="text-xs text-gray-500 dark:text-gray-400">Alpha</span>
        <button
          type="button"
          onClick={() => openDictionary("ja")}
          className="ml-auto rounded border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-700"
        >
          Dictionary
        </button>
        <label className="cursor-pointer rounded border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-700">
          Import book…
          <input
            type="file"
            accept=".epub,.txt,.md,.pdf"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleFile(file);
              e.target.value = "";
            }}
          />
        </label>
        <button
          type="button"
          onClick={toggleTheme}
          className="rounded border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-700"
          aria-label="Toggle theme"
        >
          {theme === "dark" ? "☀️" : "🌙"}
        </button>
      </header>

      {error && (
        <div className="mx-4 mt-3 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/40 dark:text-red-200">
          {error}
        </div>
      )}

      {busy && (
        <div className="mx-4 mt-3 text-sm text-gray-500 dark:text-gray-400">Importing…</div>
      )}

      {view === "reader" && active ? (
        <div className="min-h-0 flex-1">
          <Reader
            book={active.doc}
            onClose={() => {
              setActive(null);
              setView("library");
            }}
            onOpenDictionary={openDictionary}
          />
        </div>
      ) : view === "dictionary" ? (
        <div className="min-h-0 flex-1">
          <DictionaryPage
            onBack={() => setView(active ? "reader" : "library")}
            initial={dictInitial}
          />
        </div>
      ) : (
        <main className="flex-1 overflow-y-auto p-4">
          {books.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-gray-400">
              <p className="text-lg">No books yet</p>
              <p className="text-sm">Import an EPUB, PDF, TXT, or MD file to start reading.</p>
            </div>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {books.map((book) => (
                <li key={book.id}>
                  <button
                    type="button"
                    onClick={() => setActive(book)}
                    className="w-full rounded-lg border border-gray-200 bg-white p-4 text-left shadow-sm hover:shadow dark:border-gray-700 dark:bg-gray-800"
                  >
                    <div className="font-semibold">{book.title}</div>
                    <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      {book.language} · {book.chapters} chapters
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </main>
      )}
    </div>
  );
}
