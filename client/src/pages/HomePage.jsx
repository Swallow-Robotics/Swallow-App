import React from 'react';
import { Link } from 'react-router-dom';
import AuthCallbackPage from './AuthCallbackPage';

const DomainCard = ({ to, title, description }) => (
  <Link to={to} className="home-domain-card">
    <span className="home-domain-card__title">{title}</span>
    <span className="home-domain-card__desc">{description}</span>
  </Link>
);

const HomePage = () => {
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
        <DomainCard
          to="/fly"
          title="Fly"
          description="Live flight operations with real-time telemetry."
        />
      </div>
    </div>
  );
};

export default HomePage;
