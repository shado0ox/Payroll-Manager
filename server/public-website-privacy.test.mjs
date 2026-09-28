import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const website=fs.readFileSync(new URL('../src/components/PublicWebsite.tsx',import.meta.url),'utf8');
const login=fs.readFileSync(new URL('../src/components/LoginView.tsx',import.meta.url),'utf8');
const registration=fs.readFileSync(new URL('./routes/auth-registration-routes.mjs',import.meta.url),'utf8');
const schema=fs.readFileSync(new URL('./database-schema.mjs',import.meta.url),'utf8');
const server=fs.readFileSync(new URL('./index.mjs',import.meta.url),'utf8');

test('public website exposes marketing, quote, privacy and terms pages',()=>{
  for (const path of ['/pricing','/privacy','/terms']) assert.match(website,new RegExp(path.replace('/','\\/')));
  assert.match(website,/اطلب عرض سعر/);
  assert.match(website,/Privacy Policy/);
});

test('registration requires and records versioned privacy consent on the server',()=>{
  assert.match(login,/privacyAccepted/);
  assert.match(registration,/PRIVACY_CONSENT_REQUIRED/);
  assert.match(registration,/privacyVersion = '1\.0'/);
  assert.match(registration,/INSERT INTO .*privacy_consents/);
  assert.match(schema,/CREATE TABLE IF NOT EXISTS .*privacy_consents/);
  assert.match(schema,/ip_hash text NOT NULL/);
});

test('search engines receive a public-only sitemap and robots policy',()=>{
  assert.match(server,/app\.get\('\/robots\.txt'/);
  assert.match(server,/app\.get\('\/sitemap\.xml'/);
  assert.match(server,/Disallow: \/dashboard/);
  assert.match(server,/PUBLIC_SITE_URL/);
});
