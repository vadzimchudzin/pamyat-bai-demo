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
    return fetch(path, { method: opt.method || 'GET', credentials: 'same-origin', cache: 'no-store', headers: opt.body ? { 'content-type': 'application/json' } : {}, body: opt.body ? JSON.stringify(opt.body) : undefined })
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
    $$('#nav button').forEach(function (x) { x.classList.toggle('on', x.dataset.p === name); });
    $$('.pane').forEach(function (p) { p.classList.toggle('on', p.id === 'p-' + name); });
    if (name === 'log') loadLog();
    if (name === 'leads') loadLeads();
    if (name === 'pricebook') loadPricebook();
    if (name === 'estimates') loadEstimates();
    if (name === 'notes') loadNotes();
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
  var STATUSES = [], LEADS = [], lastLeadSignature = '', leadsRequestInFlight = false;
  var STATUS_KEYS = {
    'новая':'new','взята в работу':'working','связались':'contacted','назначен замер':'measure',
    'отправлена смета':'estimate','заключён договор':'contract','отказ':'rejected','завершена':'done'
  };
  function statusKey(s) { return STATUS_KEYS[s] || 'new'; }
  function leadStatus(id, status) {
    return api('/api/lead', {method:'PATCH', body:{id:Number(id),status:status}}).then(function (d) {
      if (d.ok) { toast(d.telegramSync === false ? ('Статус сохранён, но Telegram не обновился: ' + (d.telegramError || 'проверьте бота')) : ('Статус заявки №' + id + ': ' + status)); return loadLeads(); }
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
  function leadSignature(leads) {
    return JSON.stringify((leads || []).map(function (l) {
      return [l.id,l.status,l.name,l.phone,l.type,l.price,l.comment,l.config,l.taken_by,l.tg_msg_id,l.created_at,l.history];
    }));
  }
  function loadLeads(options) {
    options = options || {};
    if (leadsRequestInFlight) return Promise.resolve();
    leadsRequestInFlight = true;
    return api('/api/lead').then(function (d) {
      if (!d.ok) return;
      STATUSES = d.statuses || ['новая','взята в работу','связались','назначен замер','отправлена смета','заключён договор','отказ','завершена'];
      var incoming = d.leads || [], signature = leadSignature(incoming);
      var changed = signature !== lastLeadSignature;
      LEADS = incoming;
      var n = LEADS.filter(function (l) { return l.status === 'новая'; }).length;
      $('#newCount').textContent = n ? n : '';
      if (changed || options.force) {
        lastLeadSignature = signature;
        drawKanban(LEADS);
      }
    }).catch(function () {
      // Keep the existing board visible during temporary network errors.
    }).finally(function () { leadsRequestInFlight = false; });
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
  // Poll only the active board; update cards without reloading the page.
  // The request guard prevents overlapping calls if Neon/Vercel responds slowly.
  setInterval(function () {
    if (!$('#app').hidden && document.visibilityState === 'visible' &&
        $('#p-leads').classList.contains('on') && !draggedLeadId) loadLeads({silent:true});
  }, 1500);
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible' && !$('#app').hidden &&
        $('#p-leads').classList.contains('on')) loadLeads({silent:true});
  });

  /* ---------- калькулятор ---------- */
  function calcDimensionsConfig() {
    var d = C.calc && C.calc.dimensions || {};
    return {
      enabled: d.enabled !== false,
      name: d.name || 'Размеры',
      sub: d.sub || 'Укажите длину и ширину участка. Это необязательно — без размеров расчёт останется по базовым ценам.',
      unit: d.unit || 'м',
      min: Number.isFinite(+d.min) && +d.min > 0 ? +d.min : 0.1,
      max: Number.isFinite(+d.max) && +d.max > 0 ? +d.max : 100,
      step: Number.isFinite(+d.step) && +d.step > 0 ? +d.step : 0.1,
      allowSkip: d.allowSkip !== false
    };
  }
  function defaultPricing(it) {
    var raw = it && it.pricing || {}, name = String(it && it.name || '');
    var detected = /(?:м²|м2|кв\.?\s*м)/i.test(name) ? 'area'
      : /(?:м\.?\s*п\.?|погонн(?:ый|ых)?\s+метр)/i.test(name) ? 'linear' : 'fixed';
    var mode = raw.mode || detected;
    var oldK = raw.coefficient || {};
    return {
      mode: mode === 'area' || mode === 'linear' ? mode : 'fixed',
      quantity: raw.quantity || (mode === 'area' ? 'area' : mode === 'linear' ? 'perimeter' : 'unit'),
      coefficient: {
        enabled: oldK.enabled === true,
        formula: oldK.formula === 'linear' ? 'linear' : 'inverse',
        basis: oldK.basis || 'area',
        applyWhen: oldK.applyWhen || 'below',
        reference: Number.isFinite(+oldK.reference) && +oldK.reference > 0 ? +oldK.reference : 4,
        start: Number.isFinite(+oldK.start) && +oldK.start > 0 ? +oldK.start : 1,
        rate: Number.isFinite(+oldK.rate) && +oldK.rate >= 0 ? +oldK.rate : 0.15,
        power: Number.isFinite(+oldK.power) && +oldK.power > 0 ? +oldK.power : 1,
        min: Number.isFinite(+oldK.min) && +oldK.min >= 0 ? +oldK.min : 1,
        max: Number.isFinite(+oldK.max) && +oldK.max > 0 ? +oldK.max : 2
      }
    };
  }
  function numField(name, label, value, step, min, max) {
    return '<label>' + label + '<input name="' + name + '" type="number" step="' + step + '" min="' + min + '"' +
      (max == null ? '' : ' max="' + max + '"') + ' value="' + esc(value) + '"></label>';
  }
  function drawCalcDimensions() {
    var d = calcDimensionsConfig();
    $('#calcDimensionsEd').innerHTML =
      '<div class="calc-admin-head"><div><b>Шаг 2 — размеры участка</b><p class="hint">Шаг автоматически добавляется сразу после выбора памятника. Клиент может его пропустить; без размеров сохраняются базовые цены.</p></div>' +
      '<label class="chk"><input type="checkbox" name="dimensionsEnabled"' + (d.enabled ? ' checked' : '') + '> Показывать шаг размеров</label></div>' +
      '<div class="calc-dim-grid">' +
      '<label>Название шага<input name="dimensionsName" value="' + esc(d.name) + '"></label>' +
      '<label>Единица измерения<input value="м — метры" disabled></label>' +
      '<label class="wide">Подсказка пользователю<input name="dimensionsSub" value="' + esc(d.sub) + '"></label>' +
      numField('dimensionsMin', 'Минимальный размер', d.min, '0.01', '0.01') +
      numField('dimensionsMax', 'Максимальный размер', d.max, '0.1', '0.1') +
      numField('dimensionsStep', 'Шаг ввода', d.step, '0.01', '0.01') +
      '<label class="chk"><input type="checkbox" name="dimensionsAllowSkip"' + (d.allowSkip ? ' checked' : '') + '> Разрешить пропуск шага</label>' +
      '</div>';
  }
  function drawCalc() {
    var steps = ((C.calc && C.calc.steps) || []).filter(function (s) { return s.id !== 'monument'; });
    drawCalcDimensions();
    $('#calcEd').innerHTML = steps.map(function (s, si) {
      return '<div class="card step" data-si="' + si + '" data-id="' + esc(s.id) + '">' +
        '<div class="step-head">' + field('name', 'Шаг ' + (si + 1) + ' — название вкладки', s.name) + field('sub', 'Подсказка под заголовком', s.sub) +
        '<label>Выбор<select name="type"><option value="radio"' + (s.type !== 'multi' ? ' selected' : '') + '>Один вариант</option><option value="multi"' + (s.type === 'multi' ? ' selected' : '') + '>Несколько</option></select></label>' +
        '<div class="tools"><button class="ic" data-act="s-up" title="Выше">↑</button><button class="ic" data-act="s-down" title="Ниже">↓</button><button class="ic del" data-act="s-del" title="Удалить шаг">✕</button></div></div>' +
        '<div class="colh calc-colh"><span>Позиция</span><span>Базовая цена, BYN</span><span>Подпись</span><span>Тарификация</span><span></span></div>' +
        '<div class="items">' + (s.items || []).map(function (it, ii) {
          var p = defaultPricing(it), k = p.coefficient;
          return '<div class="it calc-it" data-ii="' + ii + '" data-id="' + esc(it.id) + '">' +
            '<div class="it-main">' +
            '<input name="iname" value="' + esc(it.name) + '" placeholder="Название">' +
            '<input name="iprice" type="number" min="0" step="0.01" value="' + (it.price == null ? '' : it.price) + '" placeholder="инд. расчёт">' +
            '<input name="inote" value="' + esc(it.note || '') + '" placeholder="Подпись / примечание">' +
            '<select name="pmode" aria-label="Тип тарификации"><option value="fixed"' + (p.mode === 'fixed' ? ' selected' : '') + '>Фиксированная</option><option value="linear"' + (p.mode === 'linear' ? ' selected' : '') + '>За пог. метр</option><option value="area"' + (p.mode === 'area' ? ' selected' : '') + '>За м²</option></select>' +
            '<div class="tools"><button class="ic" data-act="i-up" title="Выше">↑</button><button class="ic" data-act="i-down" title="Ниже">↓</button><button class="ic del" data-act="i-del" title="Удалить">✕</button></div>' +
            '</div>' +
            '<details class="it-pricing"' + (p.mode !== 'fixed' || k.enabled ? ' open' : '') + '><summary>Расчёт количества и коэффициент смещения</summary>' +
            '<div class="pricing-grid">' +
            (p.mode === 'linear' ? '<label>Как измерять погонный метр<select name="pquantity">' +
              '<option value="perimeter"' + (p.quantity === 'perimeter' ? ' selected' : '') + '>Периметр участка</option>' +
              '<option value="halfPerimeter"' + (p.quantity === 'halfPerimeter' ? ' selected' : '') + '>Половина периметра</option>' +
              '<option value="length"' + (p.quantity === 'length' ? ' selected' : '') + '>Длина</option>' +
              '<option value="width"' + (p.quantity === 'width' ? ' selected' : '') + '>Ширина</option>' +
              '</select></label>' : (p.mode === 'area' ? '<div class="quantity-fixed"><b>Количество</b><span>Площадь участка (м²)</span><input type="hidden" name="pquantity" value="area"></div>' : '<input type="hidden" name="pquantity" value="unit">')) +
            '<div class="coefficient-box">' +
            '<div class="coefficient-title"><b>Коэффициент смещения</b><label class="chk"><input type="checkbox" name="kenabled"' + (k.enabled ? ' checked' : '') + (p.mode === 'fixed' ? ' disabled' : '') + '> Использовать</label></div>' +
            '<p class="hint">' + (p.mode === 'fixed' ? 'Коэффициент включается для позиций с тарификацией за погонный или квадратный метр.' : 'Настройка независима для каждой позиции. Коэффициент умножает стоимость позиции после расчёта количества.') + '</p>' +
            '<div class="pricing-grid">' +
            '<label>Формула<select name="kformula"><option value="inverse"' + (k.formula === 'inverse' ? ' selected' : '') + '>Пропорциональная</option><option value="linear"' + (k.formula === 'linear' ? ' selected' : '') + '>Линейная</option></select></label>' +
            '<label>По какому размеру<select name="kbasis"><option value="area"' + (k.basis === 'area' ? ' selected' : '') + '>Площадь, м²</option><option value="perimeter"' + (k.basis === 'perimeter' ? ' selected' : '') + '>Периметр, м</option><option value="length"' + (k.basis === 'length' ? ' selected' : '') + '>Длина, м</option><option value="width"' + (k.basis === 'width' ? ' selected' : '') + '>Ширина, м</option></select></label>' +
            '<label>Когда применять<select name="kwhen"><option value="below"' + (k.applyWhen === 'below' ? ' selected' : '') + '>Когда меньше отправной точки</option><option value="above"' + (k.applyWhen === 'above' ? ' selected' : '') + '>Когда больше отправной точки</option><option value="both"' + (k.applyWhen === 'both' ? ' selected' : '') + '>В обе стороны</option></select></label>' +
            numField('kreference', 'Отправная точка', k.reference, '0.01', '0.01') +
            numField('kstart', 'Коэффициент в отправной точке', k.start, '0.01', '0') +
            numField('krate', 'Изменение за единицу (для линейной)', k.rate, '0.01', '0') +
            numField('kpower', 'Степень (для пропорциональной)', k.power, '0.01', '0.01') +
            numField('kmin', 'Минимальный коэффициент', k.min, '0.01', '0') +
            numField('kmax', 'Максимальный коэффициент', k.max, '0.01', '0.01') +
            '</div><div class="coefficient-preview" data-kpreview>Пример коэффициента будет рассчитан автоматически.</div>' +
            '</div></div></details></div>';
        }).join('') + '</div>' +
        '<button class="btn line sm" data-act="i-add" style="margin-top:12px">+ Позиция</button></div>';
    }).join('') || '<p class="empty">Шагов нет — добавьте первый.</p>';
    updateCalcPricingPreviews();
  }
  function previewCoefficient(k, sample) {
    if (!k.enabled) return 1;
    var diff = sample - k.reference, active = k.applyWhen === 'both' || (k.applyWhen === 'below' && diff < 0) || (k.applyWhen === 'above' && diff > 0);
    if (!active) return 1;
    var value;
    if (k.formula === 'inverse') value = k.start * Math.pow(k.reference / Math.max(0.01, sample), k.power);
    else value = k.start + Math.abs(diff) * k.rate;
    return Math.min(Math.max(k.min, value), Math.max(k.min, k.max));
  }
  function updateCalcPricingPreviews() {
    $$('#calcEd .calc-it').forEach(function (row) {
      var box = $('[data-kpreview]', row); if (!box) return;
      var k = {
        enabled: $('[name=kenabled]', row).checked,
        formula: $('[name=kformula]', row).value,
        reference: Math.max(0.01, +$('[name=kreference]', row).value || 4),
        start: Math.max(0, +$('[name=kstart]', row).value || 1),
        rate: Math.max(0, +$('[name=krate]', row).value || 0),
        power: Math.max(0.01, +$('[name=kpower]', row).value || 1),
        min: Math.max(0, +$('[name=kmin]', row).value || 0),
        max: Math.max(0.01, +$('[name=kmax]', row).value || 2),
        applyWhen: $('[name=kwhen]', row).value
      };
      if (!k.enabled) { box.textContent = 'Коэффициент отключён — стоимость рассчитывается без надбавки.'; return; }
      var a = previewCoefficient(k, Math.max(0.1, k.reference / 2));
      var b = previewCoefficient(k, k.reference);
      var c = previewCoefficient(k, k.reference * 1.5);
      box.textContent = 'Проверка: при размере ' + (k.reference / 2).toFixed(2) + ' → ×' + a.toFixed(2) +
        '; в отправной точке ' + k.reference.toFixed(2) + ' → ×' + b.toFixed(2) +
        '; при размере ' + (k.reference * 1.5).toFixed(2) + ' → ×' + c.toFixed(2) + '.';
    });
  }
  function readCalc() {
    var d = $('#calcDimensionsEd'), dims = {
      enabled: $('[name=dimensionsEnabled]', d).checked,
      name: $('[name=dimensionsName]', d).value.trim() || 'Размеры',
      sub: $('[name=dimensionsSub]', d).value.trim(),
      unit: 'м',
      min: Math.max(0.01, +$('[name=dimensionsMin]', d).value || 0.1),
      max: Math.max(0.01, +$('[name=dimensionsMax]', d).value || 100),
      step: Math.max(0.01, +$('[name=dimensionsStep]', d).value || 0.1),
      allowSkip: $('[name=dimensionsAllowSkip]', d).checked
    };
    if (dims.max < dims.min) dims.max = dims.min;
    return { dimensions: dims, steps: $$('#calcEd .step').map(function (st) {
      return { id: st.dataset.id, name: $('[name=name]', st).value.trim() || 'Шаг', sub: $('[name=sub]', st).value.trim(), type: $('[name=type]', st).value,
        items: $$('.it', st).map(function (it) {
          var p = $('[name=iprice]', it).value.trim(), mode = $('[name=pmode]', it).value;
          var q = $('[name=pquantity]', it);
          var enabled = $('[name=kenabled]', it).checked;
          var minK = Math.max(0, +$('[name=kmin]', it).value || 0);
          var maxK = Math.max(minK, +$('[name=kmax]', it).value || 2);
          return {
            id: it.dataset.id,
            name: $('[name=iname]', it).value.trim() || 'Позиция',
            price: p === '' ? null : Math.max(0, Math.round(+p * 100) / 100),
            note: $('[name=inote]', it).value.trim() || undefined,
            pricing: {
              mode: mode,
              quantity: q && q.type !== 'hidden' ? q.value : (mode === 'area' ? 'area' : mode === 'linear' ? 'perimeter' : 'unit'),
              coefficient: {
                enabled: enabled,
                formula: $('[name=kformula]', it).value,
                basis: $('[name=kbasis]', it).value,
                applyWhen: $('[name=kwhen]', it).value,
                reference: Math.max(0.01, +$('[name=kreference]', it).value || 4),
                start: Math.max(0, +$('[name=kstart]', it).value || 1),
                rate: Math.max(0, +$('[name=krate]', it).value || 0),
                power: Math.max(0.01, +$('[name=kpower]', it).value || 1),
                min: minK,
                max: maxK
              }
            }
          };
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
    if (a === 'i-add') arr[si].items.push({ id: slug('item'), name: 'Новая позиция', price: 0, pricing: { mode: 'fixed' } });
    C.calc = cal; drawCalc();
  });
  $('#calcEd').addEventListener('input', updateCalcPricingPreviews);
  $('#calcEd').addEventListener('change', function (e) {
    if (e.target && e.target.name === 'pmode') {
      var cal = readCalc(); C.calc = cal; drawCalc(); return;
    }
    updateCalcPricingPreviews();
  });
  $('#calcDimensionsEd').addEventListener('change', function (e) {
    if (e.target && e.target.name === 'dimensionsEnabled') {
      var d = readCalc(); C.calc = d; drawCalc();
    }
  });
  $('#addStep').addEventListener('click', function () {
    var cal = readCalc(); cal.steps.push({ id: slug('step'), name: 'Новый шаг', type: 'radio', sub: '', items: [{ id: slug('item'), name: 'Вариант', price: 0 }] });
    C.calc = cal; drawCalc();
  });

  /* ---------- каталог: разделы, обложки, модели — всё редактируется ---------- */
  var openCats = {};
  function catImg(src, zoom) {
    var scale = Math.max(0.8, Math.min(2.2, Number(zoom) || 1));
    return src ? '<img src="' + esc(src) + '" alt="" style="transform:scale(' + scale + ')">' : '<span>✦</span>';
  }
  function drawCatalog() {
    var K = C.catalog || { categories: [], items: [] };
    $('#catGranite').value = K.granite || '';
    var sameSizeAll = K.sameSizeAll === true;
    var commonSize = K.commonSize || '';
    $('#catEd').innerHTML = '<div class="card size-global">' +
      '<div class="size-global-head"><div><b>Единый размер для выбранных элементов</b><p class="hint">Включите настройку, укажите размер ниже, затем в нужных разделах включите выбор элементов и отметьте конкретные строки комплекта. Общий размер заменит размеры только у отмеченных строк.</p></div>' +
      '<label class="chk"><input type="checkbox" name="sameSizeAll"' + (sameSizeAll ? ' checked' : '') + '> Включить общий размер</label></div>' +
      (sameSizeAll ? '<div class="size-global-field">' + field('commonSize', 'Общий размер для отмеченных элементов', commonSize, { wide:true, ph:'Например: 100 × 50 × 5 см' }) +
        '<p class="hint">Размер применяется ко всем отмеченным позициям во всех разделах. Неотмеченные позиции сохраняют собственные размеры.</p></div>' : '') +
      '</div>' + K.categories.map(function (c, ci) {
      var its = K.items.filter(function (x) { return x.cat === c.id; }), cv = c.cover || {};
      return '<div class="card catc" data-ci="' + ci + '">' +
        '<div class="top"><div class="cov"><div class="ph">' + catImg(cv.img, cv.zoom) + '</div>' +
          '<label class="btn line sm">Обложка<input type="file" accept="image/*" data-up="cover" hidden></label>' +
          '<label class="cover-zoom-label">Масштаб обложки <output data-zoom-label>' + Math.round((cv.zoom || 1) * 100) + '%</output><input type="range" min="0.8" max="2.2" step="0.05" name="zoom" value="' + (cv.zoom || 1) + '"></label></div>' +
        '<div><div class="f">' + field('name', 'Название раздела', c.name) + field('short', 'Короткое (для калькулятора)', c.short) +
          field('price', 'Цена «от», BYN', c.price == null ? '' : c.price, { type: 'number', ph: 'инд.' }) + '</div>' +
          '<div class="f2">' + field('inc', 'Что входит (через запятую)', c.inc) + field('desc', 'Описание', c.desc, { area: true, rows: 2 }) + '</div>' +
          '<div style="margin-top:10px"><b style="font-size:13px">Комплект и размеры</b>' + (c.kit || []).map(function (k, ki) {
            var rowUsesCommon = sameSizeAll && c.useCommonKitSize === true && k[2] === true;
            return '<div class="kitrow' + (sameSizeAll && c.useCommonKitSize === true ? ' with-common-size' : '') + '" data-ki="' + ki + '">' +
              (sameSizeAll && c.useCommonKitSize === true ? '<label class="kit-common-check" title="Применить общий размер к этой позиции"><input type="checkbox" name="commonKitRow" aria-label="Применять общий размер к ' + esc(k[0] || 'элементу') + '"' + (k[2] === true ? ' checked' : '') + '></label>' : '') +
              '<input name="kn" value="' + esc(k[0]) + '" placeholder="Элемент">' +
              '<input name="kv" value="' + esc(rowUsesCommon ? commonSize : (k[1] || '')) + '" data-individual-value="' + esc(k[1] || '') + '" placeholder="Размер, напр. 100 × 60 × 5 см"' + (rowUsesCommon ? ' disabled' : '') + '>' +
              '<button class="ic del" data-c="kit-del">✕</button></div>';
          }).join('') + '<button class="link" data-c="kit-add" style="margin-top:6px">+ строка комплекта</button>' +
          (sameSizeAll ? '<div class="kit-shared-toggle"><label class="chk"><input type="checkbox" name="useCommonKitSize"' + (c.useCommonKitSize === true ? ' checked' : '') + '> Выбирать элементы для общего размера</label><p class="hint">Включите — появятся галочки рядом с каждой строкой комплекта. Отметьте только те позиции, которым нужно задать общий размер.</p></div>' : '') + '</div>' +
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
    var sharedToggle = $('#catEd [name=sameSizeAll]');
    if (sharedToggle) K.sameSizeAll = sharedToggle.checked;
    var sharedInput = $('#catEd [name=commonSize]');
    if (sharedInput) K.commonSize = sharedInput.value.trim();
    if (K.commonSize == null) K.commonSize = '';
    K.granite = $('#catGranite').value.trim();
    $$('#catEd .catc').forEach(function (el) {
      var c = K.categories[+el.dataset.ci], v = function (n) { var i = $('[name=' + n + ']', el); return i ? i.value.trim() : ''; };
      c.name = v('name') || 'Раздел'; c.short = v('short'); c.inc = v('inc'); c.desc = v('desc');
      var p = v('price'); c.price = p === '' ? null : Math.max(0, Math.round(+p));
      c.visible = $('[name=visible]', el).checked;
      c.calc = $('[name=incalc]', el).checked;
      c.cover = c.cover || {}; c.cover.zoom = +$('[name=zoom]', el).value;
      var previousKit = Array.isArray(c.kit) ? c.kit : [];
      var sectionCommonToggle = $('[name=useCommonKitSize]', el);
      if (sectionCommonToggle) c.useCommonKitSize = sectionCommonToggle.checked;
      c.kit = $$('.kitrow', el).map(function (r) {
        var index = +r.dataset.ki, old = previousKit[index] || [];
        var commonToggle = $('[name=commonKitRow]', r), sizeInput = $('[name=kv]', r);
        var wasChecked = commonToggle ? commonToggle.checked : old[2] === true;
        var selected = c.useCommonKitSize === true && wasChecked;
        var individualSize = wasChecked
          ? (sizeInput.dataset.individualValue || old[1] || '')
          : (sizeInput.value || '').trim();
        return [$('[name=kn]', r).value.trim(), individualSize, selected];
      }).filter(function (k) { return k[0]; });
      $$('.mod', el).forEach(function (m) {
        var it = K.items[+m.dataset.gi]; if (!it) return;
        it.code = $('[name=code]', m).value.trim() || it.code; it.cat = $('[name=mcat]', m).value;
      });
    });
  }
  $('#catEd').addEventListener('input', function (e) {
    var inp = e.target;
    if (inp.name === 'zoom') {
      var card = inp.closest('.catc'), preview = card && card.querySelector('.cov .ph img'), out = card && card.querySelector('[data-zoom-label]');
      var zoom = Math.max(0.8, Math.min(2.2, Number(inp.value) || 1));
      if (preview) preview.style.transform = 'scale(' + zoom + ')';
      if (out) out.textContent = Math.round(zoom * 100) + '%';
      var category = C.catalog && C.catalog.categories[+(card && card.dataset.ci)];
      if (category) { category.cover = category.cover || {}; category.cover.zoom = zoom; }
      return;
    }
    if (inp.name === 'kv' && !inp.disabled) inp.dataset.individualValue = inp.value;
    if (inp.name === 'commonSize') {
      var K = C.catalog || {};
      K.commonSize = inp.value;
      $$('.kitrow', $('#catEd')).forEach(function (row) {
        var commonToggle = $('[name=commonKitRow]', row), sizeInput = $('[name=kv]', row);
        if (commonToggle && commonToggle.checked) sizeInput.value = inp.value;
      });
    }
  });
  $('#catEd').addEventListener('change', function (e) {
    var target = e.target, name = target && target.name;
    if (name === 'commonKitRow') {
      var row = target.closest('.kitrow'), sizeInput = $('[name=kv]', row);
      if (target.checked) {
        sizeInput.dataset.individualValue = sizeInput.dataset.individualValue || sizeInput.value;
        sizeInput.value = C.catalog.commonSize || '';
        sizeInput.disabled = true;
      } else {
        sizeInput.disabled = false;
        sizeInput.value = sizeInput.dataset.individualValue || '';
      }
    }
    if (name !== 'sameSizeAll' && name !== 'useCommonKitSize' && name !== 'commonKitRow') return;
    readCatalog();
    drawCatalog();
  });
  $('#catEd').addEventListener('toggle', function (e) {
    var d = e.target; if (d.tagName !== 'DETAILS') return;
    var was = !!openCats[d.dataset.id]; openCats[d.dataset.id] = d.open;
    if (d.open && !was) { readCatalog(); drawCatalog(); }
  }, true);
  $('#catEd').addEventListener('click', function (e) {
    var b = e.target.closest('[data-c]'); if (!b) return;
    e.preventDefault(); readCatalog();
    var K = C.catalog, el = b.closest('.catc'), ci = +el.dataset.ci, c = K.categories[ci], a = b.dataset.c;
    if (a === 'kit-add') c.kit = (c.kit || []).concat([['', '', false]]);
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
  function cropValue(v) {
    var n = Number(v);
    return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 50;
  }
  function badgeColor(v) {
    var c = String(v || '').trim();
    return /^#[0-9a-f]{6}$/i.test(c) ? c : '#9a7436';
  }
  function workZoom(value) {
    if (value == null || value === '') return 1;
    var n = Number(value);
    return Number.isFinite(n) ? Math.max(0.5, Math.min(2.2, n)) : 1;
  }
  function workPresentationDefaults(work) {
    var byImage = {
      '/api/img?id=1': { caption:'Памятник черный гранитный', description:'Двойной памятник с полированной поверхностью' },
      '/api/img?id=2': { caption:'Памятник с портретом', description:'Элегантный памятник с художественной гравировкой' },
      '/api/img?id=3': { caption:'Ограда с покрытием', description:'Благоустроенный участок с гранитным настилом' },
      '/api/img?id=6': { caption:'Индивидуальный проект', description:'Подберём форму, камень и оформление под ваш участок' }
    };
    return byImage[String(work && work.img || '')] || { caption:'', description:'' };
  }
  function drawWorks() {
    var w = C.works || [];
    $('#worksEd').innerHTML = w.map(function (x, i) {
      x = x || {};
      var defaults = workPresentationDefaults(x);
      var caption = String(x.caption || '').trim() || defaults.caption;
      var description = String(x.description || '').trim() || defaults.description;
      var cropX = cropValue(x.cropX), cropY = cropValue(x.cropY), zoom = workZoom(x.zoom), color = badgeColor(x.badgeColor);
      var badge = String(x.badgeText || '').trim();
      return '<div class="w" data-i="' + i + '">' +
        '<div class="ph" style="--crop-x:' + cropX + '%;--crop-y:' + cropY + '%;--photo-zoom:' + zoom + '">' +
          '<img class="w-photo-main" src="' + esc(x.img || '') + '" alt="" style="transform:scale(' + zoom + ')">' +
          '<span class="w-badge-preview" style="--badge-color:' + color + ';background-color:' + color + '"' + (badge ? '' : ' hidden') + '><i aria-hidden="true"></i>' + esc(badge) + '</span>' +
          '<div class="w-work-info"><div class="w-work-copy"><strong data-work-title' + (caption ? '' : ' hidden') + '>' + esc(caption) + '</strong><span data-work-description' + (description ? '' : ' hidden') + '>' + esc(description) + '</span></div></div></div>' +
        '<label>Заголовок карточки<input name="cap" value="' + esc(caption) + '" placeholder="Например: Памятник с портретом"></label>' +
        '<label>Описание карточки<textarea name="description" rows="2" placeholder="Кратко опишите работу">' + esc(description) + '</textarea></label>' +
        '<label>Текст плашки<input name="badgeText" value="' + esc(badge) + '" placeholder="Например: Новое"></label>' +
        '<label class="w-color-label">Цвет плашки<input type="color" name="badgeColor" value="' + color + '"></label>' +
        '<label class="w-crop-label">Кадр по горизонтали <output data-crop-label="cropX">' + cropX + '%</output><input type="range" name="cropX" min="0" max="100" step="1" value="' + cropX + '"></label>' +
        '<label class="w-crop-label">Кадр по вертикали <output data-crop-label="cropY">' + cropY + '%</output><input type="range" name="cropY" min="0" max="100" step="1" value="' + cropY + '"></label>' +
        '<label class="w-crop-label">Масштаб фото (100% — весь кадр) <output data-photo-zoom-label>' + Math.round(zoom * 100) + '%</output><input type="range" name="zoom" min="0.5" max="2.2" step="0.05" value="' + zoom + '"></label>' +
        '<div class="tools"><span><button class="ic" data-w="up" type="button" aria-label="Переместить выше">↑</button> <button class="ic" data-w="down" type="button" aria-label="Переместить ниже">↓</button></span><button class="ic del" data-w="del" type="button" title="Убрать">✕</button></div>' +
      '</div>';
    }).join('') || '<p class="empty">Фото нет — загрузите первые.</p>';
  }
  $('#worksEd').addEventListener('input', function (e) {
    var card = e.target.closest('.w'); if (!card) return;
    var item = C.works[+card.dataset.i]; if (!item) return;
    var name = e.target.name;
    if (name === 'zoom') {
      item.zoom = workZoom(e.target.value);
      var photo = card.querySelector('.ph .w-photo-main');
      if (photo) photo.style.transform = 'scale(' + item.zoom + ')';
      var zoomOut = card.querySelector('[data-photo-zoom-label]');
      if (zoomOut) zoomOut.textContent = Math.round(item.zoom * 100) + '%';
      return;
    }
    if (name === 'cap') {
      item.caption = e.target.value;
      var title = card.querySelector('[data-work-title]');
      if (title) { title.textContent = e.target.value; title.hidden = !String(e.target.value || '').trim(); }
    }
    if (name === 'description') {
      item.description = e.target.value;
      var description = card.querySelector('[data-work-description]');
      if (description) { description.textContent = e.target.value; description.hidden = !String(e.target.value || '').trim(); }
    }
    if (name === 'badgeText') {
      item.badgeText = e.target.value;
      var preview = card.querySelector('.w-badge-preview');
      if (preview) { preview.innerHTML = '<i aria-hidden="true"></i>' + esc(item.badgeText); preview.hidden = !String(item.badgeText || '').trim(); }
    }
    if (name === 'badgeColor') {
      item.badgeColor = badgeColor(e.target.value);
      var previewColor = card.querySelector('.w-badge-preview');
      if (previewColor) { previewColor.style.backgroundColor = item.badgeColor; previewColor.style.setProperty('--badge-color', item.badgeColor); }
    }
    if (name === 'cropX' || name === 'cropY') {
      item[name] = cropValue(e.target.value);
      var ph = card.querySelector('.ph');
      ph.style.setProperty('--crop-x', cropValue(item.cropX) + '%');
      ph.style.setProperty('--crop-y', cropValue(item.cropY) + '%');
      var out = card.querySelector('[data-crop-label="' + name + '"]');
      if (out) out.textContent = item[name] + '%';
    }
  });
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
        .then(function (d) { if (d.ok) { C.works = C.works || []; C.works.push({ img: d.url, caption: '', description: '', badgeText: '', badgeColor: '#9a7436', cropX: 50, cropY: 50, zoom: 1 }); drawWorks(); } else toast(d.error || 'Фото не загрузилось', true); });
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

  /* ---------- общие заметки команды ---------- */
  var NOTES = [], activeNoteId = null, activeNoteVersion = 0, noteDirty = false;

  function noteDate(value) {
    var d = value ? new Date(value) : null;
    return d && !isNaN(d.getTime()) ? d.toLocaleString('ru-RU') : '—';
  }
  function renderNotesList() {
    var box = $('#notesList');
    if (!NOTES.length) {
      box.innerHTML = '<p class="empty">Пока нет заметок. Создайте первую запись для команды.</p>';
      return;
    }
    box.innerHTML = NOTES.map(function (n) {
      return '<button type="button" class="notes-list-item' + (Number(n.id) === Number(activeNoteId) ? ' on' : '') + '" data-note-open="' + Number(n.id) + '">' +
        '<b>' + esc(n.title || 'Без названия') + '</b>' +
        '<small>Изменено: ' + esc(noteDate(n.updated_at)) + '</small>' +
        '<small>Автор: ' + esc(n.updated_by || n.created_by || '—') + '</small>' +
      '</button>';
    }).join('');
  }
  function showNoteEditor(note) {
    if (!note) {
      activeNoteId = null;
      activeNoteVersion = 0;
      noteDirty = false;
      $('#noteEditor').hidden = true;
      $('#notesEmpty').hidden = false;
      $('#noteReloadLatest').hidden = true;
      renderNotesList();
      return;
    }
    activeNoteId = Number(note.id);
    activeNoteVersion = Number(note.version || 1);
    noteDirty = false;
    $('#noteTitle').value = note.title || '';
    $('#noteBody').value = note.body || '';
    $('#noteMeta').textContent = 'Последнее изменение: ' + noteDate(note.updated_at) + ' · ' + (note.updated_by || note.created_by || 'неизвестно');
    $('#noteReloadLatest').hidden = true;
    $('#noteEditor').hidden = false;
    $('#notesEmpty').hidden = true;
    renderNotesList();
  }
  function loadNotes() {
    return api('/api/notes').then(function (d) {
      if (!d.ok) return toast(d.error || 'Не удалось загрузить заметки', true);
      NOTES = Array.isArray(d.notes) ? d.notes : [];
      var current = NOTES.find(function (n) { return Number(n.id) === Number(activeNoteId); });
      renderNotesList();
      if (!activeNoteId) return;
      if (!current) {
        showNoteEditor(null);
      } else if (!noteDirty) {
        showNoteEditor(current);
      } else if (Number(current.version || 1) !== activeNoteVersion) {
        $('#noteMeta').textContent = 'Есть более новая версия от ' + (current.updated_by || 'другого сотрудника') + '. Ваши несохранённые изменения пока сохранены в редакторе.';
        $('#noteReloadLatest').hidden = false;
      }
    }).catch(function () { toast('Не удалось загрузить заметки', true); });
  }
  function openNote(id) {
    if (noteDirty && !confirm('В заметке есть несохранённые изменения. Открыть другую запись без сохранения?')) return;
    var n = NOTES.find(function (x) { return Number(x.id) === Number(id); });
    if (n) showNoteEditor(n);
  }
  $('#notesList').addEventListener('click', function (e) {
    var b = e.target.closest('[data-note-open]');
    if (b) openNote(b.dataset.noteOpen);
  });
  $('#noteNew').addEventListener('click', function () {
    if (noteDirty && !confirm('В заметке есть несохранённые изменения. Создать новую без сохранения текущей?')) return;
    api('/api/notes', { method: 'POST', body: { title: 'Новая заметка', body: '' } }).then(function (d) {
      if (!d.ok) return toast(d.error || 'Не удалось создать заметку', true);
      NOTES.unshift(d.note);
      showNoteEditor(d.note);
      toast('Заметка создана');
    });
  });
  $('#noteTitle').addEventListener('input', function () {
    noteDirty = true;
    $('#noteMeta').textContent = 'Есть несохранённые изменения';
    $('#noteReloadLatest').hidden = true;
  });
  $('#noteBody').addEventListener('input', function () {
    noteDirty = true;
    $('#noteMeta').textContent = 'Есть несохранённые изменения';
    $('#noteReloadLatest').hidden = true;
  });
  $('#noteSave').addEventListener('click', function () {
    if (!activeNoteId) return;
    var title = $('#noteTitle').value.trim();
    if (!title) return toast('Укажите заголовок заметки', true);
    var body = $('#noteBody').value;
    if (body.length > 20000) return toast('Текст заметки слишком длинный', true);
    api('/api/notes', { method: 'PUT', body: {
      id: activeNoteId, version: activeNoteVersion, title: title, body: body
    }}).then(function (d) {
      if (!d.ok) {
        if (d.status === 409 && d.note) {
          var i = NOTES.findIndex(function (n) { return Number(n.id) === Number(d.note.id); });
          if (i >= 0) NOTES[i] = d.note; else NOTES.unshift(d.note);
          renderNotesList();
          $('#noteMeta').textContent = 'Конфликт изменений: запись уже обновил ' + (d.note.updated_by || 'другой сотрудник') + '. Скопируйте свой текст или загрузите свежую версию.';
          $('#noteReloadLatest').hidden = false;
          return toast('Другой сотрудник уже изменил эту заметку. Ваша версия не перезаписана.', true);
        }
        return toast(d.error || 'Не удалось сохранить заметку', true);
      }
      var i = NOTES.findIndex(function (n) { return Number(n.id) === Number(d.note.id); });
      if (i >= 0) NOTES[i] = d.note; else NOTES.unshift(d.note);
      showNoteEditor(d.note);
      toast('Заметка сохранена для всей команды');
    });
  });
  $('#noteReloadLatest').addEventListener('click', function () {
    var n = NOTES.find(function (x) { return Number(x.id) === Number(activeNoteId); });
    if (n) showNoteEditor(n);
  });
  $('#noteDelete').addEventListener('click', function () {
    if (!activeNoteId || !confirm('Удалить заметку «' + $('#noteTitle').value + '»?')) return;
    api('/api/notes?id=' + encodeURIComponent(activeNoteId), { method: 'DELETE' }).then(function (d) {
      if (!d.ok) return toast(d.error || 'Не удалось удалить заметку', true);
      NOTES = NOTES.filter(function (n) { return Number(n.id) !== Number(activeNoteId); });
      showNoteEditor(null);
      toast('Заметка удалена');
    });
  });
  $('#notesReload').addEventListener('click', loadNotes);


  /* ---------- финансовый отдел: прайс-лист ---------- */
  var PRICEBOOK = { items: [], siteSync: false }, ESTIMATES = [], currentEstimate = null;
  function priceTargets() {
    var out = [{value:'',label:'— без привязки к сайту —'}];
    ((C && C.catalog && C.catalog.categories) || []).forEach(function (c) {
      out.push({value:'catalog:' + c.id,label:'Каталог сайта · ' + (c.name || c.id)});
    });
    ((C && C.calc && C.calc.steps) || []).forEach(function (st) {
      (st.items || []).forEach(function (it) {
        out.push({value:'calc:' + st.id + ':' + it.id,label:'Калькулятор · ' + st.name + ' / ' + it.name});
      });
    });
    return out;
  }
  function guessPriceTarget(p) {
    var key = String(p.name || '').trim().toLocaleLowerCase('ru-RU');
    if (!key || !C) return '';
    var targets = priceTargets();
    var exact = targets.find(function (x) {
      if (!x.value) return false;
      var label = x.label.split(' · ').slice(-1)[0].split(' / ').slice(-1)[0].trim().toLocaleLowerCase('ru-RU');
      return label === key;
    });
    return exact ? exact.value : '';
  }
  function drawPricebook() {
    var items = PRICEBOOK.items || [], targets = priceTargets();
    $('#sitePriceSync').checked = !!PRICEBOOK.siteSync;
    $('#pricebookInfo').innerHTML = 'Позиций: <b>' + items.length + '</b>. ' +
      (PRICEBOOK.siteSync ? '<span class="pricebook-on">Автоперенос цен на сайт включён</span>' : 'Автоперенос на сайт выключен') +
      (PRICEBOOK.updatedAt ? ' · Обновлено: ' + esc(new Date(PRICEBOOK.updatedAt).toLocaleString('ru-RU')) : '');
    $('#pricebookRows').innerHTML = items.length ? '<table class="price-table"><thead><tr><th>Категория</th><th>Наименование</th><th>Артикул</th><th>Ед.</th><th>Цена, BYN</th><th>Привязка к сайту</th><th></th></tr></thead><tbody>' +
      items.map(function (p, i) {
        var target = p.siteTarget || guessPriceTarget(p);
        return '<tr class="pb-row" data-pbi="' + i + '"><td><input class="price-cat" name="pcat" value="' + esc(p.category || '') + '" placeholder="Категория"></td>' +
          '<td><input class="price-name" name="pname" value="' + esc(p.name || '') + '" placeholder="Название позиции"></td>' +
          '<td><input class="price-article" name="particle" value="' + esc(p.article || '') + '" placeholder="Артикул / SKU"></td>' +
          '<td><input name="punit" value="' + esc(p.unit || 'шт.') + '" placeholder="шт."></td>' +
          '<td><input class="price-val" name="pprice" type="number" min="0" step="0.01" value="' + (p.price == null ? '' : esc(p.price)) + '" placeholder="Цена"></td>' +
          '<td><select class="price-target" name="ptarget">' + targets.map(function (x) { return '<option value="' + esc(x.value) + '"' + (x.value === target ? ' selected' : '') + '>' + esc(x.label) + '</option>'; }).join('') + '</select></td>' +
          '<td><button class="ic del" data-price-del="' + i + '" title="Удалить позицию">✕</button></td></tr>';
      }).join('') + '</tbody></table>' : '<p class="empty">Каталог пока пуст. Загрузите CSV или добавьте позиции вручную.</p>';
  }
  function readPricebook() {
    return $$('#pricebookRows .pb-row').map(function (tr, i) {
      var p = $('[name=pprice]', tr).value.trim();
      return { id:(PRICEBOOK.items[i] && PRICEBOOK.items[i].id) || slug('price'),
        category:$('[name=pcat]',tr).value.trim(), name:$('[name=pname]',tr).value.trim(),
        article:$('[name=particle]',tr).value.trim(),
        unit:$('[name=punit]',tr).value.trim() || 'шт.', price:p === '' ? null : Math.max(0, +p),
        siteTarget:$('[name=ptarget]',tr).value };
    }).filter(function (x) { return x.name; });
  }
  function savePricebook() {
    var body = {action:'save_pricebook',items:readPricebook(),siteSync:$('#sitePriceSync').checked};
    return api('/api/finance',{method:'POST',body:body}).then(function(d) {
      if (!d.ok) { toast(d.error || 'Не удалось сохранить каталог цен',true); return d; }
      PRICEBOOK = d.pricebook || PRICEBOOK;
      drawPricebook();
      toast('Каталог цен сохранён');
      return d;
    });
  }
  function loadPricebook() {
    return api('/api/finance?view=pricebook').then(function(d) {
      if (!d.ok) return toast(d.error || 'Не удалось загрузить каталог цен',true);
      PRICEBOOK = d.pricebook || {items:[],siteSync:false};
      drawPricebook();
    });
  }
  $('#priceSave').addEventListener('click',savePricebook);
  $('#sitePriceSync').addEventListener('change',savePricebook);
  $('#priceAdd').addEventListener('click',function() {
    if (!PRICEBOOK.items) PRICEBOOK.items=[];
    PRICEBOOK.items.push({id:slug('price'),category:'Работы',name:'Новая позиция',article:'',unit:'шт.',price:0,siteTarget:''});
    drawPricebook();
  });
  $('#pricebookRows').addEventListener('click',function(e) {
    var b=e.target.closest('[data-price-del]'); if(!b) return;
    PRICEBOOK.items.splice(+b.dataset.priceDel,1); drawPricebook();
  });
  function parseCsv(text) {
    var first=(text.split(/\r?\n/)[0]||'');
    var delim=first.indexOf(';')>=0?';':first.indexOf('\t')>=0?'\t':',';
    var rows=[], row=[], val='', quoted=false;
    for(var i=0;i<text.length;i++){
      var ch=text[i];
      if(ch==='"' && quoted && text[i+1]==='"'){val+='"';i++;continue;}
      if(ch==='"'){quoted=!quoted;continue;}
      if(ch===delim && !quoted){row.push(val.trim());val='';continue;}
      if((ch==='\n'||ch==='\r')&&!quoted){if(ch==='\r'&&text[i+1]==='\n')i++;row.push(val.trim());val='';if(row.some(function(x){return x!=='';}))rows.push(row);row=[];continue;}
      val+=ch;
    }
    row.push(val.trim()); if(row.some(function(x){return x!=='';})) rows.push(row);
    return rows;
  }
  $('#priceFile').addEventListener('change',function(e) {
    var file=e.target.files && e.target.files[0]; e.target.value=''; if(!file) return;
    if(file.size > 3 * 1024 * 1024) return toast('Файл больше 3 МБ. Уменьшите его или сохраните каталог в Excel.',true);
    var fr=new FileReader();
    fr.onload=function(){
      var dataUrl=String(fr.result||''), comma=dataUrl.indexOf(',');
      if(comma<0) return toast('Не удалось прочитать файл',true);
      toast('Разбираем каталог: '+file.name);
      api('/api/finance',{method:'POST',body:{
        action:'import_pricebook',
        fileName:file.name,
        mimeType:file.type || 'application/octet-stream',
        base64:dataUrl.slice(comma+1)
      }}).then(function(d){
        if(!d.ok) return toast(d.error || 'Не удалось разобрать каталог',true);
        var noPrice=Number(d.warnings||0);
        var note='Распознано строк: '+d.count+(noPrice?'\nБез цены: '+noPrice:'')+'\n\nЗаменить текущий каталог данными из «'+file.name+'»?';
        if(!confirm(note)) return;
        PRICEBOOK.items=(d.items||[]).map(function(x,i){
          return Object.assign({},x,{id:x.id || slug('price')});
        });
        drawPricebook();
        toast('Импортировано '+PRICEBOOK.items.length+' позиций. Проверьте артикулы и цены, затем нажмите «Сохранить каталог».');
      }).catch(function(err){toast(err && err.message || 'Ошибка импорта каталога',true);});
    };
    fr.onerror=function(){toast('Не удалось прочитать файл',true);};
    fr.readAsDataURL(file);
  });

  /* ---------- сметы ---------- */
  function estimateStatusLabel(s) {
    return ({draft:'Черновик',sent:'Отправлена',approved:'Согласована',rejected:'Отклонена'})[s] || s || 'Черновик';
  }
  function loadEstimates() {
    return api('/api/finance?view=estimates').then(function(d) {
      if(!d.ok) return toast(d.error || 'Не удалось загрузить сметы',true);
      ESTIMATES=d.estimates || [];
      $('#estimatesList').innerHTML=ESTIMATES.length ? '<table><thead><tr><th>№</th><th>Дата</th><th>Клиент</th><th>Заявка</th><th>Итого</th><th>Статус</th><th></th></tr></thead><tbody>' +
        ESTIMATES.map(function(e){return '<tr><td class="estimate-list-title">№'+e.id+'</td><td>'+esc(new Date(e.created_at).toLocaleString('ru-RU'))+'</td>' +
          '<td><b>'+esc(e.client_name||'—')+'</b><small>'+esc(e.client_phone||'')+'</small></td><td>'+(e.lead_id?'№'+e.lead_id:'—')+'</td>' +
          '<td><b>'+Number(e.total||0).toLocaleString('ru-RU')+' BYN</b></td><td><span class="estimate-status">'+esc(estimateStatusLabel(e.status))+'</span></td>' +
          '<td><button class="btn line sm" data-open-estimate="'+e.id+'">Открыть</button> <button class="btn line sm" data-print-estimate="'+e.id+'">Печать</button></td></tr>';}).join('') +
        '</tbody></table>' : '<p class="empty">Смет пока нет. Создайте смету из карточки заявки.</p>';
    });
  }
  function estimatePriceItems() {
    var out=[];
    function matchedTarget(target) {
      return (PRICEBOOK.items||[]).find(function(p){return String(p.siteTarget||'')===target;}) || null;
    }
    (PRICEBOOK.items||[]).forEach(function(p){
      out.push({id:'pricebook:'+p.id,article:p.article||p.id,name:p.name,unit:p.unit||'шт.',price:p.price,note:p.price==null?'Цена не задана в прайсе':'',source:'Актуальный прайс'});
    });
    ((C&&C.catalog&&C.catalog.categories)||[]).forEach(function(c){
      var target='catalog:'+c.id, bp=PRICEBOOK.siteSync?matchedTarget(target):null;
      out.push({id:'site:'+target,article:(bp&&bp.article)||c.article||c.sku||('CAT-'+String(c.id).toUpperCase()),
        name:c.name,unit:'комплект',price:bp&&bp.price!=null?bp.price:c.price,
        note:c.price==null?'Цена не задана в каталоге':'',source:'Каталог сайта'});
    });
    ((C&&C.calc&&C.calc.steps)||[]).forEach(function(st){
      (st.items||[]).forEach(function(it){
        var target='calc:'+st.id+':'+it.id, bp=PRICEBOOK.siteSync?matchedTarget(target):null;
        out.push({id:'site:'+target,article:(bp&&bp.article)||it.article||it.sku||it.code||(st.id+'-'+it.id).toUpperCase(),
          name:st.name+' · '+it.name,unit:it.unit||'шт.',price:bp&&bp.price!=null?bp.price:it.price,
          note:it.price==null?'Цена не задана в каталоге':(it.note||''),source:'Калькулятор сайта'});
      });
    });
    return out;
  }
  function estimatePriceOptions(selectedName, selectedArticle) {
    var items=estimatePriceItems();
    var matched=items.find(function(p){return p.name===selectedName && (!selectedArticle || p.article===selectedArticle);}) ||
      items.find(function(p){return p.name===selectedName;});
    return '<option value="">— выбрать из каталога —</option>' + items.map(function(p) {
      var priceLabel=p.price==null?'цена не задана':Number(p.price).toLocaleString('ru-RU')+' BYN/'+(p.unit||'шт.');
      return '<option value="'+esc(p.id)+'"'+(matched&&matched.id===p.id?' selected':'')+'>'+esc(p.source+' · '+p.article+' · '+p.name+' · '+priceLabel)+'</option>';
    }).join('');
  }
  function drawEstimateEditor(e) {
    currentEstimate=e;
    if(!e){$('#estimateEditor').hidden=true;return;}
    $('#estimateEditor').hidden=false;
    $('#estimateTitle').textContent='Смета №'+e.id+(e.lead_id?' · заявка №'+e.lead_id:'');
    $('#estimateClient').value=e.client_name||'';
    $('#estimatePhone').value=e.client_phone||'';
    $('#estimateStatus').value=e.status||'draft';
    $('#estimateDiscount').value=Number(e.discount||0);
    $('#estimateNotes').value=e.notes||'';
    drawEstimateItems(e.items||[]);
    var url='/estimate.html?token='+encodeURIComponent(e.public_token||'');
    $('#estimatePublicLink').href=url; $('#estimatePublicLink').hidden=!e.public_token;
    updateEstimateTotal();
  }
  function drawEstimateItems(rows) {
    $('#estimateItems').innerHTML='<table class="estimate-table"><thead><tr><th>Позиция из каталога</th><th>Артикул</th><th>Наименование</th><th>Ед.</th><th>Кол-во</th><th>Цена, BYN</th><th>Комментарий</th><th></th></tr></thead><tbody>' +
      rows.map(function(x,i){return '<tr class="estimate-row" data-ei="'+i+'"><td><select name="priceRef">'+estimatePriceOptions(x.name,x.article)+'</select></td>' +
        '<td><input class="estimate-article" name="earticle" value="'+esc(x.article||'')+'" placeholder="Артикул"></td>' +
        '<td><input class="estimate-name" name="ename" value="'+esc(x.name||'')+'" placeholder="Наименование"></td>' +
        '<td><input name="eunit" value="'+esc(x.unit||'шт.')+'" placeholder="шт."></td>' +
        '<td><input class="qty" name="eqty" type="number" min="0" step="0.1" value="'+(x.qty==null?1:x.qty)+'"></td>' +
        '<td><input class="price" name="eprice" type="number" min="0" step="0.01" value="'+Number(x.price||0)+'"></td>' +
        '<td><input class="estimate-note" name="enote" value="'+esc(x.note||'')+'" placeholder="Примечание"></td>' +
        '<td><button class="ic del" type="button" data-estimate-del="'+i+'" title="Удалить позицию">✕</button></td></tr>';}).join('') + '</tbody></table>';
  }
  function readEstimateForm() {
    return {
      id:currentEstimate && currentEstimate.id,
      client_name:$('#estimateClient').value.trim(),
      client_phone:$('#estimatePhone').value.trim(),
      status:$('#estimateStatus').value,
      discount:Math.max(0,Number($('#estimateDiscount').value)||0),
      notes:$('#estimateNotes').value.trim(),
      items:$$('#estimateItems .estimate-row').map(function(tr){
        return {article:$('[name=earticle]',tr).value.trim()||'—',name:$('[name=ename]',tr).value.trim(),unit:$('[name=eunit]',tr).value.trim()||'шт.',
          qty:Math.max(0,Number($('[name=eqty]',tr).value)||0),price:Math.max(0,Number($('[name=eprice]',tr).value)||0),
          note:$('[name=enote]',tr).value.trim()};
      }).filter(function(x){return x.name;})
    };
  }
  function updateEstimateTotal() {
    var x=readEstimateForm(),subtotal=x.items.reduce(function(a,it){return a+it.qty*it.price;},0),discount=Math.min(subtotal,x.discount);
    $('#estimateTotal').innerHTML='Итого: '+(subtotal-discount).toLocaleString('ru-RU')+' BYN<small>Сумма позиций: '+subtotal.toLocaleString('ru-RU')+' BYN · скидка: '+discount.toLocaleString('ru-RU')+' BYN</small>';
  }
  function saveEstimate(silent) {
    if(!currentEstimate) return Promise.resolve({ok:false});
    var data=readEstimateForm(); data.action='update_estimate';
    return api('/api/finance',{method:'POST',body:data}).then(function(d){
      if(!d.ok){if(!silent)toast(d.error||'Не удалось сохранить смету',true);return d;}
      currentEstimate=d.estimate; drawEstimateEditor(currentEstimate);
      if(!silent)toast('Смета №'+currentEstimate.id+' сохранена');
      loadEstimates(); return d;
    });
  }
  $('#estimateItems').addEventListener('input',updateEstimateTotal);
  $('#estimateDiscount').addEventListener('input',updateEstimateTotal);
  $('#estimateItems').addEventListener('change',function(e){
    var sel=e.target.closest('[name=priceRef]');if(!sel)return;
    var tr=sel.closest('.estimate-row'),p=estimatePriceItems().find(function(x){return x.id===sel.value;});if(!p)return;
    $('[name=earticle]',tr).value=p.article||'—';
    $('[name=ename]',tr).value=p.name;
    $('[name=eunit]',tr).value=p.unit||'шт.';
    $('[name=eprice]',tr).value=p.price==null?0:p.price;
    $('[name=enote]',tr).value=p.note||'';
    updateEstimateTotal();
  });
  $('#estimateItems').addEventListener('click',function(e){
    var b=e.target.closest('[data-estimate-del]');if(!b||!currentEstimate)return;
    var data=readEstimateForm();data.items.splice(+b.dataset.estimateDel,1);drawEstimateItems(data.items);updateEstimateTotal();
  });
  $('#estimateAddRow').addEventListener('click',function(){
    var data=currentEstimate?readEstimateForm():{items:[]};data.items.push({name:'',unit:'шт.',qty:1,price:0,note:''});drawEstimateItems(data.items);updateEstimateTotal();
  });
  $('#estimateSave').addEventListener('click',function(){saveEstimate(false);});
  $('#estimateNew').addEventListener('click',function(){
    api('/api/finance',{method:'POST',body:{action:'create_blank_estimate'}}).then(function(d){
      if(!d.ok){toast(d.error||'Не удалось создать смету',true);return;}
      currentEstimate=d.estimate;
      activatePane('estimates');
      drawEstimateEditor(currentEstimate);
      loadEstimates();
      toast('Создана новая смета №'+currentEstimate.id);
    }).catch(function(){toast('Ошибка создания сметы',true);});
  });
  $('#estimatesReload').addEventListener('click',loadEstimates);
  $('#estimatesList').addEventListener('click',function(e){
    var b=e.target.closest('[data-open-estimate],[data-print-estimate]');if(!b)return;
    var id=Number(b.dataset.openEstimate||b.dataset.printEstimate);
    var item=ESTIMATES.find(function(x){return Number(x.id)===id;});if(!item)return;
    if(b.hasAttribute('data-open-estimate')){drawEstimateEditor(item);activatePane('estimates');return;}
    var win=window.open('about:blank','_blank');
    drawEstimateEditor(item);
    saveEstimate(true).then(function(d){if(d.ok&&win)win.location='/estimate.html?token='+encodeURIComponent(d.estimate.public_token);else if(win)win.close();});
  });
  $('#estimatePrint').addEventListener('click',function(){
    var win=window.open('about:blank','_blank');
    saveEstimate(true).then(function(d){
      if(d.ok&&win){win.location='/estimate.html?token='+encodeURIComponent(d.estimate.public_token);}
      else {if(win)win.close();toast('Не удалось подготовить смету для печати',true);}
    }).catch(function(){if(win)win.close();toast('Ошибка сохранения сметы',true);});
  });
  $('#estimateDownloadWord').addEventListener('click',function(){
    saveEstimate(true).then(function(d){
      if(!d || !d.ok) return toast('Сначала сохраните смету',true);
      window.location.href='/api/estimate-file?token='+encodeURIComponent(d.estimate.public_token);
      toast('Готовим Word-файл сметы №'+d.estimate.id);
    }).catch(function(){toast('Не удалось подготовить Word-файл',true);});
  });

  /* ---------- пароль ---------- */
  $('#pwForm').addEventListener('submit', function (e) {
    e.preventDefault(); var f = e.target;
    if (f.password.value !== f.password2.value) return toast('Пароли не совпадают', true);
    api('/api/auth', { method: 'PATCH', body: { login: f.login.value.trim() || undefined, password: f.password.value } }).then(function (d) {
      if (d.ok) { f.reset(); $('#me').textContent = d.user; toast('Логин и пароль обновлены'); } else toast(d.error, true);
    });
  });
})();
