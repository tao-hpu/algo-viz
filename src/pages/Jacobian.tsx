import { useRef, useState } from 'react'
import { AlgoShell, Landing } from '../components/AlgoShell'

/* ────────────────────────────────────────────────────────────
   雅可比矩阵 · 纯几何视角
   核心直觉：一个弯曲的映射 f，在某一点 p 附近凑近看，
   就是一个线性变换（矩阵 J）。把 p 周围一小块方块喂进去，
   真·像 会弯；而 J 把它变成一个平行四边形——两者在 p 越
   小越贴合。这条「弯的东西局部是直的」就是雅可比的全部。
   ──────────────────────────────────────────────────────────── */

type Vec = [number, number]
type MapDef = {
  key: string
  name: string
  f: (x: number, y: number) => Vec
  R: number   // 输入向量能拖到的范围（输入网格也画到这里）
  Rc: number  // 两个面板共用的显示半径（≥R）：同一把尺，面积才可比
  note: string
}

const MAPS: MapDef[] = [
  {
    key: 'sq',
    name: 'z² 复平方',
    f: (x, y) => [x * x - y * y, 2 * x * y],
    R: 1.2,
    Rc: 2.2,
    note: '把复数平方：每点的 J 都是纯「旋转+缩放」（保角映射），离原点越远拉伸越猛，det = 4|p|²。',
  },
  {
    key: 'wave',
    name: '波浪',
    f: (x, y) => [x, y + 0.55 * Math.sin(Math.PI * x)],
    R: 1.5,
    Rc: 2.0,
    note: '竖直方向按位置起伏。形状被拧歪，但 det≡1——绿像和红方块面积一样大，肉眼可查。',
  },
  {
    key: 'swirl',
    name: '旋涡',
    f: (x, y) => {
      const t = 1.1 * Math.hypot(x, y)
      return [x * Math.cos(t) - y * Math.sin(t), x * Math.sin(t) + y * Math.cos(t)]
    },
    R: 1.5,
    Rc: 1.7,
    note: '离原点越远转得越多。J 除了旋转还夹带剪切：方块不只是被转，还被拧歪（看 readout，J 并不是旋转矩阵的形状）。',
  },
]

// 数值雅可比（中心差分）：对任意 f 都成立，不用手推公式。
function jacobian(m: MapDef, x: number, y: number) {
  const h = 1e-3
  const [fpx1, fpx2] = m.f(x + h, y)
  const [fmx1, fmx2] = m.f(x - h, y)
  const [fpy1, fpy2] = m.f(x, y + h)
  const [fmy1, fmy2] = m.f(x, y - h)
  const Jxx = (fpx1 - fmx1) / (2 * h) // ∂f1/∂x
  const Jyx = (fpx2 - fmx2) / (2 * h) // ∂f2/∂x
  const Jxy = (fpy1 - fmy1) / (2 * h) // ∂f1/∂y
  const Jyy = (fpy2 - fmy2) / (2 * h) // ∂f2/∂y
  const det = Jxx * Jyy - Jxy * Jyx
  return { Jxx, Jxy, Jyx, Jyy, det }
}

const VB = 320
const C = 160
const S = 128 // 半幅像素

// 把「上-右为正」的数学坐标画成 SVG 像素（y 翻转）。
const toPx = (x: number, y: number, R: number): Vec => [C + (x / R) * S, C - (y / R) * S]

function gridLines(R: number, step = 0.4) {
  const ticks: number[] = []
  for (let v = -Math.ceil(R / step) * step; v <= R + 1e-9; v += step) ticks.push(+v.toFixed(4))
  return ticks
}

// 采样一条参数曲线（t: a→b）并映射，返回 SVG 折线点串。
function samplePath(m: MapDef, pt: (t: number) => Vec, n: number): string {
  let d = ''
  for (let i = 0; i <= n; i++) {
    const [x, y] = pt(i / n)
    const [fx, fy] = m.f(x, y)
    const [px, py] = toPx(fx, fy, m.Rc)
    d += (i === 0 ? 'M' : 'L') + px.toFixed(1) + ' ' + py.toFixed(1)
  }
  return d
}

