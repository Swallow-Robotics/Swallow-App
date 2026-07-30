import apiClient from './api';

/**
 * Generates (or reuses) a Photos page Public Link for the current project +
 * capture method. The server always re-derives and validates the frozen
 * drawing and snapshot contents; drawingId here is only a hint.
 */
class PhotosLinkExportService {
  async createOrReuse({ projectId, captureMethod, drawingId }) {
    return apiClient.post('/v1/photos-link-exports', {
      project_id: projectId,
      capture_method: captureMethod,
      drawing_id: drawingId || null,
    });
  }
}

const photosLinkExportService = new PhotosLinkExportService();
export default photosLinkExportService;
