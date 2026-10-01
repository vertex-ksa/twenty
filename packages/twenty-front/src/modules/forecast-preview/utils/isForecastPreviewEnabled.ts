import { getIsDevelopmentEnvironment } from '~/utils/getIsDevelopmentEnvironment';

export const isForecastPreviewEnabled = () =>
  getIsDevelopmentEnvironment() &&
  process.env.REACT_APP_TM_FORECAST_PREVIEW_ENABLED === 'true';

export const FORECAST_PREVIEW_PATH = '/forecast-preview';
