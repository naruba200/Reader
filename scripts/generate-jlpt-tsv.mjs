#!/usr/bin/env node
// Generates the full JLPT N5–N1 vocabulary wordlist (public/dict/jlpt.ja.tsv)
// from the OpenJLPT dataset (evanclan/OpenJLPT, CC BY via Jonathan Waller's lists).
//
// Output rows:  <word>\t<LEVEL>  and  <reading>\t<LEVEL>
// Registering both the kanji word and its kana reading lets the level lookup hit
// regardless of which form appears in the text (Kuromoji lemmatizes to either).
//
// Usage:
//   node scripts/generate-jlpt-tsv.mjs [outputPath]
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = resolve(process.argv[2] || join(ROOT, "public", "dict", "jlpt.ja.tsv"));
const BASE = "https://raw.githubusercontent.com/evanclan/OpenJLPT/main/data/json/vocab/";
const LEVELS = ["n5", "n4", "n3", "n2", "n1"];

const rows = [];
for (const level of LEVELS) {
  const res = await fetch(`${BASE}${level}.json`);
  if (!res.ok) throw new Error(`fetch ${level}.json failed: HTTP ${res.status}`);
  const list = await res.json();
  for (const item of list) {
    const words = String(item.word ?? "")
      .split("/")
      .map((w) => w.trim())
      .filter(Boolean);
    const reading = String(item.reading ?? "").trim();
    for (const word of new Set(words)) {
      rows.push(`${word}\t${item.level}`);
      if (reading && reading !== word) rows.push(`${reading}\t${item.level}`);
    }
  }
  console.log(`${level}: ${list.length} words`);
}

mkdirSync(dirname(OUT), { recursive: true });
const header = "# Japanese JLPT vocabulary wordlist (N5-N1, OpenJLPT)\n";
writeFileSync(OUT, header + [...new Set(rows)].join("\n") + "\n", "utf8");
console.log(`Wrote ${new Set(rows).size} rows -> ${OUT}`);