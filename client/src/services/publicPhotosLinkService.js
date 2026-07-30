import apiClient from './api';

/** Unauthenticated reads for the public Photos Link viewer. */
class PublicPhotosLinkService {
  async getLink(token) {
    return apiClient.get(`/v1/public/photos-link/${token}`);
  }

  async getPhoto(token, photoId) {
    return apiClient.get(`/v1/public/photos-link/${token}/photos/${photoId}`);
  }
}

const publicPhotosLinkService = new PublicPhotosLinkService();
export default publicPhotosLinkService;
