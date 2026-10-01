import { gql } from '@apollo/client';
import { useApolloClient } from '@apollo/client/react';
import { styled } from '@linaria/react';
import { useLingui } from '@lingui/react';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from 'twenty-ui/primitives/input';
import { themeCssVariables } from 'twenty-ui/theme';

import { forecastPreviewMessages } from '@/forecast-preview/forecastPreviewMessages';
import {
  formatForecastMicros,
  type ForecastPreviewInput,
} from '@/forecast-preview/utils/forecastPreview';
import {
  readForecastSnapshot,
  readForecastSnapshotHistory,
  type ForecastSnapshot,
  type ForecastSnapshotReference,
} from '@/forecast-preview/utils/forecastSnapshot';

const HISTORY_QUERY = gql`
  query MyRevenueForecastSnapshots {
    revenueForecastSnapshots
  }
`;
const SNAPSHOT_QUERY = gql`
  query MyRevenueForecastSnapshot($id: String!) {
    revenueForecastSnapshot(id: $id)
  }
`;
const SAVE_MUTATION = gql`
  mutation SaveMyRevenueForecastSnapshot($input: SaveForecastSnapshotInput!) {
    saveRevenueForecastSnapshot(input: $input)
  }
`;
const StyledHistory = styled.section`
  border-block-start: 1px solid ${themeCssVariables.border.color.medium};
  margin-block-start: ${themeCssVariables.spacing[6]};
  min-width: 0;
  padding-block-start: ${themeCssVariables.spacing[4]};
  ul {
    padding-inline-start: ${themeCssVariables.spacing[6]};
  }
  li {
    margin-block: ${themeCssVariables.spacing[2]};
    overflow-wrap: anywhere;
  }
  dl {
    display: grid;
    gap: ${themeCssVariables.spacing[2]};
  }
  dd {
    margin-inline-start: 0;
    overflow-wrap: anywhere;
  }
  h3:focus-visible {
    outline: 2px solid ${themeCssVariables.color.blue9};
    outline-offset: 2px;
  }
`;
const StyledActions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${themeCssVariables.spacing[3]};
  margin-block: ${themeCssVariables.spacing[3]};
`;
const StyledScroll = styled.div`
  margin-block: ${themeCssVariables.spacing[4]};
  max-width: 100%;
  overflow: auto;
  &:focus-visible {
    outline: 2px solid ${themeCssVariables.color.blue9};
    outline-offset: 2px;
  }
