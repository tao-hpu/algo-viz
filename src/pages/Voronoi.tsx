import { useMemo, useRef, useState } from 'react'
import { AlgoShell, Landing } from '../components/AlgoShell'
import { Player } from '../components/Player'
import { usePlayer } from '../lib/player'

/* ────────────────────────────────────────────────────────────
   Voronoi 剖分 · 一条「就近原则」长出的全局图样

   规则一句话：每个站点占住「离它比离任何别的站点都近」的那片地。
   两片地的界线就是两个站点的垂直平分线，别的什么也没有。

   页面里的格子是**算出来的，不是采样出来的**：
   拿画布矩形，对每个别的站点切一刀垂直平分线，剩下的多边形就是格子。
   n 只有几十，O(n²) 完全够用，而且是精确解，边界不会有锯齿。
   Delaunay 用空外接圆定义直接暴力判定（C(n,3) 个三元组逐个验），
   外接圆圆心当场算，正好落在 Voronoi 顶点上——对偶关系是看出来的。

   一处要说清的取舍：**Fortune 那一节画的是海滩线的包络，
   不是完整的事件队列 + 平衡树实现**。海滩线可以逐列取抛物线极值
   直接求出来，画面和真算法一模一样，但它演示的是算法的想法，
   不是算法的数据结构。真实现要处理圆事件和各种退化情形，
   代码量翻几倍，画面却不会更好看一分。这一点不含糊过去。
   ──────────────────────────────────────────────────────────── */

type Pt = [number, number]

const fmt = (v: number, d = 2) => v.toFixed(d)

/* ═══════════ 几何原语 ═══════════ */

/**
 * 半平面裁剪：只留下「离 a 比离 b 近」的那部分。
 * 边界正是 a、b 的垂直平分线，判据 (p−m)·(b−a) ≤ 0，m 为中点。
 * 这一刀就是整个 Voronoi 的全部内容，剩下的只是把它切 n−1 遍。
 */
function clipByBisector(poly: Pt[], a: Pt, b: Pt): Pt[] {
  const mx = (a[0] + b[0]) / 2
  const my = (a[1] + b[1]) / 2
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const f = (p: Pt) => (p[0] - mx) * dx + (p[1] - my) * dy
  const out: Pt[] = []
  for (let i = 0; i < poly.length; i++) {
    const c = poly[i]
    const d = poly[(i + 1) % poly.length]
    const fc = f(c)
    const fd = f(d)
    if (fc <= 1e-12) out.push(c)
    if ((fc < -1e-12 && fd > 1e-12) || (fc > 1e-12 && fd < -1e-12)) {
      const t = fc / (fc - fd)
      out.push([c[0] + t * (d[0] - c[0]), c[1] + t * (d[1] - c[1])])
    }
  }
  return out
}

/** 一般凸多边形裁剪（用于把格子切进翅膀轮廓里）。保留有向边 a→b 左侧。 */
function clipHalf(poly: Pt[], a: Pt, b: Pt): Pt[] {
  const side = (p: Pt) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])
  const out: Pt[] = []
  for (let i = 0; i < poly.length; i++) {
    const c = poly[i]
    const d = poly[(i + 1) % poly.length]
    const sc = side(c)
    const sd = side(d)
    if (sc >= -1e-12) out.push(c)
    if ((sc > 1e-12 && sd < -1e-12) || (sc < -1e-12 && sd > 1e-12)) {
      const t = sc / (sc - sd)
      out.push([c[0] + t * (d[0] - c[0]), c[1] + t * (d[1] - c[1])])
    }
  }
  return out
}

/** 每个站点的格子：从外框出发，对其他每个站点切一刀。 */
function voronoiCells(sites: Pt[], frame: Pt[]): Pt[][] {
  return sites.map((s, i) => {
    let poly = frame
    for (let j = 0; j < sites.length && poly.length; j++) {
      if (j !== i) poly = clipByBisector(poly, s, sites[j])
    }
    return poly
  })
}

function polyArea(p: Pt[]): number {
  let a = 0
  for (let i = 0; i < p.length; i++) {
    const q = p[(i + 1) % p.length]
    a += p[i][0] * q[1] - q[0] * p[i][1]
  }
  return Math.abs(a) / 2
}

function polyCentroid(p: Pt[]): Pt {
  let a2 = 0
  let cx = 0
  let cy = 0
  for (let i = 0; i < p.length; i++) {
    const c = p[i]
    const d = p[(i + 1) % p.length]
    const cr = c[0] * d[1] - d[0] * c[1]
    a2 += cr
    cx += (c[0] + d[0]) * cr
    cy += (c[1] + d[1]) * cr
  }
  if (Math.abs(a2) < 1e-9) {
    const n = p.length || 1
    return [p.reduce((s, q) => s + q[0], 0) / n, p.reduce((s, q) => s + q[1], 0) / n]
  }
  return [cx / (3 * a2), cy / (3 * a2)]
}

