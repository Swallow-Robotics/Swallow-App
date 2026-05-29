import React, { useEffect, useRef, useState } from 'react';
import {
  TIME_ZONES,
  toUtcIso,
  utcIsoToLocalFields,
} from '../../utils/dateTime';

const DEFAULT_TZ = 'America/New_York';

/**
 * Barn Swallow datetime input: MM/DD/YYYY, HH:MM:SS, AM/PM and timezone.
 * Emits a UTC ISO string (or null) through onChange.
 */
const DateTimePicker = ({ value, onChange, compact = false }) => {
  const [tz, setTz] = useState(DEFAULT_TZ);
  const [fields, setFields] = useState({ date: '', time: '', amPm: 'AM' });
  const lastEmitted = useRef(value || null);

  useEffect(() => {
    if (value && value !== lastEmitted.current) {
      setFields(utcIsoToLocalFields(value, tz));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const emit = next => {
    const iso = toUtcIso(next.date, next.time, next.amPm, tz);
    lastEmitted.current = iso;
    if (onChange) onChange(iso);
  };

  const update = (field, val) => {
    const next = { ...fields, [field]: val };
    setFields(next);
    emit(next);
  };

  const inputStyle = { padding: compact ? '2px 4px' : undefined };

  return (
    <div
      style={{
        display: 'flex',
        gap: 'var(--space-xs)',
        flexWrap: 'wrap',
        alignItems: 'center',
      }}
    >
      <input
        type="text"
        value={fields.date}
        onChange={e => update('date', e.target.value)}
        placeholder="MM/DD/YYYY"
        className="form-input"
        style={{ ...inputStyle, flex: '1 1 96px', minWidth: 92 }}
      />
      <input
        type="text"
        value={fields.time}
        onChange={e => update('time', e.target.value)}
        placeholder="HH:MM:SS"
        className="form-input"
        style={{ ...inputStyle, flex: '1 1 80px', minWidth: 78 }}
      />
      <select
        value={fields.amPm}
        onChange={e => update('amPm', e.target.value)}
        className="form-select"
        style={{ ...inputStyle, flex: '0 0 auto' }}
      >
        <option value="AM">AM</option>
        <option value="PM">PM</option>
      </select>
      <select
        value={tz}
        onChange={e => {
          setTz(e.target.value);
          const iso = toUtcIso(
            fields.date,
            fields.time,
            fields.amPm,
            e.target.value,
          );
          lastEmitted.current = iso;
          if (onChange) onChange(iso);
        }}
        className="form-select"
        style={{ ...inputStyle, flex: '0 0 auto' }}
      >
        {TIME_ZONES.map(zone => (
          <option key={zone.value} value={zone.value}>
            {zone.label}
          </option>
        ))}
      </select>
    </div>
  );
};

export default DateTimePicker;
