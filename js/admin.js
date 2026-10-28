/* ПАМЯТЬ.БАЙ — админка: вход, заявки, калькулятор, фото работ, тексты, контакты, Telegram, журнал */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return [].slice.call((r || document).querySelectorAll(s)); };
  var C = null;                                   // текущее содержимое сайта
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function toast(msg, bad) { var t = $('#toast'); t.textContent = msg; t.className = 'toast' + (bad ? ' bad' : ''); t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(function () { t.hidden = true; }, 3200); }
  function api(path, opt) {
    opt = opt || {};
    return fetch(path, { method: opt.method || 'GET', credentials: 'same-origin', headers: opt.body ? { 'content-type': 'application/json' } : {}, body: opt.body ? JSON.stringify(opt.body) : undefined })
      .then(function (r) { return r.json().catch(function () { return { ok: false, error: 'Ответ сервера не прочитан' }; }).then(function (d) { d.status = r.status; return d; }); })
      .then(function (d) { if (d.status === 401 && path !== '/api/auth') showLogin(); return d; });
  }
  function slug(s) { return (String(s).toLowerCase().replace(/[^a-z0-9а-яё]+/gi, '-').replace(/^-|-$/g, '') || 'item') + '-' + Math.random().toString(36).slice(2, 6); }

  /* ---------- вход ---------- */
  function showLogin() { $('#app').hidden = true; $('#login').hidden = false; }
  function showApp(user) { $('#login').hidden = true; $('#app').hidden = false; $('#me').textContent = user; load(); }
  $('#loginForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var f = e.target, err = $('#loginErr'); err.hidden = true;
    api('/api/auth', { method: 'POST', body: { login: f.login.value, password: f.password.value } }).then(function (d) {
      if (d.ok) { f.password.value = ''; showApp(d.user); } else { err.textContent = d.error || 'Не удалось войти'; err.hidden = false; }
    });
  });
  $('#logout').addEventListener('click', function () { api('/api/auth', { method: 'DELETE' }).then(showLogin); });
  api('/api/auth').then(function (d) { d.ok ? showApp(d.user) : showLogin(); });

  /* ---------- навигация ---------- */
  function activatePane(name) {
    $('#nav button').forEach(function (x) { x.classList.toggle('on', x.dataset.p === name); });
    $('.pane').forEach(function (p) { p.classList.toggle('on', p.id === 'p-' + name); });
    if (name === 'log') loadLog();
    if (name === 'leads') loadLeads();
    if (name === 'pricebook') loadPricebook();
    if (name === 'estimates') loadEstimates();
  }
  $('#nav').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    activatePane(b.dataset.p);
  });

  function load() {
    api('/api/content?full=1').then(function (d) {
      if (!d.ok) return toast(d.error || 'Не удалось загрузить данные', true);
      C = d.content; drawCatalog(); drawCalc(); drawWorks(); drawTexts(); drawContacts(); drawTg();
      loadPricebook(); loadEstimates();
    });
    loadLeads();
  }
  function save(section, value) {
    return api('/api/content', { method: 'PUT', body: { section: section, value: value } }).then(function (d) {
      if (d.ok) { C = d.content; toast('Сохранено — на сайте уже обновилось'); } else toast(d.error || 'Не сохранилось', true);
      return d;
    });
  }
  $$('[data-save]').forEach(function (b) {
    b.addEventListener('click', function () {
      var s = b.dataset.save;
      if (s === 'calc') return save('calc', readCalc());
      if (s === 'catalog') { readCatalog(); return save('catalog', C.catalog); }
      if (s === 'works') return save('works', C.works);
      if (s === 'texts') return save('texts', readForm('#textsEd'));
      if (s === 'contacts') return save('contacts', readForm('#contactsEd'));
      if (s === 'telegram') { var t = readForm('#tgEd'); t.enabled = $('#tgEd [name=enabled]').checked; return save('telegram', t); }
    });
  });
  function readForm(sel) { var o = {}; $$(sel + ' [name]').forEach(function (i) { if (i.type !== 'checkbox') o[i.name] = i.value.trim(); }); return o; }
  function field(name, label, val, opt) {
    opt = opt || {};
    var inp = opt.area ? '<textarea name="' + name + '" rows="' + (opt.rows || 3) + '">' + esc(val) + '</textarea>'
      : '<input name="' + name + '" value="' + esc(val) + '"' + (opt.type ? ' type="' + opt.type + '"' : '') + (opt.ph ? ' placeholder="' + esc(opt.ph) + '"' : '') + '>';
    return '<label class="' + (opt.wide ? 'wide' : '') + '">' + label + inp + '</label>';
  }

  /* ---------- заявки: канбан, статусы и получение сметы ---------- */
  var STATUSES = [], LEADS = [];
  var STATUS_KEYS = {
    'новая':'new','взята в работу':'working','связались':'contacted','назначен замер':'measure',
    'отправлена смета':'estimate','заключён договор':'contract','отказ':'rejected','завершена':'done'
  };
  function statusKey(s) { return STATUS_KEYS[s] || 'new'; }
  function leadStatus(id, status) {
    return api('/api/lead', {method:'PATCH', body:{id:Number(id),status:status}}).then(function (d) {
      if (d.ok) { toast('Статус заявки №' + id + ': ' + status); return loadLeads(); }
      toast(d.error || 'Статус не обновлён', true);
    });
  }
  function estimateFromLead(id) {
    toast('Готовим смету…');
    return api('/api/finance', {method:'POST',body:{action:'create_estimate',leadId:Number(id)}}).then(function (d) {
      if (!d.ok) return toast(d.error || 'Не удалось создать смету', true);
      currentEstimate = d.estimate;
      activatePane('estimates');
      drawEstimateEditor(currentEstimate);
      loadEstimates();
      toast('Создан черновик сметы №' + currentEstimate.id);
    });
  }
  function drawKanban(leads) {
    var board = $('#leadsBoard');
    if (!board) return;
    if (!leads.length) { board.innerHTML = '<p class="empty">Заявок пока нет — новые заявки появятся здесь и в Telegram.</p>'; return; }
    board.innerHTML = '<div class="kanban">' + STATUSES.map(function (st) {
      var list = leads.filter(function (l) { return (l.status || 'новая') === st; });
      var key = statusKey(st);
      return '<section class="kan-col status-' + key + '" data-column-status="' + esc(st) + '">' +
        '<header class="kan-head"><span>' + esc(st) + '</span><b>' + list.length + '</b></header>' +
        '<div class="kan-list" data-drop-status="' + esc(st) + '">' + (list.map(function (l) {
          var detail = l.config && l.config.summary ? l.config.summary : '';
          if (l.comment) detail += (detail ? '\n\n' : '') + l.comment;
          var price = l.price == null ? 'индивидуально' : Number(l.price).toLocaleString('ru-RU') + ' BYN';
          var opts = STATUSES.map(function (x) { return '<option value="' + esc(x) + '"' + (x === (l.status || 'новая') ? ' selected' : '') + '>' + esc(x) + '</option>'; }).join('');
          return '<article class="kan-card status-' + key + '" draggable="true" data-lead-id="' + l.id + '">' +
            '<div class="kan-top"><span class="kan-id">№' + l.id + ' · ' + esc(new Date(l.created_at).toLocaleString('ru-RU')) + '</span><span class="status-pill">' + esc(l.status || 'новая') + '</span></div>' +
            '<div class="client">' + esc(l.name || 'Без имени') + '</div>' +
            '<a class="phone" href="tel:' + esc((l.phone || '').replace(/[^\d+]/g, '')) + '">' + esc(l.phone || 'Телефон не указан') + '</a>' +
            '<div class="detail">' + esc((l.type === 'calc' ? 'Расчёт' : 'Звонок') + (detail ? '\n' + detail : '')) + '</div>' +
            '<div class="kan-price">' + esc(price) + '</div>' +
            (l.taken_by ? '<small>Ответственный: ' + esc(l.taken_by) + '</small>' : '') +
            '<div class="kan-actions"><select aria-label="Изменить статус заявки №' + l.id + '" data-lead-status="' + l.id + '">' + opts + '</select>' +
            '<button class="btn gold sm" data-get-estimate="' + l.id + '">Получить смету</button>' +
            '<button class="ic del" title="Удалить заявку" data-del-lead="' + l.id + '">✕</button></div></article>';
        }).join('') || '<p class="empty">Нет заявок</p>') + '</div></section>';
    }).join('') + '</div>';
  }
  function loadLeads() {
    return api('/api/lead').then(function (d) {
      if (!d.ok) return;
      STATUSES = d.statuses || ['новая','взята в работу','связались','назначен замер','отправлена смета','заключён договор','отказ','завершена'];
      LEADS = d.leads || [];
      var n = LEADS.filter(function (l) { return l.status === 'новая'; }).length;
      $('#newCount').textContent = n ? n : '';
      drawKanban(LEADS);
    });
  }
  $('#leadsReload').addEventListener('click', loadLeads);
  $('#leadsBoard').addEventListener('change', function (e) {
    var s = e.target.closest('[data-lead-status]'); if (!s) return;
    leadStatus(s.dataset.leadStatus, s.value);
  });
  $('#leadsBoard').addEventListener('click', function (e) {
    var q = e.target.closest('[data-get-estimate]');
    if (q) { e.preventDefault(); estimateFromLead(q.dataset.getEstimate); return; }
    var del = e.target.closest('[data-del-lead]');
    if (del && confirm('Удалить заявку №' + del.dataset.delLead + '?')) {
      api('/api/lead?id=' + del.dataset.delLead, {method:'DELETE'}).then(function (d) {
        if (d.ok) { toast('Заявка удалена'); loadLeads(); } else toast(d.error || 'Не удалось удалить',true);
      });
    }
  });
  var draggedLeadId = '';
  $('#leadsBoard').addEventListener('dragstart', function (e) {
    var card = e.target.closest('[data-lead-id]'); if (!card) return;
    draggedLeadId = card.dataset.leadId;
    card.classList.add('dragging');
    if (e.dataTransfer) { e.dataTransfer.setData('text/plain', draggedLeadId); e.dataTransfer.effectAllowed = 'move'; }
  });
  $('#leadsBoard').addEventListener('dragend', function (e) {
    var card=e.target.closest('[data-lead-id]'); if(card) card.classList.remove('dragging');
    $$('#leadsBoard .drop-target').forEach(function(x){x.classList.remove('drop-target');});
  });
  $('#leadsBoard').addEventListener('dragover', function (e) {
    var zone=e.target.closest('[data-drop-status]'); if(!zone) return;
    e.preventDefault(); zone.classList.add('drop-target');
    if(e.dataTransfer) e.dataTransfer.dropEffect='move';
  });
  $('#leadsBoard').addEventListener('dragleave', function (e) {
    var zone=e.target.closest('[data-drop-status]'); if(zone && !zone.contains(e.relatedTarget)) zone.classList.remove('drop-target');
  });
  $('#leadsBoard').addEventListener('drop', function (e) {
    var zone=e.target.closest('[data-drop-status]'); if(!zone) return;
    e.preventDefault(); zone.classList.remove('drop-target');
    var id=(e.dataTransfer && e.dataTransfer.getData('text/plain')) || draggedLeadId;
    if(!id) return;
    var lead=LEADS.find(function(x){return String(x.id)===String(id);});
    if(lead && lead.status!==zone.dataset.dropStatus) leadStatus(id,zone.dataset.dropStatus);
  });
  setInterval(function () { if (!$('#app').hidden) loadLeads(); }, 60000);

  /* ---------- калькулятор ---------- */
  function drawCalc() {
    var steps = ((C.calc && C.calc.steps) || []).filter(function (s) { return s.id !== 'monument'; });
    $('#calcEd').innerHTML = steps.map(function (s, si) {
      return '<div class="card step" data-si="' + si + '" data-id="' + esc(s.id) + '">' +
        '<div class="step-head">' + field('name', 'Шаг ' + (si + 1) + ' — название вкладки', s.name) + field('sub', 'Подсказка под заголовком', s.sub) +
        '<label>Выбор<select name="type"><option value="radio"' + (s.type !== 'multi' ? ' selected' : '') + '>Один вариант</option><option value="multi"' + (s.type === 'multi' ? ' selected' : '') + '>Несколько</option></select></label>' +
        '<div class="tools"><button class="ic" data-act="s-up" title="Выше">↑</button><button class="ic" data-act="s-down" title="Ниже">↓</button><button class="ic del" data-act="s-del" title="Удалить шаг">✕</button></div></div>' +
        '<div class="colh"><span>Позиция</span><span>Цена, BYN</span><span>Подпись вместо цены</span><span></span></div>' +
        '<div class="items">' + s.items.map(function (it, ii) {
          return '<div class="it" data-ii="' + ii + '" data-id="' + esc(it.id) + '"><input name="iname" value="' + esc(it.name) + '" placeholder="Название">' +
            '<input name="iprice" type="number" min="0" step="10" value="' + (it.price == null ? '' : it.price) + '" placeholder="инд. расчёт">' +
            '<input name="inote" value="' + esc(it.note || '') + '" placeholder="например: включено">' +
            '<div class="tools"><button class="ic" data-act="i-up">↑</button><button class="ic" data-act="i-down">↓</button><button class="ic del" data-act="i-del">✕</button></div></div>';
        }).join('') + '</div>' +
        '<button class="btn line sm" data-act="i-add" style="margin-top:12px">+ Позиция</button></div>';
    }).join('') || '<p class="empty">Шагов нет — добавьте первый.</p>';
  }
  function readCalc() {
    return { steps: $$('#calcEd .step').map(function (st) {
      return { id: st.dataset.id, name: $('[name=name]', st).value.trim() || 'Шаг', sub: $('[name=sub]', st).value.trim(), type: $('[name=type]', st).value,
        items: $$('.it', st).map(function (it) {
          var p = $('[name=iprice]', it).value.trim();
          return { id: it.dataset.id, name: $('[name=iname]', it).value.trim() || 'Позиция', price: p === '' ? null : Math.max(0, Math.round(+p)), note: $('[name=inote]', it).value.trim() || undefined };
        }).filter(function (x) { return x.name; }) };
    }) };
  }
  $('#calcEd').addEventListener('click', function (e) {
    var b = e.target.closest('[data-act]'); if (!b) return;
    var cal = readCalc(), st = b.closest('.step'), si = +st.dataset.si, it = b.closest('.it'), ii = it ? +it.dataset.ii : -1, a = b.dataset.act, arr = cal.steps;
    function mv(list, i, d) { var j = i + d; if (j < 0 || j >= list.length) return; var t = list[i]; list[i] = list[j]; list[j] = t; }
    if (a === 's-up') mv(arr, si, -1); if (a === 's-down') mv(arr, si, 1);
    if (a === 's-del' && confirm('Удалить шаг «' + arr[si].name + '»?')) arr.splice(si, 1);
    if (a === 'i-up') mv(arr[si].items, ii, -1); if (a === 'i-down') mv(arr[si].items, ii, 1);
    if (a === 'i-del') arr[si].items.splice(ii, 1);
    if (a === 'i-add') arr[si].items.push({ id: slug('item'), name: 'Новая позиция', price: 0 });
    C.calc = cal; drawCalc();
  });
  $('#addStep').addEventListener('click', function () {
    var cal = readCalc(); cal.steps.push({ id: slug('step'), name: 'Новый шаг', type: 'radio', sub: '', items: [{ id: slug('item'), name: 'Вариант', price: 0 }] });
    C.calc = cal; drawCalc();
  });

  /* ---------- каталог: разделы, обложки, модели — всё редактируется ---------- */
  var openCats = {};
  function catImg(src) { return src ? '<img src="' + esc(src) + '" alt="">' : '<span>✦</span>'; }
  function drawCatalog() {
    var K = C.catalog || { categories: [], items: [] };
    $('#catGranite').value = K.granite || '';
    $('#catEd').innerHTML = K.categories.map(function (c, ci) {
      var its = K.items.filter(function (x) { return x.cat === c.id; }), cv = c.cover || {};
      return '<div class="card catc" data-ci="' + ci + '">' +
        '<div class="top"><div class="cov"><div class="ph">' + catImg(cv.img) + '</div>' +
          '<label class="btn line sm">Обложка<input type="file" accept="image/*" data-up="cover" hidden></label>' +
          '<label>Масштаб обложки <input type="range" min="0.8" max="2.2" step="0.05" name="zoom" value="' + (cv.zoom || 1) + '"></label></div>' +
        '<div><div class="f">' + field('name', 'Название раздела', c.name) + field('short', 'Короткое (для калькулятора)', c.short) +
          field('price', 'Цена «от», BYN', c.price == null ? '' : c.price, { type: 'number', ph: 'инд.' }) + '</div>' +
          '<div class="f2">' + field('inc', 'Что входит (через запятую)', c.inc) + field('desc', 'Описание', c.desc, { area: true, rows: 2 }) + '</div>' +
          '<div style="margin-top:10px"><b style="font-size:13px">Комплект и размеры</b>' + (c.kit || []).map(function (k, ki) {
            return '<div class="kitrow" data-ki="' + ki + '"><input name="kn" value="' + esc(k[0]) + '" placeholder="Элемент"><input name="kv" value="' + esc(k[1] || '') + '" placeholder="Размер, напр. 100 × 60 × 5 см"><button class="ic del" data-c="kit-del">✕</button></div>';
          }).join('') + '<button class="link" data-c="kit-add" style="margin-top:6px">+ строка комплекта</button></div>' +
          '<div class="bar"><div style="display:flex;gap:18px;flex-wrap:wrap"><label class="chk"><input type="checkbox" name="visible"' + (c.visible !== false ? ' checked' : '') + '> Показывать на сайте</label>' +
          '<label class="chk"><input type="checkbox" name="incalc"' + (c.calc !== false ? ' checked' : '') + '> В калькуляторе (шаг «Памятник»)</label></div>' +
          '<div class="acts"><button class="ic" data-c="up" title="Выше">↑</button><button class="ic" data-c="down" title="Ниже">↓</button><button class="ic del" data-c="del" title="Удалить раздел">✕</button></div></div>' +
        '</div></div>' +
        '<details' + (openCats[c.id] ? ' open' : '') + ' data-id="' + esc(c.id) + '"><summary>Модели: ' + its.length + '</summary>' +
          '<div class="acts" style="margin-top:10px"><label class="btn line sm">+ Загрузить модели<input type="file" accept="image/*" multiple data-up="items" hidden></label></div>' +
          (openCats[c.id] ? '<div class="mods">' + its.map(function (m) {
            var gi = K.items.indexOf(m);
            return '<div class="mod" data-gi="' + gi + '"><div class="ph"><img loading="lazy" src="' + esc(m.img) + '" alt=""></div>' +
              '<input name="code" value="' + esc(m.code) + '" title="Артикул">' +
              '<div class="row"><select name="mcat" title="Раздел">' + K.categories.map(function (x) { return '<option value="' + esc(x.id) + '"' + (x.id === c.id ? ' selected' : '') + '>' + esc(x.short || x.name) + '</option>'; }).join('') + '</select>' +
              '<button class="ic" data-c="as-cover" title="Сделать обложкой">★</button><button class="ic del" data-c="m-del" title="Удалить">✕</button></div></div>';
          }).join('') + '</div>' : '') + '</details></div>';
    }).join('');
  }
  function readCatalog() {
    var K = C.catalog;
    K.granite = $('#catGranite').value.trim();
    $$('#catEd .catc').forEach(function (el) {
      var c = K.categories[+el.dataset.ci], v = function (n) { var i = $('[name=' + n + ']', el); return i ? i.value.trim() : ''; };
      c.name = v('name') || 'Раздел'; c.short = v('short'); c.inc = v('inc'); c.desc = v('desc');
      var p = v('price'); c.price = p === '' ? null : Math.max(0, Math.round(+p));
      c.visible = $('[name=visible]', el).checked;
      c.calc = $('[name=incalc]', el).checked;
      c.cover = c.cover || {}; c.cover.zoom = +$('[name=zoom]', el).value;
      c.kit = $$('.kitrow', el).map(function (r) { return [$('[name=kn]', r).value.trim(), $('[name=kv]', r).value.trim()]; }).filter(function (k) { return k[0]; });
      $$('.mod', el).forEach(function (m) {
        var it = K.items[+m.dataset.gi]; if (!it) return;
        it.code = $('[name=code]', m).value.trim() || it.code; it.cat = $('[name=mcat]', m).value;
      });
    });
  }
  $('#catEd').addEventListener('toggle', function (e) {
    var d = e.target; if (d.tagName !== 'DETAILS') return;
    var was = !!openCats[d.dataset.id]; openCats[d.dataset.id] = d.open;
    if (d.open && !was) { readCatalog(); drawCatalog(); }
  }, true);
  $('#catEd').addEventListener('click', function (e) {
    var b = e.target.closest('[data-c]'); if (!b) return;
    e.preventDefault(); readCatalog();
    var K = C.catalog, el = b.closest('.catc'), ci = +el.dataset.ci, c = K.categories[ci], a = b.dataset.c;
    if (a === 'kit-add') c.kit = (c.kit || []).concat([['', '']]);
    if (a === 'kit-del') c.kit.splice(+b.closest('.kitrow').dataset.ki, 1);
    if (a === 'up' && ci > 0) { K.categories.splice(ci - 1, 0, K.categories.splice(ci, 1)[0]); }
    if (a === 'down' && ci < K.categories.length - 1) { K.categories.splice(ci + 1, 0, K.categories.splice(ci, 1)[0]); }
    if (a === 'del') {
      var n = K.items.filter(function (x) { return x.cat === c.id; }).length;
      if (!confirm('Удалить раздел «' + c.name + '»' + (n ? ' и ' + n + ' моделей в нём' : '') + '?')) return;
      K.items = K.items.filter(function (x) { return x.cat !== c.id; }); K.categories.splice(ci, 1);
    }
    if (a === 'm-del') { var gi = +b.closest('.mod').dataset.gi; if (!confirm('Удалить модель ' + K.items[gi].code + '?')) return; K.items.splice(gi, 1); }
    if (a === 'as-cover') { var it = K.items[+b.closest('.mod').dataset.gi]; c.cover = c.cover || {}; c.cover.img = it.img; toast('Обложка выбрана — не забудьте «Сохранить»'); }
    drawCatalog();
  });
  $('#catEd').addEventListener('change', function (e) {
    var inp = e.target; if (!inp.dataset.up) return;
    readCatalog();
    var K = C.catalog, el = inp.closest('.catc'), c = K.categories[+el.dataset.ci], files = [].slice.call(inp.files || []);
    inp.value = ''; if (!files.length) return;
    toast('Загружаем ' + files.length + ' фото…');
    var prefix = (c.short || c.name || 'M').trim().charAt(0).toUpperCase();
    files.reduce(function (p, f) {
      return p.then(function () { return compress(f); }).then(function (data) { return api('/api/upload', { method: 'POST', body: { data: data } }); })
        .then(function (d) {
          if (!d.ok) return toast(d.error || 'Фото не загрузилось', true);
          if (inp.dataset.up === 'cover') { c.cover = c.cover || {}; c.cover.img = d.url; }
          else { var n = K.items.filter(function (x) { return x.cat === c.id; }).length + 1; K.items.push({ code: prefix + '-' + n, cat: c.id, img: d.url }); openCats[c.id] = true; }
        });
    }, Promise.resolve()).then(function () { drawCatalog(); return save('catalog', C.catalog); });
  });
  $('#addCat').addEventListener('click', function () {
    readCatalog();
    C.catalog.categories.push({ id: slug('cat'), name: 'Новый раздел', short: 'Новый', price: null, inc: '', desc: '', kit: [], cover: { img: '', zoom: 1 }, visible: true });
    drawCatalog(); toast('Раздел добавлен — заполните и нажмите «Сохранить»');
  });

  /* ---------- примеры работ ---------- */
  function drawWorks() {
    var w = C.works || [];
    $('#worksEd').innerHTML = w.map(function (x, i) {
      return '<div class="w" data-i="' + i + '"><div class="ph"><img src="' + esc(x.img) + '" alt=""></div>' +
        '<input name="cap" value="' + esc(x.caption || '') + '" placeholder="Подпись">' +
        '<div class="tools"><span><button class="ic" data-w="up">←</button> <button class="ic" data-w="down">→</button></span><button class="ic del" data-w="del" title="Убрать">✕</button></div></div>';
    }).join('') || '<p class="empty">Фото нет — загрузите первые.</p>';
  }
  $('#worksEd').addEventListener('input', function (e) { var w = e.target.closest('.w'); if (w && e.target.name === 'cap') C.works[+w.dataset.i].caption = e.target.value; });
  $('#worksEd').addEventListener('click', function (e) {
    var b = e.target.closest('[data-w]'); if (!b) return;
    var i = +b.closest('.w').dataset.i, w = C.works, a = b.dataset.w;
    if (a === 'up' && i > 0) { var t = w[i]; w[i] = w[i - 1]; w[i - 1] = t; }
    if (a === 'down' && i < w.length - 1) { var t2 = w[i]; w[i] = w[i + 1]; w[i + 1] = t2; }
    if (a === 'del' && confirm('Убрать фото с сайта?')) w.splice(i, 1);
    drawWorks();
  });
  function compress(file) {                      // в webp ≤1600px, чтобы сайт летал
    return new Promise(function (ok, no) {
      var fr = new FileReader();
      fr.onload = function () {
        var im = new Image();
        im.onload = function () {
          var k = Math.min(1, 1600 / Math.max(im.width, im.height)), c = document.createElement('canvas');
          c.width = Math.round(im.width * k); c.height = Math.round(im.height * k);
          c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
          var d = c.toDataURL('image/webp', 0.84); if (d.indexOf('data:image/webp') !== 0) d = c.toDataURL('image/jpeg', 0.86);
          ok(d);
        };
        im.onerror = no; im.src = fr.result;
      };
      fr.onerror = no; fr.readAsDataURL(file);
    });
  }
  $('#worksFile').addEventListener('change', function (e) {
    var files = [].slice.call(e.target.files || []); e.target.value = '';
    if (!files.length) return;
    toast('Загружаем ' + files.length + ' фото…');
    files.reduce(function (p, f) {
      return p.then(function () { return compress(f); }).then(function (data) { return api('/api/upload', { method: 'POST', body: { data: data } }); })
        .then(function (d) { if (d.ok) { C.works = C.works || []; C.works.push({ img: d.url, caption: '' }); drawWorks(); } else toast(d.error || 'Фото не загрузилось', true); });
    }, Promise.resolve()).then(function () { return save('works', C.works); });
  });

  /* ---------- тексты / контакты / telegram ---------- */
  var TEXTS = [['heroTitle', 'Заголовок первого экрана'], ['heroLead', 'Текст под заголовком', 1], ['worksLead', 'Подпись к «Примерам работ»', 1],
    ['manifesto', 'Манифест', 1], ['calcTitle', 'Заголовок калькулятора'], ['calcLead', 'Текст калькулятора', 1], ['priceNote', 'Примечание о ценах', 1]];
  function drawTexts() { var t = C.texts || {}; $('#textsEd').innerHTML = TEXTS.map(function (x) { return field(x[0], x[1], t[x[0]], { area: !!x[2], wide: !!x[2] }); }).join(''); }
  var CONTACTS = [['phone', 'Телефон', '+375 (29) 123-45-67'], ['telegram', 'Telegram', '@username или ссылка'], ['viber', 'Viber (номер)', '+375291234567'],
    ['whatsapp', 'WhatsApp (номер)', '+375291234567'], ['instagram', 'Instagram', 'ссылка'], ['email', 'Почта', 'mail@…'], ['company', 'ИП / организация', 'ИП Иванов И. И.'], ['unp', 'УНП', '123456789']];
  function drawContacts() { var c = C.contacts || {}; $('#contactsEd').innerHTML = CONTACTS.map(function (x) { return field(x[0], x[1], c[x[0]], { ph: x[2] }); }).join(''); }
  function drawTg() {
    var t = C.telegram || {};
    $('#tgEd').innerHTML = '<label class="wide" style="display:flex;align-items:center;gap:10px;color:var(--ink)"><input type="checkbox" name="enabled" style="width:auto"' + (t.enabled ? ' checked' : '') + '> Отправлять заявки в Telegram</label>' +
      field('token', 'Токен бота (от @BotFather)', t.token, { type: 'password', ph: '123456:ABC…' }) + field('chat', 'ID группы', t.chat, { ph: '-100…' });
  }
  $$('[data-tg]').forEach(function (b) {
    b.addEventListener('click', function () {
      var out = $('#tgOut'); out.hidden = false; out.textContent = 'Проверяем…';
      api('/api/tg?action=' + b.dataset.tg, { method: 'POST' }).then(function (d) {
        if (b.dataset.tg === 'info' && d.ok) out.textContent = 'Бот: @' + d.bot.username + '\nКнопки подключены: ' + (d.webhook && d.webhook.url ? 'да' : 'нет');
        else out.textContent = d.ok ? 'Готово ✅' : 'Ошибка: ' + (d.error || 'не получилось');
      });
    });
  });

  /* ---------- журнал ---------- */
  function loadLog() {
    api('/api/log').then(function (d) {
      if (!d.ok) return;
      $('#logTbl').innerHTML = d.log.length ? '<table><thead><tr><th>Когда</th><th>Действие</th><th>Подробности</th><th>IP</th></tr></thead><tbody>' + d.log.map(function (x) {
        return '<tr class="' + (x.ok ? '' : 'bad') + '"><td>' + new Date(x.at).toLocaleString('ru-RU') + '</td><td>' + esc(x.action) + '</td><td>' + esc(x.detail) + '</td><td>' + esc(x.ip) + '</td></tr>';
      }).join('') + '</tbody></table>' : '<p class="empty">Пока пусто</p>';
    });
  }
  $('#logReload').addEventListener('click', loadLog);

  /* ---------- пароль ---------- */
  $('#pwForm').addEventListener('submit', function (e) {
    e.preventDefault(); var f = e.target;
    if (f.password.value !== f.password2.value) return toast('Пароли не совпадают', true);
    api('/api/auth', { method: 'PATCH', body: { login: f.login.value.trim() || undefined, password: f.password.value } }).then(function (d) {
      if (d.ok) { f.reset(); $('#me').textContent = d.user; toast('Логин и пароль обновлены'); } else toast(d.error, true);
    });
  });
})();
