import { describe, it, expect, vi, beforeEach } from "vitest";
import "fake-indexeddb/auto";
import { kanjivgUrl, getStrokeOrderSvg } from "./strokeOrder";

describe("kanjivgUrl", () => {
  it("builds the 5-digit lowercase hex filename from the codepoint", () => {
    expect(kanjivgUrl("日")).toBe(
      "https://raw.githubusercontent.com/KanjiVG/kanjivg/master/kanji/065e5.svg",
    );
    expect(kanjivgUrl("曜")).toBe(
      "https://raw.githubusercontent.com/KanjiVG/kanjivg/master/kanji/066dc.svg",
    );
    expect(kanjivgUrl("愛")).toBe(
      "https://raw.githubusercontent.com/KanjiVG/kanjivg/master/kanji/0611b.svg",
    );
    expect(kanjivgUrl("一")).toBe(
      "https://raw.githubusercontent.com/KanjiVG/kanjivg/master/kanji/04e00.svg",
    );
  });

  it("throws on an empty character", () => {
    expect(() => kanjivgUrl("")).toThrow();
  });
});

describe("getStrokeOrderSvg cache", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("downloads once, then serves from IndexedDB", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => "<svg><path d='M0 0'/></svg>",
    }));
    vi.stubGlobal("fetch", fetchMock);
    const first = await getStrokeOrderSvg("日");
    expect(first.status).toBe("ok");
    const second = await getStrokeOrderSvg("日");
    expect(second.status).toBe("ok");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("reports needs-connection when offline and uncached", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new TypeError("network down");
    }));
    const result = await getStrokeOrderSvg("鬱");
    expect(result.status).toBe("needs-connection");
  });
});
