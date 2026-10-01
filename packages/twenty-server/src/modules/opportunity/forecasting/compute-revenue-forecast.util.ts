export type ForecastCategory =
  | 'pipeline'
  | 'bestCase'
  | 'commit'
  | 'won'
  | 'lost'
  | 'excluded';

export type ForecastOpportunity = {
  id: string;
  ownerId: string | null;
  stage: string;
  closeDate: string | null;
  amount: { amountMicros: number; currencyCode: string } | null;
};

export type ForecastPolicy = {
  version: string;
  startAt: string;
  endAt: string;
  ownerIds: readonly string[];
  stages: Record<
    string,
    { category: ForecastCategory; probabilityBasisPoints: number }
  >;
};

type CurrencyForecast = {
  currencyCode: string;
  pipelineMicros: string;
  bestCaseMicros: string;
  commitMicros: string;
  wonOpportunityMicros: string;
  weightedOpenMicros: string;
  opportunityIds: string[];
};

export type RevenueForecast = {
  policyVersion: string;
  startAt: string;
  endAt: string;
  ownerIds: string[];
  currencies: CurrencyForecast[];
  excluded: {
    opportunityId: string;
    reason:
      | 'policy'
      | 'outsidePeriod'
      | 'missingDate'
      | 'missingAmount'
      | 'unassignedOwner'
      | 'outsideOwnerScope';
  }[];
};

// Native server emits ES2018. BigInt constructors preserve exact arithmetic
// without bigint literal syntax, which TypeScript rejects for that target.
const ZERO = BigInt(0);
const TWO = BigInt(2);
const HALF_BASIS_POINT_SCALE = BigInt(5000);
const BASIS_POINT_SCALE = BigInt(10000);

const instant = (value: string): number => {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)) {
    throw new Error('Forecast timestamps must be UTC instants');
  }
  const result = Date.parse(value);
  if (
    !Number.isFinite(result) ||
    new Date(result).toISOString().slice(0, 19) !== value.slice(0, 19)
  ) {
    throw new Error('Invalid forecast timestamp');
  }
  return result;
};

