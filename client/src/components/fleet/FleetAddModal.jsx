import React, { useState, useEffect, useCallback } from 'react';

const EMPTY_DRONE = {
  identifier: '',
  model: '',
  year: '',
  installDate: '',
  inspectionDate: '',
  inspector: '',
  remoteId: '',
};

const EMPTY_DOCK = {
  identifier: '',
  model: '',
  year: '',
  installDate: '',
  inspectionDate: '',
  inspector: '',
};

const EMPTY_SERVICE_DRONE = {
  identifier: '',
  inspectionDate: '',
  inspector: '',
  remoteId: '',
};

const EMPTY_SERVICE_DOCK = {
  identifier: '',
  inspectionDate: '',
  inspector: '',
};

const isSectionEmpty = fields =>
  Object.values(fields).every(v => v === '' || v === null || v === undefined);

const isSectionComplete = fields =>
  Object.values(fields).every(v => v !== '' && v !== null && v !== undefined);

const FormInput = ({ label, value, onChange, type = 'text', placeholder }) => (
  <label className="form-label" style={{ marginBottom: 'var(--space-sm)' }}>
    {label}
    <input
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className="form-input"
    />
  </label>
);

const SectionLabel = ({ children }) => (
  <p
    style={{
      fontWeight: 600,
      fontSize: '0.9em',
      marginBottom: 'var(--space-xs)',
      marginTop: 'var(--space-sm)',
      color: 'var(--color-text-primary)',
    }}
  >
    {children}
  </p>
);

const Divider = () => (
  <hr
    style={{
      border: 'none',
      borderTop: '1px solid var(--color-border)',
      margin: 'var(--space-md) 0',
    }}
  />
);

