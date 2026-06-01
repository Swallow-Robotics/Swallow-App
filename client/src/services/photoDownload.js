const triggerBlobDownload = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

/**
 * Derive a stable, unique file name for a photo from its R2 path.
 */
export const photoFileName = photo => {
  const base = (photo?.r2_path || '').split('/').pop();
  if (base) return base;
  return `${photo?.photo_id || 'photo'}.jpg`;
};

const fetchBlob = async url => {
  const res = await fetch(url, { mode: 'cors' });
  if (!res.ok) {
    throw new Error(`Failed to fetch image (${res.status})`);
  }
  return res.blob();
};

/**
 * Download a set of photos as a zip, built entirely in the browser by
 * fetching each image directly from R2. `items` is an array of
 * { url, name } where name may include a folder path
 * (e.g. "2026-05-02/abc.jpg") to nest the file inside the archive.
 *
 * Requires the R2 bucket to allow cross-origin GET requests from the app.
 */
export const downloadPhotosZip = async (
  items,
  zipName = `photos-${Date.now()}.zip`,
) => {
  const valid = (items || []).filter(item => item && item.url && item.name);
  if (!valid.length) {
    throw new Error('No photos selected to download.');
  }

  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();

  // JSZip writes the archive's date fields from the date's UTC components,
  // but the ZIP format stores local time — so timestamps appear shifted by
  // the local UTC offset. Pre-shift the date so the read-back matches the
  // local wall-clock time.
  const now = new Date();
  const localDate = new Date(now.getTime() - now.getTimezoneOffset() * 60000);

  let added = 0;
  for (const item of valid) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const blob = await fetchBlob(item.url);
      zip.file(item.name, blob, { date: localDate });
      added += 1;
    } catch {
      // Skip files that fail to download; surfaced via the error below if none succeed.
    }
  }

  if (!added) {
    throw new Error(
      'Unable to download photos. Check that storage allows downloads from this site.',
    );
  }

  const blob = await zip.generateAsync({ type: 'blob' });
  triggerBlobDownload(blob, zipName);
};
