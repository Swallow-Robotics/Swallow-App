import supabase from '../lib/supabaseClient';
import { getApiOrigin } from '../utils/apiEnv';

const buildApiUrl = endpoint =>
  `${getApiOrigin().replace(/\/+$/, '')}/api${endpoint}`;

const parseFilename = disposition => {
  const match = /filename="?([^"]+)"?/.exec(disposition || '');
  return match ? match[1] : 'photo-export.pdf';
};

/**
 * Requests a generated Photos PDF export from the server and returns the
 * resulting blob and suggested filename. Uses a raw fetch (not apiClient)
 * because the response body is a binary PDF, not JSON.
 */
export async function requestPhotoPdfExport({
  projectId,
  drawingId,
  captureMethod,
  dateKey,
  items,
}) {
  const { data } = await supabase.auth.getSession();
  const accessToken = data?.session?.access_token || '';

  const response = await fetch(buildApiUrl('/v1/photo-pdf-exports'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify({
      project_id: projectId,
      drawing_id: drawingId,
      capture_method: captureMethod,
      date: dateKey,
      items,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    const error = new Error(
      errorBody?.error || `HTTP error ${response.status}`,
    );
    error.status = response.status;
    error.payload = errorBody;
    throw error;
  }

  const blob = await response.blob();
  const filename = parseFilename(response.headers.get('Content-Disposition'));
  return { blob, filename };
}

/**
 * Triggers a browser download for a blob (e.g. the generated PDF).
 */
export function triggerPdfBlobDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
