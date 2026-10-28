/* Финансовый отдел: актуальный прайс, сметы и публичная печатная ссылка по случайному токену. */
const L = require('./_lib');
function clean(s, n) { return String(s == null ? '' : s).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n); }
function number(v, fallback) { const n = Number(v); return Number.isFinite(n) ? n : fallback; }
function shapeEstimate(row) {
  if (!row) return null;
  return Object.assign({}, row, {
    items: Array.isArray(row.items) ? row.items : (typeof row.items === 'string' ? JSON.parse(row.items || '[]') : []),
    total: Number(row.total || 0),
    discount: Number(row.discount || 0)
  });
}
module.exports = async (req, res) => {
  try {
    await L.init();
    if (req.method === 'GET' && req.query && req.query.token) {
      const r = await L.q('select * from estimates where public_token=$1 limit 1', [clean(req.query.token, 100)]);
      if (!r.rows[0]) return L.send(res, 404, { ok:false, error:'Ссылка на смету недействительна' });
      const c = await L.getContent();
      const e = shapeEstimate(r.rows[0]);
      res.setHeader('Cache-Control', 'no-store');
      return L.send(res, 200, { ok:true, estimate:e, company:c.contacts || {} });
    }
    const session = await L.requireAdmin(req, res); if (!session) return;
    if (req.method === 'GET') {
      const view = String((req.query && req.query.view) || 'pricebook');
      if (view === 'estimates') {
        const r = await L.q('select id,lead_id,client_name,client_phone,items,total,discount,notes,status,public_token,created_at,updated_at,created_by from estimates order by id desc limit 500');
        return L.send(res, 200, { ok:true, estimates:r.rows.map(shapeEstimate) });
      }
      const book = await L.getPriceBook();
      return L.send(res, 200, { ok:true, pricebook:book });
    }
    if (req.method !== 'POST') return L.send(res, 405, {ok:false,error:'Method not allowed'});
    const b = L.body(req), action = String(b.action || '');
    if (action === 'save_pricebook') {
      const items = Array.isArray(b.items) ? b.items.slice(0, 3000).map((x, i) => ({
        id: clean(x.id, 80) || 'price-' + (i + 1),
        category: clean(x.category, 120),
        name: clean(x.name, 220) || 'Позиция без названия',
        unit: clean(x.unit, 40) || 'шт.',
        price: x.price === '' || x.price === null || x.price === undefined ? null : Math.max(0, Math.round(number(x.price, 0))),
        siteTarget: clean(x.siteTarget, 220)
      })) : [];
      await L.q(`update price_catalog set items=$1::jsonb, site_sync=$2, updated_at=now(), updated_by=$3 where id=1`,
        [JSON.stringify(items), !!b.siteSync, String(session.u || '').slice(0,80)]);
      await L.log(req, 'Финансы', 'обновлён актуальный каталог цен (' + items.length + ' позиций) · ' + session.u);
      return L.send(res, 200, { ok:true, pricebook:await L.getPriceBook() });
    }
    if (action === 'create_estimate') {
      if (!b.leadId || !Number.isInteger(Number(b.leadId))) return L.send(res, 400, {ok:false,error:'Не указан номер заявки'});
      const estimate = await L.createEstimateFromLead(Number(b.leadId), session.u);
      await L.log(req, 'Смета', 'создан черновик №' + estimate.id + ' по заявке №' + b.leadId + ' · ' + session.u);
      return L.send(res, 200, {ok:true, estimate:shapeEstimate(estimate)});
    }
    if (action === 'update_estimate') {
      const id = Number(b.id);
      if (!Number.isInteger(id) || id <= 0) return L.send(res, 400, {ok:false,error:'Не указан номер сметы'});
      const rows = Array.isArray(b.items) ? b.items.slice(0, 500).map((x, i) => ({
        name: clean(x.name, 240) || ('Позиция ' + (i + 1)),
        unit: clean(x.unit, 40) || 'шт.',
        qty: Math.max(0, number(x.qty, 0)),
        price: Math.max(0, number(x.price, 0)),
        note: clean(x.note, 500)
      })) : [];
      const subtotal = rows.reduce((sum, x) => sum + x.qty * x.price, 0);
      const discount = Math.min(subtotal, Math.max(0, number(b.discount, 0)));
      const total = Math.max(0, subtotal - discount);
      const status = ['draft','sent','approved','rejected'].indexOf(String(b.status)) >= 0 ? String(b.status) : 'draft';
      const updated = await L.q(`update estimates set client_name=$1,client_phone=$2,items=$3::jsonb,total=$4,discount=$5,notes=$6,status=$7,updated_at=now()
        where id=$8 returning id,lead_id,client_name,client_phone,items,total,discount,notes,status,public_token,created_at,updated_at,created_by`,
        [clean(b.client_name, 120),clean(b.client_phone,60),JSON.stringify(rows),total,discount,clean(b.notes,3000),status,id]);
      if (!updated.rows[0]) return L.send(res,404,{ok:false,error:'Смета не найдена'});
      await L.log(req, 'Смета', 'изменена смета №' + id + ' · статус ' + status + ' · ' + session.u);
      return L.send(res,200,{ok:true,estimate:shapeEstimate(updated.rows[0])});
    }
    return L.send(res, 400, {ok:false,error:'Неизвестное действие'});
  } catch (e) {
    if (e && e.code === 'NO_LEAD') return L.send(res, 404, {ok:false,error:e.message});
    return L.fail(res,e);
  }
};
