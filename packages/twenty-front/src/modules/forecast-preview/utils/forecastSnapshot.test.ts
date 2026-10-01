import { webcrypto } from 'node:crypto';

import nativeSnapshot from '@/forecast-preview/utils/__fixtures__/native-private-snapshot.json';
import {
  readForecastSnapshot,
  readForecastSnapshotHistory,
} from '@/forecast-preview/utils/forecastSnapshot';

const actor = {
  workspaceId: nativeSnapshot.content.actor.workspaceId,
  userId: nativeSnapshot.content.actor.userId,
};
const originalCrypto = Object.getOwnPropertyDescriptor(globalThis, 'crypto');

beforeAll(() => {
  Object.defineProperty(globalThis, 'crypto', {
    configurable: true,
    value: webcrypto,
  });
});
afterAll(() => {
  if (originalCrypto)
    Object.defineProperty(globalThis, 'crypto', originalCrypto);
  else Reflect.deleteProperty(globalThis, 'crypto');
});

describe('private forecast snapshot protocol', () => {
  it('verifies an independently captured native HTTP golden snapshot and exact historical facts', async () => {
    const result = await readForecastSnapshot(nativeSnapshot, actor);
    expect(result.id).toBe(nativeSnapshot.id);
    expect(result.contentHash).toBe(nativeSnapshot.contentHash);
    expect(result.preview.forecast.currencies[0].pipelineMicros).toBe(
      '10000001',
    );
    expect(result.preview.forecast.currencies[0].weightedOpenMicros).toBe(
      '1000000',
    );
  });

  it.each(['workspaceId', 'userId'] as const)(
    'rejects another current %s',
    async (key) => {
      await expect(
        readForecastSnapshot(nativeSnapshot, {
          ...actor,
          [key]: '11111111-1111-4111-8111-111111111111',
        }),
      ).rejects.toThrow('actor changed');
    },
  );

  it('rejects changed content with the original canonical hash', async () => {
    const changed = structuredClone(nativeSnapshot);
    changed.content.policy.policyVersion = 'altered';
    changed.content.preview.forecast.policyVersion = 'altered';
    await expect(readForecastSnapshot(changed, actor)).rejects.toThrow(
      'integrity failed',
    );
  });

  it('rejects a changed selection and a changed requested save policy', async () => {
    await expect(
      readForecastSnapshot(nativeSnapshot, actor, {
        id: '11111111-1111-4111-8111-111111111111',
      }),
    ).rejects.toThrow('selection changed');
    const stored = await readForecastSnapshot(nativeSnapshot, actor);
    await expect(
      readForecastSnapshot(nativeSnapshot, actor, {
        policy: { ...stored.policy, startAt: '2026-02-01T00:00:00.000Z' },
      }),
    ).rejects.toThrow('policy changed');
  });

  it('accepts reordered owners and mappings for the same canonical save policy', async () => {
    const stored = await readForecastSnapshot(nativeSnapshot, actor);
    await expect(
      readForecastSnapshot(nativeSnapshot, actor, {
        policy: {
          ...stored.policy,
          ownerIds: [...stored.policy.ownerIds].reverse(),
          stages: [...stored.policy.stages].reverse(),
        },
      }),
    ).resolves.toEqual(stored);
  });

  it.each(['immutable', 'persistedSnapshot'] as const)(
    'requires native %s authority',
    async (key) => {
      await expect(
        readForecastSnapshot({ ...nativeSnapshot, [key]: false }, actor),
      ).rejects.toThrow('authority');
    },
  );

  it('rejects inconsistent historical totals before displaying them', async () => {
    const changed = structuredClone(nativeSnapshot);
    changed.content.preview.forecast.currencies[0].weightedOpenMicros = '1';
    await expect(readForecastSnapshot(changed, actor)).rejects.toThrow();
  });

  it('reads bounded opaque native history and rejects duplicates or unsupported authority', () => {
    const row = { id: nativeSnapshot.id, createdAt: nativeSnapshot.createdAt };
    const history = {
      scope: 'private_native_user',
      limit: 100,
      snapshots: [row],
    };
    expect(readForecastSnapshotHistory(history)).toEqual([row]);
    expect(() =>
      readForecastSnapshotHistory({ ...history, snapshots: [row, row] }),
    ).toThrow('Duplicate');
    expect(() =>
      readForecastSnapshotHistory({ ...history, limit: 101 }),
    ).toThrow('Unsupported');
    expect(() =>
      readForecastSnapshotHistory({ ...history, scope: 'team' }),
    ).toThrow('Unsupported');
  });
});
