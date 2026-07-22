import apiClient from './api';

class PublicPhotoService {
  async getPhoto(token) {
    return apiClient.get(`/v1/public/photos/${token}`);
  }
}

const publicPhotoService = new PublicPhotoService();
export default publicPhotoService;
