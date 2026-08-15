#!/usr/bin/env node
// Generates the English dictionary pack (NDJSON) from Princeton WordNet.
//
// Source: the "wordnet-db" npm package (bundles the raw WordNet 3.1 dict files).
//
// Usage:
//   node scripts/generate-wordnet.mjs [outputDir]
//     outputDir: where to write wordnet-en.pack.ndjson (default: dist-packs/)
//
// Output:
//   dist-packs/wordnet-en.pack.ndjson - one DictionaryEntry JSON per line
//   dist-packs/wordnet-en.info.json    - pack metadata
//
// Hosting: upload the generated .ndjson to GitHub Releases and set
//   PACK_BASE_URL in src/core/dictionary/packs.ts accordingly.
import { createWriteStream, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DICT_DIR = join(ROOT, "node_modules", "wordnet-db", "dict");
const OUT_DIR = join(ROOT, process.argv[2] || "dist-packs");

const POS_FILES = [
  ["data.noun", "noun"],
  ["data.verb", "verb"],
  ["data.adj", "adjective"],
  ["data.adv", "adverb"],
];

const VERSION = "3.1";

function parseGloss(gloss) {
  // WordNet gloss format: "definition; "example one"; "example two""
  const parts = gloss.split('; "');
  const definition = parts[0].trim();
  const examples = parts
    .slice(1)
    .map((s) => s.replace(/"\s*$/, "").trim())
    .filter(Boolean);
  return { definition, examples };
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const entries = new Map();

  for (const [file, pos] of POS_FILES) {
    const text = readFileSync(join(DICT_DIR, file), "utf8");
    let parsed = 0;
    for (const line of text.split("\n")) {
      if (!line || line.startsWith("  ")) continue;
      const parts = line.split(" ");
      const wCnt = Number.parseInt(parts[3], 10);
      if (!Number.isFinite(wCnt) || wCnt <= 0) continue;
      const glossIdx = line.indexOf("| ");
      if (glossIdx === -1) continue;
      const { definition, examples } = parseGloss(line.slice(glossIdx + 2).trim());
      if (!definition) continue;
      for (let i = 0; i < wCnt; i += 1) {
        const lemma = parts[4 + i * 2];
        if (!lemma) continue;
        const word = lemma.replace(/_/g, " ");
        const key = word.toLowerCase();
        if (entries.has(key)) continue;
        const entry = { word, pos, definition };
        if (examples.length > 0) entry.examples = examples;
        entry.source = "WordNet";
        entries.set(key, entry);
        parsed += 1;
      }
    }
    console.log(`${file}: ${parsed} surface forms`);
  }

  const outPath = join(OUT_DIR, "wordnet-en.pack.ndjson");
  const stream = createWriteStream(outPath);
  for (const entry of entries.values()) {
    stream.write(JSON.stringify(entry) + "\n");
  }
  await new Promise((res, rej) => stream.end((err) => (err ? rej(err) : res())));
  const sizeBytes = statSync(outPath).size;
  writeFileSync(
    join(OUT_DIR, "wordnet-en.info.json"),
    JSON.stringify(
      { language: "en", source: "WordNet", version: VERSION, count: entries.size, sizeBytes },
      null,
      2,
    ) + "\n",
  );
  console.log(`Wrote ${entries.size} entries -> ${outPath} (${(sizeBytes / 1024 / 1024).toFixed(1)} MB)`);
}

main();