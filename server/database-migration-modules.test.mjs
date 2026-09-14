import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { NUMBERED_STATE_MIGRATIONS } from './numbered-state-migrations.mjs';

const read = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const migrator = read('./database-migrator.mjs');
const migrations = read('./numbered-state-migrations.mjs');

test('state migrations have stable unique versions in execution order', () => {
  assert.deepEqual(NUMBERED_STATE_MIGRATIONS, [
    '001_normalized_payroll',
    '002_normalized_operations',
    '003_normalized_core',
    '004_company_trials',
    '005_normalized_settlements',
  ]);
  assert.equal(new Set(NUMBERED_STATE_MIGRATIONS).size, NUMBERED_STATE_MIGRATIONS.length);

  let priorPosition = -1;
  for (const version of NUMBERED_STATE_MIGRATIONS) {
    assert.ok(migrations.includes(version), `${version} must have an implementation marker`);
    const position = migrations.indexOf(version, priorPosition + 1);
    assert.ok(position > priorPosition, `${version} must follow the preceding migration`);
    priorPosition = position;
  }
});

test('database migrator initializes schema before running data migrations', () => {
  const initializePosition = migrator.indexOf('await initializeDatabaseSchema(dependencies)');
  const migratePosition = migrator.indexOf('await runNumberedStateMigrations(dependencies)');

  assert.ok(initializePosition >= 0, 'schema initialization must remain explicit');
  assert.ok(migratePosition > initializePosition, 'data migrations require initialized tables');
});
