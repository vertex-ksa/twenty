import { gql } from '@apollo/client';
import { useApolloClient } from '@apollo/client/react';
import { styled } from '@linaria/react';
import { useLingui } from '@lingui/react';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Button } from 'twenty-ui/primitives/input';
import { themeCssVariables } from 'twenty-ui/theme';

import { currentUserState } from '@/auth/states/currentUserState';
import { currentUserWorkspaceState } from '@/auth/states/currentUserWorkspaceState';
import { currentWorkspaceState } from '@/auth/states/currentWorkspaceState';
import { currentWorkspaceMemberState } from '@/auth/states/currentWorkspaceMemberState';
import { currentWorkspaceMembersState } from '@/auth/states/currentWorkspaceMembersState';
import { forecastPreviewMessages } from '@/forecast-preview/forecastPreviewMessages';
import { useForecastPreviewRequest } from '@/forecast-preview/hooks/useForecastPreviewRequest';
import {
  FORECAST_CATEGORIES,
  formatForecastMicros,
  readForecastPreview,
  validateForecastInput,
  type ForecastCategory,
  type ForecastPreviewInput,
} from '@/forecast-preview/utils/forecastPreview';
import { isForecastPreviewEnabled } from '@/forecast-preview/utils/isForecastPreviewEnabled';
import { objectMetadataItemsWithFieldsSelector } from '@/object-metadata/states/objectMetadataItemsWithFieldsSelector';
import { PageCardHeader } from '@/ui/layout/page/components/PageCardHeader';
import { PageCardLayout } from '@/ui/layout/page/components/PageCardLayout';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';

const PREVIEW_QUERY = gql`
  query RevenueForecastPreview($input: ForecastPreviewInput!) {
    revenueForecastPreview(input: $input)
  }
`;
const StyledBody = styled.div`
  box-sizing: border-box;
  color: ${themeCssVariables.font.color.primary};
  flex: 1;
  min-height: 0;
  min-width: 0;
  overflow: auto;
  padding: ${themeCssVariables.spacing[6]};
  h1 {
    font-size: ${themeCssVariables.font.size.lg};
    margin: 0;
  }
  p {
    line-height: 1.5;
  }
  label {
    display: flex;
    flex-direction: column;
    gap: ${themeCssVariables.spacing[2]};
  }
  input,
  select {
    background: ${themeCssVariables.background.primary};
    border: 1px solid ${themeCssVariables.border.color.medium};
    border-radius: ${themeCssVariables.border.radius.sm};
    box-sizing: border-box;
    color: inherit;
    font: inherit;
    min-height: 44px;
    min-width: 0;
    padding: ${themeCssVariables.spacing[2]};
    width: 100%;
  }
  button {
    min-height: 44px;
  }
  :is(input, select, button, a):focus-visible {
    outline: 2px solid ${themeCssVariables.color.blue9};
    outline-offset: 2px;
  }
  a {
    color: ${themeCssVariables.color.blue9};
    overflow-wrap: anywhere;
  }
  fieldset {
    border: 1px solid ${themeCssVariables.border.color.medium};
    margin: 0 0 ${themeCssVariables.spacing[4]};
    min-width: 0;
    padding: ${themeCssVariables.spacing[4]};
  }
  legend {
    font-weight: ${themeCssVariables.font.weight.semiBold};
  }
  table {
    border-collapse: collapse;
    text-align: start;
    width: 100%;
  }
  th,
  td {
    border-bottom: 1px solid ${themeCssVariables.border.color.medium};
    padding: ${themeCssVariables.spacing[3]};
    text-align: start;
  }
  th {
    background: ${themeCssVariables.background.secondary};
  }
  caption {
    padding-block: ${themeCssVariables.spacing[3]};
    text-align: start;
    font-weight: ${themeCssVariables.font.weight.semiBold};
  }
  bdi {
    font-variant-numeric: tabular-nums;
  }
  @media (max-width: 600px) {
    padding: ${themeCssVariables.spacing[3]};
    input,
    select {
      font-size: 16px;
    }
  }
`;
const StyledFields = styled.div`
  display: grid;
  gap: ${themeCssVariables.spacing[4]};
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 230px), 1fr));
`;
const StyledTableScroll = styled.div`
  margin-block: ${themeCssVariables.spacing[4]};
  max-width: 100%;
  overflow: auto;
  &:focus-visible {
    outline: 2px solid ${themeCssVariables.color.blue9};
  }
`;
const StyledBoundary = styled.p`
  background: ${themeCssVariables.background.secondary};
  border-inline-start: 3px solid ${themeCssVariables.color.blue9};
  padding: ${themeCssVariables.spacing[4]};
`;
const StyledActions = styled.div`
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: ${themeCssVariables.spacing[3]};
  margin-block: ${themeCssVariables.spacing[4]};
`;
type MessageKey = keyof typeof forecastPreviewMessages;
type StageDraft = {
  stage: string;
  category: ForecastCategory;
  probability: string;
};
const PAGE_SIZE = 25;