// Inputs must be retrieved under the native user's current object and field permissions.
// This calculator confers no authorization and must not receive a service-wide dataset.
export const computeRevenueForecast = (
  opportunities: readonly ForecastOpportunity[],
  policy: ForecastPolicy,
): RevenueForecast => {
  const start = instant(policy.startAt);
  const end = instant(policy.endAt);
  if (!policy.version.trim() || start >= end)
    throw new Error('Invalid forecast policy or period');
  if (
    !policy.ownerIds.length ||
    policy.ownerIds.some((id) => !id) ||
    new Set(policy.ownerIds).size !== policy.ownerIds.length
  )
    throw new Error('Invalid forecast owner scope');
  const categories: ForecastCategory[] = [
    'pipeline',
    'bestCase',
    'commit',
    'won',
    'lost',
    'excluded',
  ];
  for (const mapping of Object.values(policy.stages)) {
    if (
      !categories.includes(mapping.category) ||
      !Number.isInteger(mapping.probabilityBasisPoints) ||
      mapping.probabilityBasisPoints < 0 ||
      mapping.probabilityBasisPoints > 10000
    ) {
      throw new Error('Invalid forecast stage mapping');
    }
  }
  const buckets = new Map<
    string,
    {
      pipeline: bigint;
      bestCase: bigint;
      commit: bigint;
      won: bigint;
      weightedNumerator: bigint;
      ids: string[];
    }
  >();
  const excluded: RevenueForecast['excluded'] = [];
  const seen = new Set<string>();
  for (const opportunity of opportunities) {
    if (!opportunity.id || seen.has(opportunity.id))
      throw new Error('Duplicate or missing opportunity ID');
    seen.add(opportunity.id);
    if (opportunity.ownerId === null) {
      excluded.push({
        opportunityId: opportunity.id,
        reason: 'unassignedOwner',
      });
      continue;
    }
    if (!policy.ownerIds.includes(opportunity.ownerId)) {
      excluded.push({
        opportunityId: opportunity.id,
        reason: 'outsideOwnerScope',
      });
      continue;
    }
    if (!Object.prototype.hasOwnProperty.call(policy.stages, opportunity.stage))
      throw new Error('Unmapped opportunity stage');
    const mapping = policy.stages[opportunity.stage];
    if (mapping.category === 'lost' || mapping.category === 'excluded') {
      excluded.push({ opportunityId: opportunity.id, reason: 'policy' });
      continue;
    }
    if (opportunity.closeDate === null) {
      excluded.push({ opportunityId: opportunity.id, reason: 'missingDate' });
      continue;
    }
    const close = instant(opportunity.closeDate);
    if (close < start || close >= end) {
      excluded.push({ opportunityId: opportunity.id, reason: 'outsidePeriod' });
      continue;
    }
    if (opportunity.amount === null) {
      excluded.push({ opportunityId: opportunity.id, reason: 'missingAmount' });
      continue;
    }
    const { amountMicros, currencyCode } = opportunity.amount;
    if (
      !Number.isSafeInteger(amountMicros) ||
      amountMicros < 0 ||
      !/^[A-Z]{3}$/.test(currencyCode)
    ) {
      throw new Error('Invalid or inexact opportunity amount');
    }
    const amount = BigInt(amountMicros);
    const bucket = buckets.get(currencyCode) ?? {
      pipeline: ZERO,
      bestCase: ZERO,
      commit: ZERO,
      won: ZERO,
      weightedNumerator: ZERO,
      ids: [],
    };
    bucket[mapping.category] += amount;
    if (mapping.category !== 'won')
      bucket.weightedNumerator +=
        amount * BigInt(mapping.probabilityBasisPoints);
    bucket.ids.push(opportunity.id);
    buckets.set(currencyCode, bucket);
  }
  return {
    policyVersion: policy.version,
    startAt: policy.startAt,
    endAt: policy.endAt,
    ownerIds: [...policy.ownerIds].sort(),
    currencies: [...buckets.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([currencyCode, bucket]) => ({
        currencyCode,
        pipelineMicros: bucket.pipeline.toString(),
        bestCaseMicros: bucket.bestCase.toString(),
        commitMicros: bucket.commit.toString(),
        wonOpportunityMicros: bucket.won.toString(),
        // Sum exact numerators before rounding half up once per currency.
        weightedOpenMicros: (
          (bucket.weightedNumerator + HALF_BASIS_POINT_SCALE) /
          BASIS_POINT_SCALE
        ).toString(),
        opportunityIds: bucket.ids.sort(),
      })),
    excluded: excluded.sort((left, right) =>
      left.opportunityId.localeCompare(right.opportunityId),
    ),
  };
};

export const computeQuotaAttainment = (
  forecast: RevenueForecast,
  target: {
    currencyCode: string;
    targetMicros: string;
    startAt: string;
    endAt: string;
    ownerIds: readonly string[];
    policyVersion: string;
  },
): {
  wonOpportunityMicros: string;
  remainingMicros: string;
  attainmentBasisPoints: string | null;
} => {
  if (
    !/^[A-Z]{3}$/.test(target.currencyCode) ||
    !/^(0|[1-9]\d*)$/.test(target.targetMicros)
  )
    throw new Error('Invalid quota target');
  if (
    target.startAt !== forecast.startAt ||
    target.endAt !== forecast.endAt ||
    target.policyVersion !== forecast.policyVersion ||
    JSON.stringify([...target.ownerIds].sort()) !==
      JSON.stringify(forecast.ownerIds)
  )
    throw new Error('Quota and forecast scope mismatch');
  const won = BigInt(
    forecast.currencies.find(
      (item) => item.currencyCode === target.currencyCode,
    )?.wonOpportunityMicros ?? '0',
  );
  const quota = BigInt(target.targetMicros);
  return {
    wonOpportunityMicros: won.toString(),
    remainingMicros: (won >= quota ? ZERO : quota - won).toString(),
    attainmentBasisPoints:
      quota === ZERO
        ? null
        : ((won * BASIS_POINT_SCALE + quota / TWO) / quota).toString(),
  };
};
