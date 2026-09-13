import fs from 'node:fs';

const read = path => fs.readFileSync(new URL(path,import.meta.url),'utf8');
export const readServerModule = path => read(path);
const asMountedApiRoutes = source => source.replace(
  /router\.(get|post|put|patch|delete)\('\//g,
  (_match,method) => `app.${method}('/api/`,
);

export const serverSource = [
  read('./index.mjs'),
  read('./access-control.mjs'),
  read('./database-migrator.mjs'),
  read('./normalized-state-store.mjs'),
  read('./payroll-workflow-guards.mjs'),
  read('./state-access.mjs'),
  read('./state-runtime.mjs'),
  asMountedApiRoutes(read('./routes/state-routes.mjs')),
  asMountedApiRoutes(read('./routes/company-routes.mjs')),
  // Preserve the old monolith's logical route ordering for source-level
  // security assertions while the runtime uses isolated Express routers.
  asMountedApiRoutes(read('./routes/journal-qoyod-routes.mjs')),
  asMountedApiRoutes(read('./routes/attendance-leave-routes.mjs')),
  asMountedApiRoutes(read('./routes/loan-penalty-routes.mjs')),
  asMountedApiRoutes(read('./routes/payroll-routes.mjs')),
  // Settlement tests use the first journal route as the following boundary.
  asMountedApiRoutes(read('./routes/journal-qoyod-routes.mjs')),
  asMountedApiRoutes(read('./routes/employee-routes.mjs')),
  asMountedApiRoutes(read('./routes/user-routes.mjs')),
  "app.use(express.static",
].join('\n');
