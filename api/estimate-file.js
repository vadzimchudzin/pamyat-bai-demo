/* Download estimate as a branded Word document through its unguessable public token. */
const L = require('./_lib');
const { makeEstimateDocx } = require('./_estimate-docx');

module.exports = async (req, res) => {
  try {
    if (req.method !== 'GET') {
      res.setHeader('Allow','GET');
      return L.send(res,405,{ok:false,error:'Method not allowed'});
    }
    await L.init();
    const token = String((req.query && req.query.token) || '').trim();
    if (!/^[a-f0-9]{32,80}$/i.test(token)) return L.send(res,400,{ok:false,error:'Некорректная ссылка на смету'});
    const result = await L.q(
      'select id,lead_id,client_name,client_phone,items,total,discount,notes,status,public_token,created_at,updated_at,created_by from estimates where public_token=$1 limit 1',
      [token]
    );
    if (!result.rows[0]) return L.send(res,404,{ok:false,error:'Смета не найдена'});
    const estimate = result.rows[0];
    estimate.items = Array.isArray(estimate.items) ? estimate.items : (typeof estimate.items === 'string' ? JSON.parse(estimate.items || '[]') : []);
    estimate.total = Number(estimate.total || 0);
    estimate.discount = Number(estimate.discount || 0);
    const content = await L.getContent();
    const file = await makeEstimateDocx(estimate, content.contacts || {});
    res.statusCode = 200;
    res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition','attachment; filename="pamyat-bai-estimate-' + estimate.id + '.docx"');
    res.setHeader('Content-Length',String(file.length));
    res.setHeader('Cache-Control','private, no-store, max-age=0');
    return res.end(file);
  } catch (e) {
    return L.fail(res,e);
  }
};
