// Generates test-files/: one folder per icon, holding an empty file for every
// extension and file name mapped to that icon. Open it in Zed with the theme
// active; every file in a folder should show that folder's icon.
//
//   pnpm build && pnpm test-files && zed test-files

import { mkdir, rm, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "test-files");
const theme = JSON.parse(readFileSync(path.join(root, "icon_themes/pierre-icons.json"), "utf8")).themes[0];

// icon -> lowercased name -> name. macOS file names are case-insensitive, so
// readme.md and README.md would collide: keep the capitalised spelling.
const byIcon = {};
const add = (icon, file) => {
  const files = (byIcon[icon] ??= new Map());
  const prev = files.get(file.toLowerCase());
  if (!prev || (/[A-Z]/.test(file) && !/[A-Z]/.test(prev))) files.set(file.toLowerCase(), file);
};

for (const [suffix, icon] of Object.entries(theme.file_suffixes)) {
  // Bare names like LICENSE / CHANGELOG are matched as whole file names.
  add(icon, /^[A-Z]+$/.test(suffix) ? suffix : `sample.${suffix}`);
}
for (const [name, icon] of Object.entries(theme.file_stems)) add(icon, name);
add("default", "sample.unknown-extension");
add("default", "no-extension");

await rm(out, { recursive: true, force: true });
let count = 0;
for (const [icon, files] of Object.entries(byIcon).sort()) {
  const dir = path.join(out, icon);
  await mkdir(dir, { recursive: true });
  for (const f of files.values()) {
    await writeFile(path.join(dir, f), "");
    count++;
  }
}
console.log(`Wrote ${count} files in ${Object.keys(byIcon).length} folders to test-files/`);
