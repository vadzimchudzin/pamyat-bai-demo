/* ПАМЯТЬ.БАЙ — админка, «Тексты сайта»: все тексты главной страницы по разделам (реестр js/texts-def.js).
   admin.js рисует #textsEd и сохраняет readForm('#textsEd') — значения всех полей с name. Здесь форма перерисовывается по группам:
   поле получает name (и попадает в сохранение), только если текст уже сохранён или его изменили — остальные тексты
   остаются как в index.html (пустое поле остаётся пустым на сайте). */
(function () {
  var AK = window.AdminKit, T = window.PamyatTexts, ed = document.getElementById('textsEd');
  if (!AK || !T || !ed) return;
  var esc = AK.esc, open = { hero: true }, obs = null;
  function has(t, k) { return Object.prototype.hasOwnProperty.call(t, k) && t[k] != null ; }
  function draw() {
    var C = AK.content(); if (!C) return;
    var t = C.texts || {};
    ed.innerHTML = '<p class="hint wide tx-hint">Тексты главной страницы по разделам. Измените нужное и нажмите «Сохранить». Очищенное поле останется пустым на сайте.</p>' +
      T.GROUPS.map(function (g) {
        var n = g.items.filter(function (x) { return has(t, x[0]) && String(t[x[0]]) !== x[2]; }).length;
        return '<details class="tx-g wide" data-tg="' + esc(g.id) + '"' + (open[g.id] ? ' open' : '') + '><summary>' + esc(g.title) +
          '<i>' + g.items.length + (n ? ' · изменено ' + n : '') + '</i></summary><div class="tx-f">' + g.items.map(function (x) {
            var k = x[0], own = has(t, k), v = own ? String(t[k]) : x[2], nm = own ? ' name="' + esc(k) + '"' : '';
            var inp = x[3] ? '<textarea' + nm + ' data-tx="' + esc(k) + '" rows="3">' + esc(v) + '</textarea>' : '<input' + nm + ' data-tx="' + esc(k) + '" value="' + esc(v) + '">';
            return '<label class="' + (x[3] ? 'wide' : '') + '">' + esc(x[1]) + inp + '</label>';
          }).join('') + '</div></details>';
      }).join('');
    if (obs) obs.takeRecords();
  }
  // admin.js перерисовал форму (загрузка, сохранение) — рисуем по группам
  try { obs = new MutationObserver(function () { if (!ed.querySelector('.tx-g')) draw(); }); obs.observe(ed, { childList: true }); } catch (e) {}
  ed.addEventListener('input', function (e) { var el = e.target, k = el.getAttribute && el.getAttribute('data-tx'); if (k && !el.name) el.name = k; });
  ed.addEventListener('toggle', function (e) { var d = e.target; if (d.classList && d.classList.contains('tx-g')) open[d.getAttribute('data-tg')] = d.open; }, true);
  if (ed.children.length) draw();
})();
