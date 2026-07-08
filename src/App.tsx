import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { lazy, Suspense } from 'react'
import { Layout } from './site/Layout'
import { Home } from './pages/Home'

// 算法页按需加载：首页只下外壳 + Home，点哪个算法才拉哪个的代码。
// 页面是具名导出，用 .then 取出对应命名成员当 default。
const L = <T,>(p: Promise<T>, k: keyof T) =>
  lazy(() => p.then((m) => ({ default: m[k] as React.ComponentType })))

const Jacobian = L(import('./pages/Jacobian'), 'Jacobian')
const Derivative = L(import('./pages/Derivative'), 'Derivative')
const Powers = L(import('./pages/Powers'), 'Powers')
const DerivRules = L(import('./pages/DerivRules'), 'DerivRules')
const PartialDerivatives = L(import('./pages/PartialDerivatives'), 'PartialDerivatives')
const MatrixVector = L(import('./pages/MatrixVector'), 'MatrixVector')
const Linearization = L(import('./pages/Linearization'), 'Linearization')

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
          <Route path="/a/derivative" element={<Suspense fallback={<PageFallback />}><Derivative /></Suspense>} />
          <Route path="/a/powers" element={<Suspense fallback={<PageFallback />}><Powers /></Suspense>} />
          <Route path="/a/deriv-rules" element={<Suspense fallback={<PageFallback />}><DerivRules /></Suspense>} />
          <Route path="/a/partial-derivatives" element={<Suspense fallback={<PageFallback />}><PartialDerivatives /></Suspense>} />
          <Route path="/a/matrix-vector" element={<Suspense fallback={<PageFallback />}><MatrixVector /></Suspense>} />
          <Route path="/a/linearization" element={<Suspense fallback={<PageFallback />}><Linearization /></Suspense>} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
