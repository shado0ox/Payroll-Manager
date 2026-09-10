import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import test from 'node:test';

const backup = fs.readFileSync('scripts/postgres-backup.sh','utf8');
const restore = fs.readFileSync('scripts/postgres-restore-drill.sh','utf8');
const backupTimer = fs.readFileSync('deploy/systemd/masar-payroll-backup.timer','utf8');
const restoreTimer = fs.readFileSync('deploy/systemd/masar-payroll-restore-drill.timer','utf8');
const workflow = fs.readFileSync('.github/workflows/payroll-workflow-ci.yml','utf8');

test('backup and restore scripts have valid shell syntax', () => {
  execFileSync('bash',['-n','scripts/postgres-backup.sh']);
  execFileSync('bash',['-n','scripts/postgres-restore-drill.sh']);
});

test('daily backup is atomic, verified, checksummed, and retained', () => {
  assert.match(backup,/pg_dump .* -Fc/);
  assert.match(backup,/pg_restore --list/);
  assert.match(backup,/\.partial/);
  assert.match(backup,/sha256sum/);
  assert.match(backup,/PAYROLL_BACKUP_RETENTION_DAYS:-30/);
  assert.match(backup,/find "\$\{backup_dir\}" -maxdepth 1/);
  assert.match(backupTimer,/OnCalendar=\*-\*-\* 02:15:00/);
  assert.match(backupTimer,/Persistent=true/);
});

test('restore drill can only replace an explicitly disposable database', () => {
  assert.match(restore,/RESTORE_DRILL_CONFIRM:-.*!= "YES"/);
  assert.match(restore,/restore_database.*==.*production_database/);
  assert.match(restore,/restore\|test\|drill/);
  assert.match(restore,/sha256sum -c/);
  assert.match(restore,/--exit-on-error --single-transaction/);
  assert.match(restore,/dropdb .*--if-exists --force "\$\{restore_database\}"/);
  assert.match(restore,/RESTORE_DRILL_SUCCESS/);
  assert.match(restoreTimer,/OnCalendar=Sun \*-\*-\* 03:30:00/);
  assert.match(restoreTimer,/Persistent=true/);
});

test('CI creates and restores a real custom-format PostgreSQL backup', () => {
  assert.match(workflow,/backup-restore-drill:/);
  assert.match(workflow,/docker run -d --name masar-backup-ci/);
  assert.match(workflow,/\.\/scripts\/postgres-backup\.sh/);
  assert.match(workflow,/\.\/scripts\/postgres-restore-drill\.sh/);
  assert.match(workflow,/RESTORE_DRILL_CONFIRM: 'YES'/);
});
