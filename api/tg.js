/* Telegram: вебхук от бота (кнопки «Взять в работу» / «Пропустить») и действия админа (?action=test|webhook|info) */
const L = require('./_lib');
module.exports = async (req, res) => {
  try {
    const action = req.query && req.query.action;
    if (!action) {                                                        // запрос от Telegram
      if (req.headers['x-telegram-bot-api-secret-token'] !== L.tgSecret()) return L.send(res, 403, { ok: false });
      const c = await L.getContent(), t = c.telegram || {}, up = L.body(req), cb = up.callback_query;
      if (!cb || !t.token) return L.send(res, 200, { ok: true });
      const m = /^(take|skip):(\d+)$/.exec(cb.data || ''); if (!m) return L.send(res, 200, { ok: true });
      const who = cb.from.username ? '@' + cb.from.username : [cb.from.first_name, cb.from.last_name].filter(Boolean).join(' ');
      const st = m[1] === 'take' ? 'взята в работу' : 'отказ';
      await L.init();
      const r = await L.q(`update leads set status=$1, taken_by=$2, history = history || $3::jsonb where id=$4 and status='новая' returning *`,
        [st, who, JSON.stringify([{ at: new Date().toISOString(), t: st, by: who }]), +m[2]]);
      if (!r.rows[0]) { await L.tg(t.token, 'answerCallbackQuery', { callback_query_id: cb.id, text: 'Заявку уже обработали' }); return L.send(res, 200, { ok: true }); }
      const tail = m[1] === 'take' ? '\n\n✅ <b>Взял в работу: ' + L.esc(who) + '</b>' : '\n\n✖️ <b>Пропущена: ' + L.esc(who) + '</b>';
      await L.tg(t.token, 'editMessageText', { chat_id: cb.message.chat.id, message_id: cb.message.message_id, text: L.leadText(r.rows[0]) + tail, parse_mode: 'HTML', disable_web_page_preview: true });
      await L.tg(t.token, 'answerCallbackQuery', { callback_query_id: cb.id, text: m[1] === 'take' ? 'Заявка ваша' : 'Пропущено' });
      await L.log(req, 'Telegram', 'заявка №' + m[2] + ': ' + st + ' · ' + who);
      return L.send(res, 200, { ok: true });
    }
    const s = await L.requireAdmin(req, res); if (!s) return;
    const c = await L.getContent(), t = c.telegram || {};
    if (!t.token) return L.send(res, 400, { ok: false, error: 'Сначала укажите токен бота' });
    if (action === 'info') {
      const me = await L.tg(t.token, 'getMe', {});
      const wh = await L.tg(t.token, 'getWebhookInfo', {});
      return L.send(res, 200, { ok: me.ok, bot: me.result, webhook: wh.result, error: me.description });
    }
    if (action === 'webhook') {
      const host = req.headers['x-forwarded-host'] || req.headers.host;
      const r = await L.tg(t.token, 'setWebhook', { url: 'https://' + host + '/api/tg', secret_token: L.tgSecret(), allowed_updates: ['callback_query'] });
      await L.log(req, 'Telegram', 'подключение кнопок: ' + (r.ok ? 'ок' : r.description), r.ok);
      return L.send(res, 200, { ok: r.ok, error: r.description });
    }
    if (action === 'test') {
      if (!t.chat) return L.send(res, 400, { ok: false, error: 'Укажите ID группы' });
      const r = await L.tg(t.token, 'sendMessage', { chat_id: t.chat, text: '✅ ПАМЯТЬ.БАЙ: бот подключён. Сюда будут приходить заявки с сайта.' });
      await L.log(req, 'Telegram', 'тест: ' + (r.ok ? 'ок' : r.description), r.ok);
      return L.send(res, 200, { ok: r.ok, error: r.description });
    }
    L.send(res, 400, { ok: false });
  } catch (e) { L.fail(res, e); }
};
