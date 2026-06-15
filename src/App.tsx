import React from 'react';
import { HashRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './lib/AuthContext';
import { AdminLayout } from './components/AdminLayout';
import { Dashboard } from './pages/Dashboard';
import { CourseDetail } from './pages/CourseDetail';
import { ClassDetail } from './pages/ClassDetail';
import { ScanPage } from './pages/ScanPage';
import { RegisterClass } from './pages/RegisterClass';
import { RegisterCourse } from './pages/RegisterCourse';
import { CertificateManager } from './pages/CertificateManager';
import { ResetPassword } from './pages/ResetPassword';
import { PrintCertificate } from './pages/PrintCertificate';
import { AdminSettings } from './pages/AdminSettings';
import { VerifyCertificate } from './pages/VerifyCertificate';
import { EvaluationSession } from './pages/EvaluationSession';
import { StudentQuiz } from './pages/StudentQuiz';

import { PreRegister } from './pages/PreRegister';
import { MyPerformance } from './pages/MyPerformance';
import { OnlineClassView } from './pages/OnlineClassView';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <div className="p-8 text-center text-gray-500">Loading...</div>;
  if (!user) return <Navigate to="/" state={{ from: location.pathname }} replace />;
  return <>{children}</>;
}

function Main() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<AdminLayout />}>
          <Route index element={<Dashboard />} />
          <Route path="settings" element={<ProtectedRoute><AdminSettings /></ProtectedRoute>} />
          <Route path="course/:courseId" element={<ProtectedRoute><CourseDetail /></ProtectedRoute>} />
          <Route path="course/:courseId/certificates" element={<ProtectedRoute><CertificateManager /></ProtectedRoute>} />
          <Route path="class/:classId" element={<ProtectedRoute><ClassDetail /></ProtectedRoute>} />
          <Route path="me" element={<ProtectedRoute><MyPerformance /></ProtectedRoute>} />
        </Route>
        <Route path="/register/:classId" element={<RegisterClass />} />
        <Route path="/course-register/:courseId" element={<RegisterCourse />} />
        <Route path="/pre-register" element={<PreRegister />} />
        <Route path="/s/:classId/:step" element={<ScanPage />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/certificate/:courseId/:studentId" element={<PrintCertificate />} />
        <Route path="/verify" element={<VerifyCertificate />} />
        <Route path="/verify/:tokenParam" element={<VerifyCertificate />} />
        <Route path="/evaluation/:evaluationId/session" element={<ProtectedRoute><EvaluationSession /></ProtectedRoute>} />
        <Route path="/quiz/:evaluationId" element={<StudentQuiz />} />
        <Route path="/online-class/:classId" element={<OnlineClassView />} />
      </Routes>
    </Router>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Main />
    </AuthProvider>
  );
}
