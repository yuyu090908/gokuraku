#!/usr/bin/env node
// Static build: src/ + content/ + public/ + media/  ->  dist/
// No dependencies. Run: node tools/build.mjs
import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync, existsSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const SITE = 'https://gokuraku.tech';
const LANGS = ['ja', 'en', 'th'];
const LINE = 'https://lin.ee/s3uRTBS';
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const json = (p) => JSON.parse(read(p));
const fail = (msg) => { console.error('BUILD ERROR: ' + msg); process.exit(1); };

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const html = (s) => esc(s).replace(/&lt;br&gt;/g, '<br>');

// ---------- dictionaries ----------
const dicts = Object.fromEntries(LANGS.map((l) => [l, json(`content/i18n/${l}.json`)]));
for (const l of LANGS) {
  const missing = Object.keys(dicts.ja).filter((k) => !(k in dicts[l]));
  if (missing.length) fail(`${l}.json is missing keys: ${missing.join(', ')}`);
}

// ---------- data ----------
const products = json('content/products.json');
const steps = json('content/quality-steps.json').steps;
const campaigns = json('content/campaigns.json').campaigns;

// campaign validation (mirrors content/campaigns.schema.json)
const ENUM = {
  status: ['draft', 'scheduled', 'published', 'archived'],
  legal: ['not_started', 'in_review', 'approved', 'rejected'],
  cat: ['flower', 'preroll', 'goods', 'accessory', 'other'],
  benefit: ['price_discount', 'bundle_price', 'free_item', 'gift', 'info_only'],
};
const ids = new Set();
for (const c of campaigns) {
  const where = `campaign "${c.id}"`;
  for (const k of ['id', 'title', 'start', 'end', 'regions', 'product_categories', 'conditions', 'benefit', 'status', 'legal']) if (!(k in c)) fail(`${where}: missing ${k}`);
  if (!/^[a-z0-9][a-z0-9-]{2,63}$/.test(c.id)) fail(`${where}: bad id`);
  if (ids.has(c.id)) fail(`${where}: duplicate id`); ids.add(c.id);
  if (isNaN(Date.parse(c.start)) || isNaN(Date.parse(c.end)) || Date.parse(c.end) < Date.parse(c.start)) fail(`${where}: bad dates`);
  if (!ENUM.status.includes(c.status)) fail(`${where}: bad status`);
  if (!ENUM.legal.includes(c.legal?.status)) fail(`${where}: bad legal.status`);
  if (!c.product_categories.every((x) => ENUM.cat.includes(x))) fail(`${where}: bad product_categories`);
  if (!ENUM.benefit.includes(c.benefit?.type)) fail(`${where}: bad benefit.type`);
  if (!c.title.ja || !c.benefit.text?.ja || !c.conditions.ja) fail(`${where}: Japanese text is required`);
}
const now = Date.now();
// Only campaigns that are published AND legally approved AND not yet ended are shipped.
// Everything else never leaves the repository.
const publicCampaigns = campaigns
  .filter((c) => c.status === 'published' && c.legal.status === 'approved' && Date.parse(c.end) >= now)
  .map(({ id, title, start, end, regions, conditions, benefit, status, legal }) => ({ id, title, start, end, regions, conditions, benefit, status, legal: { status: legal.status } }));
const held = campaigns.filter((c) => !publicCampaigns.find((p) => p.id === c.id));
for (const c of held) console.log(`campaign held back (not public): ${c.id} [status=${c.status}, legal=${c.legal.status}]`);

// ---------- partials ----------
const pic = (base, w, h, alt, sizes, widths, eager = false) => {
  const set = (ext) => widths.map((x) => `/img/${base}-${x}.${ext} ${x}w`).join(', ');
  return `<picture><source type="image/avif" srcset="${set('avif')}" sizes="${sizes}"><source type="image/webp" srcset="${set('webp')}" sizes="${sizes}"><img src="/img/${base}-${widths[0]}.webp" width="${w}" height="${h}" alt="${esc(alt)}" ${eager ? '' : 'loading="lazy" '}decoding="async"></picture>`;
};
const PH_ICON = '<svg aria-hidden="true"><use href="#i-leaf"/></svg>';