`;
type Request =
  | { kind: 'history' }
  | { kind: 'read'; id: string }
  | { kind: 'save'; commandId: string; policy: ForecastPreviewInput };
type HistoryState = {
  references: ForecastSnapshotReference[] | null;
  snapshot: ForecastSnapshot | null;
  failure: boolean;
  pending: boolean;
};
const EMPTY: HistoryState = {
  references: null,
  snapshot: null,
  failure: false,
  pending: false,
};

export const ForecastHistoryPanel = ({
  workspaceId,
  userId,
  input,
  canSave,
  onVerificationFailure,
}: {
  workspaceId: string;
  userId: string;
  input: ForecastPreviewInput;
  canSave: boolean;
  onVerificationFailure: () => void;
}) => {
  const client = useApolloClient();
  const { i18n } = useLingui();
  const text = (key: keyof typeof forecastPreviewMessages) =>
    i18n._(forecastPreviewMessages[key]);
  const formatTime = (date: string) =>
    new Intl.DateTimeFormat(i18n.locale, {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'UTC',
    }).format(new Date(date));
  const [request, setRequest] = useState<Request | null>(null);
  const [state, setState] = useState<HistoryState>(EMPTY);
  const [saveCommand, setSaveCommand] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const focusHistoricalFacts = useCallback(
    (heading: HTMLHeadingElement | null) => heading?.focus(),
    [],
  );

  useEffect(() => {
    if (!request) return;
    const abort = new AbortController();
    let active = true;
    const context = { fetchOptions: { signal: abort.signal } };
    const run = async () => {
      try {
        if (request.kind === 'history') {
          const response = await client.query<{
            revenueForecastSnapshots: unknown;
          }>({ query: HISTORY_QUERY, fetchPolicy: 'no-cache', context });
          const references = readForecastSnapshotHistory(
            response.data?.revenueForecastSnapshots,
          );
          if (active) setState({ ...EMPTY, references });
          return;
        }
        const value =
          request.kind === 'read'
            ? (
                await client.query<{ revenueForecastSnapshot: unknown }>({
                  query: SNAPSHOT_QUERY,
                  variables: { id: request.id },
                  fetchPolicy: 'no-cache',
                  context,
                })
              ).data?.revenueForecastSnapshot
            : (
                await client.mutate<{ saveRevenueForecastSnapshot: unknown }>({
                  mutation: SAVE_MUTATION,
                  variables: {
                    input: {
                      commandId: request.commandId,
                      policy: request.policy,
                    },
                  },
                  fetchPolicy: 'no-cache',
                  context,
                })
              ).data?.saveRevenueForecastSnapshot;
        const snapshot = await readForecastSnapshot(
          value,
          { workspaceId, userId },
          request.kind === 'read'
            ? { id: request.id }
            : { policy: request.policy },
        );
        if (!active) return;
        setState((previous) => ({
          ...EMPTY,
          references: previous.references,
          snapshot,
        }));
        setPage(1);
        if (request.kind === 'save') setSaveCommand(null);
      } catch {
        if (active) {
          setState({ ...EMPTY, failure: true });
          onVerificationFailure();
        }
      }
    };
    void run();
    return () => {
      active = false;
      abort.abort();
    };
  }, [client, request, userId, workspaceId, onVerificationFailure]);

  const start = (next: Request) => {
    setState((previous) => ({
      ...EMPTY,
      references: previous.references,
      pending: true,
    }));
    setRequest(next);
  };
  const save = () => {
    const commandId = saveCommand ?? crypto.randomUUID();
    setSaveCommand(commandId);
    start({ kind: 'save', commandId, policy: input });
  };
  const clear = () => {
    setRequest(null);
    setState(EMPTY);
    setPage(1);
  };
  const snapshot = state.snapshot;
  const pages = Math.max(
    1,
    Math.ceil((snapshot?.preview.opportunities.length ?? 0) / 25),
  );

  return (
    <StyledHistory
      aria-labelledby="forecast-history-title"
      aria-busy={state.pending}
    >
      <h2 id="forecast-history-title">{text('history')}</h2>
      <p>{text('historyHelp')}</p>
      <p>{text('saveSnapshotHelp')}</p>
      <StyledActions>
        <Button
          type="button"
          disabled={(!canSave && !saveCommand) || state.pending}
          onClick={save}
        >
          {text(saveCommand ? 'saveSnapshotRetry' : 'saveSnapshot')}
        </Button>
        <Button
          type="button"
          disabled={state.pending}
          onClick={() => start({ kind: 'history' })}
        >
          {text('loadHistory')}
        </Button>
        <Button type="button" onClick={clear}>
          {text('hideHistory')}
        </Button>
      </StyledActions>
      <p role="status" aria-live="polite">
        {state.pending
          ? text('historyLoading')
          : state.failure
            ? text('snapshotFailure')
            : ''}
      </p>
      {state.references !== null &&
        (state.references.length ? (
          <ul>
            {state.references.map((reference) => (
              <li key={reference.id}>
                <time dateTime={reference.createdAt}>
                  {formatTime(reference.createdAt)} UTC
                </time>
                {' · '}
                <bdi translate="no">{reference.id}</bdi>{' '}
                <Button
                  type="button"
                  disabled={state.pending}
                  onClick={() => start({ kind: 'read', id: reference.id })}
                >
                  {text('openSnapshot')}
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p>{text('emptyHistory')}</p>
        ))}
      {snapshot && (
        <>
          <h3 ref={focusHistoricalFacts} tabIndex={-1}>
            {text('historicalSnapshot')}
          </h3>
          <p>{text('historicalBoundary')}</p>
          <dl>
            <dt>{text('snapshotReference')}</dt>
            <dd>
              <bdi translate="no">{snapshot.id}</bdi>
            </dd>
            <dt>{text('savedAt')}</dt>
            <dd>
              <time dateTime={snapshot.createdAt}>
                {formatTime(snapshot.createdAt)} UTC
              </time>
            </dd>
            <dt>{text('readAt')}</dt>
            <dd>
              <time dateTime={snapshot.preview.generatedAt}>
                {formatTime(snapshot.preview.generatedAt)} UTC
              </time>
            </dd>
            <dt>{text('storedPeriod')}</dt>
            <dd>
              <bdi translate="no">{snapshot.policy.startAt}</bdi>
              {' ≤ '}
              {text('closeDate')}
              {' < '}
              <bdi translate="no">{snapshot.policy.endAt}</bdi>
            </dd>
            <dt>{text('storedOwners')}</dt>
            <dd>
              {snapshot.policy.ownerIds.map((id) => (
                <p key={id}>
                  <bdi translate="no">{id}</bdi>
                </p>
              ))}
            </dd>
          </dl>
          <StyledScroll
            tabIndex={0}
            role="region"
            aria-label={text('storedMappings')}
          >
            <table>
              <caption>{text('storedMappings')}</caption>
              <thead>
                <tr>
                  <th scope="col">{text('stage')}</th>
                  <th scope="col">{text('category')}</th>
                  <th scope="col">{text('probability')}</th>
                </tr>
              </thead>
              <tbody>
                {snapshot.policy.stages.map((stage) => (
                  <tr key={stage.stage}>
                    <th scope="row">
                      <bdi translate="no">{stage.stage}</bdi>
                    </th>
                    <td>{text(stage.category)}</td>
                    <td>
                      <bdi>
                        {stage.probabilityBasisPoints.toLocaleString(
                          i18n.locale,
                        )}
                      </bdi>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </StyledScroll>
          <p>{text('totalsHelp')}</p>
          <StyledScroll tabIndex={0} role="region" aria-label={text('totals')}>
            <table>
              <caption>{text('totals')}</caption>
              <thead>
                <tr>
                  <th scope="col">{text('currency')}</th>
                  <th scope="col">{text('pipeline')}</th>
                  <th scope="col">{text('bestCase')}</th>
                  <th scope="col">{text('commit')}</th>
                  <th scope="col">{text('won')}</th>
                  <th scope="col">{text('weighted')}</th>
                </tr>
              </thead>
              <tbody>
                {snapshot.preview.forecast.currencies.map((currency) => (
                  <tr key={currency.currencyCode}>
                    <th scope="row">
                      <bdi translate="no">{currency.currencyCode}</bdi>
                    </th>
                    {[
                      currency.pipelineMicros,
                      currency.bestCaseMicros,
                      currency.commitMicros,
                      currency.wonOpportunityMicros,
                      currency.weightedOpenMicros,
                    ].map((amount, index) => (
                      <td key={index}>
                        <bdi>{formatForecastMicros(amount, i18n.locale)}</bdi>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </StyledScroll>
          {!snapshot.preview.opportunities.length && <p>{text('empty')}</p>}
          <StyledScroll tabIndex={0} role="region" aria-label={text('rows')}>
            <table>
              <caption>{text('rows')}</caption>
              <thead>
                <tr>
                  <th scope="col">{text('reference')}</th>
                  <th scope="col">{text('owner')}</th>
                  <th scope="col">{text('stage')}</th>
                  <th scope="col">{text('closeDate')}</th>
                  <th scope="col">{text('amount')}</th>
                </tr>
              </thead>
              <tbody>
                {snapshot.preview.opportunities
                  .slice((page - 1) * 25, page * 25)
                  .map((opportunity) => (
                    <tr key={opportunity.id}>
                      <th scope="row">
                        <Link to={`/object/opportunity/${opportunity.id}`}>
                          <bdi translate="no">{opportunity.id}</bdi>
                        </Link>
                      </th>
                      <td>
                        {opportunity.ownerId ? (
                          <bdi translate="no">{opportunity.ownerId}</bdi>
                        ) : (
                          text('noOwner')
                        )}
                      </td>
                      <td>
                        <bdi translate="no">{opportunity.stage}</bdi>
                      </td>
                      <td>
                        <bdi translate="no">{opportunity.closeDate ?? '—'}</bdi>
                      </td>
                      <td>
                        {opportunity.amount ? (
                          <>
                            <bdi translate="no">
                              {opportunity.amount.currencyCode}
                            </bdi>{' '}
                            <bdi>
                              {formatForecastMicros(
                                opportunity.amount.amountMicros,
                                i18n.locale,
                              )}
                            </bdi>
                          </>
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </StyledScroll>
          {pages > 1 && (
            <StyledActions>
              <Button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
              >
                {text('previous')}
              </Button>
              <span>
                <bdi>
                  {page.toLocaleString(i18n.locale)} /{' '}
                  {pages.toLocaleString(i18n.locale)}
                </bdi>
              </span>
              <Button
                type="button"
                disabled={page >= pages}
                onClick={() => setPage(page + 1)}
              >
                {text('next')}
              </Button>
            </StyledActions>
          )}
        </>
      )}
    </StyledHistory>
  );
};
