import { Injectable } from '@nestjs/common';

import { isUserAuthContext } from 'src/engine/core-modules/auth/guards/is-user-auth-context.guard';
import { getWorkspaceAuthContext } from 'src/engine/core-modules/auth/storage/workspace-auth-context.storage';
import {
  ForbiddenError,
  UserInputError,
} from 'src/engine/core-modules/graphql/utils/graphql-errors.util';
import { WorkspaceOrmManager } from 'src/engine/twenty-orm/workspace-orm.manager';
import {
  computeRevenueForecast,
  type ForecastPolicy,
} from 'src/modules/opportunity/forecasting/compute-revenue-forecast.util';
import { ForecastPreviewInput } from 'src/modules/opportunity/forecasting/forecast-preview.input';
import { type OpportunityWorkspaceEntity } from 'src/modules/opportunity/standard-objects/opportunity.workspace-entity';

const PREVIEW_RECORD_LIMIT = 5000;

@Injectable()
export class ForecastPreviewService {
  constructor(private readonly workspaceOrmManager: WorkspaceOrmManager) {}

  async preview(input: ForecastPreviewInput) {
    // Local proving slice only. No production activation or service-wide dataset.
    if (
      !['development', 'test'].includes(process.env.NODE_ENV ?? '') ||
      process.env.TM_FORECAST_PREVIEW_ENABLED !== 'true'
    ) {
      throw new ForbiddenError('Forecast preview is disabled');
    }

    const authContext = getWorkspaceAuthContext();

    if (!isUserAuthContext(authContext)) {
      throw new ForbiddenError(
        'Forecast preview requires a native user session',
      );
    }

    if (
      new Set(input.stages.map(({ stage }) => stage)).size !==
      input.stages.length
    ) {
      throw new UserInputError('Duplicate forecast stage mapping');
    }

    const policy: ForecastPolicy = {
      version: input.policyVersion,
      startAt: input.startAt,
      endAt: input.endAt,
      ownerIds: input.ownerIds,
      stages: Object.fromEntries(
        input.stages.map(({ stage, category, probabilityBasisPoints }) => [
          stage,
          { category, probabilityBasisPoints },
        ]),
      ),
    };

    // Validate policy before any datastore access; no caller-supplied opportunity rows.
    try {
      computeRevenueForecast([], policy);
    } catch {
      throw new UserInputError('Invalid forecast policy or period');
    }

    return this.workspaceOrmManager.executeInWorkspaceContext(async () => {
      const repository =
        this.workspaceOrmManager.getRepositoryWithContextPermissions<OpportunityWorkspaceEntity>(
          'opportunity',
        );
      const opportunities = await repository.find({
        select: ['id', 'ownerId', 'stage', 'closeDate', 'amount'],
        order: { id: 'ASC' },
        take: PREVIEW_RECORD_LIMIT + 1,
      });

      if (opportunities.length > PREVIEW_RECORD_LIMIT) {
        throw new UserInputError(
          'Authorized dataset exceeds local preview capacity',
        );
      }

      try {
        const rows = opportunities.map(
          ({ id, ownerId, stage, closeDate, amount }) => ({
            id,
            ownerId,
            stage,
            closeDate:
              closeDate === null ? null : new Date(closeDate).toISOString(),
            amount,
          }),
        );

        return {
          source: 'current_native_actor_visible_opportunities',
          policyAuthority: 'caller_supplied_preview_only',
          persistedSnapshot: false,
          completeWithinAuthorizedDataset: true,
          generatedAt: new Date().toISOString(),
          forecast: computeRevenueForecast(rows, policy),
        };
      } catch {
        throw new UserInputError(
          'Native opportunity data cannot be forecast safely',
        );
      }
    }, authContext);
  }
}
