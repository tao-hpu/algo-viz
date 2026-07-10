import { useMemo, useRef, useState } from 'react'
import { AlgoShell, Landing } from '../components/AlgoShell'
import { contourSegments, levelsOf, numGrad, rangeOf, type Box, type Scalar2, type Seg } from '../lib/field'

/* ────────────────────────────────────────────────────────────
   梯度场 · 为什么梯度指向最陡的上坡
   核心直觉：站在 p 点朝单位方向 u 走一小步，f 涨的量是
   ∇f·u = |∇f|·cos(夹角)。u 长度锁死为 1，能调的只有夹角，
   而 cos 在夹角为 0 时最大。所以「最陡的方向」就是 ∇f 自己，
   最陡的涨幅恰好是 |∇f|。夹角 90° 时涨幅归零，那正是等高线
   的方向：于是 ∇f 永远垂直于等高线。
   ──────────────────────────────────────────────────────────── */

type Vec = [number, number]
type FieldDef = {
  key: string
  name: string
  f: Scalar2
  power: number // 等高线取值的疏密：2 让谷底附近的圈摊开
  note: string
}

const FIELDS: FieldDef[] = [
  {
    key: 'bowl',
    name: '碗 x²+y²',
    f: (x, y) => x * x + y * y,
    power: 2,
    note: '等高线是同心圆，梯度处处朝外指着圆心的反方向。谷底 ∇f = 0，红箭头缩没了。',
  },
  {
    key: 'saddle',
    name: '鞍 x²−y²',
    f: (x, y) => x * x - y * y,
    power: 1,
    note: '沿 x 轴走是上坡，沿 y 轴走是下坡。原点的 ∇f = 0，但它既不是最高点也不是最低点：驻点不等于极值。',
  },
  {
    key: 'trough',
    name: '斜槽 0.15x²+y²',
    f: (x, y) => 0.15 * x * x + y * y,
    power: 2,
    note: '等高线是狭长椭圆。除非红点正好落在长轴或短轴上，梯度都不指向谷底圆心，只指向「此刻最陡」的那一侧壁。',
  },
  {
    key: 'twin',
    name: '双峰',
    f: (x, y) =>
      -1.2 * Math.exp(-((x - 0.8) ** 2 + (y - 0.6) ** 2) / 0.5) -
      Math.exp(-((x + 0.9) ** 2 + (y + 0.5) ** 2) / 0.6),
    power: 1,
    note: '两个坑，深的那个在右上。远处地势几乎是平的，梯度短得快看不见；坑壁上等高线挤成一团，梯度也随之变长。',
  },
]

const VB = 320
const C = 160
const S = 132
const R = 2.2 // 显示半径（数学坐标）
const BOX: Box = { x0: -R, x1: R, y0: -R, y1: R }

// 全页唯一的坐标换算：数学坐标（上、右为正）→ SVG 像素（y 翻转）。
const toPx = (x: number, y: number): Vec => [C + (x / R) * S, C - (y / R) * S]

const segsToPath = (segs: Seg[]): string =>
  segs
    .map(([ax, ay, bx, by]) => {
      const [x1, y1] = toPx(ax, ay)
      const [x2, y2] = toPx(bx, by)
      return `M${x1.toFixed(1)} ${y1.toFixed(1)}L${x2.toFixed(1)} ${y2.toFixed(1)}`
    })
    .join('')

/**
 * 一支箭头拆成「杆」和「三角帽」两条路径：杆要描边、帽要填充，混在一条
 * path 里会被 fill 连带填掉。长度太短（比如 |∇f|≈0）就返回 null，不画。
 */
