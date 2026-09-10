import crypto from 'node:crypto';

const SECRET_KEY = /(authorization|cookie|password|secret|token|api[-_]?key|database_url)/i;

function safeValue(value, key = '', depth = 0) {
  if (SECRET_KEY.test(key)) return '[REDACTED]';
  if (depth > 4) return '[TRUNCATED]';
  if (value instanceof Error) return {
    name:value.name,
    message:String(value.message || 'Unknown error').slice(0, 500),
    code:value.code ? String(value.code).slice(0, 100) : undefined,
    stack:process.env.NODE_ENV === 'production' ? undefined : String(value.stack || '').slice(0, 2_000),
  };
  if (Array.isArray(value)) return value.slice(0, 50).map(item => safeValue(item, key, depth + 1));
  if (value && typeof value === 'object') return Object.fromEntries(
    Object.entries(value).slice(0, 100).map(([childKey, child]) => [childKey, safeValue(child, childKey, depth + 1)])
  );
  if (typeof value === 'string') return value.slice(0, 2_000);
  return value;
}

export function createOperationalLogger({ service = 'masar-payroll', buildId = 'development', write = line => process.stdout.write(`${line}\n`) } = {}) {
  return (level, event, fields = {}) => write(JSON.stringify(safeValue({
    timestamp:new Date().toISOString(),
    level,
    service,
    buildId,
    event,
    ...fields,
  })));
}

export function requestContextMiddleware(logger) {
  return (req, res, next) => {
    const supplied = String(req.get('x-request-id') || '');
    req.requestId = /^[A-Za-z0-9._:-]{1,100}$/.test(supplied) ? supplied : crypto.randomUUID();
    res.setHeader('X-Request-Id', req.requestId);
    const startedAt = process.hrtime.bigint();
    res.on('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
      logger(res.statusCode >= 500 ? 'error' : 'info', 'http_request', {
        requestId:req.requestId,
        method:req.method,
        path:req.originalUrl?.split('?')[0] || req.path,
        status:res.statusCode,
        durationMs:Number(durationMs.toFixed(1)),
        userId:req.user?.id,
      });
    });
    next();
  };
}

export function createOperationalAlertSender({ logger, fetchImpl = globalThis.fetch, resendApiKey = '', emailFrom = '', recipients = [], webhookUrl = '' }) {
  const to = [...new Set(recipients.map(value => String(value).trim()).filter(Boolean))];
  return async ({ event, status, detail }) => {
    const payload = { service:'masar-payroll', event, status, detail:String(detail || '').slice(0, 1_000), timestamp:new Date().toISOString() };
    const deliveries = [];
    if (webhookUrl) deliveries.push(fetchImpl(webhookUrl, {
      method:'POST', headers:{ 'Content-Type':'application/json' }, body:JSON.stringify(payload), signal:AbortSignal.timeout(10_000),
    }));
    if (resendApiKey && emailFrom && to.length) deliveries.push(fetchImpl('https://api.resend.com/emails', {
      method:'POST',
      headers:{ Authorization:`Bearer ${resendApiKey}`, 'Content-Type':'application/json' },
      body:JSON.stringify({ from:emailFrom, to, subject:`Masar Payroll: ${event} (${status})`, text:JSON.stringify(payload, null, 2) }),
      signal:AbortSignal.timeout(10_000),
    }));
    if (!deliveries.length) {
      logger('warn', 'operational_alert_skipped', { event, reason:'NO_ALERT_CHANNEL' });
      return false;
    }
    const results = await Promise.allSettled(deliveries);
    const delivered = results.some(result => result.status === 'fulfilled' && result.value.ok);
    logger(delivered ? 'info' : 'error', delivered ? 'operational_alert_sent' : 'operational_alert_failed', { event, channels:deliveries.length });
    return delivered;
  };
}

export function startDatabaseHealthMonitor({ pool, logger, sendAlert, intervalMs = 60_000, failureThreshold = 3 }) {
  let consecutiveFailures = 0;
  let outageAlerted = false;
  let running = false;
  const check = async () => {
    if (running) return;
    running = true;
    const startedAt = process.hrtime.bigint();
    try {
      await pool.query('SELECT 1');
      const latencyMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
      if (outageAlerted) await sendAlert({ event:'database_connection', status:'recovered', detail:`latency_ms=${latencyMs.toFixed(1)}` });
      if (consecutiveFailures) logger('info', 'database_connection_recovered', { consecutiveFailures, latencyMs:Number(latencyMs.toFixed(1)) });
      consecutiveFailures = 0;
      outageAlerted = false;
    } catch (error) {
      consecutiveFailures += 1;
      logger('error', 'database_health_check_failed', { consecutiveFailures, error });
      if (!outageAlerted && consecutiveFailures >= failureThreshold) {
        outageAlerted = true;
        await sendAlert({ event:'database_connection', status:'down', detail:`failed_checks=${consecutiveFailures}; code=${error?.code || 'unknown'}` });
      }
    } finally {
      running = false;
    }
  };
  const timer = setInterval(() => { void check(); }, Math.max(10_000, intervalMs));
  timer.unref();
  return { check, stop:() => clearInterval(timer) };
}
