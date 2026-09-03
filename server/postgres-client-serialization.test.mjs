import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const server = fs.readFileSync('server/index.mjs','utf8');
const workflow = fs.readFileSync('.github/workflows/payroll-workflow-ci.yml','utf8');

test('a checked-out PostgreSQL client never receives concurrent queries', () => {
  const promiseAllBodies = [...server.matchAll(/Promise\.all\(\[([\s\S]*?)\]\)/g)].map(match => match[1]);
  assert.equal(promiseAllBodies.some(body => body.includes('client.query(')),false);
  assert.match(server,/const employeeResult = await client\.query/);
  assert.match(server,/const integration = await client\.query/);
});

test('runtime PostgreSQL CI rejects the pg concurrent-query warning', () => {
  assert.match(workflow,/Reject concurrent PoolClient queries/);
  assert.match(workflow,/client\.query\(\) when the client is already executing a query/);
});
