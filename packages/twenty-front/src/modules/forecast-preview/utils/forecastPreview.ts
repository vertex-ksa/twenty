export type ForecastCategory =
  | 'pipeline'
  | 'bestCase'
  | 'commit'
  | 'won'
  | 'lost'
  | 'excluded';
export type ForecastPreviewInput = {
  policyVersion: string;
  startAt: string;
  endAt: string;
  ownerIds: string[];
  stages: {
    stage: string;
    category: ForecastCategory;
    probabilityBasisPoints: number;
  }[];
};
export type ForecastPreviewOpportunity = {
  id: string;
  ownerId: string | null;
  stage: string;
  closeDate: string | null;
  amount: { amountMicros: string; currencyCode: string } | null;
};
export type ForecastCurrency = {
  currencyCode: string;
  pipelineMicros: string;
  bestCaseMicros: string;
  commitMicros: string;
  wonOpportunityMicros: string;
  weightedOpenMicros: string;
  opportunityIds: string[];
};
export type ForecastPreview = {
  generatedAt: string;
  opportunities: ForecastPreviewOpportunity[];
  forecast: {
    policyVersion: string;
    startAt: string;
    endAt: string;
    ownerIds: string[];
    currencies: ForecastCurrency[];
    excluded: { opportunityId: string; reason: string }[];
  };
};

export const FORECAST_CATEGORIES: ForecastCategory[] = [
  'pipeline',
  'bestCase',
  'commit',
  'won',
  'lost',
  'excluded',
];
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MONEY = /^(0|[1-9]\d{0,29})$/;
const CURRENCY = /^[A-Z]{3}$/;
const record = (value: unknown): Record<string, unknown> => {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid preview');
  return value as Record<string, unknown>;
};
const array = (value: unknown): unknown[] => {
  if (!Array.isArray(value) || value.length > 5000)
    throw new Error('Invalid preview');
  return value;
};
const text = (value: unknown, maximum = 100): string => {
  if (typeof value !== 'string' || !value.length || value.length > maximum)
    throw new Error('Invalid preview');
  return value;
};
const uuid = (value: unknown): string => {
  const result = text(value);
  if (!UUID.test(result)) throw new Error('Invalid preview identifier');
  return result;
};
const money = (value: unknown): string => {
  const result = text(value, 30);
  if (!MONEY.test(result)) throw new Error('Invalid preview amount');
  return result;
};
const currency = (value: unknown): string => {
  const result = text(value, 3);
  if (!CURRENCY.test(result)) throw new Error('Invalid preview currency');
  return result;
};
const timestamp = (value: unknown): string => {
  const result = text(value, 30);
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(result) ||
    !Number.isFinite(Date.parse(result)) ||
    new Date(result).toISOString().slice(0, 19) !== result.slice(0, 19)
  )
    throw new Error('Invalid preview timestamp');
  return result;
};

export const validateForecastInput = (input: ForecastPreviewInput): void => {
  if (
    !input.policyVersion.trim() ||
    input.policyVersion.length > 100 ||
    Date.parse(timestamp(input.startAt)) >= Date.parse(timestamp(input.endAt))
  )
    throw new Error('Invalid preview period');
  if (
    !input.ownerIds.length ||
    input.ownerIds.length > 100 ||
    new Set(input.ownerIds).size !== input.ownerIds.length
  )
    throw new Error('Invalid owner scope');
  input.ownerIds.forEach(uuid);
  if (
    !input.stages.length ||
    input.stages.length > 64 ||
    new Set(input.stages.map((stage) => stage.stage)).size !==
      input.stages.length
  )
    throw new Error('Invalid stage mapping');
  for (const stage of input.stages) {
    text(stage.stage);
    if (
      !FORECAST_CATEGORIES.includes(stage.category) ||
      !Number.isInteger(stage.probabilityBasisPoints) ||
      stage.probabilityBasisPoints < 0 ||
      stage.probabilityBasisPoints > 10000
    )
      throw new Error('Invalid stage mapping');
  }
};

