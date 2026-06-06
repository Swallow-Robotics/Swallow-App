import React from 'react';

const CoordTextInput = ({ value, onChange, placeholder }) => (
  <input
    type="text"
    inputMode="decimal"
    autoComplete="off"
    value={value}
    placeholder={placeholder}
    onChange={onChange}
    onWheel={e => e.currentTarget.blur()}
    className="form-input"
    style={{ width: '100%', padding: '4px 6px' }}
  />
);

export default CoordTextInput;
