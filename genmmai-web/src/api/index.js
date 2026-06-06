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
export const deleteMigration = (personId, migrationId, syncToStory = false) => api.delete(`/persons/${personId}/migrations/${migrationId}?sync_to_story=${syncToStory}`);
export const suggestMigrations = (id) => api.get(`/persons/${id}/migrations/suggest`);

// 从故事提取迁徙记录
export const extractStoryMigrations = (storyId) => api.post(`/stories/${storyId}/extract-migrations`);
export const confirmStoryMigrations = (storyId, data) => api.post(`/stories/${storyId}/confirm-migrations`, data);

// 一键提取迁徙记录
export const getUnextractedStories = (personId) => api.get(`/persons/${personId}/unextracted-stories`);
export const batchExtractMigrations = (personId) => api.post(`/persons/${personId}/batch-extract-migrations`);

// 家族时间轴 API
export const getFamilyTimeline = (params = {}) => api.get('/family/timeline', { params });

// 家族迁徙地图 API
export const getFamilyMigrations = () => api.get('/family/migrations');
export const getFamilyMigrationPersons = () => api.get('/family/migrations/persons');

// 主题 API
export const getThemes = () => api.get('/themes');
export const createTheme = (data) => api.post('/themes', data);
export const deleteTheme = (id) => api.delete(`/themes/${id}`);
export const updateTheme = (id, data) => api.patch(`/themes/${id}`, data);

// 主题管理 - 获取带故事数量的主题列表
export const getThemesWithCount = () => api.get('/themes/with-count');

// 历史事件 API
export const getHistoricalEvents = (yearFrom, yearTo) => {
  const params = new URLSearchParams();
  if (yearFrom) params.append('year_from', yearFrom);
  if (yearTo) params.append('year_to', yearTo);
  return api.get(`/historical-events?${params.toString()}`);
};

export const getEventStories = (eventId) => api.get(`/historical-events/${eventId}/stories`);
export const detectStoryHistory = (storyId) => api.post(`/stories/${storyId}/detect-history`);

// 自定义历史事件 API
export const createCustomEvent = (data) => api.post('/historical-events/custom', data);
export const updateCustomEvent = (eventId, data) => api.patch(`/historical-events/${eventId}/custom`, data);
export const deleteCustomEvent = (eventId) => api.delete(`/historical-events/${eventId}/custom`);
export const getEventMemories = (eventId) => api.get(`/historical-events/${eventId}/memories`);
export const createEventMemory = (eventId, data) => api.post(`/historical-events/${eventId}/memories`, data);
export const deleteEventMemory = (eventId, memoryId) => api.delete(`/historical-events/${eventId}/memories/${memoryId}`);

// 采访 API
export const startInterview = (personId, preferredThemes) => {
  const data = preferredThemes?.length > 0 ? { preferred_themes: preferredThemes } : {};
  return api.post(`/persons/${personId}/interviews/start`, data);
};
export const submitInterviewAnswer = (sessionId, formData) => api.post(`/interviews/${sessionId}/answer`, formData, {
  headers: { 'Content-Type': 'multipart/form-data' }
});
export const getInterviewRoundStatus = (sessionId, roundId) => api.get(`/interviews/${sessionId}/rounds/${roundId}/status`);
export const getNextQuestion = (sessionId, roundId) => {
  // roundId 为 null 或 undefined 时不传该字段
  const data = roundId ? { round_id: roundId } : {};
  return api.post(`/interviews/${sessionId}/next-question`, data);
};
export const completeInterview = (sessionId) => api.post(`/interviews/${sessionId}/complete`);
export const abandonInterview = (sessionId) => api.post(`/interviews/${sessionId}/abandon`);
export const getPersonInterviews = (personId) => api.get(`/persons/${personId}/interviews`);
export const getStoryGenerationStatus = (storyId) => api.get(`/stories/${storyId}/generation-status`);
export const getStory = (storyId) => api.get(`/stories/${storyId}`);

export default api;
