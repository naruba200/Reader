import { describe, it, expect } from "vitest";
import { languageForText } from "./index";

// Regression test for the "speaker speaks gibberish" report: the word
// page used to derive the TTS language from the JLPT level, so a
// Japanese word with no level was spoken by an English voice. Language
// must come from the text itself; level is only a fallback.
describe("languageForText", () => {
  it("Japanese text is Japanese regardless of level", () => {
    expect(languageForText("日本語")).toBe("ja");
    expect(languageForText("日本語", "UNKNOWN")).toBe("ja");
    expect(languageForText("日本語")).toBe("ja");
    expect(languageForText("ひらがな")).toBe("ja");
    expect(languageForText("カタカナ")).toBe("ja");
    expect(languageForText("漢字")).toBe("ja");
  });

  it("falls back to the level only when the text has no Japanese characters", () => {
    expect(languageForText("hello", "N5")).toBe("ja");
    expect(languageForText("hello")).toBe("en");
    expect(languageForText("hello", "A1")).toBe("en");
    expect(languageForText("")).toBe("en");
  });

  it("mixed text with any Japanese character is Japanese", () => {
    expect(languageForText("abc日本語def")).toBe("ja");
  });
});
