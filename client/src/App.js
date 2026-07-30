import React from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
  Link,
  NavLink,
  useLocation,
} from "react-router-dom";

import "maplibre-gl/dist/maplibre-gl.css";
import "./App.css";
import {
  AuthProvider,
  useAuth,
  ViewModeProvider,
  PortalModeProvider,
  usePortalMode,
} from "./context";
import AuthGuard from "./components/auth/AuthGuard";
import ProfileMenu from "./components/auth/ProfileMenu";
import PageLayout from "./components/layout/PageLayout";
import {
  LoginPage,
  RegisterPage,
  PhotosPage,
  PhotosDatePage,
  ProfilePage,
  ProjectsPage,
  ArchivedProjectsPage,
  ProjectMembersPage,
  DashboardPage,
  SitePage,
} from "./pages";

import PhotoViewerPage from "./pages/PhotoViewerPage";
import PublicProjectView from "./pages/PublicProjectView";
import PublicPhotoViewerPage from "./pages/PublicPhotoViewerPage";
import PublicPhotosLinkViewerPage from "./pages/PublicPhotosLinkViewerPage";
import ConfirmEmailPage from "./pages/ConfirmEmailPage";
import AuthCallbackPage from "./pages/AuthCallbackPage";
import EmailConfirmedPage from "./pages/EmailConfirmedPage";
import PlanProjectsPage from "./pages/PlanProjectsPage";
import PlanTestPage from "./pages/PlanTestPage";
import PlanCreatePage from "./pages/PlanCreatePage";
import PlanEditPage from "./pages/PlanEditPage";
import PlanFleetPage from "./pages/PlanFleetPage";
import PlanSimPage from "./pages/PlanSimPage";
import HomePage from "./pages/HomePage";

const useDomain = () => {
  const location = useLocation();
  const { pathname } = location;
  if (pathname === "/") return "home";
  if (pathname.startsWith("/plan")) return "plan";
  if (pathname.startsWith("/view")) return "view";
  return "none";
};

const headerNavTabClass = ({ isActive }) =>
  `App-header__tab${isActive ? " App-header__tab--active" : ""}`;

const HeaderProjectCallout = ({ projectName }) => (
  <div className="header-project-callout" title={projectName}>
    <span className="header-project-callout__label">Project</span>
    <span className="header-project-callout__name">{projectName}</span>
  </div>
);

const ViewOnlyToggle = () => {
  const { isViewOnly, setViewOnly } = usePortalMode();
  return (
    <div className="view-portal-toggle">
      <span className="view-portal-toggle__label">View Only</span>
      <div className="view-portal-toggle__pills">
        <button
          type="button"
          className={`view-portal-toggle__btn${!isViewOnly ? " view-portal-toggle__btn--active" : ""}`}
          onClick={() => setViewOnly(false)}
        >
          Off
        </button>
        <button
          type="button"
          className={`view-portal-toggle__btn${isViewOnly ? " view-portal-toggle__btn--active" : ""}`}
          onClick={() => setViewOnly(true)}
        >
          On
        </button>
      </div>
    </div>
  );
};

const Header = () => {
  const { user, activeProject } = useAuth();
  const { isViewOnly, isInternalUser } = usePortalMode();
  const activeDomain = useDomain();

  const projectName =
    typeof activeProject === "string" ? "" : activeProject?.project_name || "";
  const hasActiveProject = !!(activeProject?.id || activeProject);

  return (
    <header className="App-header">
      <div className="App-header__inner">
        <div className="App-header__left">
          {isViewOnly ? (
            <span
              className="App-header__logoLink App-header__logoLink--static"
              aria-label="Swallow Robotics"
            >
              <img
                src={`${process.env.PUBLIC_URL}/logo192-white.png`}
                alt="Swallow Robotics"
                className="App-header__logo"
              />
            </span>
          ) : (
            <Link
              to="/"
              className="App-header__logoLink"
              aria-label="Go to Home"
            >
              <img
                src={`${process.env.PUBLIC_URL}/logo192-white.png`}
                alt="Swallow Robotics"
                className="App-header__logo"
              />
            </Link>
          )}
          <div className="App-header__tabs">
            {isViewOnly ? (
              <>
                <NavLink to="/view/projects" className={headerNavTabClass}>
                  Projects
                </NavLink>
                {user && hasActiveProject && (
                  <NavLink to="/view/dashboard" className={headerNavTabClass}>
                    Dashboard
                  </NavLink>
                )}
                {user && hasActiveProject && (
                  <NavLink to="/view/photos" end className={headerNavTabClass}>
                    Photos
                  </NavLink>
                )}
                {user && hasActiveProject && (
                  <NavLink to="/view/site" className={headerNavTabClass}>
                    Site
                  </NavLink>
                )}
              </>
            ) : (
              <>
                <Link
                  to="/view/projects"
                  className={`App-header__tab${activeDomain === "view" ? " App-header__tab--active" : ""}`}
                >
                  View
                </Link>
                <Link
                  to="/plan/projects"
                  className={`App-header__tab${activeDomain === "plan" ? " App-header__tab--active" : ""}`}
                >
                  Plan
                </Link>
              </>
            )}
          </div>
        </div>
        <div className="App-header__right">
          {user && isViewOnly && projectName && (
            <HeaderProjectCallout projectName={projectName} />
          )}
          {user && isInternalUser && <ViewOnlyToggle />}
          {user && <ProfileMenu />}
        </div>
      </div>
    </header>
  );
};

