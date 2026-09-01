import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const view = fs.readFileSync('src/components/LoansPenaltiesView.tsx', 'utf8');
const earnings = fs.readFileSync('src/components/TemporaryEarningsPanel.tsx', 'utf8');

test('penalty month range filter is rendered inside the penalties tab', () => {
  const tabStart = view.indexOf("activeTab === 'penalties'");
  const filter = view.indexOf('data-penalty-period-filter');
  const penaltyRows = view.indexOf('filteredPenalties.map');
  assert.ok(tabStart >= 0);
  assert.ok(filter > tabStart);
  assert.ok(penaltyRows > filter);
  assert.match(view, /value={penaltyPeriodFrom}/);
  assert.match(view, /value={penaltyPeriodTo}/);
});

test('temporary earnings have an inclusive month range filter', () => {
  assert.match(earnings, /value={periodFrom}/);
  assert.match(earnings, /value={periodTo}/);
  assert.match(earnings, /filteredEarnings\.map/);
});
