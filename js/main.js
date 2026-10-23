/* Page behaviours: header, reveals, hero dust, anatomy hotspots, granite switcher, FAQ, form */
(function () {
  'use strict';
  var calm = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // header
  var hdr = document.getElementById('top');
  var darks = [].slice.call(document.querySelectorAll('.story,.granite'));
  var onS = function () {
    hdr.classList.toggle('scrolled', window.scrollY > 24);
    var y = 36, dk = darks.some(function (d) { var r = d.getBoundingClientRect(); return r.top <= y && r.bottom >= y; });
    hdr.classList.toggle('dark', dk);
    var st = document.getElementById('story');
    if (st) { var r = st.getBoundingClientRect(); hdr.classList.toggle('immersive', r.top <= -window.innerHeight * 0.25 && r.bottom >= window.innerHeight * 1.1); }
  };
  onS(); window.addEventListener('scroll', onS, { passive: true });

  // split headings into words for staggered reveal
  [].forEach.call(document.querySelectorAll('.split'), function (el) {
    var html = el.innerHTML.split(/(<br\s*\/?>)/i).map(function (part) {
      if (/^<br/i.test(part)) return part;
      return part.split(/(\s+)/).map(function (w) { return /^\s+$/.test(w) || !w ? w : '<span class="w"><span>' + w + '</span></span>'; }).join('');
    }).join('');
    el.innerHTML = html;
    [].forEach.call(el.querySelectorAll('.w>span'), function (s, i) { s.style.transitionDelay = (i * 70) + 'ms'; });
  });

  // reveal on view
  var rv = document.querySelectorAll('.reveal,.split,.anat,.price,.faq-item');
  if ('IntersectionObserver' in window && !calm) {
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
    }, { threshold: 0.18 });
    [].forEach.call(rv, function (el) { io.observe(el); });
  } else [].forEach.call(rv, function (el) { el.classList.add('in'); });

  // hero dust (original)
  var dust = document.getElementById('dust');
  if (dust && !calm) {
    for (var i = 0; i < 26; i++) {
      var b = document.createElement('b'); var s = 3 + Math.random() * 7;
      b.style.cssText = 'left:' + (38 + Math.random() * 62) + '%;top:' + (18 + Math.random() * 62) + '%;width:' + s + 'px;height:' + s + 'px;animation-duration:' + (16 + Math.random() * 20) + 's;animation-delay:-' + (Math.random() * 30) + 's;--dx:' + (30 + Math.random() * 120) + 'px;--dy:-' + (80 + Math.random() * 220) + 'px';
      dust.appendChild(b);
    }
  }

  // ---------- anatomy hotspots ----------
  var anat = document.querySelector('.anat');
  if (anat) {
    var dots = [].slice.call(anat.querySelectorAll('.hs'));
    var rows = [].slice.call(anat.querySelectorAll('.anat-list li'));
    var setA = function (k) {
      dots.forEach(function (d, i) { d.classList.toggle('on', i === k); });
      rows.forEach(function (r, i) { r.classList.toggle('on', i === k); });
    };
    dots.forEach(function (d, i) {
      d.style.setProperty('--d', (600 + i * 140) + 'ms');
      d.addEventListener('mouseenter', function () { setA(i); });
      d.addEventListener('click', function () { setA(i); });
      d.addEventListener('focus', function () { setA(i); });
    });
    rows.forEach(function (r, i) {
      r.addEventListener('mouseenter', function () { setA(i); });
      r.addEventListener('click', function () { setA(i); });
    });
    setA(0);
    // subtle parallax on the image while scrolling
    var img = anat.querySelector('.anat-stage');
    var par = function () {
      var r = anat.getBoundingClientRect(), vh = window.innerHeight;
      if (r.bottom < 0 || r.top > vh) return;
      var k = (r.top + r.height / 2 - vh / 2) / vh;
      img.style.transform = 'scale(1.08) translateY(' + (k * -3).toFixed(2) + '%)';
    };
    if (!calm) { window.addEventListener('scroll', function () { requestAnimationFrame(par); }, { passive: true }); par(); }
  }

  // ---------- granite switcher (WebGL reveal from the monument outwards) ----------
  var gsec = document.getElementById('granite');
  if (gsec) {
    var gc = gsec.querySelector('#graniteGL');
    var sw = [].slice.call(gsec.querySelectorAll('.sw'));
    var info = [].slice.call(gsec.querySelectorAll('.g-info'));
    var mob = window.matchMedia('(max-width: 820px)').matches;
    var gurl = function (k) { return '/assets/granite/' + k + (mob ? '-m' : '') + '.webp'; };
    var curK = sw[0].getAttribute('data-k'), anim = 0, R = null;
    try { R = new RevealGL(gc, { aspect: 16 / 9, focus: [0.5, 0.55] }); } catch (e) { R = null; }
    var fimg = gsec.querySelector('.g-fallback');
    var draw = function (a, b, t) { if (R) { R.resize(); R.render({ a: gurl(a), b: gurl(b), t: t, o: [0.60, 0.30], zoom: 1.0, vig: 0.35, seed: 4.2, edge: 1 }); } };
    if (R) {
      fimg.style.display = 'none';
      R.load(gurl(curK)).then(function () { draw(curK, null, 0); });
      var gio = new IntersectionObserver(function (es) {
        if (es[0].isIntersecting) { sw.forEach(function (s) { R.load(gurl(s.getAttribute('data-k'))); }); gio.disconnect(); }
      }, { rootMargin: '600px 0px' });
      gio.observe(gsec);
      window.addEventListener('resize', function () { draw(curK, null, 0); });
    }
    sw.forEach(function (s, i) {
      s.addEventListener('click', function () {
        var k = s.getAttribute('data-k'); if (k === curK) return;
        sw.forEach(function (x) { x.classList.toggle('on', x === s); x.setAttribute('aria-pressed', x === s); });
        info.forEach(function (x, j) { x.classList.toggle('on', j === i); });
        var from = curK; curK = k;
        if (!R) { fimg.src = gurl(k); return; }
        R.load(gurl(k)).then(function () {
          cancelAnimationFrame(anim);
          var t0 = performance.now(), D = calm ? 1 : 1500;
          (function step(now) {
            var t = Math.min(1, (now - t0) / D); var e = t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
            draw(from, k, e);
            if (t < 1) anim = requestAnimationFrame(step);
          })(t0);
        });
      });
    });
  }

  // ---------- FAQ ----------
  [].forEach.call(document.querySelectorAll('.faq-item'), function (it) {
    var b = it.querySelector('button');
    b.addEventListener('click', function () {
      var open = it.classList.toggle('open');
      b.setAttribute('aria-expanded', open);
    });
  });

  // ---------- form ----------
  var lead = document.getElementById('lead');
  if (lead) lead.addEventListener('submit', function (e) {
    e.preventDefault(); document.getElementById('thanks').hidden = false; e.target.reset();
  });

  // prefill message from pricing buttons
  [].forEach.call(document.querySelectorAll('[data-pack]'), function (a) {
    a.addEventListener('click', function () {
      var t = document.querySelector('#lead textarea');
      if (t) t.value = 'Интересует пакет «' + a.getAttribute('data-pack') + '». ';
    });
  });
})();
