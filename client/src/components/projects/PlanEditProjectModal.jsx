import React, { useEffect, useState } from 'react';

const PlanEditProjectModal = ({ open, onClose, onSubmit, initial, error }) => {
  const [name, setName] = useState('');
  const [orgId, setOrgId] = useState('');
  const [address, setAddress] = useState('');

  useEffect(() => {
    if (open) {
      setName(initial?.project_name || '');
      setOrgId(initial?.org_id || '');
      setAddress(initial?.project_address || '');
    }
  }, [open, initial]);

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
        <h3 className="modal-header">Edit Project</h3>
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
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default PlanEditProjectModal;
