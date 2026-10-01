import { Field, InputType, Int } from '@nestjs/graphql';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsInt,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

import { type ForecastCategory } from 'src/modules/opportunity/forecasting/compute-revenue-forecast.util';

@InputType()
export class ForecastStagePreviewInput {
  @Field()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  stage: string;

  @Field(() => String)
  @IsIn(['pipeline', 'bestCase', 'commit', 'won', 'lost', 'excluded'])
  category: ForecastCategory;

  @Field(() => Int)
  @IsInt()
  @Min(0)
  @Max(10000)
  probabilityBasisPoints: number;
}

@InputType()
export class ForecastPreviewInput {
  @Field()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  policyVersion: string;

  @Field()
  @IsString()
  @MaxLength(30)
  startAt: string;

  @Field()
  @IsString()
  @MaxLength(30)
  endAt: string;

  @Field(() => [String])
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  ownerIds: string[];

  @Field(() => [ForecastStagePreviewInput])
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(64)
  @ValidateNested({ each: true })
  @Type(() => ForecastStagePreviewInput)
  stages: ForecastStagePreviewInput[];
}
