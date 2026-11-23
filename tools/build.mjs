#!/usr/bin/env node
// Static build: src/ + content/ + public/ + media/  ->  dist/
// No dependencies. Run: node tools/build.mjs
//
// Pages (src/pages/*.html) are wrapped in src/layout.html and written once per language:
//   ja -> /, /living-soil/, /quality/      other languages -> /{lang}/, /{lang}/living-soil/, /{lang}/quality/
import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const SITE = 'https://gokuraku.tech';
const LANGS = ['ja', 'en', 'th', 'zh', 'ko', 'es', 'pt', 'ru', 'vi', 'my'];
const HTML_LANG = { zh: 'zh-Hans' };
const LINE = 'https://lin.ee/s3uRTBS';
const PAGES = [
  { id: 'home', path: '', file: 'home', meta: 'meta.home' },
  { id: 'living-soil', path: 'living-soil/', file: 'living-soil', meta: 'meta.soil' },
  { id: 'quality', path: 'quality/', file: 'quality', meta: 'meta.quality' },
];

const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const json = (p) => JSON.parse(read(p));
const fail = (msg) => { console.error('BUILD ERROR: ' + msg); process.exit(1); };
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const html = (s) => esc(s).replace(/&lt;br&gt;/g, '<br>');
const jsonScript = (v) => JSON.stringify(v).replace(/</g, '\\u003c');
const base = (l) => (l === 'ja' ? '/' : `/${l}/`);
const hl = (l) => HTML_LANG[l] || l;

// ---------- dictionaries (ja is the source; every other language must have every key) ----------
const dicts = Object.fromEntries(LANGS.map((l) => [l, json(`content/i18n/${l}.json`)]));
for (const l of LANGS) {
  const missing = Object.keys(dicts.ja).filter((k) => !(k in dicts[l]));
  if (missing.length) fail(`${l}.json is missing keys: ${missing.join(', ')}`);
  const extra = Object.keys(dicts[l]).filter((k) => !(k in dicts.ja));
  if (extra.length) console.warn(`warning: ${l}.json has keys not in ja.json: ${extra.join(', ')}`);
  for (const [k, v] of Object.entries(dicts[l])) if (typeof v !== 'string' || (!v.trim() && !k.startsWith('_'))) fail(`${l}.json: empty value for ${k}`);
}

// ---------- data ----------
const products = json('content/products.json');
const steps = json('content/quality-steps.json').steps;
const claims = json('content/claims.json').claims;
const campaigns = json('content/campaigns.json').campaigns;

// campaign validation (mirrors content/campaigns.schema.json)
const ENUM = {
  status: ['draft', 'scheduled', 'published', 'archived'],
  legal: ['not_started', 'in_review', 'approved', 'rejected'],
  cat: ['flower', 'preroll', 'goods', 'accessory', 'other'],
  benefit: ['price_discount', 'bundle_price', 'free_item', 'gift', 'info_only'],
};
const ids = new Set();
const i18nOk = (o) => o && typeof o.ja === 'string' && Object.keys(o).every((k) => LANGS.includes(k));
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
  if (!i18nOk(c.title) || !i18nOk(c.conditions) || !i18nOk(c.benefit.text)) fail(`${where}: text needs ja and only known languages`);
}
const now = Date.now();
// Only campaigns that are published AND legally approved AND not yet ended are shipped.
// Everything else never leaves the repository.
const publicCampaigns = campaigns
  .filter((c) => c.status === 'published' && c.legal.status === 'approved' && Date.parse(c.end) >= now)
  .map(({ id, title, start, end, regions, conditions, benefit, status, legal }) => ({ id, title, start, end, regions, conditions, benefit, status, legal: { status: legal.status } }));
for (const c of campaigns.filter((c) => !publicCampaigns.find((p) => p.id === c.id))) console.log(`campaign held back (not public): ${c.id} [status=${c.status}, legal=${c.legal.status}]`);

for (const s of steps) for (const k of ['k', 'title', 'desc', 'more']) if (!(s[k] in dicts.ja)) fail(`quality step ${s.id}: unknown key ${s[k]}`);
for (const c of claims) if (c.status !== 'hidden' && (!(c.label in dicts.ja) || !(c.evidence in dicts.ja))) fail(`claim ${c.id}: unknown key`);
for (const c of claims) if (!['verified', 'self_declared', 'hidden'].includes(c.status)) fail(`claim ${c.id}: bad status`);

