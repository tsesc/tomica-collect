import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Layout } from './components/Layout'

function Placeholder({ name }: { name: string }) {
  return <div className="p-4 text-on-surface font-body">{name} — coming soon</div>
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Placeholder name="Home" />} />
          <Route path="catalog" element={<Placeholder name="Catalog" />} />
          <Route path="collection" element={<Placeholder name="Collection" />} />
          <Route path="settings" element={<Placeholder name="Settings" />} />
          <Route path="scan-result" element={<Placeholder name="Scan Result" />} />
        </Route>
        <Route path="auth" element={<Placeholder name="Auth" />} />
      </Routes>
    </BrowserRouter>
  )
}