function arrow(x1: number, y1: number, x2: number, y2: number, head = 8) {
  const dx = x2 - x1
  const dy = y2 - y1
  const L = Math.hypot(dx, dy)
  if (L < 1.2) return null
  const ux = dx / L
  const uy = dy / L
  const h = Math.min(head, L * 0.62)
  const w = h * 0.46
  const bx = x2 - ux * h
  const by = y2 - uy * h
  const nx = -uy
  const ny = ux
  return {
    shaft: `M${x1.toFixed(1)} ${y1.toFixed(1)}L${bx.toFixed(1)} ${by.toFixed(1)}`,
    head: `${x2.toFixed(1)},${y2.toFixed(1)} ${(bx + nx * w).toFixed(1)},${(by + ny * w).toFixed(1)} ${(bx - nx * w).toFixed(1)},${(by - ny * w).toFixed(1)}`,
  }
}

const gridTicks = (() => {
  const t: number[] = []
  for (let v = -2; v <= 2 + 1e-9; v += 0.5) t.push(+v.toFixed(2))
  return t
})()

// 右下角余弦图的画布
const CW = 320
const CH = 168
const CPL = 34
const CPR = 14
const CMID = 82
const CAMP = 62
const TAU = Math.PI * 2
const cx = (t: number) => CPL + (t / TAU) * (CW - CPL - CPR)

