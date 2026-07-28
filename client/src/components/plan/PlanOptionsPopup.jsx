import React, { useEffect, useRef } from 'react';

/**
 * Options popup for the Plan/Create and Plan/Edit drawing view (idle state
 * only): reuses the same Add/Edit Drawings and Align Drawing modals as
 * View/Photos.
 */
const PlanOptionsPopup = ({
  hasActiveDrawing,
  onDrawings,
  onAlignDrawing,
  onClose,
}) => {
  const popupRef = useRef(null);

  useEffect(() => {
    const handleClick = (e) => {
      if (popupRef.current && !popupRef.current.contains(e.target)) onClose();
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onClose]);

  return (
    <div ref={popupRef} className="photos-page__options-popup">
      <button type="button" className="btn-menu-item" onClick={onDrawings}>
        Add/Edit Drawings
      </button>
      <button
        type="button"
        className="btn-menu-item"
        onClick={onAlignDrawing}
        disabled={!hasActiveDrawing}
      >
        Align Drawing
      </button>
    </div>
  );
};

export default PlanOptionsPopup;