function partials(L) {
  const T = (k) => { if (!(k in dicts[L])) fail(`missing key ${k}`); return dicts[L][k]; };
  const ti = (k) => `<span data-i="${k}">${esc(T(k))}</span>`;
  const strains = products.strains.map((s) => `
      <li class="strain" data-tags="${s.tags.join(' ')}">
        ${pic(s.image, 320, 240, `${s.name}`, '(min-width:1024px) 270px, 112px', [320, 640])}
        <div class="strain-b">
          <div class="strain-n"><h3>${esc(s.name)}</h3><span class="strain-type">${esc(s.type)}</span></div>
          <p class="strain-d" data-i="${s.desc}">${esc(T(s.desc))}</p>
          <dl class="prices">${s.prices.map(([u, p]) => `<div><dt data-i="${u}">${esc(T(u))}</dt><dd>${p.toLocaleString('en-US')} ${products.currency}</dd></div>`).join('')}</dl>
          <p class="strain-meta">${ti('menu.cult')} · ${ti('menu.finish')}</p>
          <a class="btn btn-red btn-sm" href="${LINE}" target="_blank" rel="noopener" data-name="${esc(s.name)}" data-ia="aria-label:menu.reserveAria" aria-label="${esc(T('menu.reserveAria').replace('{name}', s.name))}"><svg class="ic" aria-hidden="true"><use href="#i-line"/></svg>${ti('menu.reserve')}</a>
        </div>
      </li>`).join('') + `
      <li class="strain" data-tags="preroll">
        <div class="ph" aria-hidden="true"><svg><use href="#i-leaf"/></svg></div>
        <div class="strain-b">
          <div class="strain-n"><h3 data-i="${products.preroll.title}">${esc(T(products.preroll.title))}</h3><span class="strain-type">PRE-ROLL</span></div>
          <p class="strain-d" data-i="${products.preroll.desc}">${esc(T(products.preroll.desc))}</p>
          <dl class="prices"><div><dt data-i="s.unit.joint">${esc(T('s.unit.joint'))}</dt><dd>${products.preroll.price} ${products.currency}</dd></div></dl>
          <a class="btn btn-red btn-sm" href="${LINE}" target="_blank" rel="noopener" data-name="${esc(T(products.preroll.title))}" data-ia="aria-label:menu.reserveAria" aria-label="${esc(T('menu.reserveAria').replace('{name}', T(products.preroll.title)))}"><svg class="ic" aria-hidden="true"><use href="#i-line"/></svg>${ti('menu.reserve')}</a>
        </div>
      </li>`;

  const conf = steps.filter((s) => s.confirmed);
  const stepsHtml = conf.map((s, i) => `
      <li aria-roledescription="slide" aria-label="${i + 1} / ${conf.length}">
        ${s.photo ? pic(s.photo, 480, 640, T(s.title), '(min-width:700px) 340px, 90vw', [240, 480]) : `<div class="ph">${PH_ICON}${ti('photo.pending')}</div>`}
        <div class="sb"><span class="sn">STEP ${String(i + 1).padStart(2, '0')}</span><b data-i="${s.title}">${esc(T(s.title))}</b><span data-i="${s.desc}">${esc(T(s.desc))}</span></div>
      </li>`).join('');

  const faq = Array.from({ length: 11 }, (_, i) => i + 1).map((n) => `
        <details><summary><span data-i="faq.${n}.q">${esc(T(`faq.${n}.q`))}</span><svg class="ic" aria-hidden="true"><use href="#i-chev"/></svg></summary><p class="a" data-i="faq.${n}.a">${esc(T(`faq.${n}.a`))}</p></details>`).join('');

  const gal = ['hero-canopy', 'lights', 'daily-care', 'handcraft', 'harvest-color', 'macro'].map((v, i) => `
        <li><button type="button" data-video="/videos/${v}.mp4" data-poster="/img/${v}-480.webp" aria-label="${esc(T('gal.' + (i + 1)))}" data-ia="aria-label:gal.${i + 1}" aria-haspopup="dialog">
          ${pic(v, 240, 320, '', '(min-width:900px) 200px, 31vw', [240, 480])}<span class="play"><svg aria-hidden="true"><use href="#i-play"/></svg></span></button></li>`).join('');

  const photo = (name) => name === 'null'
    ? `<div class="ph">${PH_ICON}<span data-i="photo.pending">${esc(T('photo.pending'))}</span></div>`
    : pic(name, 240, 320, '', '84px', [240]);

  const path = (l) => (l === 'ja' ? '/' : `/${l}/`);
  const langopts = LANGS.map((l) => `<option value="${l}"${l === L ? ' selected' : ''}>${esc(dicts[l]._label)}</option>`).join('');
  const langlinks = LANGS.map((l) => `<a href="${path(l)}" hreflang="${l}" lang="${l}" data-lang="${l}"${l === L ? ' aria-current="page"' : ''}>${esc(dicts[l]._label)}</a>`).join('');
  const hreflang = LANGS.map((l) => `<link rel="alternate" hreflang="${l}" href="${SITE}${path(l)}">`).join('\n') + `\n<link rel="alternate" hreflang="x-default" href="${SITE}/">`;
  const oglocales = LANGS.filter((l) => l !== L).map((l) => `<meta property="og:locale:alternate" content="${dicts[l]._locale}">`).join('\n');
  const jsonld = JSON.stringify({
    '@context': 'https://schema.org', '@type': 'Organization', name: 'GOKURAKU', alternateName: ['極楽', 'Goku-Raku'],
    url: SITE + '/', logo: SITE + '/brand/icon-512.png', sameAs: ['https://www.instagram.com/gokuraku_thailand'],
  }).replace(/</g, '\\u003c');
  const campaignsHtml = `<div id="camp-slot" aria-live="polite"></div><script type="application/json" id="camp-data">${JSON.stringify(publicCampaigns).replace(/</g, '\\u003c')}</script>`;
  const gk = `<script>window.GK=${JSON.stringify({ langs: LANGS, ver: VER, str: Object.fromEntries(['faq.count', 'p.craft.stepOf', 'camp.label', 'camp.until'].map((k) => [k, T(k)])) }).replace(/</g, '\\u003c')}</script>`;

  return { strains, steps: stepsHtml, faq, gallery: gal, langopts, langlinks, langbtns: langlinks, hreflang, oglocales, jsonld, campaigns: campaignsHtml, soildiagram: SOIL_SVG, photo, gk, canonical: SITE + path(L), home: path(L) };
}

