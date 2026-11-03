/* Примеры работ: надёжная загрузка фото, ровные стрелки по центру фото, размытые соседние кадры в полях. */
(function () {
  'use strict';
  var car = document.getElementById('worksCarousel');
  var track = document.getElementById('worksGrid');
  if (!car || !track) return;

  var ICON = {
    prev: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg>',
    next: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.5 5.5 16 12l-6.5 6.5"/></svg>'
  };

  function icons() {
    [['.works-prev', 'prev'], ['.works-next', 'next']].forEach(function (p) {
      var b = car.querySelector(p[0]);
      if (b && b.dataset.icon !== '1') { b.innerHTML = ICON[p[1]]; b.dataset.icon = '1'; }
    });
  }

  function viaProxy(src) {
    return /^https:\/\/[^/]*neon\.tech\//i.test(src) ? '/api/work-img?u=' + encodeURIComponent(src) : null;
  }
  function bust(src) { return src + (src.indexOf('?') > -1 ? '&' : '?') + 'r=' + Date.now(); }

  /* 1-я ошибка: грузим через наш домен (прокси); 2-я: повтор оригинала; 3-я: аккуратная заглушка. */
  function heal(img) {
    var orig = img.dataset.orig || (img.dataset.orig = img.getAttribute('src') || '');
    var step = Number(img.dataset.retry || 0);
    img.dataset.retry = String(step + 1);
    var work = img.closest('.work');
    if (!orig) { if (work) work.classList.add('is-broken'); return; }
    /* уменьшенная копия (srcset) не загрузилась — дальше работаем с оригиналом */
    if (img.hasAttribute('srcset')) { img.removeAttribute('srcset'); img.removeAttribute('sizes'); }
    if (step === 0) { img.src = viaProxy(orig) || bust(orig); return; }
    if (step === 1) { setTimeout(function () { img.src = bust(orig); }, 1200); return; }
    if (work) work.classList.add('is-broken');
  }

  /* Полупрозрачные «вуали» над полями слева и справа: соседние кадры видны размытыми и приглушёнными. */
  function veils() {
    ['l', 'r'].forEach(function (side) {
      if (car.querySelector(':scope > .wk-veil.' + side)) return;
      var v = document.createElement('div');
      v.className = 'wk-veil ' + side; v.setAttribute('aria-hidden', 'true');
      car.appendChild(v);
    });
  }

  function prep() {
    icons();
    veils();
    /* все фото грузим сразу: лента бесконечная, копии по краям должны быть готовы до прокрутки */
    Array.prototype.forEach.call(track.querySelectorAll('.work img'), function (img, i) {
      if (img.dataset.prepared !== '1') {
        img.dataset.prepared = '1';
        img.decoding = 'async';
        img.loading = 'eager';
        if (i < 3) img.setAttribute('fetchpriority', i === 0 ? 'high' : 'auto');
      }
      if (img.complete && img.getAttribute('src') && img.naturalWidth === 0 && !img.dataset.retry) heal(img);
    });
    placeArrows();
  }

  /* Стрелки по вертикали — ровно на середину карточки; вуали — на высоту карточек. */
  function placeArrows() {
    var w = track.querySelector('.work:not(.is-clone)') || track.querySelector('.work');
    if (!w) return;
    var c = car.getBoundingClientRect(), r = w.getBoundingClientRect();
    if (!r.height) return;
    var top = r.top - c.top;
    car.style.setProperty('--arrow-y', (top + r.height / 2).toFixed(1) + 'px');
    car.style.setProperty('--wk-top', top.toFixed(1) + 'px');
    car.style.setProperty('--wk-h', r.height.toFixed(1) + 'px');
  }

  track.addEventListener('error', function (e) {
    if (e.target && e.target.tagName === 'IMG') heal(e.target);
  }, true);
  new MutationObserver(prep).observe(track, { childList: true });
  if ('ResizeObserver' in window) new ResizeObserver(placeArrows).observe(car);
  window.addEventListener('resize', placeArrows, { passive: true });
  window.addEventListener('load', prep);
  prep();
})();
