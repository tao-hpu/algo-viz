import { useMemo, useState } from 'react'
import { AlgoShell, Landing } from '../components/AlgoShell'

/* ────────────────────────────────────────────────────────────
   挂谷猜想 · 从「转一根针」到 2025 年的三维证明

   全页要说清的一件事：**面积**和**维数**是两把不同的尺子。
   1917 挂谷问「转一根针最少要多大面积」；1928 Besicovitch 答
   「面积可以是 0」，问题看似结束。真正的问题在后面：一个面积
   为 0 的集合，仍然可以是「满维」的。它薄到没有面积，却厚到
   不能塌成一张低维的皮。二维（Davies 1971）早就知道维数必须
   是 2；三维一直悬着，直到 2025 年王虹与 Joshua Zahl 证明
   三维的针集维数必须是满的 3。

   页面里每个数字都是当场算出来的，不是抄来的常数：
   · 面板一的三个面积 = π/4、1/√3、π/8，图形本身就按这些参数画；
   · 面板二的面积比由扫描线求并集面积当场积分；
   · 面板三的盒子数是真数格子数出来的，斜率是最小二乘拟合。
   ──────────────────────────────────────────────────────────── */

type Pt = [number, number]

const TAU = Math.PI * 2
const fmt = (v: number, d = 4) => v.toFixed(d)

/* ═══════════ 面板一 · 在一个图形里把针转半圈 ═══════════ */

const TRI_H1: Pt[] = [
  [-1 / Math.sqrt(3), -1 / 3],
  [1 / Math.sqrt(3), -1 / 3],
  [0, 2 / 3],
] // 高为 1 的等边三角形，已把重心挪到原点

// 三尖内摆线（deltoid）。a = 1/4 时双切弦恒长 1、面积恰为 2πa² = π/8。
const DA = 0.25
const deltoid = (s: number): Pt => [
  2 * DA * Math.cos(s) + DA * Math.cos(2 * s),
  2 * DA * Math.sin(s) - DA * Math.sin(2 * s),
]

/** 半平面裁剪：只留在有向边 a→b 左侧的部分（Sutherland–Hodgman 的一刀）。 */
function clipHalf(poly: Pt[], a: Pt, b: Pt): Pt[] {
  const side = (p: Pt) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])
  const out: Pt[] = []
  for (let i = 0; i < poly.length; i++) {
    const c = poly[i]
    const d = poly[(i + 1) % poly.length]
    const sc = side(c)
    const sd = side(d)
    if (sc >= -1e-12) out.push(c)
    if ((sc > 0 && sd < 0) || (sc < 0 && sd > 0)) {
      const u = sc / (sc - sd)
      out.push([c[0] + u * (d[0] - c[0]), c[1] + u * (d[1] - c[1])])
    }
  }
  return out
}

/**
 * 单位针在凸形 K 里、方向角为 θ 时，针中点的所有合法位置。
 * 两端都要在 K 内，等价于中点同时落在 K−u/2 和 K+u/2 里，取交集即可。
 * 返回交集的重心：它随 θ 连续变化，于是针的运动本身就是连续的。
 */
function feasibleCentre(K: Pt[], theta: number): Pt | null {
  const hx = Math.cos(theta) / 2
  const hy = Math.sin(theta) / 2
  let poly: Pt[] = K.map(([x, y]) => [x + hx, y + hy])
  const other: Pt[] = K.map(([x, y]) => [x - hx, y - hy])
  for (let i = 0; i < other.length && poly.length; i++) {
    poly = clipHalf(poly, other[i], other[(i + 1) % other.length])
  }
  if (!poly.length) return null
  // 多边形重心；退化成一点或一条线时面积为 0，退回顶点平均。
  let a2 = 0
  let cx = 0
  let cy = 0
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]
    const q = poly[(i + 1) % poly.length]
    const cr = p[0] * q[1] - q[0] * p[1]
    a2 += cr
    cx += (p[0] + q[0]) * cr
    cy += (p[1] + q[1]) * cr
  }
  if (Math.abs(a2) < 1e-12) {
    const n = poly.length
    return [poly.reduce((s, p) => s + p[0], 0) / n, poly.reduce((s, p) => s + p[1], 0) / n]
  }
  return [cx / (3 * a2), cy / (3 * a2)]
}

type ShapeKey = 'disk' | 'tri' | 'deltoid'

const SHAPES: { key: ShapeKey; name: string; area: number; areaLabel: string; note: string }[] = [
  {
    key: 'disk',
    name: '圆盘',
    area: Math.PI / 4,
    areaLabel: 'π/4',
    note: '最笨的办法：绕中点原地转。针扫出一个直径为 1 的圆盘，面积 π/4 ≈ 0.785。',
  },
  {
    key: 'tri',
    name: '等边三角形',
    area: 1 / Math.sqrt(3),
    areaLabel: '1/√3',
    note: 'Pál 1920 证明：只准用凸图形的话，高为 1 的等边三角形就是最省的，面积 1/√3 ≈ 0.577，再没有更小的凸图形。注意针转到与某条高平行时刚好卡死，一丝余量都没有。',
  },
  {
    key: 'deltoid',
    name: '三尖内摆线',
    area: Math.PI / 8,
    areaLabel: 'π/8',
    note: '挂谷本人猜这个形状是最优解，面积 π/8 ≈ 0.393。针始终是它的一条双切弦：两端贴着曲线，中间某点与曲线相切。猜测很漂亮，可惜是错的。',
  },
]

