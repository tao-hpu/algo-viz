import { useEffect, useMemo, useState } from 'react'
import { AlgoShell, Landing } from '../components/AlgoShell'

/* ────────────────────────────────────────────────────────────
   单位圆与三角函数 · 一个圆周运动，两面墙上的两道影子

   全页要说清的一件事：sin 和 cos 不是「三角形里的比值」，而是
   同一个匀速圆周运动在两个互相垂直的方向上的坐标。三角形定义
   只在锐角里成立，圆定义从一开始就管所有角，正负、超过一圈都管。

   主面板是一个轴测盒子：单位圆立在左墙上转，圆上那个点的高度
   （z 坐标）落到后墙成 sin(x)，它的进深（y 坐标）落到地板成
   cos(x)。两道影子来自同一个点，所以它们天然差四分之一圈。

   顺带把三件常被跳过的事讲清：
   · 横轴量的不是「转了几度」，是圆上走过的弧长——这就是弧度制；
   · sin² + cos² = 1 不是要背的公式，它就是圆的方程本身；
   · sin′ = cos 只在弧度下成立，角度下会多出 π/180，页面里当场算给你看。

   数字全部当场算：投影用固定的轴测基（平行投影，无透视），
   波形逐点采样，导数用差商实算，没有预先写死的常数。
   ──────────────────────────────────────────────────────────── */

type P2 = [number, number]

const TAU = Math.PI * 2
const DEG = 180 / Math.PI
const fmt = (v: number, d = 3) => (Math.abs(v) < 5e-4 ? (0).toFixed(d) : v.toFixed(d))

// 配色：圆是赭石，sin 是绛红，cos 是靛青——两道影子必须一眼能分开。
const C_CIRC = '#c4622d'
const C_SIN = '#bf4468'
const C_COS = '#2e7089'
const C_GRID = '#ddd5c5'
const C_GRID_FAINT = '#e8e1d2'
const C_GUIDE = '#b3ab99'

/* ── 轴测投影 ────────────────────────────────────────────────
   世界坐标三根轴，各自对应一个固定的屏幕向量：
     x = 时间轴（往右、略往下），y = 进深轴（cos 的方向，往左前方），
     z = 竖直轴（sin 的方向，正上）。
   三个向量线性组合就是投影点。这是平行投影：没有近大远小，
   所以圆投出来永远是同一个椭圆，波形也不会因为跑远了而缩水。 */
const EX: P2 = [46, 13.5]
const EY: P2 = [-60, 35]
const EZ: P2 = [0, -70]
const ORIGIN: P2 = [154, 165]

