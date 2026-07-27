import { useEffect, useMemo, useState } from 'react'
import { AlgoShell, Landing } from '../components/AlgoShell'
import { Player } from '../components/Player'
import { usePlayer } from '../lib/player'

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

/**
 * 从第 k 层过渡到第 k+1 层：每片先一分为二（u=0 时两个半片拼起来跟父片一模一样，
 * 因为它们共用顶点、底边刚好接上），再各自沿底线平移到第 k+1 层的位置。
 * 中间的每一帧都是合法图形——平移不改方向，方向扇自始至终没动过。
 */
function lerpLevel(k: number, u: number): Tri[] {
  const from = OFFSETS[k]
  const to = OFFSETS[k + 1]
  const m = 2 ** (k + 1)
  const out: Tri[] = []
  for (let i = 0; i < m; i++) {
    const d0 = from[i >> 1]
    const d = d0 + (to[i] - d0) * u
    out.push({ x0: i / m + d, x1: (i + 1) / m + d, ax: 0.5 + d })
  }
  return out
}

type CutFrame = { tris: Tri[]; note: string; cut: boolean; x: number }

const SLIDE_FRAMES = 8

function buildCutFrames(n: number): CutFrame[] {
  const f: CutFrame[] = []
  const whole = buildTree(0)
  f.push({
    tris: whole, cut: false, x: 0,
    note: '一整块三角形。从顶点拉到底边的线段，随着落点从左滑到右，方向连续地从 63.4° 转到 116.6°。针需要的这一段方向，全都在里面了。',
  })
  f.push({
    tris: whole, cut: false, x: 0,
    note: '但针要的只是这些方向，不是这一整块肉。于是问题变成：方向一根不少地留住，面积能不能扔掉大半？',
  })
  for (let k = 0; k < n; k++) {
    f.push({
      tris: lerpLevel(k, 0), cut: true, x: k,
      note: `从顶点切一刀，成 ${2 ** (k + 1)} 片。这一刀本身什么都没改：形状、面积、方向都还是原样。变的是所有权：每片各自领走了一小段方向。`,
    })
    for (let j = 1; j <= SLIDE_FRAMES; j++) {
      f.push({
        tris: lerpLevel(k, j / SLIDE_FRAMES), cut: false, x: k + j / SLIDE_FRAMES,
        note: '沿着底线相向滑动。平移动不了任何一条线段的方向：方向是每片随身带的，位置却可以随便挪。于是它们叠到一起，并集面积掉下来。',
      })
    }
  }
  const last = f[f.length - 1]
  f.push({
    ...last,
    note: `${2 ** n} 片叠完。右边那把方向扇张角还是 53.1°，一根没少；左边的面积却只剩一小截。切得越碎，能叠的地方越多。Besicovitch 的机关全在这里。`,
  })
  return f
}

