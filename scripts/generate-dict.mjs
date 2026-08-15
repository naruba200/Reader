import { build } from "esbuild";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

async function loadModule(entry) {
  const result = await build({
    entryPoints: [entry],
    bundle: true,
    format: "cjs",
    write: false,
    platform: "node",
    logLevel: "silent",
  });
  const code = result.outputFiles[0].text;
  const mod = { exports: {} };
  new Function("module", "exports", "require", code)(mod, mod.exports, require);
  return mod.exports;
}

const outDir = path.join(__dirname, "..", "public", "dict");
fs.mkdirSync(outDir, { recursive: true });

const cefr = await loadModule(
  path.join(__dirname, "..", "src", "core", "leveldb", "data", "cefr.en.ts"),
);
const jlpt = await loadModule(
  path.join(__dirname, "..", "src", "core", "leveldb", "data", "jlpt.ja.ts"),
);

const cefrLines = cefr.CEFR_EN_SAMPLE.map(
  ([word, level]) => `${word}\t${level}`,
);
const jlptLines = [];
for (const [kanji, kana, , level] of jlpt.JLPT_JA_SAMPLE) {
  jlptLines.push(`${kanji}\t${level}`);
  jlptLines.push(`${kana}\t${level}`);
}

fs.writeFileSync(
  path.join(outDir, "cefr.en.tsv"),
  "# English CEFR sample wordlist (auto-generated)\n" + cefrLines.join("\n") + "\n",
  "utf8",
);
fs.writeFileSync(
  path.join(outDir, "jlpt.ja.tsv"),
  "# Japanese JLPT sample wordlist (auto-generated)\n" + jlptLines.join("\n") + "\n",
  "utf8",
);

console.log("cefr.en.tsv:", cefrLines.length, "rows");
console.log("jlpt.ja.tsv:", jlptLines.length, "rows");
console.log("written to", outDir);
