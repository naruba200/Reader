import { describe, it, expect } from "vitest";
import "fake-indexeddb/auto";
import { LibraryStore } from "../src/core/library";
import type { BookDocument } from "../src/core/types";

let dbCounter = 0;
function uniqueDb(): string {
  dbCounter += 1;
  return `lib-test-db-${dbCounter}-${Math.random().toString(36).slice(2)}`;
}

function makeDoc(overrides: Partial<BookDocument> = {}): BookDocument {
  return {
    id: "doc-1",
    title: "Test Book",
    language: "ja",
    format: "epub",
    chapters: [
      { id: "c1", title: "Chapter 1", html: "<p>水</p>", text: "水" },
      {
        id: "c2",
        title: "Chapter 2",
        html: "<p>Image</p>",
        text: "",
        blocks: [{ kind: "image", src: "data:image/png;base64,AAAA" }],
      },
    ],
    ...overrides,
  };
}

describe("LibraryStore", () => {
  it("saves a book and lists its metadata without the document", async () => {
    const store = new LibraryStore(uniqueDb());
    const doc = makeDoc();
    const meta = await store.saveBook(doc, "test.epub");

    expect(meta.id).toBeTruthy();
    expect(meta.title).toBe("Test Book");
    expect(meta.language).toBe("ja");
    expect(meta.chapters).toBe(2);

    const list = await store.listBooks();
    expect(list).toHaveLength(1);
    expect(list[0]).toEqual(meta);
    expect("doc" in list[0]).toBe(false);
  });

  it("loads the full serialized document (including image blocks)", async () => {
    const store = new LibraryStore(uniqueDb());
    const meta = await store.saveBook(makeDoc(), "test.epub");
    const loaded = await store.loadBook(meta.id);

    expect(loaded?.title).toBe("Test Book");
    expect(loaded?.chapters).toHaveLength(2);
    expect(loaded?.chapters[1].blocks?.[0]).toEqual({
      kind: "image",
      src: "data:image/png;base64,AAAA",
    });
    expect(await store.loadBook("missing")).toBeUndefined();
  });

  it("keeps multiple saved books and preserves order", async () => {
    const store = new LibraryStore(uniqueDb());
    const a = await store.saveBook(makeDoc({ title: "A" }), "a.epub");
    const b = await store.saveBook(makeDoc({ title: "B" }), "b.epub");
    const list = await store.listBooks();
    expect(list.map((m) => m.title)).toEqual(["A", "B"]);
    expect(a.id).not.toBe(b.id);
  });

  it("saves and loads reading progress per book", async () => {
    const store = new LibraryStore(uniqueDb());
    const meta = await store.saveBook(makeDoc(), "test.epub");

    expect(await store.loadProgress(meta.id)).toBeUndefined();

    await store.saveProgress(meta.id, 3, 4);
    const progress = await store.loadProgress(meta.id);
    expect(progress?.chapterIndex).toBe(3);
    expect(progress?.pageIndex).toBe(4);

    await store.saveProgress(meta.id, 5, 0);
    expect((await store.loadProgress(meta.id))?.chapterIndex).toBe(5);
  });

  it("deletes a book and its progress", async () => {
    const store = new LibraryStore(uniqueDb());
    const meta = await store.saveBook(makeDoc(), "test.epub");
    await store.saveProgress(meta.id, 1, 2);

    await store.deleteBook(meta.id);
    expect(await store.listBooks()).toEqual([]);
    expect(await store.loadBook(meta.id)).toBeUndefined();
    expect(await store.loadProgress(meta.id)).toBeUndefined();
  });
});