const toPath = (p: Pt[]) => (p.length ? p.map((q) => q.map((v) => v.toFixed(1)).join(',')).join(' ') : '')

/** 三点外接圆。三点共线时返回 null。 */
function circumcircle(a: Pt, b: Pt, c: Pt): { c: Pt; r: number } | null {
  const d = 2 * (a[0] * (b[1] - c[1]) + b[0] * (c[1] - a[1]) + c[0] * (a[1] - b[1]))
  if (Math.abs(d) < 1e-9) return null
  const sa = a[0] * a[0] + a[1] * a[1]
  const sb = b[0] * b[0] + b[1] * b[1]
  const sc = c[0] * c[0] + c[1] * c[1]
  const ux = (sa * (b[1] - c[1]) + sb * (c[1] - a[1]) + sc * (a[1] - b[1])) / d
  const uy = (sa * (c[0] - b[0]) + sb * (a[0] - c[0]) + sc * (b[0] - a[0])) / d
  return { c: [ux, uy], r: Math.hypot(a[0] - ux, a[1] - uy) }
}

/**
 * Delaunay 三角剖分，直接照定义算：
 * 一个三元组是 Delaunay 三角形，当且仅当它的外接圆里不含第四个站点。
 * n 只有十几个，C(n,3) 全枚举比写增量插入清楚得多，也不会有退化 bug。
 */
function delaunay(sites: Pt[]): { tri: [number, number, number]; cc: Pt; r: number }[] {
  const out: { tri: [number, number, number]; cc: Pt; r: number }[] = []
  const n = sites.length
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      for (let k = j + 1; k < n; k++) {
        const cir = circumcircle(sites[i], sites[j], sites[k])
        if (!cir) continue
        let empty = true
        for (let m = 0; m < n && empty; m++) {
          if (m === i || m === j || m === k) continue
          if (Math.hypot(sites[m][0] - cir.c[0], sites[m][1] - cir.c[1]) < cir.r - 1e-7) empty = false
        }
        if (empty) out.push({ tri: [i, j, k], cc: cir.c, r: cir.r })
      }
    }
  }
  return out
}

/** Andrew 单调链求凸包，用来保证翅膀轮廓是凸的（凸才能直接拿去裁剪）。 */
function convexHull(pts: Pt[]): Pt[] {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1])
  const cross = (o: Pt, a: Pt, b: Pt) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
  const half = (src: Pt[]) => {
    const h: Pt[] = []
    for (const q of src) {
      while (h.length >= 2 && cross(h[h.length - 2], h[h.length - 1], q) <= 0) h.pop()
      h.push(q)
    }
    return h
  }
  const lower = half(p)
  const upper = half([...p].reverse())
  return lower.slice(0, -1).concat(upper.slice(0, -1))
}