// ---------- assets ----------
const js = read('src/app.js');
const css = (read('src/fonts.css') + read('src/app.css')).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s*\n\s*/g, '').replace(/\s*([{};,>])\s*/g, '$1');
const sprite = read('src/partials/sprite.html').trim();
const layout = read('src/layout.html');
const VER = createHash('sha256').update(js + css + JSON.stringify(dicts)).digest('hex').slice(0, 10);

// ---------- partials ----------
const pic = (name, w, h, alt, altKey, sizes, widths, eager = false) => {
  const set = (ext) => widths.map((x) => `/img/${name}-${x}.${ext} ${x}w`).join(', ');
  return `<picture><source type="image/avif" srcset="${set('avif')}" sizes="${sizes}"><source type="image/webp" srcset="${set('webp')}" sizes="${sizes}"><img src="/img/${name}-${widths[widths.length - 1]}.webp" width="${w}" height="${h}" alt="${esc(alt)}"${altKey ? ` data-ia="alt:${altKey}"` : ''} ${eager ? '' : 'loading="lazy" '}decoding="async"></picture>`;
};

const DASH = [
  { sec: 'about', icon: 'i-brand', key: 'nav.brand', home: '#about', sub: '#about' },
  { sec: 'soil', icon: 'i-soil', key: 'nav.soil', home: '#soil', sub: 'living-soil/', page: 'living-soil' },
  { sec: 'craftsmanship', icon: 'i-hand', key: 'nav.craft', home: '#craftsmanship', sub: '#craftsmanship' },
  { sec: 'quality', icon: 'i-quality', key: 'nav.quality', home: 'quality/', sub: 'quality/', page: 'quality' },
  { sec: 'contact', icon: 'i-mail', key: 'nav.contact', home: '#contact', sub: '#contact' },
];

