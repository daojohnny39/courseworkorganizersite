import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Sidebar     from './components/Sidebar';
import Dashboard   from './pages/Dashboard';
import Courses     from './pages/Courses';
import CourseDetail from './pages/CourseDetail';
import Assignments from './pages/Assignments';
import { ToastProvider } from './context/ToastContext';

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <div className="app-layout">
          <Sidebar />
          <main className="main-content">
            <Routes>
              <Route path="/"             element={<Dashboard />} />
              <Route path="/courses"      element={<Courses />} />
              <Route path="/courses/:id"  element={<CourseDetail />} />
              <Route path="/assignments"  element={<Assignments />} />
            </Routes>
          </main>
        </div>
      </ToastProvider>
    </BrowserRouter>
  );
}
