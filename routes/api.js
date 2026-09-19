const express = require('express');
const router = express.Router();
const { loadConfig } = require('../services/config');
const { analyzeAccount, applyRecommendation } = require('../services/processor');
const { readHistory, loadRecommendations, saveCost } = require('../services/storage');
const { ensureFreshAuth, sessionToAuth, syncAuthToSession } = require('../services/token');

async function requireFreshToken(req, res, next) {
  if (!req.session.access_token) return res.status(401).json({ error: 'Não autenticado' });
  try {
    const auth = await ensureFreshAuth(sessionToAuth(req.session));
    syncAuthToSession(auth, req.session);
    next();
  } catch (err) {
    return res.status(401).json({ error: `Sessão expirada: ${err.message}` });
  }
}

router.get('/status', async (req, res) => { res.json({ authenticated: !!req.session.access_token, user: req.session.user || null, config: await loadConfig() }); });

router.post('/analyze', requireFreshToken, async (req, res) => {
  try {
    const data = await analyzeAccount(req.session, { maxItems: Number(req.body.maxItems || 500), runType: 'manual-analysis' });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.response?.data?.message || err.message });
  }
});

router.get('/recommendations', requireFreshToken, async (req, res) => { res.json(await loadRecommendations()); });

router.post('/recommendations/:itemId/apply', requireFreshToken, async (req, res) => {
  try {
    const result = await applyRecommendation(req.session, req.params.itemId, String(req.body.type || ''), req.body.after);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.response?.data?.message || err.message });
  }
});

router.post('/costs/:itemId', requireFreshToken, async (req, res) => {
  const cost = Number(req.body.cost);
  if (!Number.isFinite(cost) || cost <= 0) return res.status(400).json({ error: 'Informe um custo maior que zero' });
  const saved = await saveCost(req.params.itemId, cost);
  res.json({ ok: true, itemId: req.params.itemId, cost: saved, message: 'Custo salvo. Rode a análise novamente para recalcular o preço seguro.' });
});

router.get('/history', requireFreshToken, async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit || 100), 1), 500);
  res.json({ history: await readHistory(limit) });
});

module.exports = router;
