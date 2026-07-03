import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import { useAuth } from "./AuthContext";

const SWALLOW_ORG_ID = "ec641382-342b-4abd-b16a-fcedde5171e3";
const STORAGE_KEY = "portalViewOnly";

const readStoredViewOnly = () => {
  try {
    const val = window.localStorage.getItem(STORAGE_KEY);
    if (val === "false") return false;
  } catch {
    // ignore
  }
  return true;
};

const persistViewOnly = (value) => {
  try {
    window.localStorage.setItem(STORAGE_KEY, String(value));
  } catch {
    // ignore
  }
};

export const PortalModeContext = createContext({
  isInternalUser: false,
  isViewOnly: true,
  setViewOnly: () => {},
});

export const PortalModeProvider = ({ children }) => {
  const { profile } = useAuth();
  const [viewOnlyOverride, setViewOnlyOverride] = useState(readStoredViewOnly);

  // Default to external (false) while profile is loading so the view-only portal
  // is shown immediately with no flicker. Once profile loads, true = Swallow org.
  const isInternalUser = profile ? profile.orgId === SWALLOW_ORG_ID : false;

  // External users are always in view-only; internal users can toggle
  const isViewOnly = isInternalUser ? viewOnlyOverride : true;

  const setViewOnly = useCallback(
    (value) => {
      if (isInternalUser) {
        persistViewOnly(value);
        setViewOnlyOverride(value);
      }
    },
    [isInternalUser],
  );

  const value = useMemo(
    () => ({ isInternalUser, isViewOnly, setViewOnly }),
    [isInternalUser, isViewOnly, setViewOnly],
  );

  return (
    <PortalModeContext.Provider value={value}>
      {children}
    </PortalModeContext.Provider>
  );
};

export const usePortalMode = () => useContext(PortalModeContext);
