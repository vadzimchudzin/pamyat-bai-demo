(function (w) {
  const KEY = "pamyat_store_v1";
  const def = {
    prices: {
      monument: { vertical: 950, horizontal: 1700, complex: 3300, cross: 1800, exclusive: 0 },
      engraving: { base: 0, art: 200, medal: 250 },
      foundation: { concrete: 1000, ready: 300 },
      land: { granite_tile: 1600, concrete_curb: 300, paving: 400, fence: 1200 },
      decor: { vase: 200, grass: 80 }
    },
    texts: {
      heroTitle: "Память, которая живёт",
      heroLead: "Памятники из гранита, установка под ключ и благоустройство участка. Беларусь.",
      cta: "Рассчитать стоимость",
      manifesto: "Памятник — это не камень. Это знак того, что человека помнят и любят."
    },
    settings: {
      phone: "+375 XX XXX-XX-XX",
      telegram: "#",
      viber: "#",
      whatsapp: "#",
      repeatMinutes: 30,
      repeatLimit: 3
    },
    leads: [],
    expenses: [],
    ads: [],
    catalog: w.PAMYAT_CATALOG || []
  };

  function load() {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) || "null");
      if (!raw) return JSON.parse(JSON.stringify(def));
      return Object.assign(JSON.parse(JSON.stringify(def)), raw, {
        prices: Object.assign({}, def.prices, raw.prices),
        texts: Object.assign({}, def.texts, raw.texts),
        settings: Object.assign({}, def.settings, raw.settings)
      });
    } catch (e) {
      return JSON.parse(JSON.stringify(def));
    }
  }
  function save(s) { localStorage.setItem(KEY, JSON.stringify(s)); }
  function addLead(lead) {
    const s = load();
    lead.id = lead.id || ("L" + Date.now());
    lead.status = lead.status || "новая";
    lead.history = lead.history || [{ at: new Date().toISOString(), t: "создана" }];
    lead.repeats = lead.repeats || 0;
    s.leads.unshift(lead);
    save(s);
    try {
      fetch("/api/lead", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(lead) });
    } catch (_) {}
    return lead;
  }
  w.PamyatStore = { load, save, addLead, def };
})(window);
