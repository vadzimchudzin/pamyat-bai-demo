(function () {
  var root = document.documentElement;
  function flicker() {
    var r = Math.random();
    var intensity = 0.82 + Math.random() * 0.19;
    if (r > 0.78) intensity = 0.70 + Math.random() * 0.12;
    if (r > 0.95) intensity = 1.02 + Math.random() * 0.10;
    root.style.setProperty('--flicker', intensity.toFixed(3));
    root.style.setProperty('--fx', ((Math.random() - 0.5) * 11).toFixed(2) + 'px');
    root.style.setProperty('--fy', ((Math.random() - 0.5) * 9).toFixed(2) + 'px');
    setTimeout(flicker, 65 + Math.random() * 145);
  }
  flicker();
})();
