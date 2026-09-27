import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

const bundle=await build({entryPoints:['src/utils/searchNormalization.ts'],bundle:true,format:'esm',platform:'node',write:false});
const search=await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);

test('employee search ignores letter case and whitespace',()=>{
  const values=['EMP-1014','Shady Nasif','الشؤون الإدارية'];
  assert.equal(search.matchesSearchText('shady nasif',values),true);
  assert.equal(search.matchesSearchText('SHADYNASIF',values),true);
  assert.equal(search.matchesSearchText('  shady   NASIF ',values),true);
  assert.equal(search.matchesSearchText('EMP 1014',values),true);
  assert.equal(search.matchesSearchText('الشؤونالإدارية',values),true);
});