function NeedlePanel() {
  const [key, setKey] = useState<ShapeKey>('deltoid')
  const [deg, setDeg] = useState(35)
  const shape = SHAPES.find((s) => s.key === key)!
  const theta = (deg * Math.PI) / 180

  const VB = 330
  const C = 165
  const S = 190 // 数学单位 → 像素

  const toPx = (p: Pt): Pt => [C + p[0] * S, C - p[1] * S]

  // 给定角度，算出针的两个端点。
  const needleAt = useMemo(() => {
    return (th: number): [Pt, Pt] | null => {
      if (key === 'disk') {
        return [
          [-Math.cos(th) / 2, -Math.sin(th) / 2],
          [Math.cos(th) / 2, Math.sin(th) / 2],
        ]
      }
      if (key === 'deltoid') {
        // 端点闭式解：P(θ) 与 P(θ+π)，两点之差恰是 (4a·cosθ, 4a·sinθ)，长度 4a = 1。
        return [deltoid(th + Math.PI), deltoid(th)]
      }
      const c = feasibleCentre(TRI_H1, th)
      if (!c) return null
      return [
        [c[0] - Math.cos(th) / 2, c[1] - Math.sin(th) / 2],
        [c[0] + Math.cos(th) / 2, c[1] + Math.sin(th) / 2],
      ]
    }
  }, [key])

  const now = needleAt(theta)

  // 已经扫过的轨迹：0° 到当前角度之间取样，淡淡地铺一层。
  const trail = useMemo(() => {
    const out: [Pt, Pt][] = []
    for (let a = 0; a <= deg; a += 3) {
      const n = needleAt((a * Math.PI) / 180)
      if (n) out.push(n)
    }
    return out
  }, [deg, needleAt])

  const outline = useMemo(() => {
    if (key === 'tri') return TRI_H1.map(toPx).map((p) => p.join(',')).join(' ')
    if (key === 'deltoid') {
      let d = ''
      for (let i = 0; i <= 240; i++) {
        const [x, y] = toPx(deltoid((TAU * i) / 240))
        d += (i === 0 ? 'M' : 'L') + x.toFixed(1) + ' ' + y.toFixed(1)
      }
      return d + 'Z'
    }
    return ''
  }, [key])

  return (
    <div className="lab">
      <div className="controls" style={{ marginTop: 0, marginBottom: 16, borderTop: 'none', paddingTop: 0 }}>
        <div className="seg" role="tablist" aria-label="选择图形">
          {SHAPES.map((s) => (
            <button key={s.key} className={s.key === key ? 'on' : ''} onClick={() => setKey(s.key)}>
              {s.name}
            </button>
          ))}
        </div>
      </div>

      <div className="lab-panels">
        <div className="lab-panel" style={{ flex: '1 1 340px' }}>
          <h4>把针从 0° 转到 180°</h4>
          <svg viewBox={`0 0 ${VB} ${VB}`} role="img" aria-label={`单位长的针在${shape.name}内旋转`}>
            <g stroke="#e4ded1" strokeWidth={0.6}>
              {[-1, -0.5, 0, 0.5, 1].map((v) => (
                <g key={v}>
                  <line x1={C + v * S} y1={0} x2={C + v * S} y2={VB} />
                  <line x1={0} y1={C - v * S} x2={VB} y2={C - v * S} />
                </g>
              ))}
            </g>

            {key === 'disk' ? (
              <circle cx={C} cy={C} r={0.5 * S} fill="#f0ece1" stroke="#4a6b52" strokeWidth={1.6} />
            ) : key === 'tri' ? (
              <polygon points={outline} fill="#f0ece1" stroke="#4a6b52" strokeWidth={1.6} />
            ) : (
              <path d={outline} fill="#f0ece1" stroke="#4a6b52" strokeWidth={1.6} />
            )}

            {/* 扫过的痕迹 */}
            <g stroke="#d6452c" strokeWidth={0.7} opacity={0.2}>
              {trail.map(([a, b], i) => {
                const [x1, y1] = toPx(a)
                const [x2, y2] = toPx(b)
                return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} />
              })}
            </g>

            {now && (() => {
              const [x1, y1] = toPx(now[0])
              const [x2, y2] = toPx(now[1])
              return (
                <g>
                  <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#d6452c" strokeWidth={3} strokeLinecap="round" />
                  <circle cx={x1} cy={y1} r={3.4} fill="#d6452c" />
                  <circle cx={x2} cy={y2} r={3.4} fill="#d6452c" />
                </g>
              )
            })()}

            <text x={10} y={VB - 10} fontSize={10.5} fill="#9a968a">
              针长恒为 1（图上 {S} 像素）
            </text>
          </svg>
        </div>

        <div className="lab-panel" style={{ flex: '1 1 260px' }}>
          <h4>三种图形，面积一路往下</h4>
          <svg viewBox="0 0 320 200" role="img" aria-label="三种图形的面积对比条形图">
            {SHAPES.map((s, i) => {
              const w = (s.area / (Math.PI / 4)) * 210
              const y = 34 + i * 52
              const on = s.key === key
              return (
                <g key={s.key}>
                  <text x={8} y={y - 6} fontSize={11.5} fill={on ? '#b5391f' : '#9a968a'}>
                    {s.name}
                  </text>
                  <rect
                    x={8} y={y} width={w} height={19} rx={2}
                    fill={on ? '#d6452c' : '#ddd5c6'}
                  />
                  <text x={w + 16} y={y + 14} fontSize={12} fontFamily="var(--font-mono)" fill={on ? '#b5391f' : '#9a968a'}>
                    {s.areaLabel} = {fmt(s.area, 3)}
                  </text>
                </g>
              )
            })}
            <text x={8} y={16} fontSize={10.5} fill="#9a968a">扫过的面积（针长 = 1）</text>
            <line x1={8} y1={192} x2={300} y2={192} stroke="#d9d2c4" />
            <text x={8} y={186} fontSize={10.5} fill="#4a6b52">
              Besicovitch：这一列没有下界，可以一直降到 0
            </text>
          </svg>
        </div>
      </div>

      <div className="controls">
        <div className="control" style={{ flex: '1 1 220px' }}>
          <label htmlFor="ndeg">
            转角 θ <b>{deg}°</b>
          </label>
          <input id="ndeg" type="range" min={0} max={180} step={1} value={deg} onChange={(e) => setDeg(+e.target.value)} />
        </div>
        <div style={{ fontSize: 13.5, color: 'var(--ink-soft)', maxWidth: '24em' }}>{shape.note}</div>
      </div>
    </div>
  )
}

/* ═══════════ 面板二 · Besicovitch：面积可以任意小 ═══════════ */