// Soil diagram: language-neutral numbered illustration; the numbered legend below it carries the words.
const SOIL_SVG = `<svg viewBox="0 0 640 300" role="img" aria-labelledby="dia-t"><title id="dia-t">Soil · microbes · plant</title>
<defs><linearGradient id="sg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a2c22"/><stop offset="1" stop-color="#1e1712"/></linearGradient></defs>
<rect x="0" y="0" width="640" height="300" rx="10" fill="#141414"/>
<rect x="0" y="120" width="640" height="180" fill="url(#sg)"/>
<path d="M0 120 Q80 108 160 120 T320 120 T480 120 T640 120 V134 H0z" fill="#6b5232"/>
<g fill="#8a6b3e"><ellipse cx="90" cy="118" rx="16" ry="5" transform="rotate(-12 90 118)"/><ellipse cx="200" cy="121" rx="14" ry="4" transform="rotate(10 200 121)"/><ellipse cx="470" cy="119" rx="15" ry="5" transform="rotate(-8 470 119)"/><ellipse cx="560" cy="121" rx="12" ry="4" transform="rotate(14 560 121)"/></g>
<path d="M320 120 V40" stroke="#6f9a55" stroke-width="5" stroke-linecap="round"/>
<path d="M320 70 C300 52 284 50 270 56 C286 70 302 72 320 70z M320 58 C340 40 358 38 372 44 C356 58 338 60 320 58z" fill="#7fae5f"/>
<g stroke="#d9c7a3" stroke-width="2.2" fill="none" stroke-linecap="round" opacity=".9"><path d="M320 122 C318 160 310 190 300 236"/><path d="M320 122 C324 170 338 200 352 250"/><path d="M316 150 C296 166 280 176 262 182"/><path d="M324 158 C344 170 362 176 384 178"/><path d="M306 200 C292 214 280 222 268 226"/><path d="M340 214 C356 226 368 232 382 234"/></g>
<path d="M120 196 c10 -10 24 -10 32 0 s20 10 30 0" stroke="#c98f86" stroke-width="7" fill="none" stroke-linecap="round"/>
<g fill="#C6AD79" opacity=".85"><circle cx="440" cy="196" r="3"/><circle cx="452" cy="206" r="2.4"/><circle cx="430" cy="212" r="2.2"/><circle cx="462" cy="190" r="2"/><circle cx="446" cy="222" r="2.6"/><circle cx="470" cy="214" r="2"/></g>
<g stroke="#C6AD79" stroke-width="1.4" fill="none" opacity=".7"><path d="M410 236 c14 -6 26 -2 34 6 s20 10 34 2"/><path d="M420 252 c10 -8 22 -8 30 0"/></g>
<g stroke="#C6AD79" stroke-width="1.6" fill="none" stroke-dasharray="4 5" opacity=".8"><path d="M150 132 C150 160 140 176 142 186"/><path d="M190 200 C260 196 380 196 420 204"/><path d="M430 236 C400 250 370 248 350 242"/></g>
<g font-family="system-ui,sans-serif" font-size="15" font-weight="700" text-anchor="middle">
<circle cx="200" cy="96" r="14" fill="#C6AD79"/><text x="200" y="101" fill="#111">1</text>
<circle cx="150" cy="236" r="14" fill="#C6AD79"/><text x="150" y="241" fill="#111">2</text>
<circle cx="500" cy="168" r="14" fill="#C6AD79"/><text x="500" y="173" fill="#111">3</text>
<circle cx="372" cy="270" r="14" fill="#C6AD79"/><text x="372" y="275" fill="#111">4</text>
</g></svg>`;

