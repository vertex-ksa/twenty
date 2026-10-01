import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  type Relation,
} from 'typeorm';

import { UserWorkspaceEntity } from 'src/engine/core-modules/user-workspace/user-workspace.entity';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { type ForecastPreviewInput } from 'src/modules/opportunity/forecasting/forecast-preview.input';
import { type ForecastPreviewService } from 'src/modules/opportunity/forecasting/forecast-preview.service';

export type SavedForecastContent = {
  schemaVersion: 'native-private-forecast/1';
  calculationVersion: 'exact-micros-category/1';
  canonicalizationVersion: 'sorted-json-keys/1';
  captureKind: 'immutable_copy_of_read_only_preview';
  actor: { workspaceId: string; userWorkspaceId: string; userId: string };
  environment: string;
  creditPolicy: 'current-owner-close-date-won-opportunity';
  policy: ForecastPreviewInput;
  preview: Awaited<ReturnType<ForecastPreviewService['preview']>>;
};

@Entity({ name: 'forecastSnapshot', schema: 'core' })
@Index(
  'IDX_FORECAST_SNAPSHOT_ACTOR_COMMAND',
  ['workspaceId', 'userWorkspaceId', 'userId', 'commandId'],
  { unique: true },
)
export class ForecastSnapshotEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  workspaceId: string;

  @ManyToOne(() => WorkspaceEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspaceId' })
  workspace: Relation<WorkspaceEntity>;

  @Column({ type: 'uuid' })
  userWorkspaceId: string;

  @ManyToOne(() => UserWorkspaceEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userWorkspaceId' })
  userWorkspace: Relation<UserWorkspaceEntity>;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'uuid' })
  commandId: string;

  @Column({ type: 'varchar', length: 64 })
  commandHash: string;

  @Column({ type: 'varchar', length: 64 })
  contentHash: string;

  @Column({ type: 'jsonb' })
  content: SavedForecastContent;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
