import axios from 'axios';

const api = axios.create({
  baseURL: 'http://localhost:5000/api',
  headers: { 'Content-Type': 'application/json' },
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

// ── Stats ────────────────────────────────────────────────────────
export const getStats = (params) => api.get('/stats', { params });

export default api;
