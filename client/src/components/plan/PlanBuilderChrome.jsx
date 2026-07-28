import React from 'react';
import DrawingSwitcher from '../drawings/DrawingSwitcher';

/**
 * Shared page chrome for Plan/Create and Plan/Edit: Map/Drawing toggle (top
 * right, "Map" default), Standard/Satellite toggle under it in Map mode,
 * drawing navigator (top left, Drawing mode), Options button + popup slot
 * (Drawing mode, idle only), an optional top-center slot (Plan/Edit's plan
 * picker), and a bottom-right action-button slot ("Create Plan"/"Edit Plan").
 */
const PlanBuilderChrome = ({
  subView,
  onSubViewChange,
  drawingDisabled = false,
  basemapStyle,
  onBasemapChange,
  drawings = [],
  activeDrawingId,
  onSelectDrawing,
  showOptionsButton = false,
  optionsOpen = false,
  onToggleOptions,
  optionsContent = null,
  topCenter = null,
  bottomRight = null,
  children,
}) => (
  <div className="plan-builder-page__canvas">
    {children}

    {subView === 'drawing' && drawings.length ? (
      <div className="drawings-page__controls">
        <DrawingSwitcher
          orderedDrawings={drawings}
          currentId={activeDrawingId}
          onSelect={onSelectDrawing}
        />
      </div>
    ) : null}

    {topCenter ? (
      <div className="plan-builder__top-center">{topCenter}</div>
    ) : null}

    <div className="photos-page__controls-right">
      <div
        className="view-mode-toggle"
        role="group"
        aria-label="Map or Drawing view"
      >
        <button
          type="button"
          className={`view-mode-toggle__btn${subView === 'map' ? ' view-mode-toggle__btn--active' : ''}`}
          onClick={() => onSubViewChange('map')}
        >
          Map
        </button>
        <div className="view-mode-toggle__divider" aria-hidden="true" />
        <button
          type="button"
          className={`view-mode-toggle__btn${subView === 'drawing' ? ' view-mode-toggle__btn--active' : ''}`}
          onClick={() => !drawingDisabled && onSubViewChange('drawing')}
          disabled={drawingDisabled}
          style={
            drawingDisabled
              ? { opacity: 0.4, cursor: 'not-allowed' }
              : undefined
          }
        >
          Drawing
        </button>
      </div>

      {subView === 'map' ? (
        <div
          className="view-mode-toggle"
          role="group"
          aria-label="Basemap style"
        >
          <button
            type="button"
            className={`view-mode-toggle__btn${basemapStyle === 'standard' ? ' view-mode-toggle__btn--active' : ''}`}
            onClick={() => onBasemapChange('standard')}
          >
            Standard
          </button>
          <div className="view-mode-toggle__divider" aria-hidden="true" />
          <button
            type="button"
            className={`view-mode-toggle__btn${basemapStyle === 'satellite' ? ' view-mode-toggle__btn--active' : ''}`}
            onClick={() => onBasemapChange('satellite')}
          >
            Satellite
          </button>
        </div>
      ) : null}

      {subView === 'drawing' && showOptionsButton ? (
        <div style={{ position: 'relative' }}>
          <button
            type="button"
            className="btn-format-1 drawings-page__tool-btn"
            onClick={onToggleOptions}
          >
            Options
          </button>
          {optionsOpen ? optionsContent : null}
        </div>
      ) : null}
    </div>

    {bottomRight ? (
      <div className="plan-builder__bottom-right">{bottomRight}</div>
    ) : null}
  </div>
);

export default PlanBuilderChrome;
