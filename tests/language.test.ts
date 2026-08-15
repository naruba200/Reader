import { describe, it, expect } from "vitest";
import {
  ENGLISH_ADAPTER,
  GERMAN_ADAPTER,
  FRENCH_ADAPTER,
  JAPANESE_ADAPTER,
  getAdapter,
  supportedLanguages,
} from "../src/core/language";
import { tokenizeLatin } from "../src/core/language/tokenizer";
import {
  segmentJapanese,
  deinflectJapanese,
  isHiragana,
  isKatakana,
  isKanji,
  toHiragana,
} from "../src/core/language/japanese";

describe("tokenizeLatin", () => {
  it("splits words and tracks offsets", () => {
    const tokens = tokenizeLatin("The quick brown fox. Hello, world!");
    expect(tokens.map((t) => t.surface)).toEqual([
      "The", "quick", "brown", "fox", "Hello", "world",
    ]);
    expect(tokens[0].start).toBe(0);
    expect(tokens[0].length).toBe(3);
  });

  it("keeps apostrophes in words", () => {
    const tokens = tokenizeLatin("don't stop l'homme");
    expect(tokens.map((t) => t.surface)).toEqual(["don't", "stop", "l'homme"]);
  });

  it("handles accented characters", () => {
    const tokens = tokenizeLatin("café déjà vu à côté");
    expect(tokens.map((t) => t.surface)).toEqual(["café", "déjà", "vu", "à", "côté"]);
  });
});

describe("ENGLISH_ADAPTER", () => {
  it("lemmatizes irregular verbs", () => {
    expect(ENGLISH_ADAPTER.lemmatize("went")).toBe("go");
    expect(ENGLISH_ADAPTER.lemmatize("took")).toBe("take");
    expect(ENGLISH_ADAPTER.lemmatize("women")).toBe("woman");
    expect(ENGLISH_ADAPTER.lemmatize("children")).toBe("child");
  });

  it("lemmatizes regular inflections", () => {
    expect(ENGLISH_ADAPTER.lemmatize("books")).toBe("book");
    expect(ENGLISH_ADAPTER.lemmatize("running")).toBe("run");
    expect(ENGLISH_ADAPTER.lemmatize("stories")).toBe("story");
    expect(ENGLISH_ADAPTER.lemmatize("walked")).toBe("walk");
    expect(ENGLISH_ADAPTER.lemmatize("studies")).toBe("study");
  });

  it("returns lowercase for plain words", () => {
    expect(ENGLISH_ADAPTER.lemmatize("House")).toBe("house");
  });

  it("tokenizes with lemmas", async () => {
    const tokens = await ENGLISH_ADAPTER.tokenize("The children went home");
    expect(tokens.map((t) => t.lemma)).toEqual([
      "the", "child", "go", "home",
    ]);
  });
});

describe("GERMAN_ADAPTER", () => {
  it("lemmatizes common noun endings", () => {
    expect(GERMAN_ADAPTER.lemmatize("Häuser")).toBe("haus");
    expect(GERMAN_ADAPTER.lemmatize("Tage")).toBe("tag");
    expect(GERMAN_ADAPTER.lemmatize("Straße")).toBe("straße");
  });
});

describe("FRENCH_ADAPTER", () => {
  it("handles irregular verbs", () => {
    expect(FRENCH_ADAPTER.lemmatize("est")).toBe("être");
    expect(FRENCH_ADAPTER.lemmatize("ont")).toBe("avoir");
    expect(FRENCH_ADAPTER.lemmatize("fait")).toBe("faire");
  });

  it("lemmatizes regular endings", () => {
    expect(FRENCH_ADAPTER.lemmatize("parlent")).toBe("parler");
    expect(FRENCH_ADAPTER.lemmatize("chevaux")).toBe("cheval");
    expect(FRENCH_ADAPTER.lemmatize("maisons")).toBe("maison");
  });
});

describe("JAPANESE_ADAPTER", () => {
  it("detects script types", () => {
    expect(isHiragana("あ")).toBe(true);
    expect(isKatakana("ア")).toBe(true);
    expect(isKanji("山")).toBe(true);
    expect(toHiragana("タベマス")).toBe("たべます");
  });

  it("segments seeded words from mixed text", () => {
    const { tokens } = segmentJapanese("私は今日学校へ行く");
    const surfaces = tokens.map((t) => t.surface);
    expect(surfaces).toContain("私");
    expect(surfaces).toContain("今日");
    expect(surfaces).toContain("学校");
    expect(surfaces).toContain("行く");
  });

  it("deinflects verb forms", () => {
    expect(deinflectJapanese("食べた").lemma).toBe("食べ");
    expect(deinflectJapanese("食べます").lemma).toBe("食べ");
    expect(deinflectJapanese("食べない").lemma).toBe("食べ");
    expect(deinflectJapanese("行った").lemma).toBe("行っ");
  });

  it("tokenizes with deinflected lemmas", async () => {
    const tokens = await JAPANESE_ADAPTER.tokenize("食べる");
    expect(tokens.length).toBeGreaterThan(0);
    expect(tokens[0].surface).toBe("食べる");
  });
});

describe("adapter registry", () => {
  it("returns English for unknown languages", () => {
    expect(getAdapter("zh")).toBe(ENGLISH_ADAPTER);
  });

  it("lists supported languages", () => {
    expect(supportedLanguages()).toContain("en");
    expect(supportedLanguages()).toContain("ja");
  });
});
