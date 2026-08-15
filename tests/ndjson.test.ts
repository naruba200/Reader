import { describe, it, expect } from "vitest";
import { consumeNdJsonStream, parsePackLine } from "../src/core/dictionary";

const enc = new TextEncoder();

function streamOf(chunks: string[]): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) controller.enqueue(enc.encode(c));
      controller.close();
    },
  });
}

describe("parsePackLine", () => {
  it("parses a valid entry", () => {
    const line = JSON.stringify({ word: "水", readings: ["みず"], definition: "water", pos: "noun" });
    const entry = parsePackLine(line);
    expect(entry?.word).toBe("水");
    expect(entry?.readings).toEqual(["みず"]);
    expect(entry?.definition).toBe("water");
    expect(entry?.pos).toBe("noun");
  });

  it("ignores blank and invalid lines", () => {
    expect(parsePackLine("")).toBeUndefined();
    expect(parsePackLine("   ")).toBeUndefined();
    expect(parsePackLine("not json")).toBeUndefined();
    expect(parsePackLine(JSON.stringify({}))).toBeUndefined();
    expect(parsePackLine(JSON.stringify({ word: "" }))).toBeUndefined();
  });

  it("defaults a missing definition to empty string", () => {
    const entry = parsePackLine(JSON.stringify({ word: "x" }));
    expect(entry?.definition).toBe("");
  });
});

describe("consumeNdJsonStream", () => {
  it("parses entries and reports progress", async () => {
    const lines = [
      JSON.stringify({ word: "a", definition: "d1" }),
      JSON.stringify({ word: "b", definition: "d2" }),
      "garbage",
      JSON.stringify({ word: "c", definition: "d3" }),
    ];
    const seen: string[] = [];
    const bytes: number[] = [];
    const { count, bytes: totalBytes } = await consumeNdJsonStream(
      streamOf(lines.map((l) => l + "\n")),
      {
        onEntry: (entry) => void seen.push(entry.word),
        onProgress: (b) => void bytes.push(b),
      },
    );
    expect(count).toBe(3);
    expect(seen).toEqual(["a", "b", "c"]);
    expect(bytes.at(-1)).toBe(totalBytes);
    expect(totalBytes).toBeGreaterThan(0);
  });

  it("handles entries split across chunk boundaries", async () => {
    const line = JSON.stringify({ word: "分断テスト", definition: "split" });
    // Split the byte content into 3-char chunks so a line spans many reads.
    const full = enc.encode(line + "\n");
    const chunks: string[] = [];
    const dec = new TextDecoder();
    for (let i = 0; i < full.length; i += 3) {
      chunks.push(dec.decode(full.subarray(i, i + 3)));
    }
    const { count } = await consumeNdJsonStream(streamOf(chunks), {});
    expect(count).toBe(1);
  });

  it("processes the final line even without a trailing newline", async () => {
    const lines = [
      JSON.stringify({ word: "ネコ", definition: "cat" }),
      JSON.stringify({ word: "水", definition: "water" }),
    ];
    const seen: string[] = [];
    const { count } = await consumeNdJsonStream(streamOf([lines.join("\n")]), {
      onEntry: (entry) => void seen.push(entry.word),
    });
    expect(count).toBe(2);
    expect(seen).toEqual(["ネコ", "水"]);
  });
});