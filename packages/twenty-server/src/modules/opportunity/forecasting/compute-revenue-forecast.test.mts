import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  computeQuotaAttainment,
  computeRevenueForecast,
  type ForecastOpportunity,
  type ForecastPolicy,
} from './compute-revenue-forecast.util.ts';

const policy: ForecastPolicy = {
  version: 'stage-policy-1',
  ownerIds: ['seller-1'],
  startAt: '2026-10-01T00:00:00Z',
  endAt: '2026-11-01T00:00:00Z',
  stages: {
    NEW: { category: 'pipeline', probabilityBasisPoints: 1000 },
    REVIEW: { category: 'bestCase', probabilityBasisPoints: 5000 },
    COMMIT: { category: 'commit', probabilityBasisPoints: 9000 },
    WON: { category: 'won', probabilityBasisPoints: 10000 },
    LOST: { category: 'lost', probabilityBasisPoints: 0 },
  },
};
const deal = (
  id: string,
  stage = 'COMMIT',
  micros = 1000000,
  currency = 'SAR',
): ForecastOpportunity => ({
  id,
  stage,
  ownerId: 'seller-1',
  closeDate: '2026-10-15T12:00:00Z',
  amount: { amountMicros: micros, currencyCode: currency },
});
const target = {
  currencyCode: 'SAR',
  targetMicros: '2000000',
  startAt: policy.startAt,
  endAt: policy.endAt,
  ownerIds: policy.ownerIds,
  policyVersion: policy.version,
};

test('category drilldowns reconcile and currencies remain separate', () => {
  const result = computeRevenueForecast(
    [
      deal('a', 'NEW'),
      deal('b', 'REVIEW'),
      deal('c'),
      deal('d', 'WON'),
      deal('e', 'WON', 2000000, 'USD'),
      deal('lost', 'LOST'),
    ],
    policy,
  );
  assert.deepEqual(result.currencies[0], {
    currencyCode: 'SAR',
    pipelineMicros: '1000000',
    bestCaseMicros: '1000000',
    commitMicros: '1000000',
    wonOpportunityMicros: '1000000',
    weightedOpenMicros: '1500000',
    opportunityIds: ['a', 'b', 'c', 'd'],
  });
  assert.equal(result.currencies[1].wonOpportunityMicros, '2000000');
  assert.deepEqual(result.excluded, [
    { opportunityId: 'lost', reason: 'policy' },
  ]);
});
test('period is half open and missing source facts remain exceptions', () => {
  const result = computeRevenueForecast(
    [
      { ...deal('start'), closeDate: policy.startAt },
      { ...deal('end'), closeDate: policy.endAt },
      { ...deal('date'), closeDate: null },
      { ...deal('amount'), amount: null },
      { ...deal('owner'), ownerId: null },
      { ...deal('peer'), ownerId: 'seller-2' },
    ],
    policy,
  );
  assert.deepEqual(result.currencies[0].opportunityIds, ['start']);
  assert.deepEqual(
    result.excluded.map(({ reason }) => reason),
    [
      'missingAmount',
      'missingDate',
      'outsidePeriod',
      'unassignedOwner',
      'outsideOwnerScope',
    ],
  );
});
test('rounds weighted numerator once, rather than each tiny opportunity', () => {
  const result = computeRevenueForecast(
    [deal('a', 'REVIEW', 1), deal('b', 'REVIEW', 1)],
    policy,
  );
  assert.equal(result.currencies[0].weightedOpenMicros, '1');
});
test('totals beyond safe integer remain exact strings', () => {
  const result = computeRevenueForecast(
    [
      deal('a', 'WON', Number.MAX_SAFE_INTEGER),
      deal('b', 'WON', Number.MAX_SAFE_INTEGER),
    ],
    policy,
  );
  assert.equal(result.currencies[0].wonOpportunityMicros, '18014398509481982');
});
test('invalid source money and duplicate records fail closed', () => {
  for (const micros of [-1, 0.1, Number.MAX_SAFE_INTEGER + 1, Infinity, NaN]) {
    assert.throws(() =>
      computeRevenueForecast([deal('a', 'WON', micros)], policy),
    );
  }
  assert.throws(() => computeRevenueForecast([deal('a'), deal('a')], policy));
  assert.throws(() => computeRevenueForecast([deal('a', 'UNKNOWN')], policy));
  assert.throws(() =>
    computeRevenueForecast([deal('a', 'WON', 1, 'sar')], policy),
  );
});
test('invalid policy and timezone ambiguity cannot silently change period', () => {
  assert.throws(() =>
    computeRevenueForecast([], { ...policy, startAt: '2026-10-01' }),
  );
  assert.throws(() =>
    computeRevenueForecast([], { ...policy, startAt: '2026-02-30T00:00:00Z' }),
  );
  assert.throws(() =>
    computeRevenueForecast([], { ...policy, endAt: policy.startAt }),
  );
  assert.throws(() => computeRevenueForecast([], { ...policy, ownerIds: [] }));
  assert.throws(() =>
    computeRevenueForecast([], {
      ...policy,
      stages: { BAD: { category: 'commit', probabilityBasisPoints: 10001 } },
    }),
  );
});
test('fresh calculations cannot mutate an earlier result', () => {
  const source = deal('a');
  const before = computeRevenueForecast([source], policy);
  source.amount!.amountMicros = 2000000;
  const after = computeRevenueForecast([source], policy);
  assert.equal(before.currencies[0].commitMicros, '1000000');
  assert.equal(after.currencies[0].commitMicros, '2000000');
  assert.deepEqual(
    computeRevenueForecast([deal('b'), deal('a')], policy),
    computeRevenueForecast([deal('a'), deal('b')], policy),
  );
});
test('attainment uses won opportunities with matching currency, owner and period', () => {
  const forecast = computeRevenueForecast(
    [deal('a', 'WON'), deal('b', 'COMMIT')],
    policy,
  );
  assert.deepEqual(computeQuotaAttainment(forecast, target), {
    wonOpportunityMicros: '1000000',
    remainingMicros: '1000000',
    attainmentBasisPoints: '5000',
  });
  assert.equal(
    computeQuotaAttainment(forecast, { ...target, targetMicros: '0' })
      .attainmentBasisPoints,
    null,
  );
  assert.equal(
    computeQuotaAttainment(forecast, { ...target, targetMicros: '500000' })
      .attainmentBasisPoints,
    '20000',
  );
  assert.equal(
    computeQuotaAttainment(forecast, { ...target, currencyCode: 'EUR' })
      .wonOpportunityMicros,
    '0',
  );
  assert.throws(() =>
    computeQuotaAttainment(forecast, { ...target, ownerIds: ['seller-2'] }),
  );
  assert.throws(() =>
    computeQuotaAttainment(forecast, {
      ...target,
      endAt: '2026-12-01T00:00:00Z',
    }),
  );
  assert.throws(() =>
    computeQuotaAttainment(forecast, { ...target, targetMicros: '-1' }),
  );
});
