#!/usr/bin/env node
// Generates the JLPT Grammar dictionary pack (NDJSON) from n1-n5.json files.
//
// Source: User-provided JLPT grammar JSON files (n1.json through n5.json)
//   Each file contains an array of grammar points with pattern, meaning, formation, examples.
//
// Usage:
//   node scripts/generate-jlpt-grammar.mjs [outputDir] [sourceDir]
//     outputDir:  where to write jlpt-grammar-ja.pack.ndjson (default: dist-packs/)
//     sourceDir:  directory containing n1.json through n5.json (default: project root)
//
// Output:
//   dist-packs/jlpt-grammar-ja.pack.ndjson  - one DictionaryEntry JSON per line
//   dist-packs/jlpt-grammar-ja.info.json    - pack metadata
import { createWriteStream, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(ROOT, process.argv[2] || "dist-packs");
const SOURCE_DIR = process.argv[3] || ROOT;

const VERSION = "1.0";

function loadLevel(filePath, level) {
  const raw = readFileSync(filePath, "utf8");
  const list = JSON.parse(raw);
  if (!Array.isArray(list)) throw new Error(`${filePath} is not an array`);
  return list.map((g) => toEntry(g, level)).filter(Boolean);
}

function toEntry(g, level) {
  const pattern = g.pattern?.trim();
  const meaning = g.meaning?.trim();
  if (!pattern || !meaning) return undefined;

  const formation = g.formation?.trim();
  const tags = g.tags?.join(", ") ?? "";

  let definition = `[${level}] ${meaning}`;
  if (formation) definition += `\nFormation: ${formation}`;
  if (tags) definition += `\nTags: ${tags}`;

  const examples = [];
  for (const ex of (g.examples || []).slice(0, 3)) {
    if (ex.ja && ex.en) {
      examples.push(`${ex.ja} ${ex.en}`);
    }
  }

  const entry = { word: pattern, definition };
  if (examples.length > 0) entry.examples = examples;
  entry.source = "JLPT Grammar";

  return entry;
}

function main() {
  mkdirSync(OUT_DIR, { recursive: true });

  const levels = [
    { file: "n5.json", level: "N5" },
    { file: "n4.json", level: "N4" },
    { file: "n3.json", level: "N3" },
    { file: "n2.json", level: "N2" },
    { file: "n1.json", level: "N1" },
  ];

  let totalCount = 0;
  const outPath = join(OUT_DIR, "jlpt-grammar-ja.pack.ndjson");
  const stream = createWriteStream(outPath);

  for (const { file, level } of levels) {
    const filePath = join(SOURCE_DIR, file);
    try {
      const entries = loadLevel(filePath, level);
      console.log(`${level}: ${entries.length} grammar points from ${file}`);
      for (const entry of entries) {
        stream.write(JSON.stringify(entry) + "\n");
        totalCount++;
      }
    } catch (err) {
      console.warn(`Warning: skipping ${file}: ${err.message}`);
    }
  }

  stream.end(() => {
    const sizeBytes = statSync(outPath).size;
    writeFileSync(
      join(OUT_DIR, "jlpt-grammar-ja.info.json"),
      JSON.stringify(
        { language: "ja", source: "JLPT Grammar", version: VERSION, count: totalCount, sizeBytes },
        null,
        2,
      ) + "\n",
    );
    console.log(`Wrote ${totalCount} entries -> ${outPath} (${(sizeBytes / 1024).toFixed(1)} KB)`);
  });
}

main();
