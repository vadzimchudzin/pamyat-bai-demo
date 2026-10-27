const leads = [];
module.exports = async (req, res) => {
  if (req.method === "GET") {
    res.status(200).json({ ok: true, count: leads.length, leads: leads.slice(0, 50) });
    return;
  }
  if (req.method !== "POST") {
    res.status(405).json({ ok: false });
    return;
  }
  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  body.at = body.at || new Date().toISOString();
  body.status = body.status || "новая";
  leads.unshift(body);
  if (leads.length > 500) leads.pop();
  // Telegram: set TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID on Vercel to enable.
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chat = process.env.TELEGRAM_CHAT_ID;
  if (token && chat) {
    const text = [
      "Заявка ПАМЯТЬ.БАЙ",
      body.type || "",
      [body.name, body.phone].filter(Boolean).join(" · "),
      body.comment || "",
      body.price != null ? "от " + body.price + " BYN" : "",
      body.at,
      body.source || ""
    ].filter(Boolean).join("\n");
    try {
      await fetch("https://api.telegram.org/bot" + token + "/sendMessage", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chat_id: chat, text })
      });
    } catch (_) {}
  }
  res.status(200).json({ ok: true, stored: true, telegram: Boolean(token && chat) });
};
