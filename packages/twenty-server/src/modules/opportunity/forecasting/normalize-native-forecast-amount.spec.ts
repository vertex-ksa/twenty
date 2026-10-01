import { normalizeNativeForecastAmount } from 'src/modules/opportunity/forecasting/normalize-native-forecast-amount.util';

describe('Unformatted native forecast amount', () => {
  it.each([
    [0, 0],
    ['0', 0],
    ['11.000', 11],
    ['9007199254740991', Number.MAX_SAFE_INTEGER],
  ])('preserves exact integral micros %s', (source, expected) => {
    expect(normalizeNativeForecastAmount(source, 'SAR')).toEqual({
      amountMicros: expected,
      currencyCode: 'SAR',
    });
  });

  it.each([
    '11.5',
    '9007199254740991.2',
    '9007199254740992',
    '1e3',
    ' 11 ',
    '',
    '-1',
    1.5,
    Number.MAX_SAFE_INTEGER + 1,
    Number.NaN,
    undefined,
  ])('rejects lossy or malformed raw micros %s', (source) => {
    expect(() => normalizeNativeForecastAmount(source, 'SAR')).toThrow();
  });

  it.each(['', null, 'sar', 'SAR1'])(
    'never supplies missing currency %s',
    (currency) => {
      expect(() => normalizeNativeForecastAmount('11', currency)).toThrow();
    },
  );

  it('preserves a missing native amount as an explicit calculator exception', () => {
    expect(normalizeNativeForecastAmount(null, '')).toBeNull();
  });
});
