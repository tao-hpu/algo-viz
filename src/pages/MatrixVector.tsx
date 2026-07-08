import { useRef, useState } from 'react'
import { AlgoShell, Landing } from '../components/AlgoShell'

/* ────────────────────────────────────────────────────────────
   矩阵乘向量 · 贡献加总
   核心直觉：A·v 不是什么神秘运算，v=(x,y) 先拆成 x·e₁ + y·e₂，
   矩阵只需要告诉你「e₁ 落在哪、e₂ 落在哪」（也就是它的两列），
   剩下的就是把这两份贡献按 x、y 的比例加起来。雅可比矩阵是这件
   事的「局部、弯曲」版本，这页先把「全局、笔直」的版本焊实。
   ──────────────────────────────────────────────────────────── */

type Vec = [number, number]
type Mat = [[number, number], [number, number]]
type MatDef = { key: string; name: string; m: Mat; note: string }

const MATS: MatDef[] = [
  {
    key: 'rot',
    name: '旋转 45°',
    m: [[Math.cos(Math.PI / 4), -Math.sin(Math.PI / 4)], [Math.sin(Math.PI / 4), Math.cos(Math.PI / 4)]],
    note: '旋转矩阵不拉伸、只转向：det=1，面积一点没变。',
  },
  {
    key: 'scale',
    name: '缩放',
    m: [[1.6, 0], [0, 0.6]],
    note: '对角矩阵各管一根轴：x 方向拉伸到 1.6 倍，y 方向压缩到 0.6 倍，互不干扰。',
  },
  {
    key: 'shear',
    name: '剪切',
    m: [[1, 0.8], [0, 1]],
    note: 'e₂ 被 e₁ 拽着斜向一边，e₁ 自己没动——这是剪切矩阵的签名：对角线是 1。',
  },
]

const VBW = 320
const R_IN = 1.6
const R_OUT = 3.2
const C = VBW / 2
const S = 92

function toPxIn(x: number, y: number): Vec { return [C + (x / R_IN) * S, C - (y / R_IN) * S] }
function toPxOut(x: number, y: number): Vec { return [C + (x / R_OUT) * S, C - (y / R_OUT) * S] }

function gridLines(R: number, step: number) {
  const ticks: number[] = []
  for (let v = -Math.ceil(R / step) * step; v <= R + 1e-9; v += step) ticks.push(+v.toFixed(4))
  return ticks
}

function arrowHeadPts(x1: number, y1: number, x2: number, y2: number, size = 8) {
  const angle = Math.atan2(y2 - y1, x2 - x1)
  const spread = 0.48
  const bx1 = x2 - size * Math.cos(angle - spread)
  const by1 = y2 - size * Math.sin(angle - spread)
  const bx2 = x2 - size * Math.cos(angle + spread)
  const by2 = y2 - size * Math.sin(angle + spread)
  return `${x2.toFixed(1)},${y2.toFixed(1)} ${bx1.toFixed(1)},${by1.toFixed(1)} ${bx2.toFixed(1)},${by2.toFixed(1)}`
}

// 网格线与原点只由固定的坐标范围决定，与拖动的向量无关——模块级算一次。
const vLinesIn = gridLines(R_IN, 0.4)
const vLinesOut = gridLines(R_OUT, 0.8)
const origin = toPxIn(0, 0)
const originOut = toPxOut(0, 0)

function Arrow({ from, to, color, width = 2, dashed = false, opacity = 1 }: {
  from: Vec; to: Vec; color: string; width?: number; dashed?: boolean; opacity?: number
}) {
  const [x1, y1] = from
  const [x2, y2] = to
  return (
    <g opacity={opacity}>
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth={width} strokeDasharray={dashed ? '4 3' : undefined} />
      <polygon points={arrowHeadPts(x1, y1, x2, y2)} fill={color} />
    </g>
  )
}

