import { Module } from '@nestjs/common';

import { ForecastPreviewResolver } from 'src/modules/opportunity/forecasting/forecast-preview.resolver';
import { ForecastPreviewService } from 'src/modules/opportunity/forecasting/forecast-preview.service';

@Module({
  providers: [ForecastPreviewService, ForecastPreviewResolver],
})
export class ForecastPreviewModule {}