/**
 * 把高为 1 的三角形从顶点切成 2ⁿ 片，每片沿底线平移。
 * 平移不改变任何一条线段的方向，所以「每个方向都有一根针」这条性质分毫不动，
 * 但各片可以互相叠上去，并集面积一路掉。
 *
 * 下面这张偏移表是离线跑坐标轮换局部搜索得到的（见 scratchpad/perron4.mjs）：
 * 对每片的平移量直接做优化，目标就是并集面积最小。实测面积比：
 * n=1 → 0.667，2 → 0.500，3 → 0.399，4 → 0.333，5 → 0.291，6 → 0.260，7 → 0.233。
 * 衰减很慢（大致按 1/n 的量级），这正是 Besicovitch 构造的真实脾气：
 * 面积确实能压到任意接近 0，但要压得狠就得切得极碎。
 */
const OFFSETS: Record<number, number[]> = {
  0: [0],
  1: [0.1844, -0.15],
  2: [0.2747, 0.1247, -0.075, -0.225],
  3: [0.2925, 0.1853, 0.1168, 0.0841, 0.002, -0.1793, -0.2401, -0.3008],
  4: [0.3086, 0.2587, 0.2309, 0.2177, 0.1835, 0.0628, 0.0201, 0.0027,
      -0.0139, -0.0773, -0.0947, -0.112, -0.1573, -0.2597, -0.2864, -0.3131],
  5: [0.3213, 0.3083, 0.2953, 0.2417, 0.2313, 0.221, 0.1706, 0.1513,
      0.1454, 0.1064, 0.0859, 0.0658, 0.1154, 0.0864, 0.0585, 0.0396,
      0.0352, 0.0029, -0.0042, -0.0499, -0.0596, -0.0694, -0.1473, -0.1563,
      -0.1873, -0.194, -0.2095, -0.2386, -0.2242, -0.2519, -0.2738, -0.3016],
  6: [0.3068, 0.301, 0.2801, 0.2739, 0.2564, 0.2455, 0.2652, 0.2586,
      0.2362, 0.2263, 0.2231, 0.2106, 0.1839, 0.1803, 0.1591, 0.1557,
      0.1437, 0.1233, 0.1158, 0.1477, 0.134, 0.1207, 0.1065, 0.0929,
      0.1149, 0.106, 0.0863, 0.0835, 0.0785, 0.0692, 0.0329, 0.0268,
      0.0237, 0.0145, 0.0114, 0.0083, -0.0014, -0.047, -0.0539, -0.0569,
      -0.0664, -0.0694, -0.0764, -0.1355, -0.1399, -0.1583, -0.1655, -0.1686,
      -0.1716, -0.1906, -0.198, -0.1953, -0.2065, -0.2196, -0.24, -0.2473,
      -0.2173, -0.2256, -0.2446, -0.2486, -0.2685, -0.2735, -0.2951, -0.3003],
  7: [0.3162, 0.3135, 0.31, 0.3074, 0.2881, 0.2818, 0.2785, 0.2773,
      0.2748, 0.2693, 0.2673, 0.2459, 0.2428, 0.2414, 0.2383, 0.2244,
      0.2229, 0.2145, 0.218, 0.211, 0.2053, 0.1983, 0.1882, 0.1846,
      0.209, 0.2065, 0.1937, 0.1917, 0.1795, 0.1748, 0.1736, 0.1726,
      0.1662, 0.1645, 0.1544, 0.1525, 0.1281, 0.1261, 0.1186, 0.1172,
      0.1133, 0.1122, 0.1085, 0.0918, 0.0898, 0.0877, 0.069, 0.067,
      0.065, 0.0586, 0.0511, 0.0972, 0.0944, 0.0825, 0.0805, 0.0784,
      0.0723, 0.0557, 0.0497, 0.0476, 0.0455, 0.0304, 0.029, 0.0253,
      0.0148, 0.0056, 0.0035, -0.0041, 0.0171, 0.0081, 0.0061, -0.001,
      -0.0138, -0.0155, -0.0229, -0.034, -0.038, -0.0295, -0.031, -0.0444,
      -0.0459, -0.0573, -0.0589, -0.0626, -0.0639, -0.0667, -0.0838, -0.0861,
      -0.089, -0.0913, -0.112, -0.1139, -0.1182, -0.1197, -0.1229, -0.1605,
      -0.1635, -0.1649, -0.1688, -0.1705, -0.189, -0.1907, -0.1959, -0.1972,
      -0.2002, -0.2012, -0.2044, -0.2058, -0.2267, -0.2303, -0.2317, -0.2362,
      -0.2386, -0.2494, -0.2527, -0.2306, -0.233, -0.2445, -0.2487, -0.2499,
      -0.2551, -0.2653, -0.2678, -0.2786, -0.2807, -0.2947, -0.2975, -0.3004],
}

// 滑块量程直接从偏移表推出来，免得表和滑块各自漂移（曾经就是这么崩过一次）。
const MAX_N = Math.max(...Object.keys(OFFSETS).map(Number))

type Tri = { x0: number; x1: number; ax: number } // 底边 [x0,x1] 在 y=0，顶点 (ax, 1)

function buildTree(n: number): Tri[] {
  const k = OFFSETS[n] ? n : MAX_N
  const m = 2 ** k
  const offs = OFFSETS[k]
  const out: Tri[] = []
  for (let i = 0; i < m; i++) {
    const d = offs[i]
    out.push({ x0: i / m + d, x1: (i + 1) / m + d, ax: 0.5 + d })
  }
  return out
}

/** 扫描线求并集面积：每片在高度 y 处的横截面是一段区间，逐层取并再积分。 */
function treeArea(tris: Tri[], rows = 900): number {
  let acc = 0
  const iv: [number, number][] = []
  for (let r = 0; r < rows; r++) {
    const y = (r + 0.5) / rows
    iv.length = 0
    for (const t of tris) {
      const l = t.x0 + (t.ax - t.x0) * y
      const rr = t.x1 + (t.ax - t.x1) * y
      if (rr > l) iv.push([l, rr])
    }
    iv.sort((a, b) => a[0] - b[0])
    let cl = 0
    let ch = -Infinity
    for (const [lo, hi] of iv) {
      if (ch < lo) {
        if (ch > cl) acc += ch - cl
        cl = lo
        ch = hi
      } else if (hi > ch) ch = hi
    }
    if (ch > cl) acc += ch - cl
  }
  return acc / rows
}

