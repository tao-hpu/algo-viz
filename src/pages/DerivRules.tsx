import { useRef, useState } from 'react'
import { AlgoShell, Landing } from '../components/AlgoShell'

/* ────────────────────────────────────────────────────────────
   求导词典 · 幂/和/积/商/链式
   核心直觉：每条规则都是「先把函数拆成几个认识的小零件，
   按固定套路把小零件的导数拼回去」。这页不背公式，而是让你
   拖一个点，同时看「套公式算出来的」和「直接数值验证的」
   是不是同一个数——规则不是玄学，是可以当场验货的。
   ──────────────────────────────────────────────────────────── */

type Vec = [number, number]
type Detail = { label: string; value: number }
type Rule = {
  key: string
  name: string
  f: (x: number) => number
  ruleDeriv: (x: number) => number
  formula: string
  detail: (x: number) => Detail[]
  xMin: number
  xMax: number
  note: string
}

const RULES: Rule[] = [
  {
    key: 'power',
    name: '幂法则',
    f: (x) => x ** 3,
    ruleDeriv: (x) => 3 * x * x,
    formula: 'f(x) = xⁿ　⟹　f′(x) = n·xⁿ⁻¹',
    detail: (x) => [
      { label: 'n', value: 3 },
      { label: 'xⁿ⁻¹ = x²', value: x * x },
    ],
    xMin: -1.8,
    xMax: 1.8,
    note: '指数掉下来乘在前面，指数本身再减 1——幂法则就这两步。',
  },
  {
    key: 'sum',
    name: '和法则',
    f: (x) => Math.sin(x) + 0.35 * x * x,
    ruleDeriv: (x) => Math.cos(x) + 0.7 * x,
    formula: '(u + v)′ = u′ + v′',
    detail: (x) => [
      { label: 'u=sin x ⟹ u′=cos x', value: Math.cos(x) },
      { label: 'v=0.35x² ⟹ v′=0.7x', value: 0.7 * x },
    ],
    xMin: -3,
    xMax: 3,
    note: '加在一起的函数，导数也直接加在一起——两股变化互不干扰。',
  },
  {
    key: 'product',
    name: '乘法法则',
    f: (x) => x * Math.sin(x),
    ruleDeriv: (x) => Math.sin(x) + x * Math.cos(x),
    formula: '(u·v)′ = u′v + uv′',
    detail: (x) => [
      { label: 'u=x ⟹ u′=1', value: 1 },
      { label: 'v=sin x ⟹ v′=cos x', value: Math.cos(x) },
    ],
    xMin: -3.2,
    xMax: 3.2,
    note: '谁在变都要记一笔：一个在变时把另一个当常数，两笔算完再加起来。',
  },
  {
    key: 'quotient',
    name: '商法则',
    f: (x) => Math.sin(x) / (x + 2.5),
    ruleDeriv: (x) => (Math.cos(x) * (x + 2.5) - Math.sin(x)) / (x + 2.5) ** 2,
    formula: '(u/v)′ = (u′v − uv′) / v²',
    detail: (x) => [
      { label: 'u=sin x ⟹ u′=cos x', value: Math.cos(x) },
      { label: 'v=x+2.5 ⟹ v′=1', value: 1 },
    ],
    xMin: -2.2,
    xMax: 2.2,
    note: '比乘法法则多一步：谁蹲在分母上，谁的符号就要翻一次面，再除以 v²。',
  },
  {
    key: 'chain',
    name: '链式法则',
    f: (x) => Math.sin(x * x),
    ruleDeriv: (x) => Math.cos(x * x) * 2 * x,
    formula: 'f(g(x))′ = f′(g(x))·g′(x)',
    detail: (x) => [
      { label: '内层 g=x² ⟹ g′=2x', value: 2 * x },
      { label: '外层 f′=cos(g)', value: Math.cos(x * x) },
    ],
    xMin: -2.2,
    xMax: 2.2,
    note: '一层套一层，导数也一层乘一层——这正是神经网络反向传播用的全部数学。',
  },
]

function derivNum(f: (x: number) => number, x: number) {
  const h = 1e-3
  return (f(x + h) - f(x - h)) / (2 * h)
}

function yRange(f: (x: number) => number, xMin: number, xMax: number, n = 120) {
  let ymin = Infinity
  let ymax = -Infinity
  for (let i = 0; i <= n; i++) {
    const y = f(xMin + ((xMax - xMin) * i) / n)
    if (y < ymin) ymin = y
    if (y > ymax) ymax = y
  }
  const pad = (ymax - ymin) * 0.18 || 1
  return [ymin - pad, ymax + pad]
}

const VBW = 400
const VBH = 220
const PAD = 24

function makeToPx(xMin: number, xMax: number, yMin: number, yMax: number) {
  return (x: number, y: number): Vec => {
    const px = PAD + ((x - xMin) / (xMax - xMin)) * (VBW - 2 * PAD)
    const py = VBH - PAD - ((y - yMin) / (yMax - yMin)) * (VBH - 2 * PAD)
    return [px, py]
  }
}

function curvePath(xMin: number, xMax: number, toPx: (x: number, y: number) => Vec, fn: (x: number) => number, n = 140) {
  let path = ''
  for (let i = 0; i <= n; i++) {
    const x = xMin + ((xMax - xMin) * i) / n
    const [px, py] = toPx(x, fn(x))
    path += (i === 0 ? 'M' : 'L') + px.toFixed(1) + ' ' + py.toFixed(1)
  }
  return path
}

