import { describe, expect, it } from "vitest";
import { conjugate } from "./conjugation";

describe("conjugate", () => {
  it("conjugates ichidan verbs (v1)", () => {
    const forms = conjugate("食べる", "v1")!;
    expect(forms).toHaveLength(6);
    expect(forms.find((f) => f.label === "Polite")?.form).toBe("食べます");
    expect(forms.find((f) => f.label === "Te-form")?.form).toBe("食べて");
    expect(forms.find((f) => f.label === "Past")?.form).toBe("食べた");
    expect(forms.find((f) => f.label === "Negative")?.form).toBe("食べない");
    expect(forms.find((f) => f.label === "Potential")?.form).toBe("食べられる");
  });

  it("conjugates godan verbs by ending (v5k, v5g, v5s, v5u)", () => {
    expect(conjugate("書く", "v5k")?.find((f) => f.label === "Te-form")?.form).toBe("書いて");
    expect(conjugate("書く", "v5k")?.find((f) => f.label === "Past")?.form).toBe("書いた");
    expect(conjugate("書く", "v5k")?.find((f) => f.label === "Negative")?.form).toBe("書かない");
    expect(conjugate("書く", "v5k")?.find((f) => f.label === "Potential")?.form).toBe("書ける");
    expect(conjugate("泳ぐ", "v5g")?.find((f) => f.label === "Te-form")?.form).toBe("泳いで");
    expect(conjugate("話す", "v5s")?.find((f) => f.label === "Te-form")?.form).toBe("話して");
    expect(conjugate("買う", "v5u")?.find((f) => f.label === "Negative")?.form).toBe("買わない");
    expect(conjugate("読む", "v5m")?.find((f) => f.label === "Te-form")?.form).toBe("読んで");
    expect(conjugate("取る", "v5r")?.find((f) => f.label === "Te-form")?.form).toBe("取って");
  });

  it("handles godan irregulars 行く and ある", () => {
    expect(conjugate("行く", "v5k")?.find((f) => f.label === "Te-form")?.form).toBe("行って");
    expect(conjugate("行く", "v5k")?.find((f) => f.label === "Past")?.form).toBe("行った");
    expect(conjugate("ある", "v5r")?.find((f) => f.label === "Negative")?.form).toBe("ない");
  });

  it("conjugates suru and kuru verbs", () => {
    expect(conjugate("勉強する", "vs")?.find((f) => f.label === "Polite")?.form).toBe("勉強します");
    expect(conjugate("勉強する", "vs")?.find((f) => f.label === "Potential")?.form).toBe("勉強できる");
    expect(conjugate("来る", "vk")?.find((f) => f.label === "Polite")?.form).toBe("きます");
    expect(conjugate("来る", "vk")?.find((f) => f.label === "Negative")?.form).toBe("こない");
  });

  it("conjugates i-adjectives and na-adjectives", () => {
    expect(conjugate("高い", "adj-i")?.find((f) => f.label === "Past")?.form).toBe("高かった");
    expect(conjugate("高い", "adj-i")?.find((f) => f.label === "Negative")?.form).toBe("高くない");
    expect(conjugate("静か", "adj-na")?.find((f) => f.label === "Past")?.form).toBe("静かだった");
    expect(conjugate("静か", "adj-na")?.find((f) => f.label === "Te-form")?.form).toBe("静かで");
  });

  it("infers unambiguous shapes without a pos code", () => {
    expect(conjugate("書く")?.find((f) => f.label === "Te-form")?.form).toBe("書いて");
    expect(conjugate("勉強する")?.find((f) => f.label === "Polite")?.form).toBe("勉強します");
    expect(conjugate("来る")?.find((f) => f.label === "Polite")?.form).toBe("きます");
    // A bare noun with no pos code is NOT inferred as suru — it may be
    // just a noun, and the pos-carrying entry covers the real case.
    expect(conjugate("勉強")).toBeNull();
  });

  it("returns null for ambiguous or non-conjugable words", () => {
    // る-ending without pos: ichidan or godan-る, unknowable.
    expect(conjugate("食べる")).toBeNull();
    expect(conjugate("本", "n")).toBeNull();
    expect(conjugate("猫")).toBeNull();
    expect(conjugate("")).toBeNull();
  });
});