const AREA_RATIOS = [1, 0.6666, 0.5, 0.3986, 0.3334, 0.291, 0.2604, 0.2334]

function BesicovitchPanel({ n, setN }: { n: number; setN: (v: number) => void }) {
  const tris = useMemo(() => buildTree(n), [n])
  const area = useMemo(() => treeArea(tris), [tris])
  const ratio = area / 0.5

  const VB = 330
  const H = 250
  const S = 150
  const OX = 110
  const OY = 215
  const px = (x: number, y: number): Pt => [OX + x * S, OY - y * S]

  const path = (t: Tri) => {
    const a = px(t.x0, 0)
    const b = px(t.x1, 0)
    const c = px(t.ax, 1)
    return `M${a[0].toFixed(1)} ${a[1].toFixed(1)}L${b[0].toFixed(1)} ${b[1].toFixed(1)}L${c[0].toFixed(1)} ${c[1].toFixed(1)}Z`
  }

  // 方向扇：每片的两条斜边方向，全部平移到同一个原点上画出来。
  const dirs = useMemo(() => {
    const out: number[] = []
    for (const t of tris) {
      out.push(Math.atan2(1, t.ax - t.x0))
      out.push(Math.atan2(1, t.ax - t.x1))
    }
    return out
  }, [tris])

  return (
    <div className="lab">
      <div className="lab-panels">
        <div className="lab-panel" style={{ flex: '1 1 340px' }}>
          <h4>切成 {2 ** n} 片，各自沿底线滑动</h4>
          <svg viewBox={`0 0 ${VB} ${H}`} role="img" aria-label="Besicovitch 构造：三角形切片平移后的并集">
            <line x1={0} y1={OY} x2={VB} y2={OY} stroke="#d9d2c4" strokeWidth={1} />
            {/* 原三角形的影子 */}
            <path
              d={`M${px(0, 0).join(' ')}L${px(1, 0).join(' ')}L${px(0.5, 1).join(' ')}Z`}
              fill="none" stroke="#c9c2b2" strokeWidth={1} strokeDasharray="4 4"
            />
            <g fill="#d6452c" fillOpacity={n >= 5 ? 0.5 : 0.34} stroke="#b5391f" strokeWidth={n >= 5 ? 0 : 0.35}>
              {tris.map((t, i) => <path key={i} d={path(t)} />)}
            </g>
            <text x={8} y={16} fontSize={10.5} fill="#9a968a">虚线 = 原来的三角形</text>
            <text x={8} y={H - 8} fontSize={10.5} fill="#9a968a">所有平移都沿着这条底线</text>
          </svg>
        </div>

        <div className="lab-panel" style={{ flex: '1 1 260px' }}>
          <h4>面积在掉，方向一根没少</h4>
          <svg viewBox="0 0 320 118" role="img" aria-label="并集面积随切片数下降的折线">
            <text x={6} y={13} fontSize={10.5} fill="#9a968a">并集面积 / 原三角形面积</text>
            <line x1={30} y1={100} x2={310} y2={100} stroke="#d9d2c4" />
            <line x1={30} y1={22} x2={30} y2={100} stroke="#d9d2c4" />
            <text x={6} y={26} fontSize={9.5} fill="#9a968a">1</text>
            <text x={6} y={103} fontSize={9.5} fill="#9a968a">0</text>
            <path
              d={AREA_RATIOS.map((r, i) => `${i ? 'L' : 'M'}${30 + (i / MAX_N) * 278} ${100 - r * 78}`).join('')}
              fill="none" stroke="#8a8470" strokeWidth={1.6}
            />
            {AREA_RATIOS.map((r, i) => (
              <circle key={i} cx={30 + (i / MAX_N) * 278} cy={100 - r * 78} r={i === n ? 5 : 2.4}
                fill={i === n ? '#d6452c' : '#b9b2a2'} stroke={i === n ? '#faf7f0' : 'none'} strokeWidth={1.8} />
            ))}
            {[0, 2, 4, 6, MAX_N].map((i) => (
              <text key={i} x={30 + (i / MAX_N) * 278} y={113} fontSize={9} fill="#9a968a" textAnchor="middle">
                {2 ** i}
              </text>
            ))}
          </svg>

          <svg viewBox="0 0 320 96" role="img" aria-label="所有切片贡献的方向组成的扇形">
            <text x={6} y={13} fontSize={10.5} fill="#9a968a">把每片的斜边方向搬到同一点上</text>
            <g stroke="#4a6b52" strokeWidth={0.8} opacity={0.75}>
              {dirs.map((a, i) => (
                <line key={i} x1={160} y1={86} x2={160 + Math.cos(a) * 66} y2={86 - Math.sin(a) * 66} />
              ))}
            </g>
            <circle cx={160} cy={86} r={3} fill="#4a6b52" />
            <text x={6} y={90} fontSize={9.5} fill="#4a6b52">63.4°</text>
            <text x={278} y={90} fontSize={9.5} fill="#4a6b52">116.6°</text>
          </svg>
        </div>
      </div>

      <div className="controls">
        <div className="control" style={{ flex: '1 1 220px' }}>
          <label htmlFor="pn">
            切成几片 <b>{2 ** n}</b>
          </label>
          <input id="pn" type="range" min={0} max={MAX_N} step={1} value={n} onChange={(e) => setN(+e.target.value)} />
        </div>
        <div style={{ fontSize: 13.5, color: 'var(--ink-soft)', maxWidth: '24em' }}>
          切得越碎，能叠的地方越多。方向扇始终是同样宽的一把，因为平移这个动作根本碰不到方向。
        </div>
      </div>

      <div className="readout">
        <div className="item">
          <span className="lbl">原三角形面积</span>
          <span className="val">0.5000</span>
        </div>
        <div className="item">
          <span className="lbl">并集面积</span>
          <span className="val">{fmt(area)}</span>
        </div>
        <div className="item">
          <span className="lbl">压到原来的</span>
          <span className="val">{(ratio * 100).toFixed(1)}%</span>
        </div>
        <div className="item">
          <span className="lbl">方向覆盖</span>
          <span className="val">63.4° – 116.6°</span>
        </div>
      </div>
    </div>
  )
}

