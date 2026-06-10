import React, { useState, useEffect, useCallback } from 'react';
import apiClient from '../../services/api';

const TIMEZONES = [
  { label: 'ET', value: 'America/New_York' },
  { label: 'CT', value: 'America/Chicago' },
  { label: 'MT', value: 'America/Denver' },
  { label: 'PT', value: 'America/Los_Angeles' },
  { label: 'AKT', value: 'America/Anchorage' },
  { label: 'HT', value: 'Pacific/Honolulu' },
  { label: 'UTC', value: 'UTC' },
];

const FLIGHT_STATUSES = ['completed', 'aborted', 'failed', 'queued', 'running'];

const FAILURE_DESCS = [
  'Return home activated',
  'signal failure',
  'motor failure',
  'power failure',
];

const EMPTY_PLAN_FORM = {
  droneId: '',
  dockId: '',
  pilotId: '',
  planId: '',
  airspaceAuthorization: '',
  visualObserver: '',
};

const EMPTY_FLY_FORM = {
  windSpeed: '',
  windDirection: '',
  visibility: '',
  temperature: '',
  takeoffDate: '',
  takeoffTime: '',
  takeoffAmPm: 'AM',
  takeoffTz: 'America/New_York',
  landingDate: '',
  landingTime: '',
  landingAmPm: 'AM',
  landingTz: 'America/New_York',
  voVlos: '',
  flightStatus: '',
  flightStatusDesc: '',
};

const FormLabel = ({ label, children }) => (
  <label className="form-label" style={{ marginBottom: 'var(--space-sm)' }}>
    {label}
    {children}
  </label>
);

const FormInput = ({ label, value, onChange, type = 'text', placeholder, min }) => (
  <FormLabel label={label}>
    <input
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      min={min}
      className="form-input"
    />
  </FormLabel>
);

const FormSelect = ({ label, value, onChange, children }) => (
  <FormLabel label={label}>
    <select value={value} onChange={e => onChange(e.target.value)} className="form-select">
      {children}
    </select>
  </FormLabel>
);

