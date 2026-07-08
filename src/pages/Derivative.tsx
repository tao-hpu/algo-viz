import { useRef, useState } from 'react'
import { AlgoShell, Landing } from '../components/AlgoShell'

/* ────────────────────────────────────────────────────────────
   导数是什么 · 位置 vs 速度
   核心直觉：f(x) 回答「这一点有多高」，f'(x) 回答「这一点附近
   爬得有多陡」——两件独立的事。割线量的是两点之间的平均陡度，
   把两点的间距 h 拖到趋近 0，割线就收敛成切线，切线的斜率就是
   导数。这条「割线的极限是切线」就是导数的全部。
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
  note: string
}

const FUNCS: FuncDef[] = [
  {
    key: 'parabola',
    name: '抛物线 x²',
    f: (x) => x * x,
    xMin: -2.1,
    xMax: 2.1,
    yMin: -0.5,
    yMax: 4.5,
    note: '越往两边爬得越猛：这条曲线的陡度和位置成正比，导数本身画出来是条直线。',
  },
  {
    key: 'cubic',
    name: '波浪 x³/3 − x',
    f: (x) => x ** 3 / 3 - x,
    xMin: -2.1,
    xMax: 2.1,
    yMin: -1.6,
    yMax: 1.6,
    note: '中间那一段在往下走，陡度是负的。两个「平顶」处陡度恰好归零——那正是极值点。',
  },
  {
    key: 'sine',
    name: '正弦 sin(x)',
    f: (x) => Math.sin(x),
    xMin: -Math.PI,
    xMax: Math.PI,
    yMin: -1.3,
    yMax: 1.3,
    note: '爬得最快的地方，恰好是曲线穿过 0 的地方——陡度曲线其实就是位置曲线「错开一步」的样子。',
  },
]

// 数值导数（中心差分）：对任意 f 都成立，不用手推公式。
function deriv(f: (x: number) => number, x: number) {
  const h = 1e-3
  return (f(x + h) - f(x - h)) / (2 * h)
}

const VBW = 360
const VBH = 230
const PAD = 22

function makeToPx(d: { xMin: number; xMax: number; yMin: number; yMax: number }) {
  return (x: number, y: number): Vec => {
    const px = PAD + ((x - d.xMin) / (d.xMax - d.xMin)) * (VBW - 2 * PAD)
    const py = VBH - PAD - ((y - d.yMin) / (d.yMax - d.yMin)) * (VBH - 2 * PAD)
    return [px, py]
  }
}

function curvePath(
  d: { xMin: number; xMax: number; yMin: number; yMax: number },
  toPx: (x: number, y: number) => Vec,
  fn: (x: number) => number,
  n = 120,
) {
  let path = ''
  for (let i = 0; i <= n; i++) {
    const x = d.xMin + ((d.xMax - d.xMin) * i) / n
    const y = Math.max(d.yMin, Math.min(d.yMax, fn(x)))
    const [px, py] = toPx(x, y)
    path += (i === 0 ? 'M' : 'L') + px.toFixed(1) + ' ' + py.toFixed(1)
  }
  return path
}

export function Derivative() {
  const [key, setKey] = useState('parabola')
  const d = FUNCS.find((f) => f.key === key)!
  const domainW = d.xMax - d.xMin
  const [x0, setX0] = useState(() => d.xMin + domainW * 0.66)
  const [h, setH] = useState(() => domainW * 0.16)
  const svgRef = useRef<SVGSVGElement>(null)

  // 换函数时旧的 x0/h 可能落在新定义域外，渲染时就地夹紧，不额外开 effect。
  const cx0 = Math.max(d.xMin + 0.02 * domainW, Math.min(d.xMax - 0.02 * domainW, x0))
  const hMin = 0.03 * domainW
  const hMax = 0.5 * domainW
  const ch = Math.max(hMin, Math.min(hMax, h))

  const toPx = makeToPx(d)
  const fx0 = d.f(cx0)
  const slopeExact = deriv(d.f, cx0)
  const xh = Math.min(d.xMax, cx0 + ch)
  const fxh = d.f(xh)
  const slopeSecant = (fxh - fx0) / (xh - cx0)

  function pointerToX(e: React.PointerEvent) {
    const svg = svgRef.current
    if (!svg) return
    const ctm = svg.getScreenCTM()
    if (!ctm) return
    const inv = ctm.inverse()
    const pt = new DOMPointReadOnly(e.clientX, e.clientY).matrixTransform(inv)
    const x = d.xMin + ((pt.x - PAD) / (VBW - 2 * PAD)) * domainW
    setX0(Math.max(d.xMin, Math.min(d.xMax, x)))
  }

  const curveD = curvePath(d, toPx, d.f)
  const [px0, py0] = toPx(cx0, fx0)
  const tanSpan = domainW * 0.4
  const [tx1, ty1] = toPx(cx0 - tanSpan, fx0 - slopeExact * tanSpan)
  const [tx2, ty2] = toPx(cx0 + tanSpan, fx0 + slopeExact * tanSpan)
  const [sx1, sy1] = toPx(cx0, fx0)
  const [sx2, sy2] = toPx(xh, fxh)
  const showZeroX = d.xMin <= 0 && d.xMax >= 0
  const showZeroY = d.yMin <= 0 && d.yMax >= 0
  const [zx] = toPx(0, 0)
  const [, zy] = toPx(0, 0)

  // 陡度曲线：对同一批 x 逐点求数值导数，自动量出上下界。
  const derivSamples = (() => {
    const n = 80
    const vals: number[] = []
    let ymin = Infinity
    let ymax = -Infinity
    for (let i = 0; i <= n; i++) {
      const x = d.xMin + (domainW * i) / n
      const v = deriv(d.f, x)
      vals.push(v)
      if (v < ymin) ymin = v
      if (v > ymax) ymax = v
    }
    const pad = (ymax - ymin) * 0.18 || 1
    return { yMin: ymin - pad, yMax: ymax + pad }
  })()
  const dB = { xMin: d.xMin, xMax: d.xMax, yMin: derivSamples.yMin, yMax: derivSamples.yMax }
  const toPxB = makeToPx(dB)
  const derivPath = curvePath(dB, toPxB, (x) => deriv(d.f, x))
  const [bpx, bpy] = toPxB(cx0, slopeExact)
  const showZeroYB = dB.yMin <= 0 && dB.yMax >= 0
  const [, bzy] = toPxB(0, 0)

  const fmt = (v: number) => (Math.abs(v) < 0.005 ? '0.00' : v.toFixed(2))

  return (
    <AlgoShell
      slug="derivative"
      lede={
        <>
          <span className="k">f(x)</span> 告诉你「这一点有多高」，<span className="k">f′(x)</span> 告诉你「这一点附近爬得有多陡」——
          两件事互不相干：最高（或最低）的地方旁边，陡度反而恰好是 0。
          拖动红点挪位置，拖割线间距 <span className="k">h</span>，看割线怎么收敛成切线。
        </>
      }
    >
      <div className="lab">
        <div className="controls" style={{ marginTop: 0, marginBottom: 18, borderTop: 'none', paddingTop: 0 }}>
          <div className="seg" role="tablist" aria-label="选择函数">
            {FUNCS.map((f) => (
              <button key={f.key} className={f.key === key ? 'on' : ''} onClick={() => setKey(f.key)}>
                {f.name}
              </button>
            ))}
          </div>
        </div>

        <div className="lab-panels">
          <div className="lab-panel">
            <h4>f(x) · 拖动红点选位置</h4>
            <svg
              ref={svgRef}
              viewBox={`0 0 ${VBW} ${VBH}`}
              onPointerDown={(ev) => { (ev.target as Element).setPointerCapture?.(ev.pointerId); pointerToX(ev) }}
              onPointerMove={(ev) => { if (ev.buttons) pointerToX(ev) }}
              role="img"
              aria-label="函数曲线，可拖动采样点"
            >
              {showZeroX && <line x1={zx} y1={PAD} x2={zx} y2={VBH - PAD} stroke="#d9d2c4" strokeWidth={1} />}
              {showZeroY && <line x1={PAD} y1={zy} x2={VBW - PAD} y2={zy} stroke="#d9d2c4" strokeWidth={1} />}
              <path d={curveD} fill="none" stroke="#8a8470" strokeWidth={1.8} />
              <line x1={sx1} y1={sy1} x2={sx2} y2={sy2} stroke="#4a6b52" strokeWidth={1.6} strokeDasharray="4 3" />
              <line x1={tx1} y1={ty1} x2={tx2} y2={ty2} stroke="#d6452c" strokeWidth={1.8} />
              <circle cx={sx2} cy={sy2} r={3.5} fill="#4a6b52" />
              <circle cx={px0} cy={py0} r={6} fill="#d6452c" stroke="#faf7f0" strokeWidth={2} />
            </svg>
          </div>

          <div className="lab-panel">
            <h4>f′(x) · 陡度曲线</h4>
            <svg viewBox={`0 0 ${VBW} ${VBH}`} role="img" aria-label="导数曲线，随 x 同步移动">
              {showZeroX && <line x1={zx} y1={PAD} x2={zx} y2={VBH - PAD} stroke="#d9d2c4" strokeWidth={1} />}
              {showZeroYB && <line x1={PAD} y1={bzy} x2={VBW - PAD} y2={bzy} stroke="#d9d2c4" strokeWidth={1} />}
              <path d={derivPath} fill="none" stroke="#8a8470" strokeWidth={1.8} />
              <line x1={bpx} y1={PAD} x2={bpx} y2={VBH - PAD} stroke="#d6452c" strokeWidth={1} strokeDasharray="3 3" opacity={0.5} />
              <circle cx={bpx} cy={bpy} r={6} fill="#d6452c" stroke="#faf7f0" strokeWidth={2} />
            </svg>
          </div>
        </div>

        <div className="controls">
          <div className="control">
            <label>割线间距 h <b>{ch.toFixed(2)}</b></label>
            <input
              type="range"
              min={hMin}
              max={hMax}
              step={(hMax - hMin) / 100}
              value={ch}
              onChange={(ev) => setH(+ev.target.value)}
            />
          </div>
          <div style={{ fontSize: 13.5, color: 'var(--ink-soft)', maxWidth: '22em' }}>
            <span style={{ color: '#4a6b52', fontWeight: 600 }}>绿虚线</span>=割线（平均陡度，两点连线）·{' '}
            <span style={{ color: '#b5391f', fontWeight: 600 }}>红线</span>=切线（这一点的瞬时陡度）。
            把 h 拖小，绿线贴到红线上。
          </div>
        </div>

        <div className="readout">
          <div className="item">
            <span className="lbl">位置 x</span>
            <span className="val">{fmt(cx0)}</span>
          </div>
          <div className="item">
            <span className="lbl">多高 f(x)</span>
            <span className="val">{fmt(fx0)}</span>
          </div>
          <div className="item">
            <span className="lbl">割线斜率（h={ch.toFixed(2)}）</span>
            <span className="val">{fmt(slopeSecant)}</span>
          </div>
          <div className="item">
            <span className="lbl">多陡 f′(x)</span>
            <span className="val">{fmt(slopeExact)}</span>
          </div>
        </div>
      </div>

      <p style={{ color: 'var(--ink-soft)', fontSize: 15 }}>{d.note}</p>

      <h2>割线怎么变成切线</h2>
      <p>
        割线量的是「从 <span className="k">x</span> 走到 <span className="k">x+h</span>，平均每一步升了多少」——
        <span className="k">(f(x+h) − f(x)) / h</span>。这是能直接算的东西，两个点、一个减法。
        但它量的是「这一段」的陡度，不是「这一点」的。把 <span className="k">h</span> 越拖越小，终点越来越贴近起点，
        割线也越来越像是「只在一个点上」的那条线——那条极限线就是切线，它的斜率就是导数 <span className="k">f′(x)</span>。
      </p>
      <p>
        <strong>「多高」和「多陡」是两件独立的事</strong>：f(x) 只回答「你在哪」，
        f′(x) 只回答「你正往哪个方向、多快地在变」。抛物线在 x=0 时最低，但那儿的陡度也恰好是 0——
        位置的极值，正是陡度归零的地方，这条规律以后会反复出现（梯度下降要找的就是这种点）。
      </p>

      <Landing>
        物理里 f(x) 是位置、f′(x) 是速度——「多高」和「多快」从来不是一回事。机器学习里 f 常常是损失函数，
        f′（准确说是梯度）指出损失往哪个方向长得最快，梯度下降天天做的就是沿着这条陡度信息的反方向挪一步。
      </Landing>
    </AlgoShell>
  )
}
