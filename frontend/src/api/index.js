import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5001/api',
  headers: { 'Content-Type': 'application/json' },
});

// Attach JWT token to every request automatically
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('coursetrack_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ── Courses ──────────────────────────────────────────────────────
export const getCourses = (params) => api.get('/courses', { params });
export const getCourse = (id) => api.get(`/courses/${id}`);
export const createCourse = (data) => api.post('/courses', data);
export const updateCourse = (id, data) => api.put(`/courses/${id}`, data);
export const deleteCourse = (id) => api.delete(`/courses/${id}`);

// ── Assignments ──────────────────────────────────────────────────
export const getAssignments = (params) => api.get('/assignments', { params });
export const getAssignment = (id) => api.get(`/assignments/${id}`);
export const createAssignment = (data) => api.post('/assignments', data);
export const updateAssignment = (id, data) => api.put(`/assignments/${id}`, data);
export const deleteAssignment = (id) => api.delete(`/assignments/${id}`);

// ── Events (Schedule) ────────────────────────────────────────────
export const getEvents = (params) => api.get('/events', { params });
export const createEvent = (data) => api.post('/events', data);
export const updateEvent = (id, data) => api.put(`/events/${id}`, data);
export const deleteEvent = (id) => api.delete(`/events/${id}`);

// ── Stats ────────────────────────────────────────────────────────
export const getStats = (params) => api.get('/stats', { params });

// ── Semesters ────────────────────────────────────────────────────
export const getSemesters = () => api.get('/semesters');
export const addSemester = (data) => api.post('/semesters', data);
export const deleteSemester = (id) => api.delete(`/semesters/${id}`);

// ── Auth ─────────────────────────────────────────────────────────
export const authRegister = (data) => api.post('/auth/register', data);
export const authLogin = (data) => api.post('/auth/login', data);
export const authMe = () => api.get('/auth/me');

// ── ICS Feed ────────────────────────────────────────────────────
export const icsConnect = (data) => api.post('/ics-feed/connect', data);
export const icsDisconnect = () => api.delete('/ics-feed/disconnect');
export const icsSyncNow = () => api.post('/ics/sync');
export const icsGetStatus = () => api.get('/ics/status');
export const icsExcludeCourse = (courseMapId) => api.put(`/ics/courses/${courseMapId}/exclude`);
export const icsIncludeCourse = (courseMapId) => api.put(`/ics/courses/${courseMapId}/include`);
export const icsUpdateSettings = (data) => api.put('/ics/settings', data);

export default api;
