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

const EMPTY_BASE_STATION = {
  serialNumber: '',
  name: '',
  model: '',
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

const EMPTY_SERVICE_BASE_STATION = {
  serialNumber: '',
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
  activeBaseStations,
  error,
}) => {
  const [mode, setMode] = useState('install');
  const [droneInstall, setDroneInstall] = useState(EMPTY_DRONE);
  const [baseStationInstall, setBaseStationInstall] = useState(EMPTY_BASE_STATION);
  const [droneService, setDroneService] = useState(EMPTY_SERVICE_DRONE);
  const [baseStationService, setBaseStationService] = useState(EMPTY_SERVICE_BASE_STATION);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    if (!open) return;
    setMode('install');
    setDroneInstall(EMPTY_DRONE);
    setBaseStationInstall(EMPTY_BASE_STATION);
    setDroneService(EMPTY_SERVICE_DRONE);
    setBaseStationService(EMPTY_SERVICE_BASE_STATION);
    setFormError('');
  }, [open]);

  const updateDroneInstall = useCallback(
    field => val => setDroneInstall(prev => ({ ...prev, [field]: val })),
    []
  );
  const updateBaseStationInstall = useCallback(
    field => val => setBaseStationInstall(prev => ({ ...prev, [field]: val })),
    []
  );
  const updateDroneService = useCallback(
    field => val => setDroneService(prev => ({ ...prev, [field]: val })),
    []
  );
  const updateBaseStationService = useCallback(
    field => val => setBaseStationService(prev => ({ ...prev, [field]: val })),
    []
  );

  const handleSubmit = e => {
    e.preventDefault();
    setFormError('');

    const droneFields = mode === 'install' ? droneInstall : droneService;
    const baseStationFields =
      mode === 'install' ? baseStationInstall : baseStationService;

    const droneEmpty = isSectionEmpty(droneFields);
    const baseStationEmpty = isSectionEmpty(baseStationFields);
    const droneComplete = isSectionComplete(droneFields);
    const baseStationComplete = isSectionComplete(baseStationFields);

    if (droneEmpty && baseStationEmpty) {
      setFormError('Drone/Base Station information incomplete.');
      return;
    }
    if (
      (!droneEmpty && !droneComplete) ||
      (!baseStationEmpty && !baseStationComplete)
    ) {
      setFormError('Drone/Base Station information incomplete.');
      return;
    }

    onSubmit({
      mode,
      drone: droneComplete ? droneFields : null,
      baseStation: baseStationComplete ? baseStationFields : null,
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
        <h3 className="modal-header">Add Drone / Base Station</h3>

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
          <SectionLabel>Base Stations</SectionLabel>

          {mode === 'install' ? (
            <>
              <FormInput
                label="Serial Number"
                value={baseStationInstall.serialNumber}
                onChange={updateBaseStationInstall('serialNumber')}
              />
              <FormInput
                label="Name"
                value={baseStationInstall.name}
                onChange={updateBaseStationInstall('name')}
              />
              <FormInput
                label="Model"
                value={baseStationInstall.model}
                onChange={updateBaseStationInstall('model')}
              />
              <FormInput
                label="Install Date"
                value={baseStationInstall.installDate}
                onChange={updateBaseStationInstall('installDate')}
                placeholder="MM/DD/YYYY"
              />
              <FormInput
                label="Inspection Date"
                value={baseStationInstall.inspectionDate}
                onChange={updateBaseStationInstall('inspectionDate')}
                placeholder="MM/DD/YYYY"
              />
              <FormInput
                label="Inspector"
                value={baseStationInstall.inspector}
                onChange={updateBaseStationInstall('inspector')}
              />
            </>
          ) : (
            <>
              <label className="form-label" style={{ marginBottom: 'var(--space-sm)' }}>
                Select Base Station
                <select
                  value={baseStationService.serialNumber}
                  onChange={e =>
                    setBaseStationService(prev => ({
                      ...prev,
                      serialNumber: e.target.value,
                    }))
                  }
                  className="form-select"
                >
                  <option value="">— select base station —</option>
                  {(activeBaseStations || []).map(bs => (
                    <option key={bs.bs_id} value={bs.bs_serial_number}>
                      {bs.bs_name || bs.bs_serial_number}
                      {bs.bs_model ? ` (${bs.bs_model})` : ''}
                    </option>
                  ))}
                </select>
              </label>
              <FormInput
                label="Inspection Date"
                value={baseStationService.inspectionDate}
                onChange={updateBaseStationService('inspectionDate')}
                placeholder="MM/DD/YYYY"
              />
              <FormInput
                label="Inspector"
                value={baseStationService.inspector}
                onChange={updateBaseStationService('inspector')}
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