/** 可复现的伪随机：换种子 = 换一组站点，刷新页面结果不变。 */
function lcg(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

function scatter(seed: number, count: number, W: number, H: number, pad = 26): Pt[] {
  const rnd = lcg(seed)
  const out: Pt[] = []
  let guard = 0
  while (out.length < count && guard++ < 4000) {
    const p: Pt = [pad + rnd() * (W - 2 * pad), pad + rnd() * (H - 2 * pad)]
    // 别让两个站点贴太近，否则格子会退化成一条缝，看不出所以然。
    if (out.every((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) > 34)) out.push(p)
  }
  return out
}

const W = 460
const H = 320
const FRAME: Pt[] = [[0, 0], [W, 0], [W, H], [0, H]]

/* ═══════════ 面板一 · 拖着看 ═══════════ */

function SitesPanel() {
  const [seed, setSeed] = useState(7)
  const [sites, setSites] = useState<Pt[]>(() => scatter(7, 11, W, H))
  const [sel, setSel] = useState(0)
  const [showBisectors, setShowBisectors] = useState(true)
  const dragRef = useRef<number | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)

  const cells = useMemo(() => voronoiCells(sites, FRAME), [sites])

  function pointerTo(e: React.PointerEvent): Pt | null {
    const svg = svgRef.current
    if (!svg) return null
    const ctm = svg.getScreenCTM()
    if (!ctm) return null
    const p = new DOMPointReadOnly(e.clientX, e.clientY).matrixTransform(ctm.inverse())
    return [Math.max(4, Math.min(W - 4, p.x)), Math.max(4, Math.min(H - 4, p.y))]
  }

  function onDown(e: React.PointerEvent) {
    const p = pointerTo(e)
    if (!p) return
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
    let best = -1
    let bd = 26
    sites.forEach((s, i) => {
      const d = Math.hypot(s[0] - p[0], s[1] - p[1])
      if (d < bd) { bd = d; best = i }
    })
    if (best >= 0) { dragRef.current = best; setSel(best) }
  }

  function onMove(e: React.PointerEvent) {
    if (!e.buttons || dragRef.current === null) return
    const p = pointerTo(e)
    if (!p) return
    const k = dragRef.current
    setSites((prev) => prev.map((s, i) => (i === k ? p : s)))
  }

  const reseed = (delta: number) => {
    const s = seed + 1
    setSeed(s)
    setSites(scatter(s, Math.max(3, Math.min(24, sites.length + delta)), W, H))
    setSel(0)
  }

  const selCell = cells[sel] ?? []

  return (
    <div className="lab">
      <div className="controls" style={{ marginTop: 0, marginBottom: 14, borderTop: 'none', paddingTop: 0 }}>
        <div className="seg" role="group" aria-label="是否显示垂直平分线">
          <button className={showBisectors ? '' : 'on'} onClick={() => setShowBisectors(false)}>只看格子</button>
          <button className={showBisectors ? 'on' : ''} onClick={() => setShowBisectors(true)}>显示垂直平分线</button>
        </div>
        <button className="btn" onClick={() => reseed(1)}>加一个点</button>
        <button className="btn" onClick={() => reseed(-1)}>减一个点</button>
        <button className="btn" onClick={() => reseed(0)}>打乱</button>
      </div>

      <div className="lab-panel">
        <h4>拖动任意一个点，格子实时重算</h4>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={() => { dragRef.current = null }}
          style={{ cursor: 'grab', background: '#f3efe4' }}
          role="img"
          aria-label="可拖动站点的 Voronoi 剖分"
        >
          {cells.map((c, i) => (
            <polygon
              key={i}
              points={toPath(c)}
              fill={i === sel ? 'rgba(214, 69, 44, 0.10)' : '#f7f4ec'}
              stroke="#d6452c"
              strokeWidth={1.2}
              strokeLinejoin="round"
            />
          ))}

          {/* 选中站点到每个邻居的垂直平分线：格子的每条边都来自其中一条 */}
          {showBisectors && sites.map((s, j) => {
            if (j === sel) return null
            const a = sites[sel]
            const mx = (a[0] + s[0]) / 2
            const my = (a[1] + s[1]) / 2
            const dx = s[0] - a[0]
            const dy = s[1] - a[1]
            const L = Math.hypot(dx, dy) || 1
            const ux = -dy / L
            const uy = dx / L
            const T = 700
            return (
              <g key={j}>
                <line
                  x1={mx - ux * T} y1={my - uy * T} x2={mx + ux * T} y2={my + uy * T}
                  stroke="#4a6b52" strokeWidth={0.8} strokeDasharray="4 4" opacity={0.42}
                />
                <line x1={a[0]} y1={a[1]} x2={s[0]} y2={s[1]} stroke="#9a968a" strokeWidth={0.6} opacity={0.35} />
              </g>
            )
          })}

          {showBisectors && selCell.length > 0 && (
            <polygon points={toPath(selCell)} fill="none" stroke="#b5391f" strokeWidth={2.4} strokeLinejoin="round" />
          )}

          {sites.map((s, i) => (
            <g key={i}>
              <circle cx={s[0]} cy={s[1]} r={i === sel ? 6 : 4.4} fill={i === sel ? '#d6452c' : '#4a4740'} />
              {i === sel && <circle cx={s[0]} cy={s[1]} r={10} fill="none" stroke="#d6452c" strokeWidth={1} opacity={0.5} />}
            </g>
          ))}
        </svg>
      </div>

      <div className="readout">
        <div className="item">
          <span className="lbl">站点数</span>
          <span className="val">{sites.length}</span>
        </div>
        <div className="item">
          <span className="lbl">选中格子的边数</span>
          <span className="val">{selCell.length}</span>
        </div>
        <div className="item">
          <span className="lbl">它的面积占比</span>
          <span className="val">{fmt((polyArea(selCell) / (W * H)) * 100, 1)}%</span>
        </div>
      </div>

      <div className="step-note">
        虚线是选中的那个点<em>到每个其他点</em>的垂直平分线。红框那个格子的每一条边，
        都恰好落在其中某一条虚线上：<em>格子 = 所有半平面的交</em>。
        算法就是这句话的字面翻译，拿外框对每个别的点切一刀，切完剩下的就是它。
      </div>
    </div>
  )
}

/* ═══════════ 面板二 · 对偶：Delaunay ═══════════ */

type DualMode = 'voronoi' | 'delaunay' | 'both'

