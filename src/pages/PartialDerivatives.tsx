import { useMemo, useRef, useState } from 'react'
import { AlgoShell, Landing } from '../components/AlgoShell'

/* ────────────────────────────────────────────────────────────
   偏导数 · 两个旋钮的机器
   核心直觉：二元函数 f(x,y) 有两个能拧的旋钮。∂f/∂x 是「冻住 y，
   只拧 x」时的普通导数；∂f/∂y 反过来。地形图（左）给出全局，
   两条切片曲线（中、右）各自只让你拧一个旋钮——这正是偏导数
   的定义，不是新数学，是「一次只问一个方向」的老导数。
   ──────────────────────────────────────────────────────────── */

type Vec = [number, number]
type Surface = {
  key: string
  name: string
  f: (x: number, y: number) => number
  xMin: number
  xMax: number
  yMin: number
  yMax: number
  note: string
}

const SURFACES: Surface[] = [
  {
    key: 'bowl',
    name: '碗 · x²+y²',
    f: (x, y) => 0.5 * (x * x + y * y),
    xMin: -2,
    xMax: 2,
    yMin: -2,
    yMax: 2,
    note: '两个方向都往上翘。两个偏导数同时是 0 的地方，正是整个碗的最低点。',
  },
  {
    key: 'saddle',
    name: '马鞍 · xy',
    f: (x, y) => x * y,
    xMin: -2,
    xMax: 2,
    yMin: -2,
    yMax: 2,
    note: '沿 x 切一刀是条直线，沿 y 切一刀也是条直线——但两条线的斜率会互相拖累对方的符号。',
  },
  {
    key: 'ripple',
    name: '波纹 · sin(x)cos(y)',
    f: (x, y) => Math.sin(x) * Math.cos(y),
    xMin: -Math.PI,
    xMax: Math.PI,
    yMin: -Math.PI,
    yMax: Math.PI,
    note: '两个方向各自振荡，偏导数也跟着振荡——这是三张里最像等高线地图的一张。',
  },
]

function partialX(f: (x: number, y: number) => number, x: number, y: number) {
  const h = 1e-3
  return (f(x + h, y) - f(x - h, y)) / (2 * h)
}
function partialY(f: (x: number, y: number) => number, x: number, y: number) {
  const h = 1e-3
  return (f(x, y + h) - f(x, y - h)) / (2 * h)
}

function makeToPx(xMin: number, xMax: number, yMin: number, yMax: number, vbw: number, vbh: number, pad: number) {
  return (x: number, y: number): Vec => {
    const px = pad + ((x - xMin) / (xMax - xMin)) * (vbw - 2 * pad)
    const py = vbh - pad - ((y - yMin) / (yMax - yMin)) * (vbh - 2 * pad)
    return [px, py]
  }
}

function curvePath(xMin: number, xMax: number, toPx: (x: number, y: number) => Vec, fn: (x: number) => number, n = 100) {
  let path = ''
  for (let i = 0; i <= n; i++) {
    const x = xMin + ((xMax - xMin) * i) / n
    const [px, py] = toPx(x, fn(x))
    path += (i === 0 ? 'M' : 'L') + px.toFixed(1) + ' ' + py.toFixed(1)
  }
  return path
}

const HVB = 240
const HPAD = 18
const SVB_W = 300
const SVB_H = 210
const SPAD = 22
const N = 18