// ---------- assemble ----------
rmSync(DIST, { recursive: true, force: true });
mkdirSync(DIST, { recursive: true });

const js = read('src/app.js');
const css = read('src/app.css').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s*\n\s*/g, '').replace(/\s*([{};,>])\s*/g, '$1');
const VER = createHash('sha256').update(js + css + JSON.stringify(dicts)).digest('hex').slice(0, 10);
writeFileSync(join(DIST, 'app.js'), js);

const tpl = read('src/index.html');
const fullLogoW = 223; // public/brand/logo-full-reverse-240.png width (height 240)

for (const L of LANGS) {
  const P = partials(L);
  let out = tpl
    .replace('<script src="/app.js', P.gk + '\n<script src="/app.js')
    .replace(/<!--@photo:([\w-]+)-->/g, (_, n) => P.photo(n))
    .replace(/<!--@(\w+)-->/g, (_, k) => (k === 'css' ? css : k in P ? P[k] : fail(`unknown partial ${k}`)))
    .replace(/\{\{\{([\w.]+)\}\}\}/g, (_, k) => (k in dicts[L] ? html(dicts[L][k]) : fail(`missing key ${k}`)))
    .replace(/\{\{@(\w+)\}\}/g, (_, k) => (k === 'ver' ? VER : k === 'fullw240' ? fullLogoW : esc(P[k] ?? fail(`unknown var ${k}`))))
    .replace(/\{\{([\w.]+)\}\}/g, (_, k) => (k in dicts[L] ? esc(dicts[L][k]) : fail(`missing key ${k}`)));
  if (/\{\{|<!--@/.test(out)) fail('unresolved placeholder in ' + L);
  const dir = L === 'ja' ? DIST : join(DIST, L);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'index.html'), out);
}

// dictionaries for in-place language switching
mkdirSync(join(DIST, 'i18n'), { recursive: true });
for (const L of LANGS) writeFileSync(join(DIST, 'i18n', `${L}.json`), JSON.stringify(dicts[L]));

// static files
cpSync(join(ROOT, 'public'), DIST, { recursive: true, filter: (src) => !src.includes('-master.') });
mkdirSync(join(DIST, 'videos'), { recursive: true });
for (const f of readdirSync(join(ROOT, 'media/videos')).filter((f) => f.endsWith('.mp4'))) cpSync(join(ROOT, 'media/videos', f), join(DIST, 'videos', f));
cpSync(join(ROOT, 'media/images/og.jpg'), join(DIST, 'img/og.jpg'));

writeFileSync(join(DIST, 'manifest.webmanifest'), JSON.stringify({
  name: 'GOKURAKU 極楽', short_name: 'GOKURAKU', start_url: '/', scope: '/', display: 'standalone',
  background_color: '#101010', theme_color: '#101010', lang: 'ja',
  icons: [
    { src: '/brand/icon-192.png', sizes: '192x192', type: 'image/png' },
    { src: '/brand/icon-512.png', sizes: '512x512', type: 'image/png' },
    { src: '/brand/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
}, null, 2));
writeFileSync(join(DIST, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n`);
const alts = LANGS.map((l) => `    <xhtml:link rel="alternate" hreflang="${l}" href="${SITE}${l === 'ja' ? '/' : `/${l}/`}"/>`).join('\n');
writeFileSync(join(DIST, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${LANGS.map((l) => `  <url>\n    <loc>${SITE}${l === 'ja' ? '/' : `/${l}/`}</loc>\n${alts}\n    <xhtml:link rel="alternate" hreflang="x-default" href="${SITE}/"/>\n  </url>`).join('\n')}
</urlset>
`);
console.log(`built ${LANGS.length} pages → dist/ (v${VER}); public campaigns: ${publicCampaigns.length}`);