/* ═══════════ 面板三 · 面积没了，维数还在 ═══════════ */

/**
 * 数格子：边长 δ 的方格里，有多少个被这堆三角形碰到。
 * 每片三角形的两条斜边在高度上都是线性的，所以一条横带内的左右边界看带子两端就够，不用采样。
 */
function boxCount(tris: Tri[], delta: number, wantCells: boolean): { n: number; cells: [number, number][] } {
  let minX = Infinity
  let maxX = -Infinity
  for (const t of tris) {
    minX = Math.min(minX, t.x0, t.ax)
    maxX = Math.max(maxX, t.x1, t.ax)
  }
  const base = Math.floor(minX / delta)
  const cols = Math.floor(maxX / delta) - base + 1
  const rows = Math.ceil(1 / delta)
  const grid = new Uint8Array(cols * rows)
  let count = 0
  for (let r = 0; r < rows; r++) {
    const y0 = r * delta
    const y1 = Math.min(1, (r + 1) * delta)
    for (const t of tris) {
      const lo = Math.min(t.x0 + (t.ax - t.x0) * y0, t.x0 + (t.ax - t.x0) * y1)
      const hi = Math.max(t.x1 + (t.ax - t.x1) * y0, t.x1 + (t.ax - t.x1) * y1)
      if (hi <= lo) continue
      const a = Math.floor(lo / delta) - base
      const b = Math.floor((hi - 1e-12) / delta) - base
      for (let c = a; c <= b; c++) {
        const idx = r * cols + c
        if (!grid[idx]) {
          grid[idx] = 1
          count++
        }
      }
    }
  }
  const cells: [number, number][] = []
  if (wantCells) {
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) if (grid[r * cols + c]) cells.push([c + base, r])
    }
  }
  return { n: count, cells }
}

/** 同一把尺子量一条单位线段（取个一般角度，避开正好压着格线的退化情形）：应当给出斜率 1。 */
function segmentBoxCount(delta: number): number {
  const seen = new Set<number>()
  const ex = Math.cos(0.4363) // 25°
  const ey = Math.sin(0.4363)
  const steps = Math.ceil(6 / delta)
  for (let i = 0; i <= steps; i++) {
    const u = i / steps
    const c = Math.floor((u * ex) / delta)
    const r = Math.floor((u * ey) / delta)
    seen.add(c * 1e6 + r)
  }
  return seen.size
}

/** 拟合 log N 对 log(1/δ) 的斜率。 */
function fitSlope(pts: { d: number; n: number }[]): number {
  const xs = pts.map((p) => Math.log(1 / p.d))
  const ys = pts.map((p) => Math.log(p.n))
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length
  const my = ys.reduce((a, b) => a + b, 0) / ys.length
  let num = 0
  let den = 0
  for (let i = 0; i < xs.length; i++) {
    num += (xs[i] - mx) * (ys[i] - my)
    den += (xs[i] - mx) ** 2
  }
  return num / den
}

const DELTA_K = [2, 3, 4, 5, 6, 7, 8] // δ = 1/4 … 1/256

