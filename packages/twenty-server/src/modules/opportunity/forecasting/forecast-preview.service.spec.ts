import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { getWorkspaceAuthContext } from 'src/engine/core-modules/auth/storage/workspace-auth-context.storage';
import { WorkspaceOrmManager } from 'src/engine/twenty-orm/workspace-orm.manager';
import { ForecastPreviewInput } from 'src/modules/opportunity/forecasting/forecast-preview.input';
import { ForecastPreviewService } from 'src/modules/opportunity/forecasting/forecast-preview.service';

jest.mock('src/engine/twenty-orm/workspace-orm.manager', () => ({
  WorkspaceOrmManager: jest.fn(),
}));
jest.mock(
  'src/engine/core-modules/auth/storage/workspace-auth-context.storage',
);

// Adapter tests use a repository double. Native SQL/role enforcement needs
// authenticated integration tests and is deliberately not claimed here.
describe('ForecastPreviewService local adapter', () => {
  const ownerId = '11111111-1111-4111-8111-111111111111';
  const input: ForecastPreviewInput = {
    policyVersion: 'preview-v1',
    startAt: '2026-10-01T00:00:00Z',
    endAt: '2026-11-01T00:00:00Z',
    ownerIds: [ownerId],
    stages: [
      { stage: 'NEW', category: 'pipeline', probabilityBasisPoints: 5000 },
    ],
  };
  const row = {
    id: 'opportunity-1',
    ownerId,
    stage: 'NEW',
    closeDate: new Date('2026-10-15T00:00:00Z'),
    amountAmountMicros: '11',
    amountCurrencyCode: 'SAR',
  };
  const authContext = { type: 'user' };
  const find = jest.fn();
  const take = jest.fn(() => ({ getMany: find }));
  const orderBy = jest.fn(() => ({ take }));
  const setFindOptions = jest.fn(() => ({ orderBy }));
  const createQueryBuilder = jest.fn(() => ({ setFindOptions }));
  const getRepositoryWithContextPermissions = jest.fn(() => ({
    createQueryBuilder,
  }));
  const executeInWorkspaceContext = jest.fn((callback) => callback());
  const manager = {
    getRepositoryWithContextPermissions,
    executeInWorkspaceContext,
  };
  const service = new ForecastPreviewService(
    manager as unknown as WorkspaceOrmManager,
  );
  const originalEnvironment = { ...process.env };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.NODE_ENV = 'test';
    process.env.TM_FORECAST_PREVIEW_ENABLED = 'true';
    jest
      .mocked(getWorkspaceAuthContext)
      .mockReturnValue(
        authContext as ReturnType<typeof getWorkspaceAuthContext>,
      );
    find.mockResolvedValue([row]);
  });

  afterAll(() => {
    process.env = originalEnvironment;
  });

  it.each(['production', 'staging', ''])(
    'denies environment %s before reads',
    async (environment) => {
      process.env.NODE_ENV = environment;
      await expect(service.preview(input)).rejects.toThrow('disabled');
      expect(find).not.toHaveBeenCalled();
    },
  );

  it('denies an absent opt-in before reads', async () => {
    delete process.env.TM_FORECAST_PREVIEW_ENABLED;
    await expect(service.preview(input)).rejects.toThrow('disabled');
    expect(find).not.toHaveBeenCalled();
  });

  it.each(['system', 'apiKey', 'application'])(
    'denies %s authority',
    async (type) => {
      jest
        .mocked(getWorkspaceAuthContext)
        .mockReturnValue({ type } as ReturnType<
          typeof getWorkspaceAuthContext
        >);
      await expect(service.preview(input)).rejects.toThrow(
        'native user session',
      );
      expect(find).not.toHaveBeenCalled();
    },
  );

  it('uses the current context repository with explicit bounded fields', async () => {
    const result = await service.preview(input);
    expect(executeInWorkspaceContext).toHaveBeenCalledWith(
      expect.any(Function),
      authContext,
    );
    expect(getRepositoryWithContextPermissions).toHaveBeenCalledWith(
      'opportunity',
    );
    expect(setFindOptions).toHaveBeenCalledWith({
      select: {
        id: true,
        ownerId: true,
        stage: true,
        closeDate: true,
        amountAmountMicros: true,
        amountCurrencyCode: true,
      },
    });
    expect(orderBy).toHaveBeenCalledWith('id', 'ASC');
    expect(take).toHaveBeenCalledWith(5001);
    expect(find).toHaveBeenCalledWith({ noFormatting: true });
    expect(result.persistedSnapshot).toBe(false);
    expect(result.forecast.currencies[0].weightedOpenMicros).toBe('6');
  });

  it('propagates native permission denial without replacing it with totals', async () => {
    find.mockRejectedValue(new Error('Native field permission denied'));
    await expect(service.preview(input)).rejects.toThrow(
      'Native field permission denied',
    );
  });

  it('rejects excess records rather than returning partial totals', async () => {
    find.mockResolvedValue(Array.from({ length: 5001 }, () => row));
    await expect(service.preview(input)).rejects.toThrow(
      'exceeds local preview capacity',
    );
  });

  it('rejects duplicate stage mappings before reads', async () => {
    await expect(
      service.preview({ ...input, stages: [input.stages[0], input.stages[0]] }),
    ).rejects.toThrow('Duplicate');
    expect(find).not.toHaveBeenCalled();
  });

  it('rejects an inverted UTC period before reads', async () => {
    await expect(
      service.preview({ ...input, endAt: input.startAt }),
    ).rejects.toThrow('Invalid forecast policy');
    expect(find).not.toHaveBeenCalled();
  });

  it.each([
    { ...row, closeDate: new Date('invalid') },
    {
      ...row,
      amountAmountMicros: Number.MAX_SAFE_INTEGER + 1,
    },
    { ...row, amountAmountMicros: '11.5' },
    { ...row, amountAmountMicros: '9007199254740991.2' },
  ])(
    'rejects unsafe native data without exposing row details',
    async (invalidRow) => {
      find.mockResolvedValue([invalidRow]);
      await expect(service.preview(input)).rejects.toThrow(
        'Native opportunity data cannot be forecast safely',
      );
    },
  );

  it('validates nested stage bounds and UUID ownership at the resolver boundary', async () => {
    expect(
      await validate(plainToInstance(ForecastPreviewInput, input)),
    ).toEqual([]);
    const invalid = plainToInstance(ForecastPreviewInput, {
      ...input,
      ownerIds: ['not-a-uuid'],
      stages: [{ ...input.stages[0], probabilityBasisPoints: 10001 }],
    });
    const errors = await validate(invalid);
    expect(errors.map(({ property }) => property).sort()).toEqual([
      'ownerIds',
      'stages',
    ]);
  });
});
