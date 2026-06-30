import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';

export const SITE_PLAN = 'site_plan';
export const FLOOR_PLAN = 'floor_plan';

const VIEW_MODE_KEY = 'viewMode';

const ViewModeContext = createContext({
  viewMode: SITE_PLAN,
  setViewMode: () => {},
  isSitePlan: true,
  isFloorPlan: false,
});

export const ViewModeProvider = ({ children }) => {
  const [viewMode, setViewModeState] = useState(() => {
    try {
      const stored = window.localStorage.getItem(VIEW_MODE_KEY);
      return stored === FLOOR_PLAN ? FLOOR_PLAN : SITE_PLAN;
    } catch {
      return SITE_PLAN;
    }
  });

  const setViewMode = useCallback(mode => {
    const next = mode === FLOOR_PLAN ? FLOOR_PLAN : SITE_PLAN;
    try {
      window.localStorage.setItem(VIEW_MODE_KEY, next);
    } catch {
      // ignore storage errors
    }
    setViewModeState(next);
  }, []);

  const value = useMemo(
    () => ({
      viewMode,
      setViewMode,
      isSitePlan: viewMode === SITE_PLAN,
      isFloorPlan: viewMode === FLOOR_PLAN,
    }),
    [viewMode, setViewMode],
  );

  return (
    <ViewModeContext.Provider value={value}>
      {children}
    </ViewModeContext.Provider>
  );
};

export const useViewMode = () => useContext(ViewModeContext);