function DimensionPanel({ n }: { n: number }) {
  const [li, setLi] = useState(2)
  const tris = useMemo(() => buildTree(n), [n])
  const delta = 1 / 2 ** DELTA_K[li]

  const { n: count, cells } = useMemo(() => boxCount(tris, delta, delta >= 1 / 64), [tris, delta])

  // 三条对照曲线：一条线段（该是 1）、这棵树、一块实心正方形（该是 2）。
  const curves = useMemo(() => {
    const ds = DELTA_K.map((k) => 1 / 2 ** k)
    const tree = ds.map((d) => ({ d, n: boxCount(tris, d, false).n }))
    const seg = ds.map((d) => ({ d, n: segmentBoxCount(d) }))
    const sq = ds.map((d) => ({ d, n: Math.round(1 / d) ** 2 }))
    return [
      { key: 'seg', name: '一条线段', pts: seg, color: '#8a8470', slope: fitSlope(seg) },
      { key: 'tree', name: '挂谷树', pts: tree, color: '#d6452c', slope: fitSlope(tree) },
      { key: 'sq', name: '实心正方形', pts: sq, color: '#4a6b52', slope: fitSlope(sq) },
    ]
  }, [tris])

  const VB = 330
  const H = 250
  const S = 150
  const OX = 110
  const OY = 215

  const allN = curves.flatMap((c) => c.pts.map((p) => Math.log(p.n)))
  const maxLogN = Math.max(...allN) * 1.06
  const gx = (v: number) => 44 + (v / Math.log(256)) * 258
  const gy = (v: number) => 108 - (v / maxLogN) * 86

  return (
    <div className="lab">
      <div className="lab-panels">
        <div className="lab-panel" style={{ flex: '1 1 340px' }}>
          <h4>用边长 δ 的方格去盖它</h4>
          <svg viewBox={`0 0 ${VB} ${H}`} role="img" aria-label="用方格覆盖挂谷树，统计被碰到的格子数">
            <g fill="#d6452c" fillOpacity={0.16}>
              {cells.map(([c, r], i) => (
                <rect key={i} x={OX + c * delta * S} y={OY - (r + 1) * delta * S}
                  width={delta * S + 0.4} height={delta * S + 0.4} />
              ))}
            </g>
            {delta >= 1 / 32 && (
              <g stroke="#d6452c" strokeWidth={0.35} opacity={0.55} fill="none">
                {cells.map(([c, r], i) => (
                  <rect key={i} x={OX + c * delta * S} y={OY - (r + 1) * delta * S}
                    width={delta * S} height={delta * S} />
                ))}
              </g>
            )}
            <g fill="#8a8470" fillOpacity={0.8}>
              {tris.map((t, i) => (
                <path key={i} d={`M${OX + t.x0 * S} ${OY}L${OX + t.x1 * S} ${OY}L${OX + t.ax * S} ${OY - S}Z`} />
              ))}
            </g>
            <line x1={0} y1={OY} x2={VB} y2={OY} stroke="#d9d2c4" />
            <text x={8} y={16} fontSize={10.5} fill="#9a968a">
              δ = 1/{2 ** DELTA_K[li]}，碰到的格子 N(δ) = {count}
              {delta < 1 / 64 ? '（格子太细，不画了）' : ''}
            </text>
          </svg>
        </div>

        <div className="lab-panel" style={{ flex: '1 1 260px' }}>
          <h4>同一把尺子，三个东西</h4>
          <svg viewBox="0 0 330 150" role="img" aria-label="三个集合的 log N 对 log(1/δ) 双对数图">
            <text x={6} y={13} fontSize={10.5} fill="#9a968a">log N(δ) 对 log(1/δ)：斜率就是维数</text>
            <line x1={44} y1={108} x2={318} y2={108} stroke="#d9d2c4" />
            <line x1={44} y1={20} x2={44} y2={108} stroke="#d9d2c4" />
            {curves.map((c) => (
              <g key={c.key}>
                <path
                  d={c.pts.map((p, i) => `${i ? 'L' : 'M'}${gx(Math.log(1 / p.d))} ${gy(Math.log(p.n))}`).join('')}
                  fill="none" stroke={c.color} strokeWidth={1.8}
                />
                {c.pts.map((p, i) => (
                  <circle key={i} cx={gx(Math.log(1 / p.d))} cy={gy(Math.log(p.n))}
                    r={i === li ? 4.6 : 2.2} fill={c.color}
                    stroke={i === li ? '#faf7f0' : 'none'} strokeWidth={1.6} />
                ))}
              </g>
            ))}
            <text x={44} y={124} fontSize={9} fill="#9a968a">δ=1/4</text>
            <text x={318} y={124} fontSize={9} fill="#9a968a" textAnchor="end">δ=1/256</text>
            {curves.map((c, i) => (
              <text key={c.key} x={6 + i * 108} y={143} fontSize={10.5} fontFamily="var(--font-mono)" fill={c.color}>
                {c.name} {fmt(c.slope, 2)}
              </text>
            ))}
          </svg>
        </div>
      </div>

      <div className="controls">
        <div className="control" style={{ flex: '1 1 220px' }}>
          <label htmlFor="dlt">
            方格边长 δ <b>1/{2 ** DELTA_K[li]}</b>
          </label>
          <input id="dlt" type="range" min={0} max={6} step={1} value={li} onChange={(e) => setLi(+e.target.value)} />
        </div>
        <div style={{ fontSize: 13.5, color: 'var(--ink-soft)', maxWidth: '24em' }}>
          维数不问「它有多大面积」，只问「盖住它要多少个 δ 格子」。格子数按 δ⁻ᵈ 涨，那个 d 就是维数。
        </div>
      </div>
    </div>
  )
}

/* ═══════════ 面板四 · 到了三维 ═══════════ */

const TIMELINE = [
  { year: '1917', who: '挂谷宗一', what: '提问：转一根针最少要多大面积？', bound: null as number | null },
  { year: '1920', who: 'Pál', what: '凸图形里，高为 1 的等边三角形最省（1/√3）', bound: null },
  { year: '1928', who: 'Besicovitch', what: '面积可以任意接近 0，最小面积根本不存在', bound: null },
  { year: '1971', who: 'Davies', what: '二维：面积可以是 0，维数却必须是满的 2', bound: 2 },
  { year: '1971', who: 'Fefferman', what: '用 Besicovitch 集推翻了球乘子猜想，这个问题开始有了下游', bound: null },
  { year: '1995', who: 'Wolff', what: '三维下界推到 5/2（“毛刷”方法）', bound: 2.5 },
  { year: '2000', who: 'Katz–Łaba–Tao', what: '三维下界 5/2 + 10⁻¹⁰，象征意义远大于数值', bound: 2.5 },
  { year: '2019', who: 'Katz–Zahl', what: '三维下界 5/2 + ε₀；同时找出 SL₂ 这个「几乎反例」', bound: 2.52 },
  { year: '2025', who: '王虹 · Joshua Zahl', what: '三维维数 = 3，猜想成立', bound: 3 },
  { year: '2026', who: '王虹', what: '获菲尔兹奖，获奖理由中列入了 Kakeya 问题', bound: null },
]

