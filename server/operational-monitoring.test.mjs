import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { createOperationalAlertSender, createOperationalLogger, startDatabaseHealthMonitor } from './operational-monitoring.mjs';

test('structured logger emits JSON and redacts secret fields', () => {
  const lines = [];
  const logger = createOperationalLogger({ buildId:'test-build', write:line => lines.push(line) });
  logger('error','test_failure',{ authorization:'Bearer secret',nested:{ password:'unsafe' },error:new Error('expected') });
  const entry = JSON.parse(lines[0]);
  assert.equal(entry.level,'error');
  assert.equal(entry.buildId,'test-build');
  assert.equal(entry.authorization,'[REDACTED]');
  assert.equal(entry.nested.password,'[REDACTED]');
  assert.equal(entry.error.message,'expected');
  assert.doesNotMatch(lines[0],/Bearer secret|unsafe/);
});

test('database monitor alerts once after threshold and once on recovery', async () => {
  let failuresRemaining = 3;
  const alerts = [];
  const pool = { query:async () => {
    if (failuresRemaining > 0) {
      failuresRemaining -= 1;
      throw Object.assign(new Error('connection refused'),{ code:'ECONNREFUSED' });
    }
  } };
  const monitor = startDatabaseHealthMonitor({
    pool,
    logger:() => {},
    sendAlert:async alert => alerts.push(alert),
    intervalMs:999_999,
    failureThreshold:3,
  });
  await monitor.check();
  await monitor.check();
  assert.equal(alerts.length,0);
  await monitor.check();
  assert.deepEqual(alerts.map(alert => alert.status),['down']);
  await monitor.check();
  assert.deepEqual(alerts.map(alert => alert.status),['down','recovered']);
  await monitor.check();
  assert.equal(alerts.length,2);
  monitor.stop();
});

test('alert sender supports a webhook without exposing its URL in logs', async () => {
  const requests = [];
  const logs = [];
  const send = createOperationalAlertSender({
    logger:(level,event,fields) => logs.push({ level,event,fields }),
    webhookUrl:'https://alerts.example.test/private-token',
    fetchImpl:async (url, options) => { requests.push({ url,options }); return { ok:true }; },
  });
  assert.equal(await send({ event:'database_connection',status:'down',detail:'failed_checks=3' }),true);
  assert.equal(requests.length,1);
  assert.equal(JSON.parse(requests[0].options.body).status,'down');
  assert.doesNotMatch(JSON.stringify(logs),/private-token/);
});

test('health endpoint and systemd failures expose operational state safely', () => {
  const health = fs.readFileSync('server/routes/system-routes.mjs','utf8');
  const backupService = fs.readFileSync('deploy/systemd/masar-payroll-backup.service','utf8');
  const restoreService = fs.readFileSync('deploy/systemd/masar-payroll-restore-drill.service','utf8');
  assert.match(health,/status:'degraded'/);
  assert.match(health,/database:\{ status:'down' \}/);
  assert.match(health,/res\.status\(503\)/);
  assert.doesNotMatch(health,/error\.message|String\(error/);
  assert.match(backupService,/OnFailure=masar-payroll-ops-alert@%n\.service/);
  assert.match(restoreService,/OnFailure=masar-payroll-ops-alert@%n\.service/);
});
