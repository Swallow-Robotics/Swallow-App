import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context';
import AuthCallbackPage from './AuthCallbackPage';

const DomainCard = ({ to, title, description }) => (
  <Link to={to} className="home-domain-card">
    <span className="home-domain-card__title">{title}</span>
    <span className="home-domain-card__desc">{description}</span>
  </Link>
);

const HomePage = () => {
  const { user } = useAuth();

  if (typeof window !== 'undefined') {
    const hash = window.location.hash || '';
    if (
      hash.includes('access_token=') ||
      hash.includes('refresh_token=') ||
      hash.includes('error=')
    ) {
      return <AuthCallbackPage />;
    }
  }

  // Public / logged-out home: bare-bones coming-soon page with no links
  // into the authenticated app or login/register.
  if (!user) {
    return (
      <div className="home-page">
        <div className="home-page__hero">
          <p className="home-page__subtitle">Website coming soon</p>
        </div>
      </div>
    );
  }

  return (
    <div className="home-page">
      <div className="home-page__hero">
        <h1 className="home-page__title">Swallow Robotics</h1>
        <p className="home-page__subtitle">Flight Operations Platform</p>
      </div>
      <div className="home-page__domains">
        <DomainCard
          to="/view/projects"
          title="View"
          description="Manage projects and explore geo-referenced photos on the map."
        />
        <DomainCard
          to="/plan/projects"
          title="Plan"
          description="Build and review mission plans for your operations."
        />
      </div>
    </div>
  );
};

export default HomePage;