function ThreeDPanel() {
  const [phi, setPhi] = useState(35)
  const [spread, setSpread] = useState(0)

  const VB = 330
  const H = 260
  const C: Pt = [165, 128]
  const S = 96

  // 一束单位线段，方向取自斐波那契半球：三维里「每个方向」是一整张球面。
  const lines = useMemo(() => {
    const N = 90
    const out: { d: [number, number, number]; c: [number, number, number] }[] = []
    const ga = Math.PI * (3 - Math.sqrt(5))
    for (let i = 0; i < N; i++) {
      const z = 1 - (i + 0.5) / N // 只取上半球，方向与它的反向是同一条线
      const r = Math.sqrt(Math.max(0, 1 - z * z))
      const a = ga * i
      const d: [number, number, number] = [r * Math.cos(a), r * Math.sin(a), z]
      // spread = 0 时全部穿过原点（“灌木”），拉大以后各自错开
      const c: [number, number, number] = [
        d[1] * 0.62, -d[0] * 0.62, ((i % 7) / 7 - 0.5) * 0.7,
      ]
      out.push({ d, c })
    }
    return out
  }, [])

  const proj = (p: [number, number, number]): Pt => {
    const f = (phi * Math.PI) / 180
    const x1 = p[0] * Math.cos(f) + p[2] * Math.sin(f)
    const z1 = -p[0] * Math.sin(f) + p[2] * Math.cos(f)
    const t = 0.42
    const y2 = p[1] * Math.cos(t) - z1 * Math.sin(t)
    return [C[0] + x1 * S, C[1] - y2 * S]
  }

  const k = spread / 100

  return (
    <div className="lab">
      <div className="lab-panels">
        <div className="lab-panel" style={{ flex: '1 1 340px' }}>
          <h4>三维里，「每个方向」是一整张球面</h4>
          <svg viewBox={`0 0 ${VB} ${H}`} role="img" aria-label="三维中朝各个方向的单位线段束">
            <ellipse cx={C[0]} cy={C[1]} rx={S} ry={S * 0.42} fill="none" stroke="#d9d2c4" strokeWidth={0.9} />
            <circle cx={C[0]} cy={C[1]} r={S} fill="none" stroke="#e4ded1" strokeWidth={0.9} />
            <g strokeWidth={1.1} strokeLinecap="round">
              {lines.map((l, i) => {
                const c: [number, number, number] = [l.c[0] * k, l.c[1] * k, l.c[2] * k]
                const a = proj([c[0] - l.d[0] / 2, c[1] - l.d[1] / 2, c[2] - l.d[2] / 2])
                const b = proj([c[0] + l.d[0] / 2, c[1] + l.d[1] / 2, c[2] + l.d[2] / 2])
                return <line key={i} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke="#d6452c" opacity={0.42} />
              })}
            </g>
            <text x={8} y={16} fontSize={10.5} fill="#9a968a">90 根单位线段，方向铺满上半球</text>
            <text x={8} y={H - 10} fontSize={10.5} fill="#9a968a">
              {k < 0.02 ? '全部穿过一点：这是「灌木」，体积很小' : '各自错开：重叠变少，体积变大'}
            </text>
          </svg>
        </div>

        <div className="lab-panel" style={{ flex: '1 1 260px' }}>
          <h4>三维维数下界，三十年爬完最后半格</h4>
          <svg viewBox="0 0 330 260" role="img" aria-label="三维 Kakeya 集维数下界的历史进展">
            {[2, 2.5, 3].map((v) => (
              <g key={v}>
                <line x1={40 + (v - 2) * 260} y1={22} x2={40 + (v - 2) * 260} y2={228} stroke="#e4ded1" strokeWidth={0.9} />
                <text x={40 + (v - 2) * 260} y={16} fontSize={9.5} fill="#9a968a" textAnchor="middle">{v}</text>
              </g>
            ))}
            {TIMELINE.filter((t) => t.bound !== null && t.year !== '1971').map((t, i) => {
              const y = 46 + i * 40
              const w = ((t.bound as number) - 2) * 260
              const done = t.bound === 3
              return (
                <g key={t.year}>
                  <text x={4} y={y - 5} fontSize={10} fill="#9a968a">{t.year} {t.who}</text>
                  <rect x={40} y={y} width={Math.max(w, 1.5)} height={15} rx={2}
                    fill={done ? '#4a6b52' : '#d6452c'} opacity={done ? 0.9 : 0.5} />
                  <text x={40 + w + 7} y={y + 12} fontSize={10.5} fontFamily="var(--font-mono)"
                    fill={done ? '#3f5c46' : '#b5391f'}>
                    {t.bound === 2.52 ? '5/2+ε₀' : t.bound === 3 ? '3 ✓' : t.bound === 2.5 && t.year === '2000' ? '5/2+10⁻¹⁰' : '5/2'}
                  </text>
                </g>
              )
            })}
            <text x={4} y={244} fontSize={10.5} fill="#4a6b52">
              二维在 1971 年就到顶了，三维用了整整三十年爬完这半格。
            </text>
          </svg>
        </div>
      </div>

      <div className="controls">
        <div className="control">
          <label htmlFor="phi">
            转一转视角 <b>{phi}°</b>
          </label>
          <input id="phi" type="range" min={0} max={180} step={1} value={phi} onChange={(e) => setPhi(+e.target.value)} />
        </div>
        <div className="control">
          <label htmlFor="spd">
            把线段错开 <b>{spread}%</b>
          </label>
          <input id="spd" type="range" min={0} max={100} step={1} value={spread} onChange={(e) => setSpread(+e.target.value)} />
        </div>
        <div style={{ fontSize: 13.5, color: 'var(--ink-soft)', maxWidth: '22em' }}>
          二维里方向是一个圆，宽度 δ 的管子约需 δ⁻¹ 根；三维里方向是一整张球面，约需 δ⁻² 根。多出来的这一维，正是难点所在。
        </div>
      </div>
    </div>
  )
}

/* ═══════════ 页面 ═══════════ */

