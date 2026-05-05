import React, { useEffect, useState } from 'react';

const EditProjectModal = ({ open, onClose, onSubmit, initial }) => {
  const [name, setName] = useState(
    initial?.project_name || initial?.name || ''
  );
  const [address, setAddress] = useState(
    initial?.project_address || initial?.address || ''
  );

  useEffect(() => {
    if (open) {
      setName(initial?.project_name || initial?.name || '');
      setAddress(initial?.project_address || initial?.address || '');
    }
  }, [open, initial]);

  if (!open) return null;

  const handleSubmit = e => {
    e.preventDefault();
    if (!name.trim()) {
      alert('Project name is required');
      return;
    }
    onSubmit({ name: name.trim(), address: address.trim() || null });
  };

  return (
    <div role="dialog" aria-modal="true" className="modal-overlay">
      <div className="modal-body" style={{ position: 'relative' }}>
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
        <h3 className="modal-header">Edit Project</h3>
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

export default EditProjectModal;
