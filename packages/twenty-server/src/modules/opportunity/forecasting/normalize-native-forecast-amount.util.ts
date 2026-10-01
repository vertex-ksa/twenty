import { type ForecastOpportunity } from 'src/modules/opportunity/forecasting/compute-revenue-forecast.util';

// Ordinary currency result formatting uses parseInt for PostgreSQL numerics.
// Validate the unformatted native value first so fractional micros cannot be
// truncated into a seemingly exact amount. Never infer a missing currency.
export const normalizeNativeForecastAmount = (
  amountMicros: unknown,
  currencyCode: unknown,
): ForecastOpportunity['amount'] => {
  if (amountMicros === null) return null;

  if (typeof currencyCode !== 'string' || !/^[A-Z]{3}$/.test(currencyCode)) {
    throw new Error('Invalid native forecast currency');
  }

  let exactMicros: number;

  if (typeof amountMicros === 'number') {
    exactMicros = amountMicros;
  } else if (
    typeof amountMicros === 'string' &&
    /^(?:0|[1-9]\d*)(?:\.0+)?$/.test(amountMicros)
  ) {
    const integer = BigInt(amountMicros.split('.')[0]);

    if (integer > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new Error('Inexact native forecast amount');
    }

    exactMicros = Number(integer);
  } else {
    throw new Error('Invalid native forecast amount');
  }

  if (!Number.isSafeInteger(exactMicros) || exactMicros < 0) {
    throw new Error('Inexact native forecast amount');
  }

  return { amountMicros: exactMicros, currencyCode };
};
