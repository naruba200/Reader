#!/usr/bin/env node
// Generates the KANJIDIC2 dictionary pack (NDJSON) from kanjidic2.xml.
//
// Source: https://www.edrdg.org/wiki/KANJIDIC_Project.html
//   The KANJIDIC2 XML file contains ~13,000 kanji entries with readings, meanings,
//   stroke counts, grades, and more. Licensed under EDRDG guidelines (free for
//   non-commercial use with attribution).
//
// Usage:
//   node scripts/generate-kanjidic2.mjs [outputDir] [xmlPath]
//     outputDir: where to write kanjidic2-ja.pack.ndjson (default: dist-packs/)
//     xmlPath:   path to kanjidic2.xml (default: kanjidic2.xml/kanjidic2.xml in project root)
//
// Output:
//   dist-packs/kanjidic2-ja.pack.ndjson  - one DictionaryEntry JSON per line
//   dist-packs/kanjidic2-ja.info.json    - pack metadata
import { createWriteStream, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(ROOT, process.argv[2] || "dist-packs");
const XML_PATH = process.argv[3] || join(ROOT, "kanjidic2.xml", "kanjidic2.xml");

const VERSION = "2.0";

function parseXml(xml) {
  const entries = [];
  // Split by <character> tags
  const charRegex = /<character>([\s\S]*?)<\/character>/g;
  let match;

  while ((match = charRegex.exec(xml)) !== null) {
    const block = match[1];

    const literalMatch = /<literal>(.*?)<\/literal>/.exec(block);
    if (!literalMatch) continue;
    const literal = literalMatch[1];

    // Readings
    const readings = [];
    const readingRegex = /<reading r_type="ja_(?:on|kun)">(.*?)<\/reading>/g;
    let rm;
    while ((rm = readingRegex.exec(block)) !== null) {
      readings.push(rm[1]);
    }

    // Meanings
    const meanings = [];
    const meaningRegex = /<meaning>(.*?)<\/meaning>/g;
    let mm;
    while ((mm = meaningRegex.exec(block)) !== null) {
      // Skip non-English meanings (those with xml:lang attribute)
      if (!/<meaning[^>]*xml:lang/.exec(mm[0])) {
        meanings.push(mm[1]);
      }
    }

    // Grade
    const gradeMatch = /<grade>(\d+)<\/grade>/.exec(block);
    const grade = gradeMatch ? Number(gradeMatch[1]) : undefined;

    // Stroke count
    const strokeMatch = /<stroke_count>(\d+)<\/stroke_count>/.exec(block);
    const strokes = strokeMatch ? Number(strokeMatch[1]) : undefined;

    if (meanings.length === 0) continue;

    entries.push({ literal, readings, meanings, grade, strokes });
  }

  return entries;
}

function toEntry(k) {
  const definition = k.meanings.join(", ");
  const readings = k.readings.length > 0 ? k.readings : undefined;

  const entry = {
    word: k.literal,
    definition,
  };
  if (readings) entry.readings = readings;

  // Add grade and stroke info to definition
  const meta = [];
  if (k.grade) meta.push(`Grade ${k.grade}`);
  if (k.strokes) meta.push(`${k.strokes} strokes`);
  if (meta.length > 0) {
    entry.definition += `\n${meta.join(" · ")}`;
  }

  entry.source = "KANJIDIC2";
  return entry;
}

function main() {
  mkdirSync(OUT_DIR, { recursive: true });

  console.log(`Reading ${XML_PATH}...`);
  const xml = readFileSync(XML_PATH, "utf8");
  console.log(`XML size: ${(xml.length / 1024 / 1024).toFixed(1)} MB`);

  const kanji = parseXml(xml);
  console.log(`Parsed ${kanji.length} kanji entries`);

  const outPath = join(OUT_DIR, "kanjidic2-ja.pack.ndjson");
  const stream = createWriteStream(outPath);
  let count = 0;

  for (const k of kanji) {
    stream.write(JSON.stringify(toEntry(k)) + "\n");
    count++;
  }

  stream.end(() => {
    const sizeBytes = statSync(outPath).size;
    writeFileSync(
      join(OUT_DIR, "kanjidic2-ja.info.json"),
      JSON.stringify(
        { language: "ja", source: "KANJIDIC2", version: VERSION, count, sizeBytes },
        null,
        2,
      ) + "\n",
    );
    console.log(`Wrote ${count} entries -> ${outPath} (${(sizeBytes / 1024 / 1024).toFixed(1)} MB)`);
  });
}

main();
