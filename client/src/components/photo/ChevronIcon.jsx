import React from 'react';

/**
 * Simple stroke chevron used by the Public Link mini-map collapse bar and
 * the waypoint photos modal side controls.
 */
const ChevronIcon = ({ direction = 'down', size = 14 }) => {
  const path =
    direction === 'up'
      ? 'M3 9L7 5L11 9'
      : direction === 'left'
        ? 'M9 3L5 7L9 11'
        : direction === 'right'
          ? 'M5 3L9 7L5 11'
          : 'M3 5L7 9L11 5';

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 14 14"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d={path}
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};

export default ChevronIcon;
