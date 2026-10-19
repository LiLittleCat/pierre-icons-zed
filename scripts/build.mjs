// Generates a Zed icon theme from Pierre's icons, in three layers (earlier wins):
//
//   1. @pierre/trees "complete" set: the set Claude Desktop's file tree uses
//   2. Claude Desktop's changes on top of it (text-style markdown, pdf/word/slides)
//   3. @pierre/vscode-icons: every mapping and icon the first two don't cover,
//      plus extra mappings for its icons that nothing else uses
//
// Writes icons/, icon_themes/pierre-icons.json and preview.html.

import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const trees = path.join(root, "node_modules/@pierre/trees/dist");
const vscode = path.join(root, "node_modules/@pierre/vscode-icons");
const vscodeSvgs = path.join(vscode, "svgs");

/** token -> { viewBox, body, color?, source } ; color is {light,dark} or {fg:{..},bg:{..}} */
const icons = {};
/** extension / file name -> token */
const fileSuffixes = {};
const fileNames = {};

// Add a mapping only if no earlier layer claimed it (file names compare case-insensitively).
const claimSuffix = (ext, token) => (fileSuffixes[ext] ??= token);
const claimedNames = new Set();
const claimName = (name, token) => {
  if (claimedNames.has(name.toLowerCase())) return;
  claimedNames.add(name.toLowerCase());
  fileNames[name] = token;
};

// ===========================================================================
// Layer 1: @pierre/trees
// ===========================================================================