function DualPanel() {
  const [seed, setSeed] = useState(3)
  const [mode, setMode] = useState<DualMode>('both')
  const [showCircles, setShowCircles] = useState(false)
  const sites = useMemo(() => scatter(seed, 9, W, H, 46), [seed])
  const cells = useMemo(() => voronoiCells(sites, FRAME), [sites])
  const tris = useMemo(() => delaunay(sites), [sites])

  // 只画落在画布里的外接圆心，边界上的三角形圆心会跑到很远的地方。
  const inside = (p: Pt) => p[0] > 2 && p[0] < W - 2 && p[1] > 2 && p[1] < H - 2

  return (
    <div className="lab">
      <div className="controls" style={{ marginTop: 0, marginBottom: 14, borderTop: 'none', paddingTop: 0 }}>
        <div className="seg" role="group" aria-label="显示哪一层">
          {([['voronoi', 'Voronoi'], ['delaunay', 'Delaunay'], ['both', '两层叠加']] as [DualMode, string][]).map(
            ([k, label]) => (
              <button key={k} className={mode === k ? 'on' : ''} onClick={() => setMode(k)}>{label}</button>
            ),
          )}
        </div>
        <div className="seg" role="group" aria-label="是否显示外接圆">
          <button className={showCircles ? '' : 'on'} onClick={() => setShowCircles(false)}>不画外接圆</button>
          <button className={showCircles ? 'on' : ''} onClick={() => setShowCircles(true)}>画出外接圆</button>
        </div>
        <button className="btn" onClick={() => setSeed((s) => s + 1)}>换一组</button>
      </div>

      <div className="lab-panel">
        <h4>同一组点的两张图，互为对偶</h4>
        <svg viewBox={`0 0 ${W} ${H}`} style={{ background: '#f3efe4' }} role="img" aria-label="Voronoi 图与其对偶的 Delaunay 三角剖分">
          {mode !== 'delaunay' && cells.map((c, i) => (
            <polygon key={i} points={toPath(c)} fill="#f7f4ec" stroke="#d6452c" strokeWidth={1.2} strokeLinejoin="round" />
          ))}

          {showCircles && tris.map((t, i) => (
            <circle key={i} cx={t.cc[0]} cy={t.cc[1]} r={t.r} fill="none" stroke="#9a968a" strokeWidth={0.7} opacity={0.45} />
          ))}

          {mode !== 'voronoi' && tris.map((t, i) => (
            <polygon
              key={i}
              points={t.tri.map((k) => sites[k].join(',')).join(' ')}
              fill="none" stroke="#4a6b52" strokeWidth={1.4} strokeLinejoin="round"
            />
          ))}

          {/* 外接圆心 = Voronoi 顶点。两层都开时能看见它们精确重合。 */}
          {mode === 'both' && tris.filter((t) => inside(t.cc)).map((t, i) => (
            <circle key={i} cx={t.cc[0]} cy={t.cc[1]} r={3.4} fill="none" stroke="#4a6b52" strokeWidth={1.6} />
          ))}

          {sites.map((s, i) => (
            <circle key={i} cx={s[0]} cy={s[1]} r={4.4} fill="#4a4740" />
          ))}
        </svg>
      </div>

      <div className="legend">
        <span><i style={{ background: '#d6452c' }} />Voronoi 边（垂直平分线）</span>
        <span><i style={{ background: '#4a6b52' }} />Delaunay 边（连相邻的两个站点）</span>
        <span><i style={{ background: '#9a968a' }} />三角形的外接圆</span>
      </div>

      <div className="readout">
        <div className="item">
          <span className="lbl">站点</span>
          <span className="val">{sites.length}</span>
        </div>
        <div className="item">
          <span className="lbl">Delaunay 三角形</span>
          <span className="val">{tris.length}</span>
        </div>
        <div className="item">
          <span className="lbl">画布内的外接圆心</span>
          <span className="val">{tris.filter((t) => inside(t.cc)).length}</span>
        </div>
      </div>

      <div className="step-note">
        把「画出外接圆」打开：每个 Delaunay 三角形的外接圆里<em>一个别的站点都没有</em>，
        这正是 Delaunay 的定义，页面里的三角形就是照这条定义逐个验出来的。
        而每个圆的<em>圆心</em>（墨绿小圈）都精确落在一个 Voronoi 顶点上，
        因为「到三个站点等距的点」这句话，两边说的是同一件事。
      </div>
    </div>
  )
}

/* ═══════════ 面板三 · Fortune 扫描线 ═══════════ */

const SWEEP_STEPS = 96

