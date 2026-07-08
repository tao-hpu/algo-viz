import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { lazy, Suspense } from 'react'
import { Layout } from './site/Layout'
import { Home } from './pages/Home'

// 算法页按需加载：首页只下外壳 + Home，点哪个算法才拉哪个的代码。
// 页面是具名导出，用 .then 取出对应命名成员当 default。
const L = <T,>(p: Promise<T>, k: keyof T) =>
  lazy(() => p.then((m) => ({ default: m[k] as React.ComponentType })))

const Jacobian = L(import('./pages/Jacobian'), 'Jacobian')

function PageFallback() {
  return <div className="page-loading" role="status" aria-live="polite">加载中…</div>
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="/a/jacobian" element={<Suspense fallback={<PageFallback />}><Jacobian /></Suspense>} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
