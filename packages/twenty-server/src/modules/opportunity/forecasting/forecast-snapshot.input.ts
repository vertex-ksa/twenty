import { Field, InputType } from '@nestjs/graphql';

import { Type } from 'class-transformer';
import { IsUUID, ValidateNested } from 'class-validator';

import { ForecastPreviewInput } from 'src/modules/opportunity/forecasting/forecast-preview.input';

@InputType()
export class SaveForecastSnapshotInput {
  @Field()
  @IsUUID('4')
  commandId: string;

  @Field(() => ForecastPreviewInput)
  @ValidateNested()
  @Type(() => ForecastPreviewInput)
  policy: ForecastPreviewInput;
}