function BesicovitchPanel({ n, setN }: { n: number; setN: (v: number) => void }) {
  const frames = useMemo(() => buildCutFrames(n), [n])
  const p = usePlayer(frames.length, 6)
  const f = frames[p.i]
  const tris = f.tris

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

  const dense = tris.length >= 32

  return (
    <div className="lab">
      <div className="lab-panels">
        <div className="lab-panel" style={{ flex: '1 1 340px' }}>
          <h4>{tris.length === 1 ? '还是一整块' : `${tris.length} 片，沿底线滑动`}</h4>
          <svg viewBox={`0 0 ${VB} ${H}`} role="img" aria-label="Besicovitch 构造：三角形切片平移后的并集">
            <line x1={0} y1={OY} x2={VB} y2={OY} stroke="#d9d2c4" strokeWidth={1} />
            {/* 原三角形的影子 */}
            <path
              d={`M${px(0, 0).join(' ')}L${px(1, 0).join(' ')}L${px(0.5, 1).join(' ')}Z`}
              fill="none" stroke="#c9c2b2" strokeWidth={1} strokeDasharray="4 4"
            />
            <g fill="#d6452c" fillOpacity={dense ? 0.5 : 0.34} stroke="#faf7f0" strokeWidth={dense ? 0 : 0.7}>
              {tris.map((t, i) => <path key={i} d={path(t)} />)}
            </g>
            {/* 刚切下去的那一刀：画出新出现的内部边 */}
            {f.cut && (
              <g stroke="#b5391f" strokeWidth={dense ? 0.5 : 1.1} opacity={0.9}>
                {tris.map((t, i) => (i % 2 === 0 ? (
                  <line key={i} x1={px(t.x1, 0)[0]} y1={OY} x2={px(t.ax, 1)[0]} y2={OY - S} />
                ) : null))}
              </g>
            )}
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
              fill="none" stroke="#8a8470" strokeWidth={1.6} opacity={0.45}
            />
            {/* 本次动画真正会走到的那一段，画实一点 */}
            <path
              d={AREA_RATIOS.slice(0, n + 1).map((r, i) => `${i ? 'L' : 'M'}${30 + (i / MAX_N) * 278} ${100 - r * 78}`).join('')}
              fill="none" stroke="#8a8470" strokeWidth={1.8}
            />
            {AREA_RATIOS.slice(0, n + 1).map((r, i) => (
              <circle key={i} cx={30 + (i / MAX_N) * 278} cy={100 - r * 78} r={2.4} fill="#b9b2a2" />
            ))}
            {/* 当场算出来的这一帧，红点在曲线上实时走 */}
            <circle cx={30 + (f.x / MAX_N) * 278} cy={100 - ratio * 78} r={5}
              fill="#d6452c" stroke="#faf7f0" strokeWidth={1.8} />
            {[0, 2, 4, 6, MAX_N].map((i) => (
              <text key={i} x={30 + (i / MAX_N) * 278} y={113} fontSize={9} fill="#9a968a" textAnchor="middle">
                {2 ** i}
              </text>
            ))}
          </svg>

          <svg viewBox="0 0 320 96" role="img" aria-label="所有切片贡献的方向组成的扇形">
            <text x={6} y={13} fontSize={10.5} fill="#9a968a">把每片的斜边方向搬到同一点上</text>
            <path
              d={`M160 86L${160 + Math.cos(Math.atan2(1, 0.5)) * 66} ${86 - Math.sin(Math.atan2(1, 0.5)) * 66}
                  A66 66 0 0 0 ${160 + Math.cos(Math.atan2(1, -0.5)) * 66} ${86 - Math.sin(Math.atan2(1, -0.5)) * 66}Z`}
              fill="#4a6b52" fillOpacity={0.09}
            />
            <g stroke="#4a6b52" strokeWidth={0.8} opacity={0.75}>
              {dirs.map((a, i) => (
                <line key={i} x1={160} y1={86} x2={160 + Math.cos(a) * 66} y2={86 - Math.sin(a) * 66} />
              ))}
            </g>
            <circle cx={160} cy={86} r={3} fill="#4a6b52" />
            <text x={6} y={90} fontSize={9.5} fill="#4a6b52">63.4°</text>
            <text x={278} y={90} fontSize={9.5} fill="#4a6b52">116.6°</text>
            <text x={6} y={30} fontSize={9.5} fill="#4a6b52">张角恒为 53.1°</text>
          </svg>
        </div>
      </div>

      <div className="step-note">{f.note}</div>

      <Player p={p} />

      <div className="controls">
        <div className="control" style={{ flex: '1 1 220px' }}>
          <label htmlFor="pn">
            一共切几刀 <b>{n} 刀 → {2 ** n} 片</b>
          </label>
          <input id="pn" type="range" min={0} max={MAX_N} step={1} value={n} onChange={(e) => setN(+e.target.value)} />
        </div>
        <div style={{ fontSize: 13.5, color: 'var(--ink-soft)', maxWidth: '24em' }}>
          改刀数会重排整段动画。每一刀都是「切开 → 滑动」这同一个动作，递归地做下去。
        </div>
      </div>

      <div className="readout">
        <div className="item">
          <span className="lbl">原三角形面积</span>
          <span className="val">0.5000</span>
        </div>
        <div className="item">
          <span className="lbl">当前并集面积</span>
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

/* ═══════════ 面板二之二 · 切完之后，针到底怎么走 ═══════════ */

/**
 * 切片是省面积的，代价全落在「针怎么过去」上。
 *
 * 一片三角形里，针钉在这片的顶点上转，扫过这片对应的那一小段方向。
 * 相邻两片交界处的方向是接得上的（第 i 片的右边界方向 = 第 i+1 片的左边界方向，
 * 因为 ax − x1 与下一片的 ax − x0 是同一个数，跟平移量无关）。
 * 但两片被平移开了，所以这两条线虽然平行、却不重合——针必须换一条平行线。
 *
 * 换平行线正是 Pál 接头干的事，而且可以做到几乎不要钱：
 *   ① 沿着自己的方向滑出去 D（线段沿自身所在直线滑动，扫过的面积是 0）；
 *   ② 在远处绕中点转一个小角 ε；
 *   ③ 沿新方向滑回来 D，落点与出发点的垂直偏移恰是 D·sin ε；
 *   ④ 转回 −ε，方向复原，人已经在平行线上了。
 * 取 ε = arcsin(h/D) 就能精确地平移 h。两次转身各扫 ε/4（单位长线段绕中点转 ε），
 * 一次接头共 ε/2 ≈ h/(2D)：D 越远，接头越便宜，而且没有下界。
 */

type Wedge = { c: Pt; a0: number; a1: number }
/**
 * 接头时画出来的三条线：出发的那条、要落到的那条（两者平行，隔着 h）、
 * 以及中间那条「回程线」。回程线是整个接头的主角：远处转的那一下 ε，
 * 就是为了把针从出发线拨到回程线上，好让它顺着这条线滑回来时正好落到落脚线。
 */
type Guide = { a: [Pt, Pt]; b: [Pt, Pt]; transit: [Pt, Pt] | null; h: number; step: number }
type JFrame = {
  seg: [Pt, Pt]
  note: string
  trail: number
  wedges: Wedge[]
  guide: Guide | null
  swept: number
  joins: number
  joinArea: number
}

const SWEEP_F = 7
const OUT_F = 6
const ROT_F = 3
const BACK_F = 6
const PLACE_F = 2

const unit = (a: number): Pt => [Math.cos(a), Math.sin(a)]
const shift = (p: Pt, v: Pt, k: number): Pt => [p[0] + v[0] * k, p[1] + v[1] * k]
const mix = (a: Pt, b: Pt, u: number): Pt => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u]
const degs = (r: number) => ((r * 180) / Math.PI).toFixed(1)

function buildJourney(tris: Tri[], D: number) {
  const frames: JFrame[] = []
  const trail: [Pt, Pt][] = []
  const wedges: Wedge[] = []
  let joins = 0
  let joinArea = 0
  let swept = 0
  let guide: Guide | null = null

  const push = (seg: [Pt, Pt], note: string) => {
    frames.push({ seg, note, trail: trail.length, wedges: wedges.map((w) => ({ ...w })), guide, swept, joins, joinArea })
  }
  const centred = (c: Pt, ph: number): [Pt, Pt] => {
    const e = unit(ph)
    return [shift(c, e, -0.5), shift(c, e, 0.5)]
  }

  for (let i = 0; i < tris.length; i++) {
    const t = tris[i]
    const A: Pt = [t.ax, 1]
    const p0 = Math.atan2(1, t.ax - t.x0)
    const p1 = Math.atan2(1, t.ax - t.x1)

    guide = null
    // i>0 时跳过 j=0：那一帧跟上一次接头的落点完全重合，播起来就是白顿一拍。
    for (let j = i === 0 ? 0 : 1; j <= SWEEP_F; j++) {
      const ph = p0 + (p1 - p0) * (j / SWEEP_F)
      const seg: [Pt, Pt] = [A, shift(A, unit(ph), -1)]
      trail.push(seg)
      swept = ((ph - Math.atan2(1, 0.5)) * 180) / Math.PI
      push(seg, `第 ${i + 1} 片：针钉在这片的顶点上转，扫过 ${degs(p0)}°–${degs(p1)}° 这一小段方向。转完这片，这段方向就都有了。`)
    }

    if (i === tris.length - 1) break

    // ── 接头：换到下一片的那条平行线上 ──
    const nt = tris[i + 1]
    const ph = p1
    const e = unit(ph)
    const nrm: Pt = [-e[1], e[0]]
    const S = shift(A, e, -0.5) // 当前针中点
    const T = shift([nt.ax, 1] as Pt, e, -0.5) // 目标针中点
    const dv: Pt = [T[0] - S[0], T[1] - S[1]]
    const h = dv[0] * nrm[0] + dv[1] * nrm[1] // 要跨过的垂直距离（花钱的那一段）
    const alpha = dv[0] * e[0] + dv[1] * e[1] // 沿针自身方向的分量（免费）

    // 出发线（灰）与落脚线（绿）：平行，中间隔着 h。
    const mkGuide = (transit: [Pt, Pt] | null, step: number): Guide => ({
      a: [shift(S, e, -1.2), shift(S, e, D + 1.2)],
      b: [shift(T, e, -1.2), shift(T, e, D + 1.2)],
      transit,
      h,
      step,
    })

    guide = mkGuide(null, 0)
    push(centred(S, ph), `这片扫完了。下一片接着的方向跟现在这根一模一样，可它被平移开了：针得从灰虚线换到绿虚线上去，横着差 ${Math.abs(h).toFixed(3)}。直接横过去要扫掉 ${Math.abs(h).toFixed(3)} 的面积，太贵，所以绕一趟。`)

    if (Math.abs(h) > 1e-6) {
      const Q = shift(S, e, D) // 远处的支点
      const eps = -Math.asin(Math.max(-0.98, Math.min(0.98, h / D)))
      const beta = D * (1 - Math.cos(eps)) // 绕这一趟带来的沿针方向偏差
      const e2 = unit(ph + eps)
      const C2 = shift(Q, e2, -D)
      // 回程线：从远处的支点 Q 斜着插回来，正好扎在落脚线上的 C2。
      const transit: [Pt, Pt] = [shift(Q, e2, 0.9), shift(C2, e2, -1.2)]

      for (let j = 1; j <= OUT_F; j++) {
        push(centred(mix(S, Q, j / OUT_F), ph), '① 沿着自己的方向滑出去，滑到很远的地方。线段沿它自己所在的直线滑动，扫过的面积是 0，所以这一段完全免费，想走多远走多远。')
      }
      guide = mkGuide(transit, 2)
      for (let j = 1; j <= ROT_F; j++) {
        push(centred(Q, ph + (eps * j) / ROT_F), `② 在远处把针拨到红虚线（回程线）上，只需要转 ε = ${degs(Math.abs(eps))}°。看红虚线的下端：它斜斜地正好扎在绿虚线上。支点是针自己的中点（绿圈），不是端点：绕中点转扫 ${(Math.abs(eps) / 4).toFixed(4)}，绕端点要 ${(Math.abs(eps) / 2).toFixed(4)}，贵一倍。`)
      }
      wedges.push({ c: Q, a0: ph, a1: ph + eps })
      for (let j = 1; j <= BACK_F; j++) {
        push(centred(mix(Q, C2, j / BACK_F), ph + eps), '③ 顺着红虚线滑回来，还是免费。歪了 ε 走上 D 这么远，横向就攒出了 D·sin ε = h，人已经到绿虚线上了。')
      }
      guide = mkGuide(transit, 4)
      for (let j = 1; j <= ROT_F; j++) {
        push(centred(C2, ph + eps - (eps * j) / ROT_F), `④ 还是绕中点转回 −ε，方向复原，针躺在绿虚线上了。两次转身合计 ${(Math.abs(eps) / 2).toFixed(4)} ≈ h/(2D)，而直接横过去要 ${Math.abs(h).toFixed(4)}，便宜了 ${(Math.abs(h) / (Math.abs(eps) / 2)).toFixed(0)} 倍。`)
      }
      wedges.push({ c: C2, a0: ph + eps, a1: ph })
      joins++
      joinArea += Math.abs(eps) / 2
      guide = mkGuide(null, 5)
      for (let j = 1; j <= PLACE_F; j++) {
        push(centred(mix(C2, T, j / PLACE_F), ph), `沿着绿虚线滑到下一片的顶点，还差 ${Math.abs(beta - alpha).toFixed(4)}。转身其实没落在终点上，也不必落准：接头要买的只有垂直那一段 h，沿自身方向差多少都是白送的。`)
      }
    } else {
      for (let j = 1; j <= PLACE_F; j++) {
        push(centred(mix(S, T, j / PLACE_F), ph), '这两片正好没错开，沿自身方向滑过去就行。')
      }
    }
  }

  const total = frames[frames.length - 1]
  frames.push({
    ...total,
    note: `走完了：${tris.length} 片接力，转过 53.1° 的方向，用掉 ${total.joins} 次接头。看读数：D 只有 ${D} 的时候，接头扫掉 ${joinArea.toFixed(4)}，比碎片本身的 ${fmt(treeArea(tris))} 还贵。但这两项都没有下界：D 拉大，接头这一项任意小；刀切多，碎片那一项任意小。所以最小面积不存在。`,
  })
  return { frames, trail }
}

/**
 * Pál 接头的原理图。真实的 ε 只有两三度，在等比例的动画里根本看不出来，
 * 所以这张示意图故意把角度放大到 23°，好让三条线和两个扇形的关系一眼可见。
 * step 跟着左边动画走，当前那一步高亮。
 */
function PalSchematic({ step }: { step: number }) {
  const L1 = 62
  const L2 = 112
  const QY = 44
  const CY = 158
  const HALF = 23
  const dx = L2 - L1
  const dy = CY - QY
  const len = Math.hypot(dx, dy)
  const ux = dx / len
  const uy = dy / len

  const on = (k: number) => (step === k ? 1 : 0.3)
  const seg = (x: number, y: number, vx: number, vy: number, k: number, ghost = false) => (
    <line
      x1={x - vx * HALF} y1={y - vy * HALF} x2={x + vx * HALF} y2={y + vy * HALF}
      stroke="#d6452c" strokeWidth={ghost ? 1.6 : 3} strokeLinecap="round"
      opacity={(ghost ? 0.28 : 0.35) + (ghost ? 0.2 : 0.65) * on(k)}
    />
  )
  // 行进箭头：告诉人这一段是往哪边走的
  const arrow = (x0: number, y0: number, vx: number, vy: number, L: number, k: number) => {
    const x1 = x0 + vx * L
    const y1 = y0 + vy * L
    const px = -vy
    const py = vx
    return (
      <g stroke="#b5391f" fill="#b5391f" opacity={0.3 + 0.6 * on(k)}>
        <line x1={x0} y1={y0} x2={x1} y2={y1} strokeWidth={0.9} />
        <polygon points={`${x1},${y1} ${x1 - vx * 6 + px * 3},${y1 - vy * 6 + py * 3} ${x1 - vx * 6 - px * 3},${y1 - vy * 6 - py * 3}`} stroke="none" />
      </g>
    )
  }
  // 转身扫出来的两个对顶扇形
  const fan = (cx: number, cy: number) => {
    const a0 = Math.atan2(-1, 0)
    const a1 = Math.atan2(uy, ux) - Math.PI / 2 - Math.PI / 2
    const arc = (flip: number) => {
      let d = `M${cx} ${cy}`
      for (let i = 0; i <= 8; i++) {
        const a = a0 + (a1 - a0) * (i / 8) + flip
        d += `L${(cx + Math.cos(a) * HALF).toFixed(1)} ${(cy + Math.sin(a) * HALF).toFixed(1)}`
      }
      return d + 'Z'
    }
    return <g fill="#4a6b52" fillOpacity={0.55}><path d={arc(0)} /><path d={arc(Math.PI)} /></g>
  }

  return (
    <svg viewBox="0 0 320 212" role="img" aria-label="Pál 接头原理图，角度已放大">
      {/* 出发线 / 落脚线 / 回程线 */}
      <line x1={L1} y1={26} x2={L1} y2={196} stroke="#9a968a" strokeWidth={1} strokeDasharray="5 4" />
      <line x1={L2} y1={26} x2={L2} y2={196} stroke="#4a6b52" strokeWidth={1} strokeDasharray="5 4" />
      <line
        x1={L1 - ux * 16} y1={QY - uy * 16} x2={L2 + ux * 22} y2={CY + uy * 22}
        stroke="#d6452c" strokeWidth={1.2} strokeDasharray="5 4" opacity={step >= 2 ? 0.9 : 0.35}
      />

      {fan(L1, QY)}
      {fan(L2, CY)}
      {/* 支点：针的中点，不是端点 */}
      <circle cx={L1} cy={QY} r={4} fill="none" stroke="#3f5c46" strokeWidth={1.4} />
      <circle cx={L2} cy={CY} r={4} fill="none" stroke="#3f5c46" strokeWidth={1.4} />

      {arrow(L1 - 9, 150, 0, -1, 74, 1)}
      {arrow(L1 + ux * 42 - uy * 9, QY + uy * 42 + ux * 9, ux, uy, 56, 3)}

      {seg(L1, 168, 0, 1, 1)}
      {seg(L1, QY, 0, 1, 1, step > 1)}
      {seg(L1, QY, ux, uy, 2)}
      {seg(L2, CY, ux, uy, 3, step > 3)}
      {seg(L2, CY, 0, 1, 4)}

      {/* h 的标注 */}
      <g stroke="#8a8470" strokeWidth={0.8}>
        <line x1={L1} y1={200} x2={L2} y2={200} />
        <line x1={L1} y1={196} x2={L1} y2={204} />
        <line x1={L2} y1={196} x2={L2} y2={204} />
      </g>
      <text x={(L1 + L2) / 2} y={196} fontSize={10} fill="#8a8470" textAnchor="middle">h</text>
      <text x={L1 - 8} y={110} fontSize={10} fill="#8a8470" textAnchor="end">D</text>

      <g fontSize={10} fontFamily="var(--font-mono)">
        <text x={150} y={40} fill="#8a8470" opacity={0.4 + 0.6 * on(1)}>① 沿灰线滑出 D · 免费</text>
        <text x={150} y={62} fill="#b5391f" opacity={0.4 + 0.6 * on(2)}>② 转 ε，拨到红线上 · ε/4</text>
        <text x={150} y={84} fill="#b5391f" opacity={0.4 + 0.6 * on(3)}>③ 沿红线滑回 · 免费</text>
        <text x={150} y={106} fill="#3f5c46" opacity={0.4 + 0.6 * on(4)}>④ 转回 −ε，落在绿线 · ε/4</text>
      </g>
      <text x={150} y={132} fontSize={10} fill="#4a6b52">绿块 = 全部代价，共 ε/2</text>
      <text x={150} y={150} fontSize={10} fill="#4a6b52">绿圈 = 支点，取针的中点最省</text>
      <text x={6} y={16} fontSize={10} fill="#9a968a">示意：ε 画成了 23°，真实只有两三度</text>
    </svg>
  )
}

function fitter(pts: Pt[], W: number, H: number, pad: number) {
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (const [x, y] of pts) {
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }
  const s = Math.min((W - 2 * pad) / Math.max(maxX - minX, 1e-6), (H - 2 * pad) / Math.max(maxY - minY, 1e-6))
  const ox = W / 2 - ((minX + maxX) / 2) * s
  const oy = H / 2 + ((minY + maxY) / 2) * s
  return { s, to: (p: Pt): Pt => [ox + p[0] * s, oy - p[1] * s] }
}

function JourneyPanel() {
  const [jn, setJn] = useState(2)
  const [D, setD] = useState(3)
  const tris = useMemo(() => buildTree(jn), [jn])
  const { frames, trail } = useMemo(() => buildJourney(tris, D), [tris, D])
  const p = usePlayer(frames.length, 8)
  const f = frames[p.i]

  const VB = 330
  const H = 300

  // 相机永远框住「整棵树 + 当前这根针」：针跑远时画面自动拉开，回来时再收拢。
  // 故意不把已经画下的远处扇形算进来，否则镜头一旦拉开就再也收不回去了。
  const { s, to } = useMemo(() => fitter([[-0.42, -0.08], [1.42, 1.08], f.seg[0], f.seg[1]], VB, H, 16), [f])

  // 这棵树里每次接头要跨的垂直距离，取个代表值来画「接头有多便宜」那条曲线。
  const hRef = useMemo(() => {
    let acc = 0
    let cnt = 0
    for (let i = 0; i + 1 < tris.length; i++) {
      const phi = Math.atan2(1, tris[i].ax - tris[i].x1)
      acc += Math.abs((tris[i + 1].ax - tris[i].ax) * Math.sin(phi))
      cnt++
    }
    return cnt ? Math.max(acc / cnt, 1e-3) : 0.1
  }, [tris])
  const joinCost = (d: number) => Math.asin(Math.min(0.98, hRef / d)) / 2
  const costMax = joinCost(1.5)

  const triPath = (t: Tri) => {
    const a = to([t.x0, 0])
    const b = to([t.x1, 0])
    const c = to([t.ax, 1])
    return `M${a[0].toFixed(1)} ${a[1].toFixed(1)}L${b[0].toFixed(1)} ${b[1].toFixed(1)}L${c[0].toFixed(1)} ${c[1].toFixed(1)}Z`
  }

  const wedgePath = (w: Wedge, flip: boolean) => {
    let d = `M${to(w.c).map((v) => v.toFixed(1)).join(' ')}`
    for (let i = 0; i <= 6; i++) {
      const a = w.a0 + (w.a1 - w.a0) * (i / 6) + (flip ? Math.PI : 0)
      d += 'L' + to(shift(w.c, unit(a), 0.5)).map((v) => v.toFixed(1)).join(' ')
    }
    return d + 'Z'
  }

  const base0 = to([-0.6, 0])
  const base1 = to([1.6, 0])

  return (
    <div className="lab">
      <div className="controls" style={{ marginTop: 0, marginBottom: 16, borderTop: 'none', paddingTop: 0 }}>
        <div className="seg" role="tablist" aria-label="切几片">
          {[1, 2, 3].map((v) => (
            <button key={v} className={v === jn ? 'on' : ''} onClick={() => setJn(v)}>{2 ** v} 片</button>
          ))}
        </div>
      </div>

      <div className="lab-panels">
        <div className="lab-panel" style={{ flex: '1 1 330px' }}>
          <h4>针在碎片之间接力</h4>
          <svg viewBox={`0 0 ${VB} ${H}`} role="img" aria-label="单位针在 Perron 树的碎片间移动，用 Pál 接头换平行线">
            <line x1={base0[0]} y1={base0[1]} x2={base1[0]} y2={base1[1]} stroke="#d9d2c4" />
            <g fill="#8a8470" fillOpacity={0.22} stroke="#c9c2b2" strokeWidth={0.6}>
              {tris.map((t, i) => <path key={i} d={triPath(t)} />)}
            </g>
            {/* 接头的三条线：出发线（灰）、落脚线（绿）、回程线（红） */}
            {f.guide && (
              <g strokeWidth={1} strokeDasharray="5 4" fill="none">
                <line stroke="#9a968a" opacity={0.85}
                  x1={to(f.guide.a[0])[0]} y1={to(f.guide.a[0])[1]} x2={to(f.guide.a[1])[0]} y2={to(f.guide.a[1])[1]} />
                <line stroke="#4a6b52" opacity={0.85}
                  x1={to(f.guide.b[0])[0]} y1={to(f.guide.b[0])[1]} x2={to(f.guide.b[1])[0]} y2={to(f.guide.b[1])[1]} />
                {f.guide.transit && (
                  <line stroke="#d6452c" strokeWidth={1.2} opacity={0.85}
                    x1={to(f.guide.transit[0])[0]} y1={to(f.guide.transit[0])[1]}
                    x2={to(f.guide.transit[1])[0]} y2={to(f.guide.transit[1])[1]} />
                )}
              </g>
            )}
            {/* 针在片内扫出来的扇形（累积） */}
            <g stroke="#d6452c" strokeWidth={0.8} opacity={0.22}>
              {trail.slice(0, f.trail).map((seg, i) => {
                const a = to(seg[0])
                const b = to(seg[1])
                return <line key={i} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} />
              })}
            </g>
            {/* 接头那两小片扫过的面积 */}
            <g fill="#4a6b52" fillOpacity={0.5}>
              {f.wedges.map((w, i) => (
                <g key={i}>
                  <path d={wedgePath(w, false)} />
                  <path d={wedgePath(w, true)} />
                </g>
              ))}
            </g>
            <line
              x1={to(f.seg[0])[0]} y1={to(f.seg[0])[1]} x2={to(f.seg[1])[0]} y2={to(f.seg[1])[1]}
              stroke="#d6452c" strokeWidth={3} strokeLinecap="round"
            />
            <circle cx={to(f.seg[0])[0]} cy={to(f.seg[0])[1]} r={3.2} fill="#d6452c" />
            <circle cx={to(f.seg[1])[0]} cy={to(f.seg[1])[1]} r={3.2} fill="#d6452c" />
            {/* 转身时把支点标出来：接头绕针的中点转（最省），片内扫描绕三角形顶点转 */}
            {f.guide && (f.guide.step === 2 || f.guide.step === 4) && (() => {
              const m = to([(f.seg[0][0] + f.seg[1][0]) / 2, (f.seg[0][1] + f.seg[1][1]) / 2])
              return <circle cx={m[0]} cy={m[1]} r={5} fill="none" stroke="#3f5c46" strokeWidth={1.6} />
            })()}
            <text x={8} y={16} fontSize={10.5} fill="#9a968a">针长 = {s.toFixed(0)} px</text>
            {f.guide ? (
              <g fontSize={9.5}>
                <text x={8} y={H - 20} fill="#9a968a">灰 = 出发线</text>
                <text x={82} y={H - 20} fill="#d6452c">红 = 回程线</text>
                <text x={156} y={H - 20} fill="#4a6b52">绿 = 落脚线</text>
                <text x={8} y={H - 6} fill="#4a6b52">
                  {f.guide.step === 2 || f.guide.step === 4
                    ? '绿圈 = 转身的支点，取针的中点最省；绿块 = 转身扫掉的面积'
                    : '绿块 = 接头转身扫掉的面积'}
                </text>
              </g>
            ) : (
              <text x={8} y={H - 8} fontSize={10} fill="#4a6b52">绿块 = 接头真正扫掉的面积</text>
            )}
          </svg>
        </div>

        <div className="lab-panel" style={{ flex: '1 1 250px' }}>
          <h4>接头原理（ε 放大了看）</h4>
          <PalSchematic step={f.guide ? f.guide.step : 0} />

          <h4 style={{ marginTop: 14 }}>接头有多便宜</h4>
          <svg viewBox="0 0 320 150" role="img" aria-label="接头面积随滑出距离 D 衰减">
            <text x={6} y={13} fontSize={10.5} fill="#9a968a">
              一次接头扫过的面积 ≈ h/(2D)，这里 h ≈ {hRef.toFixed(3)}
            </text>
            <line x1={36} y1={122} x2={310} y2={122} stroke="#d9d2c4" />
            <line x1={36} y1={24} x2={36} y2={122} stroke="#d9d2c4" />
            <path
              d={Array.from({ length: 60 }, (_, i) => {
                const d = 1.5 + (i / 59) * 12
                return `${i ? 'L' : 'M'}${36 + ((d - 1.5) / 12) * 272} ${122 - (joinCost(d) / costMax) * 96}`
              }).join('')}
              fill="none" stroke="#8a8470" strokeWidth={1.6}
            />
            <circle
              cx={36 + ((D - 1.5) / 12) * 272}
              cy={122 - (joinCost(D) / costMax) * 96}
              r={5} fill="#d6452c" stroke="#faf7f0" strokeWidth={1.8}
            />
            <text x={36} y={136} fontSize={9} fill="#9a968a">D=1.5</text>
            <text x={310} y={136} fontSize={9} fill="#9a968a" textAnchor="end">D=13.5</text>
            <text x={6} y={148} fontSize={10.5} fill="#4a6b52">没有下界：D 要多大有多大，这一项就要多小有多小。</text>
          </svg>

          <div style={{ fontSize: 13.5, color: 'var(--ink-soft)', marginTop: 10, lineHeight: 1.65 }}>
            关键的一句：<strong>线段沿着自己所在的直线滑动，扫过的面积是 0</strong>。
            所以①③那两段「跑很远」本身不花钱，花钱的只有②④两下转身。
            左边动画里的 ε 只有两三度，几乎看不出来，那正是它便宜的原因。
          </div>
        </div>
      </div>

      <div className="step-note">{f.note}</div>

      <Player p={p} />

      <div className="controls">
        <div className="control" style={{ flex: '1 1 220px' }}>
          <label htmlFor="jd">
            接头滑出多远 D <b>{D.toFixed(1)}</b>（针长的 {D.toFixed(1)} 倍）
          </label>
          <input id="jd" type="range" min={1.5} max={13.5} step={0.5} value={D} onChange={(e) => setD(+e.target.value)} />
        </div>
        <div style={{ fontSize: 13.5, color: 'var(--ink-soft)', maxWidth: '22em' }}>
          拉大 D，远处那次转身的角度 ε 跟着变小，接头面积一路掉；代价只是针要跑得更远。
        </div>
      </div>

      <div className="readout">
        <div className="item">
          <span className="lbl">已转过的方向</span>
          <span className="val">{f.swept.toFixed(1)}°</span>
        </div>
        <div className="item">
          <span className="lbl">用掉的接头</span>
          <span className="val">{f.joins} / {tris.length - 1}</span>
        </div>
        <div className="item">
          <span className="lbl">接头累计面积</span>
          <span className="val">{f.joinArea.toFixed(4)}</span>
        </div>
        <div className="item">
          <span className="lbl">碎片并集面积</span>
          <span className="val">{fmt(treeArea(tris))}</span>
        </div>
      </div>
    </div>
  )
}

