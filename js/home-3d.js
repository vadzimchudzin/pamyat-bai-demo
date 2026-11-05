/* ПАМЯТЬ.БАЙ — главная: тизер каталога (#catTeaser, его рисует site.js) получает то же, что и /catalog:
   3D-обложки разделов (курсор по фото меняет гранит), скидки (старая цена зачёркнута) и бейджи.
   site.js не меняется: после каждой его перерисовки тизер дорабатывается здесь (MutationObserver).
   Подключать после catalog-3d.js и catalog-x.js. */
(function () {
  var box = document.getElementById('catTeaser'), R3 = window.Pamyat3D, X = window.PamyatCatX;
  if (!box || !R3 || !X) return;
  var LX = window.PamyatLux || null;
  function fmt(n) { return Number(n).toLocaleString('ru-RU'); }
  function esc(v) { return X.esc(v); }
  function cat() { return window.PAMYAT_CATALOG || window.PAMYAT_CATALOG_DEFAULT || { categories: [] }; }
  function enhance() {
    var K = cat(), byId = {};
    R3.prefs(K);
    (K.categories || []).forEach(function (c) { if (c && c.id) byId[c.id] = c; });
    [].forEach.call(box.querySelectorAll('a.cc[href*="/catalog#"]'), function (a) {
      var c = byId[(a.getAttribute('href') || '').split('#')[1] || '']; if (!c) return;
      var pc = X.pct(null, c), cv = a.querySelector('.cover'), code = X.coverCode(c, R3), pr = a.querySelector('.pr');
      if (pr && c.price != null && c.price !== '') pr.innerHTML = X.priceHtml(c.price, pc, fmt);
      if (!cv) return;
      if (code && cv.getAttribute('data-r3') !== code) {
        var st = R3.stage(code, c.name, '(max-width:720px) 92vw, 400px', false, c.id);
        if (st) {
          var t = document.createElement('div');
          t.innerHTML = '<div class="cover lx-stage r3s" data-r3="' + esc(code) + '">' + st + (LX ? LX.glint() + LX.frame(10) : '') + '</div>';
          a.replaceChild(t.firstChild, cv); cv = a.querySelector('.cover');
        }
      }
      var old = cv.querySelector('.cx-badge'); if (old) old.parentNode.removeChild(old);
      var b = X.badgeHtml(X.badge(c, pc), 'cx-cov'); if (b) cv.insertAdjacentHTML('beforeend', b);
    });
    if (box.querySelector('[data-r3]')) R3.bind(box);
  }
  try { new MutationObserver(enhance).observe(box, { childList: true }); } catch (e) {}
  document.addEventListener('pamyat:3d', enhance);
  R3.load();
  enhance();
})();