export function MatrixVector() {
  const [key, setKey] = useState('rot')
  const mat = MATS.find((m) => m.key === key)!
  const [v, setV] = useState<Vec>([1.1, 0.65])
  const svgRef = useRef<SVGSVGElement>(null)
  const [x, y] = v

  const [[a, b], [c, d]] = mat.m
  const Av: Vec = [a * x + b * y, c * x + d * y]
  const Ae1: Vec = [a, c]
  const Ae2: Vec = [b, d]
  const c1: Vec = [x * a, x * c]
  const c2: Vec = [y * b, y * d]

  function pointerToMath(e: React.PointerEvent) {
    const svg = svgRef.current
    if (!svg) return
    const ctm = svg.getScreenCTM()
    if (!ctm) return
    const inv = ctm.inverse()
    const pt = new DOMPointReadOnly(e.clientX, e.clientY).matrixTransform(inv)
    let nx = ((pt.x - C) / S) * R_IN
    let ny = (-(pt.y - C) / S) * R_IN
    nx = Math.max(-R_IN, Math.min(R_IN, nx))
    ny = Math.max(-R_IN, Math.min(R_IN, ny))
    setV([+nx.toFixed(3), +ny.toFixed(3)])
  }

  const fmt = (n: number) => (Math.abs(n) < 0.005 ? '0.00' : n.toFixed(2))

  return (
    <AlgoShell
      slug="matrix-vector"
      lede={
        <>
          A·v 不是玄学。任何向量都能拆成 <span className="k">v = x·e₁ + y·e₂</span>，矩阵 A 只需要记住
          「e₁ 落到哪、e₂ 落到哪」——也就是它的两列。剩下的事就是按 x、y 的比例把这两份贡献加总。
          拖动左边的红点，看右边两截灰箭头怎么头尾相接，拼出最终的红色箭头。
        </>
      }
    >
      <div className="lab">
        <div className="controls" style={{ marginTop: 0, marginBottom: 18, borderTop: 'none', paddingTop: 0 }}>
          <div className="seg" role="tablist" aria-label="选择矩阵">
            {MATS.map((m) => (
              <button key={m.key} className={m.key === key ? 'on' : ''} onClick={() => setKey(m.key)}>
                {m.name}
              </button>
            ))}
          </div>
        </div>

        <div className="lab-panels">
          <div className="lab-panel">
            <h4>输入向量 v · 拖动红点</h4>
            <svg
              ref={svgRef}
              viewBox={`0 0 ${VBW} ${VBW}`}
              onPointerDown={(ev) => { (ev.target as Element).setPointerCapture?.(ev.pointerId); pointerToMath(ev) }}
              onPointerMove={(ev) => { if (ev.buttons) pointerToMath(ev) }}
              role="img"
              aria-label="输入平面，可拖动向量终点"
            >
              {vLinesIn.map((val) => {
                const [x1, y1] = toPxIn(val, -R_IN)
                const [x2, y2] = toPxIn(val, R_IN)
                const [x3, y3] = toPxIn(-R_IN, val)
                const [x4, y4] = toPxIn(R_IN, val)
                return (
                  <g key={val} stroke="#d9d2c4" strokeWidth={val === 0 ? 1.4 : 0.7}>
                    <line x1={x1} y1={y1} x2={x2} y2={y2} />
                    <line x1={x3} y1={y3} x2={x4} y2={y4} />
                  </g>
                )
              })}
              <line x1={origin[0]} y1={origin[1]} x2={toPxIn(x, 0)[0]} y2={toPxIn(x, 0)[1]} stroke="#9a968a" strokeWidth={1} strokeDasharray="3 3" />
              <line x1={toPxIn(x, 0)[0]} y1={toPxIn(x, 0)[1]} x2={toPxIn(x, y)[0]} y2={toPxIn(x, y)[1]} stroke="#9a968a" strokeWidth={1} strokeDasharray="3 3" />
              <Arrow from={origin} to={toPxIn(x, y)} color="#d6452c" width={2.2} />
            </svg>
          </div>

          <div className="lab-panel">
            <h4>输出 Av · 贡献怎么加总</h4>
            <svg viewBox={`0 0 ${VBW} ${VBW}`} role="img" aria-label="输出平面，展示列向量贡献的加总">
              {vLinesOut.map((val) => {
                const [x1, y1] = toPxOut(val, -R_OUT)
                const [x2, y2] = toPxOut(val, R_OUT)
                const [x3, y3] = toPxOut(-R_OUT, val)
                const [x4, y4] = toPxOut(R_OUT, val)
                return (
                  <g key={val} stroke="#ddd6c8" strokeWidth={val === 0 ? 1.2 : 0.6}>
                    <line x1={x1} y1={y1} x2={x2} y2={y2} />
                    <line x1={x3} y1={y3} x2={x4} y2={y4} />
                  </g>
                )
              })}
              {/* 参考：矩阵原样的两列（虚线，未按 x,y 缩放） */}
              <Arrow from={originOut} to={toPxOut(...Ae1)} color="#9a968a" width={1.3} dashed opacity={0.7} />
              <Arrow from={originOut} to={toPxOut(...Ae2)} color="#9a968a" width={1.3} dashed opacity={0.7} />
              {/* 按 x,y 缩放后的两份贡献，头尾相接 */}
              <Arrow from={originOut} to={toPxOut(...c1)} color="#4a6b52" width={1.8} />
              <Arrow from={toPxOut(...c1)} to={toPxOut(c1[0] + c2[0], c1[1] + c2[1])} color="#4a6b52" width={1.8} />
              {/* 最终结果 */}
              <Arrow from={originOut} to={toPxOut(...Av)} color="#d6452c" width={2.4} />
            </svg>
          </div>
        </div>

        <div className="readout">
          <div className="item">
            <span className="lbl">v = (x, y)</span>
            <span className="val">({fmt(x)}, {fmt(y)})</span>
          </div>
          <div className="item">
            <span className="lbl">A</span>
            <span className="matrix-box">
              [ {fmt(a)}&nbsp;&nbsp;{fmt(b)} ]<br />
              [ {fmt(c)}&nbsp;&nbsp;{fmt(d)} ]
            </span>
          </div>
          <div className="item" style={{ justifyContent: 'center' }}>
            <span className="lbl">x·Ae₁ + y·Ae₂ = Av</span>
            <span className="val">({fmt(Av[0])}, {fmt(Av[1])})</span>
          </div>
        </div>
      </div>

      <p style={{ color: 'var(--ink-soft)', fontSize: 15 }}>{mat.note}</p>

      <h2>为什么「加总」就够了</h2>
      <p>
        矩阵乘向量的定义看着像一堆下标，其实就是一句话：<span className="k">A·v = x·(A 的第一列) + y·(A 的第二列)</span>。
        灰色虚线箭头是矩阵原样的两列（也就是 e₁、e₂ 落到哪去了）；墨绿色的两截箭头把它们按 x、y 的比例缩放，
        再头尾相接；红色箭头就是把两截线段首尾拼起来的终点——这就是矩阵乘法，没有更多了。
      </p>
      <p>
        这也是为什么「矩阵」和「线性变换」是同一件事：只要知道基向量 e₁、e₂ 落到哪，
        任何输入向量的去向都能靠这两份贡献线性拼出来，不需要对每个新的 v 重新算一遍。
      </p>

      <Landing>
        全连接层的一次前向传播 <span className="k">y = Wx</span> 就是这张图放大到几百上千维：
        每个输出神经元都是输入向量在 W 某一行方向上的加权加总。雅可比矩阵是这套逻辑的「局部」版本——
        对一个会弯的映射，在一点附近它也能被拆成「若干列贡献相加」，只是这些列会随位置改变。
      </Landing>
    </AlgoShell>
  )
}
