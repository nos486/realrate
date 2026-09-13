import { Routes, Route, Navigate } from 'react-router-dom';
import MainPage from './pages/MainPage.jsx';
import SharedPortfolioPage from './pages/SharedPortfolioPage.jsx';
import FullscreenLoader from './components/FullscreenLoader.jsx';
import { PricingProvider } from './context/PricingContext.jsx';

export default function App() {
  return (
    <PricingProvider>
      <Routes>
        <Route path="/" element={<MainPage />} />
        <Route path="/rates" element={<MainPage />} />
        <Route path="/market" element={<Navigate to="/" replace />} />
        <Route path="/portfolio" element={<MainPage />} />
        <Route path="/portfolio/:portfolioId" element={<MainPage />} />
        <Route path="/settings" element={<MainPage />} />
        <Route path="/admin" element={<MainPage />} />
        <Route path="/admin/sources" element={<MainPage />} />
        <Route path="/admin/derived" element={<Navigate to="/admin/sources" replace />} />
        <Route path="/derived-assets" element={<Navigate to="/admin/sources" replace />} />
        <Route path="/sources" element={<MainPage />} />
        <Route path="/p/:slug" element={<SharedPortfolioPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <FullscreenLoader />
    </PricingProvider>
  );
}

