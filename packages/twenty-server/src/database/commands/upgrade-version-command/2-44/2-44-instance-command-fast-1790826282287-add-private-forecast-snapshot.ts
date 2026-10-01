import { QueryRunner } from 'typeorm';

import { RegisteredInstanceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-instance-command.decorator';
import { FastInstanceCommand } from 'src/engine/core-modules/upgrade/interfaces/fast-instance-command.interface';

@RegisteredInstanceCommand('2.44.0', 1790826282287)
export class AddPrivateForecastSnapshotFastInstanceCommand implements FastInstanceCommand {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE TABLE "core"."forecastSnapshot" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "workspaceId" uuid NOT NULL, "userWorkspaceId" uuid NOT NULL, "userId" uuid NOT NULL, "commandId" uuid NOT NULL, "commandHash" character varying(64) NOT NULL, "contentHash" character varying(64) NOT NULL, "content" jsonb NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_07a175565572b48634bab2edc3d" PRIMARY KEY ("id"))');
    await queryRunner.query('CREATE UNIQUE INDEX "IDX_FORECAST_SNAPSHOT_ACTOR_COMMAND" ON "core"."forecastSnapshot" ("workspaceId", "userWorkspaceId", "userId", "commandId") ');
    await queryRunner.query('ALTER TABLE "core"."forecastSnapshot" ADD CONSTRAINT "FK_823b8c4c58234f7ecd4481308dc" FOREIGN KEY ("workspaceId") REFERENCES "core"."workspace"("id") ON DELETE CASCADE ON UPDATE NO ACTION');
    await queryRunner.query('ALTER TABLE "core"."forecastSnapshot" ADD CONSTRAINT "FK_dddbb9397a3c1000047161f08e8" FOREIGN KEY ("userWorkspaceId") REFERENCES "core"."userWorkspace"("id") ON DELETE CASCADE ON UPDATE NO ACTION');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "core"."forecastSnapshot" DROP CONSTRAINT "FK_dddbb9397a3c1000047161f08e8"');
    await queryRunner.query('ALTER TABLE "core"."forecastSnapshot" DROP CONSTRAINT "FK_823b8c4c58234f7ecd4481308dc"');
    await queryRunner.query('DROP INDEX "core"."IDX_FORECAST_SNAPSHOT_ACTOR_COMMAND"');
    await queryRunner.query('DROP TABLE "core"."forecastSnapshot"');
  }
}
