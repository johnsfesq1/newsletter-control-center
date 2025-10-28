const express = require('express');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 8080;
const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL || "";

// --- light notifier (logs by default; posts to Slack if webhook is set)
async function notify(message) {
  console.log(`[notify] ${message}`);
  if (!SLACK_WEBHOOK_URL) return { ok: true, via: 'log' };
  try {
    const res = await fetch(SLACK_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: message })
    });
    const ok = res.ok;
    if (!ok) console.error(`[notify] Slack error ${res.status}`);
    return { ok, via: 'slack', status: res.status };
  } catch (err) {
    console.error('[notify] Slack exception', err);
    return { ok: false, via: 'slack', error: String(err) };
  }
}

app.get('/status', (_req, res) => res.type('text').send('ok'));

app.get('/ping', async (_req, res) => {
  const ts = new Date().toISOString();
  const note = await notify(`✅ NCC pipeline alive @ ${ts}`);
  res.json({ ok: true, ping: ts, notify: note });
});

app.get('/run', async (_req, res) => {
  const ts = new Date().toISOString();
  await notify(`🚀 NCC daily run triggered @ ${ts}`);
  // TODO: pull newsletters, summarize, deliver digest
  res.json({ ok: true, message: 'Daily run placeholder', ts });
});

app.use((req, res) => res.status(404).json({ ok: false, error: 'not_found', path: req.path }));

app.listen(PORT, () => {
  console.log(`Server listening on ${PORT}`);
});