export const ForecastPreviewPage = () => {
  const currentWorkspace = useAtomStateValue(currentWorkspaceState);
  const currentUser = useAtomStateValue(currentUserState);
  return (
    <ForecastPreviewSurface
      key={`${currentWorkspace?.id ?? ''}/${currentUser?.id ?? ''}`}
    />
  );
};

const ForecastPreviewSurface = () => {
  const { i18n } = useLingui();
  const text = (key: MessageKey) => i18n._(forecastPreviewMessages[key]);
  const formatDateTime = (value: string) =>
    new Intl.DateTimeFormat(i18n.locale, {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'UTC',
    }).format(new Date(value));
  const client = useApolloClient();
  const currentWorkspace = useAtomStateValue(currentWorkspaceState);
  const currentUser = useAtomStateValue(currentUserState);
  const currentWorkspaceMember = useAtomStateValue(currentWorkspaceMemberState);
  const currentWorkspaceMembers = useAtomStateValue(
    currentWorkspaceMembersState,
  );
  const currentUserWorkspace = useAtomStateValue(currentUserWorkspaceState);
  const objectMetadataItemsWithFields = useAtomStateValue(
    objectMetadataItemsWithFieldsSelector,
  );
  const opportunityObject = objectMetadataItemsWithFields.find(
    (object) => object.nameSingular === 'opportunity',
  );
  const stageOptions =
    opportunityObject?.fields.find((field) => field.name === 'stage')
      ?.options ?? [];
  const [params, setParams] = useSearchParams();
  const now = new Date();
  const startDate =
    params.get('start') ??
    new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
      .toISOString()
      .slice(0, 10);
  const endDate =
    params.get('end') ??
    new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))
      .toISOString()
      .slice(0, 10);
  const [selectedOwners, setSelectedOwners] = useState<string[] | null>(null);
  const [stageDrafts, setStageDrafts] = useState<StageDraft[] | null>(null);
  const ownerIds =
    selectedOwners ??
    (currentWorkspaceMember?.id ? [currentWorkspaceMember.id] : []);
  const stages =
    stageDrafts ??
    stageOptions.map((option) => ({
      stage: option.value,
      category: 'excluded' as const,
      probability: '0',
    }));
  const input: ForecastPreviewInput = {
    policyVersion: 'local-trial-v1',
    startAt: `${startDate}T00:00:00Z`,
    endAt: `${endDate}T00:00:00Z`,
    ownerIds,
    stages: stages.map((stage) => ({
      stage: stage.stage,
      category: stage.category,
      probabilityBasisPoints: /^\d+$/.test(stage.probability)
        ? Number(stage.probability)
        : Number.NaN,
    })),
  };
  const permission = currentUserWorkspace?.objectsPermissions.find(
    (permission) => permission.objectMetadataId === opportunityObject?.id,
  );
  const knownContext = Boolean(
    currentWorkspace?.id &&
    currentUser?.id &&
    currentWorkspaceMember?.id &&
    currentUserWorkspace &&
    opportunityObject &&
    stages.length &&
    permission?.canReadObjectRecords !== false,
  );
  const signature = JSON.stringify([
    currentWorkspace?.id,
    currentUser?.id,
    currentWorkspaceMember?.id,
    currentUserWorkspace,
    input,
  ]);
  const [validationError, setValidationError] = useState<MessageKey | null>(
    null,
  );
  const [page, setPage] = useState(1);
  const fetchPreview = useCallback(
    async (requestedInput: ForecastPreviewInput, signal: AbortSignal) => {
      const response = await client.query<{ revenueForecastPreview: unknown }>({
        query: PREVIEW_QUERY,
        variables: { input: requestedInput },
        fetchPolicy: 'no-cache',
        context: { fetchOptions: { signal } },
      });
      return readForecastPreview(
        response.data?.revenueForecastPreview,
        requestedInput,
      );
    },
    [client],
  );
  const {
    preview,
    busy,
    failure,
    hasFailure,
    start,
    clear: clearRequest,
  } = useForecastPreviewRequest({ signature, knownContext, fetchPreview });
  const failureMessage = failure instanceof Error ? failure.message : '';
  const requestError: MessageKey | null = !hasFailure
    ? null
    : /capacity|exceeds local preview/i.test(failureMessage)
      ? 'capacity'
      : /forbidden|permission|unauthorized|unauthenticated|disabled|access denied/i.test(
            failureMessage,
          )
        ? 'access'
        : 'failure';
  const error = validationError ?? requestError;
  const clear = useCallback(() => {
    clearRequest();
    setValidationError(null);
    setPage(1);
  }, [clearRequest]);
  useEffect(() => {
    clear();
  }, [signature, clear]);
  useEffect(() => {
    document.title = i18n._(forecastPreviewMessages.title);
  }, [i18n, i18n.locale]);
  const updateDate = (key: string, value: string) => {
    clear();
    const next = new URLSearchParams(params);
    next.set(key, value);
    setParams(next, { replace: true });
  };
  const updateStage = (index: number, change: Partial<StageDraft>) => {
    clear();
    setStageDrafts(
      stages.map((stage, stageIndex) =>
        stageIndex === index ? { ...stage, ...change } : stage,
      ),
    );
  };
  const refresh = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    clear();
    if (!knownContext) {
      setValidationError('access');
      return;
    }
    try {
      validateForecastInput(input);
    } catch {
      setValidationError('invalid');
      event.currentTarget
        .querySelector<HTMLInputElement>('[name="forecastStart"]')
        ?.focus();
      return;
    }
    start(input);
  };
  const availableMembers = currentWorkspaceMembers.map((candidate) => ({
    id: candidate.id,
    name: candidate.name,
  }));
  if (
    currentWorkspaceMember &&
    !availableMembers.some(
      (candidate) => candidate.id === currentWorkspaceMember.id,
    )
  )
    availableMembers.push({
      id: currentWorkspaceMember.id,
      name: currentWorkspaceMember.name,
    });
  const ownerName = (id: string | null) => {
    if (id === null) return text('noOwner');
    const candidate = availableMembers.find((candidate) => candidate.id === id);
    const name = candidate
      ? [candidate.name.firstName, candidate.name.lastName]
          .filter(Boolean)
          .join(' ')
      : '';
    return name || `${text('unknownOwner')} ${id}`;
  };
  const reasonLabels: Record<string, MessageKey> = {
    unassignedOwner: 'noOwner',
    outsideOwnerScope: 'outsideOwner',
    outsidePeriod: 'outsidePeriod',
    missingDate: 'missingDate',
    missingAmount: 'missingAmount',
    policy: 'policy',
  };
  const exclusions = new Map(
    preview?.forecast.excluded.map((row) => [row.opportunityId, row.reason]),
  );
  const pages = Math.max(
    1,
    Math.ceil((preview?.opportunities.length ?? 0) / PAGE_SIZE),
  );
  if (!isForecastPreviewEnabled()) return null;
  return (
    <PageCardLayout header={<PageCardHeader title={text('title')} />}>
      <StyledBody dir={i18n.locale.startsWith('ar') ? 'rtl' : 'ltr'}>
        <h1>{text('title')}</h1>
        <p>{text('introduction')}</p>
        <StyledBoundary>{text('boundary')}</StyledBoundary>
        <form onSubmit={refresh} aria-busy={busy}>
          <fieldset>
            <legend>{text('period')}</legend>
            <StyledFields>
              <label htmlFor="forecast-start">
                {text('start')}
                <input
                  id="forecast-start"
                  name="forecastStart"
                  autoComplete="off"
                  aria-describedby="forecast-status"
                  type="date"
                  required
                  value={startDate}
                  onChange={(event) => updateDate('start', event.target.value)}
                />
              </label>
              <label htmlFor="forecast-end">
                {text('end')}
                <input
                  id="forecast-end"
                  name="forecastEnd"
                  autoComplete="off"
                  aria-describedby="forecast-status"
                  type="date"
                  required
                  value={endDate}
                  onChange={(event) => updateDate('end', event.target.value)}
                />
              </label>
            </StyledFields>
          </fieldset>
          <fieldset>
            <legend>{text('owners')}</legend>
            <label htmlFor="forecast-owners">
              {text('owners')}
              <select
                id="forecast-owners"
                name="forecastOwners"
                autoComplete="off"
                multiple
                required
                value={ownerIds}
                aria-describedby="forecast-owner-help"
                onChange={(event) => {
                  clear();
                  setSelectedOwners(
                    [...event.target.selectedOptions].map(
                      (option) => option.value,
                    ),
                  );
                }}
              >
                {availableMembers.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {ownerName(candidate.id)}
                  </option>
                ))}
              </select>
            </label>
            <p id="forecast-owner-help">{text('ownerHelp')}</p>
          </fieldset>
          <fieldset>
            <legend>{text('mapping')}</legend>
            <p>{text('mappingHelp')}</p>
            <StyledTableScroll
              tabIndex={0}
              role="region"
              aria-label={text('mapping')}
            >
              <table>
                <thead>
                  <tr>
                    <th scope="col">{text('stage')}</th>
                    <th scope="col">{text('category')}</th>
                    <th scope="col">{text('probability')}</th>
                  </tr>
                </thead>
                <tbody>
                  {stages.map((stage, index) => (
                    <tr key={stage.stage}>
                      <th scope="row">
                        <bdi>
                          {stageOptions.find(
                            (option) => option.value === stage.stage,
                          )?.label ?? stage.stage}
                        </bdi>
                      </th>
                      <td>
                        <select
                          name={`forecastCategory-${index}`}
                          autoComplete="off"
                          aria-label={`${text('category')} · ${stage.stage}`}
                          value={stage.category}
                          onChange={(event) =>
                            updateStage(index, {
                              category: event.target.value as ForecastCategory,
                            })
                          }
                        >
                          {FORECAST_CATEGORIES.map((category) => (
                            <option key={category} value={category}>
                              {text(category)}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <input
                          name={`forecastProbability-${index}`}
                          autoComplete="off"
                          spellCheck={false}
                          aria-label={`${text('probability')} · ${stage.stage}`}
                          type="number"
                          min="0"
                          max="10000"
                          step="1"
                          required
                          value={stage.probability}
                          onChange={(event) =>
                            updateStage(index, {
                              probability: event.target.value,
                            })
                          }
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </StyledTableScroll>
          </fieldset>
          <Button
            type="submit"
            variant="solid"
            disabled={busy || !knownContext}
          >
            {text('run')}
          </Button>
        </form>
        <p
          id="forecast-status"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          {text(
            !knownContext
              ? 'access'
              : busy
                ? 'loading'
                : (error ??
                  (!preview
                    ? 'idle'
                    : !preview.opportunities.length
                      ? 'empty'
                      : !preview.forecast.currencies.length
                        ? 'noIncluded'
                        : 'rows')),
          )}
        </p>
        {preview && (
          <section aria-label={text('totals')}>
            <p>
              {text('readAt')}:{' '}
              <time dateTime={preview.generatedAt}>
                <bdi>{formatDateTime(preview.generatedAt)}</bdi>
              </time>
            </p>
            <p>{text('totalsHelp')}</p>
            {!!preview.forecast.currencies.length && (
              <StyledTableScroll
                tabIndex={0}
                role="region"
                aria-label={text('totals')}
              >
                <table>
                  <caption>{text('totals')}</caption>
                  <thead>
                    <tr>
                      {(
                        [
                          'currency',
                          'pipeline',
                          'bestCase',
                          'commit',
                          'won',
                          'weighted',
                        ] as MessageKey[]
                      ).map((key) => (
                        <th scope="col" key={key}>
                          {text(key)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.forecast.currencies.map((bucket) => (
                      <tr key={bucket.currencyCode}>
                        <th scope="row">
                          <bdi translate="no">{bucket.currencyCode}</bdi>
                        </th>
                        {[
                          bucket.pipelineMicros,
                          bucket.bestCaseMicros,
                          bucket.commitMicros,
                          bucket.wonOpportunityMicros,
                          bucket.weightedOpenMicros,
                        ].map((value, index) => (
                          <td key={index}>
                            <bdi>
                              {formatForecastMicros(value, i18n.locale)}
                            </bdi>
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </StyledTableScroll>
            )}
            {!!preview.opportunities.length && (
              <>
                <StyledTableScroll
                  tabIndex={0}
                  role="region"
                  aria-label={text('rows')}
                >
                  <table>
                    <caption>
                      {text('rows')} ·{' '}
                      <bdi>
                        {new Intl.NumberFormat(i18n.locale).format(
                          preview.opportunities.length,
                        )}
                      </bdi>
                    </caption>
                    <thead>
                      <tr>
                        {(
                          [
                            'reference',
                            'owner',
                            'stage',
                            'closeDate',
                            'amount',
                            'reason',
                          ] as MessageKey[]
                        ).map((key) => (
                          <th scope="col" key={key}>
                            {text(key)}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {preview.opportunities
                        .slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
                        .map((row) => (
                          <tr key={row.id}>
                            <td>
                              <Link to={`/object/opportunity/${row.id}`}>
                                <bdi translate="no">{row.id}</bdi>
                              </Link>
                            </td>
                            <td>
                              <bdi>{ownerName(row.ownerId)}</bdi>
                            </td>
                            <td>
                              <bdi>
                                {stageOptions.find(
                                  (option) => option.value === row.stage,
                                )?.label ?? row.stage}
                              </bdi>
                            </td>
                            <td>
                              <bdi>
                                {row.closeDate
                                  ? formatDateTime(row.closeDate)
                                  : '—'}
                              </bdi>
                            </td>
                            <td>
                              <bdi>
                                {row.amount
                                  ? `${formatForecastMicros(row.amount.amountMicros, i18n.locale)} ${row.amount.currencyCode}`
                                  : '—'}
                              </bdi>
                            </td>
                            <td>
                              {exclusions.has(row.id)
                                ? text(reasonLabels[exclusions.get(row.id)!])
                                : text(
                                    input.stages.find(
                                      (stage) => stage.stage === row.stage,
                                    )!.category,
                                  )}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </StyledTableScroll>
                <StyledActions>
                  <Button
                    type="button"
                    disabled={page <= 1}
                    onClick={() => setPage(page - 1)}
                  >
                    {text('previous')}
                  </Button>
                  <bdi>
                    {new Intl.NumberFormat(i18n.locale).format(page)} /{' '}
                    {new Intl.NumberFormat(i18n.locale).format(pages)}
                  </bdi>
                  <Button
                    type="button"
                    disabled={page >= pages}
                    onClick={() => setPage(page + 1)}
                  >
                    {text('next')}
                  </Button>
                </StyledActions>
              </>
            )}
          </section>
        )}
      </StyledBody>
    </PageCardLayout>
  );
};