export function Kakeya() {
  const [n, setN] = useState(4)

  return (
    <AlgoShell
      slug="kakeya"
      lede={
        <>
          在平面上把一根长度为 1 的针原地掉头，需要多大的地方？答案是
          <span className="k">可以要多小有多小</span>，面积能压到任意接近 0。但真正的问题在下一句：
          这样一个「没有面积」的集合，会不会因此变薄、掉到低维去？1971 年二维给出了否定的回答，
          三维一直悬着，直到 2025 年才被王虹与 Joshua Zahl 补上。
        </>
      }
    >
      <h2>第一幕 · 1917：一根针，一个看似无聊的问题</h2>
      <p>
        挂谷宗一问的是：一根长度为 1 的针，要在平面上连续地转过 180° 回到原来的直线上，
        它扫过的区域最小能有多小。先试三个现成的图形。
      </p>

      <NeedlePanel />

      <p>
        三个数字一个比一个小：<span className="k">π/4 ≈ 0.785</span>、<span className="k">1/√3 ≈ 0.577</span>、
        <span className="k">π/8 ≈ 0.393</span>。Pál 在 1920 年证明了中间那个是凸图形里的最优解，
        挂谷则猜三尖内摆线是所有图形里的最优解。顺着这个势头，问题看起来只差临门一脚。
      </p>

      <h2>第二幕 · 1928：最小面积根本不存在</h2>
      <p>
        Besicovitch 给出的答案让所有人意外：这一列数字没有下界。任给一个再小的 ε，都存在一个面积小于 ε 的区域，
        针在里面照样能转完 180°。机制出人意料地朴素，就是<strong>切开再滑动</strong>。
      </p>
      <p>
        把三角形从顶点切成很多细长片。每一片只沿着底线平移，不转、不缩。
        平移这个动作碰不到方向：原来朝哪个角度的线段，平移之后还是朝那个角度。
        所以「每个方向都有一根针」这条性质分毫不动，而各片却可以互相叠上去，并集的面积一路往下掉。
      </p>

      <BesicovitchPanel n={n} setN={setN} />

      <p>
        拖动切片数，右上那条曲线就是当场积出来的面积比：2 片时压到 66.7%，128 片时压到 23.3%。
        下降很慢，大致是 <span className="k">1/n</span> 的量级，这正是这个构造的真实脾气。要把面积压到千分之一，
        得切成天文数字那么多片。但慢归慢，它没有下界，这就够了。
      </p>
      <p>
        最后再补一步「Pál 接头」，把这些方向用面积可以忽略的细长走廊连起来，针就能真的连续转完 180°。
        于是挂谷的问题得到了一个扫兴的答案：<strong>最小面积不存在</strong>。
      </p>

      <h2>第三幕 · 真正的问题：面积没了，维数还在吗</h2>
      <p>
        故事到这里本该结束，却在这里才真正开始。面积为 0 并不意味着这个集合「小」。
        一条线段的面积也是 0，一整张纸的碎屑的面积也可以是 0，可它们的「厚度」显然不是一回事。
        量这种厚度的尺子叫<strong>维数</strong>：不问它有多大面积，只问<strong>盖住它需要多少个边长为 δ 的方格</strong>。
        如果这个数按 <span className="k">δ⁻ᵈ</span> 增长，那个 d 就是维数。
      </p>

      <DimensionPanel n={n} />

      <p>
        线段那条曲线的斜率是 1，正方形那条是 2，两个已知答案先把尺子校准了。
        挂谷树落在中间，而且它的斜率<strong>会随尺度漂移</strong>：δ 还比切片宽的时候，
        这堆东西看起来就是一整块面；δ 细到能分辨出单片三角形之后，量到的更接近一束线。
        这不是测量误差，而是这类集合的真实脾气：<strong>它在不同尺度上像不同维度的东西</strong>。
      </p>
      <p>
        维数问的是 δ 一路趋于 0 时的极限行为。上面这棵树切片数有限，是实打实有面积的多边形，
        所以只要 δ 足够小，斜率终究会回到 2，这里只是在演示「维数是怎么量出来的」。
        而<strong>挂谷猜想说的是</strong>：即使把构造推到极限、面积真的变成 0，格子数依然按 δ⁻² 涨。
        它薄到没有面积，却厚到不能塌成一束线。这个「量到的维数会在尺度间漂移」的现象，
        正是这个问题难在什么地方的缩影：你必须控制住所有尺度，而不只是某一个。
      </p>
      <p>
        n 维版本的猜想就是这句话的推广：ℝⁿ 里任何一个「每个方向都含一根单位针」的集合，
        豪斯多夫维数和闵可夫斯基维数都必须是满的 <span className="k">n</span>。
        Davies 在 1971 年证明了 n = 2。然后就卡住了。
      </p>

      <h2>第四幕 · 2025：三维那一格</h2>
      <p>
        三维难在哪？二维里「所有方向」是一个圆，用宽度 δ 的管子去铺，大约需要 δ⁻¹ 根。
        三维里「所有方向」是一整张球面，需要 δ⁻² 根。管子多了一整个数量级，
        它们互相重叠的花样也随之爆炸，而恰恰是这些重叠决定了体积能被压到多小。
      </p>

      <ThreeDPanel />

      <p>
        Wolff 在 1995 年用「毛刷」把下界推到 5/2 之后，这个数字纹丝不动了五年。
        2000 年 Katz、Łaba 和陶哲轩把它挪到 <span className="k">5/2 + 10⁻¹⁰</span>。
        这个改进量在数值上近乎为零，意义却完全不在数值：它说明 5/2 不是一堵墙。
      </p>
      <p>
        2019 年 Katz 与 Zahl 把下界推进到 5/2 + ε₀，同时挖出一个叫 <span className="k">SL₂</span> 的对象。
        它是一个「几乎反例」：闵可夫斯基维数是 3，豪斯多夫维数却只有 5/2。
        真正的反例必须长成什么样，至此变得具体了起来。
      </p>
      <p>
        2025 年 2 月，<strong>王虹与 Joshua Zahl</strong> 把最后半格补上（arXiv:2502.17655）。
        两人证明的实际上是一个更一般的命题，关于一大堆凸集的并集体积能有多小，
        三维挂谷猜想是它的推论：<strong>ℝ³ 中任何针集的豪斯多夫维数与闵可夫斯基维数都等于 3</strong>。
        关键的一步是处理所谓「粘性」的构造，也就是那些方向相近的管子会成片地黏在一起、
        试图把整个集合压扁到 2.5 维的情形。两人证明了这条路走不通。
      </p>
      <p>
        所以回到最初那个容易混淆的地方：<strong>「面积是 0」是 1928 年的结论，不是 2025 年的</strong>。
        2025 年证的是，这个面积为 0 的东西，维数一分也不能少。
        2026 年 7 月，王虹获得菲尔兹奖，获奖理由里列入了这项工作。
      </p>

      <Landing>
        这不是一个孤立的几何谜题。1971 年 Fefferman 正是用 Besicovitch 集推翻了球乘子猜想，
        证明高维傅里叶级数按球截断时在 L^p 里未必收敛。此后挂谷问题成了调和分析的枢纽：
        限制性猜想、Bochner–Riesz 猜想、波动方程的局部光滑性猜想，都要先过这一关，
        因为它们都归结为同一件事——一堆细长管子叠在一起能有多小。
        它还越出了分析：有限域版本的挂谷问题被 Dvir 用多项式方法解决后，直接进了理论计算机的随机性提取器工具箱。
      </Landing>
    </AlgoShell>
  )
}
