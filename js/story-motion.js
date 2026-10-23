/* ПАМЯТЬ.БАЙ — continuous motion story (scroll-scrubbed).
   Key plates + per-element "time maps" (each pixel knows WHEN it is built) + animated sprites
   (workers, stelae drop), living camera, light grade, dust in the sun. */
(function () {
  'use strict';
  var sec = document.getElementById('story');
  if (!sec) return;
  var pin = sec.querySelector('.story-pin');
  var screen = sec.querySelector('.story-screen');
  var canvas = sec.querySelector('#storyGL');
  var fx = sec.querySelector('#storyFX');
  var items = [].slice.call(sec.querySelectorAll('.sc-item'));
  var chapEl = sec.querySelector('.sc-chapter');
  var countEl = sec.querySelector('.sc-count b');
  var totalEl = sec.querySelector('.sc-count em');
  var rail = [].slice.call(sec.querySelectorAll('.rail-btn'));
  var railFill = sec.querySelector('.rail-fill');
  var live = sec.querySelector('.sc-live');
  var calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var small = window.matchMedia('(max-width: 820px)').matches;
  var A = '/assets/motion/';
  var PI_ = .05, PO_ = .955;
  var IW = 1920, IH = 1080, IAR = IW / IH;

  var KEYS = ['00', '01', '03', '05', '07', '09', '11'];
  var NT = KEYS.length - 1; // 6 transitions
  var MT = null; // motion.json: per transition {w, glow, sprites:{atlas,size,items:[{box,uv,t,d,sh}]}, dust}
  var DEF = [{ w: .05, glow: .35 }, { w: .07, glow: .3 }, { w: .02, glow: .5 }, { w: .04, glow: .3 }, { w: .03, glow: .2 }, { w: .05, glow: .35 }];

  // ---------------- WebGL ----------------
  var gl = null;
  try { gl = canvas.getContext('webgl', { alpha: false, antialias: false, premultipliedAlpha: false }); } catch (e) { }
  if (!gl) return fallback();

  function prog(vs, fs) {
    var p = gl.createProgram();
    [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]].forEach(function (s) {
      var sh = gl.createShader(s[0]); gl.shaderSource(sh, s[1]); gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));
      gl.attachShader(p, sh);
    });
    gl.linkProgram(p); return p;
  }
  var COMMON = 'uniform vec3 uTint;uniform float uVig,uDark;uniform vec2 uRes;' +
    'vec3 grade(vec3 c){vec2 q=gl_FragCoord.xy/uRes-.5;c*=uTint;c*=1.-dot(q,q)*uVig;' +
    'float l=dot(c,vec3(.299,.587,.114));c=mix(vec3(l),c,1.04);c=c*c*(3.-2.*c)*.18+c*.82;return c*(1.-uDark);}';
  var baseP = prog('attribute vec2 p;varying vec2 v;void main(){v=p*.5+.5;gl_Position=vec4(p,0.,1.);}',
    'precision mediump float;varying vec2 v;uniform sampler2D uA,uB,uM;uniform float uT,uW,uGlow,uZ;uniform vec2 uS,uOff,uZc;' + COMMON +
    'void main(){vec2 uv=(v-uZc)/uZ+uZc;vec2 iu=uv*uS+uOff;vec3 a=texture2D(uA,iu).rgb;vec3 b=texture2D(uB,iu).rgb;vec3 mp=texture2D(uM,iu).rgb;' +
    'float m=clamp((uT*(1.+uW)-mp.r)/uW,0.,1.);if(uT>=.9999)m=1.;vec3 c=mix(a,b,m);float g=mp.b*4.*m*(1.-m);' +
    'c+=vec3(1.,.83,.55)*g*.22*uGlow;gl_FragColor=vec4(grade(c),1.);}');
  var sprP = prog('attribute vec2 p;attribute vec2 t;varying vec2 v;void main(){v=t;gl_Position=vec4(p,0.,1.);}',
    'precision mediump float;varying vec2 v;uniform sampler2D uX;uniform float uAl;uniform int uMode;uniform vec2 uTx;uniform vec4 uR;' + COMMON +
    'void main(){if(uMode==2){float a=0.;for(int i=-2;i<=2;i++)for(int j=-2;j<=2;j++){vec2 q=clamp(v+vec2(float(i),float(j))*uTx,uR.xy,uR.zw);a+=texture2D(uX,q).a;}' +
    'a/=25.;gl_FragColor=vec4(0.,0.,0.,a*uAl);return;}vec4 s=texture2D(uX,v);gl_FragColor=vec4(grade(s.rgb),s.a*uAl);}');

  var quad = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  var sbuf = gl.createBuffer();
  function U(p, n) { return gl.getUniformLocation(p, n); }
  var ub = {}; ['uA', 'uB', 'uM', 'uT', 'uW', 'uGlow', 'uZ', 'uS', 'uOff', 'uZc', 'uTint', 'uVig', 'uDark', 'uRes'].forEach(function (k) { ub[k] = U(baseP, k); });
  var us = {}; ['uX', 'uAl', 'uMode', 'uTx', 'uR', 'uTint', 'uVig', 'uDark', 'uRes'].forEach(function (k) { us[k] = U(sprP, k); });
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);

  var TEX = {}, PEND = {};
  function load(name, url, nearest) {
    if (TEX[name]) return Promise.resolve(TEX[name]);
    if (PEND[name]) return PEND[name];
    return (PEND[name] = new Promise(function (res) {
      var im = new Image(); im.decoding = 'async';
      im.onload = function () {
        var t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
        var f = nearest ? gl.NEAREST : gl.LINEAR;
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, f); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, f);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, im);
        t._size = [im.naturalWidth, im.naturalHeight]; TEX[name] = t; dirty = true; res(t);
      };
      im.onerror = function () { res(null); };
      im.src = url;
    }));
  }
  var queue = [];
  KEYS.forEach(function (k, i) {
    queue.push(['k' + k, A + 'k' + k + (small ? '-m' : '') + '.webp']);
    if (i < NT) { queue.push(['t' + i, A + 't' + i + '.webp']); queue.push(['a' + i, A + 'a' + i + '.webp']); }
  });
  function preload() {
    fetch(A + 'motion.json').then(function (r) { return r.json(); }).then(function (j) {
      MT = j.tr; dirty = true;
      var i = 0;
      (function next() {
        if (i >= queue.length) return; var q = queue[i++];
        if (q[0][0] === 'a' && !(MT[+q[0].slice(1)] || {}).sprites) return next();
        load(q[0], q[1]).then(next);
      })();
    });
  }

  // ---------------- camera & mapping ----------------
  var cw = 2, ch = 2, cam = { S: [1, 1], O: [0, 0], Z: 1, Zc: [.5, .5] };
  function resize() {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = Math.max(2, Math.round(canvas.clientWidth * dpr)), h = Math.max(2, Math.round(canvas.clientHeight * dpr));
    if (w !== cw || h !== ch) { canvas.width = cw = w; canvas.height = ch = h; fx.width = w; fx.height = h; gl.viewport(0, 0, w, h); dirty = true; }
  }
  function setCam(zoom, zc, focus) {
    var ca = cw / ch, sx, sy;
    if (ca > IAR) { sx = 1; sy = IAR / ca; } else { sx = ca / IAR; sy = 1; }
    var fxx = focus[0], fyy = 1 - focus[1];
    cam.S = [sx, sy];
    cam.O = [Math.min(Math.max(fxx - sx / 2, 0), 1 - sx), Math.min(Math.max(fyy - sy / 2, 0), 1 - sy)];
    cam.Z = zoom; cam.Zc = [zc[0], 1 - zc[1]];
  }
  // image px -> clip space
  function toClip(x, y) {
    var iu = x / IW, iv = 1 - y / IH;
    var u = (iu - cam.O[0]) / cam.S[0], v = (iv - cam.O[1]) / cam.S[1];
    u = (u - cam.Zc[0]) * cam.Z + cam.Zc[0]; v = (v - cam.Zc[1]) * cam.Z + cam.Zc[1];
    return [u * 2 - 1, v * 2 - 1];
  }
  function toPx(x, y) { var c = toClip(x, y); return [(c[0] + 1) / 2 * cw, (1 - (c[1] + 1) / 2) * ch]; }

  // draw an atlas item at image-space box (x,y,w,h); uvr = [u0,v0,u1,v1] (GL tex coords, v up)
  function drawItem(texName, x, y, w, h, uvr, alpha, mode, blurPx) {
    var tex = TEX[texName]; if (!tex) return;
    var a = toClip(x, y + h), b = toClip(x + w, y + h), c = toClip(x, y), d = toClip(x + w, y);
    gl.useProgram(sprP);
    gl.bindBuffer(gl.ARRAY_BUFFER, sbuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([a[0], a[1], uvr[0], uvr[1], b[0], b[1], uvr[2], uvr[1], c[0], c[1], uvr[0], uvr[3], d[0], d[1], uvr[2], uvr[3]]), gl.DYNAMIC_DRAW);
    var lp = gl.getAttribLocation(sprP, 'p'), lt = gl.getAttribLocation(sprP, 't');
    gl.enableVertexAttribArray(lp); gl.enableVertexAttribArray(lt);
    gl.vertexAttribPointer(lp, 2, gl.FLOAT, false, 16, 0); gl.vertexAttribPointer(lt, 2, gl.FLOAT, false, 16, 8);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform1i(us.uX, 0); gl.uniform1f(us.uAl, alpha); gl.uniform1i(us.uMode, mode || 0);
    var sz = tex._size || [2048, 2048];
    gl.uniform2f(us.uTx, (blurPx || 0) / sz[0], (blurPx || 0) / sz[1]);
    gl.uniform4f(us.uR, uvr[0], uvr[1], uvr[2], uvr[3]);
    gl.uniform3fv(us.uTint, grade.tint); gl.uniform1f(us.uVig, grade.vig); gl.uniform1f(us.uDark, grade.dark); gl.uniform2f(us.uRes, cw, ch);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.disableVertexAttribArray(lt);
  }

  var grade = { tint: [1, 1, 1], vig: .5, dark: 0 };
  function drawBase(a, b, m, t, tr) {
    gl.useProgram(baseP);
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    var lp = gl.getAttribLocation(baseP, 'p'); gl.enableVertexAttribArray(lp); gl.vertexAttribPointer(lp, 2, gl.FLOAT, false, 0, 0);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, TEX[a]);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, TEX[b] || TEX[a]);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, TEX[m] || TEX[a]);
    gl.uniform1i(ub.uA, 0); gl.uniform1i(ub.uB, 1); gl.uniform1i(ub.uM, 2);
    gl.uniform1f(ub.uT, (TEX[b] && TEX[m]) ? t : 0); gl.uniform1f(ub.uW, tr ? tr.w : .05); gl.uniform1f(ub.uGlow, tr ? tr.glow : 0);
    gl.uniform1f(ub.uZ, cam.Z); gl.uniform2fv(ub.uS, cam.S); gl.uniform2fv(ub.uOff, cam.O); gl.uniform2fv(ub.uZc, cam.Zc);
    gl.uniform3fv(ub.uTint, grade.tint); gl.uniform1f(ub.uVig, grade.vig); gl.uniform1f(ub.uDark, grade.dark); gl.uniform2f(ub.uRes, cw, ch);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  // ---------------- timeline ----------------
  function clamp(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }
  function sm(a, b, x) { var t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); }
  function eio(t) { return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  var target = 0, cur = 0, dirty = true, visible = false, lastIdx = -1, t0 = performance.now();

  function measure() {
    var r = sec.getBoundingClientRect(), total = sec.offsetHeight - window.innerHeight;
    target = clamp(-r.top / total);
  }
  function state(p) {
    var e = eio(clamp(p / PI_));
    var M = clamp((p - PI_) / (PO_ - PI_)) * NT;          // 0..6 continuous
    var k = Math.min(Math.floor(M), NT - 1), fr = M - k;
    var t = sm(.04, .96, fr);                               // nearly linear: continuous build
    if (M >= NT) { k = NT - 1; t = 1; }
    var o = clamp((p - PO_) / (1 - PO_));
    var idx = M < .03 ? 0 : (M >= NT - .02 ? NT + 1 : k + 1);
    return { e: e, M: M, k: k, t: t, o: o, idx: idx };
  }
  function setText(idx) {
    if (idx === lastIdx) return; lastIdx = idx;
    items.forEach(function (it, i) { it.classList.toggle('on', i === idx); });
    var it = items[idx];
    chapEl.textContent = it.getAttribute('data-chapter');
    countEl.textContent = '0' + (idx + 1);
    live.classList.toggle('on', it.hasAttribute('data-live'));
    pin.classList.toggle('card-r', it.getAttribute('data-side') === 'r');
    var c = +it.getAttribute('data-ch');
    rail.forEach(function (b, i) { b.classList.toggle('done', i < c); b.classList.toggle('now', i === c); });
  }
  totalEl.textContent = '0' + items.length;

  // ---------------- FX overlay (sun dust, landing dust) ----------------
  var fctx = fx.getContext('2d');
  var motes = [];
  for (var i = 0; i < 34; i++) motes.push({ x: Math.random(), y: Math.random() * .6, r: 1.2 + Math.random() * 2.4, s: .2 + Math.random() * .8, ph: Math.random() * 6.28 });
  var puff = [];
  for (var j = 0; j < 46; j++) puff.push({ a: Math.random() * Math.PI, v: .4 + Math.random(), r: 6 + Math.random() * 22, side: Math.random() < .5 ? -1 : 1 });
  function drawFX(now, st) {
    fctx.clearRect(0, 0, cw, ch);
    var dpr = cw / Math.max(1, canvas.clientWidth);
    if (!calm) {
      fctx.globalCompositeOperation = 'lighter';
      var tm = now / 1000;
      for (var i = 0; i < motes.length; i++) {
        var m = motes[i];
        var x = ((m.x + tm * .006 * m.s + Math.sin(tm * .3 * m.s + m.ph) * .01) % 1) * cw;
        var y = ((m.y + Math.cos(tm * .25 * m.s + m.ph) * .015 - tm * .003 * m.s) % 1 + 1) % 1 * ch * .8;
        var a = (.06 + .16 * Math.sin(tm * .8 * m.s + m.ph) ** 2) * (1 - grade.dark * 2) * st.e;
        var g = fctx.createRadialGradient(x, y, 0, x, y, m.r * 3 * dpr);
        g.addColorStop(0, 'rgba(255,236,190,' + a.toFixed(3) + ')'); g.addColorStop(1, 'rgba(255,220,160,0)');
        fctx.fillStyle = g; fctx.beginPath(); fctx.arc(x, y, m.r * 3 * dpr, 0, 6.283); fctx.fill();
      }
      fctx.globalCompositeOperation = 'source-over';
    }
    // landing dust for stelae drop
    var sit = MT && MT[4] && MT[4].sprites && MT[4].sprites.items[0];
    if (sit && st.k === 4 && st.t > sit.t[1] - .02 && st.t < sit.t[1] + .09) {
      var q = (st.t - sit.t[1] + .02) / .11;
      var b = sit.box, base = toPx(b[0] + b[2] / 2, b[1] + b[3] - 8), edge = toPx(b[0] + b[2], b[1] + b[3]);
      var span = Math.abs(edge[0] - base[0]);
      for (var k = 0; k < puff.length; k++) {
        var p = puff[k];
        var dx = p.side * (span * (.6 + .9 * q * p.v)) * (.4 + .6 * Math.cos(p.a) ** 2);
        var dy = -q * 40 * dpr * p.v * Math.sin(p.a);
        var r = p.r * dpr * (.6 + q * 1.6);
        var al = .22 * (1 - q) * Math.sin(p.a);
        var gg = fctx.createRadialGradient(base[0] + dx, base[1] + dy, 0, base[0] + dx, base[1] + dy, r);
        gg.addColorStop(0, 'rgba(214,200,180,' + al.toFixed(3) + ')'); gg.addColorStop(1, 'rgba(214,200,180,0)');
        fctx.fillStyle = gg; fctx.beginPath(); fctx.arc(base[0] + dx, base[1] + dy, r, 0, 6.283); fctx.fill();
      }
    }
  }

  // ---------------- render loop ----------------
  var raf = 0;
  function frame(now) {
    if (!visible) { raf = 0; return; }
    raf = requestAnimationFrame(frame);
    resize();
    var d = target - cur;
    cur = calm ? target : cur + d * .085;
    if (Math.abs(d) < 1e-5) cur = target;
    var st = state(cur);
    pin.style.setProperty('--e', st.e.toFixed(4));
    pin.style.setProperty('--o', st.o.toFixed(4));
    pin.style.setProperty('--p', cur.toFixed(4));
    pin.classList.toggle('done', st.o > .45);
    railFill.style.transform = 'scaleX(' + clamp(st.M / NT).toFixed(4) + ')';
    setText(st.idx);

    var P = clamp(st.M / NT);
    var tm = now / 1000;
    var breathe = calm ? 0 : .0035 * Math.sin(tm * .35);
    var tilt = st.k === 4 ? Math.sin(Math.PI * st.t) : 0;      // look up while stelae descend
    var zoom = 1.0 + .05 * P + breathe + .012 * tilt - .02 * st.o;
    var zc = [.56 + .01 * Math.sin(tm * .21) * (calm ? 0 : 1), .70 - .14 * tilt];
    setCam(zoom, zc, small ? [.55, .6] : [.54, .62]);
    // light: soft morning -> golden hour
    grade.tint = [lerp(.97, 1.045, P), lerp(.99, 1.0, P), lerp(1.03, .93, P)];
    grade.vig = .55; grade.dark = .05 * (1 - st.e) + .14 * st.o;

    var tr = (MT && MT[st.k]) || DEF[st.k];
    var a = 'k' + KEYS[st.k], b = 'k' + KEYS[st.k + 1], m = 't' + st.k;
    if (!TEX[a]) return;
    var spr = tr.sprites, ready = spr && TEX['a' + st.k];
    drawBase(a, b, m, ready || !spr ? st.t : 0, tr);
    if (ready && st.t < .9999) {
      gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      var AW = spr.size[0], AH = spr.size[1], an = 'a' + st.k, list = [];
      for (var i = 0; i < spr.items.length; i++) {
        var it = spr.items[i], u = clamp((st.t - it.t[0]) / (it.t[1] - it.t[0]));
        if (u <= 0) continue;
        list.push([it, u]);
      }
      // contact shadows first (own silhouette, blurred), grow as the element approaches the ground
      for (var j = 0; j < list.length; j++) {
        var it2 = list[j][0], u2 = list[j][1], bx = it2.box;
        var uvr = [it2.uv[0] / AW, 1 - (it2.uv[1] + bx[3]) / AH, (it2.uv[0] + bx[2]) / AW, 1 - it2.uv[1] / AH];
        var sa = (it2.sh || .45) * Math.pow(u2, 1.6) * (1 - sm(.86, 1, u2));
        if (sa > .003) drawItem(an, bx[0] - 6, bx[1] + 4, bx[2] + 12, bx[3] + 6, uvr, sa, 2, 3 + 9 * (1 - u2));
      }
      list.sort(function (p, q2) { return (p[0].box[1] + p[0].box[3]) - (q2[0].box[1] + q2[0].box[3]); });
      for (var k2 = 0; k2 < list.length; k2++) {
        var it3 = list[k2][0], u3 = list[k2][1], bx3 = it3.box;
        var e = 1 - Math.pow(1 - u3, 3);
        var settle = u3 > .82 ? Math.sin((u3 - .82) / .18 * Math.PI) * .012 : 0; // tiny bounce on landing
        var y = bx3[1] - (1 - e) * it3.d + settle * it3.d;
        var al = sm(0, .45, u3);
        var uvr3 = [it3.uv[0] / AW, 1 - (it3.uv[1] + bx3[3]) / AH, (it3.uv[0] + bx3[2]) / AW, 1 - it3.uv[1] / AH];
        drawItem(an, bx3[0], y, bx3[2], bx3[3], uvr3, al, 0, 0);
      }
      gl.disable(gl.BLEND);
    }
    drawFX(now, st);
  }
  function kick() { measure(); if (visible && !raf) raf = requestAnimationFrame(frame); }
  new IntersectionObserver(function (es) { visible = es[0].isIntersecting; if (visible) kick(); }, { rootMargin: '150px 0px' }).observe(sec);
  new IntersectionObserver(function (es) { if (es[0].isIntersecting) { preload(); this.disconnect(); } }, { rootMargin: '1500px 0px' }).observe(sec);
  window.addEventListener('scroll', kick, { passive: true });
  window.addEventListener('resize', kick);

  rail.forEach(function (b) {
    b.addEventListener('click', function () {
      var M = +b.getAttribute('data-go');
      var p = PI_ + (PO_ - PI_) * (M / NT) + .001;
      window.scrollTo({ top: sec.offsetTop + p * (sec.offsetHeight - window.innerHeight), behavior: 'smooth' });
    });
  });
  measure(); setText(0);

  // ---------------- fallback (no WebGL) ----------------
  function fallback() {
    canvas.style.display = 'none';
    var imgs = KEYS.map(function (k, i) {
      var im = document.createElement('img'); im.className = 'story-fb'; im.alt = ''; im.src = A + 'k' + k + (small ? '-m' : '') + '.webp';
      im.style.opacity = i ? 0 : 1; screen.insertBefore(im, screen.firstChild); return im;
    });
    function upd() {
      var r = sec.getBoundingClientRect(), p = clamp(-r.top / (sec.offsetHeight - innerHeight));
      var st = state(p);
      pin.style.setProperty('--e', st.e); pin.style.setProperty('--o', st.o); pin.style.setProperty('--p', p);
      imgs.forEach(function (im, i) { im.style.opacity = i <= st.k ? 1 : (i === st.k + 1 ? st.t : 0); });
      setText(st.idx);
    }
    window.addEventListener('scroll', upd, { passive: true }); upd();
  }
})();
