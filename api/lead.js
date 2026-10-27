module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false });
    return;
  }
  // Sprint 1 stub: accept the lead. Telegram group + DB come next.
  res.status(200).json({ ok: true });
};