const toUtcIso = (dateStr, timeStr, amPm, tz) => {
  if (!dateStr || !timeStr) return null;
  const [month, day, year] = dateStr.split('/');
  if (!month || !day || !year) return null;
  const timeParts = timeStr.split(':');
  if (timeParts.length < 2) return null;
  const [rawHour, minute, second = '00'] = timeParts;
  let hour = parseInt(rawHour, 10);
  if (amPm === 'PM' && hour !== 12) hour += 12;
  if (amPm === 'AM' && hour === 12) hour = 0;
  const localStr = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${String(hour).padStart(2, '0')}:${minute.padStart(2, '0')}:${second.padStart(2, '0')}`;
  try {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
    const parts = fmt.formatToParts(new Date(localStr));
    const get = t => parts.find(p => p.type === t)?.value ?? '00';
    const utcDate = new Date(
      `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}`
    );
    const offsetMs = utcDate - new Date(localStr);
    return new Date(new Date(localStr) - offsetMs).toISOString();
  } catch {
    return null;
  }
};

const isPlanComplete = f =>
  f.pilotId && f.planId && f.airspaceAuthorization && f.visualObserver;

const isFlyComplete = f => {
  const base =
    f.windSpeed !== '' &&
    f.windDirection !== '' &&
    f.visibility !== '' &&
    f.temperature !== '' &&
    f.takeoffDate &&
    f.takeoffTime &&
    f.landingDate &&
    f.landingTime &&
    f.voVlos !== '' &&
    f.flightStatus !== '';
  if (!base) return false;
  if (f.flightStatus === 'failed' && !f.flightStatusDesc) return false;
  return true;
};

const SimulateFlightModal = ({ open, projectId, onClose, onSubmit, error }) => {
  const [part, setPart] = useState('plan');
  const [planForm, setPlanForm] = useState(EMPTY_PLAN_FORM);
  const [flyForm, setFlyForm] = useState(EMPTY_FLY_FORM);
  const [formError, setFormError] = useState('');
  const [options, setOptions] = useState({ drones: [], docks: [], pilots: [], plans: [] });
  const [optionsLoading, setOptionsLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPart('plan');
    setPlanForm(EMPTY_PLAN_FORM);
    setFlyForm(EMPTY_FLY_FORM);
    setFormError('');
  }, [open]);

  useEffect(() => {
    if (!open || !projectId) return;
    setOptionsLoading(true);
    apiClient
      .get(`/v1/flights/options?project_id=${projectId}`)
      .then(resp => setOptions(resp || { drones: [], docks: [], pilots: [], plans: [] }))
      .catch(() => setOptions({ drones: [], docks: [], pilots: [], plans: [] }))
      .finally(() => setOptionsLoading(false));
  }, [open, projectId]);

  const updatePlan = useCallback(field => val => setPlanForm(prev => ({ ...prev, [field]: val })), []);
  const updateFly = useCallback(field => val => setFlyForm(prev => ({ ...prev, [field]: val })), []);

  const handleNext = e => {
    e.preventDefault();
    setFormError('');
    if (!isPlanComplete(planForm)) {
      setFormError('All Plan fields are required.');
      return;
    }
    setPart('fly');
  };

  const handleSave = e => {
    e.preventDefault();
    setFormError('');
    if (!isFlyComplete(flyForm)) {
      setFormError('All Fly fields are required.');
      return;
    }
    const takeoffUtc = toUtcIso(flyForm.takeoffDate, flyForm.takeoffTime, flyForm.takeoffAmPm, flyForm.takeoffTz);
    const landingUtc = toUtcIso(flyForm.landingDate, flyForm.landingTime, flyForm.landingAmPm, flyForm.landingTz);
    if (!takeoffUtc || !landingUtc) {
      setFormError('Invalid date/time format. Use MM/DD/YYYY and HH:MM.');
      return;
    }
    onSubmit({
      project_id: projectId,
      drone_id: planForm.droneId || null,
      dock_id: planForm.dockId || null,
      pilot_id: planForm.pilotId,
      plan_id: planForm.planId,
      airspace_authorization: planForm.airspaceAuthorization,
      visual_observer: planForm.visualObserver,
      wind_speed: flyForm.windSpeed,
      wind_direction: flyForm.windDirection,
      visibility: flyForm.visibility,
      temperature: flyForm.temperature,
      takeoff_time: takeoffUtc,
      landing_time: landingUtc,
      vo_confirmed_vlos: flyForm.voVlos === 'true',
      flight_status: flyForm.flightStatus,
      flight_status_desc: flyForm.flightStatus === 'failed' ? flyForm.flightStatusDesc : null,
    });
  };

  if (!open) return null;

  const displayError = formError || error;

  return (
    <div role="dialog" aria-modal="true" className="modal-overlay">
      <div
        className="modal-body"
        style={{
          maxWidth: 520,
          width: '96%',
          maxHeight: 'calc(100vh - 4rem)',
          overflowY: 'auto',
          position: 'relative',
        }}
      >
        <button
          type="button"
          onClick={onClose}
          style={{
            position: 'absolute',
            top: 'var(--space-sm)',
            right: 'var(--space-sm)',
            background: 'none',
            border: 'none',
            fontSize: '1.2em',
            cursor: 'pointer',
            color: 'var(--color-text-secondary)',
            lineHeight: 1,
          }}
          aria-label="Close modal"
        >
          ✕
        </button>

        <h3 className="modal-header">Simulate Flight</h3>

        <p
          style={{
            fontSize: '0.82em',
            color: 'var(--color-text-secondary)',
            marginBottom: 'var(--space-md)',
            marginTop: 0,
          }}
        >
          {part === 'plan' ? 'Step 1 of 2 — Plan' : 'Step 2 of 2 — Fly'}
        </p>

        {displayError ? (
          <p style={{ color: '#9B4A2F', margin: '0 0 var(--space-sm) 0', fontSize: '0.9em' }}>
            {displayError}
          </p>
        ) : null}

        {optionsLoading ? (
          <p style={{ color: 'var(--color-text-secondary)' }}>Loading options...</p>
        ) : part === 'plan' ? (
          <form onSubmit={handleNext} className="modal-form">
            <FormSelect label="Drone" value={planForm.droneId} onChange={updatePlan('droneId')}>
              <option value="">— select drone —</option>
              {options.drones.map(d => (
                <option key={d.drone_id} value={d.drone_id}>
                  {d.drone_identifier}
                </option>
              ))}
            </FormSelect>

            <FormSelect label="Dock" value={planForm.dockId} onChange={updatePlan('dockId')}>
              <option value="">— select dock —</option>
              {options.docks.map(d => (
                <option key={d.dock_id} value={d.dock_id}>
                  {d.dock_identifier}
                </option>
              ))}
            </FormSelect>

            <FormSelect label="Pilot" value={planForm.pilotId} onChange={updatePlan('pilotId')}>
              <option value="">— select pilot —</option>
              {options.pilots.map(p => (
                <option key={p.pilot_id} value={p.pilot_id}>
                  {p.pilot_name}
                </option>
              ))}
            </FormSelect>

            <FormSelect label="Plan" value={planForm.planId} onChange={updatePlan('planId')}>
              <option value="">— select plan —</option>
              {options.plans.map(p => (
                <option key={p.plan_id} value={p.plan_id}>
                  {p.plan_name}
                </option>
              ))}
            </FormSelect>

            <FormInput
              label="Airspace Authorization"
              value={planForm.airspaceAuthorization}
              onChange={updatePlan('airspaceAuthorization')}
              placeholder="Authorization number or N/A"
            />

            <FormInput
              label="Visual Observer"
              value={planForm.visualObserver}
              onChange={updatePlan('visualObserver')}
              placeholder="Full name"
            />

            <div className="modal-footer">
              <button type="button" onClick={onClose} className="btn-secondary">
                Cancel
              </button>
              <button type="submit" className="btn-primary">
                Next
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleSave} className="modal-form">
            <FormInput
              label="Wind Speed (mph)"
              type="number"
              value={flyForm.windSpeed}
              onChange={updateFly('windSpeed')}
              min="0"
            />

            <FormInput
              label="Wind Direction (deg)"
              type="number"
              value={flyForm.windDirection}
              onChange={updateFly('windDirection')}
              min="0"
            />

            <FormInput
              label="Visibility (sm)"
              type="number"
              value={flyForm.visibility}
              onChange={updateFly('visibility')}
              min="0"
            />

            <FormInput
              label="Temperature (deg F)"
              type="number"
              value={flyForm.temperature}
              onChange={updateFly('temperature')}
            />

            <FormLabel label="Takeoff">
              <div style={{ display: 'flex', gap: 'var(--space-xs)', flexWrap: 'wrap' }}>
                <input
                  type="text"
                  value={flyForm.takeoffDate}
                  onChange={e => updateFly('takeoffDate')(e.target.value)}
                  placeholder="MM/DD/YYYY"
                  className="form-input"
                  style={{ flex: '1 1 120px' }}
                />
                <input
                  type="text"
                  value={flyForm.takeoffTime}
                  onChange={e => updateFly('takeoffTime')(e.target.value)}
                  placeholder="HH:MM:SS"
                  className="form-input"
                  style={{ flex: '1 1 80px' }}
                />
                <select
                  value={flyForm.takeoffAmPm}
                  onChange={e => updateFly('takeoffAmPm')(e.target.value)}
                  className="form-select"
                  style={{ flex: '0 0 auto' }}
                >
                  <option value="AM">AM</option>
                  <option value="PM">PM</option>
                </select>
                <select
                  value={flyForm.takeoffTz}
                  onChange={e => updateFly('takeoffTz')(e.target.value)}
                  className="form-select"
                  style={{ flex: '0 0 auto' }}
                >
                  {TIMEZONES.map(tz => (
                    <option key={tz.value} value={tz.value}>
                      {tz.label}
                    </option>
                  ))}
                </select>
              </div>
            </FormLabel>

            <FormLabel label="Landing">
              <div style={{ display: 'flex', gap: 'var(--space-xs)', flexWrap: 'wrap' }}>
                <input
                  type="text"
                  value={flyForm.landingDate}
                  onChange={e => updateFly('landingDate')(e.target.value)}
                  placeholder="MM/DD/YYYY"
                  className="form-input"
                  style={{ flex: '1 1 120px' }}
                />
                <input
                  type="text"
                  value={flyForm.landingTime}
                  onChange={e => updateFly('landingTime')(e.target.value)}
                  placeholder="HH:MM:SS"
                  className="form-input"
                  style={{ flex: '1 1 80px' }}
                />
                <select
                  value={flyForm.landingAmPm}
                  onChange={e => updateFly('landingAmPm')(e.target.value)}
                  className="form-select"
                  style={{ flex: '0 0 auto' }}
                >
                  <option value="AM">AM</option>
                  <option value="PM">PM</option>
                </select>
                <select
                  value={flyForm.landingTz}
                  onChange={e => updateFly('landingTz')(e.target.value)}
                  className="form-select"
                  style={{ flex: '0 0 auto' }}
                >
                  {TIMEZONES.map(tz => (
                    <option key={tz.value} value={tz.value}>
                      {tz.label}
                    </option>
                  ))}
                </select>
              </div>
            </FormLabel>

            <FormSelect label="VO VLOS" value={flyForm.voVlos} onChange={updateFly('voVlos')}>
              <option value="">— select —</option>
              <option value="true">True</option>
              <option value="false">False</option>
            </FormSelect>

            <FormSelect
              label="Flight Status"
              value={flyForm.flightStatus}
              onChange={updateFly('flightStatus')}
            >
              <option value="">— select status —</option>
              {FLIGHT_STATUSES.map(s => (
                <option key={s} value={s}>
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </option>
              ))}
            </FormSelect>

            {flyForm.flightStatus === 'failed' ? (
              <FormSelect
                label="Failure Description"
                value={flyForm.flightStatusDesc}
                onChange={updateFly('flightStatusDesc')}
              >
                <option value="">— select description —</option>
                {FAILURE_DESCS.map(d => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </FormSelect>
            ) : null}

            <div className="modal-footer">
              <button
                type="button"
                onClick={() => {
                  setFormError('');
                  setPart('plan');
                }}
                className="btn-secondary"
                style={{ marginRight: 'auto' }}
              >
                ← Back
              </button>
              <button type="button" onClick={onClose} className="btn-secondary">
                Cancel
              </button>
              <button type="submit" className="btn-primary">
                Save
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default SimulateFlightModal;
