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
  $('#nav').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    $$('#nav button').forEach(function (x) { x.classList.toggle('on', x === b); });
    $$('.pane').forEach(function (p) { p.classList.toggle('on', p.id === 'p-' + b.dataset.p); });
    if (b.dataset.p === 'log') loadLog();
    if (b.dataset.p === 'leads') loadLeads();
  });

  function load() {
    api('/api/content?full=1').then(function (d) {
      if (!d.ok) return toast(d.error || 'Не удалось загрузить данные', true);
      C = d.content; drawCalc(); drawWorks(); drawTexts(); drawContacts(); drawTg();
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

  /* ---------- заявки ---------- */
  var STATUSES = [];
  function loadLeads() {
    api('/api/lead').then(function (d) {
      if (!d.ok) return;
      STATUSES = d.statuses;
      var n = d.leads.filter(function (l) { return l.status === 'новая'; }).length;
      $('#newCount').textContent = n ? n : '';
      if (!d.leads.length) { $('#leadsTbl').innerHTML = '<p class="empty">Заявок пока нет. Они появятся здесь и в Telegram-группе.</p>'; return; }
      $('#leadsTbl').innerHTML = '<table><thead><tr><th>№</th><th>Когда</th><th>Клиент</th><th>Что</th><th>Сумма</th><th>Статус</th><th></th></tr></thead><tbody>' +
        d.leads.map(function (l) {
          var what = l.type === 'calc' ? 'Расчёт' : 'Звонок';
          var det = (l.config && l.config.summary ? l.config.summary : '') + (l.comment ? (l.config && l.config.summary ? ' · ' : '') + l.comment : '');
          return '<tr class="' + (l.status === 'новая' ? 'new' : '') + '"><td>' + l.id + '</td><td>' + new Date(l.created_at).toLocaleString('ru-RU') + '</td>' +
            '<td><b>' + esc(l.name || '—') + '</b><small><a href="tel:' + esc((l.phone || '').replace(/[^\d+]/g, '')) + '">' + esc(l.phone) + '</a></small></td>' +
            '<td>' + what + (det ? '<small>' + esc(det) + '</small>' : '') + (l.taken_by ? '<small>Взял: ' + esc(l.taken_by) + '</small>' : '') + '</td>' +
            '<td>' + (l.price ? 'от ' + Number(l.price).toLocaleString('ru-RU') : '—') + '</td>' +
            '<td><select data-lead="' + l.id + '">' + STATUSES.map(function (s) { return '<option' + (s === l.status ? ' selected' : '') + '>' + s + '</option>'; }).join('') + '</select></td>' +
            '<td><button class="ic del" title="Удалить" data-del-lead="' + l.id + '">✕</button></td></tr>';
        }).join('') + '</tbody></table>';
    });
  }
  $('#leadsReload').addEventListener('click', loadLeads);
  $('#leadsTbl').addEventListener('change', function (e) {
    var s = e.target.closest('[data-lead]'); if (!s) return;
    api('/api/lead', { method: 'PATCH', body: { id: +s.dataset.lead, status: s.value } }).then(function (d) { d.ok ? (toast('Статус обновлён'), loadLeads()) : toast(d.error, true); });
  });
  $('#leadsTbl').addEventListener('click', function (e) {
    var b = e.target.closest('[data-del-lead]'); if (!b || !confirm('Удалить заявку №' + b.dataset.delLead + '?')) return;
    api('/api/lead?id=' + b.dataset.delLead, { method: 'DELETE' }).then(loadLeads);
  });
  setInterval(function () { if (!$('#app').hidden) loadLeads(); }, 60000);

  /* ---------- калькулятор ---------- */
  function drawCalc() {
    var steps = (C.calc && C.calc.steps) || [];
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