/* ═══════════ 面板二之三 · 「等于 0」不是「趋近于 0」 ═══════════ */

/**
 * 用康托集把「测度等于 0」这件事讲清楚，因为它比挂谷集简单得多，
 * 而逻辑是一模一样的：
 *   · 每一层都是一个确定的、看得见的集合，长度 (2/3)ⁿ，永远是正的；
 *   · 极限对象 C 是所有层的交，它被夹在每一层里面，所以 |C| ≤ (2/3)ⁿ 对每个 n 成立；
 *   · 一个非负数如果比任何正数都小，它只能是 0。这一步不是「趋近」，是被夹死。
 * 挂谷集走的是同一条路：对每个 n 都被一个面积 < 1/n 的图形罩住，所以面积精确等于 0。
 */

const CANTOR_MAX = 9

function cantorSegs(n: number): [number, number][] {
  let segs: [number, number][] = [[0, 1]]
  for (let k = 0; k < n; k++) {
    const out: [number, number][] = []
    for (const [a, b] of segs) {
      const t = (b - a) / 3
      out.push([a, a + t])
      out.push([b - t, b])
    }
    segs = out
  }
  return segs
}

const EPSILONS = [0.1, 0.01, 0.001]
/** 第几层的总长度首次小于 ε。 */
const layerFor = (eps: number) => Math.ceil(Math.log(eps) / Math.log(2 / 3))

