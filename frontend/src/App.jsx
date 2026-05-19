import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Sidebar      from './components/Sidebar';
import ProtectedRoute from './components/ProtectedRoute';
import Dashboard    from './pages/Dashboard';
import Courses      from './pages/Courses';
import CourseDetail from './pages/CourseDetail';
import Assignments  from './pages/Assignments';
import Login        from './pages/Login';
import CanvasSettings from './pages/CanvasSettings';
import Schedule from './pages/Schedule';
import { ToastProvider } from './context/ToastContext';
import { SemesterProvider } from './context/SemesterContext';
import { AuthProvider } from './context/AuthContext';

function AppShell() {
  return (
    <div className="app-layout">
      <Sidebar />
      <main className="main-content">
        <Routes>
          <Route path="/"             element={<Dashboard />} />
          <Route path="/schedule"     element={<Schedule />} />
          <Route path="/courses"      element={<Courses />} />
          <Route path="/courses/:id"  element={<CourseDetail />} />
          <Route path="/assignments"  element={<Assignments />} />
          <Route path="/canvas"      element={<CanvasSettings />} />
          <Route path="*"            element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <SemesterProvider>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/*" element={
                <ProtectedRoute>
                  <AppShell />
                </ProtectedRoute>
              } />
            </Routes>
          </SemesterProvider>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
