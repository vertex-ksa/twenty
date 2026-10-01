import {
  FORECAST_CATEGORIES,
  readForecastPreview,
  validateForecastInput,
  type ForecastCategory,
  type ForecastPreview,
  type ForecastPreviewInput,
} from '@/forecast-preview/utils/forecastPreview';

export type ForecastSnapshot = {
  id: string;
  createdAt: string;
  contentHash: string;
  policy: ForecastPreviewInput;
  preview: ForecastPreview;
};
export type ForecastSnapshotReference = Pick<
  ForecastSnapshot,
  'id' | 'createdAt'
>;

const record = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid forecast snapshot');
  return value as Record<string, unknown>;
};
const text = (value: unknown): string => {
  if (typeof value !== 'string' || !value.length || value.length > 200)
    throw new Error('Invalid forecast snapshot text');
  return value;
};
const uuid = (value: unknown): string => {
  const id = text(value);
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      id,
    )
  )
    throw new Error('Invalid forecast snapshot identifier');
  return id;
};
const timestamp = (value: unknown): string => {
  const date = text(value);
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(date) ||
    !Number.isFinite(Date.parse(date)) ||
    new Date(date).toISOString().slice(0, 19) !== date.slice(0, 19)
  )
    throw new Error('Invalid forecast snapshot timestamp');
  return date;
};
const policyFrom = (value: unknown): ForecastPreviewInput => {
  const policy = record(value);
  if (
    !Array.isArray(policy.ownerIds) ||
    !Array.isArray(policy.stages) ||
    policy.ownerIds.length > 100 ||
    policy.stages.length > 64
  )
    throw new Error('Invalid forecast snapshot policy');
  const result: ForecastPreviewInput = {
    policyVersion: text(policy.policyVersion),
    startAt: timestamp(policy.startAt),
    endAt: timestamp(policy.endAt),
    ownerIds: policy.ownerIds.map(uuid),
    stages: policy.stages.map((value) => {
      const stage = record(value);
      const category = text(stage.category);
      if (
        !FORECAST_CATEGORIES.includes(category as ForecastCategory) ||
        typeof stage.probabilityBasisPoints !== 'number'
      )
        throw new Error('Invalid forecast snapshot mapping');
      return {
        stage: text(stage.stage),
        category: category as ForecastCategory,
        probabilityBasisPoints: stage.probabilityBasisPoints,
      };
    }),
  };
  validateForecastInput(result);
  return result;
};

const canonical = (value: unknown): string =>
  JSON.stringify(value, (_key, item: unknown) =>
    item && typeof item === 'object' && !Array.isArray(item)
      ? Object.fromEntries(
          Object.entries(item).sort(([left], [right]) =>
            left < right ? -1 : left > right ? 1 : 0,
          ),
        )
      : item,
  );

export const readForecastSnapshot = async (
  value: unknown,
  actor: { workspaceId: string; userId: string },
  expected?: { id?: string; policy?: ForecastPreviewInput },
): Promise<ForecastSnapshot> => {
  const snapshot = record(value);
  if (
    snapshot.scope !== 'private_native_user' ||
    snapshot.immutable !== true ||
    snapshot.persistedSnapshot !== true ||
    snapshot.policyAuthority !== 'caller_supplied_private_snapshot'
  )
    throw new Error('Unsupported forecast snapshot authority');
  const id = uuid(snapshot.id);
  if (expected?.id && expected.id !== id)
    throw new Error('Forecast snapshot selection changed');
  const content = record(snapshot.content);
  const nativeActor = record(content.actor);
  if (
    nativeActor.workspaceId !== actor.workspaceId ||
    nativeActor.userId !== actor.userId
  )
    throw new Error('Forecast snapshot actor changed');
  uuid(nativeActor.userWorkspaceId);
  if (
    content.schemaVersion !== 'native-private-forecast/1' ||
    content.calculationVersion !== 'exact-micros-category/1' ||
    content.canonicalizationVersion !== 'sorted-json-keys/1' ||
    content.captureKind !== 'immutable_copy_of_read_only_preview' ||
    content.creditPolicy !== 'current-owner-close-date-won-opportunity' ||
    !/^(development|test):https?:\/\//.test(text(content.environment))
  )
    throw new Error('Unsupported forecast snapshot semantics');
  const policy = policyFrom(content.policy);
  if (expected?.policy) {
    const normalized = (input: ForecastPreviewInput) => ({
      ...input,
      ownerIds: [...input.ownerIds].sort(),
      stages: [...input.stages].sort((left, right) =>
        left.stage < right.stage ? -1 : left.stage > right.stage ? 1 : 0,
      ),
    });
    if (
      canonical(normalized(policy)) !== canonical(normalized(expected.policy))
    )
      throw new Error('Forecast snapshot policy changed');
  }
  const preview = readForecastPreview(content.preview, policy);
  const contentHash = text(snapshot.contentHash);
  if (!/^[a-f0-9]{64}$/.test(contentHash))
    throw new Error('Invalid forecast snapshot hash');
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(canonical(content)),
  );
  const actualHash = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
  if (actualHash !== contentHash)
    throw new Error('Forecast snapshot integrity failed');
  return {
    id,
    createdAt: timestamp(snapshot.createdAt),
    contentHash,
    policy,
    preview,
  };
};

export const readForecastSnapshotHistory = (
  value: unknown,
): ForecastSnapshotReference[] => {
  const history = record(value);
  if (
    history.scope !== 'private_native_user' ||
    history.limit !== 100 ||
    !Array.isArray(history.snapshots) ||
    history.snapshots.length > 100
  )
    throw new Error('Unsupported forecast history');
  const references = history.snapshots.map((value) => {
    const row = record(value);
    return { id: uuid(row.id), createdAt: timestamp(row.createdAt) };
  });
  if (new Set(references.map(({ id }) => id)).size !== references.length)
    throw new Error('Duplicate forecast history');
  return references;
};
