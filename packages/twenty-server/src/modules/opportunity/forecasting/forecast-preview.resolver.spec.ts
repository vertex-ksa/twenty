import {
  GraphQLSchemaBuilderModule,
  GraphQLSchemaFactory,
} from '@nestjs/graphql';
import { Test } from '@nestjs/testing';

import { printSchema } from 'graphql';

import { ForecastPreviewResolver } from 'src/modules/opportunity/forecasting/forecast-preview.resolver';

jest.mock('src/engine/twenty-orm/workspace-orm.manager', () => ({
  WorkspaceOrmManager: jest.fn(),
}));

// Builds real Nest GraphQL metadata. This does not stand in for an authenticated
// native server/DB request or a permission conformance test.
describe('Forecast preview native GraphQL schema', () => {
  beforeAll(() => jest.useRealTimers());

  it('registers the bounded input and string category with the native schema factory', async () => {
    const module = await Test.createTestingModule({
      imports: [GraphQLSchemaBuilderModule],
    }).compile();

    try {
      const factory = module.get(GraphQLSchemaFactory);
      const schema = await factory.create([ForecastPreviewResolver]);
      const printed = printSchema(schema);

      expect(printed).toContain(
        'revenueForecastPreview(input: ForecastPreviewInput!): JSON!',
      );
      expect(printed).toContain('category: String!');
      expect(printed).toContain('probabilityBasisPoints: Int!');
      expect(printed).toContain('ownerIds: [String!]!');
      expect(printed).toContain('revenueForecastSnapshots: JSON!');
      expect(printed).toContain('revenueForecastSnapshot(id: String!): JSON!');
      expect(printed).toContain(
        'saveRevenueForecastSnapshot(input: SaveForecastSnapshotInput!): JSON!',
      );
    } finally {
      await module.close();
    }
  });
});
