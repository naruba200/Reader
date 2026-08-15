#!/usr/bin/env node
// Generates the Japanese dictionary pack (NDJSON) from a Yomitan dictionary
// export (the "JMdict_english_with_examples" format: index.json + term_bank_*.json).
//
// Each term bank entry is an array:
//   [expression, reading, definitionTags, rules, score, [glossary...], sequence, ...]
// where each glossary item is either a plain string or a "structured-content"
// tree whose sections are marked by node.data.content ("glossary", "examples",
// "notes", "references", "formsTable", ...).
//
// Usage:
//   node scripts/generate-jmdict-yomitan.mjs [outputDir] [folder] [--max N]
//     outputDir: where to write jmdict-ja.pack.ndjson (default: dist-packs/)
//     folder:    Yomitan dictionary folder (default: C:\Users\viduo\Downloads\JMdict_english_with_examples)
//     --max N:   only convert the first N term entries (for quick test packs)
//
// Output:
//   dist-packs/jmdict-ja.pack.ndjson - one DictionaryEntry JSON per line
//   dist-packs/jmdict-ja.info.json    - pack metadata
//
// Hosting: upload the generated .ndjson to GitHub Releases and set
//   PACK_BASE_URL in src/core/dictionary/packs.ts accordingly.
import { createWriteStream, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_FOLDER = "C:\\Users\\viduo\\Downloads\\JMdict_english_with_examples";

const argv = process.argv.slice(2);
function flag(name) {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
}
const positionals = [];
for (let i = 0; i < argv.length; i += 1) {
  if (argv[i].startsWith("--")) {
    i += 1;
    continue;
  }
  positionals.push(argv[i]);
}
const OUT_DIR = resolve(positionals[0] || "dist-packs");
const FOLDER = positionals[1] || DEFAULT_FOLDER;
const MAX = Number(flag("--max")) || Infinity;

// Sections we skip entirely when flattening structured content.
const NOISE_SECTIONS = new Set([
  "formsTable",
  "references",
  "refGlosses",
  "antonyms",
  "sourceLanguages",
  "infoGlossary",
]);

const MAX_DEFINITION = 700;
const MAX_EXAMPLES = 3;
const MAX_EXAMPLE_LEN = 200;

/**
 * Walk a structured-content node, collecting plain text. `inExamples` switches
 * the walker into collecting example sentences instead of definition text.
 */
function walk(node, inExamples, out) {
  if (node == null) return;
  if (typeof node === "string") {
    const text = node.trim();
    if (text) (inExamples ? out.examples : out.definition).push(text);
    return;
  }
  if (Array.isArray(node)) {
    for (const child of node) walk(child, inExamples, out);
    return;
  }
  if (typeof node !== "object") return;
  const section = node.data?.content;
  if (typeof section === "string" && NOISE_SECTIONS.has(section)) return;
  const childIsExamples = inExamples || section === "examples";
  if (typeof node.content === "string") {
    const text = node.content.trim();
    if (text) (childIsExamples ? out.examples : out.definition).push(text);
    return;
  }
  walk(node.content, childIsExamples, out);
}

/** Flatten one glossary item (string or structured content) into text/examples. */
function flattenGlossary(item) {
  const out = { definition: [], examples: [] };
  if (typeof item === "string") {
    const text = item.trim();
    if (text) out.definition.push(text);
  } else if (typeof item === "object" && item !== null) {
    walk(item, false, out);
  }
  return out;
}

/** Convert one Yomitan term entry into a DictionaryEntry, or undefined to skip. */
function toEntry(entry) {
  const [expression, reading] = entry;
  if (typeof expression !== "string" || !expression.trim()) return undefined;
  const word = expression.trim();
  const defParts = [];
  const examples = [];
  const glossaries = Array.isArray(entry[5]) ? entry[5] : [];
  for (const item of glossaries) {
    const { definition, examples: ex } = flattenGlossary(item);
    defParts.push(...definition);
    examples.push(...ex);
  }
  const definition = defParts.join(" ").replace(/\s+/g, " ").trim().slice(0, MAX_DEFINITION);
  if (!definition && examples.length === 0) return undefined;

  const out = { word, definition };
  const readings = [];
  if (typeof reading === "string" && reading.trim() && reading.trim() !== word) {
    readings.push(reading.trim());
  }
  if (readings.length > 0) out.readings = readings;
  const tags = typeof entry[2] === "string" ? entry[2].trim() : "";
  if (tags && !/^(unc|forms|exp|v|n|adj|adv|intr|tr)$/.test(tags)) {
    out.pos = tags;
  }
  if (examples.length > 0) {
    out.examples = [...new Set(examples)]
      .slice(0, MAX_EXAMPLES)
      .map((s) => s.replace(/\s+/g, " ").trim().slice(0, MAX_EXAMPLE_LEN));
  }
  out.source = "JMDict";
  return out;
}

/** Score an entry so that among duplicates (same word+reading) the best wins. */
function score(e) {
  return (e.examples?.length ?? 0) * 1000 + (e.definition?.length ?? 0);
}

async function main() {
  const files = readdirSync(FOLDER)
    .filter((f) => /^term_bank_\d+\.json$/.test(f))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  if (files.length === 0) throw new Error(`no term_bank_*.json found in ${FOLDER}`);

  let revision = "unknown";
  try {
    const index = JSON.parse(readFileSync(join(FOLDER, "index.json"), "utf8"));
    revision = index.revision || index.title || revision;
  } catch {
    // index.json is optional for conversion
  }

  // Dedup by word+reading: the app's IndexedDB key is word|reading and later
  // writes overwrite earlier ones, so keep the best (example-rich) variant here.
  const unique = new Map();
  let count = 0;

  for (const file of files) {
    const terms = JSON.parse(readFileSync(join(FOLDER, file), "utf8"));
    if (!Array.isArray(terms)) continue;
    for (const entry of terms) {
      if (count >= MAX) break;
      const dictEntry = toEntry(entry);
      if (!dictEntry) continue;
      count += 1;
      const key = dictEntry.word + "\u0000" + (dictEntry.readings?.[0] ?? "");
      const prev = unique.get(key);
      if (!prev || score(dictEntry) > score(prev)) unique.set(key, dictEntry);
    }
    console.log(`${file}: ${unique.size} unique so far`);
    if (count >= MAX) break;
  }

  // The app stores every entry under `ja:<word>` (and under each reading) with
// last-write-wins, so the last sense of a word that appears in the file decides
// what a bare word lookup shows. Order the output so that within each word the
// best-scoring entry is written LAST, e.g. a bare lookup of 水 shows "water"
// (with examples), not a later, weaker sense like "Wednesday".
  const byWord = new Map();
  for (const [key, e] of unique) {
    const w = key.split("\u0000")[0];
    if (!byWord.has(w)) byWord.set(w, []);
    byWord.get(w).push({ key, entry: e });
  }
  for (const list of byWord.values()) {
    list.sort((a, b) => score(a.entry) - score(b.entry));
  }

  mkdirSync(OUT_DIR, { recursive: true });
  const outPath = join(OUT_DIR, "jmdict-ja.pack.ndjson");
  const stream = createWriteStream(outPath);
  for (const list of byWord.values()) {
    for (const { entry } of list) {
      stream.write(JSON.stringify(entry) + "\n");
    }
  }
  await new Promise((res, rej) => stream.end((err) => (err ? rej(err) : res())));
  const sizeBytes = statSync(outPath).size;
  const finalCount = unique.size;
  writeFileSync(
    join(OUT_DIR, "jmdict-ja.info.json"),
    JSON.stringify(
      { language: "ja", source: "JMDict (Yomitan)", version: String(revision), count: finalCount, sizeBytes },
      null,
      2,
    ) + "\n",
  );
  console.log(`Wrote ${finalCount} entries -> ${outPath} (${(sizeBytes / 1024 / 1024).toFixed(1)} MB)`);
}

main().catch((e) => {
  console.error("ERROR:", e.message);
  process.exit(1);
});