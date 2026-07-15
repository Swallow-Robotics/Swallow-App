import React from 'react';
import { formatFieldValue } from './weatherFields';

const WeatherMetricTile = ({ field, rawValue, onClick }) => (
  <div
    className="surface-card"
    role="button"
    tabIndex={0}
    onClick={onClick}
    onKeyDown={e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onClick();
      }
    }}
    style={{
      textAlign: 'center',
      cursor: 'pointer',
      transition: 'box-shadow 150ms ease, transform 150ms ease',
    }}
    onMouseEnter={e => {
      e.currentTarget.style.boxShadow = 'var(--shadow-md)';
      e.currentTarget.style.transform = 'translateY(-1px)';
    }}
    onMouseLeave={e => {
      e.currentTarget.style.boxShadow = '';
      e.currentTarget.style.transform = '';
    }}
    title="Click to see history"
  >
    <div
      style={{
        fontSize: 'var(--font-size-2xl)',
        fontWeight: 'var(--font-weight-bold)',
        color: 'var(--color-primary)',
        lineHeight: 1,
        marginBottom: 'var(--space-xs)',
      }}
    >
      {formatFieldValue(field, rawValue)}
    </div>
    <div
      style={{
        fontSize: 'var(--font-size-sm)',
        fontWeight: 'var(--font-weight-semibold)',
        color: 'var(--color-text-secondary)',
        textTransform: 'uppercase',
        letterSpacing: 'var(--letter-spacing-wide)',
      }}
    >
      {field.label}
    </div>
  </div>
);

export default WeatherMetricTile;
