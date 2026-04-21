import React from 'react';
import { useNavigate } from 'react-router-dom';

const PlanTestPage = () => {
  const navigate = useNavigate();

  return (
    <div className="page-container">
      <div className="page-content">
        <div className="page-header">
          <div className="page-header__left">
            <button
              type="button"
              onClick={() => navigate('/plan/projects')}
              className="btn-secondary"
            >
              ← Back
            </button>
          </div>
          <div className="page-header__center">
            <h2 className="page-header__title">Plan Test</h2>
          </div>
          <div className="page-header__right" />
        </div>
      </div>
    </div>
  );
};

export default PlanTestPage;
