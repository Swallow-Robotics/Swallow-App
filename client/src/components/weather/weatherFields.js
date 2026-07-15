// Field metadata for the weather table (server/app/routes/weather.py).
// Units are best-effort inferences from observed sensor values (e.g. air_temperature
// readings in the low-20s read as Celsius, not Fahrenheit) — confirm against the
// station's spec sheet and adjust here if a sensor uses different units.

const COMPASS_POINTS = [
  'N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
  'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW',
];

export const degreesToCompass = deg => {
  if (deg == null || Number.isNaN(deg)) return '';
  const normalized = ((deg % 360) + 360) % 360;
  return COMPASS_POINTS[Math.round(normalized / 22.5) % 16];
};

export const WEATHER_FIELDS = [
  { key: 'air_temperature', label: 'Air Temperature', unit: '°C', decimals: 1 },
  { key: 'relative_humidity', label: 'Relative Humidity', unit: '%', decimals: 0 },
  { key: 'wind_speed', label: 'Wind Speed', unit: 'm/s', decimals: 1 },
  { key: 'wind_gust', label: 'Wind Gust', unit: 'm/s', decimals: 1 },
  { key: 'wind_direction', label: 'Wind Direction', unit: '°', decimals: 0, compass: true },
  { key: 'rainfall', label: 'Rainfall', unit: 'mm', decimals: 1 },
  { key: 'rain_rate', label: 'Rain Rate', unit: 'mm/hr', decimals: 1 },
  { key: 'solar_radiation', label: 'Solar Radiation', unit: 'W/m²', decimals: 0 },
  { key: 'uv_index', label: 'UV Index', unit: '', decimals: 0 },
  { key: 'light_intensity', label: 'Light Intensity', unit: 'lux', decimals: 0 },
  { key: 'battery_level', label: 'Battery', unit: '%', decimals: 0, percentFromFraction: true },
  { key: 'signal_strength', label: 'Signal', unit: '', decimals: 0 },
];

export const getFieldMeta = key => WEATHER_FIELDS.find(f => f.key === key);

const SPACED_UNITS = new Set(['m/s', 'mm', 'mm/hr', 'lux', 'W/m²']);

export const formatFieldValue = (field, rawValue) => {
  if (rawValue == null || Number.isNaN(rawValue)) return '—';
  const value = field.percentFromFraction ? rawValue * 100 : rawValue;
  const text = value.toLocaleString(undefined, {
    minimumFractionDigits: field.decimals,
    maximumFractionDigits: field.decimals,
  });
  const unitText = field.unit
    ? SPACED_UNITS.has(field.unit)
      ? ` ${field.unit}`
      : field.unit
    : '';
  const compassText = field.compass ? ` ${degreesToCompass(rawValue)}` : '';
  return `${text}${unitText}${compassText}`;
};
