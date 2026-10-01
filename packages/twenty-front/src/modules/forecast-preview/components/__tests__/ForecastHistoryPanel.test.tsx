import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { ForecastHistoryPanel } from '@/forecast-preview/components/ForecastHistoryPanel';
import { type ForecastPreviewInput } from '@/forecast-preview/utils/forecastPreview';

const mockClient = { query: jest.fn(), mutate: jest.fn() };
const mockReadSnapshot = jest.fn();
jest.mock('@apollo/client/react', () => ({
  useApolloClient: () => mockClient,
}));
jest.mock('@lingui/react', () => ({
  useLingui: () => ({
    i18n: { locale: 'en', _: (message: string) => message },
  }),
}));
jest.mock('@/forecast-preview/forecastPreviewMessages', () => ({
  forecastPreviewMessages: {
    history: 'History',
    historyHelp: 'Private history',
    saveSnapshotHelp: 'Save help',
    saveSnapshot: 'Save',
    saveSnapshotRetry: 'Retry save',
    loadHistory: 'Load',
    hideHistory: 'Hide',
    historyLoading: 'Loading',
    snapshotFailure: 'Failed',
    emptyHistory: 'Empty',
    historicalSnapshot: 'Saved facts',
    historicalBoundary: 'Historical',
  },
}));
jest.mock('@/forecast-preview/utils/forecastSnapshot', () => ({
  readForecastSnapshot: (...args: unknown[]) => mockReadSnapshot(...args),
  readForecastSnapshotHistory: (value: unknown) => value,
}));

const policy: ForecastPreviewInput = {
  policyVersion: 'trial',
  startAt: '2026-10-01T00:00:00Z',
  endAt: '2026-11-01T00:00:00Z',
  ownerIds: ['11111111-1111-4111-8111-111111111111'],
  stages: [
    { stage: 'NEW', category: 'pipeline', probabilityBasisPoints: 1000 },
  ],
};
const deferred = () => {
  let resolve!: (value: unknown) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise((accept, fail) => {
    resolve = accept;
    reject = fail;
  });
  return { promise, resolve, reject };
};
const actor = { workspaceId: 'workspace-a', userId: 'user-a' };
const onFailure = jest.fn();
const panel = (key: string, canSave = true) => (
  <MemoryRouter>
    <ForecastHistoryPanel
      key={key}
      workspaceId={actor.workspaceId}
      userId={actor.userId}
      input={policy}
      canSave={canSave}
      onVerificationFailure={onFailure}
    />
  </MemoryRouter>
);

beforeEach(() => {
  jest.clearAllMocks();
});

describe('private snapshot request lifecycle', () => {
  it('reuses the command after a lost acknowledgement even when current preview was invalidated', async () => {
    const first = deferred();
    const retry = deferred();
    mockClient.mutate
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(retry.promise);
    const { rerender } = render(panel('actor-a'));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    const command =
      mockClient.mutate.mock.calls[0][0].variables.input.commandId;
    expect(command).toMatch(/^[\da-f-]{36}$/);
    await act(async () => first.reject(new Error('Acknowledgement lost')));
    expect(onFailure).toHaveBeenCalledTimes(1);
    rerender(panel('actor-a', false));
    const retryButton = screen.getByRole('button', {
      name: 'Retry save',
    });
    expect(retryButton).toBeEnabled();
    fireEvent.click(retryButton);
    expect(mockClient.mutate.mock.calls[1][0].variables.input).toEqual({
      commandId: command,
      policy,
    });
  });

  it('aborts and discards an old actor response even when transport ignores abort', async () => {
    const old = deferred();
    mockClient.query.mockReturnValueOnce(old.promise);
    const { rerender } = render(panel('actor-a'));
    fireEvent.click(screen.getByRole('button', { name: 'Load' }));
    const signal =
      mockClient.query.mock.calls[0][0].context.fetchOptions.signal;
    rerender(panel('actor-b'));
    expect(signal.aborted).toBe(true);
    await act(async () =>
      old.resolve({
        data: {
          revenueForecastSnapshots: [
            { id: 'private-old', createdAt: '2026-10-01T00:00:00Z' },
          ],
        },
      }),
    );
    expect(screen.queryByText('private-old')).not.toBeInTheDocument();
    expect(onFailure).not.toHaveBeenCalled();
  });

  it('cancels an in-flight read when the caller hides history', async () => {
    const pending = deferred();
    mockClient.query.mockReturnValueOnce(pending.promise);
    render(panel('actor-a'));
    fireEvent.click(screen.getByRole('button', { name: 'Load' }));
    const signal =
      mockClient.query.mock.calls[0][0].context.fetchOptions.signal;
    fireEvent.click(screen.getByRole('button', { name: 'Hide' }));
    expect(signal.aborted).toBe(true);
    await act(async () => pending.reject(new Error('Aborted')));
    expect(screen.queryByText('Failed')).not.toBeInTheDocument();
    expect(onFailure).not.toHaveBeenCalled();
  });

  it('clears a warm history list and invalidates current facts after permission denial', async () => {
    mockClient.query.mockResolvedValueOnce({
      data: {
        revenueForecastSnapshots: [
          { id: 'private-ref', createdAt: '2026-10-01T00:00:00Z' },
        ],
      },
    });
    render(panel('actor-a'));
    await act(async () =>
      fireEvent.click(screen.getByRole('button', { name: 'Load' })),
    );
    expect(screen.getByText('private-ref')).toBeInTheDocument();
    mockClient.query.mockRejectedValueOnce(new Error('Forbidden'));
    await act(async () =>
      fireEvent.click(screen.getByRole('button', { name: 'Load' })),
    );
    expect(screen.queryByText('private-ref')).not.toBeInTheDocument();
    expect(onFailure).toHaveBeenCalledTimes(1);
  });
});
