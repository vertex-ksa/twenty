import { UseFilters, UseGuards, UsePipes } from '@nestjs/common';
import { Args, Mutation, Query } from '@nestjs/graphql';

import GraphQLJSON from 'graphql-type-json';

import { MetadataResolver } from 'src/engine/api/graphql/graphql-config/decorators/metadata-resolver.decorator';
import { PreventNestToAutoLogGraphqlErrorsFilter } from 'src/engine/core-modules/graphql/filters/prevent-nest-to-auto-log-graphql-errors.filter';
import { ResolverValidationPipe } from 'src/engine/core-modules/graphql/pipes/resolver-validation.pipe';
import { CustomPermissionGuard } from 'src/engine/guards/custom-permission.guard';
import { UserAuthGuard } from 'src/engine/guards/user-auth.guard';
import { WorkspaceAuthGuard } from 'src/engine/guards/workspace-auth.guard';
import { ForecastPreviewInput } from 'src/modules/opportunity/forecasting/forecast-preview.input';
import { ForecastPreviewService } from 'src/modules/opportunity/forecasting/forecast-preview.service';
import { SaveForecastSnapshotInput } from 'src/modules/opportunity/forecasting/forecast-snapshot.input';
import { ForecastSnapshotService } from 'src/modules/opportunity/forecasting/forecast-snapshot.service';

@MetadataResolver()
@UseGuards(WorkspaceAuthGuard, UserAuthGuard)
@UsePipes(ResolverValidationPipe)
@UseFilters(PreventNestToAutoLogGraphqlErrorsFilter)
export class ForecastPreviewResolver {
  constructor(
    private readonly forecastPreviewService: ForecastPreviewService,
    private readonly forecastSnapshotService: ForecastSnapshotService,
  ) {}

  @Query(() => GraphQLJSON)
  // The service reads only through the current user's native ORM permissions.
  @UseGuards(CustomPermissionGuard)
  async revenueForecastPreview(@Args('input') input: ForecastPreviewInput) {
    return this.forecastPreviewService.preview(input);
  }

  @Query(() => GraphQLJSON)
  @UseGuards(CustomPermissionGuard)
  async revenueForecastSnapshots() {
    return this.forecastSnapshotService.list();
  }

  @Query(() => GraphQLJSON)
  @UseGuards(CustomPermissionGuard)
  async revenueForecastSnapshot(@Args('id') id: string) {
    // Invalid IDs receive the same unavailable response as inaccessible ones.
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        id,
      )
    ) {
      return this.forecastSnapshotService.read(
        '00000000-0000-4000-8000-000000000000',
      );
    }
    return this.forecastSnapshotService.read(id);
  }

  @Mutation(() => GraphQLJSON)
  @UseGuards(CustomPermissionGuard)
  async saveRevenueForecastSnapshot(
    @Args('input') input: SaveForecastSnapshotInput,
  ) {
    return this.forecastSnapshotService.save(input);
  }
}
