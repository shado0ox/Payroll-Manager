import { initializeDatabaseSchema } from './database-schema.mjs';
import { runNumberedStateMigrations } from './numbered-state-migrations.mjs';

export function createDatabaseMigrator(dependencies) {
  return async function migrate() {
    await initializeDatabaseSchema(dependencies);
    await runNumberedStateMigrations(dependencies);
  };
}
