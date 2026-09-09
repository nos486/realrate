import { Routes, Route, Navigate } from 'react-router-dom'
import MainPage from './pages/MainPage.jsx'
import AdminPage from './pages/AdminPage.jsx'
import PriceSourcesPage from './pages/PriceSourcesPage.jsx'
import SharedPortfolioPage from './pages/SharedPortfolioPage.jsx'
import { useAuth } from './context/AuthContext.jsx'
import FullscreenLoader from './components/FullscreenLoader.jsx'

function ProtectedAdmin() {
  const { user, loading } = useAuth()
  if (loading) return null
  if (!user || user.role !== 'admin') return <Navigate to="/" replace />
  return <AdminPage />
}

function ProtectedAdminSources() {
  const { user, loading } = useAuth()
  if (loading) return null
  if (!user || user.role !== 'admin') return <Navigate to="/" replace />
  return <PriceSourcesPage />
}

export default function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<MainPage />} />
        <Route path="/rates" element={<MainPage />} />
        <Route path="/market" element={<Navigate to="/" replace />} />
        <Route path="/portfolio" element={<MainPage />} />
        <Route path="/portfolio/:portfolioId" element={<MainPage />} />
        <Route path="/admin" element={<ProtectedAdmin />} />
        <Route path="/admin/sources" element={<ProtectedAdminSources />} />
        <Route path="/p/:slug" element={<SharedPortfolioPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <FullscreenLoader />
    </>
  )
}
