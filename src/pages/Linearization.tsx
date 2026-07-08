import { useRef, useState } from 'react'
import { AlgoShell, Landing } from '../components/AlgoShell'

/* ────────────────────────────────────────────────────────────
   局部线性化 · 凑够近，弯的都是直的
   核心直觉：f(x₀+δ) ≈ f(x₀) + f′(x₀)·δ。这不是巧合，是「导数是
   什么」那页切线概念的直接推论。误差不是随便消失的：它按
   ½|f″(x₀)|·δ² 缩小——δ 减半，误差差不多缩到四分之一。这条
   「误差是二阶小量」的规律，正是雅可比局部线性化能成立的原因。
   ──────────────────────────────────────────────────────────── */

type Vec = [number, number]
type FuncDef = {
  key: string
  name: string
  f: (x: number) => number
  xMin: number
  xMax: number
  yMin: number
  yMax: number
  deltaMax: number
  note: string
}

const FUNCS: FuncDef[] = [
  {
    key: 'parabola',
    name: '抛物线 x²',
    f: (x) => x * x,
    xMin: -2,
    xMax: 2,
    yMin: -0.3,
    yMax: 4.3,
    deltaMax: 1.2,
    note: 'f″(x)=2 恒定，误差曲线是条标准抛物线，参考线几乎完美贴合。',
  },
  {
    key: 'cubic',
    name: '立方 x³',
    f: (x) => x ** 3,
    xMin: -1.7,
    xMax: 1.7,
    yMin: -5,
    yMax: 5,
    deltaMax: 1,
    note: 'f″(x)=6x 随位置变化，参考线只在 δ 小的时候贴得紧——δ 一大，三阶项就冒头了。',
  },
  {
    key: 'exp',
    name: '指数 eˣ',
    f: (x) => Math.exp(x),
    xMin: -1.5,
    xMax: 1.8,
    yMin: -0.3,
    yMax: 6.2,
    deltaMax: 0.9,
    note: 'eˣ 自己就是自己的各阶导数，f″(x₀)=eˣ⁰——越往右，弯曲得越猛，线性近似失效得也越快。',
  },
]

function deriv1(f: (x: number) => number, x: number) {
  const h = 1e-3
  return (f(x + h) - f(x - h)) / (2 * h)
}
function deriv2(f: (x: number) => number, x: number) {
  const h = 1e-3
  return (f(x + h) - 2 * f(x) + f(x - h)) / (h * h)
}

const VBW = 340
const VBH = 230
const PAD = 24

function makeToPx(xMin: number, xMax: number, yMin: number, yMax: number) {
  return (x: number, y: number): Vec => {
    const px = PAD + ((x - xMin) / (xMax - xMin)) * (VBW - 2 * PAD)
    const py = VBH - PAD - ((y - yMin) / (yMax - yMin)) * (VBH - 2 * PAD)
    return [px, py]
  }
}

function curvePath(xMin: number, xMax: number, toPx: (x: number, y: number) => Vec, fn: (x: number) => number, n = 130) {
  let path = ''
  for (let i = 0; i <= n; i++) {
    const x = xMin + ((xMax - xMin) * i) / n
    const [px, py] = toPx(x, fn(x))
    path += (i === 0 ? 'M' : 'L') + px.toFixed(1) + ' ' + py.toFixed(1)
  }
  return path
}

