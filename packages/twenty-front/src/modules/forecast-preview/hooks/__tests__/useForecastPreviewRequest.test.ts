import { act, renderHook } from '@testing-library/react';

import { useForecastPreviewRequest } from '@/forecast-preview/hooks/useForecastPreviewRequest';
import {
  type ForecastPreview,
  type ForecastPreviewInput,
} from '@/forecast-preview/utils/forecastPreview';

const input: ForecastPreviewInput = {
  policyVersion: 'trial',
  startAt: '2026-10-01T00:00:00Z',
  endAt: '2026-11-01T00:00:00Z',
  ownerIds: ['11111111-1111-4111-8111-111111111111'],
  stages: [
    { stage: 'NEW', category: 'pipeline', probabilityBasisPoints: 5000 },
  ],
};
const preview: ForecastPreview = {
  generatedAt: '2026-10-01T00:00:00Z',
  opportunities: [],
  forecast: { ...input, currencies: [], excluded: [] },
};
const deferred = () => {
  let resolve!: (value: ForecastPreview) => void;
  let reject!: (failure: Error) => void;
  const promise = new Promise<ForecastPreview>((accept, fail) => {
    resolve = accept;
    reject = fail;
  });
  return { promise, resolve, reject };
};

describe('forecast request authority and cancellation', () => {
  it('exposes an unknown transport failure and clears it on retry', async () => {
    const failed = deferred();
    const retry = deferred();
    const fetchPreview = jest
      .fn()
      .mockReturnValueOnce(failed.promise)
      .mockReturnValueOnce(retry.promise);
    const { result } = renderHook(() =>
      useForecastPreviewRequest({
        signature: 'actor-a',
        knownContext: true,
        fetchPreview,
      }),
    );
    act(() => result.current.start(input));
    await act(async () => failed.reject(new Error('Network unavailable')));
    expect(result.current.hasFailure).toBe(true);
    expect(result.current.busy).toBe(false);
    act(() => result.current.start(input));
    expect(result.current.hasFailure).toBe(false);
    expect(result.current.busy).toBe(true);
    await act(async () => retry.resolve(preview));
    expect(result.current.preview).toEqual(preview);
    expect(result.current.hasFailure).toBe(false);
  });
  it('discards a late response after the actor or policy changes, even if transport ignores abort', async () => {
    const old = deferred();
    const next = deferred();
    const fetchPreview = jest
      .fn()
      .mockReturnValueOnce(old.promise)
      .mockReturnValueOnce(next.promise);
    const { result, rerender } = renderHook(
      ({ signature }) =>
        useForecastPreviewRequest({
          signature,
          knownContext: true,
          fetchPreview,
        }),
      { initialProps: { signature: 'actor-a/policy-a' } },
    );
    act(() => result.current.start(input));
    const oldSignal: AbortSignal = fetchPreview.mock.calls[0][1];
    rerender({ signature: 'actor-b/policy-b' });
    expect(oldSignal.aborted).toBe(true);
    expect(result.current.busy).toBe(false);
    act(() => result.current.start(input));
    await act(async () => old.resolve(preview));
    expect(result.current.preview).toBeNull();
    expect(result.current.busy).toBe(true);
    await act(async () => next.resolve(preview));
    expect(result.current.preview).toEqual(preview);
    expect(result.current.busy).toBe(false);
  });

  it('clears visible results when native authority disappears', async () => {
    const pending = deferred();
    const fetchPreview = jest.fn().mockReturnValue(pending.promise);
    const { result, rerender } = renderHook(
      ({ knownContext }) =>
        useForecastPreviewRequest({
          signature: 'actor-a',
          knownContext,
          fetchPreview,
        }),
      { initialProps: { knownContext: true } },
    );
    act(() => result.current.start(input));
    await act(async () => pending.resolve(preview));
    expect(result.current.preview).toEqual(preview);
    rerender({ knownContext: false });
    expect(result.current.preview).toBeNull();
    rerender({ knownContext: true });
    expect(result.current.preview).toBeNull();
  });

  it('does not restore an error or result after the user clears a pending request', async () => {
    const pending = deferred();
    const fetchPreview = jest.fn().mockReturnValue(pending.promise);
    const { result } = renderHook(() =>
      useForecastPreviewRequest({
        signature: 'actor-a',
        knownContext: true,
        fetchPreview,
      }),
    );
    act(() => result.current.start(input));
    const signal: AbortSignal = fetchPreview.mock.calls[0][1];
    act(() => result.current.clear());
    expect(signal.aborted).toBe(true);
    await act(async () => pending.reject(new Error('Forbidden')));
    expect(result.current.failure).toBeUndefined();
    expect(result.current.preview).toBeNull();
    expect(result.current.busy).toBe(false);
  });

  it('aborts on unmount and ignores a late successful response', async () => {
    const pending = deferred();
    const fetchPreview = jest.fn().mockReturnValue(pending.promise);
    const { result, unmount } = renderHook(() =>
      useForecastPreviewRequest({
        signature: 'actor-a',
        knownContext: true,
        fetchPreview,
      }),
    );
    act(() => result.current.start(input));
    const signal: AbortSignal = fetchPreview.mock.calls[0][1];
    unmount();
    expect(signal.aborted).toBe(true);
    await act(async () => pending.resolve(preview));
  });
});