const FleetAddModal = ({
  open,
  onClose,
  onSubmit,
  activeDrones,
  activeDocks,
  error,
}) => {
  const [mode, setMode] = useState('install');
  const [droneInstall, setDroneInstall] = useState(EMPTY_DRONE);
  const [dockInstall, setDockInstall] = useState(EMPTY_DOCK);
  const [droneService, setDroneService] = useState(EMPTY_SERVICE_DRONE);
  const [dockService, setDockService] = useState(EMPTY_SERVICE_DOCK);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    if (!open) return;
    setMode('install');
    setDroneInstall(EMPTY_DRONE);
    setDockInstall(EMPTY_DOCK);
    setDroneService(EMPTY_SERVICE_DRONE);
    setDockService(EMPTY_SERVICE_DOCK);
    setFormError('');
  }, [open]);

  const updateDroneInstall = useCallback(
    field => val => setDroneInstall(prev => ({ ...prev, [field]: val })),
    []
  );
  const updateDockInstall = useCallback(
    field => val => setDockInstall(prev => ({ ...prev, [field]: val })),
    []
  );
  const updateDroneService = useCallback(
    field => val => setDroneService(prev => ({ ...prev, [field]: val })),
    []
  );
  const updateDockService = useCallback(
    field => val => setDockService(prev => ({ ...prev, [field]: val })),
    []
  );

  const handleSubmit = e => {
    e.preventDefault();
    setFormError('');

    const droneFields = mode === 'install' ? droneInstall : droneService;
    const dockFields = mode === 'install' ? dockInstall : dockService;

    const droneEmpty = isSectionEmpty(droneFields);
    const dockEmpty = isSectionEmpty(dockFields);
    const droneComplete = isSectionComplete(droneFields);
    const dockComplete = isSectionComplete(dockFields);

    if (droneEmpty && dockEmpty) {
      setFormError('Drone/Dock information incomplete.');
      return;
    }
    if ((!droneEmpty && !droneComplete) || (!dockEmpty && !dockComplete)) {
      setFormError('Drone/Dock information incomplete.');
      return;
    }

    onSubmit({
      mode,
      drone: droneComplete ? droneFields : null,
      dock: dockComplete ? dockFields : null,
    });
  };

  if (!open) return null;

  const displayError = formError || error;

  return (
    <div role="dialog" aria-modal="true" className="modal-overlay">
      <div className="modal-body" style={{ maxWidth: 520, width: '96%', maxHeight: 'calc(100vh - 4rem)', overflowY: 'auto', position: 'relative' }}>
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
        <h3 className="modal-header">Add Drone / Dock</h3>

        {displayError ? (
          <p
            style={{
              color: '#9B4A2F',
              margin: '0 0 var(--space-sm) 0',
              fontSize: '0.9em',
            }}
          >
            {displayError}
          </p>
        ) : null}

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-sm)',
            marginBottom: 'var(--space-md)',
          }}
        >
          <span
            style={{
              fontSize: '0.88em',
              fontWeight: mode === 'install' ? 600 : 400,
              color:
                mode === 'install'
                  ? 'var(--color-text-primary)'
                  : 'var(--color-text-secondary)',
            }}
          >
            Install
          </span>
          <button
            type="button"
            onClick={() => setMode(prev => (prev === 'install' ? 'service' : 'install'))}
            style={{
              position: 'relative',
              width: 44,
              height: 24,
              borderRadius: 12,
              border: '1px solid var(--color-border)',
              background:
                mode === 'service'
                  ? 'var(--color-primary, #1a73e8)'
                  : 'var(--color-surface-secondary)',
              cursor: 'pointer',
              padding: 0,
              transition: 'background 0.2s',
            }}
            aria-label={`Switch to ${mode === 'install' ? 'service' : 'install'} mode`}
          >
            <span
              style={{
                position: 'absolute',
                top: 2,
                left: mode === 'service' ? 20 : 2,
                width: 18,
                height: 18,
                borderRadius: '50%',
                background: '#fff',
                boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                transition: 'left 0.2s',
              }}
            />
          </button>
          <span
            style={{
              fontSize: '0.88em',
              fontWeight: mode === 'service' ? 600 : 400,
              color:
                mode === 'service'
                  ? 'var(--color-text-primary)'
                  : 'var(--color-text-secondary)',
            }}
          >
            Service
          </span>
        </div>

        <form onSubmit={handleSubmit} className="modal-form">
          <SectionLabel>Drones</SectionLabel>

          {mode === 'install' ? (
            <>
              <FormInput
                label="Hardware Identifier"
                value={droneInstall.identifier}
                onChange={updateDroneInstall('identifier')}
              />
              <FormInput
                label="Model"
                value={droneInstall.model}
                onChange={updateDroneInstall('model')}
              />
              <FormInput
                label="Year"
                type="number"
                value={droneInstall.year}
                onChange={updateDroneInstall('year')}
              />
              <FormInput
                label="Install Date"
                value={droneInstall.installDate}
                onChange={updateDroneInstall('installDate')}
                placeholder="MM/DD/YYYY"
              />
              <FormInput
                label="Inspection Date"
                value={droneInstall.inspectionDate}
                onChange={updateDroneInstall('inspectionDate')}
                placeholder="MM/DD/YYYY"
              />
              <FormInput
                label="Inspector"
                value={droneInstall.inspector}
                onChange={updateDroneInstall('inspector')}
              />
              <FormInput
                label="Remote ID"
                value={droneInstall.remoteId}
                onChange={updateDroneInstall('remoteId')}
              />
            </>
          ) : (
            <>
              <label className="form-label" style={{ marginBottom: 'var(--space-sm)' }}>
                Select Drone
                <select
                  value={droneService.identifier}
                  onChange={e =>
                    setDroneService(prev => ({ ...prev, identifier: e.target.value }))
                  }
                  className="form-select"
                >
                  <option value="">— select drone —</option>
                  {(activeDrones || []).map(d => (
                    <option key={d.drone_id} value={d.drone_identifier}>
                      {d.drone_identifier}
                      {d.drone_model ? ` (${d.drone_model})` : ''}
                    </option>
                  ))}
                </select>
              </label>
              <FormInput
                label="Inspection Date"
                value={droneService.inspectionDate}
                onChange={updateDroneService('inspectionDate')}
                placeholder="MM/DD/YYYY"
              />
              <FormInput
                label="Inspector"
                value={droneService.inspector}
                onChange={updateDroneService('inspector')}
              />
              <FormInput
                label="Remote ID"
                value={droneService.remoteId}
                onChange={updateDroneService('remoteId')}
              />
            </>
          )}

          <Divider />
          <SectionLabel>Docks</SectionLabel>

          {mode === 'install' ? (
            <>
              <FormInput
                label="Hardware Identifier"
                value={dockInstall.identifier}
                onChange={updateDockInstall('identifier')}
              />
              <FormInput
                label="Model"
                value={dockInstall.model}
                onChange={updateDockInstall('model')}
              />
              <FormInput
                label="Year"
                type="number"
                value={dockInstall.year}
                onChange={updateDockInstall('year')}
              />
              <FormInput
                label="Install Date"
                value={dockInstall.installDate}
                onChange={updateDockInstall('installDate')}
                placeholder="MM/DD/YYYY"
              />
              <FormInput
                label="Inspection Date"
                value={dockInstall.inspectionDate}
                onChange={updateDockInstall('inspectionDate')}
                placeholder="MM/DD/YYYY"
              />
              <FormInput
                label="Inspector"
                value={dockInstall.inspector}
                onChange={updateDockInstall('inspector')}
              />
            </>
          ) : (
            <>
              <label className="form-label" style={{ marginBottom: 'var(--space-sm)' }}>
                Select Dock
                <select
                  value={dockService.identifier}
                  onChange={e =>
                    setDockService(prev => ({ ...prev, identifier: e.target.value }))
                  }
                  className="form-select"
                >
                  <option value="">— select dock —</option>
                  {(activeDocks || []).map(d => (
                    <option key={d.dock_id} value={d.dock_identifier}>
                      {d.dock_identifier}
                      {d.dock_model ? ` (${d.dock_model})` : ''}
                    </option>
                  ))}
                </select>
              </label>
              <FormInput
                label="Inspection Date"
                value={dockService.inspectionDate}
                onChange={updateDockService('inspectionDate')}
                placeholder="MM/DD/YYYY"
              />
              <FormInput
                label="Inspector"
                value={dockService.inspector}
                onChange={updateDockService('inspector')}
              />
            </>
          )}

          <div className="modal-footer">
            <button type="button" onClick={onClose} className="btn-secondary">
              Cancel
            </button>
            <button type="submit" className="btn-primary">
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default FleetAddModal;
