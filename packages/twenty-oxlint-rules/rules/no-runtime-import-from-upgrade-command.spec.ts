import { RuleTester } from 'oxlint/plugins-dev';

import { rule, RULE_NAME } from './no-runtime-import-from-upgrade-command';

const ruleTester = new RuleTester();

const SERVER = '/project/packages/twenty-server';
const COMMAND_IMPORT =
  "import { run } from 'src/database/commands/upgrade-version-command/2-42/utils/run.util';";

ruleTester.run(RULE_NAME, rule, {
  valid: [
    {
      code: COMMAND_IMPORT,
      filename:
        'D:\\project\\packages\\twenty-server\\src\\database\\commands\\upgrade-version-command\\instance-commands.constant.ts',
    },
    {
      code: COMMAND_IMPORT,
      filename:
        'D:\\project\\packages\\twenty-server\\src\\engine\\core-modules\\upgrade\\services\\upgrade-sequence-runner.service.ts',
    },
    {
      code: "import { NAME } from 'src/database/commands/upgrade-version-command/2-42/2-42-upgrade-command-name.constant';",
      filename: `${SERVER}/src/engine/core-modules/foo/foo.service.ts`,
    },
    {
      code: "import { NAMES } from 'src/database/commands/upgrade-version-command/2-42/2-42-upgrade-command-name.constants';",
      filename: `${SERVER}/src/engine/core-modules/foo/foo.service.ts`,
    },
    {
      code: "import { FooService } from 'src/engine/core-modules/foo/foo.service';",
      filename: `${SERVER}/src/engine/core-modules/bar/bar.service.ts`,
    },
    {
      code: COMMAND_IMPORT,
      filename: `${SERVER}/src/database/commands/upgrade-version-command/2-43/2-43-upgrade-version-command.module.ts`,
    },
    {
      code: COMMAND_IMPORT,
      filename: `${SERVER}/src/engine/core-modules/upgrade/services/upgrade-sequence-runner.service.ts`,
    },
    {
      code: COMMAND_IMPORT,
      filename: `${SERVER}/src/engine/core-modules/foo/foo.service.spec.ts`,
    },
    {
      code: COMMAND_IMPORT,
      filename: `${SERVER}/src/engine/core-modules/foo/__tests__/foo.util.ts`,
    },
    {
      code: COMMAND_IMPORT,
      filename: `${SERVER}/test/integration/upgrade/suites/foo.integration-spec.ts`,
    },
  ],
  invalid: [
    {
      code: COMMAND_IMPORT,
      filename:
        'D:\\project\\packages\\twenty-server\\src\\engine\\core-modules\\foo\\foo.service.ts',
      errors: [{ messageId: 'noRuntimeImportFromUpgradeCommand' }],
    },
    {
      code: COMMAND_IMPORT,
      filename: `${SERVER}/src/engine/core-modules/foo/foo.service.ts`,
      errors: [{ messageId: 'noRuntimeImportFromUpgradeCommand' }],
    },
    {
      code: "export { run } from 'src/database/commands/upgrade-version-command/2-42/utils/run.util';",
      filename: `${SERVER}/src/engine/core-modules/foo/index.ts`,
      errors: [{ messageId: 'noRuntimeImportFromUpgradeCommand' }],
    },
    {
      code: "const load = () => import('src/database/commands/upgrade-version-command/2-42/utils/run.util');",
      filename: `${SERVER}/src/engine/core-modules/foo/foo.service.ts`,
      errors: [{ messageId: 'noRuntimeImportFromUpgradeCommand' }],
    },
  ],
});
