import React, { useEffect, useState } from 'react';
import apiClient from '../../services/api';
import DateTimePicker from '../common/DateTimePicker';

const toFieldValue = value =>
  value === null || value === undefined ? '' : value;

const EditPhotoModal = ({ open, photo, onClose, onSaved }) => {
  const [form, setForm] = useState({
    droneAlt: '',
    droneLat: '',
    droneLng: '',
    takenAt: null,
    droneHeading: '',
    gimbalPosition: '',
  });
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!open || !photo) return;
    setError('');
    setForm({
      droneAlt: toFieldValue(photo.drone_alt),
      droneLat: toFieldValue(photo.drone_lat),
      droneLng: toFieldValue(photo.drone_lng),
      takenAt: photo.taken_at || null,
      droneHeading: toFieldValue(photo.drone_heading),
      gimbalPosition: toFieldValue(photo.gimbal_position),
    });
  }, [open, photo]);

  const update = (field, value) =>
    setForm(prev => ({ ...prev, [field]: value }));

  const isComplete =
    form.droneAlt !== '' &&
    form.droneLat !== '' &&
    form.droneLng !== '' &&
    !!form.takenAt &&
    form.droneHeading !== '' &&
    form.gimbalPosition !== '';

  const handleSave = async () => {
    setError('');
    if (!isComplete) {
      setError('Photo information missing');
      return;
    }
    setIsSaving(true);
    try {
      const resp = await apiClient.patch(
        `/v1/photos/manage/${photo.photo_id}`,
        {
          drone_alt: form.droneAlt,
          drone_lat: form.droneLat,
          drone_lng: form.droneLng,
          taken_at: form.takenAt,
          drone_heading: form.droneHeading,
          gimbal_position: form.gimbalPosition,
        },
      );
      if (onSaved) onSaved(resp?.photo);
      onClose();
    } catch (err) {
      setError(
        err?.payload?.error || err?.message || 'Unable to update photo.',
      );
    } finally {
      setIsSaving(false);
    }
  };

  if (!open || !photo) return null;

  return (
    <div role="dialog" aria-modal="true" className="modal-overlay">
      <div
        className="modal-body"
        style={{ maxWidth: 460, width: '96%', position: 'relative' }}
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

        <h3 className="modal-header">Edit Photo</h3>

        {error ? (
          <p
            style={{
              color: '#9B4A2F',
              margin: '0 0 var(--space-sm) 0',
              fontSize: '0.9em',
            }}
          >
            {error}
          </p>
        ) : null}

        <div className="modal-form">
          <label className="form-label">
            Drone Altitude
            <input
              type="number"
              step="any"
              value={form.droneAlt}
              onChange={e => update('droneAlt', e.target.value)}
              className="form-input"
            />
          </label>
          <label className="form-label">
            Drone Latitude
            <input
              type="number"
              step="any"
              value={form.droneLat}
              onChange={e => update('droneLat', e.target.value)}
              className="form-input"
            />
          </label>
          <label className="form-label">
            Drone Longitude
            <input
              type="number"
              step="any"
              value={form.droneLng}
              onChange={e => update('droneLng', e.target.value)}
              className="form-input"
            />
          </label>
          <label className="form-label">
            Time
            <DateTimePicker
              value={form.takenAt}
              onChange={iso => update('takenAt', iso)}
            />
          </label>
          <label className="form-label">
            Drone Heading
            <input
              type="number"
              step="any"
              value={form.droneHeading}
              onChange={e => update('droneHeading', e.target.value)}
              className="form-input"
            />
          </label>
          <label className="form-label">
            Gimbal Position
            <input
              type="number"
              step="any"
              value={form.gimbalPosition}
              onChange={e => update('gimbalPosition', e.target.value)}
              className="form-input"
            />
          </label>
        </div>

        <div className="modal-footer">
          <button type="button" onClick={onClose} className="btn-secondary">
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="btn-primary"
            disabled={isSaving}
          >
            {isSaving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default EditPhotoModal;
