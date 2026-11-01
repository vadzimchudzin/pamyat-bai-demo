/* ПАМЯТЬ.БАЙ — админка · «Примеры работ»: живой кадр (перетаскивание + масштаб), подписи, замена и перенос фото.
   Подключается после admin.js, использует его помощники через window.AdminKit. */
(function () {
  'use strict';
  var K = window.AdminKit; if (!K) return;
  var $ = K.$, $$ = K.$$, esc = K.esc, toast = K.toast, api = K.api, save = K.save, compress = K.compress;
  function C0() { return K.content() || {}; }
  function cropValue(v) { var n = Number(v); return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 50; }
  function badgeColor(v) { var c = String(v || '').trim(); return /^#[0-9a-f]{6}$/i.test(c) ? c : '#9a7436'; }
  function workZoom(v) { if (v == null || v === '') return 1; var n = Number(v); return Number.isFinite(n) ? Math.max(0.5, Math.min(2.2, n)) : 1; }
  function workPresentationDefaults(work) {
    var byImage = {
      '/api/img?id=1': { caption:'Памятник черный гранитный', description:'Двойной памятник с полированной поверхностью' },
      '/api/img?id=2': { caption:'Памятник с портретом', description:'Элегантный памятник с художественной гравировкой' },
      '/api/img?id=3': { caption:'Ограда с покрытием', description:'Благоустроенный участок с гранитным настилом' },
      '/api/img?id=6': { caption:'Индивидуальный проект', description:'Подберём форму, камень и оформление под ваш участок' }
    };
    return byImage[String(work && work.img || '')] || { caption:'', description:'' };
  }
  /* Стандартные подписи подставляются, только пока карточку не правили в админке.
     После первой правки текста (presentationEdited) пустое поле остаётся пустым. */
  function workText(x, key) {
    var v = String(x && x[key] == null ? '' : x[key]).trim();
    if (v || (x && x.presentationEdited)) return v ? String(x[key]) : '';
    return workPresentationDefaults(x)[key] || '';
  }
  function markWorkEdited(item) {
    if (item.presentationEdited) return;
    item.caption = workText(item, 'caption');
    item.description = workText(item, 'description');
    item.presentationEdited = true;
  }
  var WK = { showAll: true, drag: null };
  function r1(n) { return Math.round(n * 10) / 10; }
  function isExternalImg(x) { return /^https?:\/\//i.test(String(x && x.img || '')); }
  function workProxy(u) { return /^https:\/\/[^/]*neon\.tech\//i.test(u) ? '/api/work-img?u=' + encodeURIComponent(u) : ''; }
  function bustUrl(u) { return u + (u.indexOf('?') > -1 ? '&' : '?') + 'r=' + Date.now(); }

  function drawWorks() {
    var w = C0().works || [];
    var ext = w.filter(isExternalImg).length;
    var bar = '<div class="wk-toolbar">' +
      '<label class="chk"><input type="checkbox" data-wk="showall"' + (WK.showAll ? ' checked' : '') + '> Показывать всё фото за рамкой</label>' +
      '<span class="wk-help"><b>Светлая рамка</b> — то, что увидит посетитель. Тяните фото мышью, чтобы сдвинуть; масштаб — ползунок или Ctrl + колесо.</span>' +
      (ext ? '<button class="btn line sm" type="button" data-wk="rehost" title="Копирует фото на ваш сайт, чтобы они грузились надёжно">Перенести ' + ext + ' фото на сайт</button>' : '') +
    '</div>';
    $('#worksEd').classList.toggle('show-all', WK.showAll);
    $('#worksEd').innerHTML = (w.length ? bar : '') + (w.map(function (x, i) {
      x = x || {};
      var caption = workText(x, 'caption'), description = workText(x, 'description');
      var cropX = cropValue(x.cropX), cropY = cropValue(x.cropY), zoom = workZoom(x.zoom), color = badgeColor(x.badgeColor);
      var badge = String(x.badgeText || '').trim();
      return '<div class="w wk" data-i="' + i + '">' +
        '<div class="wk-stage">' +
          '<div class="wk-frame" style="--crop-x:' + cropX + '%;--crop-y:' + cropY + '%;--photo-zoom:' + zoom + '">' +
            '<img class="wk-img" src="' + esc(x.img || '') + '" alt="" draggable="false">' +
            '<span class="wk-broken">Фото не загружается.<br>Нажмите «Заменить фото»</span>' +
            '<span class="wk-badge" style="--badge-color:' + color + '"' + (badge ? '' : ' hidden') + '><i aria-hidden="true"></i><em>' + esc(badge) + '</em></span>' +
            '<div class="wk-info"><strong data-work-title' + (caption ? '' : ' hidden') + '>' + esc(caption) + '</strong><span data-work-description' + (description ? '' : ' hidden') + '>' + esc(description) + '</span></div>' +
          '</div>' +
        '</div>' +
        '<div class="wk-zoom">' +
          '<button class="ic" data-w="zoom-out" type="button" aria-label="Уменьшить масштаб">−</button>' +
          '<input type="range" name="zoom" min="0.5" max="2.2" step="0.01" value="' + zoom + '" aria-label="Масштаб фото">' +
          '<button class="ic" data-w="zoom-in" type="button" aria-label="Увеличить масштаб">+</button>' +
          '<output data-photo-zoom-label>' + Math.round(zoom * 100) + '%</output>' +
        '</div>' +
        '<div class="wk-visible"><span data-visible>В кадре 100% × 100% фото</span><button class="link" data-w="reset" type="button">Сбросить кадр</button></div>' +
        '<label>Заголовок карточки<input name="cap" value="' + esc(caption) + '" placeholder="Например: Памятник с портретом"></label>' +
        '<label>Описание карточки<textarea name="description" rows="2" placeholder="Кратко опишите работу">' + esc(description) + '</textarea></label>' +
        '<div class="wk-badge-row"><label>Текст плашки<input name="badgeText" value="' + esc(badge) + '" placeholder="Например: Новое"></label>' +
        '<label class="w-color-label">Цвет<input type="color" name="badgeColor" value="' + color + '"></label></div>' +
        '<div class="tools"><span><button class="ic" data-w="up" type="button" aria-label="Переместить выше">↑</button> <button class="ic" data-w="down" type="button" aria-label="Переместить ниже">↓</button></span>' +
          '<label class="btn line sm wk-replace">Заменить фото<input type="file" accept="image/*" data-replace hidden></label>' +
          '<button class="ic del" data-w="del" type="button" title="Убрать" aria-label="Убрать фото">×</button></div>' +
      '</div>';
    }).join('') || '<p class="empty">Фото нет — загрузите первые.</p>');
    $$('#worksEd .wk').forEach(paintWork);
  }

  /* Геометрия кадра: так же, как на сайте — object-fit:cover, object-position = кадр X/Y, масштаб от точки X/Y. */
  function frameMetrics(card) {
    var f = card.querySelector('.wk-frame'), im = card.querySelector('.wk-img');
    var w = f.clientWidth, h = f.clientHeight, nw = im.naturalWidth, nh = im.naturalHeight;
    if (!w || !h || !nw || !nh) return null;
    var k = Math.max(w / nw, h / nh);
    return { w: w, h: h, W: nw * k, H: nh * k };
  }
  function paintWork(card) {
    var item = C0().works[+card.dataset.i]; if (!item) return;
    var z = workZoom(item.zoom), f = card.querySelector('.wk-frame');
    f.style.setProperty('--crop-x', cropValue(item.cropX) + '%');
    f.style.setProperty('--crop-y', cropValue(item.cropY) + '%');
    f.style.setProperty('--photo-zoom', z);
    var r = card.querySelector('input[name=zoom]'); if (r && Number(r.value) !== z) r.value = z;
    var o = card.querySelector('[data-photo-zoom-label]'); if (o) o.textContent = Math.round(z * 100) + '%';
    var v = card.querySelector('[data-visible]'), m = frameMetrics(card);
    if (v) {
      if (!m) v.textContent = 'Масштаб ' + Math.round(z * 100) + '%';
      else {
        var vw = Math.min(1, m.w / (z * m.W)), vh = Math.min(1, m.h / (z * m.H));
        v.textContent = 'В кадре ' + Math.round(vw * 100) + '% × ' + Math.round(vh * 100) + '% фото';
      }
    }
  }
  function setZoom(card, z) {
    var item = C0().works[+card.dataset.i]; if (!item) return;
    item.zoom = Math.round(workZoom(z) * 100) / 100;
    paintWork(card);
  }

  /* фото: если не грузится — повтор через наш домен, затем заглушка */
  $('#worksEd').addEventListener('error', function (e) {
    var im = e.target; if (!im || !im.classList || !im.classList.contains('wk-img')) return;
    var card = im.closest('.wk'), item = card && C0().works[+card.dataset.i]; if (!item) return;
    var orig = String(item.img || ''), step = Number(im.dataset.retry || 0), proxy = workProxy(orig);
    im.dataset.retry = String(step + 1);
    if (step === 0) { im.src = proxy || bustUrl(orig); return; }
    if (step === 1 && proxy) { im.src = bustUrl(orig); return; }
    card.querySelector('.wk-frame').classList.add('is-broken');
  }, true);
  $('#worksEd').addEventListener('load', function (e) {
    var im = e.target; if (!im || !im.classList || !im.classList.contains('wk-img')) return;
    var card = im.closest('.wk'); if (!card) return;
    card.querySelector('.wk-frame').classList.remove('is-broken');
    paintWork(card);
  }, true);

  /* перетаскивание кадра */
  $('#worksEd').addEventListener('pointerdown', function (e) {
    var st = e.target.closest('.wk-stage'); if (!st || (e.button && e.button > 0)) return;
    var card = st.closest('.wk'), item = C0().works[+card.dataset.i], m = frameMetrics(card); if (!item || !m) return;
    WK.drag = { st: st, card: card, item: item, m: m, id: e.pointerId, x: e.clientX, y: e.clientY, px: cropValue(item.cropX), py: cropValue(item.cropY) };
    try { st.setPointerCapture(e.pointerId); } catch (err) { }
    st.classList.add('is-drag'); e.preventDefault();
  });
  $('#worksEd').addEventListener('pointermove', function (e) {
    var d = WK.drag; if (!d || e.pointerId !== d.id) return;
    var z = workZoom(d.item.zoom), rx = d.m.w - z * d.m.W, ry = d.m.h - z * d.m.H;
    if (rx < -0.5) d.item.cropX = r1(cropValue(d.px + (e.clientX - d.x) / rx * 100));
    if (ry < -0.5) d.item.cropY = r1(cropValue(d.py + (e.clientY - d.y) / ry * 100));
    paintWork(d.card);
  });
  function endDrag(e) {
    var d = WK.drag; if (!d || (e && e.pointerId !== d.id)) return;
    d.st.classList.remove('is-drag'); WK.drag = null;
  }
  $('#worksEd').addEventListener('pointerup', endDrag);
  $('#worksEd').addEventListener('pointercancel', endDrag);
  $('#worksEd').addEventListener('wheel', function (e) {
    if (!(e.ctrlKey || e.metaKey || e.altKey)) return;
    var st = e.target.closest('.wk-stage'); if (!st) return;
    e.preventDefault();
    var card = st.closest('.wk'), item = C0().works[+card.dataset.i]; if (!item) return;
    setZoom(card, workZoom(item.zoom) * Math.exp(-e.deltaY * 0.0025));
  }, { passive: false });

  $('#worksEd').addEventListener('input', function (e) {
    var card = e.target.closest('.wk'); if (!card) return;
    var item = C0().works[+card.dataset.i]; if (!item) return;
    var name = e.target.name;
    if (name === 'zoom') return setZoom(card, e.target.value);
    if (name === 'cap') {
      markWorkEdited(item); item.caption = e.target.value;
      var title = card.querySelector('[data-work-title]');
      if (title) { title.textContent = e.target.value; title.hidden = !String(e.target.value || '').trim(); }
    }
    if (name === 'description') {
      markWorkEdited(item); item.description = e.target.value;
      var description = card.querySelector('[data-work-description]');
      if (description) { description.textContent = e.target.value; description.hidden = !String(e.target.value || '').trim(); }
    }
    if (name === 'badgeText') {
      item.badgeText = e.target.value;
      var preview = card.querySelector('.wk-badge');
      if (preview) { preview.querySelector('em').textContent = item.badgeText; preview.hidden = !String(item.badgeText || '').trim(); }
    }
    if (name === 'badgeColor') {
      item.badgeColor = badgeColor(e.target.value);
      var pc = card.querySelector('.wk-badge'); if (pc) pc.style.setProperty('--badge-color', item.badgeColor);
    }
  });
  $('#worksEd').addEventListener('click', function (e) {
    var t = e.target.closest('[data-wk]');
    if (t && t.dataset.wk === 'rehost') return rehostWorks(t);
    var b = e.target.closest('[data-w]'); if (!b) return;
    var card = b.closest('.wk'), i = +card.dataset.i, w = C0().works, a = b.dataset.w, item = w[i];
    if (a === 'zoom-in') return setZoom(card, workZoom(item.zoom) + 0.1);
    if (a === 'zoom-out') return setZoom(card, workZoom(item.zoom) - 0.1);
    if (a === 'reset') { item.cropX = 50; item.cropY = 50; item.zoom = 1; return paintWork(card); }
    if (a === 'up' && i > 0) { var t1 = w[i]; w[i] = w[i - 1]; w[i - 1] = t1; }
    if (a === 'down' && i < w.length - 1) { var t2 = w[i]; w[i] = w[i + 1]; w[i + 1] = t2; }
    if (a === 'del') { if (!confirm('Убрать фото с сайта?')) return; w.splice(i, 1); }
    drawWorks();
  });
  $('#worksEd').addEventListener('change', function (e) {
    var t = e.target;
    if (t.dataset && t.dataset.wk === 'showall') { WK.showAll = t.checked; $('#worksEd').classList.toggle('show-all', WK.showAll); return; }
    if (!t.hasAttribute || !t.hasAttribute('data-replace')) return;
    var card = t.closest('.wk'), item = card && C0().works[+card.dataset.i], f = t.files && t.files[0];
    t.value = ''; if (!item || !f) return;
    toast('Загружаем фото…');
    compress(f).then(function (data) { return api('/api/upload', { method: 'POST', body: { data: data } }); })
      .then(function (d) {
        if (!d.ok) return toast(d.error || 'Фото не загрузилось', true);
        item.img = d.url; item.cropX = 50; item.cropY = 50; item.zoom = 1;
        drawWorks(); return save('works', C0().works);
      }).catch(function () { toast('Не удалось обработать файл', true); });
  });
  /* Перенос фото с внешнего хранилища на сам сайт (/api/img) — они перестают зависеть от чужого домена. */
  function rehostWorks(btn) {
    var list = (C0().works || []).filter(isExternalImg); if (!list.length) return;
    btn.disabled = true; var done = 0, failed = 0;
    toast('Переносим фото: 0 из ' + list.length + '…');
    list.reduce(function (p, item) {
      return p.then(function () {
        var u = String(item.img), src = workProxy(u) || u;
        return fetch(src).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.blob(); })
          .then(compress)
          .then(function (data) { return api('/api/upload', { method: 'POST', body: { data: data } }); })
          .then(function (d) { if (!d.ok) throw new Error(d.error || 'upload'); item.img = d.url; done++; toast('Переносим фото: ' + done + ' из ' + list.length + '…'); });
      }).catch(function () { failed++; });
    }, Promise.resolve()).then(function () {
      drawWorks();
      if (done) return save('works', C0().works).then(function () { if (failed) toast('Перенесено ' + done + ', не удалось ' + failed + ' — загрузите их вручную («Заменить фото»)', true); });
      toast('Не удалось перенести — используйте «Заменить фото»', true);
    });
  }
  $('#worksFile').addEventListener('change', function (e) {
    var files = [].slice.call(e.target.files || []); e.target.value = '';
    if (!files.length) return;
    toast('Загружаем ' + files.length + ' фото…');
    files.reduce(function (p, f) {
      return p.then(function () { return compress(f); }).then(function (data) { return api('/api/upload', { method: 'POST', body: { data: data } }); })
        .then(function (d) { if (d.ok) { C0().works = C0().works || []; C0().works.push({ img: d.url, caption: '', description: '', presentationEdited: true, badgeText: '', badgeColor: '#9a7436', cropX: 50, cropY: 50, zoom: 1 }); drawWorks(); } else toast(d.error || 'Фото не загрузилось', true); });
    }, Promise.resolve()).then(function () { return save('works', C0().works); });
  });


  K.drawWorks = drawWorks;
})();