export function DerivRules() {
  const [key, setKey] = useState('power')
  const rule = RULES.find((r) => r.key === key)!
  const domainW = rule.xMax - rule.xMin
  const [x0, setX0] = useState(() => rule.xMin + domainW * 0.62)
  const svgRef = useRef<SVGSVGElement>(null)

  const cx0 = Math.max(rule.xMin + 0.02 * domainW, Math.min(rule.xMax - 0.02 * domainW, x0))
  const [yMin, yMax] = yRange(rule.f, rule.xMin, rule.xMax)
  const toPx = makeToPx(rule.xMin, rule.xMax, yMin, yMax)

  const fx0 = rule.f(cx0)
  const ruleVal = rule.ruleDeriv(cx0)
  const numVal = derivNum(rule.f, cx0)

  const curveD = curvePath(rule.xMin, rule.xMax, toPx, rule.f)
  const [px0, py0] = toPx(cx0, fx0)
  const tanSpan = domainW * 0.32
  const [tx1, ty1] = toPx(cx0 - tanSpan, fx0 - ruleVal * tanSpan)
  const [tx2, ty2] = toPx(cx0 + tanSpan, fx0 + ruleVal * tanSpan)

  function pointerToX(e: React.PointerEvent) {
    const svg = svgRef.current
    if (!svg) return
    const ctm = svg.getScreenCTM()
    if (!ctm) return
    const inv = ctm.inverse()
    const pt = new DOMPointReadOnly(e.clientX, e.clientY).matrixTransform(inv)
    const x = rule.xMin + ((pt.x - PAD) / (VBW - 2 * PAD)) * domainW
    setX0(Math.max(rule.xMin, Math.min(rule.xMax, x)))
  }

  const fmt = (v: number) => (Math.abs(v) < 0.005 ? '0.00' : v.toFixed(2))

  return (
    <AlgoShell
      slug="deriv-rules"
      lede={
        <>
          每条求导规则都是「先拆成认识的小零件，再按套路把它们的导数拼回去」。
          切换规则、拖动红点，对比<span className="k">公式算出的斜率</span>和
          <span className="k">直接数值验证的斜率</span>——规则不是要背的玄学，是能当场验货的。
        </>
      }
    >
      <div className="lab">
        <div className="controls" style={{ marginTop: 0, marginBottom: 18, borderTop: 'none', paddingTop: 0 }}>
          <div className="seg" role="tablist" aria-label="选择求导规则">
            {RULES.map((r) => (
              <button
                key={r.key}
                className={r.key === key ? 'on' : ''}
                onClick={() => { setKey(r.key); setX0(r.xMin + (r.xMax - r.xMin) * 0.62) }}
              >
                {r.name}
              </button>
            ))}
          </div>
        </div>

        <div className="lab-panels">
          <div className="lab-panel" style={{ flexBasis: '100%' }}>
            <h4>f(x) · 拖动红点选位置</h4>
            <svg
              ref={svgRef}
              viewBox={`0 0 ${VBW} ${VBH}`}
              onPointerDown={(ev) => { (ev.target as Element).setPointerCapture?.(ev.pointerId); pointerToX(ev) }}
              onPointerMove={(ev) => { if (ev.buttons) pointerToX(ev) }}
              role="img"
              aria-label="函数曲线，可拖动采样点"
            >
              {rule.xMin <= 0 && rule.xMax >= 0 && (
                <line x1={toPx(0, yMin)[0]} y1={PAD} x2={toPx(0, yMin)[0]} y2={VBH - PAD} stroke="#d9d2c4" strokeWidth={1} />
              )}
              {yMin <= 0 && yMax >= 0 && (
                <line x1={PAD} y1={toPx(0, 0)[1]} x2={VBW - PAD} y2={toPx(0, 0)[1]} stroke="#d9d2c4" strokeWidth={1} />
              )}
              <path d={curveD} fill="none" stroke="#8a8470" strokeWidth={1.8} />
              <line x1={tx1} y1={ty1} x2={tx2} y2={ty2} stroke="#d6452c" strokeWidth={1.8} />
              <circle cx={px0} cy={py0} r={6} fill="#d6452c" stroke="#faf7f0" strokeWidth={2} />
            </svg>
          </div>
        </div>

        <div className="readout">
          <div className="item">
            <span className="lbl">位置 x</span>
            <span className="val">{fmt(cx0)}</span>
          </div>
          {rule.detail(cx0).map((d) => (
            <div className="item" key={d.label}>
              <span className="lbl">{d.label}</span>
              <span className="val">{fmt(d.value)}</span>
            </div>
          ))}
          <div className="item">
            <span className="lbl">公式算出 f′(x)</span>
            <span className="val">{fmt(ruleVal)}</span>
          </div>
          <div className="item">
            <span className="lbl">数值验证 f′(x)</span>
            <span className="val">{fmt(numVal)}</span>
          </div>
        </div>
      </div>

      <p style={{ color: 'var(--ink-soft)', fontSize: 15 }}>
        <span className="k">{rule.formula}</span>　{rule.note}
      </p>

      <h2>为什么拆开算是对的</h2>
      <p>
        导数量的是「变化率」，而变化率对「加法」和「乘法」的反应方式不一样：加在一起的两股变化互不干扰，
        直接相加；乘在一起时，两个零件在同时变，任何一个的抖动都会被另一个放大，所以要把「谁在变、谁当常数」
        分两次算，再加起来。<span className="k">链式法则</span>只是把「乘法」换成了「套娃」——外层的变化率乘上
        内层的变化率，一层套一层。五条规则表面不同，骨子里都是同一件事：把复杂的变化率拆成能直接算的小块。
      </p>

      <Landing>
        神经网络的反向传播，逐层调用的正是链式法则：损失对某个参数的梯度，
        等于沿着计算图把每一层的局部导数一路乘回去。别的规则也没闲着——损失函数里的加法项对应和法则，
        注意力里的缩放点积对应乘法/商法则。
      </Landing>
    </AlgoShell>
  )
}
