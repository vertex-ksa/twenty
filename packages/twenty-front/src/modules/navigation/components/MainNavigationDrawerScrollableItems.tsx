import { NavigationDrawerOpenedSection } from '@/navigation-menu-item/display/sections/components/NavigationDrawerOpenedSection';
import { NavigationDrawerWorkspaceSectionSkeletonLoader } from '@/object-metadata/components/NavigationDrawerWorkspaceSectionSkeletonLoader';

import { styled } from '@linaria/react';
import { lazy, Suspense } from 'react';

import { themeCssVariables } from 'twenty-ui/theme';
import { useLocation } from 'react-router-dom';
import { useLingui } from '@lingui/react';
import { NavigationDrawerItem } from '@/ui/navigation/navigation-drawer/components/NavigationDrawerItem';
import {
  FORECAST_PREVIEW_PATH,
  isForecastPreviewEnabled,
} from '@/forecast-preview/utils/isForecastPreviewEnabled';
import { forecastPreviewMessages } from '@/forecast-preview/forecastPreviewMessages';

const FavoritesSectionDispatcher = lazy(() =>
  import('@/navigation-menu-item/display/sections/favorites/components/FavoritesSectionDispatcher').then(
    (module) => ({
      default: module.FavoritesSectionDispatcher,
    }),
  ),
);

const WorkspaceSectionDispatcher = lazy(() =>
  import('@/navigation-menu-item/display/sections/workspace/components/WorkspaceSectionDispatcher').then(
    (module) => ({
      default: module.WorkspaceSectionDispatcher,
    }),
  ),
);

const StyledScrollableItemsContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[3]};
`;

export const MainNavigationDrawerScrollableItems = () => {
  const location = useLocation();
  const { i18n } = useLingui();
  return (
    <StyledScrollableItemsContainer>
      {isForecastPreviewEnabled() && (
        <NavigationDrawerItem
          label={i18n._(forecastPreviewMessages.title)}
          to={FORECAST_PREVIEW_PATH}
          active={location.pathname === FORECAST_PREVIEW_PATH}
        />
      )}
      <NavigationDrawerOpenedSection />
      <Suspense fallback={<NavigationDrawerWorkspaceSectionSkeletonLoader />}>
        <FavoritesSectionDispatcher />
        <WorkspaceSectionDispatcher />
      </Suspense>
    </StyledScrollableItemsContainer>
  );
};
