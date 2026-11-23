#!/usr/bin/env node
// Checks the built site in dist/ (run `node tools/build.mjs` first). No dependencies.
// - app.js parses
// - every page: no unresolved placeholders, unique ids, <img> has alt, one <h1>, lang + canonical set
// - every internal link points at a built page and, if it has #hash, at an id on that page
// - every language dictionary has exactly the keys of ja.json
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const errors = [];
const err = (m) => errors.push(m);
if (!existsSync(DIST)) { console.error('dist/ not found. Run: node tools/build.mjs'); process.exit(1); }

try { execFileSync(process.execPath, ['--check', join(ROOT, 'src/app.js')], { stdio: 'pipe' }); } catch (e) { err('src/app.js: ' + e.stderr); }

const ja = JSON.parse(readFileSync(join(ROOT, 'content/i18n/ja.json'), 'utf8'));
for (const f of readdirSync(join(ROOT, 'content/i18n'))) {
  const d = JSON.parse(readFileSync(join(ROOT, 'content/i18n', f), 'utf8'));
  const miss = Object.keys(ja).filter((k) => !(k in d)), extra = Object.keys(d).filter((k) => !(k in ja));
  if (miss.length) err(`${f}: missing ${miss.join(', ')}`);
  if (extra.length) err(`${f}: extra ${extra.join(', ')}`);
}

const pages = [];
(function walk(dir) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p); else if (f === 'index.html') pages.push(p);
  }
})(DIST);
const urlOf = (p) => '/' + p.slice(DIST.length + 1).replace(/index\.html$/, '');
const idsByUrl = {};
const docs = pages.map((p) => ({ url: urlOf(p), html: readFileSync(p, 'utf8') }));
for (const { url, html } of docs) {
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
  const dup = ids.filter((x, i) => ids.indexOf(x) !== i);
  if (dup.length) err(`${url}: duplicate ids ${[...new Set(dup)].join(', ')}`);
  idsByUrl[url] = new Set(ids);
  if (/\{\{|<!--@/.test(html)) err(`${url}: unresolved placeholder`);
  for (const m of html.matchAll(/<img\b[^>]*>/g)) if (!/\salt="/.test(m[0])) err(`${url}: img without alt ${m[0].slice(0, 80)}`);
  const h1 = (html.match(/<h1\b/g) || []).length;
  if (h1 !== 1) err(`${url}: ${h1} <h1>`);
  if (!/<html lang="[a-zA-Z-]+"/.test(html)) err(`${url}: missing html lang`);
  if (!/<link rel="canonical" href="https:\/\/gokuraku\.tech\//.test(html)) err(`${url}: missing canonical`);
}
for (const { url, html } of docs) {
  for (const m of html.matchAll(/<a\b[^>]*\shref="([^"]+)"/g)) {
    const href = m[1];
    if (/^(https?:|mailto:|tel:)/.test(href)) continue;
    const [path, hash] = href.split('#');
    const target = path === '' ? url : path;
    if (!(target in idsByUrl)) { err(`${url}: link to missing page ${href}`); continue; }
    if (hash && !idsByUrl[target].has(hash)) err(`${url}: link to missing anchor ${href}`);
  }
}
if (errors.length) { console.error(errors.join('\n')); console.error(`\n${errors.length} problem(s)`); process.exit(1); }
console.log(`check ok: ${docs.length} pages, ${Object.keys(ja).length} keys × ${readdirSync(join(ROOT, 'content/i18n')).length} languages`);
