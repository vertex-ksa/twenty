import { useCallback, useEffect, useState } from 'react';

import {
  type ForecastPreview,
  type ForecastPreviewInput,
} from '@/forecast-preview/utils/forecastPreview';

type PreviewRequest = {
  signature: string;
  input: ForecastPreviewInput;
};
type PreviewResult =
  | {
      request: PreviewRequest;
      kind: 'success';
      data: ForecastPreview;
      failure?: never;
    }
  | {
      request: PreviewRequest;
      kind: 'failure';
      failure: unknown;
      data?: never;
    };

export const useForecastPreviewRequest = ({
  signature,
  knownContext,
  fetchPreview,
}: {
  signature: string;
  knownContext: boolean;
  fetchPreview: (
    input: ForecastPreviewInput,
    signal: AbortSignal,
  ) => Promise<ForecastPreview>;
}) => {
  const [request, setRequest] = useState<PreviewRequest | null>(null);
  const [result, setResult] = useState<PreviewResult | null>(null);
  const clear = useCallback(() => {
    setRequest(null);
    setResult(null);
  }, []);
  const start = useCallback(
    (input: ForecastPreviewInput) => {
      setResult(null);
      setRequest({ signature, input });
    },
    [signature],
  );

  useEffect(() => {
    clear();
  }, [signature, knownContext, clear]);

  useEffect(() => {
    if (!knownContext || !request || request.signature !== signature) return;
    const controller = new AbortController();
    let active = true;
    void fetchPreview(request.input, controller.signal).then(
      (data) => {
        if (active) setResult({ request, kind: 'success', data });
      },
      (failure: unknown) => {
        if (active) setResult({ request, kind: 'failure', failure });
      },
    );
    return () => {
      active = false;
      controller.abort();
    };
  }, [fetchPreview, knownContext, request, signature]);

  const currentRequest =
    knownContext && request?.signature === signature ? request : null;
  const currentResult =
    currentRequest && result?.request === currentRequest ? result : null;
  return {
    preview: currentResult?.data ?? null,
    failure: currentResult?.failure,
    hasFailure: currentResult?.kind === 'failure',
    busy: Boolean(currentRequest && !currentResult),
    start,
    clear,
  };
};
