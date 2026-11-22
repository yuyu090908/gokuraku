/* GOKURAKU site script. No framework, no dependencies. */
(function () {
  'use strict';
  var d = document, root = d.documentElement;
  var $ = function (s, c) { return (c || d).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || d).querySelectorAll(s)); };
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var store = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  };
  var LANGS = (window.GK && GK.langs) || ['ja', 'en', 'th'];
  var dict = null; // current dictionary (loaded lazily, JA is in the HTML)

  /* ---------- age gate ---------- */
  var gate = $('#gate'), main = $('#main');
  function gateOpen() { return gate && getComputedStyle(gate).display !== 'none'; }
  function setInert(on) {
    ['#main', '.hdr', '.foot', '.bnav'].forEach(function (s) { var el = $(s); if (el) { if (on) el.setAttribute('inert', ''); else el.removeAttribute('inert'); } });
  }
  if (gateOpen()) { setInert(true); var gy = $('#gate-yes'); if (gy) gy.focus(); }
  var gateYes = $('#gate-yes');
  if (gateYes) gateYes.addEventListener('click', function () {
    store.set('gk_age', 'ok'); root.classList.add('age-ok'); setInert(false);
  });

  /* ---------- panels (native <dialog>) ---------- */
  var current = null, opener = null, pushed = false;
  var faqBox = $('#faq-box'), faqHome = $('#faq-home'), faqSlot = $('#faq-slot');
  function openPanel(id, trigger) {
    var dlg = $('#p-' + id);
    if (!dlg || typeof dlg.showModal !== 'function') {
      var target = $('#' + id); if (target) target.scrollIntoView();
      return;
    }
    if (current && current !== dlg) closePanel(true);
    opener = trigger || d.activeElement;
    if (id === 'faq' && faqBox && faqSlot) faqSlot.appendChild(faqBox);
    dlg.showModal();
    current = dlg;
    root.classList.add('modal');
    var body = $('.panel-b', dlg); if (body) body.scrollTop = 0;
    if (id === 'craft') updateStep();
    if (!pushed) { try { history.pushState({ gkPanel: id }, ''); pushed = true; } catch (e) {} }
  }
  function closePanel(keepHistory) {
    if (!current) return;
    var dlg = current; current = null;
    if (dlg.open) dlg.close();
    if (dlg.id === 'p-faq' && faqBox && faqHome) faqHome.appendChild(faqBox);
    if (dlg.id === 'p-media') { var v = $('#media-v'); v.pause(); v.removeAttribute('src'); v.load(); }
    root.classList.remove('modal');
    if (!keepHistory && pushed) { pushed = false; try { history.back(); } catch (e) {} }
    if (opener && opener.focus && d.contains(opener) && !keepHistory) opener.focus();
  }
  window.addEventListener('popstate', function () { if (current) { pushed = false; closePanel(true); } });
  $$('dialog.panel').forEach(function (dlg) {
    dlg.addEventListener('cancel', function (e) { e.preventDefault(); closePanel(); });
    dlg.addEventListener('click', function (e) { if (e.target === dlg) closePanel(); }); // backdrop
  });
  d.addEventListener('click', function (e) {
    var t = e.target.closest && e.target.closest('[data-open],[data-close],[data-close-go]');
    if (!t) return;
    if (t.hasAttribute('data-open')) { e.preventDefault(); openPanel(t.getAttribute('data-open'), t); }
    else if (t.hasAttribute('data-close')) { e.preventDefault(); closePanel(); }
    else if (t.hasAttribute('data-close-go')) {
      e.preventDefault();
      var href = t.getAttribute('href');
      var wasPushed = pushed; pushed = false; closePanel(true);
      var go = function () { var el = $(href); if (el) { el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth' }); try { history.replaceState(null, '', href); } catch (er) {} } };
      if (wasPushed) { history.back(); setTimeout(go, 60); } else go();
    }
  });

  /* ---------- menu filter ---------- */
  var chips = $$('.chip[data-filter]'), strains = $$('.strain[data-tags]');
  chips.forEach(function (c) {
    c.addEventListener('click', function () {
      var f = c.getAttribute('data-filter'), shown = 0;
      chips.forEach(function (x) { x.setAttribute('aria-pressed', x === c ? 'true' : 'false'); });
      strains.forEach(function (s) {
        var on = f === 'all' || s.getAttribute('data-tags').split(' ').indexOf(f) > -1;
        s.hidden = !on; if (on) shown++;
      });
      var empty = $('#menu-empty'); if (empty) empty.hidden = shown > 0;
    });
  });

  /* ---------- FAQ search ---------- */
  var q = $('#faq-q'), items = $$('#faq-list details'), status = $('#faq-status'), none = $('#faq-none');
  function norm(s) { return (s || '').toLowerCase().normalize('NFKC'); }
  function search() {
    var v = norm(q.value.trim()), n = 0;
    items.forEach(function (it) {
      var hit = !v || norm(it.textContent).indexOf(v) > -1;
      it.hidden = !hit; if (hit) n++;
      if (v && hit) it.open = true; else if (!v) it.open = false;
    });
    if (none) none.hidden = n > 0;
    if (status) status.textContent = v ? t('faq.count').replace('{n}', n) : '';
  }
  if (q) { q.addEventListener('input', search); q.addEventListener('search', search); }

  /* ---------- craft stepper ---------- */
  var stepper = $('#stepper'), stepN = $('#step-n');
  function stepIndex() {
    var li = $$('li', stepper); if (!li.length) return [0, 0];
    var w = li[0].getBoundingClientRect().width + 12;
    return [Math.round(stepper.scrollLeft / w), li.length, w];
  }
  function updateStep() {
    if (!stepper || !stepN) return;
    var s = stepIndex();
    stepN.textContent = t('p.craft.stepOf').replace('{i}', Math.min(s[0] + 1, s[1])).replace('{n}', s[1]);
    var prev = $('[data-step="-1"]'), next = $('[data-step="1"]');
    if (prev) prev.disabled = s[0] <= 0;
    if (next) next.disabled = stepper.scrollLeft + stepper.clientWidth >= stepper.scrollWidth - 4;
  }
  if (stepper) {
    var st; stepper.addEventListener('scroll', function () { clearTimeout(st); st = setTimeout(updateStep, 60); }, { passive: true });
    $$('[data-step]').forEach(function (b) {
      b.addEventListener('click', function () {
        var s = stepIndex();
        stepper.scrollTo({ left: (s[0] + Number(b.getAttribute('data-step'))) * s[2], behavior: reduce ? 'auto' : 'smooth' });
      });
    });
    stepper.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); $('[data-step="' + (e.key === 'ArrowRight' ? 1 : -1) + '"]').click(); }
    });
    window.addEventListener('resize', updateStep);
  }

  /* ---------- gallery → video lightbox (videos load only on tap) ---------- */
  $$('[data-video]').forEach(function (b) {
    b.addEventListener('click', function () {
      var v = $('#media-v');
      v.poster = b.getAttribute('data-poster');
      v.src = b.getAttribute('data-video');
      $('#media-t').textContent = b.getAttribute('aria-label') || '';
      openPanel('media', b);
      if (!reduce) { var p = v.play(); if (p && p.catch) p.catch(function () {}); }
    });
  });

  /* ---------- scroll spy for bottom/header nav ---------- */
  if ('IntersectionObserver' in window) {
    var spies = $$('[data-spy]'), headLinks = $$('.hnav a[href^="#"]');
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (!e.isIntersecting) return;
        var id = e.target.id;
        spies.forEach(function (a) { a.setAttribute('aria-current', a.getAttribute('data-spy') === id ? 'true' : 'false'); });
        headLinks.forEach(function (a) { a.setAttribute('aria-current', a.getAttribute('href') === '#' + id ? 'true' : 'false'); });
      });
    }, { rootMargin: '-40% 0px -55% 0px' });
    $$('main > section[id]').forEach(function (s) { io.observe(s); });
  }

  /* ---------- i18n: swap in place, keep the reading position ---------- */
  var cache = {};
  function t(key) { var v = dict && dict[key]; if (v == null) { var el = d.querySelector('[data-i="' + key + '"]'); v = el ? el.textContent : ''; if (!v && window.GK && GK.str) v = GK.str[key] || ''; } return v; }
  function safeHTML(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/&lt;br&gt;/g, '<br>'); }
  function load(lang) {
    if (cache[lang]) return Promise.resolve(cache[lang]);
    return fetch('/i18n/' + lang + '.json?v=' + ((window.GK && GK.ver) || '')).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }).then(function (j) { cache[lang] = j; return j; });
  }
  function anchorEl() {
    var y = (parseFloat(getComputedStyle(root).scrollPaddingTop) || 72);
    var el = d.elementFromPoint(Math.min(innerWidth / 2, 200), y + 8);
    while (el && el !== d.body && !(el.matches && el.matches('section, li, details, h2, h3, p, .dcard, .strain'))) el = el.parentElement;
    return el && el !== d.body ? el : null;
  }
  function apply(j) {
    dict = j;
    $$('[data-i]').forEach(function (el) { var v = j[el.getAttribute('data-i')]; if (v != null) el.textContent = v; });
    $$('[data-ih]').forEach(function (el) { var v = j[el.getAttribute('data-ih')]; if (v != null) el.innerHTML = safeHTML(v); });
    $$('[data-ia]').forEach(function (el) {
      el.getAttribute('data-ia').split('|').forEach(function (pair) {
        var p = pair.split(':'), v = j[p[1]];
        if (v != null) el.setAttribute(p[0], v.replace('{name}', el.getAttribute('data-name') || ''));
      });
    });
    root.lang = j._lang; root.setAttribute('data-lang', j._lang);
    d.title = j['meta.title'];
    var ogl = $('meta[property="og:locale"]'); if (ogl) ogl.content = j._locale;
    var can = $('link[rel=canonical]'); if (can) can.href = location.origin + (j._lang === 'ja' ? '/' : '/' + j._lang + '/');
    $$('[data-lang-select]').forEach(function (s) { s.value = j._lang; });
    $$('a[data-lang]').forEach(function (a) { if (a.getAttribute('data-lang') === j._lang) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    renderCampaigns();
    updateStep();
    if (q && q.value) search();
  }
  function switchLang(lang, persist) {
    if (LANGS.indexOf(lang) < 0) return;
    var a = anchorEl(), top = a ? a.getBoundingClientRect().top : 0;
    return load(lang).then(function (j) {
      apply(j);
      if (a) window.scrollBy(0, a.getBoundingClientRect().top - top);
      if (persist) store.set('gk_lang', lang);
      try { history.replaceState(history.state, '', (lang === 'ja' ? '/' : '/' + lang + '/') + location.search + location.hash); } catch (e) {}
    }).catch(function () { location.href = (lang === 'ja' ? '/' : '/' + lang + '/'); });
  }
  $$('[data-lang-select]').forEach(function (s) { s.addEventListener('change', function () { switchLang(s.value, true); }); });
  d.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[data-lang]');
    if (!a || e.metaKey || e.ctrlKey || e.shiftKey) return;
    e.preventDefault(); switchLang(a.getAttribute('data-lang'), true);
  });
  // Initial dictionary = the page's own language (already rendered). A saved preference on the root page swaps in place.
  var pageLang = root.getAttribute('data-lang');
  var pref = store.get('gk_lang');
  if (pref && pref !== pageLang && LANGS.indexOf(pref) > -1 && location.pathname === '/') switchLang(pref, false);

  /* ---------- campaigns (only legally approved + published + in period; also filtered at build) ---------- */
  function renderCampaigns() {
    var slot = $('#camp-slot'), data = $('#camp-data');
    if (!slot || !data) return;
    var list; try { list = JSON.parse(data.textContent); } catch (e) { list = []; }
    var lang = root.lang || 'ja', now = Date.now();
    var html = list.filter(function (c) {
      return c.status === 'published' && c.legal && c.legal.status === 'approved' &&
        Date.parse(c.start) <= now && now <= Date.parse(c.end) && c.regions.indexOf('TH') > -1;
    }).map(function (c) {
      var pick = function (o) { return (o && (o[lang] || o.ja)) || ''; };
      var end = new Intl.DateTimeFormat(lang, { month: 'short', day: 'numeric' }).format(new Date(c.end));
      return '<div class="camp"><em class="tag">' + safeHTML(t('camp.label')) + '</em><b>' + safeHTML(pick(c.title)) + '</b><span>' + safeHTML(pick(c.benefit.text)) + '</span>' +
        '<span class="fine">' + safeHTML(pick(c.conditions)) + ' · ' + safeHTML(t('camp.until').replace('{date}', end)) + '</span></div>';
    }).join('');
    slot.innerHTML = html;
  }
  renderCampaigns();
})();
