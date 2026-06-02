import axios from 'axios';

const api = axios.create({
  baseURL: 'http://localhost:8000',
});

export const getPersons = () => api.get('/persons');
export const createPerson = (data) => api.post('/persons', data);
export const updatePerson = (id, data) => api.put(`/persons/${id}`, data);
export const deletePerson = (id) => api.delete(`/persons/${id}`);
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
export const uploadAndProcessAudio = (file) => {
  const formData = new FormData();
  formData.append('file', file);
  return api.post('/stories/process', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  });
};
export const createStoryPerson = (data) => api.post('/story-persons', data);

export const tagStory = (id, transcript) => api.post(`/stories/${id}/tag`, { transcript });

export default api;