// Its data lives in module-private consts, so evaluate the file.
const iconsJs = (await readFile(path.join(trees, "builtInIcons.js"), "utf8"))
  .replace(/^export \{[^}]*\};?/m, "")
  .replace(/^\/\/# sourceMappingURL=.*$/m, "");
const constNames = [...iconsJs.matchAll(/^const ([A-Za-z_]+) =/gm)].map((m) => m[1]);
const T = new Function(`${iconsJs}\n;return {${constNames.join(",")}};`)();

// Colours: --trees-file-icon-color-<token> -> --trees-icon-<hue> -> light-dark(light, dark)
const css = await readFile(path.join(trees, "style.js"), "utf8");
const hues = {};
for (const m of css.matchAll(/--trees-icon-([a-z]+):\s*light-dark\((#[0-9a-f]+),\s*(#[0-9a-f]+)\)/gi)) {
  hues[m[1]] = { light: m[2], dark: m[3] };
}
const treeColors = {};
for (const m of css.matchAll(/--trees-file-icon-color-([a-z0-9]+):[^;]*?var\(--trees-icon-([a-z]+)\)/gi)) {
  treeColors[m[1]] = hues[m[2]];
}
const gray = hues.gray;

const treeSymbols = {};
for (const m of T.BUILT_IN_SVG_SPRITE_SHEETS.complete.matchAll(
  /<symbol id="file-tree-(?:builtin|icon)-([^"]+)" viewBox="([^"]+)">([\s\S]*?)<\/symbol>/g,
)) {
  treeSymbols[m[1]] = { viewBox: m[2], body: m[3].trim() };
}
for (const [token, s] of Object.entries(treeSymbols)) {
  icons[token] = { ...s, color: treeColors[token], source: "trees" };
}

// ===========================================================================
// Layer 2: Claude Desktop's changes to @pierre/trees
// ===========================================================================

const DOC_BG = treeSymbols.default.body.match(/<path[^>]*class="bg"[^>]*\/>/)[0];
const DOC_FOLD = treeSymbols.default.body.match(/<path[^>]*class="fg"[^>]*\/>/)[0];
const SLIDE_FRAME =
  '<path fill="currentColor" fill-rule="evenodd" d="M4.5 8h7a.5.5 0 0 1 .5.5v4a.5.5 0 0 1-.5.5h-7a.5.5 0 0 1-.5-.5v-4a.5.5 0 0 1 .5-.5M5 9v3h6V9z"/>';

const claude = {
  markdown: { body: treeSymbols.text.body, color: treeColors.markdown },
  pdf: { body: treeSymbols.text.body, color: hues.red },
  word: { body: treeSymbols.text.body, color: hues.blue },
  slides: { body: DOC_BG + DOC_FOLD + SLIDE_FRAME, color: hues.orange },
};
for (const [token, { body, color }] of Object.entries(claude)) {
  icons[token] = { viewBox: "0 0 16 16", body, color, source: "claude" };
}

// Mappings: Claude's additions and its one removal (next.config.* has no icon there,
// but we keep @pierre/trees' Next.js mapping since it's more complete).
for (const [ext, token] of Object.entries({ ...T.BUILT_IN_FILE_EXTENSION_TOKENS, ...T.COMPLETE_EXTENSION_OVERRIDES })) {
  claimSuffix(ext, token);
}
for (const [name, token] of Object.entries(T.BUILT_IN_FILE_NAME_TOKENS)) claimName(name, token);
const claudeSuffixes = {
  pdf: "pdf",
  ...Object.fromEntries(["doc", "docx", "docm", "dotx", "dotm", "odt"].map((e) => [e, "word"])),
  ...Object.fromEntries(["ppt", "pptx", "pptm", "pps", "ppsx", "ppsm", "potx", "potm", "odp"].map((e) => [e, "slides"])),
  ...Object.fromEntries(["xlsm", "xlsb", "xltx", "xltm"].map((e) => [e, "table"])),
};
for (const [ext, token] of Object.entries(claudeSuffixes)) claimSuffix(ext, token);

// ===========================================================================
// Layer 3: @pierre/vscode-icons
// ===========================================================================

const load = async (rel) => (await import(pathToFileURL(path.join(vscode, rel)).href)).default;
const { color: vsColor, palette } = await import(pathToFileURL(path.join(vscode, "scripts/palette.mjs")).href);
const vsTiers = [
  ...(await load("scripts/themes/minimal.mjs")),
  ...(await load("scripts/themes/default.mjs")),
  ...(await load("scripts/themes/complete.mjs")),
];
// Later entries in Pierre's tiers override earlier ones; keep the last definition per icon.
const vsIcons = new Map();
for (const i of vsTiers) vsIcons.set(i.name, { ...vsIcons.get(i.name), ...i });

// Extra mappings for vscode-icons SVGs that Pierre doesn't assign to any file type.
const g = palette.gray;
vsIcons.set("IconLayers3Middle", {
  name: "IconLayers3Middle",
  color: vsColor(palette.purple),
  fileExtensions: ["psd", "psb", "ai", "fig", "sketch", "xd", "afdesign", "afphoto", "kra", "xcf"],
});
vsIcons.set("rss", { name: "rss", color: vsColor(palette.orange), fileExtensions: ["rss", "atom"] });
vsIcons.set("gear", {
  name: "gear",
  color: vsColor(g),
  fileExtensions: ["toml", "properties", "prefs", "plist", "lock"],
  fileNames: ["Makefile", "makefile", "CMakeLists.txt", ".nvmrc", ".node-version", ".tool-versions"],
});
vsIcons.set("code-block-duo", {
  name: "code-block-duo",
  color: vsColor(g),
  fileExtensions: ["xml", "xsd", "xsl", "xslt", "dtd", "proto", "graphqls", "prisma", "hbs", "njk", "liquid", "ejs", "pug", "twig"],
});
vsIcons.set("code", {
  name: "code",
  color: vsColor(g),
  fileExtensions: [
    "java", "kt", "kts", "scala", "sc", "groovy", "gradle", "php", "lua", "pl", "pm", "r", "dart",
    "ex", "exs", "erl", "hrl", "hs", "lhs", "clj", "cljs", "cljc", "edn", "ml", "mli", "fs", "fsi", "fsx",
    "jl", "nim", "cr", "sol", "elm", "vb", "ps1", "psm1", "bat", "cmd", "asm", "s", "f90", "f", "pas",
    "d", "v", "sv", "vhd", "tcl", "coffee", "hx", "rkt", "lisp", "el", "vim", "nix", "odin", "gleam", "mojo",
  ],
});
vsIcons.set("extension", { name: "extension", color: vsColor(palette.blue), fileExtensions: ["vsix", "crx", "xpi"] });
vsIcons.set("server-duo", {
  name: "server-duo",
  ...vsIcons.get("server-duo"),
  fileExtensions: [...(vsIcons.get("server-duo")?.fileExtensions ?? []), "http", "rest"],
  fileNames: ["Procfile", ".htaccess", "nginx.conf"],
});

const parseSvg = async (file) => {
  const raw = await readFile(path.join(vscodeSvgs, `${file}.svg`), "utf8");
  return {
    viewBox: raw.match(/viewBox="([^"]+)"/)[1],
    body: raw.replace(/^[\s\S]*?<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "").trim(),
  };
};

for (const i of vsIcons.values()) {
  const exts = (i.fileExtensions ?? []).filter((e) => !(e in fileSuffixes));
  const names = (i.fileNames ?? []).filter((n) => !claimedNames.has(n.toLowerCase()));
  if (!exts.length && !names.length) continue;
  // @pierre/trees draws some icons it never maps (e.g. npm): prefer its drawing.
  let token = i.name;
  if (!(icons[token]?.source === "trees")) {
    if (icons[token]) token = `vs-${token}`;
    icons[token] = { ...(await parseSvg(i.svgName ?? i.name)), color: i.color, opacity: i.opacity, source: "vscode-icons" };
  }
  for (const e of exts) claimSuffix(e, token);
  for (const n of names) claimName(n, token);
}

// ===========================================================================
// Zed file names (case-sensitive)
// ===========================================================================

const fileStems = {};
for (const [name, token] of Object.entries(fileNames)) {
  fileStems[name] = token;
  // dockerfile -> Dockerfile, gemfile -> Gemfile
  if (/^[a-z]+$/.test(name)) fileStems[name[0].toUpperCase() + name.slice(1)] = token;
  // readme.md -> README.md, claude.md -> CLAUDE.md
  if (/^[a-z]+\.md$/.test(name)) fileStems[name.slice(0, -3).toUpperCase() + ".md"] = token;
}

// Extensions are case-sensitive too: photo.JPG doesn't match "jpg". Add upper-case
// variants (JPG, PNG, MD, ...) without overriding any explicit mapping.
for (const [ext, token] of Object.entries(fileSuffixes)) {
  const upper = ext.toUpperCase();
  if (upper !== ext) fileSuffixes[upper] ??= token;
}

// ===========================================================================
// Output
// ===========================================================================

const outIcons = path.join(root, "icons");
const outThemes = path.join(root, "icon_themes");
await rm(outIcons, { recursive: true, force: true });
await mkdir(outIcons, { recursive: true });
await mkdir(outThemes, { recursive: true });

/** Paint currentColor: class="bg" elements get the duo background colour, the rest fg. */
function paint({ viewBox, body, opacity }, color, mode) {
  const fg = color?.fg?.[mode] ?? color?.[mode] ?? gray[mode];
  const bg = color?.bg?.[mode];
  const painted = body.replace(/<[^>]+>/g, (tag) =>
    tag.replace(/currentcolor/gi, bg && /class="bg"/.test(tag) ? bg : fg),
  );
  const op = opacity && opacity !== 1 ? ` opacity="${opacity}"` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="${viewBox}"${op}>\n  ${painted}\n</svg>\n`;
}

const usedTokens = new Set(["default", ...Object.values(fileSuffixes), ...Object.values(fileStems)]);
const missing = [...usedTokens].filter((t) => !icons[t]);
if (missing.length) throw new Error(`No icon for tokens: ${missing.join(", ")}`);

async function buildTheme(name, mode, colored) {
  const file_icons = {};
  for (const token of [...usedTokens].sort()) {
    const file = `${token}-${colored ? "color" : "mono"}-${mode}.svg`;
    await writeFile(path.join(outIcons, file), paint(icons[token], colored ? icons[token].color : null, mode));
    file_icons[token] = { path: `./icons/${file}` };
  }

  const write = async (out, svg) => (await writeFile(path.join(outIcons, out), svg), `./icons/${out}`);
  const folder = async (src, out) => write(out, paint(await parseSvg(src), null, mode));
  const chevron = (out, rotate) => {
    const { viewBox, body } = treeSymbols.chevron;
    return write(out, paint({ viewBox, body: rotate ? `<g transform="rotate(-90 8 8)">${body}</g>` : body }, null, mode));
  };

  return {
    name,
    appearance: mode,
    directory_icons: {
      collapsed: await folder("folder-duo", `folder-${mode}.svg`),
      expanded: await folder("folder-open-duo", `folder-open-${mode}.svg`),
    },
    chevron_icons: {
      collapsed: await chevron(`chevron-right-${mode}.svg`, true),
      expanded: await chevron(`chevron-down-${mode}.svg`, false),
    },
    file_stems: fileStems,
    file_suffixes: fileSuffixes,
    file_icons,
  };
}

const family = {
  $schema: "https://zed.dev/schema/icon_themes/v0.3.0.json",
  name: "Pierre Icons",
  author: "The Pierre Computer Company (ported to Zed)",
  themes: [
    await buildTheme("Pierre Dark", "dark", true),
    await buildTheme("Pierre Light", "light", true),
    await buildTheme("Pierre Mono Dark", "dark", false),
    await buildTheme("Pierre Mono Light", "light", false),
  ],
};

await writeFile(path.join(outThemes, "pierre-icons.json"), JSON.stringify(family, null, 2) + "\n");

const bySource = {};
for (const t of usedTokens) (bySource[icons[t].source] ??= []).push(t);
console.log(
  `Wrote ${family.themes.length} themes: ${usedTokens.size} icons ` +
    `(${Object.entries(bySource).map(([s, l]) => `${s} ${l.length}`).join(", ")}), ` +
    `${Object.keys(fileSuffixes).length} suffixes, ${Object.keys(fileStems).length} file names`,
);

// ===========================================================================
// Previews
//   preview.html         every icon, grid per theme
//   preview-detail.html  one line per icon: what files it represents
// ===========================================================================

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
const BASE_CSS = `body{font:12px/1.4 system-ui,sans-serif;margin:0}section{padding:12px 16px}h2{font-size:13px;margin:0 0 8px}h2 small{font-weight:400;opacity:.6}img{width:16px;height:16px;flex:none}.dark{background:#16181d;color:#ddd}.light{background:#fff;color:#222}`;

const sourceLabel = { trees: "@pierre/trees", claude: "Claude Desktop", "vscode-icons": "@pierre/vscode-icons" };
const grid = (rows) =>
  `<div class="g">${rows.map(([k, p]) => `<div class="i"><img src="${p}">${esc(k)}</div>`).join("")}</div>`;

const overview = family.themes.map((t) => {
  const mode = t.appearance;
  const rows = [
    ["folder", t.directory_icons.collapsed],
    ["folder-open", t.directory_icons.expanded],
    ["chevron-right", t.chevron_icons.collapsed],
    ["chevron-down", t.chevron_icons.expanded],
    ...Object.entries(t.file_icons).map(([k, v]) => [k, v.path]),
  ];
  return `<section class="${mode}"><h2>${esc(t.name)} <small>${rows.length} icons</small></h2>${grid(rows)}</section>`;
});
await writeFile(
  path.join(root, "preview.html"),
  `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Pierre Icons preview</title><style>${BASE_CSS}.g{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:4px 12px}.i{display:flex;gap:6px;align-items:center;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}</style>${overview.join("\n")}\n`,
);

// Detail: what each icon represents, one line per icon, in all four theme styles.
const matches = {};
for (const [ext, token] of Object.entries(fileSuffixes)) (matches[token] ??= []).push(`.${ext}`);
for (const [name, token] of Object.entries(fileStems)) (matches[token] ??= []).push(name);

const pick = {
  folder: (t) => t.directory_icons.collapsed,
  "folder-open": (t) => t.directory_icons.expanded,
  "chevron-right": (t) => t.chevron_icons.collapsed,
  "chevron-down": (t) => t.chevron_icons.expanded,
};
const fixed = {
  folder: ["@pierre/vscode-icons", "Closed directories"],
  "folder-open": ["@pierre/vscode-icons", "Open directories"],
  "chevron-right": ["@pierre/trees", "Collapsed directory arrow"],
  "chevron-down": ["@pierre/trees", "Expanded directory arrow"],
};
const tokens = [...Object.keys(fixed), ...Object.keys(family.themes[0].file_icons)];
const cells = (k) =>
  family.themes
    .map((t) => `<td class="ic ${t.appearance}"><img src="${pick[k] ? pick[k](t) : t.file_icons[k].path}"></td>`)
    .join("");
const lines = tokens
  .map((k) => {
    const [src, what] = fixed[k] ?? [
      sourceLabel[icons[k].source],
      k === "default" ? "Any file nothing else matches" : (matches[k] ?? []).join("  "),
    ];
    return `<tr>${cells(k)}<td class="n">${esc(k)}</td><td class="s">${esc(src)}</td><td class="w">${esc(what)}</td></tr>`;
  })
  .join("\n");
const head = family.themes.map((t) => `<th class="ic ${t.appearance}">${esc(t.name.replace("Pierre ", ""))}</th>`).join("");
await writeFile(
  path.join(root, "preview-detail.html"),
  `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Pierre Icons detail</title>
<style>${BASE_CSS}
body{background:#fff;color:#222}
h1{font-size:15px;margin:16px 16px 4px}p{margin:0 16px 12px;opacity:.7}
table{border-collapse:collapse;width:100%}
th{font-size:10px;font-weight:500;text-align:left;padding:4px 10px;position:sticky;top:0;background:inherit}
thead tr{background:#f3f3f4}
td{padding:5px 10px;border-top:1px solid #8883;vertical-align:top}
.ic{white-space:nowrap;text-align:center;width:1%}
th.dark,td.dark{background:#16181d;color:#ddd}th.light,td.light{background:#fff;color:#222}
.n{font-weight:600;white-space:nowrap}.s{white-space:nowrap;opacity:.6}
.w{font-family:ui-monospace,Menlo,monospace;font-size:11px;word-break:break-word}
@media (prefers-color-scheme:dark){body{background:#16181d;color:#ddd}thead tr{background:#22252b}}
</style>
<h1>Pierre Icons: what each icon is for</h1>
<p>${tokens.length} icons, shown in all four theme styles.</p>
<table><thead><tr>${head}<th>Icon</th><th>Source</th><th>Files</th></tr></thead><tbody>
${lines}
</tbody></table>
`,
);
console.log("Wrote preview.html and preview-detail.html");