function ZeroPanel() {
  const pl = usePlayer(CANTOR_MAX + 1, 2)
  const n = pl.i
  const len = (2 / 3) ** n

  const VB = 330
  const H = 220
  const X0 = 14
  const W = 302
  const rowY = (k: number) => 28 + k * 17

  // 第 6 层起每段已经窄过一个像素，硬画只会越画越糊、看起来墨反而更多。
  // 所以逐层图只画到画得下的那几层，真实长度交给下面那根「拼起来」的条。
  const DRAWABLE = 6
  const shown = Math.min(n, DRAWABLE)
  const rows = useMemo(
    () => Array.from({ length: shown + 1 }, (_, k) => cantorSegs(k)),
    [shown],
  )
  const barY = rowY(DRAWABLE) + 48

  const note = n === 0
    ? '从一条长度为 1 的线段开始。规矩只有一条：把每一段中间的三分之一挖掉。'
    : n < CANTOR_MAX
      ? `第 ${n} 层：${2 ** n} 段，每段长 1/${3 ** n}，加起来 (2/3)^${n} = ${len.toFixed(6)}。注意每一层都是实打实有长度的，正的。`
      : `第 ${n} 层总长 ${len.toFixed(6)}。康托集 C 是所有层的交集，它被夹在每一层里面，所以 |C| ≤ (2/3)ⁿ 对每个 n 都成立。而 (2/3)ⁿ 能小过任何给定的正数。一个非负数比任何正数都小，就只能是 0。这一步不是「趋近」，是被夹死。`

  const gy = (v: number) => 24 + (Math.log10(v) / -6) * 92 // v ∈ [1e-6, 1]，1 在顶上
  const gx = (k: number) => 34 + (k / 40) * 280

  return (
    <div className="lab">
      <div className="lab-panels">
        <div className="lab-panel" style={{ flex: '1 1 330px' }}>
          <h4>每挖一次，长度乘 2/3</h4>
          <svg viewBox={`0 0 ${VB} ${H}`} role="img" aria-label="康托集逐层构造，总长度按 (2/3)ⁿ 下降">
            <text x={X0} y={16} fontSize={10.5} fill="#9a968a">每一层都套在上一层里面</text>
            {rows.map((segs, k) => (
              <g key={k}>
                <text x={X0 - 8} y={rowY(k) + 7} fontSize={8.5} fill="#c0b9a8" textAnchor="end">{k}</text>
                <g fill={k === n ? '#d6452c' : '#c9c2b2'}>
                  {segs.map(([a, b], i) => (
                    <rect key={i} x={X0 + a * W} y={rowY(k)} width={(b - a) * W} height={8} rx={0.8} />
                  ))}
                </g>
              </g>
            ))}
            {n > DRAWABLE && (
              <text x={X0} y={rowY(DRAWABLE) + 22} fontSize={9.5} fill="#9a968a">
                第 {DRAWABLE + 1}–{n} 层每段已经窄过一个像素，画不出来了，看下面这根
              </text>
            )}

            {/* 把这一层的所有段拼到一起：长度的缩水就藏不住了 */}
            <text x={X0} y={barY - 5} fontSize={10} fill="#9a968a">
              把第 {n} 层的 {2 ** n} 段拼到一起，跟第 0 层比
            </text>
            <rect x={X0} y={barY} width={W} height={11} rx={1.5} fill="none" stroke="#c9c2b2" strokeDasharray="3 3" />
            <rect x={X0} y={barY} width={Math.max(len * W, 0.6)} height={11} rx={1.5} fill="#d6452c" />
            <text x={X0} y={barY + 27} fontSize={10.5} fill="#4a6b52">
              总长 {len.toFixed(6)}，可里面的点一个也没少
            </text>
          </svg>
        </div>

        <div className="lab-panel" style={{ flex: '1 1 250px' }}>
          <h4>任给一个 ε，总有一层比它短</h4>
          <svg viewBox="0 0 330 150" role="img" aria-label="总长度 (2/3)ⁿ 与若干 ε 阈值的对比">
            <line x1={34} y1={116} x2={318} y2={116} stroke="#d9d2c4" />
            <line x1={34} y1={20} x2={34} y2={116} stroke="#d9d2c4" />
            <text x={6} y={26} fontSize={9} fill="#9a968a">1</text>
            <text x={4} y={119} fontSize={9} fill="#9a968a">1e-6</text>
            {EPSILONS.map((eps) => (
              <g key={eps}>
                <line x1={34} y1={gy(eps)} x2={318} y2={gy(eps)} stroke="#4a6b52" strokeWidth={0.7} strokeDasharray="4 4" opacity={0.6} />
                <text x={318} y={gy(eps) - 3} fontSize={9} fill="#4a6b52" textAnchor="end">ε = {eps}，第 {layerFor(eps)} 层起</text>
              </g>
            ))}
            {/* 只画到轴的下沿（第 34 层），再用一个箭头表示它继续往下，不会停 */}
            <path
              d={Array.from({ length: 35 }, (_, k) => `${k ? 'L' : 'M'}${gx(k)} ${gy((2 / 3) ** k)}`).join('')}
              fill="none" stroke="#8a8470" strokeWidth={1.6}
            />
            <polygon points={`${gx(34)},${116} ${gx(34) - 3.5},${109} ${gx(34) + 3.5},${109}`} fill="#8a8470" />
            <circle cx={gx(n)} cy={gy(Math.max(len, 1e-6))} r={5} fill="#d6452c" stroke="#faf7f0" strokeWidth={1.8} />
            <text x={34} y={130} fontSize={9} fill="#9a968a">第 0 层</text>
            <text x={318} y={130} fontSize={9} fill="#9a968a" textAnchor="end">第 40 层</text>
            <text x={6} y={146} fontSize={10.5} fill="#4a6b52">这条线一直往下，不会在任何正数上停住。</text>
          </svg>

          <div style={{ fontSize: 13.5, color: 'var(--ink-soft)', marginTop: 10, lineHeight: 1.65 }}>
            <strong>测度 0 不等于空，也不等于稀</strong>。康托集里的点跟整条线段上的点一样多（都是不可数的），
            它却连一丁点长度都没有。有理数在数轴上处处稠密，长度也是 0。
            「量出来是 0」和「里面没东西」是两件不相干的事。
          </div>
        </div>
      </div>

      <div className="step-note">{note}</div>

      <Player p={pl} />

      <div className="readout">
        <div className="item">
          <span className="lbl">当前层</span>
          <span className="val">{n}</span>
        </div>
        <div className="item">
          <span className="lbl">这一层的段数</span>
          <span className="val">{2 ** n}</span>
        </div>
        <div className="item">
          <span className="lbl">这一层的总长</span>
          <span className="val">{len.toFixed(6)}</span>
        </div>
        <div className="item">
          <span className="lbl">康托集本身的长度</span>
          <span className="val">0</span>
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
  const pl = usePlayer(DELTA_K.length, 2)
  const li = pl.i
  const tris = useMemo(() => buildTree(n), [n])
  const delta = 1 / 2 ** DELTA_K[li]
  const sliceW = 1 / 2 ** n

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

  const allN = curves.flatMap((c) => c.pts.map((q) => Math.log(q.n)))
  const maxLogN = Math.max(...allN) * 1.06
  const gx = (v: number) => 44 + (v / Math.log(256)) * 258
  const gy = (v: number) => 108 - (v / maxLogN) * 86

  // 相邻两档之间的「局部斜率」：δ 每减半，格子数翻了几倍取以 2 为底的对数。
  // 这个数才是真正在漂移的东西，整段拟合出来的斜率只是它的平均。
  const treePts = curves[1].pts
  const local = li === 0 ? NaN : Math.log2(treePts[li].n / treePts[li - 1].n)
  const note = li === 0
    ? `先把尺子调到最粗：δ = 1/4，比单片切片的宽度 1/${2 ** n} 粗得多。这么粗的格子分不出片与片之间的缝，量到的就是「一整块面」。`
    : delta > sliceW
      ? `δ = 1/${2 ** DELTA_K[li]}，还比单片宽度 1/${2 ** n} 粗。格子数翻了 ${(treePts[li].n / treePts[li - 1].n).toFixed(2)} 倍，也就是这一档量到的斜率 ${fmt(local, 2)}：尺子还看不见缝隙，读数贴着 2。`
      : `δ = 1/${2 ** DELTA_K[li]}，已经细过单片宽度 1/${2 ** n}。格子开始钻进片与片之间的空隙，这一档的斜率掉到 ${fmt(local, 2)}：同一个集合，换把尺子就「像」低了一维。`

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

      <div className="step-note">{note}</div>

      <Player p={pl} />

      <div className="controls">
        <div style={{ fontSize: 13.5, color: 'var(--ink-soft)', maxWidth: '30em' }}>
          维数不问「它有多大面积」，只问「盖住它要多少个 δ 格子」。格子数按 δ⁻ᵈ 涨，那个 d 就是维数。
          按播放，尺子会一档档变细，右边那三个红点跟着往上走。
        </div>
      </div>

      <div className="readout">
        <div className="item">
          <span className="lbl">方格边长 δ</span>
          <span className="val">1/{2 ** DELTA_K[li]}</span>
        </div>
        <div className="item">
          <span className="lbl">碰到的格子 N(δ)</span>
          <span className="val">{count}</span>
        </div>
        <div className="item">
          <span className="lbl">这一档量到的斜率</span>
          <span className="val">{li === 0 ? '—' : fmt(local, 2)}</span>
        </div>
        <div className="item">
          <span className="lbl">单片切片的宽度</span>
          <span className="val">1/{2 ** n}</span>
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
  const [spin, setSpin] = useState(true)

  // 自动转视角：静止的线框看不出这是三维的，转起来才看得出「方向铺满的是一张球面」。
  useEffect(() => {
    if (!spin) return
    let raf = 0
    let last = performance.now()
    const tick = (t: number) => {
      const dt = Math.min(t - last, 60)
      last = t
      setPhi((v) => (v + dt * 0.014) % 360)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [spin])

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
            转一转视角 <b>{phi.toFixed(0)}°</b>
          </label>
          <input
            id="phi" type="range" min={0} max={360} step={1} value={phi}
            onChange={(e) => { setSpin(false); setPhi(+e.target.value) }}
          />
        </div>
        <button className="btn" onClick={() => setSpin((v) => !v)}>{spin ? '停下' : '自动转'}</button>
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

/* ═══════════ 面板五 · 它在猜想塔里的位置 ═══════════ */

/**
 * 调和分析里这几个猜想有一条已知的单向蕴含链，越上面越强。
 * Kakeya 蹲在最底下：上面任何一个成立都能推出它，所以它是所有人的必要条件；
 * 反过来不行，补上它不等于上面自动成立。
 */
const TOWER = [
  { name: '局部光滑性猜想', sub: '波动方程解的正则性', done: false },
  { name: 'Bochner–Riesz 猜想', sub: '球截断的傅里叶级数何时收敛', done: false },
  { name: '限制性猜想', sub: '傅里叶变换能不能限制到曲面上', done: false },
  { name: 'Kakeya 极大函数猜想', sub: '一堆细管子叠起来能有多亮', done: false },
  { name: 'Kakeya 维数猜想', sub: 'ℝ² 1971 · ℝ³ 2025 ✓ · n ≥ 4 仍未解决', done: true },
]

function TowerPanel() {
  const BH = 36
  const GAP = 13
  const VB = 330
  const H = TOWER.length * BH + (TOWER.length - 1) * GAP + 34

  return (
    <div className="lab">
      <div className="lab-panels">
        <div className="lab-panel" style={{ flex: '1 1 320px' }}>
          <h4>它蹲在这座塔的最底下</h4>
          <svg viewBox={`0 0 ${VB} ${H}`} role="img" aria-label="调和分析中几个猜想的蕴含关系，Kakeya 在最底层">
            <text x={8} y={12} fontSize={10.5} fill="#9a968a">越往上越强：上面成立能推出下面，反过来不行</text>
            {TOWER.map((t, i) => {
              const y = 22 + i * (BH + GAP)
              return (
                <g key={t.name}>
                  <rect
                    x={10} y={y} width={244} height={BH} rx={4}
                    fill={t.done ? '#4a6b52' : '#f0ece1'}
                    fillOpacity={t.done ? 0.16 : 1}
                    stroke={t.done ? '#4a6b52' : '#ddd5c6'}
                    strokeWidth={t.done ? 1.6 : 1}
                  />
                  <text x={20} y={y + 15} fontSize={11.5} fill={t.done ? '#3f5c46' : '#4a4a44'} fontWeight={t.done ? 600 : 400}>
                    {t.name}
                  </text>
                  <text x={20} y={y + 29} fontSize={9.5} fill="#9a968a">{t.sub}</text>
                  {i < TOWER.length - 1 && (
                    <>
                      <text x={132} y={y + BH + 11} fontSize={11} fill="#b9b2a2" textAnchor="middle">↓</text>
                      {i === 0 && <text x={146} y={y + BH + 11} fontSize={9} fill="#c0b9a8">推出</text>}
                    </>
                  )}
                </g>
              )
            })}
            <text x={272} y={22 + 4 * (BH + GAP) + 22} fontSize={11} fill="#3f5c46" fontFamily="var(--font-mono)">2025</text>
          </svg>
        </div>

        <div className="lab-panel" style={{ flex: '1 1 250px' }}>
          <h4>补上最底层意味着什么</h4>
          <div style={{ fontSize: 13.5, color: 'var(--ink-soft)', lineHeight: 1.7 }}>
            <p style={{ margin: '0 0 12px' }}>
              蕴含是单向的，所以这不等于上面几个跟着解决了。它做成的是另外两件事。
            </p>
            <p style={{ margin: '0 0 12px' }}>
              <strong>一是清障。</strong>三十年里，任何想攻上面那几层的人，都得先确认自己不会撞上一个三维的低维反例。
              这个可能性现在被排除了：ℝ³ 里根本没有那种东西。
            </p>
            <p style={{ margin: 0 }}>
              <strong>二是方法，这一条更值钱。</strong>Wang–Zahl 真正证的是一个关于大量凸集并集体积的一般命题，
              核心是驯服所谓「粘性」结构：方向相近的管子成片黏在一起、伪装成低一维的东西。
              这类多尺度自相似的假反例在整个调和分析里到处都是，处理它们的框架是能搬走的。
            </p>
          </div>
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
        针在里面照样能转完 180°。
      </p>
      <p>
        先说清<strong>为什么要切</strong>。看第一幕那个三角形：针能转，靠的是里面藏着一整段连续的方向。
        可这些方向是被<strong>钉死在位置上</strong>的：想要 70° 那个方向，就只能到三角形里对应的那条线上去找，
        它跟一大块「肉」绑在一起，挪不动。
      </p>
      <p>
        切开就解开了这个绑定。把三角形从顶点切成细长片之后，每片各自领走一小段方向；
        而<strong>一片可以整体平移</strong>，平移偏偏改不了任何一条线段的方向。
        于是方向成了每片随身携带的东西，位置反倒自由了。既然自由，就把它们挪到一起互相重叠：
        方向一根没少，并集的面积却掉了下去。切得越碎，可以叠的地方越多。
      </p>

      <BesicovitchPanel n={n} setN={setN} />

      <p>
        右上那条曲线是当场积出来的面积比：2 片时压到 66.7%，128 片时压到 23.3%。
        下降很慢，大致是 <span className="k">1/n</span> 的量级，这正是这个构造的真实脾气。要把面积压到千分之一，
        得切成天文数字那么多片。但慢归慢，它没有下界，这就够了。
      </p>

      <h3>切完之后，针怎么走</h3>
      <p>
        上面省下来的面积，代价全落在这一步。碎片挪开了，针在一片里转完，
        下一片虽然方向接得上，位置却挪走了：针得<strong>换到一条平行的线上去</strong>，
        而中间那段路没人替它铺。
      </p>
      <p>
        Pál 的接头解决了这件事，而且几乎不要钱，靠的是一句几乎白送的事实：
        <strong>一根线段沿着自己所在的直线滑动，扫过的面积是 0</strong>。
        所以针可以先免费跑到很远的地方，在那里转一个极小的角，再免费跑回来。
        走这一趟斜线，回到近处时人已经横着偏出去了一点，正好落在那条平行线上。
        两次转身扫掉的面积约是 <span className="k">h/(2D)</span>，跑得越远越便宜，而且没有下界。
      </p>

      <JourneyPanel />

      <p>
        动画里有三处细节容易看成 bug，其实都是这个构造的本来面目。
      </p>
      <ul>
        <li>
          <strong>针尖一般够不到底线。</strong>针长恒为 1，而顶点到底边那条线段长 √(1+(ax−x)²)，只会更长。
          针只占了靠顶点那 1 个单位，尖端停在离底线 1−sin φ 的地方。只有针正好竖直时才刚好碰到。
        </li>
        <li>
          <strong>转身发生在离终点还差一点的位置，然后再滑下去。</strong>
          因为接头要花钱买的只有<strong>垂直</strong>那一段 h，沿针自身方向差多少都是白送的。
          所以只要转身落在落脚线上就够了，落在这条线的哪一点无所谓，构造根本不必算准。
        </li>
        <li>
          <strong>两种转法的支点不一样。</strong>片内扫描绕三角形的<strong>顶点</strong>转，那是针的一个端点；
          接头转身绕针自己的<strong>中点</strong>转。单位长线段绕距两端 r₁、r₂ 的点转 ε，扫过 ½ε(r₁²+r₂²)，
          在 r₁+r₂=1 下中点最省，得 ε/4，绕端点则要 ε/2，贵一倍。
          片内不挑便宜的，是因为扫出来的扇形本来就落在这片三角形里，那块面积早已算进集合；
          接头是在空地上转，每一寸都是新增，所以必须挑最省的。
        </li>
      </ul>
      <p>
        所以完整的针集是两部分拼起来的：碎片的并集（面积能压到任意小）
        加上所有接头（面积也能压到任意小）。一棵这样的树只覆盖 53° 那一段方向，
        把几棵转过角度的树用同样的接头接起来，180° 就凑满了。
        于是挂谷的问题得到了一个扫兴的答案：<strong>最小面积不存在</strong>。
      </p>

      <h3>插一段：「面积等于 0」到底是什么意思</h3>
      <p>
        这里有个坎，几乎每个人第一次都会卡住：上面那些图形，面积明明是 0.25、0.12、0.03，
        永远是个正数，怎么最后就成了 0？「无限趋近于 0」凭什么算「等于 0」？
      </p>
      <p>
        先把两件事分开，它们经常被同一句话盖住：
      </p>
      <ul>
        <li>
          <strong>针能真的连续转过去的图形</strong>：面积可以小于任给的 ε，但每一个都是正的。
          这里的结论是「<strong>没有最小值</strong>」，下确界是 0 但取不到。0 不是这一列里的成员。
        </li>
        <li>
          <strong>Besicovitch 集</strong>（只要求每个方向都含一整根单位线段，不要求针能连着转过去）：
          存在面积<strong>精确等于 0</strong> 的。这不是趋近，是真的等于。
        </li>
      </ul>
      <p>
        第二句怎么可能成立？换个简单得多的例子就一目了然，逻辑是一模一样的。
      </p>

      <ZeroPanel />

      <p>
        关键的那一步不是「趋近所以算」，而是<strong>被夹死</strong>：康托集 C 同时躺在每一层里面，
        所以它的长度 ≤ 每一层的长度。而 (2/3)ⁿ 能小于 0.1、小于 0.001、小于任何你说得出的正数。
        一个非负实数如果比每个正数都小，它就<strong>只能是 0</strong>，没有第二种可能。
        整个过程里没有出现「无穷小」这种含糊的东西，只有一个普通的实数被两边夹住。
      </p>
      <p>
        挂谷集走的是同一条路。真正测度为 0 的那个集合<strong>不是任何一个有限阶段的图形</strong>，
        不是那堆三角形的并集，而是把构造推到无穷之后得到的一个确定的紧集。
        它对每个 n 都被一个面积小于 1/n 的图形罩住，所以面积 ≤ 1/n 对每个 n 成立，于是等于 0；
        与此同时，「每个方向都有一根完整的单位线段」这条性质靠紧性在极限里保住了。
        面积掉到 0 和线段一根不少，这两件事可以同时为真。
      </p>
      <p>
        最后一句可能最反直觉：<strong>测度是 0，不代表里面没东西</strong>。
        一条线段的面积是 0，一整个康托集的长度是 0，有理数在数轴上处处稠密、长度还是 0。
        挂谷集里线段多到每个方向都有一根，面积却是 0。
        这跟「面积很小」根本不是一回事，是质变。也正因为面积这把尺子在 0 处失效了，
        才必须换一把新尺子，问题才在 1928 年之后真正开始。
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
        挂谷树落在中间，而且它的斜率<strong>会随尺度漂移</strong>，盯着读数里那个「这一档量到的斜率」看：
        δ 还比切片宽的时候它贴着 2，这堆东西看起来就是一整块面；
        δ 细到能分辨出单片三角形之后，它就往 1 滑，量到的更接近一束线。
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
      </p>

      <h2>尾声 · 这项工作松了什么土</h2>
      <p>
        一根针转个身，为什么值一枚菲尔兹奖？因为挂谷问题早就不是一道几何谜题了。
        1971 年 Fefferman 用 Besicovitch 集推翻了球乘子猜想，证明高维傅里叶级数按球截断时在 L^p 里未必收敛，
        从那时起它就成了调和分析的枢纽：一大批看起来毫不相干的猜想，最后都归结为同一件事，
        <strong>一堆细长管子叠在一起能有多小</strong>。
      </p>

      <TowerPanel />

      <p>
        顺着这条链往下游走，被松了土的地方大致是这么几片。
      </p>
      <ul>
        <li>
          <strong>傅里叶分析与偏微分方程</strong>：限制性猜想、Bochner–Riesz、波动方程的局部光滑性，
          以及色散方程解的逐点收敛（Carleson 型问题）。这些估计的技术核心都是管子的重叠计数。
        </li>
        <li>
          <strong>几何测度论</strong>：Furstenberg 集问题、投影定理这一族。
          方向反过来也成立：Kevin Ren 与王虹此前解决的平面 Furstenberg 集猜想，正是这次三维证明的关键输入之一。
          这不是单向输出，是同一套工具在两边来回用。
        </li>
        <li>
          <strong>理论计算机科学</strong>：有限域版本的挂谷问题被 Dvir 用多项式方法解决之后，
          那套方法直接进了随机性提取器和去随机化的工具箱。这是挂谷问题越出分析学的既成事实。
        </li>
        <li>
          <strong>成像与信号处理</strong>：X 射线变换、层析成像里的稳定性估计，和 Kakeya 极大函数是同源的，
          问的都是「细长的探测线互相重叠时，信息会丢多少」。
        </li>
      </ul>
      <p>
        还有一件事值得说清楚：<strong>四维以上的挂谷猜想仍然没有解决</strong>。
        王虹与 Zahl 补上的是 ℝ³ 这一格。所以这不是一个句号，
        更像是三十年僵局里第一次有人示范了「粘性构造是可以被拆掉的」。
        2026 年 7 月，王虹获菲尔兹奖，获奖理由里列入了这项工作。
      </p>

      <Landing>
        挂谷问题的分量不在那根针，在于它是一个<strong>最低门槛</strong>：
        调和分析里一整层楼的猜想，谁也绕不过它。这类问题在数学里很常见，
        表述简单到能讲给中学生听，却卡在所有人的必经之路上。
        真正的进展往往也不是「算出了那个数」，而是发明了一套能对付某类结构的方法，
        然后这套方法被搬到别处去。
      </Landing>
    </AlgoShell>
  )
}
