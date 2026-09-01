import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const dashboard = fs.readFileSync(new URL('../src/components/DashboardView.tsx', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const server = fs.readFileSync(new URL('./index.mjs', import.meta.url), 'utf8');

test('dashboard uses the company current month and never falls back to a historical run', () => {
  assert.match(dashboard, /getCurrentPeriod\(company\.timezone \|\| 'Asia\/Riyadh'\)/);
  assert.match(dashboard, /find\(run => run\.periodMonth === currentPeriod\)/);
  assert.doesNotMatch(dashboard, /const latestRun = companyPayrollRuns\[0\]/);
});

test('Qoyod integration data is not rendered on the dashboard', () => {
  assert.doesNotMatch(dashboard, /تكامل نظام قيود|Qoyod Integration|فتح إعدادات قيود والترحيل/);
});

test('database status verifies PostgreSQL and automatically recovers without a refresh', () => {
  assert.match(server, /app\.get\('\/api\/health'[\s\S]*pool\.query\('SELECT 1'\)/);
  assert.match(app, /window\.setInterval\(\(\) => \{ void checkDatabaseHealth\(false\); \}, 30_000\)/);
  assert.match(app, /isCloudConnected: true, isChecking: false, lastError: null/);
});
