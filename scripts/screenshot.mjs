// Renders README screenshots of the icon themes with headless Chrome:
//   docs/preview.png       Pierre Dark + Pierre Light
//   docs/preview-mono.png  Pierre Mono Dark + Pierre Mono Light
// Run `pnpm build` first.

import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const chrome =
  process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const { themes } = JSON.parse(await readFile(path.join(root, "icon_themes/pierre-icons.json"), "utf8"));

const WIDTH = 960, COLS = 6, ROW = 24, HEAD = 34, PAD = 18;
const esc = (s) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

function page(pair) {
  let height = 0;
  const sections = pair.map((t) => {
    const rows = [
      ["folder", t.directory_icons.collapsed],
      ["folder-open", t.directory_icons.expanded],
      ...Object.entries(t.file_icons)
        .map(([k, v]) => [k, v.path])
        .sort(([a], [b]) => a.localeCompare(b)),
    ];
    const h = PAD * 2 + HEAD + Math.ceil(rows.length / COLS) * ROW;
    height += h;
    const dark = t.appearance === "dark";
    const items = rows
      .map(([k, p]) => `<div class="i"><img src="file://${path.join(root, p)}">${esc(k)}</div>`)
      .join("");
    return `<section style="height:${h}px;background:${dark ? "#16181d" : "#fff"};color:${dark ? "#ddd" : "#222"}"><h2>${esc(t.name)}</h2><div class="g">${items}</div></section>`;
  });
  const css = `*{box-sizing:border-box}body{margin:0;width:${WIDTH}px;font:13px system-ui,-apple-system,sans-serif}section{padding:${PAD}px 22px;overflow:hidden}h2{font-size:14px;margin:0;height:${HEAD}px;font-weight:600}.g{display:grid;grid-template-columns:repeat(${COLS},1fr);grid-auto-rows:${ROW}px;column-gap:12px}.i{display:flex;gap:8px;align-items:center;white-space:nowrap;overflow:hidden}img{width:16px;height:16px}`;
  return { html: `<!doctype html><meta charset="utf-8"><style>${css}</style>${sections.join("")}`, height };
}

const tmp = await mkdtemp(path.join(tmpdir(), "pierre-shot-"));
try {
  const shots = {
    "preview.png": themes.filter((t) => !t.name.includes("Mono")),
    "preview-mono.png": themes.filter((t) => t.name.includes("Mono")),
  };
  for (const [file, pair] of Object.entries(shots)) {
    const { html, height } = page(pair);
    const htmlPath = path.join(tmp, `${file}.html`);
    await writeFile(htmlPath, html);
    execFileSync(chrome, [
      "--headless=new",
      "--disable-gpu",
      "--hide-scrollbars",
      "--allow-file-access-from-files",
      "--force-device-scale-factor=2",
      `--window-size=${WIDTH},${height}`,
      `--user-data-dir=${path.join(tmp, "profile")}`,
      `--screenshot=${path.join(root, "docs", file)}`,
      `file://${htmlPath}`,
    ], { stdio: "ignore" });
    console.log(`Wrote docs/${file}`);
  }
} finally {
  await rm(tmp, { recursive: true, force: true });
}
