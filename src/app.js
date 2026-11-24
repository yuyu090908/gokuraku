/* GOKURAKU site script. No framework, no dependencies. */
(function () {
  'use strict';
  var d = document, root = d.documentElement, GK = window.GK || {};
  var $ = function (s, c) { return (c || d).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || d).querySelectorAll(s)); };
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var store = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  };
  var LANGS = GK.langs || ['ja'];
  var PAGE = GK.page || root.getAttribute('data-page') || 'home';
  var PATH = GK.path || '';
  var lang = root.getAttribute('data-lang') || 'ja';
  var dict = null; // dictionary of the current language once one has been fetched
  var base = function (l) { return l === 'ja' ? '/' : '/' + l + '/'; };
  var htmlLang = function (l) { return (GK.htmlLang && GK.htmlLang[l]) || l; };
  var scrollTo = function (el) { if (el) el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth' }); };

  /* ---------- old links: anchors from the previous one-page site ---------- */
  var ALIAS = { quality: 'quality/', transparency: 'quality/#transparency', growroom: 'living-soil/#growroom', interlude: 'living-soil/#growroom', 'cta-band': '#contact', craft: '#craftsmanship', philosophy: '#about' };
  function onHash() {
    if (!location.hash) return;
    var h = decodeURIComponent(location.hash.slice(1)), dest = PAGE === 'home' && ALIAS[h];
    if (dest && !d.getElementById(h)) {
      if (dest.charAt(0) === '#') { try { history.replaceState(null, '', dest); } catch (e) {} setTimeout(function () { scrollTo(d.getElementById(dest.slice(1))); }, 0); }
      else location.replace(base(lang) + dest);
      return;
    }
    var det = d.getElementById(h); if (det && det.tagName === 'DETAILS') det.open = true;
  }
  onHash();
  window.addEventListener('hashchange', onHash);

  /* ---------- age gate ---------- */
  var gate = $('#gate');
  function gateOpen() { return gate && getComputedStyle(gate).display !== 'none'; }
  function setInert(on) {
    ['#main', '.hdr', '.foot', '.bnav', '.skip'].forEach(function (s) { var el = $(s); if (el) { if (on) el.setAttribute('inert', ''); else el.removeAttribute('inert'); } });
  }
  if (gateOpen()) { setInert(true); var gy = $('#gate-yes'); if (gy) gy.focus(); }
  var gateYes = $('#gate-yes');
  if (gateYes) gateYes.addEventListener('click', function () {
    store.set('gk_age', 'ok'); root.classList.add('age-ok'); setInert(false);
    var m = $('#main'); if (m) m.focus({ preventScroll: true });
  });

  /* ---------- dialogs: drawer menu + video (native <dialog>: focus trap, Esc) ---------- */
  var current = null, opener = null, pushed = false, pendingHash = null;
  function openDialog(id, trigger) {
    var dlg = d.getElementById(id);
    if (!dlg || typeof dlg.showModal !== 'function') return false;
    if (current && current !== dlg) closeDialog(true);
    opener = trigger || d.activeElement;
    dlg.showModal();
    current = dlg;
    root.classList.add('modal');
    if (trigger && trigger.setAttribute) trigger.setAttribute('aria-expanded', 'true');
    // Android/iOS back button closes the dialog instead of leaving the page
    if (!pushed) { try { history.pushState({ gkDialog: id }, ''); pushed = true; } catch (e) {} }
    return true;
  }
  function closeDialog(keepHistory) {
    if (!current) return;
    var dlg = current; current = null;
    if (dlg.open) dlg.close();
    if (dlg.id === 'media') { var v = $('#media-v'); v.pause(); v.removeAttribute('src'); v.load(); }
    root.classList.remove('modal');
    $$('[aria-expanded="true"][data-open]').forEach(function (b) { b.setAttribute('aria-expanded', 'false'); });
    if (!keepHistory && pushed) { pushed = false; try { history.back(); } catch (e) {} }
    if (opener && opener.focus && d.contains(opener) && !pendingHash) opener.focus();
  }
  window.addEventListener('popstate', function () {
    if (current) { pushed = false; closeDialog(true); }
    if (pendingHash) {
      var hsh = pendingHash; pendingHash = null;
      // wait for the browser to finish restoring the previous scroll position
      setTimeout(function () { try { history.replaceState(null, '', hsh); } catch (e) {} scrollTo(d.getElementById(hsh.slice(1))); }, 30);
    }
  });
  $$('dialog').forEach(function (dlg) {
    dlg.addEventListener('cancel', function (e) { e.preventDefault(); closeDialog(); });
    dlg.addEventListener('click', function (e) { if (e.target === dlg) closeDialog(); }); // backdrop
  });
  $$('[data-open]').forEach(function (b) { b.setAttribute('aria-expanded', 'false'); });
  d.addEventListener('click', function (e) {
    var t = e.target.closest && e.target.closest('[data-open],[data-close],[data-close-go]');
    if (!t) return;
    if (t.hasAttribute('data-open')) { if (openDialog(t.getAttribute('data-open'), t)) e.preventDefault(); }
    else if (t.hasAttribute('data-close')) { e.preventDefault(); closeDialog(); }
    else if (t.hasAttribute('data-close-go')) {
      if (e.metaKey || e.ctrlKey || e.shiftKey) return;
      e.preventDefault();
      var url = new URL(t.href, location.href), wasPushed = pushed;
      var samePage = url.pathname === location.pathname && url.hash;
      pushed = false;
      if (samePage) {
        if (wasPushed) { pendingHash = url.hash; closeDialog(true); history.back(); }
        else { closeDialog(true); try { history.replaceState(null, '', url.hash); } catch (er) {} scrollTo(d.getElementById(url.hash.slice(1))); }
      } else {
        closeDialog(true);
        if (wasPushed) location.replace(url.href); else location.href = url.href;
      }
    }
  });

  /* ---------- header: compact on scroll; bottom bar hides while scrolling down ---------- */
  var hdr = $('#hdr'), bnav = $('#bnav'), lastY = window.scrollY, ticking = false;
  function onScroll() {
    ticking = false;
    var y = window.scrollY;
    if (hdr) hdr.classList.toggle('compact', y > 8);
    if (bnav && !current) {
      var focusIn = bnav.contains(d.activeElement);
      if (y > lastY + 6 && y > 240 && !focusIn) bnav.classList.add('hide');
      else if (y < lastY - 6 || y < 240) bnav.classList.remove('hide');
    }
    lastY = y;
  }
  window.addEventListener('scroll', function () { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }, { passive: true });
  if (bnav) bnav.addEventListener('focusin', function () { bnav.classList.remove('hide'); });
  onScroll();

  /* ---------- scroll spy (home page): header nav, desktop dashboard, bottom bar ---------- */
  if (PAGE === 'home' && 'IntersectionObserver' in window) {
    var NAV = { home: 'home', about: 'about', soil: 'living-soil', craftsmanship: 'quality', contact: 'contact' };
    var mark = function (els, on) { els.forEach(function (a) { if (on(a)) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current'); }); };
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (!e.isIntersecting) return;
        var id = e.target.id;
        mark($$('.dnav[data-sec]'), function (a) { return a.getAttribute('data-sec') === id; });
        mark($$('.hnav a[data-nav]'), function (a) { return a.getAttribute('data-nav') === NAV[id]; });
      });
    }, { rootMargin: '-40% 0px -55% 0px' });
    $$('main > section[id]').forEach(function (s) { io.observe(s); });
  }

  /* ---------- reveal on scroll: groups below the first screen fade up once ---------- */
  if (!reduce && 'IntersectionObserver' in window) {
    var rvEls = $$('main .sec-h, main .cards3, main .acc, main .split-media, main .split-txt, main .steps4, main .photos2, main .strains, main .contact-grid, main .faq-wrap, main .flowgraph, main .steps-detail, main .table-wrap, main .prose')
      .filter(function (el) { return el.getBoundingClientRect().top > window.innerHeight; });
    if (rvEls.length) {
      var rv = new IntersectionObserver(function (es) {
        es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); rv.unobserve(e.target); } });
      }, { rootMargin: '0px 0px -8% 0px' });
      rvEls.forEach(function (el) { el.setAttribute('data-rv', ''); rv.observe(el); });
      d.documentElement.classList.add('rv-on');
    }
  }

  /* ---------- ambient videos (hero background, grow-room clip) ----------
     The still image stays the first paint. A video starts after page load (data-start="load") or when it
     first comes near the viewport (data-start="view"), never with reduced motion or data saving. Each pauses
     off-screen and has its own pause button (WCAG 2.2.2); a press keeps it paused. */
  var saveData = navigator.connection && navigator.connection.saveData;
  function ambient(v, btn) {
    if (!v || !btn || typeof v.play !== 'function') return;
    var userPaused = false, visible = false, started = false;
    var play = function () { if (started && !userPaused && visible && !d.hidden) { var pr = v.play(); if (pr && pr.catch) pr.catch(function () {}); } };
    var start = function () {
      if (started) return; started = true;
      v.src = v.getAttribute('data-src');
      v.addEventListener('playing', function () { v.classList.add('on'); btn.hidden = false; }, { once: true });
      play();
    };
    btn.addEventListener('click', function () {
      userPaused = !userPaused;
      btn.setAttribute('aria-pressed', String(userPaused));
      btn.setAttribute('data-ia', 'aria-label:' + (userPaused ? 'hero.play' : 'hero.pause'));
      btn.setAttribute('aria-label', t(userPaused ? 'hero.play' : 'hero.pause'));
      if (userPaused) v.pause(); else play();
    });
    d.addEventListener('visibilitychange', function () { if (d.hidden) v.pause(); else play(); });
    // play-once clips (logo reveal): rest on the last frame; the button then replays from the start
    if (v.hasAttribute('data-once')) v.addEventListener('ended', function () { if (!userPaused) btn.click(); });
    var onLoad = v.getAttribute('data-start') !== 'view';
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (es) {
        visible = es[0].isIntersecting;
        if (visible && !onLoad) start();
        if (visible) play(); else if (started) v.pause();
      }, { rootMargin: onLoad ? '0px' : '200px 0px' }).observe(v);
    } else visible = true;
    if (onLoad) { if (d.readyState === 'complete') setTimeout(start, 0); else window.addEventListener('load', function () { setTimeout(start, 0); }); }
  }
  if (!reduce && !saveData) $$('video.amb-video').forEach(function (v) { ambient(v, v.parentNode.querySelector('.vid-pause')); });

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

  /* ---------- gallery → video dialog (videos load only on tap) ---------- */
  $$('[data-video]').forEach(function (b) {
    b.addEventListener('click', function () {
      var v = $('#media-v');
      v.poster = b.getAttribute('data-poster');
      v.src = b.getAttribute('data-video');
      $('#media-t').textContent = t(b.getAttribute('data-title-key'));
      openDialog('media', b);
      if (!reduce) { var p = v.play(); if (p && p.catch) p.catch(function () {}); }
    });
  });

  /* ---------- i18n: swap text in place, keep the reading position ---------- */
  var cache = {};
  function t(key) {
    var v = dict && dict[key];
    if (v == null) { var el = d.querySelector('[data-i="' + key + '"]'); v = el ? el.textContent : ''; if (!v && GK.str) v = GK.str[key] || ''; }
    return v;
  }
  function safeHTML(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/&lt;br&gt;/g, '<br>'); }
  function load(l) {
    if (cache[l]) return Promise.resolve(cache[l]);
    return fetch('/i18n/' + l + '.json?v=' + (GK.ver || '')).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }).then(function (j) { cache[l] = j; return j; });
  }
  function anchorEl() {
    var y = (parseFloat(getComputedStyle(root).scrollPaddingTop) || 72);
    var el = d.elementFromPoint(Math.min(innerWidth / 2, 200), y + 8);
    while (el && el !== d.body && !(el.matches && el.matches('section, li, details, h2, h3, p, .strain'))) el = el.parentElement;
    return el && el !== d.body ? el : null;
  }
  // Internal page links (/…, /en/…) follow the chosen language.
  function relink(l) {
    $$('a[href^="/"]:not([data-lang])').forEach(function (a) {
      var href = a.getAttribute('href'), m = href.match(/^\/([a-z]{2})(\/.*)?$/);
      var rest = m && LANGS.indexOf(m[1]) > -1 ? (m[2] || '/') : href;
      if (/^\/(img|brand|videos|i18n)\//.test(rest)) return;
      a.setAttribute('href', base(l) + rest.replace(/^\//, ''));
    });
  }
  function apply(j) {
    dict = j; lang = j._lang;
    $$('[data-i]').forEach(function (el) { var v = j[el.getAttribute('data-i')]; if (v != null) el.textContent = v; });
    $$('[data-ih]').forEach(function (el) { var v = j[el.getAttribute('data-ih')]; if (v != null) el.innerHTML = safeHTML(v); });
    $$('[data-ia]').forEach(function (el) {
      el.getAttribute('data-ia').split('|').forEach(function (pair) {
        var i = pair.indexOf(':'), attr = pair.slice(0, i), v = j[pair.slice(i + 1)];
        if (v == null) return;
        var nk = el.getAttribute('data-name-key'), name = nk ? (j[nk] || '') : (el.getAttribute('data-name') || '');
        el.setAttribute(attr, (el.getAttribute('data-prefix') || '') + v.replace('{name}', name));
      });
    });
    root.lang = htmlLang(lang); root.setAttribute('data-lang', lang);
    var ogl = $('meta[property="og:locale"]'); if (ogl) ogl.content = j._locale;
    var href = location.origin + base(lang) + PATH;
    var can = $('link[rel=canonical]'); if (can) can.href = href;
    var ogu = $('meta[property="og:url"]'); if (ogu) ogu.content = href;
    $$('[data-lang-select]').forEach(function (s) { s.value = lang; });
    $$('a[data-lang]').forEach(function (a) { if (a.getAttribute('data-lang') === lang) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    relink(lang);
    renderCampaigns();
    if (q && q.value) search();
  }
  function switchLang(l, persist) {
    if (LANGS.indexOf(l) < 0) return;
    if (persist) store.set('gk_lang', l);
    if (l === lang) return;
    var a = anchorEl(), top = a ? a.getBoundingClientRect().top : 0;
    return load(l).then(function (j) {
      apply(j);
      if (a) window.scrollBy(0, a.getBoundingClientRect().top - top);
      try { history.replaceState(history.state, '', base(l) + PATH + location.search + location.hash); } catch (e) {}
    }).catch(function () { location.href = base(l) + PATH; });
  }
  $$('[data-lang-select]').forEach(function (s) { s.addEventListener('change', function () { switchLang(s.value, true); }); });
  d.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[data-lang]');
    if (!a || e.metaKey || e.ctrlKey || e.shiftKey) return;
    e.preventDefault();
    if (current) closeDialog();
    switchLang(a.getAttribute('data-lang'), true);
  });
  // A saved language preference applies when someone lands on a Japanese (unprefixed) URL.
  var pref = store.get('gk_lang');
  if (pref && pref !== lang && lang === 'ja' && LANGS.indexOf(pref) > -1) switchLang(pref, false);

  /* ---------- campaigns (only published + legally approved + in period; also filtered at build) ---------- */
  function renderCampaigns() {
    var slot = $('#camp-slot'), data = $('#camp-data');
    if (!slot || !data) return;
    var list; try { list = JSON.parse(data.textContent); } catch (e) { list = []; }
    var now = Date.now();
    slot.innerHTML = list.filter(function (c) {
      return c.status === 'published' && c.legal && c.legal.status === 'approved' &&
        Date.parse(c.start) <= now && now <= Date.parse(c.end) && c.regions.indexOf('TH') > -1;
    }).map(function (c) {
      var pick = function (o) { return (o && (o[lang] || o.ja)) || ''; };
      var end = new Intl.DateTimeFormat(htmlLang(lang), { month: 'short', day: 'numeric' }).format(new Date(c.end));
      return '<div class="camp"><em class="tag">' + safeHTML(t('camp.label')) + '</em><b>' + safeHTML(pick(c.title)) + '</b><span>' + safeHTML(pick(c.benefit.text)) + '</span>' +
        '<span class="small muted">' + safeHTML(pick(c.conditions)) + ' · ' + safeHTML(t('camp.until').replace('{date}', end)) + '</span></div>';
    }).join('');
  }
  renderCampaigns();
})();