export function GradientField() {
  const [key, setKey] = useState('bowl')
  const [p, setP] = useState<Vec>([0.9, 0.5])
  const [thetaDeg, setThetaDeg] = useState(35)
  const fieldRef = useRef<SVGSVGElement>(null)
  const diskRef = useRef<SVGSVGElement>(null)

  const d = FIELDS.find((ff) => ff.key === key)!
  const [px, py] = p

  // 等高线和背景箭头场只跟函数有关，换函数才重算。
  const contourD = useMemo(() => {
    const [lo, hi] = rangeOf(d.f, BOX, 48)
    return levelsOf(lo, hi, 10, d.power)
      .map((lv) => segsToPath(contourSegments(d.f, BOX, lv, 72)))
      .join('')
  }, [d])

  const { arrows, gMax } = useMemo(() => {
    const n = 9
    const samples: { x: number; y: number; gx: number; gy: number; m: number }[] = []
    let mx = 0
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const x = -1.9 + (3.8 * i) / (n - 1)
        const y = -1.9 + (3.8 * j) / (n - 1)
        const [gx, gy] = numGrad(d.f, x, y)
        const m = Math.hypot(gx, gy)
        if (m > mx) mx = m
        samples.push({ x, y, gx, gy, m })
      }
    }
    return { arrows: samples, gMax: Math.max(mx, 1e-6) }
  }, [d])

  const fp = d.f(px, py)
  const [gx, gy] = numGrad(d.f, px, py)
  const gLen = Math.hypot(gx, gy)
  const flat = gLen < 1e-4 // 驻点：方向一律没得挑，箭头全都别画

  // 经过红点的那一条等高线，单独调一次，画粗。
  const hereD = useMemo(() => segsToPath(contourSegments(d.f, BOX, fp, 110)), [d, fp])

  const theta = (thetaDeg * Math.PI) / 180
  const ux = Math.cos(theta)
  const uy = Math.sin(theta)
  const dirDeriv = gx * ux + gy * uy
  // ∇f 自己的方向角，规范到 [0, 2π)：余弦图的峰就落在这里。
  const thetaG = flat ? 0 : (Math.atan2(gy, gx) + TAU) % TAU

  const [ppx, ppy] = toPx(px, py)

  // 红箭头长度对 |∇f| 单调但有上限：m/(m+half) 永远小于 1，|∇f|=0 时自然收成 0。
  const gradPx = 82 * (gLen / (gLen + gMax * 0.5))
  const gArrow = flat ? null : arrow(ppx, ppy, ppx + (gx / gLen) * gradPx, ppy - (gy / gLen) * gradPx, 11)
  const uArrow = arrow(ppx, ppy, ppx + ux * 64, ppy - uy * 64, 9)

  // 等高线在 p 点的切线方向：把梯度转 90°。
  const tanPx = flat ? null : { x: (-gy / gLen) * 52, y: (gx / gLen) * 52 }

  // 余弦图纵轴用整个场的 |∇f| 上限做固定刻度，平坦处波幅自然就矮。
  const M = Math.max(gMax, gLen) * 1.08
  const cy = (v: number) => CMID - (v / M) * CAMP
  const cosD = (() => {
    let s = ''
    for (let i = 0; i <= 120; i++) {
      const t = (TAU * i) / 120
      s += (i === 0 ? 'M' : 'L') + cx(t).toFixed(1) + ' ' + cy(gLen * Math.cos(t - thetaG)).toFixed(1)
    }
    return s
  })()
  const zeros = [(thetaG + Math.PI / 2) % TAU, (thetaG + (3 * Math.PI) / 2) % TAU]
  const zLabel = zeros[0] > Math.PI ? zeros[0] : zeros[1] // 挑靠右的那个零点写字，左边留给峰值标注

  // 单位圆盘
  const DW = 320
  const DH = 152
  const DC: Vec = [160, 76]
  const DR = 58

  function pointerToP(e: React.PointerEvent) {
    const svg = fieldRef.current
    if (!svg) return
    const ctm = svg.getScreenCTM()
    if (!ctm) return
    const pt = new DOMPointReadOnly(e.clientX, e.clientY).matrixTransform(ctm.inverse())
    const lim = R * 0.92
    const x = Math.max(-lim, Math.min(lim, ((pt.x - C) / S) * R))
    const y = Math.max(-lim, Math.min(lim, (-(pt.y - C) / S) * R))
    setP([+x.toFixed(3), +y.toFixed(3)])
  }

  function pointerToTheta(e: React.PointerEvent) {
    const svg = diskRef.current
    if (!svg) return
    const ctm = svg.getScreenCTM()
    if (!ctm) return
    const pt = new DOMPointReadOnly(e.clientX, e.clientY).matrixTransform(ctm.inverse())
    const a = Math.atan2(-(pt.y - DC[1]), pt.x - DC[0])
    // 先取整再取模：359.7 会进位成 360，那是滑块 max=359 之外的值，红点会和读数对不上。
    setThetaDeg(Math.round(((a * 180) / Math.PI + 360) % 360) % 360)
  }

  const fmt = (v: number) => (Math.abs(v) < 0.005 ? '0.00' : v.toFixed(2))

  return (
    <AlgoShell
      slug="gradient-field"
      lede={
        <>
          站在山坡的一点上，往哪个方向迈一步涨得最快？答案是 <span className="k">∇f</span>，
          而且它永远和脚下那条等高线成直角。这两件事其实是同一个公式的两种读法。
          拖动红点换位置，转 <span className="k">θ</span> 换方向，看右边那条余弦曲线的峰落在哪。
        </>
      }
    >
      <div className="lab">
        <div className="controls" style={{ marginTop: 0, marginBottom: 18, borderTop: 'none', paddingTop: 0 }}>
          <div className="seg" role="tablist" aria-label="选择标量场">
            {FIELDS.map((ff) => (
              <button key={ff.key} className={ff.key === key ? 'on' : ''} onClick={() => setKey(ff.key)}>
                {ff.name}
              </button>
            ))}
          </div>
        </div>

        <div className="lab-panels">
          {/* 左：等高线 + 梯度场 */}
          <div className="lab-panel">
            <h4>等高线 + 梯度场 · 拖动红点</h4>
            <svg
              ref={fieldRef}
              viewBox={`0 0 ${VB} ${VB}`}
              onPointerDown={(ev) => { (ev.target as Element).setPointerCapture?.(ev.pointerId); pointerToP(ev) }}
              onPointerMove={(ev) => { if (ev.buttons) pointerToP(ev) }}
              role="img"
              aria-label="标量场的等高线与梯度箭头场，可拖动采样点"
            >
              {gridTicks.map((v) => {
                const [x1, y1] = toPx(v, -2)
                const [x2, y2] = toPx(v, 2)
                const [x3, y3] = toPx(-2, v)
                const [x4, y4] = toPx(2, v)
                return (
                  <g key={v} stroke="#d9d2c4" strokeWidth={v === 0 ? 1.4 : 0.6}>
                    <line x1={x1} y1={y1} x2={x2} y2={y2} />
                    <line x1={x3} y1={y3} x2={x4} y2={y4} />
                  </g>
                )
              })}

              <path d={contourD} fill="none" stroke="#c9c2b2" strokeWidth={0.9} />

              {/* 稀疏箭头场：长度按 |∇f| 归一化并封顶，只做背景 */}
              <g stroke="#b9b2a2" strokeWidth={0.9} fill="#b9b2a2">
                {arrows.map((a, i) => {
                  if (a.m < 1e-5) return null
                  const L = 17 * Math.pow(a.m / gMax, 0.6)
                  const [sx, sy] = toPx(a.x, a.y)
                  const hx = (a.gx / a.m) * (L / 2)
                  const hy = (a.gy / a.m) * (L / 2)
                  const ar = arrow(sx - hx, sy + hy, sx + hx, sy - hy, 5)
                  if (!ar) return null
                  return (
                    <g key={i}>
                      <path d={ar.shaft} fill="none" />
                      <polygon points={ar.head} stroke="none" />
                    </g>
                  )
                })}
              </g>

              {/* 经过红点的等高线 + 它在红点处的切线方向 */}
              <path d={hereD} fill="none" stroke="#4a6b52" strokeWidth={2.2} />
              {tanPx && (
                <line
                  x1={ppx - tanPx.x} y1={ppy - tanPx.y} x2={ppx + tanPx.x} y2={ppy + tanPx.y}
                  stroke="#4a6b52" strokeWidth={1.4} strokeDasharray="5 4" opacity={0.8}
                />
              )}

              {/* 用户选的方向 u（虚线）与梯度 ∇f（实线） */}
              {uArrow && (
                <g>
                  <path d={uArrow.shaft} fill="none" stroke="#d6452c" strokeWidth={1.6} strokeDasharray="5 3" opacity={0.75} />
                  <polygon points={uArrow.head} fill="#d6452c" opacity={0.75} />
                </g>
              )}
              {gArrow && (
                <g>
                  <path d={gArrow.shaft} fill="none" stroke="#d6452c" strokeWidth={2.4} />
                  <polygon points={gArrow.head} fill="#d6452c" />
                </g>
              )}
              <circle cx={ppx} cy={ppy} r={6} fill="#d6452c" stroke="#faf7f0" strokeWidth={2} />
              {flat && (
                <text x={ppx + 12} y={ppy - 10} fontSize={11} fill="#b5391f">∇f = 0</text>
              )}
            </svg>
          </div>

          {/* 右：方向盘 + 方向导数曲线 */}
          <div className="lab-panel">
            <h4>所有方向里，哪个最陡</h4>

            <svg
              ref={diskRef}
              viewBox={`0 0 ${DW} ${DH}`}
              onPointerDown={(ev) => { (ev.target as Element).setPointerCapture?.(ev.pointerId); pointerToTheta(ev) }}
              onPointerMove={(ev) => { if (ev.buttons) pointerToTheta(ev) }}
              role="img"
              aria-label="单位圆盘，拖动可改变方向 u 的角度"
            >
              <text x={6} y={13} fontSize={10} fill="#9a968a">单位方向 u · 圆盘上可直接拖</text>
              <g stroke="#d9d2c4" strokeWidth={0.8}>
                <line x1={DC[0] - DR - 8} y1={DC[1]} x2={DC[0] + DR + 8} y2={DC[1]} />
                <line x1={DC[0]} y1={DC[1] - DR - 8} x2={DC[0]} y2={DC[1] + DR + 8} />
              </g>
              <circle cx={DC[0]} cy={DC[1]} r={DR} fill="none" stroke="#c9c2b2" strokeWidth={1.1} />
              {(() => {
                const ua = arrow(DC[0], DC[1], DC[0] + ux * DR, DC[1] - uy * DR, 9)
                const ga = flat ? null : arrow(DC[0], DC[1], DC[0] + (gx / gLen) * DR, DC[1] - (gy / gLen) * DR, 10)
                return (
                  <g>
                    {ua && (
                      <g>
                        <path d={ua.shaft} fill="none" stroke="#d6452c" strokeWidth={1.6} strokeDasharray="5 3" opacity={0.75} />
                        <polygon points={ua.head} fill="#d6452c" opacity={0.75} />
                      </g>
                    )}
                    {ga && (
                      <g>
                        <path d={ga.shaft} fill="none" stroke="#d6452c" strokeWidth={2.4} />
                        <polygon points={ga.head} fill="#d6452c" />
                      </g>
                    )}
                  </g>
                )
              })()}
              <circle cx={DC[0]} cy={DC[1]} r={3} fill="#d6452c" stroke="#faf7f0" strokeWidth={1.6} />
              {flat && <text x={DC[0] + 10} y={DC[1] - 8} fontSize={10} fill="#9a968a">∇f = 0，没有方向可挑</text>}
            </svg>

            <svg viewBox={`0 0 ${CW} ${CH}`} role="img" aria-label="方向导数随方向角变化的余弦曲线">
              <text x={6} y={13} fontSize={10} fill="#9a968a">g(θ) = ∇f · u(θ) = |∇f|·cos(θ − θ_g)</text>
              <line x1={CPL} y1={cy(0)} x2={CW - CPR} y2={cy(0)} stroke="#d9d2c4" strokeWidth={1} />
              {[0, 0.25, 0.5, 0.75, 1].map((u, i) => (
                <text key={u} x={cx(u * TAU)} y={CH - 7} fontSize={9} fill="#9a968a" textAnchor="middle">
                  {['0', 'π/2', 'π', '3π/2', '2π'][i]}
                </text>
              ))}

              {!flat && (
                <g>
                  {/* 峰：最陡方向，涨幅恰好等于 |∇f| */}
                  <line x1={cx(thetaG)} y1={cy(0)} x2={cx(thetaG)} y2={cy(gLen)} stroke="#4a6b52" strokeWidth={1.2} strokeDasharray="4 3" />
                  <text
                    x={cx(thetaG)} y={cy(gLen) - 6} fontSize={10} fill="#4a6b52"
                    textAnchor={cx(thetaG) > CW - 70 ? 'end' : cx(thetaG) < 70 ? 'start' : 'middle'}
                  >
                    |∇f| = {fmt(gLen)}
                  </text>
                  {zeros.map((z) => <circle key={z} cx={cx(z)} cy={cy(0)} r={2.6} fill="#4a6b52" />)}
                  <text
                    x={cx(zLabel) + (cx(zLabel) > 160 ? -6 : 6)} y={cy(0) + 15} fontSize={9.5} fill="#8a8470"
                    textAnchor={cx(zLabel) > 160 ? 'end' : 'start'}
                  >
                    沿等高线走，f 不变
                  </text>
                </g>
              )}

              <path d={cosD} fill="none" stroke="#8a8470" strokeWidth={1.8} />
              <line x1={cx(theta)} y1={18} x2={cx(theta)} y2={CH - 22} stroke="#d6452c" strokeWidth={1} strokeDasharray="3 3" opacity={0.45} />
              <circle cx={cx(theta)} cy={cy(dirDeriv)} r={5.5} fill="#d6452c" stroke="#faf7f0" strokeWidth={2} />
            </svg>
          </div>
        </div>

        <div className="controls">
          <div className="control">
            <label htmlFor="theta">方向角 θ <b>{thetaDeg}°</b></label>
            <input id="theta" type="range" min={0} max={359} step={1} value={thetaDeg}
              onChange={(ev) => setThetaDeg(+ev.target.value)} />
          </div>
          <div style={{ fontSize: 13.5, color: 'var(--ink-soft)', maxWidth: '22em' }}>
            把 θ 转到红实线箭头上，余弦曲线正好爬到峰顶；转到绿虚线上，涨幅归零。
          </div>
        </div>

        <div className="legend">
          <span><i style={{ background: '#d6452c' }} />∇f（最陡上坡）</span>
          <span><i style={{ background: '#d6452c', opacity: 0.6 }} />方向 u（虚线）</span>
          <span><i style={{ background: '#4a6b52' }} />过 p 的等高线与切线</span>
          <span><i style={{ background: '#b9b2a2' }} />背景梯度场</span>
        </div>

        <div className="readout">
          <div className="item">
            <span className="lbl">高度 f(p)</span>
            <span className="val">{fmt(fp)}</span>
          </div>
          <div className="item">
            <span className="lbl">梯度 ∇f</span>
            <span className="val">({fmt(gx)}, {fmt(gy)})</span>
          </div>
          <div className="item">
            <span className="lbl">最陡涨幅 |∇f|</span>
            <span className="val">{fmt(gLen)}</span>
          </div>
          <div className="item">
            <span className="lbl">方向导数 ∇f·u（θ={thetaDeg}°）</span>
            <span className="val">{fmt(dirDeriv)}</span>
          </div>
        </div>
      </div>

      <p style={{ color: 'var(--ink-soft)', fontSize: 15 }}>{d.note}</p>

      <h2>为什么梯度指向最陡的上坡</h2>
      <p>
        从 p 出发朝单位方向 <span className="k">u</span> 迈一小步 <span className="k">t</span>，高度涨的量是
        <span className="k">f(p+tu) − f(p) ≈ t · (∇f·u)</span>。所以「哪个方向最陡」就等于问「哪个 u 让
        <span className="k">∇f·u</span> 最大」。把点积拆开：<span className="k">∇f·u = |∇f|·|u|·cosθ</span>，
        而 u 的长度锁死为 1，<span className="k">|∇f|</span> 又是这一点固定的数，能调的只剩夹角 θ。
        cos 在 θ=0 时取到 1，也就是 u 和 ∇f 同向的时候。于是最陡的方向就是梯度自己，
        最陡的涨幅恰好是 <span className="k">|∇f|</span>。右边那条余弦曲线画的就是这句话。
      </p>
      <p>
        反过来，θ=180° 时 cos = −1，跌得最快，涨幅是 <span className="k">−|∇f|</span>。这就是梯度下降为什么沿
        <span className="k">−∇f</span> 走：它不是某种巧妙设计，只是「最陡上坡」这句话的镜像。
      </p>

      <h2>为什么梯度垂直于等高线</h2>
      <p>
        沿着等高线走，按定义 f 一点也不变，那么沿这个方向的方向导数必须是 0，即 <span className="k">∇f·u = 0</span>。
        点积为零就是两个向量互相垂直。所以红箭头和绿等高线永远成直角，你怎么拖红点都不例外。
        余弦曲线上那两个过零点，对应的正是等高线的两个走向（前进和后退）。
      </p>
      <p>
        这也顺带解释了「等高线越密，梯度越大」：相邻两条等高线的高度差是固定的，横着的距离越短，
        意味着同样的高度差被压在更窄的坡上，<span className="k">|∇f|</span> 自然更大。切到「双峰」拖到坑壁上看，
        等高线挤成一圈一圈的地方，背景箭头也跟着变长。
      </p>
      <p>
        <strong>驻点不等于极值</strong>。切到「鞍」，把红点拖回原点：<span className="k">∇f = 0</span>，
        所有方向的方向导数都是 0，余弦曲线塌成一条水平线。但沿 x 轴走是上坡，沿 y 轴走是下坡，
        它既不是山顶也不是谷底。梯度为零只说明「一阶看不出高低」，要分辨还得看二阶信息。
      </p>

      <Landing>
        训练神经网络的每一步都在算 −∇f 然后往那个方向挪一点，反向传播做的全部事情就是把这个梯度算出来。
        优化论文里那些椭圆套椭圆的插图，骨架就是「等高线 ⟂ 梯度」这一条：狭长的等高线会让梯度一次次指向侧壁而不是谷底，
        走出之字形。等高线挤得密的地方 |∇f| 大，损失面陡峭，学习率稍大一步就迈过头，loss 直接飞到 NaN。
      </Landing>
    </AlgoShell>
  )
}