const navLinkClass = ({ isActive }) =>
  isActive ? "App-subnav__link App-subnav__link--active" : "App-subnav__link";

const ViewNav = () => {
  const { user, activeProject } = useAuth();
  const hasActiveProject = !!(activeProject?.id || activeProject);
  const projectName =
    typeof activeProject === "string" ? "" : activeProject?.project_name || "";

  if (!user) return null;

  return (
    <nav className="App-subnav" aria-label="Primary navigation">
      <div className="App-subnav__inner">
        <NavLink to="/view/projects" className={navLinkClass}>
          Projects
        </NavLink>
        {hasActiveProject && (
          <NavLink to="/view/dashboard" className={navLinkClass}>
            Dashboard
          </NavLink>
        )}
        {hasActiveProject && (
          <NavLink to="/view/photos" end className={navLinkClass}>
            Photos
          </NavLink>
        )}
        {hasActiveProject && (
          <NavLink to="/view/site" className={navLinkClass}>
            Site
          </NavLink>
        )}

        {/* Right: active project name */}
        {projectName ? (
          <div className="App-subnav__project" title={projectName}>
            <span className="App-subnav__projectLabel">Project</span>
            <span className="App-subnav__projectName">{projectName}</span>
          </div>
        ) : null}
      </div>
    </nav>
  );
};

const PlanNav = () => {
  const { user, activeProject } = useAuth();
  const hasActiveProject = !!(activeProject?.id || activeProject);
  const projectName =
    typeof activeProject === "string" ? "" : activeProject?.project_name || "";

  if (!user) return null;

  return (
    <nav className="App-subnav" aria-label="Plan navigation">
      <div className="App-subnav__inner">
        <NavLink to="/plan/projects" className={navLinkClass}>
          Projects
        </NavLink>
        {hasActiveProject && (
          <NavLink to="/plan/create" className={navLinkClass}>
            Create
          </NavLink>
        )}
        {hasActiveProject && (
          <NavLink to="/plan/edit" className={navLinkClass}>
            Edit
          </NavLink>
        )}
        {projectName ? (
          <div className="App-subnav__project" title={projectName}>
            <span className="App-subnav__projectLabel">Project</span>
            <span className="App-subnav__projectName">{projectName}</span>
          </div>
        ) : null}
      </div>
    </nav>
  );
};

/**
 * AuthLayout — combines auth protection with the shared page layout frame.
 * Used for all authenticated routes except the full-screen map view.
 */
const AuthLayout = ({ children }) => (
  <AuthGuard>
    <PageLayout>{children}</PageLayout>
  </AuthGuard>
);

/**
 * InternalPortalRoute — redirects external users (or internal users in view-only
 * mode) away from Plan and Fly routes.
 */
const InternalPortalRoute = ({ children }) => {
  const { isInternalUser, isViewOnly } = usePortalMode();
  const { isLoading } = useAuth();
  if (isLoading) return null;
  if (!isInternalUser || isViewOnly)
    return <Navigate to="/view/projects" replace />;
  return children;
};

/**
 * HomeRoute — shows HomePage for internal Swallow portal users.
 * External users and internal users in view-only mode are redirected to /view/projects.
 */
const HomeRoute = () => {
  const { isInternalUser, isViewOnly } = usePortalMode();
  const { isLoading, user } = useAuth();
  if (isLoading) return null;
  if (user && (!isInternalUser || isViewOnly))
    return <Navigate to="/view/projects" replace />;
  return (
    <PageLayout>
      <HomePage />
    </PageLayout>
  );
};

