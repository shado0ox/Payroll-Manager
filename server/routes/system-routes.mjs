import express from 'express';

export function createSystemRouter({
  pool,
  buildId,
  publicRegistrationEnabled,
  resendApiKey,
  verificationEmailFrom,
  trialDays,
  developerContactPhone,
}) {
  const router = express.Router();

  router.get('/health', async (_req, res, next) => {
    try {
      await pool.query('SELECT 1');
      res.json({ status:'ok', buildId });
    } catch (error) {
      next(error);
    }
  });

  router.get('/version', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.json({ buildId });
  });

  router.get('/public/config', (_req, res) => {
    res.json({
      registrationEnabled:publicRegistrationEnabled && Boolean(resendApiKey && verificationEmailFrom),
      trialDays,
      developerContactPhone,
    });
  });

  return router;
}
