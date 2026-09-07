import { Routes, Route, Navigate } from 'react-router-dom'
import MainPage from './pages/MainPage.jsx'
import AdminPage from './pages/AdminPage.jsx'
import SharedPortfolioPage from './pages/SharedPortfolioPage.jsx'
import { useAuth } from './context/AuthContext.jsx'

function ProtectedAdmin() {
  const { user, loading } = useAuth()
  if (loading) return null
  if (!user || user.role !== 'admin') return <Navigate to="/" replace />
  return <AdminPage />
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<MainPage />} />
      <Route path="/admin" element={<ProtectedAdmin />} />
      <Route path="/p/:slug" element={<SharedPortfolioPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
