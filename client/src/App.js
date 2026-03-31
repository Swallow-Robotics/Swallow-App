import React from 'react';
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
  Link,
  NavLink,
  useLocation,
} from 'react-router-dom';
import 'maplibre-gl/dist/maplibre-gl.css';
import './App.css';
import { AuthProvider, useAuth, MavlinkTelemetryProvider } from './context';
import AuthGuard from './components/auth/AuthGuard';
import ProfileMenu from './components/auth/ProfileMenu';
import PageLayout from './components/layout/PageLayout';
import {
  LoginPage,
  RegisterPage,
  MapPage,
  FlyMapPage,
  PlanPage,
  PhotosPage,
  ProfilePage,
  ProjectsPage,
  ArchivedProjectsPage,
  ProjectMembersPage,
  DashboardPage,
} from './pages';
import PhotoOptionsPage from './pages/PhotoOptionsPage';
import PublicProjectView from './pages/PublicProjectView';
import ConfirmEmailPage from './pages/ConfirmEmailPage';
import AuthCallbackPage from './pages/AuthCallbackPage';
import EmailConfirmedPage from './pages/EmailConfirmedPage';
import PlanProjectsPage from './pages/PlanProjectsPage';
import HomePage from './pages/HomePage';

const useDomain = () => {
  const location = useLocation();
  const { pathname } = location;
  if (pathname === '/') return 'home';
  if (pathname.startsWith('/fly')) return 'fly';
  if (pathname.startsWith('/plan')) return 'plan';
  if (pathname.startsWith('/view')) return 'view';
  return 'none';
};

const Header = () => {
  const { user } = useAuth();
  const activeDomain = useDomain();

  return (
    <header className="App-header">
      <div className="App-header__inner">
        <div className="App-header__left">
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
          <div className="App-header__tabs">
            <Link
              to="/view/projects"
              className={`App-header__tab ${activeDomain === 'view' ? 'App-header__tab--active' : ''}`}
            >
              View
            </Link>
            <Link
              to="/plan/projects"
              className={`App-header__tab ${activeDomain === 'plan' ? 'App-header__tab--active' : ''}`}
            >
              Plan
            </Link>
            <Link
              to="/fly"
              className={`App-header__tab ${activeDomain === 'fly' ? 'App-header__tab--active' : ''}`}
            >
              Fly
            </Link>
          </div>
        </div>
        {user && <ProfileMenu />}
      </div>
    </header>
  );
};

const navLinkClass = ({ isActive }) =>
  isActive ? 'App-subnav__link App-subnav__link--active' : 'App-subnav__link';

const ViewNav = () => {
  const { user, activeProject } = useAuth();
  const hasActiveProject = !!(activeProject?.id || activeProject);

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
          <NavLink to="/view/photos" className={navLinkClass}>
            Photos
          </NavLink>
        )}
        <NavLink to="/view/map" className={navLinkClass}>
          Map
        </NavLink>
        {hasActiveProject && (
          <NavLink
            to={`/view/projects/${activeProject?.id || activeProject}/plan`}
            className={navLinkClass}
          >
            Plan
          </NavLink>
        )}
      </div>
    </nav>
  );
};

const PlanNav = () => {
  const { user } = useAuth();

  if (!user) return null;

  return (
    <nav className="App-subnav" aria-label="Plan navigation">
      <div className="App-subnav__inner">
        <NavLink to="/plan/projects" className={navLinkClass}>
          Projects
        </NavLink>
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

export function AppRoutes() {
  const location = useLocation();
  const activeDomain = useDomain();

  const showHeader = !(
    location.pathname.startsWith('/public') &&
    new URLSearchParams(location.search).get('embed') === '1'
  );

  return (
    <div className="App">
      {showHeader && <Header />}
      {showHeader && activeDomain === 'view' && <ViewNav />}
      {showHeader && activeDomain === 'plan' && <PlanNav />}

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

          {/* Profile (global) */}
          <Route
            path="/profile"
            element={
              <AuthLayout>
                <ProfilePage />
              </AuthLayout>
            }
          />

          {/* View domain */}
          <Route path="/view">
            <Route
              index
              element={<Navigate to="/view/projects" replace />}
            />
            <Route
              path="map"
              element={
                <AuthGuard>
                  <MapPage />
                </AuthGuard>
              }
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
                <AuthLayout>
                  <PhotosPage />
                </AuthLayout>
              }
            />
            <Route
              path="photos/:id/options"
              element={
                <AuthLayout>
                  <PhotoOptionsPage />
                </AuthLayout>
              }
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
            <Route
              path="projects/:id/plan"
              element={
                <AuthGuard>
                  <PlanPage />
                </AuthGuard>
              }
            />
          </Route>

          {/* Fly domain */}
          <Route
            path="/fly"
            element={
              <AuthGuard>
                <FlyMapPage />
              </AuthGuard>
            }
          />

          {/* Plan domain */}
          <Route path="/plan">
            <Route
              index
              element={<Navigate to="/plan/projects" replace />}
            />
            <Route
              path="projects"
              element={
                <AuthLayout>
                  <PlanProjectsPage />
                </AuthLayout>
              }
            />
          </Route>

          {/* Legacy redirect */}
          <Route path="/upload" element={<Navigate to="/view/photos" replace />} />

          {/* Root and catch-all */}
          <Route
            path="/"
            element={
              <PageLayout>
                <HomePage />
              </PageLayout>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <MavlinkTelemetryProvider>
        <Router basename={process.env.PUBLIC_URL || '/'}>
          <AppRoutes />
        </Router>
      </MavlinkTelemetryProvider>
    </AuthProvider>
  );
}

export default App;