export function PartialDerivatives() {
  const [key, setKey] = useState('bowl')
  const s = SURFACES.find((surf) => surf.key === key)!
  const [x0, setX0] = useState(() => (s.xMin + s.xMax) * 0.5 + (s.xMax - s.xMin) * 0.2)
  const [y0, setY0] = useState(() => (s.yMin + s.yMax) * 0.5 - (s.yMax - s.yMin) * 0.18)
  const heatRef = useRef<SVGSVGElement>(null)
  const sliceXRef = useRef<SVGSVGElement>(null)
  const sliceYRef = useRef<SVGSVGElement>(null)

  const cx0 = Math.max(s.xMin, Math.min(s.xMax, x0))
  const cy0 = Math.max(s.yMin, Math.min(s.yMax, y0))

  // 网格采样（z 值域）和热力图格子只随所选曲面变，与拖动的采样点无关——按 key 缓存，别每帧重算。
  const toPxH = makeToPx(s.xMin, s.xMax, s.yMin, s.yMax, HVB, HVB, HPAD)
  const { zMin, zMax, cells } = useMemo(() => {
    // 采样整张网格拿 z 值域：热力图配色、两条切片曲线的纵轴都用同一把尺，换点位置时轴不跳。
    let zMin = Infinity
    let zMax = -Infinity
    for (let i = 0; i <= N; i++) {
      for (let j = 0; j <= N; j++) {
        const v = s.f(s.xMin + ((s.xMax - s.xMin) * i) / N, s.yMin + ((s.yMax - s.yMin) * j) / N)
        if (v < zMin) zMin = v
        if (v > zMax) zMax = v
      }
    }
    const absMax = Math.max(Math.abs(zMin), Math.abs(zMax)) || 1

    // 热力图格子：正值朱红、负值墨绿，透明度按幅值缩放——沿用站内的两色体系，不引入新配色。
    const dxv = (s.xMax - s.xMin) / N
    const dyv = (s.yMax - s.yMin) / N
    const cells: { x: number; y: number; w: number; h: number; fill: string }[] = []
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        const xc = s.xMin + (i + 0.5) * dxv
        const yc = s.yMin + (j + 0.5) * dyv
        const v = s.f(xc, yc)
        const t = Math.max(-1, Math.min(1, v / absMax))
        const fill = t >= 0 ? `rgba(214,69,44,${(0.05 + 0.5 * t).toFixed(3)})` : `rgba(74,107,82,${(0.05 + 0.5 * -t).toFixed(3)})`
        const [ax, ay] = toPxH(s.xMin + i * dxv, s.yMin + (j + 1) * dyv)
        const [bx, by] = toPxH(s.xMin + (i + 1) * dxv, s.yMin + j * dyv)
        cells.push({ x: Math.min(ax, bx), y: Math.min(ay, by), w: Math.abs(bx - ax), h: Math.abs(by - ay), fill })
      }
    }
    return { zMin, zMax, cells }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  const zPad = (zMax - zMin) * 0.12 || 0.5

  const toPxX = makeToPx(s.xMin, s.xMax, zMin - zPad, zMax + zPad, SVB_W, SVB_H, SPAD)
  const toPxY = makeToPx(s.yMin, s.yMax, zMin - zPad, zMax + zPad, SVB_W, SVB_H, SPAD)

  const fVal = s.f(cx0, cy0)
  const dfx = partialX(s.f, cx0, cy0)
  const dfy = partialY(s.f, cx0, cy0)

  function pointerToXY(e: React.PointerEvent) {
    const svg = heatRef.current
    if (!svg) return
    const ctm = svg.getScreenCTM()
    if (!ctm) return
    const inv = ctm.inverse()
    const pt = new DOMPointReadOnly(e.clientX, e.clientY).matrixTransform(inv)
    const x = s.xMin + ((pt.x - HPAD) / (HVB - 2 * HPAD)) * (s.xMax - s.xMin)
    const y = s.yMax - ((pt.y - HPAD) / (HVB - 2 * HPAD)) * (s.yMax - s.yMin)
    setX0(Math.max(s.xMin, Math.min(s.xMax, x)))
    setY0(Math.max(s.yMin, Math.min(s.yMax, y)))
  }
  function pointerToXOnly(e: React.PointerEvent) {
    const svg = sliceXRef.current
    if (!svg) return
    const ctm = svg.getScreenCTM()
    if (!ctm) return
    const inv = ctm.inverse()
    const pt = new DOMPointReadOnly(e.clientX, e.clientY).matrixTransform(inv)
    const x = s.xMin + ((pt.x - SPAD) / (SVB_W - 2 * SPAD)) * (s.xMax - s.xMin)
    setX0(Math.max(s.xMin, Math.min(s.xMax, x)))
  }
  function pointerToYOnly(e: React.PointerEvent) {
    const svg = sliceYRef.current
    if (!svg) return
    const ctm = svg.getScreenCTM()
    if (!ctm) return
    const inv = ctm.inverse()
    const pt = new DOMPointReadOnly(e.clientX, e.clientY).matrixTransform(inv)
    const y = s.yMin + ((pt.x - SPAD) / (SVB_W - 2 * SPAD)) * (s.yMax - s.yMin)
    setY0(Math.max(s.yMin, Math.min(s.yMax, y)))
  }

  const [hpx, hpy] = toPxH(cx0, cy0)
  const [crossVx] = toPxH(cx0, 0)
  const [, crossHy] = toPxH(0, cy0)

  const curveXD = curvePath(s.xMin, s.xMax, toPxX, (x) => s.f(x, cy0))
  const [xpx, xpy] = toPxX(cx0, fVal)
  const tanXSpan = (s.xMax - s.xMin) * 0.28
  const [txx1, txy1] = toPxX(cx0 - tanXSpan, fVal - dfx * tanXSpan)
  const [txx2, txy2] = toPxX(cx0 + tanXSpan, fVal + dfx * tanXSpan)

  const curveYD = curvePath(s.yMin, s.yMax, toPxY, (y) => s.f(cx0, y))
  const [ypx, ypy] = toPxY(cy0, fVal)
  const tanYSpan = (s.yMax - s.yMin) * 0.28
  const [tyx1, tyy1] = toPxY(cy0 - tanYSpan, fVal - dfy * tanYSpan)
  const [tyx2, tyy2] = toPxY(cy0 + tanYSpan, fVal + dfy * tanYSpan)

  const fmt = (v: number) => (Math.abs(v) < 0.005 ? '0.00' : v.toFixed(2))

  return (
    <AlgoShell
      slug="partial-derivatives"
      lede={
        <>
          f(x,y) 是台有两个旋钮的机器。<span className="k">∂f/∂x</span> 只问「冻住 y，单拧 x 会怎样」；
          <span className="k">∂f/∂y</span> 反过来。左边地形图能自由拖动两个坐标，
          中间和右边两张切片图各自只让你拧一个旋钮——冻住的那个变量就是普通导数里的常数。
        </>
      }
    >
      <div className="lab">
        <div className="controls" style={{ marginTop: 0, marginBottom: 18, borderTop: 'none', paddingTop: 0 }}>
          <div className="seg" role="tablist" aria-label="选择曲面">
            {SURFACES.map((surf) => (
              <button
                key={surf.key}
                className={surf.key === key ? 'on' : ''}
                onClick={() => {
                  setKey(surf.key)
                  setX0((surf.xMin + surf.xMax) * 0.5 + (surf.xMax - surf.xMin) * 0.2)
                  setY0((surf.yMin + surf.yMax) * 0.5 - (surf.yMax - surf.yMin) * 0.18)
                }}
              >
                {surf.name}
              </button>
            ))}
          </div>
        </div>

        <div className="lab-panels">
          <div className="lab-panel" style={{ flex: '1 1 220px', maxWidth: 260 }}>
            <h4>地形图 · 自由拖动</h4>
            <svg
              ref={heatRef}
              viewBox={`0 0 ${HVB} ${HVB}`}
              onPointerDown={(ev) => { (ev.target as Element).setPointerCapture?.(ev.pointerId); pointerToXY(ev) }}
              onPointerMove={(ev) => { if (ev.buttons) pointerToXY(ev) }}
              role="img"
              aria-label="二元函数地形图，可自由拖动采样点"
            >
              {cells.map((c, i) => (
                <rect key={i} x={c.x} y={c.y} width={c.w + 0.6} height={c.h + 0.6} fill={c.fill} />
              ))}
              <line x1={crossVx} y1={HPAD} x2={crossVx} y2={HVB - HPAD} stroke="#d6452c" strokeWidth={1} strokeDasharray="3 3" opacity={0.55} />
              <line x1={HPAD} y1={crossHy} x2={HVB - HPAD} y2={crossHy} stroke="#d6452c" strokeWidth={1} strokeDasharray="3 3" opacity={0.55} />
              <circle cx={hpx} cy={hpy} r={6} fill="#d6452c" stroke="#faf7f0" strokeWidth={2} />
            </svg>
          </div>

          <div className="lab-panel">
            <h4>冻住 y · 只拖 x</h4>
            <svg
              ref={sliceXRef}
              viewBox={`0 0 ${SVB_W} ${SVB_H}`}
              onPointerDown={(ev) => { (ev.target as Element).setPointerCapture?.(ev.pointerId); pointerToXOnly(ev) }}
              onPointerMove={(ev) => { if (ev.buttons) pointerToXOnly(ev) }}
              role="img"
              aria-label="沿 x 方向的切片曲线，可拖动"
            >
              {zMin <= 0 && zMax >= 0 && (
                <line x1={SPAD} y1={toPxX(0, 0)[1]} x2={SVB_W - SPAD} y2={toPxX(0, 0)[1]} stroke="#d9d2c4" strokeWidth={1} />
              )}
              <path d={curveXD} fill="none" stroke="#8a8470" strokeWidth={1.8} />
              <line x1={txx1} y1={txy1} x2={txx2} y2={txy2} stroke="#d6452c" strokeWidth={1.8} />
              <circle cx={xpx} cy={xpy} r={6} fill="#d6452c" stroke="#faf7f0" strokeWidth={2} />
            </svg>
          </div>

          <div className="lab-panel">
            <h4>冻住 x · 只拖 y</h4>
            <svg
              ref={sliceYRef}
              viewBox={`0 0 ${SVB_W} ${SVB_H}`}
              onPointerDown={(ev) => { (ev.target as Element).setPointerCapture?.(ev.pointerId); pointerToYOnly(ev) }}
              onPointerMove={(ev) => { if (ev.buttons) pointerToYOnly(ev) }}
              role="img"
              aria-label="沿 y 方向的切片曲线，可拖动"
            >
              {zMin <= 0 && zMax >= 0 && (
                <line x1={SPAD} y1={toPxY(0, 0)[1]} x2={SVB_W - SPAD} y2={toPxY(0, 0)[1]} stroke="#d9d2c4" strokeWidth={1} />
              )}
              <path d={curveYD} fill="none" stroke="#8a8470" strokeWidth={1.8} />
              <line x1={tyx1} y1={tyy1} x2={tyx2} y2={tyy2} stroke="#d6452c" strokeWidth={1.8} />
              <circle cx={ypx} cy={ypy} r={6} fill="#d6452c" stroke="#faf7f0" strokeWidth={2} />
            </svg>
          </div>
        </div>

        <div className="readout">
          <div className="item">
            <span className="lbl">位置 (x, y)</span>
            <span className="val">({fmt(cx0)}, {fmt(cy0)})</span>
          </div>
          <div className="item">
            <span className="lbl">f(x, y)</span>
            <span className="val">{fmt(fVal)}</span>
          </div>
          <div className="item">
            <span className="lbl">∂f/∂x（冻住 y）</span>
            <span className="val">{fmt(dfx)}</span>
          </div>
          <div className="item">
            <span className="lbl">∂f/∂y（冻住 x）</span>
            <span className="val">{fmt(dfy)}</span>
          </div>
        </div>
      </div>

      <p style={{ color: 'var(--ink-soft)', fontSize: 15 }}>{s.note}</p>

      <h2>偏导数不是新数学</h2>
      <p>
        <span className="k">∂f/∂x</span> 的定义就是把 y 焊死在 y₀，剩下 g(x) = f(x, y₀) 是个只有一个变量的函数——
        对它求导，用的还是「导数是什么」那页的老办法：割线收敛成切线。<span className="k">∂f/∂y</span> 反过来焊死 x。
        地形图上的红色虚十字，就是这两条切片曲线各自被冻住的那道「切口」——切两刀，两个方向的陡度就都有了。
      </p>

      <Landing>
        梯度 <span className="k">∇f = (∂f/∂x, ∂f/∂y)</span> 就是把这两个偏导数打包成一个向量，
        它指向的正是「同时拧两个旋钮、上升最快」的方向——下一站梯度场要画的就是这支箭头。
        深度学习里每个参数的梯度，本质上也只是"冻住其它所有参数，单看这一个"的偏导数。
      </Landing>
    </AlgoShell>
  )
}
