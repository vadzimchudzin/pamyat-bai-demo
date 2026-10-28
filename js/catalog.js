/* ПАМЯТЬ.БАЙ — каталог: разделы (крупно один элемент), модели, карточка модели. Данные — из админки. */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var box = $('#catBox'); if (!box) return;
  var CAT = window.PAMYAT_CATALOG || window.PAMYAT_CATALOG_DEFAULT || { categories: [], items: [] };
  var cur = null, list = [], idx = 0;
  function fmt(n) { return Number(n).toLocaleString('ru-RU'); }
  function cats() { return (CAT.categories || []).filter(function (c) { return c.visible !== false; }); }
  function items(id) { return (CAT.items || []).filter(function (x) { return x.cat === id; }); }
  function price(c) { return c.price == null || c.price === '' ? 'Индивидуальный расчёт' : 'от ' + fmt(c.price) + ' BYN'; }
  function cover(c) {
    var cv = c.cover || {};
    if (!cv.img) return '<div class="cover ind">✦<span>По вашему эскизу</span></div>';
    return '<div class="cover"><img src="' + cv.img + '" alt="' + c.name + '" style="--z:' + (cv.zoom || 1) + ';--pos:' + (cv.pos || '50% 50%') + '"></div>';
  }
  function themes() { if (window.pamyatThemes) setTimeout(window.pamyatThemes, 30); }
  function title(eyebrow, h, lead, back) {
    $('#catTitle').innerHTML = '<div class="cat-back">' + back + '</div><p class="eyebrow">' + eyebrow + '</p><h2>' + h + '</h2>' + (lead ? '<p class="lead">' + lead + '</p>' : '');
  }

  function home() {
    cur = null;
    title('Каталог', 'Каталог памятников', 'Выберите раздел и модель. Гранит, размеры и гравировку согласуем с вами лично.', '<a class="back" href="/" data-home>← На главную</a>');
    box.innerHTML = '<div class="cats">' + cats().map(function (c) {
      var n = items(c.id).length;
      return '<a class="cc glass" href="#' + c.id + '">' + cover(c) + '<h3>' + c.name + '</h3><div class="pr">' + price(c) + '</div>' +
        '<p class="inc">' + (c.inc ? 'Входит: ' + c.inc : (c.desc || '')) + '</p><div class="go"><span>' + (n ? n + ' моделей' : 'Обсудить проект') + '</span><b>Открыть →</b></div></a>';
    }).join('') + '</div>' + (CAT.granite ? '<p class="note">' + CAT.granite + '</p>' : '');
    themes();
  }

  function kitHtml(c) {
    var h = '';
    if (c.price != null && c.price !== '') h += '<div class="prl"><span>Стоимость</span><b>' + price(c) + '</b></div>';
    var sharedSize = CAT.sameSizeAll ? String(c.sizeOverride || CAT.commonSize || '').trim() : '';
    var sizeApplied = false;
    if (c.kit && c.kit.length) {
      h += '<ul class="kit">' + c.kit.map(function (k) {
        var name = String(k[0] || '');
        var primary = /стел|памят|плита|крест|ограда|комплекс/i.test(name);
        var value = k[1] || '';
        if (sharedSize && primary && !sizeApplied) { value = sharedSize; sizeApplied = true; }
        return '<li><b>' + k[0] + '</b><span>' + value + '</span></li>';
      }).join('') +
      (sharedSize && !sizeApplied ? '<li><b>Размер / габариты</b><span>' + sharedSize.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</span></li>' : '') +
      '</ul>';
    } else if (c.inc || sharedSize) {
      h += '<ul class="kit">' + (c.inc ? c.inc.split(/,\s*/).map(function (k) { return '<li><b>' + k.charAt(0).toUpperCase() + k.slice(1) + '</b></li>'; }).join('') : '') +
        (sharedSize ? '<li><b>Размер / габариты</b><span>' + sharedSize.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</span></li>' : '') +
        '</ul>';
    }
    return h;
  }

  function open(id) {
    var c = cats().filter(function (x) { return x.id === id; })[0];
    if (!c) return home();
    cur = c; list = items(c.id);
    title('Каталог · ' + (c.short || c.name), c.name, '', '<a class="back" href="#">← Все разделы</a><a class="back" href="/" data-home>На главную</a>');
    var top = '';
    if (!list.length) {
      box.innerHTML = top + '<div class="indiv glass"><h3>' + c.name + '</h3><p>' + (c.desc || '') + '</p>' +
        '<form class="form qcontact indform" id="indForm"><input required name="name" placeholder="Имя" autocomplete="name">' +
        '<input required name="phone" type="tel" placeholder="+375 (XX) XXX-XX-XX" autocomplete="tel">' +
        '<textarea name="c" rows="3" placeholder="Коротко опишите идею (необязательно)"></textarea>' +
        '<button class="btn btn-gold" type="submit">Обсудить проект <span class="arr">→</span></button>' +
        '<p class="muted">Перезвоним в рабочее время. Нажимая кнопку, вы соглашаетесь с политикой обработки персональных данных.</p></form>' +
        '<div class="ok" id="indOk">Спасибо! Перезвоним и обсудим ваш проект.</div></div>';
      bindInd(c);
      return themes();
    }
    box.innerHTML = top + '<div class="cat-info"><div class="panel glass"><h3>О разделе</h3><p style="color:var(--mut)">' + (c.desc || '') + '</p>' +
      (CAT.granite ? '<p class="muted" style="margin-top:12px">' + CAT.granite + '</p>' : '') + '</div>' +
      '<div class="panel glass"><h3>В комплекте</h3>' + kitHtml(c) + '</div></div>' +
      '<div class="mgrid">' + list.map(function (m, i) {
        return '<div class="mc glass" data-i="' + i + '" role="button" tabindex="0"><div class="im"><img loading="lazy" src="' + m.img + '" alt="' + (c.short || '') + ' ' + m.code + '" style="--z:' + ((c.cover && c.cover.zoomItems) || 1) + '"></div>' +
          '<div class="t"><b>' + (m.name || m.code) + '</b><span>' + (c.short || '') + '</span></div></div>';
      }).join('') + '</div>';
    [].forEach.call(box.querySelectorAll('.mc'), function (el) {
      var go = function () { show(+el.dataset.i); $('#clb').classList.add('on'); };
      el.addEventListener('click', go); el.addEventListener('keydown', function (e) { if (e.key === 'Enter') go(); });
    });
    themes();
  }

  function bindInd(c) {
    var f = $('#indForm'); if (!f) return;
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var fd = new FormData(f), btn = f.querySelector('button[type=submit]');
      var lead = { type: 'contact', name: fd.get('name'), phone: fd.get('phone'), comment: c.name + (fd.get('c') ? ': ' + fd.get('c') : ''), source: location.href };
      function done() { f.style.display = 'none'; $('#indOk').classList.add('on'); }
      if (window.PAMYAT_DEMO) return done();
      btn.disabled = true; btn.textContent = 'Отправляем…';
      fetch('/api/lead', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(lead) })
        .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { return r.ok && d.ok ? done() : Promise.reject(d.error); }); })
        .catch(function (err) { btn.disabled = false; btn.innerHTML = 'Обсудить проект <span class="arr">→</span>'; alert(err || 'Не удалось отправить. Позвоните нам, пожалуйста.'); });
    });
  }
  function calcHref(m) { return '/?model=' + encodeURIComponent(m.code) + '&cat=' + encodeURIComponent(cur.id) + '#calc'; }
  function show(i) {
    idx = (i + list.length) % list.length;
    var m = list[idx];
    $('#clbImg').src = m.img; $('#clbImg').alt = (cur.short || '') + ' ' + m.code;
    $('#clbK').textContent = cur.name; $('#clbT').textContent = (cur.short || '') + ' ' + (m.name || m.code);
    $('#clbD').innerHTML = kitHtml(cur); $('#clbG').textContent = CAT.granite || '';
    $('#clbCalc').href = calcHref(m);
  }
  $('#clbCalc').addEventListener('click', function (e) {
    if (window.parent !== window && cur && list[idx]) { e.preventDefault(); window.parent.postMessage({ pamyatModel: list[idx].code, cat: cur.id }, '*'); }
  });
  function close() { $('#clb').classList.remove('on'); }
  $('#clbX').onclick = close; $('#clbP').onclick = function () { show(idx - 1); }; $('#clbN').onclick = function () { show(idx + 1); };
  $('#clb').addEventListener('click', function (e) { if (e.target === this) close(); });
  document.addEventListener('keydown', function (e) {
    if (!$('#clb').classList.contains('on')) return;
    if (e.key === 'Escape') close(); if (e.key === 'ArrowLeft') show(idx - 1); if (e.key === 'ArrowRight') show(idx + 1);
  });

  document.addEventListener('click', function (e) {
    if (window.parent === window) return;
    var a = e.target.closest('[data-home], a[href^="/#"]'); if (!a || a.id === 'clbCalc') return;
    e.preventDefault(); var h = a.getAttribute('href') || '';
    window.parent.postMessage({ pamyatClose: true, go: h.indexOf('#') > -1 ? h.slice(h.indexOf('#')) : '' }, '*');
  });
  function route() { var id = location.hash.slice(1); id ? open(id) : home(); scrollTo(0, 0); }
  addEventListener('hashchange', route);
  document.addEventListener('pamyat:catalog', function (e) { CAT = e.detail; route(); });
  route();
})();
