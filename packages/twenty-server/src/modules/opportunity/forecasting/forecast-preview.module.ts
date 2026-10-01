import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ForecastSnapshotEntity } from 'src/engine/core-modules/forecast/forecast-snapshot.entity';
import { provideWorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/provide-workspace-scoped-repository';

import { ForecastPreviewResolver } from 'src/modules/opportunity/forecasting/forecast-preview.resolver';
import { ForecastPreviewService } from 'src/modules/opportunity/forecasting/forecast-preview.service';
import { ForecastSnapshotService } from 'src/modules/opportunity/forecasting/forecast-snapshot.service';

@Module({
  imports: [TypeOrmModule.forFeature([ForecastSnapshotEntity])],
  providers: [
    provideWorkspaceScopedRepository(ForecastSnapshotEntity),
    ForecastPreviewService,
    ForecastSnapshotService,
    ForecastPreviewResolver,
  ],
})
export class ForecastPreviewModule {}
