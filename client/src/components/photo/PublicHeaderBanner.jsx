import React from 'react';
import { formatMonthDayYear } from '../../utils/dateTime';

/**
 * Static banner shared by all public (unauthenticated) photo viewers:
 * non-clickable Swallow logo on the left, contextual project/waypoint/date
 * callouts on the right. No nav, no portal toggle, no links to any other
 * page.
 */
const PublicHeaderBanner = ({ projectName, waypointName, takenAt }) => (
  <header className="App-header">
    <div className="App-header__inner">
      <div className="App-header__left">
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
      </div>
      <div className="App-header__right">
        {projectName ? (
          <div className="header-project-callout" title={projectName}>
            <span className="header-project-callout__label">Project</span>
            <span className="header-project-callout__name">
              {projectName}
            </span>
          </div>
        ) : null}
        {waypointName ? (
          <div className="header-project-callout" title={waypointName}>
            <span className="header-project-callout__label">Waypoint</span>
            <span className="header-project-callout__name">
              {waypointName}
            </span>
          </div>
        ) : null}
        {takenAt ? (
          <div className="header-project-callout">
            <span className="header-project-callout__label">Date</span>
            <span className="header-project-callout__name">
              {formatMonthDayYear(takenAt)}
            </span>
          </div>
        ) : null}
      </div>
    </div>
  </header>
);

export default PublicHeaderBanner;