export const readForecastPreview = (
  value: unknown,
  input: ForecastPreviewInput,
): ForecastPreview => {
  validateForecastInput(input);
  const response = record(value);
  if (
    response.source !== 'current_native_actor_visible_opportunities' ||
    response.policyAuthority !== 'caller_supplied_preview_only' ||
    response.persistedSnapshot !== false ||
    response.completeWithinAuthorizedDataset !== true
  )
    throw new Error('Incomplete or unsupported preview');
  const forecast = record(response.forecast);
  const ownerIds = array(forecast.ownerIds).map(uuid);
  if (
    forecast.policyVersion !== input.policyVersion ||
    forecast.startAt !== input.startAt ||
    forecast.endAt !== input.endAt ||
    JSON.stringify([...ownerIds].sort()) !==
      JSON.stringify([...input.ownerIds].sort())
  )
    throw new Error('Preview context mismatch');
  const opportunities = array(response.opportunities).map((value) => {
    const row = record(value);
    const amount = row.amount === null ? null : record(row.amount);
    const amountMicros = amount === null ? null : money(amount.amountMicros);
    if (
      amountMicros !== null &&
      BigInt(amountMicros) > BigInt(Number.MAX_SAFE_INTEGER)
    )
      throw new Error('Unsafe native amount');
    return {
      id: uuid(row.id),
      ownerId: row.ownerId === null ? null : uuid(row.ownerId),
      stage: text(row.stage),
      closeDate: row.closeDate === null ? null : timestamp(row.closeDate),
      amount:
        amount === null
          ? null
          : {
              amountMicros: amountMicros!,
              currencyCode: currency(amount.currencyCode),
            },
    };
  });
  if (new Set(opportunities.map((row) => row.id)).size !== opportunities.length)
    throw new Error('Duplicate preview opportunities');
  const excluded = array(forecast.excluded).map((value) => {
    const row = record(value);
    return { opportunityId: uuid(row.opportunityId), reason: text(row.reason) };
  });
  const currencies = array(forecast.currencies).map((value) => {
    const row = record(value);
    return {
      currencyCode: currency(row.currencyCode),
      pipelineMicros: money(row.pipelineMicros),
      bestCaseMicros: money(row.bestCaseMicros),
      commitMicros: money(row.commitMicros),
      wonOpportunityMicros: money(row.wonOpportunityMicros),
      weightedOpenMicros: money(row.weightedOpenMicros),
      opportunityIds: array(row.opportunityIds).map(uuid),
    };
  });
  const expectedExcluded: typeof excluded = [];
  const totals = new Map<
    string,
    {
      pipeline: bigint;
      bestCase: bigint;
      commit: bigint;
      won: bigint;
      numerator: bigint;
      ids: string[];
    }
  >();
  const stages = new Map(input.stages.map((stage) => [stage.stage, stage]));
  for (const row of opportunities) {
    let reason: string | undefined;
    const mapping = stages.get(row.stage);
    if (row.ownerId === null) reason = 'unassignedOwner';
    else if (!input.ownerIds.includes(row.ownerId))
      reason = 'outsideOwnerScope';
    else if (!mapping) throw new Error('Unmapped native stage');
    else if (mapping.category === 'lost' || mapping.category === 'excluded')
      reason = 'policy';
    else if (row.closeDate === null) reason = 'missingDate';
    else if (
      Date.parse(row.closeDate) < Date.parse(input.startAt) ||
      Date.parse(row.closeDate) >= Date.parse(input.endAt)
    )
      reason = 'outsidePeriod';
    else if (row.amount === null) reason = 'missingAmount';
    if (reason) {
      expectedExcluded.push({ opportunityId: row.id, reason });
      continue;
    }
    if (
      !row.amount ||
      !mapping ||
      mapping.category === 'lost' ||
      mapping.category === 'excluded'
    )
      throw new Error('Invalid included opportunity');
    const bucket = totals.get(row.amount.currencyCode) ?? {
      pipeline: BigInt(0),
      bestCase: BigInt(0),
      commit: BigInt(0),
      won: BigInt(0),
      numerator: BigInt(0),
      ids: [],
    };
    const amount = BigInt(row.amount.amountMicros);
    bucket[mapping.category] += amount;
    if (mapping.category !== 'won')
      bucket.numerator += amount * BigInt(mapping.probabilityBasisPoints);
    bucket.ids.push(row.id);
    totals.set(row.amount.currencyCode, bucket);
  }
  const expectedCurrencies = [...totals]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([currencyCode, bucket]) => ({
      currencyCode,
      pipelineMicros: bucket.pipeline.toString(),
      bestCaseMicros: bucket.bestCase.toString(),
      commitMicros: bucket.commit.toString(),
      wonOpportunityMicros: bucket.won.toString(),
      weightedOpenMicros: (
        (bucket.numerator + BigInt(5000)) /
        BigInt(10000)
      ).toString(),
      opportunityIds: bucket.ids.sort(),
    }));
  const sortExcluded = (rows: typeof excluded) =>
    [...rows].sort((left, right) =>
      left.opportunityId.localeCompare(right.opportunityId),
    );
  if (
    JSON.stringify(currencies) !== JSON.stringify(expectedCurrencies) ||
    JSON.stringify(sortExcluded(excluded)) !==
      JSON.stringify(sortExcluded(expectedExcluded))
  )
    throw new Error('Unreconciled preview');
  return {
    generatedAt: timestamp(response.generatedAt),
    opportunities,
    forecast: {
      policyVersion: input.policyVersion,
      startAt: input.startAt,
      endAt: input.endAt,
      ownerIds,
      currencies,
      excluded,
    },
  };
};

export const formatForecastMicros = (value: string, locale: string): string => {
  const amount = BigInt(money(value));
  const integer = new Intl.NumberFormat(locale).format(
    amount / BigInt(1000000),
  );
  const separator =
    new Intl.NumberFormat(locale)
      .formatToParts(1.1)
      .find((part) => part.type === 'decimal')?.value ?? '.';
  const digits = new Intl.NumberFormat(locale, { useGrouping: false });
  const fraction = (amount % BigInt(1000000))
    .toString()
    .padStart(6, '0')
    .split('')
    .map((digit) => digits.format(Number(digit)))
    .join('');
  return `${integer}${separator}${fraction}`;
};
