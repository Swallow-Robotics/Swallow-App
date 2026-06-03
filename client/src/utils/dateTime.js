const toDate = value => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
};

export const formatLocalDateTime = (
  value,
  options = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  },
) => {
  const date = toDate(value);
  if (!date) return value ? String(value) : '';
  return date.toLocaleString(undefined, options);
};

export const formatLocalDate = (
  value,
  options = { year: 'numeric', month: 'short', day: 'numeric' },
) => {
  const date = toDate(value);
  if (!date) return value ? String(value) : '';
  return date.toLocaleDateString(undefined, options);
};

export const TIME_ZONES = [
  { label: 'ET', value: 'America/New_York' },
  { label: 'CT', value: 'America/Chicago' },
  { label: 'MT', value: 'America/Denver' },
  { label: 'PT', value: 'America/Los_Angeles' },
  { label: 'AKT', value: 'America/Anchorage' },
  { label: 'HT', value: 'Pacific/Honolulu' },
  { label: 'UTC', value: 'UTC' },
];

export const toUtcIso = (dateStr, timeStr, amPm, tz) => {
  if (!dateStr || !timeStr) return null;
  const [month, day, year] = dateStr.split('/');
  if (!month || !day || !year) return null;
  const timeParts = timeStr.split(':');
  if (timeParts.length < 2) return null;
  const [rawHour, minute, second = '00'] = timeParts;
  let hour = parseInt(rawHour, 10);
  if (Number.isNaN(hour)) return null;
  if (amPm === 'PM' && hour !== 12) hour += 12;
  if (amPm === 'AM' && hour === 12) hour = 0;
  const localStr = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${String(
    hour,
  ).padStart(
    2,
    '0',
  )}:${minute.padStart(2, '0')}:${String(second).padStart(2, '0')}`;
  try {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
    const parts = fmt.formatToParts(new Date(localStr));
    const get = t => parts.find(p => p.type === t)?.value ?? '00';
    const utcDate = new Date(
      `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}`,
    );
    const offsetMs = utcDate - new Date(localStr);
    return new Date(new Date(localStr) - offsetMs).toISOString();
  } catch {
    return null;
  }
};

export const utcIsoToLocalFields = (iso, tz) => {
  const empty = { date: '', time: '', amPm: 'AM' };
  const date = toDate(iso);
  if (!date) return empty;
  try {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    });
    const parts = fmt.formatToParts(date);
    const get = t => parts.find(p => p.type === t)?.value ?? '';
    return {
      date: `${get('month')}/${get('day')}/${get('year')}`,
      time: `${get('hour')}:${get('minute')}:${get('second')}`,
      amPm: (get('dayPeriod') || 'AM').toUpperCase(),
    };
  } catch {
    return empty;
  }
};

export const dateKeyFromIso = iso => {
  const date = toDate(iso);
  if (!date) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const formatMonthDayYear = iso => {
  const date = toDate(iso);
  if (!date) return '';
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const year = date.getFullYear();
  return `${month}/${day}/${year}`;
};

export const dateLabelFromKey = key => {
  if (!key) return '';
  const [year, month, day] = key.split('-').map(Number);
  if (!year || !month || !day) return key;
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString(undefined, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
};

export const formatLocalDateTimeParts = value => {
  const date = toDate(value);
  if (!date) return { dateLabel: value ? String(value) : '', timeLabel: '' };
  return {
    dateLabel: date.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }),
    timeLabel: date.toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
    }),
  };
};
