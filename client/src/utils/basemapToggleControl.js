/**
 * Shared Standard/Satellite MapLibre control. Extracted from PhotoMapLive.js
 * so the public Photos Link map view can reuse the exact same control.
 */
export class BasemapToggleControl {
  constructor({ onSelect, getActive }) {
    this._onSelect = onSelect;
    this._getActive = getActive;
    this._container = null;
  }

  onAdd(map) {
    this._map = map;
    const container = document.createElement('div');
    container.className = 'maplibregl-ctrl';
    container.style.display = 'flex';
    container.style.background = 'var(--color-surface-primary)';
    container.style.border = '1px solid var(--color-border)';
    container.style.borderRadius = 'var(--radius-lg)';
    container.style.boxShadow = 'var(--shadow-xs)';
    container.style.overflow = 'hidden';

    const addButton = (label, value) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = label;
      btn.style.padding = '6px 14px';
      btn.style.fontSize = 'var(--font-size-base)';
      btn.style.fontWeight = 'var(--font-weight-medium)';
      btn.style.fontFamily = 'var(--font-family-sans)';
      btn.style.border = 'none';
      btn.style.borderRadius = '0';
      btn.style.cursor = 'pointer';
      btn.style.transition = 'background 150ms ease, color 150ms ease';
      btn.style.lineHeight = 'var(--line-height-snug)';
      btn.style.whiteSpace = 'nowrap';
      btn.onclick = () => this._onSelect(value);
      btn.onmouseenter = () => {
        if (this._getActive() !== value) {
          btn.style.background = 'rgba(183,205,230,0.28)';
        }
      };
      btn.onmouseleave = () => {
        if (this._getActive() !== value) {
          btn.style.background = 'var(--color-surface-primary)';
          btn.style.color = 'var(--color-text-primary)';
        }
      };
      container.appendChild(btn);
      return btn;
    };

    this._standardBtn = addButton('Standard', 'standard');

    const divider = document.createElement('div');
    divider.style.width = '1px';
    divider.style.background = 'var(--color-border)';
    divider.style.alignSelf = 'stretch';
    container.appendChild(divider);

    this._satelliteBtn = addButton('Satellite', 'satellite');
    this._container = container;
    this._updateActive();
    return container;
  }

  onRemove() {
    if (this._container && this._container.parentNode) {
      this._container.parentNode.removeChild(this._container);
    }
    this._map = undefined;
  }

  _updateActive() {
    const active = this._getActive();
    if (this._standardBtn) {
      const isActive = active === 'standard';
      this._standardBtn.style.background = isActive
        ? 'var(--color-primary)'
        : 'var(--color-surface-primary)';
      this._standardBtn.style.color = isActive
        ? 'var(--color-surface-primary)'
        : 'var(--color-text-primary)';
    }
    if (this._satelliteBtn) {
      const isActive = active === 'satellite';
      this._satelliteBtn.style.background = isActive
        ? 'var(--color-primary)'
        : 'var(--color-surface-primary)';
      this._satelliteBtn.style.color = isActive
        ? 'var(--color-surface-primary)'
        : 'var(--color-text-primary)';
    }
  }

  setActive() {
    this._updateActive();
  }
}

export default BasemapToggleControl;