function FortunePanel() {
  const [seed, setSeed] = useState(11)
  const sites = useMemo(() => scatter(seed, 8, W, H, 40), [seed])
  const cells = useMemo(() => voronoiCells(sites, FRAME), [sites])
  const p = usePlayer(SWEEP_STEPS, 10)

  const d = ((p.i + 0.5) / SWEEP_STEPS) * (H + 40) - 10 // 扫描线的 y
  const done = sites.filter((s) => s[1] < d)

  /**
   * 海滩线：对每个已扫过的站点，「到站点的距离 = 到扫描线的距离」是一条抛物线
   *   y = ((x−px)² + py² − d²) / (2(py − d))
   * 离站点更近的区域在抛物线上方，所以取所有抛物线的**上包络**（y 取最大）
   * 就是海滩线。逐列取极值，画出来跟真算法里那条线完全一致。
   */
  const beach = useMemo(() => {
    if (!done.length) return null
    const pts: Pt[] = []
    for (let x = 0; x <= W; x += 3) {
      let best = -Infinity
      for (const s of done) {
        const den = 2 * (s[1] - d)
        if (Math.abs(den) < 1e-6) continue
        const y = ((x - s[0]) ** 2 + s[1] ** 2 - d * d) / den
        if (y > best) best = y
      }
      if (best > -Infinity) pts.push([x, Math.min(best, d)])
    }
    return pts.length ? pts : null
  }, [done, d])

  // 海滩线以上的区域：这部分的边在真算法里已经被圆事件敲定，不会再变。
  const settled = beach
    ? `M0,-20 L${W},-20 L${W},${beach[beach.length - 1][1].toFixed(1)} ` +
      beach.slice().reverse().map((q) => `L${q[0].toFixed(1)},${q[1].toFixed(1)}`).join(' ') + ' Z'
    : ''

  return (
    <div className="lab">
      <div className="lab-panel">
        <h4>扫描线往下走，海滩线在它上面爬</h4>
        <svg viewBox={`0 0 ${W} ${H}`} style={{ background: '#f3efe4' }} role="img" aria-label="Fortune 扫描线算法的海滩线演示">
          <defs>
            <clipPath id="settled-clip">
              <path d={settled || 'M0,0 Z'} />
            </clipPath>
          </defs>

          {/* 已定稿的边：裁剪到海滩线以上 */}
          <g clipPath="url(#settled-clip)">
            {cells.map((c, i) => (
              <polygon key={i} points={toPath(c)} fill="none" stroke="#d6452c" strokeWidth={1.4} strokeLinejoin="round" />
            ))}
          </g>

          {/* 每个已扫站点的抛物线，淡淡铺一层 */}
          {done.map((s, i) => {
            let path = ''
            for (let x = 0; x <= W; x += 6) {
              const den = 2 * (s[1] - d)
              if (Math.abs(den) < 1e-6) continue
              const y = ((x - s[0]) ** 2 + s[1] ** 2 - d * d) / den
              if (y < -60) continue
              path += (path ? 'L' : 'M') + x + ' ' + y.toFixed(1)
            }
            return path ? <path key={i} d={path} fill="none" stroke="#9a968a" strokeWidth={0.7} opacity={0.4} /> : null
          })}

          {beach && (
            <path
              d={beach.map((q, i) => `${i ? 'L' : 'M'}${q[0].toFixed(1)} ${q[1].toFixed(1)}`).join('')}
              fill="none" stroke="#4a6b52" strokeWidth={2.4} strokeLinejoin="round"
            />
          )}

          <line x1={0} y1={d} x2={W} y2={d} stroke="#d6452c" strokeWidth={1.8} />
          <text x={6} y={d - 6} fontSize={11} fill="#b5391f" fontFamily="var(--font-mono)">扫描线</text>

          {sites.map((s, i) => (
            <circle
              key={i}
              cx={s[0]} cy={s[1]} r={4.6}
              fill={s[1] < d ? '#4a4740' : 'none'}
              stroke={s[1] < d ? 'none' : '#9a968a'}
              strokeWidth={1.4}
            />
          ))}
        </svg>
      </div>

      <Player p={p} extra={<button className="btn" onClick={() => setSeed((s) => s + 1)}>换一组</button>} />

      <div className="readout">
        <div className="item">
          <span className="lbl">已扫到的站点</span>
          <span className="val">{done.length} / {sites.length}</span>
        </div>
        <div className="item">
          <span className="lbl">海滩线上的弧段</span>
          <span className="val">{done.length ? '≤ ' + (2 * done.length - 1) : '0'}</span>
        </div>
        <div className="item">
          <span className="lbl">复杂度</span>
          <span className="val">O(n log n)</span>
        </div>
      </div>

      <div className="step-note">
        实心点是扫描线已经越过的站点，空心点还没轮到。墨绿那条<em>海滩线</em>由若干段抛物线拼成，
        每段对应一个站点。<em>海滩线以上的红边已经定稿</em>，无论后面还有多少个点冒出来都不会再变——
        这正是 Fortune 能做到 O(n log n) 的原因：它从不回头改已经画好的部分。
      </div>
    </div>
  )
}

/* ═══════════ 面板四 · Lloyd 松弛 ═══════════ */

const LLOYD_STEPS = 26

