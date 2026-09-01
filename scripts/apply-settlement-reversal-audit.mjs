import fs from 'node:fs';

function patch(path, transform) {
  const source = fs.readFileSync(path, 'utf8');
  const next = transform(source);
  if (next !== source) fs.writeFileSync(path, next);
}

patch('src/types/index.ts', source => {
  if (!source.includes('reversalReason?: string;')) {
    const anchor = `  reversedAt?: string;\n}`;
    if (!source.includes(anchor)) throw new Error('Missing settlement reversal type anchor');
    source = source.replace(anchor, `  reversedAt?: string;\n  reversalReason?: string;\n}`);
  }
  return source;
});

patch('server/index.mjs', source => {
  const oldGuard = `    if (previous?.status === 'PAID' && settlement.status === 'REVERSED' && !settlement.reversedAt) {\n      throw workflowError(400, 'SETTLEMENT_REVERSAL_DATE_REQUIRED');\n    }`;
  const newGuard = `    if (previous?.status === 'PAID' && settlement.status === 'REVERSED') {\n      if (!settlement.reversedAt) throw workflowError(400, 'SETTLEMENT_REVERSAL_DATE_REQUIRED');\n      if (String(settlement.reversalReason || '').trim().length < 5) throw workflowError(400, 'SETTLEMENT_REVERSAL_REASON_REQUIRED');\n    }\n    if (previous?.status === 'REVERSED' && !sameJson(previous, settlement)) {\n      throw workflowError(409, 'REVERSED_SETTLEMENT_LOCKED');\n    }`;
  if (!source.includes(newGuard)) {
    if (!source.includes(oldGuard)) throw new Error('Missing settlement reversal server anchor');
    source = source.replace(oldGuard, newGuard);
  }
  return source;
});

console.log('Audited settlement reversal rules applied.');