export function Linearization() {
  const [key, setKey] = useState('parabola')
  const d = FUNCS.find((f) => f.key === key)!
  const safeMax = d.xMax - d.deltaMax
  const [x0, setX0] = useState(() => d.xMin + (safeMax - d.xMin) * 0.4)
  const [delta, setDelta] = useState(() => d.deltaMax * 0.7)
  const svgRef = useRef<SVGSVGElement>(null)

  const cx0 = Math.max(d.xMin, Math.min(safeMax, x0))
  const cd = Math.max(0.02, Math.min(d.deltaMax, delta))

  const toPx = makeToPx(d.xMin, d.xMax, d.yMin, d.yMax)
  const fx0 = d.f(cx0)
  const slope = deriv1(d.f, cx0)
  const curv = deriv2(d.f, cx0)

  const actual = d.f(cx0 + cd)
  const approx = fx0 + slope * cd
  const err = Math.abs(actual - approx)
  const refC = 0.5 * Math.abs(curv)

  function pointerToX(e: React.PointerEvent) {
    const svg = svgRef.current
    if (!svg) return
    const ctm = svg.getScreenCTM()
    if (!ctm) return
    const inv = ctm.inverse()
    const pt = new DOMPointReadOnly(e.clientX, e.clientY).matrixTransform(inv)
    const x = d.xMin + ((pt.x - PAD) / (VBW - 2 * PAD)) * (d.xMax - d.xMin)
    setX0(Math.max(d.xMin, Math.min(safeMax, x)))
  }

  const curveD = curvePath(d.xMin, d.xMax, toPx, d.f)
  const tanSpan = (d.xMax - d.xMin) * 0.35
  const [tx1, ty1] = toPx(cx0 - tanSpan, fx0 - slope * tanSpan)
  const [tx2, ty2] = toPx(cx0 + tanSpan, fx0 + slope * tanSpan)
  const [p0x, p0y] = toPx(cx0, fx0)
  const [actX, actY] = toPx(cx0 + cd, actual)
  const [appX, appY] = toPx(cx0 + cd, approx)

  // 误差面板：δ∈[0, deltaMax] 扫一遍，误差曲线 vs ½|f″(x₀)|·δ² 参考线
  const errAt = (dd: number) => Math.abs(d.f(cx0 + dd) - (fx0 + slope * dd))
  let errYMax = 0
  const N = 60
  for (let i = 0; i <= N; i++) {
    const dd = (d.deltaMax * i) / N
    errYMax = Math.max(errYMax, errAt(dd), refC * dd * dd)
  }
  errYMax = errYMax * 1.15 || 1
  const toPxE = makeToPx(0, d.deltaMax, 0, errYMax)
  const errPath = curvePath(0, d.deltaMax, toPxE, errAt)
  const refPath = curvePath(0, d.deltaMax, toPxE, (dd) => refC * dd * dd)
  const [ePx, ePy] = toPxE(cd, errAt(cd))

  const fmt = (v: number) => (Math.abs(v) < 0.005 ? '0.00' : v.toFixed(3))

  return (
    <AlgoShell
      slug="linearization"
      lede={
        <>
          切线是「离 x₀ 够近时」对曲线的最佳直线替身：<span className="k">f(x₀+δ) ≈ f(x₀) + f′(x₀)·δ</span>。
          这个近似不是白给的，它有误差——拖动 δ，看误差怎么随 δ² 收缩，而不是随 δ 本身线性收缩。
        </>
      }
    >
      <div className="lab">
        <div className="controls" style={{ marginTop: 0, marginBottom: 18, borderTop: 'none', paddingTop: 0 }}>
          <div className="seg" role="tablist" aria-label="选择函数">
            {FUNCS.map((f) => (
              <button
                key={f.key}
                className={f.key === key ? 'on' : ''}
                onClick={() => { setKey(f.key); setDelta(f.deltaMax * 0.7) }}
              >
                {f.name}
              </button>
            ))}
          </div>
        </div>

        <div className="lab-panels">
          <div className="lab-panel">
            <h4>f(x) · 拖红点选 x₀，拖 δ 看误差</h4>
            <svg
              ref={svgRef}
              viewBox={`0 0 ${VBW} ${VBH}`}
              onPointerDown={(ev) => { (ev.target as Element).setPointerCapture?.(ev.pointerId); pointerToX(ev) }}
              onPointerMove={(ev) => { if (ev.buttons) pointerToX(ev) }}
              role="img"
              aria-label="函数曲线，可拖动 x₀"
            >
              <path d={curveD} fill="none" stroke="#8a8470" strokeWidth={1.8} />
              <line x1={tx1} y1={ty1} x2={tx2} y2={ty2} stroke="#d6452c" strokeWidth={1.6} strokeDasharray="5 3" />
              <line x1={actX} y1={actY} x2={appX} y2={appY} stroke="#b5391f" strokeWidth={1.2} strokeDasharray="2 2" />
              <circle cx={p0x} cy={p0y} r={5.5} fill="#d6452c" stroke="#faf7f0" strokeWidth={2} />
              <circle cx={actX} cy={actY} r={5} fill="#4a6b52" stroke="#faf7f0" strokeWidth={1.8} />
              <circle cx={appX} cy={appY} r={5} fill="#d6452c" stroke="#faf7f0" strokeWidth={1.8} />
            </svg>
          </div>

          <div className="lab-panel">
            <h4>误差 · 随 δ² 收缩</h4>
            <svg viewBox={`0 0 ${VBW} ${VBH}`} role="img" aria-label="误差随 δ 变化曲线，附二次参考线">
              <path d={refPath} fill="none" stroke="#d6452c" strokeWidth={1.6} strokeDasharray="4 3" />
              <path d={errPath} fill="none" stroke="#4a6b52" strokeWidth={1.8} />
              <circle cx={ePx} cy={ePy} r={5.5} fill="#4a6b52" stroke="#faf7f0" strokeWidth={2} />
            </svg>
          </div>
        </div>

        <div className="controls">
          <div className="control">
            <label>扰动 δ <b>{cd.toFixed(2)}</b></label>
            <input type="range" min={0.02} max={d.deltaMax} step={d.deltaMax / 100} value={cd}
              onChange={(ev) => setDelta(+ev.target.value)} />
          </div>
          <div style={{ fontSize: 13.5, color: 'var(--ink-soft)', maxWidth: '22em' }}>
            <span style={{ color: '#4a6b52', fontWeight: 600 }}>绿</span>=真值 f(x₀+δ) ·{' '}
            <span style={{ color: '#b5391f', fontWeight: 600 }}>红</span>=线性近似 f(x₀)+f′(x₀)δ。
            右图绿线=实测误差，红虚线=½|f″(x₀)|δ² 参考——δ 越小两条线贴得越紧。
          </div>
        </div>

        <div className="readout">
          <div className="item">
            <span className="lbl">x₀</span>
            <span className="val">{fmt(cx0)}</span>
          </div>
          <div className="item">
            <span className="lbl">真值 f(x₀+δ)</span>
            <span className="val">{fmt(actual)}</span>
          </div>
          <div className="item">
            <span className="lbl">线性近似</span>
            <span className="val">{fmt(approx)}</span>
          </div>
          <div className="item">
            <span className="lbl">误差</span>
            <span className="val">{fmt(err)}</span>
          </div>
        </div>
      </div>

      <p style={{ color: 'var(--ink-soft)', fontSize: 15 }}>{d.note}</p>

      <h2>误差是「二阶」小量</h2>
      <p>
        泰勒展开把这件事说得更精确：<span className="k">f(x₀+δ) = f(x₀) + f′(x₀)·δ + ½f″(x₀)·δ² + …</span>。
        线性近似只留了前两项，扔掉的第一块就是 <span className="k">½f″(x₀)·δ²</span>——这正是右图红色虚线画的东西。
        δ 减半，δ² 就变成四分之一：误差缩小的速度比 δ 本身快得多，这就是为什么「凑够近」这件事这么好使。
      </p>
      <p>
        <strong>这条规律不挑维度。</strong>把标量 x 换成向量、把 f′(x₀) 换成雅可比矩阵 J，
        <span className="k">f(p+v) ≈ f(p) + J·v</span> 就是雅可比矩阵那页的核心公式——同一件事，
        只是从一根数轴搬到了整个空间。
      </p>

      <Landing>
        梯度下降每一步都在赌「学习率足够小，线性近似基本可信」；优化器里的信赖域方法，
        本质就是在动态调整这个「够近」的范围。数值积分、物理引擎的每一步演化，
        也都是拿局部线性近似去追一条本质上弯曲的轨迹。
      </Landing>
    </AlgoShell>
  )
}