function LloydPanel() {
  const [seed, setSeed] = useState(5)

  // 整个迭代过程一次性摊平成帧，播放器只在帧数组上走。
  const frames = useMemo(() => {
    let sites = scatter(seed, 22, W, H, 18)
    const out: { sites: Pt[]; cells: Pt[][]; cv: number }[] = []
    for (let t = 0; t < LLOYD_STEPS; t++) {
      const cells = voronoiCells(sites, FRAME)
      const areas = cells.map(polyArea)
      const mean = areas.reduce((a, b) => a + b, 0) / areas.length
      const sd = Math.sqrt(areas.reduce((a, b) => a + (b - mean) ** 2, 0) / areas.length)
      out.push({ sites, cells, cv: sd / mean })
      sites = cells.map((c, i) => (c.length ? polyCentroid(c) : sites[i]))
    }
    return out
  }, [seed])

  const p = usePlayer(LLOYD_STEPS, 4)
  const f = frames[p.i]
  const areas = f.cells.map(polyArea)
  const mean = areas.reduce((a, b) => a + b, 0) / areas.length

  return (
    <div className="lab">
      <div className="lab-panel">
        <h4>反复「把点挪到自己格子的重心」</h4>
        <svg viewBox={`0 0 ${W} ${H}`} style={{ background: '#f3efe4' }} role="img" aria-label="Lloyd 松弛迭代过程">
          {f.cells.map((c, i) => {
            // 面积偏离均值越多越红，越接近越绿：方差在往下掉是看得见的。
            const dev = Math.min(1, Math.abs(areas[i] - mean) / mean)
            return (
              <polygon
                key={i}
                points={toPath(c)}
                fill={dev > 0.35 ? 'rgba(214,69,44,0.16)' : dev > 0.15 ? 'rgba(214,69,44,0.06)' : 'rgba(74,107,82,0.10)'}
                stroke="#c8bfae" strokeWidth={1} strokeLinejoin="round"
              />
            )
          })}
          {f.sites.map((s, i) => (
            <circle key={i} cx={s[0]} cy={s[1]} r={3.4} fill="#4a4740" />
          ))}
        </svg>
      </div>

      <Player p={p} extra={<button className="btn" onClick={() => setSeed((s) => s + 1)}>换一组</button>} />

      <div className="readout">
        <div className="item">
          <span className="lbl">迭代</span>
          <span className="val">{p.i}</span>
        </div>
        <div className="item">
          <span className="lbl">面积变异系数</span>
          <span className="val">{fmt(f.cv, 3)}</span>
        </div>
        <div className="item">
          <span className="lbl">相比第 0 步</span>
          <span className="val">{fmt((f.cv / frames[0].cv) * 100, 0)}%</span>
        </div>
      </div>

      <div className="step-note">
        规则还是纯局部的：<em>每个点只看自己那一格，挪到它的重心</em>，谁也没在协调全局。
        但格子的面积变异系数从 {fmt(frames[0].cv, 3)} 一路掉到 {fmt(frames[LLOYD_STEPS - 1].cv, 3)}，
        图样收敛成大片规整的六边形。这个迭代叫 <em>Lloyd 算法</em>，
        它同时也是 k-means 聚类的几何本体——k-means 每一轮干的正是这两步。
      </div>
    </div>
  )
}

/* ═══════════ 面板五 · 蜻蜓翅 ═══════════ */

const WING = convexHull([
  [22, 96], [52, 62], [110, 44], [180, 36], [250, 34], [318, 40],
  [372, 54], [408, 74], [428, 98], [430, 120], [412, 142], [370, 158],
  [300, 170], [220, 176], [150, 174], [92, 162], [46, 138], [26, 116],
])

