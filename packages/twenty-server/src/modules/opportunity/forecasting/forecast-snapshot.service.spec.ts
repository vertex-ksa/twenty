import { WorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/workspace-scoped-repository';
import { type Repository } from 'typeorm';

import { getWorkspaceAuthContext } from 'src/engine/core-modules/auth/storage/workspace-auth-context.storage';
import { type ForecastSnapshotEntity } from 'src/engine/core-modules/forecast/forecast-snapshot.entity';
import { ForecastPreviewService } from 'src/modules/opportunity/forecasting/forecast-preview.service';
import { ForecastSnapshotService } from 'src/modules/opportunity/forecasting/forecast-snapshot.service';

jest.mock(
  'src/engine/core-modules/auth/storage/workspace-auth-context.storage',
);
jest.mock('src/engine/core-modules/forecast/forecast-snapshot.entity', () => ({
  ForecastSnapshotEntity: class {},
}));
jest.mock(
  'src/modules/opportunity/forecasting/forecast-preview.service',
  () => ({
    ForecastPreviewService: class {},
  }),
);

// These adapter tests do not replace PostgreSQL uniqueness or native ACL proof.
describe('private immutable forecast artifacts', () => {
  const actor = {
    type: 'user',
    workspace: { id: 'workspace' },
    userWorkspaceId: 'membership',
    user: { id: 'user' },
  };
  const input = {
    commandId: 'command',
    policy: {
      policyVersion: 'v1',
      startAt: '2026-10-01T00:00:00Z',
      endAt: '2026-11-01T00:00:00Z',
      ownerIds: ['owner'],
      stages: [
        {
          stage: 'NEW',
          category: 'pipeline' as const,
          probabilityBasisPoints: 1000,
        },
      ],
    },
  };
  let records: ForecastSnapshotEntity[];
  const findOne = jest.fn(
    async ({ where }) =>
      records.find((record) =>
        Object.entries(where).every(
          ([key, value]) =>
            record[key as keyof ForecastSnapshotEntity] === value,
        ),
      ) ?? null,
  );
  let pending: Partial<ForecastSnapshotEntity>;
  const execute = jest.fn(async () => {
    // PostgreSQL jsonb does not preserve object key order.
    const reorder = (_key: string, value: unknown) =>
      value && typeof value === 'object' && !Array.isArray(value)
        ? Object.fromEntries(Object.entries(value).reverse())
        : value;
    records.push({
      ...JSON.parse(JSON.stringify(pending, reorder)),
      id: 'snapshot',
      createdAt: new Date(),
    });
  });
  const orIgnore = jest.fn(() => ({ execute }));
  const values = jest.fn((value) => {
    pending = value;
    return { orIgnore };
  });
  const insert = jest.fn(() => ({ values }));
  const where = jest.fn(() => ({ insert }));
  const createQueryBuilder = jest.fn(() => ({ where }));
  const preview = jest.fn();
  const readAuthorizedOpportunityIds = jest.fn();
  const service = new ForecastSnapshotService(
    new WorkspaceScopedRepository({
      findOne,
      createQueryBuilder,
    } as unknown as Repository<ForecastSnapshotEntity>),
    {
      preview,
      readAuthorizedOpportunityIds,
    } as unknown as ForecastPreviewService,
  );
  const environment = { ...process.env };

  beforeEach(() => {
    jest.clearAllMocks();
    records = [];
    process.env.NODE_ENV = 'test';
    process.env.SERVER_URL = 'http://localhost:19160';
    process.env.TM_FORECAST_PREVIEW_ENABLED = 'true';
    jest
      .mocked(getWorkspaceAuthContext)
      .mockReturnValue(actor as ReturnType<typeof getWorkspaceAuthContext>);
    preview.mockResolvedValue({
      generatedAt: '2026-10-01T00:00:00Z',
      opportunities: [
        {
          id: 'deal',
          amount: { amountMicros: '10000001', currencyCode: 'SAR' },
        },
      ],
    });
    readAuthorizedOpportunityIds.mockResolvedValue(['deal']);
  });
  afterAll(() => {
    process.env = environment;
  });

  it('preserves captured exact facts on replay without recomputing the forecast', async () => {
    const saved = await service.save(input);
    preview.mockResolvedValue({
      opportunities: [{ id: 'deal', amount: { amountMicros: '999' } }],
    });
    const replay = await service.save(input);
    expect(replay.contentHash).toBe(saved.contentHash);
    expect(replay.content.preview.opportunities[0].amount?.amountMicros).toBe(
      '10000001',
    );
    expect(preview).toHaveBeenCalledTimes(1);
    expect(readAuthorizedOpportunityIds).toHaveBeenCalledTimes(2);
    expect(records).toHaveLength(1);
  });

  it.each([
    { ...actor, workspace: { id: 'other-workspace' } },
    { ...actor, userWorkspaceId: 'recreated-membership' },
    { ...actor, user: { id: 'other-user' } },
  ])(
    'denies a different native authority even with a known snapshot ID',
    async (differentActor) => {
      await service.save(input);
      jest
        .mocked(getWorkspaceAuthContext)
        .mockReturnValue(
          differentActor as ReturnType<typeof getWorkspaceAuthContext>,
        );
      await expect(service.read('snapshot')).rejects.toThrow('unavailable');
      expect(readAuthorizedOpportunityIds).toHaveBeenCalledTimes(1);
    },
  );

  it('denies historical facts and replay after row revocation', async () => {
    await service.save(input);
    readAuthorizedOpportunityIds.mockResolvedValue([]);
    await expect(service.read('snapshot')).rejects.toThrow(
      'current record permissions',
    );
    await expect(service.save(input)).rejects.toThrow(
      'current record permissions',
    );
    expect(records).toHaveLength(1);
  });

  it('propagates current native field denial on history and replay', async () => {
    await service.save(input);
    readAuthorizedOpportunityIds.mockRejectedValue(
      new Error('native amount field denied'),
    );
    await expect(service.read('snapshot')).rejects.toThrow(
      'native amount field denied',
    );
    await expect(service.save(input)).rejects.toThrow(
      'native amount field denied',
    );
  });

  it('rejects command reuse with a different policy without overwriting history', async () => {
    await service.save(input);
    await expect(
      service.save({
        ...input,
        policy: { ...input.policy, policyVersion: 'v2' },
      }),
    ).rejects.toThrow('already used');
    expect(records).toHaveLength(1);
  });

  it('denies corrupted stored content before exposing source facts', async () => {
    await service.save(input);
    records[0].content.preview.opportunities[0].amount!.amountMicros = '999';
    await expect(service.read('snapshot')).rejects.toThrow('unavailable');
  });

  it('denies disabled persistence before datastore access', async () => {
    process.env.TM_FORECAST_PREVIEW_ENABLED = 'false';
    await expect(service.save(input)).rejects.toThrow('disabled');
    expect(findOne).not.toHaveBeenCalled();
  });
});
