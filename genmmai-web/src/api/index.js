import axios from 'axios';

const api = axios.create({
  baseURL: 'http://localhost:8000',
});

export const getPersons = () => api.get('/persons');
export const createPerson = (data) => api.post('/persons', data);
export const getPerson = (id) => api.get(`/persons/${id}`);
export const createRelationship = (data) => api.post('/relationships', data);
export const getPersonStories = (id) => api.get(`/persons/${id}/stories`);
export const createStory = (data) => api.post('/stories', data);
export const getStory = (id) => api.get(`/stories/${id}`);

export default api;
