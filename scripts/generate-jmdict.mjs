#!/usr/bin/env node
// Generates the Japanese dictionary pack (NDJSON) from jmdict-simplified JSON.
//
// Source: https://github.com/scriptin/jmdict-simplified
//   The full Japanese->English dictionary ships as "jmdict-eng-<version>.json.zip"
//   on the GitHub Releases page. This script can download the zip itself, or
//   read a local file you downloaded/extracted already.
//
// Usage:
//   node scripts/generate-jmdict.mjs [outputDir] [source]
//     outputDir: where to write jmdict-ja.pack.ndjson (default: dist-packs/)
//     source:    a local .json/.zip path, or a https URL to a jmdict-eng zip
//                (default: latest jmdict-simplified release zip)
//
// Output:
//   dist-packs/jmdict-ja.pack.ndjson  - one DictionaryEntry JSON per line
//   dist-packs/jmdict-ja.info.json    - pack metadata
//
// Hosting: upload the generated .ndjson to GitHub Releases and set
//   PACK_BASE_URL in src/core/dictionary/packs.ts accordingly.
import { createWriteStream, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(ROOT, process.argv[2] || "dist-packs");
const SOURCE_ARG = process.argv[3];

const VERSION = "latest";

async function resolveLatestEngZip() {
  const res = await fetch("https://api.github.com/repos/scriptin/jmdict-simplified/releases/latest");
  if (!res.ok) throw new Error(`release lookup failed: HTTP ${res.status}`);
  const release = await res.json();
  const asset = (release.assets || []).find(
    (a) =>
      /^jmdict-eng-.*\.json\.zip$/i.test(a.name) && !a.name.includes("-common-"),
  );
  if (!asset) throw new Error("no jmdict-eng zip asset found in latest release");
  return asset.browser_download_url;
}

async function download(url) {
  console.log("Downloading", url);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download failed: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  console.log("Downloaded", (buf.length / 1024 / 1024).toFixed(1), "MB");
  return buf;
}

async function extractJson(buf) {
  const { default: unzipper } = await import("unzipper");
  const dir = await unzipper.Open.buffer(buf);
  const jsonFiles = dir.files.filter(
    (f) => f.type === "File" && f.path.endsWith(".json"),
  );
  if (jsonFiles.length === 0) throw new Error("no JSON found in zip");
  const buffers = await Promise.all(jsonFiles.map((f) => f.buffer()));
  const engIdx = jsonFiles.findIndex((f) => /jmdict-eng/i.test(f.path));
  const chosen = engIdx >= 0 ? buffers[engIdx] : buffers[0];
  return JSON.parse(chosen.toString("utf8"));
}

async function loadSource(source) {
  const isZip = source.endsWith(".zip");
  if (source.startsWith("http")) {
    const buf = await download(source);
    return isZip ? extractJson(buf) : JSON.parse(buf.toString("utf8"));
  }
  const buf = readFileSync(source);
  return isZip ? extractJson(buf) : JSON.parse(buf.toString("utf8"));
}

function toEntry(e) {
  const kanji = e.kanji?.[0]?.text;
  const kana = e.kana?.[0]?.text;
  const word = kanji || kana;
  if (!word) return undefined;
  const readings = [...new Set((e.kana || []).map((k) => k.text).filter(Boolean))];
  const senses = [];
  const posSet = new Set();
  for (const s of e.sense || []) {
    const glosses = (s.glosses || [])
      .filter((g) => !g.lang || g.lang === "eng")
      .map((g) => g.text)
      .filter(Boolean);
    if (glosses.length > 0) senses.push(glosses.join("; "));
    for (const p of s.part_of_speech || []) posSet.add(p);
    if (senses.length >= 10) break;
  }
  if (senses.length === 0) return undefined;
  const entry = {
    word,
    definition: senses.map((s, i) => (senses.length > 1 ? `${i + 1}. ${s}` : s)).join(" ").slice(0, 700),
  };
  if (readings.length > 0) entry.readings = readings;
  if (posSet.size > 0) entry.pos = [...posSet].join("/");
  entry.source = "JMDict";
  return entry;
}

async function main() {
  const source = SOURCE_ARG || (await resolveLatestEngZip());
  mkdirSync(OUT_DIR, { recursive: true });
  const json = await loadSource(source);
  const list = Array.isArray(json) ? json : json.jmdict;
  if (!Array.isArray(list)) throw new Error("unexpected JSON shape (expected an array or {jmdict: []})");

  console.log(`Converting ${list.length} entries…`);
  const outPath = join(OUT_DIR, "jmdict-ja.pack.ndjson");
  const stream = createWriteStream(outPath);
  let count = 0;
  for (const raw of list) {
    const entry = toEntry(raw);
    if (!entry) continue;
    stream.write(JSON.stringify(entry) + "\n");
    count += 1;
  }
  await new Promise((res, rej) => stream.end((err) => (err ? rej(err) : res())));
  const sizeBytes = statSync(outPath).size;
  writeFileSync(
    join(OUT_DIR, "jmdict-ja.info.json"),
    JSON.stringify(
      { language: "ja", source: "JMDict", version: VERSION, count, sizeBytes },
      null,
      2,
    ) + "\n",
  );
  console.log(`Wrote ${count} entries -> ${outPath} (${(sizeBytes / 1024 / 1024).toFixed(1)} MB)`);
}

main().catch((e) => {
  console.error("ERROR:", e.message);
  process.exit(1);
});