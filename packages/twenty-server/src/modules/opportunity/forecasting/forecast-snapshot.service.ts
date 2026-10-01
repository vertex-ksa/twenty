import { createHash } from 'crypto';

import { Injectable } from '@nestjs/common';
import { InjectWorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/inject-workspace-scoped-repository.decorator';
import { WorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/workspace-scoped-repository';
import { isPlainObject } from 'twenty-shared/utils';

import { isUserAuthContext } from 'src/engine/core-modules/auth/guards/is-user-auth-context.guard';
import { getWorkspaceAuthContext } from 'src/engine/core-modules/auth/storage/workspace-auth-context.storage';
import {
  ForecastSnapshotEntity,
  type SavedForecastContent,
} from 'src/engine/core-modules/forecast/forecast-snapshot.entity';
import {
  ForbiddenError,
  UserInputError,
} from 'src/engine/core-modules/graphql/utils/graphql-errors.util';
import { ForecastPreviewService } from 'src/modules/opportunity/forecasting/forecast-preview.service';
import { SaveForecastSnapshotInput } from 'src/modules/opportunity/forecasting/forecast-snapshot.input';

const hash = (value: unknown) =>
  createHash('sha256')
    .update(
      JSON.stringify(value, (_key: string, item: unknown) =>
        isPlainObject(item)
          ? Object.fromEntries(
              Object.entries(item).sort(([left], [right]) =>
                left < right ? -1 : left > right ? 1 : 0,
              ),
            )
          : item,
      ),
    )
    .digest('hex');

@Injectable()
export class ForecastSnapshotService {
  constructor(
    @InjectWorkspaceScopedRepository(ForecastSnapshotEntity)
    private readonly repository: WorkspaceScopedRepository<ForecastSnapshotEntity>,
    private readonly forecastPreviewService: ForecastPreviewService,
  ) {}

  private actorScope() {
    if (
      !['development', 'test'].includes(process.env.NODE_ENV ?? '') ||
      process.env.TM_FORECAST_PREVIEW_ENABLED !== 'true'
    ) {
      throw new ForbiddenError('Forecast preview is disabled');
    }
    const context = getWorkspaceAuthContext();
    if (!isUserAuthContext(context)) {
      throw new ForbiddenError(
        'Forecast snapshots require a native user session',
      );
    }
    return {
      workspaceId: context.workspace.id,
      userWorkspaceId: context.userWorkspaceId,
      userId: context.user.id,
    };
  }

  async list() {
    const actor = this.actorScope();
    const snapshots = await this.repository.find(actor.workspaceId, {
      where: actor,
      select: { id: true, createdAt: true },
      order: { createdAt: 'DESC', id: 'DESC' },
      take: 100,
    });
    // Listing contains no stored amounts, source IDs or policies.
    return { scope: 'private_native_user', limit: 100, snapshots };
  }

  async read(id: string) {
    const actor = this.actorScope();
    const snapshot = await this.repository.findOne(actor.workspaceId, {
      where: { ...actor, id },
    });
    if (!snapshot) throw new ForbiddenError('Forecast snapshot is unavailable');
    await this.revalidate(snapshot);
    return this.result(snapshot);
  }

  async save(input: SaveForecastSnapshotInput) {
    const actor = this.actorScope();
    const policy = {
      policyVersion: input.policy.policyVersion,
      startAt: input.policy.startAt,
      endAt: input.policy.endAt,
      ownerIds: [...input.policy.ownerIds].sort(),
      stages: [...input.policy.stages]
        .map(({ stage, category, probabilityBasisPoints }) => ({
          stage,
          category,
          probabilityBasisPoints,
        }))
        .sort((left, right) =>
          left.stage < right.stage ? -1 : left.stage > right.stage ? 1 : 0,
        ),
    };
    const environment = `${process.env.NODE_ENV}:${process.env.SERVER_URL ?? ''}`;
    const commandHash = hash({
      schemaVersion: 'native-private-forecast/1',
      environment,
      actor,
      policy,
    });
    const where = { ...actor, commandId: input.commandId };
    const prior = await this.repository.findOne(actor.workspaceId, { where });
    if (prior) return this.replay(prior, commandHash);

    const preview = await this.forecastPreviewService.preview(policy);
    const content: SavedForecastContent = {
      schemaVersion: 'native-private-forecast/1',
      calculationVersion: 'exact-micros-category/1',
      canonicalizationVersion: 'sorted-json-keys/1',
      captureKind: 'immutable_copy_of_read_only_preview',
      actor,
      environment,
      creditPolicy: 'current-owner-close-date-won-opportunity',
      policy,
      preview,
    };
    await this.repository
      .createScopedQueryBuilder(actor.workspaceId, 'snapshot')
      .insert()
      .values({
        ...where,
        commandHash,
        contentHash: hash(content),
        content,
      })
      .orIgnore()
      .execute();
    const saved = await this.repository.findOne(actor.workspaceId, { where });
    if (!saved)
      throw new UserInputError('Forecast snapshot could not be saved');
    return this.replay(saved, commandHash);
  }

  private async replay(snapshot: ForecastSnapshotEntity, commandHash: string) {
    if (snapshot.commandHash !== commandHash) {
      throw new UserInputError(
        'Forecast command was already used for another policy',
      );
    }
    await this.revalidate(snapshot);
    return this.result(snapshot);
  }

  private async revalidate(snapshot: ForecastSnapshotEntity) {
    if (
      snapshot.contentHash !== hash(snapshot.content) ||
      snapshot.content.environment !==
        `${process.env.NODE_ENV}:${process.env.SERVER_URL ?? ''}` ||
      snapshot.content.actor.workspaceId !== snapshot.workspaceId ||
      snapshot.content.actor.userWorkspaceId !== snapshot.userWorkspaceId ||
      snapshot.content.actor.userId !== snapshot.userId
    ) {
      throw new ForbiddenError('Forecast snapshot is unavailable');
    }
    // Current facts establish visibility only; they never replace saved facts.
    const currentIds = new Set(
      await this.forecastPreviewService.readAuthorizedOpportunityIds(),
    );
    if (
      snapshot.content.preview.opportunities.some(
        ({ id }) => !currentIds.has(id),
      )
    ) {
      throw new ForbiddenError(
        'Forecast snapshot is unavailable under current record permissions',
      );
    }
  }

  private result(snapshot: ForecastSnapshotEntity) {
    return {
      id: snapshot.id,
      createdAt: snapshot.createdAt,
      contentHash: snapshot.contentHash,
      scope: 'private_native_user',
      immutable: true,
      persistedSnapshot: true,
      policyAuthority: 'caller_supplied_private_snapshot',
      content: snapshot.content,
    };
  }
}
