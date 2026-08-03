/**
 * MapLibre control that renders the Photos page "Export" button in the
 * top-right control stack (directly under Navigation + Standard/Satellite).
 */
export class MapExportControl {
  constructor({ onExport }) {
    this._onExport = onExport;
    this._container = null;
  }

  onAdd() {
    const container = document.createElement('div');
    container.className = 'maplibregl-ctrl';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = 'Export';
    btn.className = 'btn-format-1 drawings-page__tool-btn';
    btn.style.boxShadow = 'var(--shadow-md)';
    btn.style.cursor = 'pointer';
    btn.onclick = e => {
      e.preventDefault();
      e.stopPropagation();
      this._onExport?.();
    };
    container.appendChild(btn);
    this._container = container;
    return container;
  }

  onRemove() {
    if (this._container && this._container.parentNode) {
      this._container.parentNode.removeChild(this._container);
    }
    this._map = undefined;
  }
}

export default MapExportControl;
