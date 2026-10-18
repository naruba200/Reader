import { useEffect, useState } from "react";
import {
  getLibraryStore,
  type ReadingStatus,
  type StoredBookMeta,
  type UpdateMetaPatch,
} from "../core/library/libraryStore";

const STATUS_OPTIONS: { id: ReadingStatus | "none"; label: string }[] = [
  { id: "none", label: "None" },
  { id: "want", label: "Want to read" },
  { id: "reading", label: "Reading" },
  { id: "finished", label: "Finished" },
];

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function BookSheet({
  book,
  onClose,
  onUpdated,
}: {
  book: StoredBookMeta | null;
  onClose: () => void;
  onUpdated: (meta: StoredBookMeta) => void;
}) {
  const [tagInput, setTagInput] = useState("");
  const [titleInput, setTitleInput] = useState("");
  const [authorInput, setAuthorInput] = useState("");
  const [size, setSize] = useState<string | null>(null);

  useEffect(() => {
    setTagInput("");
    setTitleInput(book?.title ?? "");
    setAuthorInput(book?.author ?? "");
    setSize(null);
    if (!book) return;
    let cancelled = false;
    void (async () => {
      try {
        const doc = await getLibraryStore().loadBook(book.id);
        if (cancelled || !doc) return;
        const bytes = new Blob([JSON.stringify(doc)]).size;
        setSize(formatBytes(bytes));
      } catch {
        if (!cancelled) setSize("—");
      }
    })();
    return () => { cancelled = true; };
  }, [book?.id]);

  if (!book) return null;

  const patch = async (p: UpdateMetaPatch) => {
    const updated = await getLibraryStore().updateMeta(book.id, p);
    if (updated) onUpdated(updated);
  };

  /** Commit title/author edits; cleared fields revert to the stored values. */
  const commitTitleAuthor = () => {
    const t = titleInput.trim();
    const a = authorInput.trim();
    if (!t) setTitleInput(book.title);
    if (!a) setAuthorInput(book.author ?? "");
    const p: UpdateMetaPatch = {};
    if (t && t !== book.title) p.title = t;
    if (a && a !== (book.author ?? "")) p.author = a;
    if (Object.keys(p).length > 0) void patch(p);
  };

  const addTag = () => {
    const t = tagInput.trim();
    if (!t) return;
    const tags = [...(book.tags ?? [])];
    if (!tags.some((x) => x.toLowerCase() === t.toLowerCase())) tags.push(t);
    setTagInput("");
    void patch({ tags });
  };

  const removeTag = (t: string) => {
    void patch({ tags: (book.tags ?? []).filter((x) => x !== t) });
  };

  const toggleStar = (n: number) => {
    void patch({ stars: book.stars === n ? 0 : n });
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center">
      <button
        type="button"
        aria-label="Dismiss"
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={book.title}
        className="sheet-enter relative max-h-[85vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-4 pb-safe dark:bg-gray-800"
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-gray-300 dark:bg-gray-600" />
        <div className="pr-8">
          <label htmlFor="booksheet-title" className="sr-only">
            Book title
          </label>
          <input
            id="booksheet-title"
            type="text"
            value={titleInput}
            onChange={(e) => setTitleInput(e.target.value)}
            onBlur={commitTitleAuthor}
            onKeyDown={(e) => { if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur(); }}
            aria-label="Book title"
            className="w-full rounded-lg border border-transparent bg-transparent px-2 py-0.5 text-base font-semibold text-gray-900 hover:border-gray-300 focus:border-blue-500 focus:bg-white focus:outline-none dark:text-gray-100 dark:hover:border-gray-600 dark:focus:bg-gray-700"
          />
          <label htmlFor="booksheet-author" className="sr-only">
            Book author
          </label>
          <input
            id="booksheet-author"
            type="text"
            value={authorInput}
            onChange={(e) => setAuthorInput(e.target.value)}
            onBlur={commitTitleAuthor}
            onKeyDown={(e) => { if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur(); }}
            aria-label="Book author"
            placeholder="Author"
            className="mt-0.5 w-full rounded-lg border border-transparent bg-transparent px-2 py-0.5 text-sm text-gray-500 placeholder:text-gray-400 hover:border-gray-300 focus:border-blue-500 focus:bg-white focus:outline-none dark:text-gray-400 dark:hover:border-gray-600 dark:focus:bg-gray-700"
          />
        </div>
        <p className="mt-1 text-xs text-gray-400">
          {book.language.toUpperCase()} · {book.chapters} chapters
          {size !== null && ` · ${size}`}
        </p>

        <div className="mt-4">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-200">Status</span>
          <div className="mt-1 grid grid-cols-4 gap-1">
            {STATUS_OPTIONS.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => void patch({ status: s.id })}
                className={`rounded-lg border px-1 py-2 text-xs font-medium ${
                  (book.status ?? "none") === s.id
                    ? "border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/40 dark:text-blue-200"
                    : "border-gray-300 text-gray-600 dark:border-gray-600 dark:text-gray-300"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-200">Rating</span>
          <div className="mt-1 flex gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => toggleStar(n)}
                className="p-1 text-2xl"
                aria-label={`Rate ${n} star${n > 1 ? "s" : ""}`}
              >
                <span className={book.stars && book.stars >= n ? "text-amber-400" : "text-gray-300 dark:text-gray-600"}>
                  ★
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-200">Tags</span>
          <div className="mt-1 flex gap-2">
            <input
              type="text"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") addTag(); }}
              placeholder="Add a tag…"
              className="min-w-0 flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700"
            />
            <button
              type="button"
              onClick={addTag}
              className="shrink-0 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white"
            >
              Add
            </button>
          </div>
          {(book.tags ?? []).length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {book.tags!.map((t) => (
                <span
                  key={t}
                  className="flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 text-xs dark:bg-gray-700"
                >
                  {t}
                  <button
                    type="button"
                    onClick={() => removeTag(t)}
                    className="text-gray-400 hover:text-red-500"
                    aria-label={`Remove tag ${t}`}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={onClose}
          className="mt-5 w-full rounded-xl bg-gray-100 px-4 py-3 text-base font-medium text-gray-700 dark:bg-gray-700 dark:text-gray-200"
        >
          Done
        </button>
      </div>
    </div>
  );
}
