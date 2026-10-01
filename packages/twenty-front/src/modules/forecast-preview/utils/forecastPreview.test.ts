import {
  formatForecastMicros,
  readForecastPreview,
  validateForecastInput,
  type ForecastPreviewInput,
} from './forecastPreview';
const owner = '11111111-1111-4111-8111-111111111111';
const id = '22222222-2222-4222-8222-222222222222';
const input: ForecastPreviewInput = {
  policyVersion: 'trial',
  startAt: '2026-10-01T00:00:00Z',
  endAt: '2026-11-01T00:00:00Z',
  ownerIds: [owner],
  stages: [
    { stage: 'NEW', category: 'pipeline', probabilityBasisPoints: 5000 },
  ],
};
const response = () => ({
  source: 'current_native_actor_visible_opportunities',
  policyAuthority: 'caller_supplied_preview_only',
  persistedSnapshot: false,
  completeWithinAuthorizedDataset: true,
  generatedAt: '2026-10-02T00:00:00.000Z',
  opportunities: [
    {
      id,
      ownerId: owner,
      stage: 'NEW',
      closeDate: '2026-10-01T00:00:00.000Z',
      amount: { amountMicros: '9007199254740991', currencyCode: 'USD' },
    },
  ],
  forecast: {
    policyVersion: input.policyVersion,
    startAt: input.startAt,
    endAt: input.endAt,
    ownerIds: [owner],
    currencies: [
      {
        currencyCode: 'USD',
        pipelineMicros: '9007199254740991',
        bestCaseMicros: '0',
        commitMicros: '0',
        wonOpportunityMicros: '0',
        weightedOpenMicros: '4503599627370496',
        opportunityIds: [id],
      },
    ],
    excluded: [] as { opportunityId: string; reason: string }[],
  },
});
describe('native forecast preview protocol', () => {
  it('retains exact native safe boundary and rounds weighted micros half up', () => {
    expect(
      readForecastPreview(response(), input).forecast.currencies[0]
        .weightedOpenMicros,
    ).toBe('4503599627370496');
  });
  it('formats amounts beyond the safe aggregate boundary without Number conversion', () => {
    expect(formatForecastMicros('18014398509481982', 'en')).toBe(
      '18,014,398,509.481982',
    );
    expect(formatForecastMicros('18014398509481982', 'ar-SA')).toBe(
      '١٨٬٠١٤٬٣٩٨٬٥٠٩٫٤٨١٩٨٢',
    );
  });
  it.each(['completeWithinAuthorizedDataset', 'persistedSnapshot'] as const)(
    'denies unsupported %s authority',
    (key) => {
      const data = response();
      data[key] = !data[key];
      expect(() => readForecastPreview(data, input)).toThrow();
    },
  );
  it('denies another owner scope', () => {
    const data = response();
    data.forecast.ownerIds = [];
    expect(() => readForecastPreview(data, input)).toThrow('context');
  });
  it('denies another period', () => {
    const data = response();
    data.forecast.endAt = '2026-12-01T00:00:00Z';
    expect(() => readForecastPreview(data, input)).toThrow('context');
  });
  it('denies unsafe native source value', () => {
    const data = response();
    data.opportunities[0].amount.amountMicros = '9007199254740992';
    expect(() => readForecastPreview(data, input)).toThrow('Unsafe');
  });
  it('denies understated totals', () => {
    const data = response();
    data.forecast.currencies[0].pipelineMicros = '1';
    expect(() => readForecastPreview(data, input)).toThrow('Unreconciled');
  });
  it('denies omitted source rows', () => {
    const data = response();
    data.opportunities = [];
    expect(() => readForecastPreview(data, input)).toThrow('Unreconciled');
  });
  it('denies duplicate source records', () => {
    const data = response();
    data.opportunities.push(data.opportunities[0]);
    expect(() => readForecastPreview(data, input)).toThrow('Duplicate');
  });
  it('denies noncanonical currency', () => {
    const data = response();
    data.opportunities[0].amount.currencyCode = 'usd';
    expect(() => readForecastPreview(data, input)).toThrow('currency');
  });
  it('excludes an exact end boundary rather than counting it', () => {
    const data = response();
    data.opportunities[0].closeDate = '2026-11-01T00:00:00Z';
    data.forecast.currencies = [];
    data.forecast.excluded = [{ opportunityId: id, reason: 'outsidePeriod' }];
    expect(readForecastPreview(data, input).forecast.excluded).toEqual(
      data.forecast.excluded,
    );
  });
  it('denies a fabricated exclusion reason', () => {
    const data = response();
    data.forecast.currencies = [];
    data.forecast.excluded = [{ opportunityId: id, reason: 'policy' }];
    expect(() => readForecastPreview(data, input)).toThrow('Unreconciled');
  });
  it('rejects empty owner and malformed calendar scope', () => {
    expect(() => validateForecastInput({ ...input, ownerIds: [] })).toThrow();
    expect(() =>
      validateForecastInput({ ...input, startAt: '2026-02-30T00:00:00Z' }),
    ).toThrow();
  });
});