export function Jacobian() {
  const [mapKey, setMapKey] = useState('sq')
  const [p, setP] = useState<Vec>([0.7, 0.35])
  const [eps, setEps] = useState(0.28)
  const svgRef = useRef<SVGSVGElement>(null)
  const m = MAPS.find((mm) => mm.key === mapKey)!
  const [px, py] = p

  const J = jacobian(m, px, py)
  const [fpx, fpy] = m.f(px, py)

  // 指针 → 数学坐标（用 getScreenCTM 逆变换，兼容缩放/移动端）
  function pointerToMath(e: React.PointerEvent) {
    const svg = svgRef.current
    if (!svg) return
    const ctm = svg.getScreenCTM()
    if (!ctm) return
    const inv = ctm.inverse()
    const pt = new DOMPointReadOnly(e.clientX, e.clientY).matrixTransform(inv)
    // 换算按共用显示半径 Rc（两图同一把尺），拖动范围仍夹在输入域 R 内。
    let x = ((pt.x - C) / S) * m.Rc
    let y = (-(pt.y - C) / S) * m.Rc
    x = Math.max(-m.R, Math.min(m.R, x))
    y = Math.max(-m.R, Math.min(m.R, y))
    setP([+x.toFixed(3), +y.toFixed(3)])
  }

  const vLines = gridLines(m.R)
  const e = eps

  // 方块四角（数学坐标）
  const corners: Vec[] = [
    [px - e, py - e], [px + e, py - e], [px + e, py + e], [px - e, py + e],
  ]
  // 雅可比平行四边形：p' + J·(角 − p)
  const paraPts = corners.map(([cx, cy]) => {
    const dx = cx - px, dy = cy - py
    const jx = J.Jxx * dx + J.Jxy * dy
    const jy = J.Jyx * dx + J.Jyy * dy
    return toPx(fpx + jx, fpy + jy, m.Rc)
  })
  const paraD = 'M' + paraPts.map(([a, b]) => `${a.toFixed(1)} ${b.toFixed(1)}`).join('L') + 'Z'

  // 方块真·像：沿方块边界密采样后映射（会弯）
  const edge = (t: number): Vec => {
    const s = t * 4, side = Math.floor(s) % 4, u = s - Math.floor(s)
    if (side === 0) return [px - e + 2 * e * u, py - e]
    if (side === 1) return [px + e, py - e + 2 * e * u]
    if (side === 2) return [px + e - 2 * e * u, py + e]
    return [px - e, py + e - 2 * e * u]
  }
  const trueImgD = samplePath(m, edge, 96) + 'Z'

  const [ppx, ppy] = toPx(px, py, m.Rc)
  const [fppx, fppy] = toPx(fpx, fpy, m.Rc)
  const sqPx = corners.map(([cx, cy]) => toPx(cx, cy, m.Rc))
  const sqD = 'M' + sqPx.map(([a, b]) => `${a.toFixed(1)} ${b.toFixed(1)}`).join('L') + 'Z'

  const fmt = (v: number) => (Math.abs(v) < 0.005 ? '0.00' : v.toFixed(2))

  return (
    <AlgoShell
      slug="jacobian"
      lede={
        <>
          一个非线性映射把整个平面揉成弯的。但只要凑得够近看某一点，弯就消失了，
          它在那一点附近<strong>就是一个矩阵</strong>。这个矩阵是雅可比 <span className="k">J</span>。
          拖动红点选位置，缩小方块，看真·像怎么和 <span className="k">J</span> 画出的平行四边形贴到一起。
        </>
      }
    >
      <div className="lab">
        <div className="controls" style={{ marginTop: 0, marginBottom: 18, borderTop: 'none', paddingTop: 0 }}>
          <div className="seg" role="tablist" aria-label="选择映射">
            {MAPS.map((mm) => (
              <button key={mm.key} className={mm.key === mapKey ? 'on' : ''} onClick={() => setMapKey(mm.key)}>
                {mm.name}
              </button>
            ))}
          </div>
        </div>

        <div className="lab-panels">
          {/* 输入平面 */}
          <div className="lab-panel">
            <h4>输入平面 · 拖动红点</h4>
            <svg
              ref={svgRef}
              viewBox={`0 0 ${VB} ${VB}`}
              onPointerDown={(ev) => { (ev.target as Element).setPointerCapture?.(ev.pointerId); pointerToMath(ev) }}
              onPointerMove={(ev) => { if (ev.buttons) pointerToMath(ev) }}
              role="img"
              aria-label="输入平面，可拖动采样点"
            >
              {vLines.map((v) => {
                const [x1, y1] = toPx(v, -m.R, m.Rc)
                const [x2, y2] = toPx(v, m.R, m.Rc)
                const [x3, y3] = toPx(-m.R, v, m.Rc)
                const [x4, y4] = toPx(m.R, v, m.Rc)
                return (
                  <g key={v} stroke="#d9d2c4" strokeWidth={v === 0 ? 1.4 : 0.7}>
                    <line x1={x1} y1={y1} x2={x2} y2={y2} />
                    <line x1={x3} y1={y3} x2={x4} y2={y4} />
                  </g>
                )
              })}
              <path d={sqD} fill="rgba(214,69,44,0.12)" stroke="#d6452c" strokeWidth={1.6} />
              <circle cx={ppx} cy={ppy} r={6} fill="#d6452c" stroke="#faf7f0" strokeWidth={2} />
            </svg>
          </div>

          {/* 输出平面 */}
          <div className="lab-panel">
            <h4>输出平面 · f 把它揉弯了</h4>
            <svg viewBox={`0 0 ${VB} ${VB}`} role="img" aria-label="输出平面，显示映射后的网格与像">
              {/* 弯掉的网格 */}
              {vLines.map((v) => (
                <g key={'w' + v} fill="none" stroke="#ddd6c8" strokeWidth={v === 0 ? 1.2 : 0.6}>
                  <path d={samplePath(m, (t) => [v, -m.R + 2 * m.R * t], 48)} />
                  <path d={samplePath(m, (t) => [-m.R + 2 * m.R * t, v], 48)} />
                </g>
              ))}
              {/* 真·像（弯） */}
              <path d={trueImgD} fill="rgba(74,107,82,0.14)" stroke="#4a6b52" strokeWidth={1.4} />
              {/* 雅可比平行四边形（直，线性近似） */}
              <path d={paraD} fill="none" stroke="#d6452c" strokeWidth={1.8} strokeDasharray="5 3" />
              <circle cx={fppx} cy={fppy} r={5.5} fill="#d6452c" stroke="#faf7f0" strokeWidth={2} />
            </svg>
          </div>
        </div>

        <div className="controls">
          <div className="control">
            <label>方块半径 ε <b>{eps.toFixed(2)}</b></label>
            <input type="range" min={0.04} max={0.7} step={0.01} value={eps}
              onChange={(ev) => setEps(+ev.target.value)} />
          </div>
          <div style={{ fontSize: 13.5, color: 'var(--ink-soft)', maxWidth: '22em' }}>
            <span style={{ color: '#4a6b52', fontWeight: 600 }}>绿</span>=真·像（会弯）·{' '}
            <span style={{ color: '#b5391f', fontWeight: 600 }}>红虚线</span>=J 的线性近似。
            把 ε 拖小，两者贴合；拖大，差距就是「曲率」。两图同一把尺，面积能直接比。
          </div>
        </div>

        <div className="readout">
          <div className="item">
            <span className="lbl">这一点的雅可比 J</span>
            <span className="matrix-box">
              [ {fmt(J.Jxx)}&nbsp;&nbsp;{fmt(J.Jxy)} ]<br />
              [ {fmt(J.Jyx)}&nbsp;&nbsp;{fmt(J.Jyy)} ]
            </span>
          </div>
          <div className="item" style={{ justifyContent: 'center' }}>
            <span className="lbl">det J（局部面积放大率）</span>
            <span className="val">{fmt(J.det)}×</span>
          </div>
          <div className="item" style={{ justifyContent: 'center' }}>
            <span className="lbl">采样点 p</span>
            <span className="val">({fmt(px)}, {fmt(py)})</span>
          </div>
        </div>
      </div>

      <p style={{ color: 'var(--ink-soft)', fontSize: 15 }}>{m.note}</p>

      <h2>为什么「局部是直的」</h2>
      <p>
        任何光滑映射 <span className="k">f</span> 在点 <span className="k">p</span> 附近都能写成
        <span className="k">f(p+v) ≈ f(p) + J·v</span>：常数项把方块搬到新位置，
        线性项 <span className="k">J·v</span> 负责所有的旋转、拉伸、剪切。ε 越小，被忽略的高阶项
        （曲率）越不值一提，所以红虚线的平行四边形越贴近绿色真·像。这正是导数在多维的样子：
        标量导数是「一条切线的斜率」，雅可比是「一整块空间的最佳线性替身」。
      </p>
      <p>
        <span className="k">det J</span> 是这块替身把面积放大的倍数：波浪那张 det≡1（面积不变，只是拧歪），
        z² 离原点越远 det 越大（拉伸越猛）。det 变号就意味着这一点附近发生了翻面。
      </p>

      <Landing>
        神经网络反向传播，每一层的梯度就是拿这层的雅可比（转置）去乘上游梯度——
        <span className="k">grad_in = Jᵀ · grad_out</span>。变量替换的积分里那个
        <span className="k">|det J|</span> 就是这里的面积放大率。归一化流（normalizing flow）
        整个模型的可行性，也压在「det J 算得快」这件事上。同一个矩阵，换个场景反复出现。
      </Landing>
    </AlgoShell>
  )
}
