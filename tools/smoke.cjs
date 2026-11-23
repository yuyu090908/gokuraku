const { chromium, devices } = require('playwright');
// Browser smoke test of the main flows (age gate, drawer, back button, language switch, filter, FAQ, video, old anchors).
// Needs Playwright available (not a project dependency). Start a server first: npm run preview, then
//   SITE=http://localhost:8080 node tools/smoke.cjs
const B = process.env.SITE || 'http://localhost:8080';
const ok = []; const bad = [];
const check = (name, cond, extra = '') => (cond ? ok : bad).push(name + (cond ? '' : ' :: ' + extra));
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['iPhone 13'] });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
  await p.goto(B + '/');
  check('gate visible', await p.isVisible('#gate'));
  check('main inert', await p.evaluate(() => document.querySelector('#main').hasAttribute('inert')));
  await p.click('#gate-yes');
  check('gate closes', !(await p.isVisible('#gate')));
  // drawer
  await p.click('.menu-btn');
  check('drawer open', await p.evaluate(() => document.querySelector('#drawer').open));
  check('scroll lock', await p.evaluate(() => document.documentElement.classList.contains('modal')));
  check('aria-expanded', (await p.getAttribute('.menu-btn', 'aria-expanded')) === 'true');
  await p.keyboard.press('Escape'); await p.waitForTimeout(200);
  check('esc closes', !(await p.evaluate(() => document.querySelector('#drawer').open)));
  check('focus returns', await p.evaluate(() => document.activeElement.classList.contains('menu-btn')));
  await p.click('.menu-btn'); await p.goBack(); await p.waitForTimeout(300);
  check('back closes drawer', !(await p.evaluate(() => document.querySelector('#drawer').open)) && p.url() === B + '/', p.url());
  await p.click('.menu-btn'); await p.click('#drawer [data-close-go][href="/#contact"]'); await p.waitForTimeout(2000);
  const ct = await p.evaluate(() => document.querySelector('#contact').getBoundingClientRect().top);
  check('drawer link scrolls to #contact', Math.abs(ct) < 120 && !(await p.evaluate(() => document.querySelector('#drawer').open)), 'top=' + ct);
  await p.click('.menu-btn'); await Promise.all([p.waitForNavigation(), p.click('#drawer [data-close-go][href="/quality/"]')]);
  check('drawer link to quality page', p.url() === B + '/quality/', p.url());
  check('quality nav current', (await p.getAttribute('.hnav a[data-nav=quality]', 'aria-current')) === 'page');
  check('steps rendered', (await p.$$('.steps-detail > li')).length === 4);
  check('claims rendered (no hidden)', (await p.$$('table.tr tbody tr')).length === 7);
  // language switch on subpage
  await p.selectOption('[data-lang-select]', 'th'); await p.waitForTimeout(600);
  check('lang switch url', p.url() === B + '/th/quality/', p.url());
  check('lang switch text', (await p.textContent('h1')).includes('งานฝีมือ'));
  check('html lang th', (await p.getAttribute('html', 'lang')) === 'th');
  check('links relinked', (await p.getAttribute('.back', 'href')) === '/th/', await p.getAttribute('.back', 'href'));
  check('title translated', (await p.title()).includes('คุณภาพ'), await p.title());
  await Promise.all([p.waitForNavigation(), p.click('.back')]);
  check('back link to /th/', p.url() === B + '/th/', p.url());
  // pref persists on ja URL
  await p.goto(B + '/living-soil/'); await p.waitForTimeout(800);
  check('saved pref applies on ja url', (await p.getAttribute('html', 'lang')) === 'th' && p.url() === B + '/th/living-soil/', p.url());
  await p.selectOption('[data-lang-select]', 'zh'); await p.waitForTimeout(500);
  check('zh-Hans', (await p.getAttribute('html', 'lang')) === 'zh-Hans');
  // video dialog
  await p.click('.gal button >> nth=0'); await p.waitForTimeout(300);
  check('video dialog', await p.evaluate(() => document.querySelector('#media').open && !!document.querySelector('#media-v').src));
  check('video title', (await p.textContent('#media-t')).length > 0);
  await p.click('#media [data-close]'); await p.waitForTimeout(300);
  check('video closed+unloaded', await p.evaluate(() => !document.querySelector('#media').open && !document.querySelector('#media-v').getAttribute('src')));
  await p.selectOption('[data-lang-select]', 'ja'); await p.waitForTimeout(500);
  // home: filter, faq, bnav, header
  await p.goto(B + '/'); await p.waitForTimeout(300);
  await p.click('.chip[data-filter=sativa]');
  check('filter sativa', (await p.$$eval('.strain', (els) => els.filter((e) => !e.hidden).length)) === 1);
  await p.click('.chip[data-filter=all]');
  await p.fill('#faq-q', '年齢');
  check('faq search', (await p.$$eval('#faq-list details', (els) => els.filter((e) => !e.hidden).length)) >= 1 && (await p.textContent('#faq-status')).includes('件'));
  await p.fill('#faq-q', 'zzzz'); check('faq none', await p.isVisible('#faq-none'));
  await p.fill('#faq-q', '');
  await p.evaluate(() => window.scrollTo(0, 0)); await p.waitForTimeout(200);
  await p.evaluate(() => document.activeElement && document.activeElement.blur());
  await p.mouse.wheel(0, 1500); await p.waitForTimeout(600);
  check('header compact', await p.evaluate(() => document.querySelector('#hdr').classList.contains('compact')));
  check('bnav hides on scroll down', await p.evaluate(() => document.querySelector('#bnav').classList.contains('hide')));
  await p.mouse.wheel(0, -300); await p.waitForTimeout(600);
  check('bnav shows on scroll up', !(await p.evaluate(() => document.querySelector('#bnav').classList.contains('hide'))));
  // legacy anchors
  await p.goto(B + '/#transparency'); await p.waitForTimeout(600);
  check('legacy #transparency', p.url() === B + '/quality/#transparency', p.url());
  await p.goto(B + '/#cta-band'); await p.waitForTimeout(800);
  check('legacy #cta-band', p.url() === B + '/#contact', p.url());
  await p.goto(B + '/#goods'); await p.waitForTimeout(300);
  check('#goods opens details', await p.evaluate(() => document.querySelector('#goods').open));
  // bottom nav to quality
  await p.goto(B + '/'); await Promise.all([p.waitForNavigation(), p.click('#bnav a[data-sec=quality]')]);
  check('bnav quality', p.url() === B + '/quality/' && (await p.getAttribute('#bnav a[data-sec=quality]', 'aria-current')) === 'page');
  check('no console errors', errs.length === 0, errs.join(' | '));
  console.log('PASS', ok.length, '\nFAIL', bad.length, '\n' + bad.join('\n'));
  process.exitCode = bad.length ? 1 : 0;
  await b.close();
})();
