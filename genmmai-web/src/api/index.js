import axios from 'axios';

const api = axios.create({
  baseURL: 'http://localhost:8000',
});

export const getPersons = () => api.get('/persons');
export const getPersonRelations = (id) => api.get(`/persons/${id}/relations`);
export const createPerson = (data) => api.post('/persons', data);
export const updatePerson = (id, data) => api.put(`/persons/${id}`, data);
export const deletePerson = (id) => api.delete(`/persons/${id}`);
export const deletePersonForce = (id) => api.delete(`/persons/${id}?force=true`);
export const getPerson = (id) => api.get(`/persons/${id}`);

export const getRelationships = () => api.get('/relationships');
export const createRelationship = (data) => api.post('/relationships', data);
export const deleteRelationship = (id) => api.delete(`/relationships/${id}`);
export const getPersonStories = (id) => api.get(`/persons/${id}/stories`);
export const getPersonStoryThemes = (id) => api.get(`/persons/${id}/stories/themes`);
export const getSuggestQuestion = (id) => api.get(`/persons/${id}/suggest-question`);
export const createStory = (data) => api.post('/stories', data);
export const getStory = (id) => api.get(`/stories/${id}`);
export const updateStory = (id, data) => api.put(`/stories/${id}`, data);
export const patchStory = (id, data) => api.patch(`/stories/${id}`, data);
export const deleteStory = (id) => api.delete(`/stories/${id}`);
export const uploadAndProcessAudio = (file, personId = "") => {
  const formData = new FormData();
  formData.append('file', file);
  const config = personId ? { params: { person_id: personId } } : {};
  return api.post('/stories/process', formData, {
    ...config,
    headers: { 'Content-Type': 'multipart/form-data' }
  });
};
export const createStoryPerson = (data) => api.post('/story-persons', data);

export const tagStory = (id, transcript) => api.post(`/stories/${id}/tag`, { transcript });

// 迁徙记录 API
export const getPersonMigrations = (id) => api.get(`/persons/${id}/migrations`);
export const createMigration = (id, data) => api.post(`/persons/${id}/migrations`, data);
export const updateMigration = (personId, migrationId, data) => api.patch(`/persons/${personId}/migrations/${migrationId}`, data);
export const deleteMigration = (personId, migrationId) => api.delete(`/persons/${personId}/migrations/${migrationId}`);
export const suggestMigrations = (id) => api.get(`/persons/${id}/migrations/suggest`);

// 家族时间轴 API
export const getFamilyTimeline = (params = {}) => api.get('/family/timeline', { params });

// 家族迁徙地图 API
export const getFamilyMigrations = () => api.get('/family/migrations');
export const getFamilyMigrationPersons = () => api.get('/family/migrations/persons');

export default api;