function partials(L, page) {
  const D = dicts[L];
  const T = (k) => (k in D ? D[k] : fail(`missing key ${k}`));
  const ti = (k) => `<span data-i="${k}">${esc(T(k))}</span>`;
  const home = base(L);
  const url = (l, p = page) => base(l) + p.path;

  const reserve = (name, nameKey) => `<a class="btn btn-primary" href="${LINE}" target="_blank" rel="noopener" data-name="${esc(name)}"${nameKey ? ` data-name-key="${nameKey}"` : ''} data-ia="aria-label:menu.reserveAria" aria-label="${esc(T('menu.reserveAria').replace('{name}', name))}"><svg class="ic" aria-hidden="true"><use href="#i-line"/></svg>${ti('menu.reserve')}</a>`;
  const strains = products.strains.map((s) => `
      <li class="strain" data-tags="${s.tags.join(' ')}">
        ${pic(s.image, 320, 240, s.name, null, '(min-width:1100px) 270px, 112px', [320, 640])}
        <div class="strain-b">
          <div class="strain-n"><h3>${esc(s.name)}</h3><span class="strain-type">${esc(s.type)}</span></div>
          <p class="strain-d" data-i="${s.desc}">${esc(T(s.desc))}</p>
          <dl class="prices">${s.prices.map(([u, p]) => `<div><dt data-i="${u}">${esc(T(u))}</dt><dd>${p.toLocaleString('en-US')} ${products.currency}</dd></div>`).join('')}</dl>
          <p class="strain-meta">${ti('menu.cult')} · ${ti('menu.finish')}</p>
          ${reserve(s.name)}
        </div>
      </li>`).join('') + `
      <li class="strain" data-tags="preroll">
        <div class="ph" aria-hidden="true"><svg><use href="#i-leaf"/></svg></div>
        <div class="strain-b">
          <div class="strain-n"><h3 data-i="${products.preroll.title}">${esc(T(products.preroll.title))}</h3><span class="strain-type">PRE-ROLL</span></div>
          <p class="strain-d" data-i="${products.preroll.desc}">${esc(T(products.preroll.desc))}</p>
          <dl class="prices"><div><dt data-i="s.unit.joint">${esc(T('s.unit.joint'))}</dt><dd>${products.preroll.price} ${products.currency}</dd></div></dl>
          ${reserve(T(products.preroll.title), products.preroll.title)}
        </div>
      </li>`;

  const stepsHtml = steps.map((s) => `
      <li id="step-${s.id}">
        ${s.photo ? pic(s.photo, 480, 640, T(s.caption || s.title), s.caption || s.title, '(min-width:900px) 560px, 92vw', [240, 480]) : `<div class="ph"><svg aria-hidden="true"><use href="#i-leaf"/></svg>${ti('photo.pending')}</div>`}
        <div class="sb"><span class="step-k" data-i="${s.k}">${esc(T(s.k))}</span><h3 class="h4" data-i="${s.title}">${esc(T(s.title))}</h3><p data-i="${s.desc}">${esc(T(s.desc))}</p><p class="more" data-i="${s.more}">${esc(T(s.more))}</p></div>
      </li>`).join('');

  const claimsHtml = claims.filter((c) => c.status !== 'hidden').map((c) => `
        <tr data-claim="${c.id}" data-status="${c.status}"><th scope="row" data-i="${c.label}">${esc(T(c.label))}</th><td data-i="${c.evidence}">${esc(T(c.evidence))}</td></tr>`).join('');

  const faq = Array.from({ length: 11 }, (_, i) => i + 1).map((n) => `
        <details><summary><span data-i="faq.${n}.q">${esc(T(`faq.${n}.q`))}</span><svg class="ic" aria-hidden="true"><use href="#i-chev"/></svg></summary><p class="a" data-i="faq.${n}.a">${esc(T(`faq.${n}.a`))}</p></details>`).join('');

  const gallery = ['hero-canopy', 'lights', 'daily-care', 'handcraft', 'harvest-color', 'macro'].map((v, i) => `
        <li><button type="button" data-video="/videos/${v}.mp4" data-poster="/img/${v}-480.webp" data-title-key="gal.${i + 1}" aria-haspopup="dialog">
          ${pic(v, 240, 320, '', null, '(min-width:1100px) 190px, (min-width:700px) 31vw, 46vw', [240, 480])}<span class="cap" data-i="gal.${i + 1}">${esc(T(`gal.${i + 1}`))}</span><span class="play"><svg aria-hidden="true"><use href="#i-play"/></svg></span></button></li>`).join('');

  const dash = DASH.map((d) => {
    const href = page.id === 'home' ? (d.home.startsWith('#') ? d.home : home + d.home) : home + d.sub;
    const cur = d.page === page.id ? ' aria-current="page"' : '';
    return `<a class="dnav" href="${href}" data-sec="${d.sec}"${cur}><svg aria-hidden="true"><use href="#${d.icon}"/></svg><span data-i="${d.key}">${esc(T(d.key))}</span></a>`;
  }).join('\n');

  const langopts = LANGS.map((l) => `<option value="${l}" lang="${hl(l)}"${l === L ? ' selected' : ''}>${esc(dicts[l]._label)}</option>`).join('');
  const langlinks = LANGS.map((l) => `<a href="${url(l)}" hreflang="${hl(l)}" lang="${hl(l)}" data-lang="${l}"${l === L ? ' aria-current="page"' : ''}>${esc(dicts[l]._label)}</a>`).join('');
  const hreflang = LANGS.map((l) => `<link rel="alternate" hreflang="${hl(l)}" href="${SITE}${url(l)}">`).join('\n') + `\n<link rel="alternate" hreflang="x-default" href="${SITE}${url('ja')}">`;
  const oglocales = LANGS.filter((l) => l !== L).map((l) => `<meta property="og:locale:alternate" content="${dicts[l]._locale}">`).join('\n');

  const org = { '@type': 'Organization', '@id': SITE + '/#org', name: 'GOKURAKU', alternateName: ['極楽', 'Goku-Raku'], url: SITE + '/', logo: SITE + '/brand/icon-512.png', sameAs: ['https://www.instagram.com/gokuraku_thailand'] };
  const graph = page.id === 'home'
    ? [org, { '@type': 'WebSite', '@id': SITE + '/#site', url: SITE + '/', name: 'GOKURAKU 極楽', inLanguage: LANGS.map(hl), publisher: { '@id': SITE + '/#org' } }]
    : [org, { '@type': 'BreadcrumbList', itemListElement: [
        { '@type': 'ListItem', position: 1, name: T('nav.home'), item: SITE + home },
        { '@type': 'ListItem', position: 2, name: T(page.id === 'quality' ? 'nav.quality' : 'nav.soil'), item: SITE + url(L) },
      ] }];
  const jsonld = jsonScript({ '@context': 'https://schema.org', '@graph': graph });

  const campaignsHtml = `<div id="camp-slot" aria-live="polite"></div><script type="application/json" id="camp-data">${jsonScript(publicCampaigns)}</script>`;
  const gk = `<script>window.GK=${jsonScript({ langs: LANGS, htmlLang: HTML_LANG, page: page.id, path: page.path, ver: VER, str: Object.fromEntries(['faq.count', 'camp.label', 'camp.until', 'hero.pause', 'hero.play'].map((k) => [k, T(k)])) })}</script>`;
  const preload = page.id === 'home'
    ? `<link rel="preload" as="image" href="/img/hero-540.avif" type="image/avif" fetchpriority="high">\n<link rel="preload" as="image" href="/brand/logo-full-reverse-240.webp" imagesrcset="/brand/logo-full-reverse-240.webp 1x, /brand/logo-full-reverse-480.webp 2x" type="image/webp" fetchpriority="high">`
    : '';
  // Inter is self-hosted (public/fonts). Japanese/Thai/CJK/Myanmar text uses the fonts installed on the device
  // (Noto Sans JP/CJK on Android, Hiragino on Apple, Yu Gothic on Windows); see --ff in app.css.
  const fonts = `<link rel="preload" href="/fonts/inter-latin.woff2" as="font" type="font/woff2" crossorigin>`;

  return {
    P: { strains, steps: stepsHtml, claims: claimsHtml, faq, gallery, dashlinks: dash, langopts, langlinks, hreflang, oglocales, jsonld, campaigns: campaignsHtml, gk, preload, fonts, sprite, css },
    V: { htmlLang: hl(L), page: page.id, titleKey: `${page.meta}.title`, title: T(`${page.meta}.title`), descKey: `${page.meta}.desc`, desc: T(`${page.meta}.desc`), canonical: SITE + url(L), home, ver: VER },
    pic: (name, w, h, altKey) => pic(name, +w, +h, T(altKey), altKey, '(min-width:900px) 480px, 92vw', [240, 480]),
  };
}

