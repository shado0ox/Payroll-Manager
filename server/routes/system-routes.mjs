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

  router.get('/health', async (_req, res) => {
    const startedAt = process.hrtime.bigint();
    try {
      await pool.query('SELECT 1');
      const databaseLatencyMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
      res.setHeader('Cache-Control', 'no-store');
      res.json({
        status:'ok',
        service:'masar-payroll',
        buildId,
        uptimeSeconds:Math.floor(process.uptime()),
        timestamp:new Date().toISOString(),
        database:{ status:'ok', latencyMs:Number(databaseLatencyMs.toFixed(1)) },
      });
    } catch {
      res.setHeader('Cache-Control', 'no-store');
      res.status(503).json({
        status:'degraded',
        service:'masar-payroll',
        buildId,
        uptimeSeconds:Math.floor(process.uptime()),
        timestamp:new Date().toISOString(),
        database:{ status:'down' },
      });
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