function WingPanel() {
  const [seed, setSeed] = useState(2)

  const { sites, cells } = useMemo(() => {
    const rnd = lcg(seed)
    const pts: Pt[] = []
    let guard = 0
    // 前缘（上边）翅室更小、更密，跟真实翅脉的疏密梯度一致。
    while (pts.length < 74 && guard++ < 9000) {
      const x = 26 + rnd() * 400
      const y = 36 + rnd() * 138
      const inWing = WING.every((_, i) => {
        const a = WING[i]
        const b = WING[(i + 1) % WING.length]
        return (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]) >= 0
      })
      if (!inWing) continue
      const minGap = 15 + 16 * ((y - 36) / 138)
      if (pts.every((q) => Math.hypot(q[0] - x, q[1] - y) > minGap)) pts.push([x, y])
    }
    let cs = voronoiCells(pts, FRAME)
    // 把每个格子切进翅膀轮廓里
    cs = cs.map((c) => {
      let poly = c
      for (let i = 0; i < WING.length && poly.length; i++) {
        poly = clipHalf(poly, WING[i], WING[(i + 1) % WING.length])
      }
      return poly
    })
    return { sites: pts, cells: cs }
  }, [seed])

  return (
    <div className="lab">
      <div className="lab-panel">
        <h4>把同一条规则放进一个翅形区域</h4>
        <svg viewBox={`0 0 ${W} 200`} style={{ background: '#f3efe4' }} role="img" aria-label="翅形区域内的 Voronoi 剖分，形似蜻蜓翅脉">
          {cells.map((c, i) => (
            <polygon key={i} points={toPath(c)} fill="#faf7f0" stroke="#4a4740" strokeWidth={1} strokeLinejoin="round" />
          ))}
          <polygon points={toPath(WING)} fill="none" stroke="#4a4740" strokeWidth={2} strokeLinejoin="round" />
          {sites.map((s, i) => (
            <circle key={i} cx={s[0]} cy={s[1]} r={0.9} fill="#d6452c" opacity={0.5} />
          ))}
        </svg>
      </div>

      <div className="controls">
        <button className="btn" onClick={() => setSeed((s) => s + 1)}>换一组种子点</button>
        <div style={{ fontSize: 13.5, color: 'var(--ink-soft)', maxWidth: '28em' }}>
          这是<strong>示意图</strong>，不是某只真实蜻蜓的翅膀描摹：轮廓是手放的凸包，
          红点是按「前缘密、后缘疏」的梯度随机撒的。
        </div>
      </div>

      <div className="step-note">
        翅室数 <em>{cells.filter((c) => c.length > 2).length}</em>。
        没有任何一处代码画过一根翅脉，脉络全部是格子边界自己形成的——
        <em>撒点，然后各自占地</em>，就这两步。
      </div>
    </div>
  )
}

/* ═══════════ 页面 ═══════════ */