export function AppRoutes() {
  const location = useLocation();
  const activeDomain = useDomain();
  const { isViewOnly } = usePortalMode();

  // The public photo viewers always render their own minimal banner and
  // never the app-wide nav (Header/ViewNav/PlanNav), regardless of the
  // embed param.
  const isPublicPhotoRoute =
    location.pathname.startsWith("/public/photos/") ||
    location.pathname.startsWith("/public/photos-link/");
  const showHeader =
    !isPublicPhotoRoute &&
    !(
      location.pathname.startsWith("/public") &&
      new URLSearchParams(location.search).get("embed") === "1"
    );

  return (
    <div className="App">
      {showHeader && <Header />}
      {showHeader && !isViewOnly && activeDomain === "view" && <ViewNav />}
      {showHeader && !isViewOnly && activeDomain === "plan" && <PlanNav />}

      <main className="App-main">
        <Routes>
          {/* Auth routes */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/check-email" element={<ConfirmEmailPage />} />
          <Route path="/auth/callback" element={<AuthCallbackPage />} />
          <Route path="/email-confirmed" element={<EmailConfirmedPage />} />

          {/* Public routes */}
          <Route path="/public/:token" element={<PublicProjectView />} />
          <Route
            path="/public/photos/:token"
            element={<PublicPhotoViewerPage />}
          />
          <Route
            path="/public/photos-link/:token"
            element={<PublicPhotosLinkViewerPage />}
          />

          {/* Profile (global) */}
          <Route
            path="/profile"
            element={
              <AuthLayout>
                <ProfilePage />
              </AuthLayout>
            }
          />

          {/* View domain — always accessible */}
          <Route path="/view">
            <Route index element={<Navigate to="/view/projects" replace />} />
            <Route
              path="map"
              element={<Navigate to="/view/photos?v=map" replace />}
            />
            <Route
              path="drawings"
              element={<Navigate to="/view/photos" replace />}
            />
            <Route
              path="dashboard"
              element={
                <AuthLayout>
                  <DashboardPage />
                </AuthLayout>
              }
            />
            <Route
              path="photos"
              element={
                <AuthGuard>
                  <PhotosPage />
                </AuthGuard>
              }
            />
            <Route
              path="photos/date/:date"
              element={
                <AuthLayout>
                  <PhotosDatePage />
                </AuthLayout>
              }
            />
            <Route
              path="photos/:id"
              element={
                <AuthGuard>
                  <PhotoViewerPage />
                </AuthGuard>
              }
            />
            <Route
              path="site"
              element={
                <AuthLayout>
                  <SitePage />
                </AuthLayout>
              }
            />
            <Route
              path="weather"
              element={<Navigate to="/view/site" replace />}
            />
            <Route
              path="video"
              element={<Navigate to="/view/site" replace />}
            />
            <Route
              path="projects"
              element={
                <AuthLayout>
                  <ProjectsPage />
                </AuthLayout>
              }
            />
            <Route
              path="projects/archived"
              element={
                <AuthLayout>
                  <ArchivedProjectsPage />
                </AuthLayout>
              }
            />
            <Route
              path="projects/:id/members"
              element={
                <AuthLayout>
                  <ProjectMembersPage />
                </AuthLayout>
              }
            />
          </Route>

          {/* Plan domain — internal Swallow portal only */}
          <Route path="/plan">
            <Route index element={<Navigate to="/plan/projects" replace />} />
            <Route
              path="projects"
              element={
                <InternalPortalRoute>
                  <AuthLayout>
                    <PlanProjectsPage />
                  </AuthLayout>
                </InternalPortalRoute>
              }
            />
            <Route
              path="test"
              element={
                <InternalPortalRoute>
                  <AuthLayout>
                    <PlanTestPage />
                  </AuthLayout>
                </InternalPortalRoute>
              }
            />
            <Route
              path="fleet"
              element={
                <InternalPortalRoute>
                  <AuthLayout>
                    <PlanFleetPage />
                  </AuthLayout>
                </InternalPortalRoute>
              }
            />
            <Route
              path="sim"
              element={
                <InternalPortalRoute>
                  <AuthLayout>
                    <PlanSimPage />
                  </AuthLayout>
                </InternalPortalRoute>
              }
            />
            <Route
              path="create"
              element={
                <InternalPortalRoute>
                  <AuthGuard>
                    <PlanCreatePage />
                  </AuthGuard>
                </InternalPortalRoute>
              }
            />
            <Route
              path="edit"
              element={
                <InternalPortalRoute>
                  <AuthGuard>
                    <PlanEditPage />
                  </AuthGuard>
                </InternalPortalRoute>
              }
            />
          </Route>

          {/* Legacy redirect */}
          <Route
            path="/upload"
            element={<Navigate to="/view/photos" replace />}
          />

          {/* Root — Swallow portal home (internal only) */}
          <Route path="/" element={<HomeRoute />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <PortalModeProvider>
        <ViewModeProvider>
          <Router basename={process.env.PUBLIC_URL || "/"}>
            <AppRoutes />
          </Router>
        </ViewModeProvider>
      </PortalModeProvider>
    </AuthProvider>
  );
}

export default App;
