import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext.jsx';
import ProtectedRoute from './auth/ProtectedRoute.jsx';
import Home from './pages/public/Home.jsx';
import Features from './pages/public/Features.jsx';
import About from './pages/public/About.jsx';
import Contact from './pages/public/Contact.jsx';
import Login from './pages/auth/Login.jsx';
import Register from './pages/auth/Register.jsx';
import EmployerDashboard from './pages/employer/Dashboard.jsx';
import CreateJob from './pages/employer/CreateJob.jsx';
import Candidates from './pages/employer/Candidates.jsx';
import Shortlist from './pages/employer/Shortlist.jsx';
import Rankings from './pages/employer/Rankings.jsx';
import Reports from './pages/employer/Reports.jsx';
import ApplicantDashboard from './pages/applicant/Dashboard.jsx';
import ApplicantJobs from './pages/applicant/Jobs.jsx';
import Applications from './pages/applicant/Applications.jsx';
import Profile from './pages/applicant/Profile.jsx';
import AdminDashboard from './pages/admin/Dashboard.jsx';
import AdminUsers from './pages/admin/Users.jsx';
import AdminJobs from './pages/admin/Jobs.jsx';
import AdminAnalytics from './pages/admin/Analytics.jsx';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/features" element={<Features />} />
          <Route path="/about" element={<About />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />

          <Route path="/employer" element={<ProtectedRoute roles={['employer']}><EmployerDashboard /></ProtectedRoute>} />
          <Route path="/employer/jobs/new" element={<ProtectedRoute roles={['employer']}><CreateJob /></ProtectedRoute>} />
          <Route path="/employer/candidates" element={<ProtectedRoute roles={['employer']}><Candidates /></ProtectedRoute>} />
          <Route path="/employer/shortlist" element={<ProtectedRoute roles={['employer']}><Shortlist /></ProtectedRoute>} />
          <Route path="/employer/rankings" element={<ProtectedRoute roles={['employer']}><Rankings /></ProtectedRoute>} />
          <Route path="/employer/reports" element={<ProtectedRoute roles={['employer']}><Reports /></ProtectedRoute>} />

          <Route path="/applicant" element={<ProtectedRoute roles={['applicant']}><ApplicantDashboard /></ProtectedRoute>} />
          <Route path="/applicant/jobs" element={<ProtectedRoute roles={['applicant']}><ApplicantJobs /></ProtectedRoute>} />
          <Route path="/applicant/applications" element={<ProtectedRoute roles={['applicant']}><Applications /></ProtectedRoute>} />
          <Route path="/applicant/profile" element={<ProtectedRoute roles={['applicant']}><Profile /></ProtectedRoute>} />

          <Route path="/admin" element={<ProtectedRoute roles={['admin']}><AdminDashboard /></ProtectedRoute>} />
          <Route path="/admin/users" element={<ProtectedRoute roles={['admin']}><AdminUsers /></ProtectedRoute>} />
          <Route path="/admin/jobs" element={<ProtectedRoute roles={['admin']}><AdminJobs /></ProtectedRoute>} />
          <Route path="/admin/analytics" element={<ProtectedRoute roles={['admin']}><AdminAnalytics /></ProtectedRoute>} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