export function Voronoi() {
  return (
    <AlgoShell
      slug="voronoi"
      lede={
        <>
          规则只有一句：每个点占住<strong>离它比离任何别的点都近</strong>的那片地。
          没有第二条。剩下所有东西——蜂窝般的格子、蜻蜓翅上的脉络、
          有限元网格、手机基站的覆盖范围——都是这一句的后果。
        </>
      }
    >
      <p>
        上一页说向日葵的时候留了个尾巴：Cristóbal Vila 那支短片最后的蜻蜓翅膀镜头，
        跟黄金分割其实没关系。它是这一页的东西。
        两者共享的不是 φ，是更深的那件事：<strong>一条只看局部的规则，跑出一个全局的图样</strong>。
        向日葵那条是「挤进最大的空隙」，这里这条是「归给最近的中心」。
      </p>

      <h2>第一幕 · 界线就是垂直平分线</h2>
      <p>
        两个点 A、B 在平面上，哪些地方离 A 更近？答案是它们连线的垂直平分线切出来的那半边。
        这是初中几何。Voronoi 剖分只是把这件事对所有点做一遍：
        A 的地盘 = 对每个其他点各切一刀之后剩下的那块。
      </p>

      <SitesPanel />

      <p>
        所以算法本身没有任何玄机，就是上面这句话的字面翻译：
        拿画布当初始多边形，对每个别的站点切一刀半平面，切完就是格子。
        n 个点做 n 遍，复杂度 <span className="k">O(n²)</span>。
        页面里的格子全是这么精确算出来的，不是把画布逐像素染色染出来的，
        所以你把点拖到任何位置，边界都是干净的直线，不会有锯齿。
      </p>
      <p>
        n 大了以后 O(n²) 当然不够用。经典的做法是 Fortune 的扫描线，
        <span className="k">O(n log n)</span>，第三幕会看到它长什么样。
      </p>

      <h2>第二幕 · 翻过来看，就是 Delaunay</h2>
      <p>
        把共享一条边的两个站点连起来，得到的三角网叫 <strong>Delaunay 三角剖分</strong>，
        它是 Voronoi 图的对偶。同一组点，同一份信息，两种画法。
      </p>

      <DualPanel />

      <p>
        Delaunay 有个漂亮的等价定义：<strong>每个三角形的外接圆里不含第四个站点</strong>。
        页面里的三角形就是照这条定义暴力验出来的，把所有三元组枚举一遍，
        挨个检查外接圆是不是空的。点只有几个，这么写比增量插入清楚得多，也不会踩退化情形的坑。
      </p>
      <p>
        对偶关系最直观的一处是：<strong>外接圆的圆心就是 Voronoi 的顶点</strong>。
        道理很简单，Voronoi 顶点是「到三个站点等距」的点，而外接圆圆心也是「到三个顶点等距」的点，
        两句话说的是同一件事。把「两层叠加」和「画出外接圆」都打开就能看到它们精确重合。
      </p>
      <p>
        这个对偶不是数学上的花絮，它是 Delaunay 在工程上到处被用的原因：
        Delaunay 三角形在所有三角剖分里<strong>最大化最小内角</strong>，也就是最不容易出现又细又长的
        「针形三角形」。有限元求解、地形建模、三维重建都要求网格质量，用的就是这一条。
      </p>

      <h2>第三幕 · Fortune 的扫描线</h2>
      <p>
        直接算 O(n²)，点一多就吃不消。Fortune 在 1986 年给了一个 O(n log n) 的办法，
        思路很反直觉：用一条水平线从上往下扫，边扫边把图建出来。
      </p>
      <p>
        难点在于，扫描线还没走到的地方可能还藏着站点，会把已经画的边改掉。
        Fortune 的解法是维护一条<strong>海滩线</strong>：它由若干段抛物线拼成，
        每段属于一个已扫过的站点，代表「到这个站点的距离等于到扫描线的距离」。
        海滩线以上的区域，无论下面还剩多少个点，都已经彻底定稿。
      </p>

      <FortunePanel />

      <p>
        拖播放条看那条墨绿的线：新站点被扫到时，海滩线上会冒出一段新弧（站点事件）；
        某段弧被两侧挤到宽度归零时消失，同时敲定一个 Voronoi 顶点（圆事件）。
        整个算法就是这两类事件的有序处理，事件放在优先队列里，海滩线放在平衡树里，
        各自 log n，总共 <span className="k">O(n log n)</span>。
      </p>
      <p>
        <strong>说明一下这一节的实现边界</strong>：上面那条海滩线是把所有抛物线取上包络<em>直接算</em>出来的，
        不是从事件队列和平衡树里跑出来的。画面和真算法一致，但它演示的是算法的想法，
        不是算法的数据结构。完整实现要处理圆事件与一堆退化情形，代码量翻几倍，画面不会更好看一分，
        所以这里没做——但不该让你以为做了。
      </p>

      <h2>第四幕 · Lloyd 松弛：再加一条局部规则</h2>
      <p>
        现在往上面叠一条同样只看局部的规则：<strong>每个站点挪到自己格子的重心，然后重新剖分，反复</strong>。
      </p>

      <LloydPanel />

      <p>
        几步之后，杂乱的格子收敛成大片规整的六边形。没有谁在协调全局，
        每个点自始至终只看得见自己那一格。这跟上一页向日葵的结构是同一个：
        局部规则的不动点，就是那个看起来「被设计过」的图样。
      </p>
      <p>
        这个迭代有个名字叫 <strong>Lloyd 算法</strong>，1957 年提出来是为了脉冲编码调制里的量化器设计。
        它还有另一个更出名的身份：<strong>k-means 聚类每一轮干的正是这两步</strong>，
        「把每个样本归给最近的中心」就是求 Voronoi 剖分，「把中心挪到簇的均值」就是取重心。
        换句话说 k-means 是在特征空间里跑 Lloyd 松弛，上面这张图就是它收敛过程的几何原型。
      </p>

      <h2>尾声 · 回到那只蜻蜓</h2>

      <WingPanel />

      <p>
        这张图能画到几分真？2018 年 Hoffmann 等人在 PNAS 上做过一次定量检验，
        量了蜻蜓目 17 科 232 个物种的 468 只翅膀。结论的前半段站得住：翅室多边形的边数分布、
        以及「主脉挨得近的地方多出四边形、离得远的地方多出五六边形」这些特征，
        跟均匀撒点的 Voronoi 剖分高度相似，所以他们干脆拿 Voronoi 当发育模型的骨架——
        而把种子点摊匀用的，正是上一幕那个 Lloyd 迭代。
      </p>
      <p>
        但后半段得说全：<strong>光有 Voronoi 还不够</strong>。他们发现纯 Voronoi 版本
        系统性地把翅室画得太圆，还得再叠上翅芽后期的各向异性生长，形状才对得上真翅膀。
        所以准确的说法是：Voronoi 是这套图样的一阶近似，不是它的定义。
        真正共享的仍然是那件事——发育里<strong>「各自占地直到碰头」这条局部规则，
        写成数学的第一步就是求 Voronoi 剖分</strong>。细胞按各自的中心往外长，长到相遇为止，
        边界自然落在垂直平分线上。
      </p>
      <p>
        同一条规则在别处也反复出现：金属凝固时的晶粒边界、干裂泥地的裂纹网、
        长颈鹿身上的斑块、鸟群的个体间距。它们的共同点不是长得像，
        是<strong>背后那条规则同构</strong>。
      </p>

      <Landing>
        Voronoi 的实用价值几乎全来自它的对偶和它的近邻语义：
        问「最近的基站/医院/仓库是哪个」，就是在查 Voronoi 格子；
        要一张不含针形三角形的高质量网格，就是要 Delaunay；
        要把一堆样本分成 k 类，跑的是 Lloyd 松弛。
        这三件事在工程上看起来毫不相干，几何上却是同一张图的三个侧面。
        遇到「就近归属」四个字的时候，多半可以往这里想。
      </Landing>
    </AlgoShell>
  )
}
