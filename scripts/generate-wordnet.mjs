#!/usr/bin/env node
// Generates the English dictionary pack (NDJSON) from Princeton WordNet.
//
// Usage:
//   node scripts/generate-wordnet.mjs [outputDir] [--tar <path>] [--dir <path>]
//     outputDir: where to write wordnet-en.pack.ndjson (default: dist-packs/)
//     --tar:     path to a wn3.1.dict.tar.gz archive; extracted automatically
//                to a temp dir (the archive holds a top-level dict/ folder)
//     --dir:     path to an extracted WordNet dict folder (data.noun, ...)
//     (none)     falls back to the bundled wordnet-db copy
//
// Output:
//   dist-packs/wordnet-en.pack.ndjson - one DictionaryEntry JSON per line
//   dist-packs/wordnet-en.info.json    - pack metadata
//
// Hosting: upload the generated .ndjson to GitHub Releases and set
//   PACK_BASE_URL in src/core/dictionary/packs.ts accordingly.
import { createWriteStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = resolve(process.argv[2] || "dist-packs");

const POS_FILES = [
  ["data.noun", "noun"],
  ["data.verb", "verb"],
  ["data.adj", "adjective"],
  ["data.adv", "adverb"],
];

const VERSION = "3.1";

function parseArgs() {
  const args = process.argv.slice(3);
  const opts = { tar: undefined, dir: undefined };
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === "--tar") opts.tar = args[i + 1];
    if (args[i] === "--dir") opts.dir = args[i + 1];
  }
  return opts;
}

/** Extract the WordNet dict folder, returning its absolute path. */
function resolveDictDir(opts) {
  if (opts.dir) {
    if (!existsSync(join(opts.dir, "data.noun"))) {
      throw new Error(`--dir ${opts.dir} does not contain data.noun`);
    }
    return opts.dir;
  }
  if (opts.tar) {
    const extractDir = join(tmpdir(), `wn3.1-dict-${Date.now()}`);
    mkdirSync(extractDir, { recursive: true });
    console.log(`Extracting ${opts.tar} -> ${extractDir}`);
    const r = spawnSync("tar", ["-xzf", opts.tar, "-C", extractDir], { stdio: "pipe" });
    if (r.status !== 0) {
      throw new Error(`tar extraction failed: ${r.stderr?.toString() || r.stdout?.toString() || "unknown error"}`);
    }
    return join(extractDir, "dict");
  }
  return join(ROOT, "node_modules", "wordnet-db", "dict");
}

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
  const opts = parseArgs();
  const DICT_DIR = resolveDictDir(opts);
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