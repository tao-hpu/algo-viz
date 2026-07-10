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
const GradientField = L(import('./pages/GradientField'), 'GradientField')
const Taylor = L(import('./pages/Taylor'), 'Taylor')
const GradientDescent = L(import('./pages/GradientDescent'), 'GradientDescent')
const Momentum = L(import('./pages/Momentum'), 'Momentum')
const QuickSort = L(import('./pages/QuickSort'), 'QuickSort')
const MergeSort = L(import('./pages/MergeSort'), 'MergeSort')
const BfsDfs = L(import('./pages/BfsDfs'), 'BfsDfs')
const Dijkstra = L(import('./pages/Dijkstra'), 'Dijkstra')

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
          <Route path="/a/gradient-field" element={<Suspense fallback={<PageFallback />}><GradientField /></Suspense>} />
          <Route path="/a/taylor" element={<Suspense fallback={<PageFallback />}><Taylor /></Suspense>} />
          <Route path="/a/gradient-descent" element={<Suspense fallback={<PageFallback />}><GradientDescent /></Suspense>} />
          <Route path="/a/momentum" element={<Suspense fallback={<PageFallback />}><Momentum /></Suspense>} />
          <Route path="/a/quicksort" element={<Suspense fallback={<PageFallback />}><QuickSort /></Suspense>} />
          <Route path="/a/merge-sort" element={<Suspense fallback={<PageFallback />}><MergeSort /></Suspense>} />
          <Route path="/a/bfs-dfs" element={<Suspense fallback={<PageFallback />}><BfsDfs /></Suspense>} />
          <Route path="/a/dijkstra" element={<Suspense fallback={<PageFallback />}><Dijkstra /></Suspense>} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
