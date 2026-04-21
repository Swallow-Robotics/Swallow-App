import React, { useState, useEffect } from 'react';

const PlanCreateProjectModal = ({ open, onClose, onSubmit, error }) => {
  const [name, setName] = useState('');
  const [orgId, setOrgId] = useState('');
  const [address, setAddress] = useState('');

  useEffect(() => {
    if (open) {
      setName('');
      setOrgId('');
      setAddress('');
    }
  }, [open]);

  if (!open) return null;

  const handleSubmit = e => {
    e.preventDefault();
    if (!name.trim()) return;
    if (!orgId.trim()) return;
    onSubmit({ name: name.trim(), orgId: orgId.trim(), address: address.trim() || null });
  };

  return (
    <div role="dialog" aria-modal="true" className="modal-overlay">
      <div className="modal-body">
        <h3 className="modal-header">Create Project</h3>
        {error ? (
          <p style={{ color: '#9B4A2F', margin: '0 0 var(--space-sm) 0', fontSize: '0.9em' }}>
            {error}
          </p>
        ) : null}
        <form onSubmit={handleSubmit} className="modal-form">
          <label className="form-label">
            Name (required)
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              required
              className="form-input"
            />
          </label>
          <label className="form-label">
            Organization ID (required)
            <input
              type="text"
              value={orgId}
              onChange={e => setOrgId(e.target.value)}
              placeholder="Enter organization UUID"
              required
              className="form-input"
            />
          </label>
          <label className="form-label">
            Address (optional)
            <input
              type="text"
              value={address}
              onChange={e => setAddress(e.target.value)}
              placeholder="Street, city, etc."
              className="form-input"
            />
          </label>
          <div className="modal-footer">
            <button type="button" onClick={onClose} className="btn-secondary">
              Cancel
            </button>
            <button type="submit" className="btn-primary">
              Create
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default PlanCreateProjectModal;