function proj(x: number, y: number, z: number): P2 {
  return [
    ORIGIN[0] + x * EX[0] + y * EY[0],
    ORIGIN[1] + x * EX[1] + y * EY[1] + z * EZ[1],
  ]
}
const S = (p: P2) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`
const polyline = (pts: P2[]) => pts.map(S).join(' ')
const pathOf = (pts: P2[]) => pts.map((p, i) => (i ? 'L' : 'M') + S(p)).join('')

/** 在投影后的平面上给一条线加箭头（三角形三个点）。 */
function arrowHead(tip: P2, dir: P2, size = 7): string {
  const len = Math.hypot(dir[0], dir[1]) || 1
  const [ux, uy] = [dir[0] / len, dir[1] / len]
  const [px, py] = [-uy, ux]
  const back: P2 = [tip[0] - ux * size, tip[1] - uy * size]
  const a: P2 = [back[0] + px * size * 0.42, back[1] + py * size * 0.42]
  const b: P2 = [back[0] - px * size * 0.42, back[1] - py * size * 0.42]
  return polyline([tip, a, b])
}

const X_MAX = TAU
// 圆单独立在盒子最左边那面墙上：它要是骑在 x=0 上，前半个周期的梳齿会从
// 圆里穿过去。往左挪一个半径多一点，波从墙角起步，两样东西都干净。
// 高度对应关系不受影响——投影是线性的，圆上那点的 z 和波上那点的 z 依然同一个数。
const X_CIRC = -1.6
const X_PAD_R = 0.55
const Y_HALF = 1.18      // 地板往两侧各铺多宽（cos 的取值范围 ±1 再留点边）
const Z_TOP = 1.3
const Z_FLOOR = -1.6     // 地板高度：压在圆下面，两道影子才不会挤在一起
const TEETH = 132        // 梳齿数：疏了像折线，密了糊成色块

/** 一整条 sin 波（后墙上，y=0 平面）与 cos 波（地板上，z=Z_FLOOR 平面）。 */
function wavePts(kind: 'sin' | 'cos', from: number, to: number, n: number): P2[] {
  const out: P2[] = []
  for (let i = 0; i <= n; i++) {
    const x = from + ((to - from) * i) / n
    out.push(kind === 'sin' ? proj(x, 0, Math.sin(x)) : proj(x, Math.cos(x), Z_FLOOR))
  }
  return out
}

/* ══════════════════════════════════════════════════════════
   主面板：三面盒子
   ══════════════════════════════════════════════════════════ */
function Box({ theta }: { theta: number }) {
  const VBW = 550
  const VBH = 422

  const xL = X_CIRC
  const xR = X_MAX + X_PAD_R

  // 整周期的两条波先画淡的，走过的部分再压实——画面不会因为进度而跳。
  const ghostSin = useMemo(() => pathOf(wavePts('sin', 0, X_MAX, 180)), [])
  const ghostCos = useMemo(() => pathOf(wavePts('cos', 0, X_MAX, 180)), [])
  const liveSin = pathOf(wavePts('sin', 0, Math.max(theta, 1e-3), 140))
  const liveCos = pathOf(wavePts('cos', 0, Math.max(theta, 1e-3), 140))

  // 梳齿：每根都是从基线拉到函数值的一段实线，密排起来就是那种手绘阴影感。
  const teeth: { sin: [P2, P2][]; cos: [P2, P2][] } = { sin: [], cos: [] }
  for (let i = 0; i <= TEETH; i++) {
    const x = (X_MAX * i) / TEETH
    if (x > theta) break
    teeth.sin.push([proj(x, 0, 0), proj(x, 0, Math.sin(x))])
    teeth.cos.push([proj(x, 0, Z_FLOOR), proj(x, Math.cos(x), Z_FLOOR)])
  }

  const sy = Math.sin(theta)
  const cy = Math.cos(theta)
  const pCirc = proj(X_CIRC, cy, sy)            // 圆上的动点
  const pSin = proj(theta, 0, sy)               // 它落在后墙上的影子
  const pCos = proj(theta, cy, Z_FLOOR)         // 它落在地板上的影子

  // 圆本身：在 x = X_CIRC 这张竖直平面里，参数方程 (cos t, sin t)。
  const circle = useMemo(() => {
    const pts: P2[] = []
    for (let i = 0; i <= 120; i++) {
      const t = (TAU * i) / 120
      pts.push(proj(X_CIRC, Math.cos(t), Math.sin(t)))
    }
    return pathOf(pts) + 'Z'
  }, [])

  // 已经扫过的那块扇形 + 圆周上走过的那段弧（弧长恰好等于横轴走过的距离）。
  const sector: P2[] = [proj(X_CIRC, 0, 0)]
  const arc: P2[] = []
  const nA = Math.max(2, Math.round((theta / TAU) * 120))
  for (let i = 0; i <= nA; i++) {
    const t = (theta * i) / nA
    sector.push(proj(X_CIRC, Math.cos(t), Math.sin(t)))
    arc.push(proj(X_CIRC, Math.cos(t), Math.sin(t)))
  }

  const gridX = useMemo(() => {
    const out: number[] = []
    for (let k = 0; k <= 4; k++) out.push((TAU * k) / 4)
    return out
  }, [])

  return (
    <svg viewBox={`0 0 ${VBW} ${VBH}`} role="img" aria-label="单位圆与它在两面墙上的正弦、余弦投影">
      {/* 地板（z = Z_FLOOR）：cos 落在这儿 */}
      <polygon
        points={polyline([
          proj(xL, -Y_HALF, Z_FLOOR), proj(xR, -Y_HALF, Z_FLOOR),
          proj(xR, Y_HALF, Z_FLOOR), proj(xL, Y_HALF, Z_FLOOR),
        ])}
        fill="#f3ecdd" stroke={C_GRID} strokeWidth={0.8}
      />
      {gridX.map((x) => (
        <line key={`fx${x}`} {...lineProps(proj(x, -Y_HALF, Z_FLOOR), proj(x, Y_HALF, Z_FLOOR))}
          stroke={C_GRID_FAINT} strokeWidth={0.8} />
      ))}
      {[-1, 1].map((y) => (
        <line key={`fy${y}`} {...lineProps(proj(xL, y, Z_FLOOR), proj(xR, y, Z_FLOOR))}
          stroke={C_GRID_FAINT} strokeWidth={0.8} />
      ))}

      {/* 后墙（y = 0）：sin 落在这儿 */}
      <polygon
        points={polyline([
          proj(xL, 0, Z_FLOOR), proj(xR, 0, Z_FLOOR),
          proj(xR, 0, Z_TOP), proj(xL, 0, Z_TOP),
        ])}
        fill="#f7f2e7" fillOpacity={0.92} stroke={C_GRID} strokeWidth={0.8}
      />
      {gridX.map((x) => (
        <line key={`wx${x}`} {...lineProps(proj(x, 0, Z_FLOOR), proj(x, 0, Z_TOP))}
          stroke={C_GRID_FAINT} strokeWidth={0.8} />
      ))}
      {[-1, 1].map((z) => (
        <line key={`wz${z}`} {...lineProps(proj(xL, 0, z), proj(xR, 0, z))}
          stroke={C_GRID_FAINT} strokeWidth={0.8} />
      ))}

      {/* 左墙（x = X_CIRC）：圆立在这张面上 */}
      <polygon
        points={polyline([
          proj(X_CIRC, -Y_HALF, Z_FLOOR), proj(X_CIRC, Y_HALF, Z_FLOOR),
          proj(X_CIRC, Y_HALF, Z_TOP), proj(X_CIRC, -Y_HALF, Z_TOP),
        ])}
        fill="#efe8d8" fillOpacity={0.55} stroke={C_GRID} strokeWidth={0.8}
      />

      {/* 两条基线（都是 x 轴，一条贴墙、一条贴地）+ 箭头 */}
      <line {...lineProps(proj(xL, 0, 0), proj(xR, 0, 0))} stroke="#3a382f" strokeWidth={1.4} />
      <polygon points={arrowHead(proj(xR, 0, 0), EX)} fill="#3a382f" />
      <line {...lineProps(proj(xL, 0, Z_FLOOR), proj(xR, 0, Z_FLOOR))} stroke="#3a382f" strokeWidth={1.4} />
      <polygon points={arrowHead(proj(xR, 0, Z_FLOOR), EX)} fill="#3a382f" />

      {/* 横轴上已经走过的那一段：它的长度 = 圆上走过的弧长 */}
      <line {...lineProps(proj(0, 0, 0), proj(theta, 0, 0))} stroke={C_CIRC} strokeWidth={3} opacity={0.5} />

      {/* cos 的梳齿与波形（地板） */}
      {teeth.cos.map(([a, b], i) => (
        <line key={`tc${i}`} {...lineProps(a, b)} stroke={C_COS} strokeWidth={1.5} opacity={0.55} />
      ))}
      <path d={ghostCos} fill="none" stroke={C_COS} strokeWidth={1} opacity={0.16} />
      <path d={liveCos} fill="none" stroke={C_COS} strokeWidth={1.8} />

      {/* sin 的梳齿与波形（后墙） */}
      {teeth.sin.map(([a, b], i) => (
        <line key={`ts${i}`} {...lineProps(a, b)} stroke={C_SIN} strokeWidth={1.5} opacity={0.55} />
      ))}
      <path d={ghostSin} fill="none" stroke={C_SIN} strokeWidth={1} opacity={0.16} />
      <path d={liveSin} fill="none" stroke={C_SIN} strokeWidth={1.8} />

      {/* 单位圆：两条直径分别是 cos 轴（靛青）和 sin 轴（绛红） */}
      <polygon points={polyline(sector)} fill={C_CIRC} fillOpacity={0.12} />
      <line {...lineProps(proj(X_CIRC, -1, 0), proj(X_CIRC, 1, 0))} stroke={C_COS} strokeWidth={1} opacity={0.6} />
      <line {...lineProps(proj(X_CIRC, 0, -1), proj(X_CIRC, 0, 1))} stroke={C_SIN} strokeWidth={1} opacity={0.6} />
      <path d={circle} fill="none" stroke={C_CIRC} strokeWidth={1.6} />
      <path d={pathOf(arc)} fill="none" stroke={C_CIRC} strokeWidth={3.4} strokeLinecap="round" />
      <line {...lineProps(proj(X_CIRC, 0, 0), pCirc)} stroke={C_CIRC} strokeWidth={1.6} />

      {/* 圆上那个点的两个坐标：竖直的一段是 sin，水平的一段是 cos */}
      <line {...lineProps(proj(X_CIRC, cy, 0), pCirc)} stroke={C_SIN} strokeWidth={2.2} />
      <line {...lineProps(proj(X_CIRC, 0, sy), pCirc)} stroke={C_COS} strokeWidth={2.2} />

      {/* 动点 → 两道影子的牵引线 */}
      <line {...lineProps(pCirc, pSin)} stroke={C_GUIDE} strokeWidth={0.9} strokeDasharray="3 3" />
      <line {...lineProps(pCirc, pCos)} stroke={C_GUIDE} strokeWidth={0.9} strokeDasharray="3 3" />

      <circle cx={pCirc[0]} cy={pCirc[1]} r={4.6} fill="#3a382f" />
      <circle cx={pSin[0]} cy={pSin[1]} r={4.2} fill={C_SIN} stroke="#faf7f0" strokeWidth={1.4} />
      <circle cx={pCos[0]} cy={pCos[1]} r={4.2} fill={C_COS} stroke="#faf7f0" strokeWidth={1.4} />

      <text x={VBW - 10} y={40} textAnchor="end" fontSize={16} fill={C_SIN} fontStyle="italic">sin(x)</text>
      <text x={VBW - 10} y={VBH - 12} textAnchor="end" fontSize={16} fill={C_COS} fontStyle="italic">cos(x)</text>
      <text {...textAt(proj(X_CIRC, 0.34, 0.34))} fontSize={13} fill={C_CIRC} fontStyle="italic">θ</text>
    </svg>
  )
}

// SVG <line> 的四个坐标属性写起来啰嗦，包一层。
function lineProps(a: P2, b: P2) {
  return { x1: a[0].toFixed(1), y1: a[1].toFixed(1), x2: b[0].toFixed(1), y2: b[1].toFixed(1) }
}
function textAt(p: P2) {
  return { x: p[0].toFixed(1), y: p[1].toFixed(1) }
}

/** 直角小方块：两条边在 corner 处成 90°，画个方角比写一行字管用。 */
function rightAngle(corner: P2, d1: P2, d2: P2, s = 9): string {
  const unit = (d: P2): P2 => {
    const L = Math.hypot(d[0], d[1]) || 1
    return [(d[0] / L) * s, (d[1] / L) * s]
  }
  const a = unit(d1)
  const b = unit(d2)
  return polyline([
    [corner[0] + a[0], corner[1] + a[1]],
    [corner[0] + a[0] + b[0], corner[1] + a[1] + b[1]],
    [corner[0] + b[0], corner[1] + b[1]],
  ])
}

/* ══════════════════════════════════════════════════════════
   面板二：三角形定义在哪儿断掉
   ══════════════════════════════════════════════════════════ */
function TriangleVsCircle({ deg }: { deg: number }) {
  const VB = 300
  const H = 260
  const C: P2 = [150, 130]
  const R = 88
  const t = deg / DEG
  const px = C[0] + Math.cos(t) * R
  const py = C[1] - Math.sin(t) * R
  const acute = deg > 0 && deg < 90
  const stroke = acute ? '#4a6b52' : C_GUIDE

  const arcPts: P2[] = []
  const n = Math.max(2, Math.round(Math.abs(deg) / 2))
  for (let i = 0; i <= n; i++) {
    const a = (t * i) / n
    arcPts.push([C[0] + Math.cos(a) * 26, C[1] - Math.sin(a) * 26])
  }

  return (
    <svg viewBox={`0 0 ${VB} ${H}`} role="img" aria-label="直角三角形定义与单位圆定义的对照">
      <line x1={C[0] - R - 24} y1={C[1]} x2={C[0] + R + 24} y2={C[1]} stroke={C_GRID} strokeWidth={1} />
      <line x1={C[0]} y1={C[1] - R - 24} x2={C[0]} y2={C[1] + R + 24} stroke={C_GRID} strokeWidth={1} />
      <circle cx={C[0]} cy={C[1]} r={R} fill="none" stroke={C_CIRC} strokeWidth={1.6} />

      {/* 直角三角形：三个顶点是原点、垂足、圆上的点 */}
      <polygon points={`${C[0]},${C[1]} ${px},${C[1]} ${px},${py}`}
        fill={acute ? 'rgba(74,107,82,0.10)' : 'rgba(0,0,0,0.03)'}
        stroke={stroke} strokeWidth={1.4} strokeDasharray={acute ? undefined : '4 3'} />

      <line x1={px} y1={C[1]} x2={px} y2={py} stroke={C_SIN} strokeWidth={2.4} />
      <line x1={C[0]} y1={C[1]} x2={px} y2={C[1]} stroke={C_COS} strokeWidth={2.4} />
      <line x1={C[0]} y1={C[1]} x2={px} y2={py} stroke={C_CIRC} strokeWidth={1.6} />
      {Math.abs(Math.cos(t)) > 0.16 && Math.abs(Math.sin(t)) > 0.16 && (
        <polyline points={rightAngle([px, C[1]], [C[0] - px, 0], [0, py - C[1]])}
          fill="none" stroke={stroke} strokeWidth={1} />
      )}
      <path d={pathOf(arcPts)} fill="none" stroke={C_CIRC} strokeWidth={1.6} />
      <circle cx={px} cy={py} r={5} fill="#3a382f" />

      <text x={12} y={22} fontSize={12.5} fill={acute ? '#4a6b52' : '#b5391f'} fontFamily="var(--font-mono)">
        {acute ? '三角形定义还活着' : '三角形定义已失效'}
      </text>
      <text x={12} y={H - 12} fontSize={12.5} fill="var(--ink-soft)" fontFamily="var(--font-mono)">
        θ = {deg.toFixed(0)}°　sin={fmt(Math.sin(t), 2)}　cos={fmt(Math.cos(t), 2)}
      </text>
    </svg>
  )
}

/* ══════════════════════════════════════════════════════════
   面板三：速度向量就是位置向量转 90°，所以 sin′ = cos
   ══════════════════════════════════════════════════════════ */
function VelocityPanel({ deg }: { deg: number }) {
  const VB = 300
  const H = 260
  const C: P2 = [150, 130]
  const R = 74
  const t = deg / DEG
  const c = Math.cos(t)
  const s = Math.sin(t)
  const px = C[0] + c * R
  const py = C[1] - s * R
  // 位置 (cos θ, sin θ) 求导 → (−sin θ, cos θ)：长度不变，方向恰好转了 90°。
  const vx = px + -s * R * 0.8
  const vy = py - c * R * 0.8

  return (
    <svg viewBox={`0 0 ${VB} ${H}`} role="img" aria-label="圆周运动的速度向量与位置向量垂直">
      <line x1={C[0] - R - 30} y1={C[1]} x2={C[0] + R + 30} y2={C[1]} stroke={C_GRID} strokeWidth={1} />
      <line x1={C[0]} y1={C[1] - R - 30} x2={C[0]} y2={C[1] + R + 30} stroke={C_GRID} strokeWidth={1} />
      <circle cx={C[0]} cy={C[1]} r={R} fill="none" stroke={C_CIRC} strokeWidth={1.6} />

      <line x1={C[0]} y1={C[1]} x2={px} y2={py} stroke={C_CIRC} strokeWidth={1.8} />
      <line x1={px} y1={py} x2={vx} y2={vy} stroke="#4a6b52" strokeWidth={2} />
      <polygon points={arrowHead([vx, vy], [vx - px, vy - py], 8)} fill="#4a6b52" />

      {/* 半径与速度处处垂直——这就是「转 90°」那句话的全部证据 */}
      <polyline points={rightAngle([px, py], [C[0] - px, C[1] - py], [vx - px, vy - py])}
        fill="none" stroke="#4a6b52" strokeWidth={1} />

      {/* 速度的竖直分量 = cos θ，它正是 sin 的变化率 */}
      <line x1={vx} y1={vy} x2={vx} y2={py} stroke={C_SIN} strokeWidth={2} strokeDasharray="3 2" />
      <text x={vx - 5} y={(vy + py) / 2} textAnchor="end" fontSize={12} fill={C_SIN} fontStyle="italic">cos θ</text>
      <circle cx={px} cy={py} r={5} fill="#3a382f" />

      <text x={12} y={22} fontSize={12.5} fill="#4a6b52" fontFamily="var(--font-mono)">
        速度 = 位置转 90°
      </text>
      <text x={12} y={H - 12} fontSize={12.5} fill="var(--ink-soft)" fontFamily="var(--font-mono)">
        速度竖直分量 = {fmt(c, 2)} = cos θ
      </text>
    </svg>
  )
}

/* ══════════════════════════════════════════════════════════ */
export function UnitCircle() {
  const [theta, setTheta] = useState(1.15)
  const [spin, setSpin] = useState(false)
  const [speed, setSpeed] = useState(5)
  const [deg, setDeg] = useState(52)

  useEffect(() => {
    if (!spin) return
    let raf = 0
    let last = performance.now()
    const tick = (now: number) => {
      const dt = Math.min(now - last, 80)
      last = now
      setTheta((v) => (v + (dt / 1000) * speed * 0.22) % TAU)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [spin, speed])

  const s = Math.sin(theta)
  const c = Math.cos(theta)

  // 弧度 vs 角度：同一个差商，横轴单位一换，答案就差 π/180 倍。
  const diffTable = useMemo(() => {
    const x = 1
    return [0.1, 0.01, 0.001].map((h) => ({
      h,
      rad: (Math.sin(x + h) - Math.sin(x)) / h,
      degv: (Math.sin((x * DEG + h) / DEG) - Math.sin(x)) / h,
    }))
  }, [])

  return (
    <AlgoShell
      slug="unit-circle"
      lede={
        <>
          <span className="k">sin</span> 和 <span className="k">cos</span> 不是三角形里的两个比值，是<strong>同一个点绕圈时的两个坐标</strong>。
          让单位圆立在左墙上转，把这个点的高度投到后墙、进深投到地板，两条波就自己长出来了——
          它们从不同步，因为一个量的是「多高」，另一个量的是「多远」。
        </>
      }
    >
      <div className="lab">
        <Box theta={theta} />

        <div className="controls">
          <button className="btn primary" onClick={() => setSpin((v) => !v)}>
            {spin ? '暂停' : '转起来'}
          </button>
          <div className="control" style={{ flex: '1 1 220px' }}>
            <label>转过的角 θ <b>{fmt(theta, 2)} rad = {(theta * DEG).toFixed(0)}°</b></label>
            <input
              type="range" min={0} max={TAU} step={TAU / 720} value={theta}
              onChange={(e) => { setSpin(false); setTheta(+e.target.value) }}
              aria-label="转过的角"
            />
          </div>
          <div className="control" style={{ minWidth: 120 }}>
            <label>转速 <b>{speed}×</b></label>
            <input type="range" min={1} max={20} step={1} value={speed}
              onChange={(e) => setSpeed(+e.target.value)} aria-label="转速" />
          </div>
        </div>

        <div className="legend">
          <span><i style={{ background: C_CIRC }} />单位圆 · 半径恒为 1</span>
          <span><i style={{ background: C_SIN }} />高度 sin θ → 后墙</span>
          <span><i style={{ background: C_COS }} />进深 cos θ → 地板</span>
          <span><i style={{ background: C_GUIDE }} />同一个点的两道影子</span>
        </div>

        <div className="readout">
          <div className="item"><span className="lbl">高度 sin θ</span><span className="val">{fmt(s, 3)}</span></div>
          <div className="item"><span className="lbl">进深 cos θ</span><span className="val">{fmt(c, 3)}</span></div>
          <div className="item"><span className="lbl">sin²+cos²</span><span className="val">{fmt(s * s + c * c, 3)}</span></div>
          <div className="item"><span className="lbl">圆上走过的弧长</span><span className="val">{fmt(theta, 3)}</span></div>
          <div className="item"><span className="lbl">横轴走过的距离</span><span className="val">{fmt(theta, 3)}</span></div>
        </div>
      </div>

      <h2>两道影子来自同一个点</h2>
      <p>
        盒子里只有<strong>一个</strong>在动的东西：圆上那个黑点。它绕着单位圆匀速转，位置随时可以用两个数说清——
        离地多高（竖直坐标），以及往前伸多远（进深坐标）。这两个数就叫 <span className="k">sin θ</span> 和 <span className="k">cos θ</span>，
        除此之外没有别的定义。后墙上那条绛红的波，是把「多高」按时间一格格记下来；地板上那条靛青的波，
        是把「多远」按时间一格格记下来。两条波长得一模一样却错开一截，因为它们抄的是同一个点的两个不同坐标。
      </p>
      <p>
        这也解释了一件初学时最别扭的事：为什么 <span className="k">cos</span> 看起来「比 sin 早了四分之一圈」。
        圆上的点转到最高处时，它的进深恰好是 0；转到最靠前时，它的高度恰好是 0。两个坐标轮流取到极值，
        中间永远隔着 90°。所谓相位差不是波的性质，是<strong>两根坐标轴互相垂直</strong>这件事的另一种说法。
      </p>

      <h2>横轴量的不是角度，是走过的路</h2>
      <p>
        看主面板里那两段被加粗的赭石色线：一段是圆上走过的弧，一段是横轴上走过的距离。它们的读数永远相等，
        因为<strong>横轴量的就是弧长</strong>。这就是弧度制的全部内容——不是「180 度等于 π」这条换算口诀，
        而是「转过的角，用它在单位圆上扫出的弧长来记」。半径是 1，所以角和弧长是同一个数；转满一圈扫过的弧长是圆周长 2π，
        于是一整个周期在横轴上也恰好占 2π。
      </p>

      <h2>三角形定义在 90° 就断了</h2>
      <p>
        课本先教的是 <span className="k">sin = 对边 / 斜边</span>。这个定义有个硬边界：三角形的内角必须小于 90°，
        边长又不能是负数，所以它连「钝角的正弦」都说不出口，更别提 −30° 或者 400°。
        拖下面的滑杆越过 90° 看看，三角形会塌掉，而圆上那个点毫无察觉地继续走。
      </p>

      <div className="lab">
        <div className="lab-panels">
          <div className="lab-panel">
            <h4>越过 90°，三角形就没了</h4>
            <TriangleVsCircle deg={deg} />
          </div>
          <div className="lab-panel">
            <h4>速度转 90° · 这就是 sin′ = cos</h4>
            <VelocityPanel deg={deg} />
          </div>
        </div>
        <div className="controls">
          <div className="control" style={{ flex: '1 1 260px' }}>
            <label>角度 θ <b>{deg.toFixed(0)}°</b></label>
            <input type="range" min={-90} max={450} step={1} value={deg}
              onChange={(e) => setDeg(+e.target.value)} aria-label="角度" />
          </div>
          <div style={{ fontSize: 13.5, color: 'var(--ink-soft)', maxWidth: '24em' }}>
            右图里绿箭头是圆上那点的速度方向。匀速转圈时速度永远垂直于半径——
            把位置向量 (cos θ, sin θ) 逆时针转 90°，就得到 (−sin θ, cos θ)。
          </div>
        </div>
      </div>

      <h2>sin² + cos² = 1 不用背</h2>
      <p>
        它就是圆的方程。点 (cos θ, sin θ) 在单位圆上，「在单位圆上」的意思正是「到圆心的距离等于 1」，
        写成勾股定理就是 <span className="k">cos²θ + sin²θ = 1</span>。所谓「最基本的三角恒等式」，
        不过是把「这个点没离开圆」这句话换了个写法。主面板上方那个读数一直钉在 1.000，就是这个原因。
      </p>

      <h2>为什么非用弧度：因为只有它能让 sin′ = cos</h2>
      <p>
        速度面板已经用几何说了一遍：位置转 90° 就是速度，所以 sin 的变化率是 cos。但这句话只在<strong>弧度</strong>下成立。
        换成角度，同一个点转一圈要走 360 格而不是 6.28 格，等于把时间轴拉长了 <span className="k">180/π</span> 倍，
        变化率自然被压扁同样的倍数。下面是在 x = 1 处当场算的差商，左列用弧度、右列把横轴换成角度：
      </p>
      <div className="matrix-box">
        {diffTable.map((r) => (
          <div key={r.h}>
            h={r.h.toFixed(3)}　弧度下 {fmt(r.rad, 5)}　角度下 {fmt(r.degv, 5)}
          </div>
        ))}
        <div style={{ marginTop: 6, color: 'var(--red-ink)' }}>
          cos(1) = {fmt(Math.cos(1), 5)}　π/180 × cos(1) = {fmt((Math.PI / 180) * Math.cos(1), 5)}
        </div>
      </div>
      <p>
        弧度那一列收敛到 cos(1)，角度那一列收敛到 cos(1) 的 π/180。
        所以弧度不是数学家偏爱的记法，是唯一能让求导公式干净的单位——用角度的话，
        每求一次导都要拖着一个 0.01745 的尾巴，链式法则一叠加就是灾难。
      </p>

      <h2>顺手纠三件事</h2>
      <ul>
        <li><strong>「sin 是对边比斜边」只在锐角成立。</strong>它是单位圆定义在 0°–90° 上的一个特例，不是定义本身。</li>
        <li><strong>正弦曲线不是「把圆周展开」。</strong>展开的不是圆周本身，是圆上一点的高度随时间的记录。圆周长 2π 和一个周期长 2π 恰好相等，是弧度制的定义使然，不是巧合。</li>
        <li><strong>sin 和 cos 不是两个函数。</strong>它们是同一个圆周运动的两个坐标，差一个 90° 的相位。写成复数 <span className="k">e^(iθ) = cos θ + i·sin θ</span> 时，两者干脆合并成了一个东西。</li>
      </ul>

      <Landing>
        交流电压就是一个转子在磁场里绕圈时的投影，所以它天生是正弦而不是别的形状。傅里叶变换把任何信号拆成一堆不同转速的圆周运动之和，
        音频、图像压缩都靠它。大模型里的旋转位置编码（RoPE）把词的位置编成一次实实在在的旋转，用的正是 (cos, sin) 这一对坐标——
        位置差多少，两个向量之间就差多少角度。
      </Landing>
    </AlgoShell>
  )
}
