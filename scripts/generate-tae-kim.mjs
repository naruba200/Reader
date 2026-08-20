#!/usr/bin/env node
// Generates the Tae Kim's Grammar dictionary pack (NDJSON) from markdown files.
//
// Source: https://github.com/Saeris/guide-to-japanese
//   Markdown adaptation of Tae Kim's Guide to Learning Japanese.
//   Original: https://guidetojapanese.org/ - Licensed CC BY-NC-SA
//
// Usage:
//   node scripts/generate-tae-kim.mjs [outputDir] [sourceDir]
//     outputDir: where to write tae-kim-ja.pack.ndjson (default: dist-packs/)
//     sourceDir: path to guide-to-japanese repo root (default: guide-to-japanese/)
//
// Output:
//   dist-packs/tae-kim-ja.pack.ndjson  - one DictionaryEntry JSON per line
//   dist-packs/tae-kim-ja.info.json    - pack metadata
import { createWriteStream, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(ROOT, process.argv[2] || "dist-packs");
const SOURCE_DIR = process.argv[3] || join(ROOT, "guide-to-japanese", "public", "learn", "grammar");

const VERSION = "1.0";

// Grammar patterns to extract from markdown.
// These match Japanese grammar patterns referenced in headings and text.
const GRAMMAR_PATTERNS = [
  // Common patterns - these are extracted from ## and ### headings
  // and from inline references like ""～pattern""
];

function findMarkdownFiles(dir) {
  const files = [];
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...findMarkdownFiles(fullPath));
    } else if (entry.name.endsWith(".md") && entry.name !== "overview.md") {
      files.push(fullPath);
    }
  }
  return files;
}

function extractGrammarFromMarkdown(filePath, sourceDir) {
  const content = readFileSync(filePath, "utf8");
  const relativePath = relative(sourceDir, filePath).replace(/\.md$/, "");
  const sections = relativePath.split(/[\\/]/);

  // Extract frontmatter title
  const fmMatch = content.match(/^---\ntitle:\s*(.*?)\n/m);
  const title = fmMatch ? fmMatch[1].trim() : sections[sections.length - 1];

  // Extract grammar patterns from the content
  const patterns = [];

  // Match patterns like ""～てある"", ""～ている"", ""〜てもいい"" etc.
  const inlinePatternRegex = /[「"]{2}([～〜]?[ぁ-んァ-ヶー一-龥々]+[ぁ-んァ-ヶー一-龥々a-zA-Z]*?)[」"]{2}/g;
  let pm;
  const seen = new Set();

  while ((pm = inlinePatternRegex.exec(content)) !== null) {
    const pattern = pm[1].trim();
    if (pattern.length >= 2 && !seen.has(pattern)) {
      seen.add(pattern);
      patterns.push(pattern);
    }
  }

  // Also match bold patterns like **〜 Pattern**
  const boldRegex = /\*\*[～〜]?([ぁ-んァ-ヶー一-龥々]+[ぁ-んァ-ヶーa-zA-Z]*?)\*\*/g;
  while ((pm = boldRegex.exec(content)) !== null) {
    const pattern = pm[1].trim();
    if (pattern.length >= 2 && !seen.has(pattern)) {
      seen.add(pattern);
      patterns.push(pattern);
    }
  }

  // Extract section description (first paragraph after frontmatter)
  const descMatch = content.match(/---\n\n(.+?)(?:\n\n|\n##)/s);
  const description = descMatch
    ? descMatch[1].replace(/[#*_`\[\]]/g, "").replace(/\s+/g, " ").trim().slice(0, 300)
    : "";

  // Build section label
  const section = sections.length > 1 ? sections.slice(0, -1).join(" > ") : "";

  return { title, patterns, description, section, filePath };
}

function toEntry(pattern, context) {
  const { title, description, section } = context;

  let definition = "";
  if (section) definition += `[${section}]\n`;
  definition += `${title}`;
  if (description) definition += `\n${description}`;

  return {
    word: pattern,
    definition: definition.slice(0, 500),
    source: "Tae Kim's Grammar",
  };
}

function main() {
  mkdirSync(OUT_DIR, { recursive: true });

  console.log(`Scanning ${SOURCE_DIR}...`);
  const mdFiles = findMarkdownFiles(SOURCE_DIR);
  console.log(`Found ${mdFiles.length} markdown files`);

  const outPath = join(OUT_DIR, "tae-kim-ja.pack.ndjson");
  const stream = createWriteStream(outPath);
  let count = 0;
  const seen = new Set();

  for (const file of mdFiles) {
    const context = extractGrammarFromMarkdown(file, SOURCE_DIR);
    for (const pattern of context.patterns) {
      if (seen.has(pattern)) continue;
      seen.add(pattern);
      stream.write(JSON.stringify(toEntry(pattern, context)) + "\n");
      count++;
    }
  }

  stream.end(() => {
    const sizeBytes = statSync(outPath).size;
    writeFileSync(
      join(OUT_DIR, "tae-kim-ja.info.json"),
      JSON.stringify(
        { language: "ja", source: "Tae Kim's Grammar", version: VERSION, count, sizeBytes },
        null,
        2,
      ) + "\n",
    );
    console.log(`Wrote ${count} entries -> ${outPath} (${(sizeBytes / 1024).toFixed(1)} KB)`);
  });
}

main();
