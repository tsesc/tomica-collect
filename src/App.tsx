import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Layout } from './components/Layout'
import { HomePage } from './pages/HomePage'
import { ScanResultPage } from './pages/ScanResultPage'
import { CatalogPage } from './pages/CatalogPage'
import { CollectionPage } from './pages/CollectionPage'
import { SettingsPage } from './pages/SettingsPage'
import { AuthPage } from './pages/AuthPage'
import { useAuth } from './hooks/useAuth'
import { RecognitionProvider } from './hooks/useRecognition'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="min-h-screen bg-surface flex items-center justify-center"><div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" /></div>
  if (!user) return <Navigate to="/auth" />
  return <>{children}</>
}

export default function App() {
  return (
    <BrowserRouter>
      <RecognitionProvider>
        <Routes>
          <Route path="/auth" element={<AuthPage />} />
          <Route element={<Layout />}>
            {/* Public routes — no login required */}
            <Route path="catalog" element={<CatalogPage />} />

            {/* Protected routes — login required */}
            <Route index element={<ProtectedRoute><HomePage /></ProtectedRoute>} />
            <Route path="scan-result" element={<ProtectedRoute><ScanResultPage /></ProtectedRoute>} />
            <Route path="collection" element={<ProtectedRoute><CollectionPage /></ProtectedRoute>} />
            <Route path="settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
          </Route>
        </Routes>
      </RecognitionProvider>
    </BrowserRouter>
  )
}