// ---------- assemble ----------
rmSync(DIST, { recursive: true, force: true });
mkdirSync(DIST, { recursive: true });
writeFileSync(join(DIST, 'app.js'), js);

let count = 0;
for (const page of PAGES) {
  const body = read(`src/pages/${page.file}.html`);
  for (const L of LANGS) {
    const { P, V, pic: picP } = partials(L, page);
    let out = layout.replace('<!--@body-->', () => body).replace('<!--@gk-->', () => P.gk);
    if (page.id !== 'home') out = out.replace(new RegExp(`data-nav="${page.id}"`, 'g'), `data-nav="${page.id}" aria-current="page"`);
    out = out
      .replace(/<!--@pic:([\w-]+):(\d+):(\d+):([\w.]+)-->/g, (_, n, w, h, k) => picP(n, w, h, k))
      // decorative background photo for a card (real grow-room photo, empty alt)
      .replace(/<!--@bg:([\w-]+)-->/g, (_, n) => pic(n, 480, 640, '', null, '(min-width:768px) 300px, 60vw', [240, 480]).replace('<picture>', '<picture class="card-bg" aria-hidden="true">'))
      .replace(/<!--@(\w+)-->/g, (_, k) => (k in P ? P[k] : fail(`unknown partial ${k} (${page.id})`)))
      .replace(/\{\{\{([\w.]+)\}\}\}/g, (_, k) => (k in dicts[L] ? html(dicts[L][k]) : fail(`missing key ${k}`)))
      .replace(/\{\{@(\w+)\}\}/g, (_, k) => (k in V ? esc(V[k]) : fail(`unknown var ${k}`)))
      .replace(/\{\{([\w.]+)\}\}/g, (_, k) => (k in dicts[L] ? esc(dicts[L][k]) : fail(`missing key ${k}`)));
    if (/\{\{|<!--@/.test(out)) fail(`unresolved placeholder in ${L}/${page.id}`);
    const dir = join(DIST, base(L), page.path);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'index.html'), out);
    count++;
  }
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
  background_color: '#0D0D0D', theme_color: '#0D0D0D', lang: 'ja',
  icons: [
    { src: '/brand/icon-192.png', sizes: '192x192', type: 'image/png' },
    { src: '/brand/icon-512.png', sizes: '512x512', type: 'image/png' },
    { src: '/brand/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
}, null, 2));
writeFileSync(join(DIST, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n`);
const urls = PAGES.flatMap((p) => {
  const alts = LANGS.map((l) => `    <xhtml:link rel="alternate" hreflang="${hl(l)}" href="${SITE}${base(l)}${p.path}"/>`).join('\n') + `\n    <xhtml:link rel="alternate" hreflang="x-default" href="${SITE}/${p.path}"/>`;
  return LANGS.map((l) => `  <url>\n    <loc>${SITE}${base(l)}${p.path}</loc>\n${alts}\n  </url>`);
});
writeFileSync(join(DIST, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls.join('\n')}\n</urlset>\n`);
console.log(`built ${count} pages (${PAGES.length} × ${LANGS.length} languages) → dist/ (v${VER}); public campaigns: ${publicCampaigns.length}`);
