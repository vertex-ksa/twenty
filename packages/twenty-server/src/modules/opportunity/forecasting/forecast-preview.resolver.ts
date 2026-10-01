import { UseFilters, UseGuards, UsePipes } from '@nestjs/common';
import { Args, Query } from '@nestjs/graphql';

import GraphQLJSON from 'graphql-type-json';

import { MetadataResolver } from 'src/engine/api/graphql/graphql-config/decorators/metadata-resolver.decorator';
import { PreventNestToAutoLogGraphqlErrorsFilter } from 'src/engine/core-modules/graphql/filters/prevent-nest-to-auto-log-graphql-errors.filter';
import { ResolverValidationPipe } from 'src/engine/core-modules/graphql/pipes/resolver-validation.pipe';
import { CustomPermissionGuard } from 'src/engine/guards/custom-permission.guard';
import { UserAuthGuard } from 'src/engine/guards/user-auth.guard';
import { WorkspaceAuthGuard } from 'src/engine/guards/workspace-auth.guard';
import { ForecastPreviewInput } from 'src/modules/opportunity/forecasting/forecast-preview.input';
import { ForecastPreviewService } from 'src/modules/opportunity/forecasting/forecast-preview.service';

@MetadataResolver()
@UseGuards(WorkspaceAuthGuard, UserAuthGuard)
@UsePipes(ResolverValidationPipe)
@UseFilters(PreventNestToAutoLogGraphqlErrorsFilter)
export class ForecastPreviewResolver {
  constructor(
    private readonly forecastPreviewService: ForecastPreviewService,
  ) {}

  @Query(() => GraphQLJSON)
  // The service reads only through the current user's native ORM permissions.
  @UseGuards(CustomPermissionGuard)
  async revenueForecastPreview(@Args('input') input: ForecastPreviewInput) {
    return this.forecastPreviewService.preview(input);
  }
}
