import { type ReactNode, useMemo, useRef, useState } from 'react'
import { AlgoShell, Landing } from '../components/AlgoShell'

/* ────────────────────────────────────────────────────────────
   偏导数 · 两个旋钮的机器
   核心直觉：二元函数 f(x,y) 有两个能拧的旋钮。∂f/∂x 是「冻住 y，
   只拧 x」时的普通导数；∂f/∂y 反过来。

   主面板是个轴测盒子：地板是 (x,y) 平面（也就是那张地形图），
   曲面 z=f(x,y) 浮在上面，两面墙各挂一条剖面曲线。「冻住一个变量」
   在这里是看得见的一刀：沿 x 切一刀，切口贴到后墙上就是下面中间
   那张图；沿 y 切一刀，贴到左墙上就是右边那张。两条切线的斜率
   就是两个偏导数——不是新数学，是「一次只问一个方向」的老导数。

   三维不用库：自己一套轴测基 + 画家算法（按深度排序后依次绘制），
   曲面网格和剖面曲线段一起参与排序，所以山脊真的会挡住它后面的线。
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
    note: '沿 x 切一刀是条直线，沿 y 切一刀也是条直线——但斜率是对方的坐标：∂f/∂x = y，∂f/∂y = x。把点拖过任一根轴，对应那条切线就当场翻方向。',
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

const SVB_W = 300
const SVB_H = 210
const SPAD = 22
const N = 16

/* ── 三维盒子 ────────────────────────────────────────────────
   世界坐标先归一化：x、y 各自压到 [-1,1]，z 压到 [0,1.3]，
   三张曲面共用同一个画面尺寸，切换时镜头不跳。
   三根轴各对应一个固定的屏幕向量，线性组合就是投影（平行投影，无透视）。 */
// 视角有两个硬约束，都是被画面逼出来的：
// · 仰角约 35°——再低，碗的近沿会把自己的内壁挡掉一大块，切片曲线断成几截；
// · 方位角不能正对角线——正等距时马鞍面沿 y=x 的那道脊正对镜头，整个曲面塌成一个三角形。
// 所以取两轴不等长的斜二测（dimetric），跟常见三维绘图库的默认视角是一路的。
const E_U: Vec = [86, 22]     // x 轴：往右下
const E_V: Vec = [-29, 48]    // y 轴：往左下（+y 是朝观察者的方向）
const E_W = -84               // z 轴：正上
const ORG: Vec = [178, 216]
const BVB_W = 356
const BVB_H = 352
// 墙比数据范围退后不少：贴在墙上的那两条剖面得露出来才有意义，
// 墙要是紧贴曲面边缘，曲线大半会被曲面自己挡掉。
const HALF = 1.45
const W_FLOOR = -0.42         // 地板（那张地形图）挂在曲面下方
const W_TOP = 1.3
const W_SPAN = 1.15           // 曲面归一化后的高度：低了马鞍面会压扁成一片，高了碗会自遮挡
const M = 18                  // 曲面网格密度：波纹面在 14 以下会出毛刺

function pr(u: number, v: number, w: number): Vec {
  return [
    ORG[0] + u * E_U[0] + v * E_V[0],
    ORG[1] + u * E_U[1] + v * E_V[1] + w * E_W,
  ]
}
/** 深度：解 a·E_U + b·E_V + c·E_W = 0 得到的视线方向（投影的核），越大越靠近观察者。
 *  画家算法按它升序画：远的先画，近的后画盖上去。 */
const depthOf = (u: number, v: number, w: number) => 0.337 * u + v + 0.66 * w

const S2 = (p: Vec) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`
const poly2 = (pts: Vec[]) => pts.map(S2).join(' ')
const path2 = (pts: Vec[]) => pts.map((p, i) => (i ? 'L' : 'M') + S2(p)).join('')

// 曲面填色沿用站内两色：正值朱红、负值墨绿。这里要不透明，
// 半透明的话画家算法就白排了——后面的东西照样透出来。
const PAPER = [247, 242, 231]
const RED = [214, 69, 44]
const MOSS = [74, 107, 82]
function tintOf(t: number) {
  const k = 0.09 + 0.4 * Math.min(1, Math.abs(t))
  const c = t >= 0 ? RED : MOSS
  const m = (i: number) => Math.round(PAPER[i] + (c[i] - PAPER[i]) * k)
  return `rgb(${m(0)},${m(1)},${m(2)})`
}

const C_DX = '#d6452c'   // 沿 x 切的那一刀
const C_DY = '#4a6b52'   // 沿 y 切的那一刀

/* ── 线宽的单位问题 ──────────────────────────────────────────
   strokeWidth 是 viewBox 单位，会跟着图一起被缩放。这个盒子的 viewBox
   只有 356 宽，面板却按 560 渲染，等于整张图连同线宽一起放大了 1.57 倍：
   照站内惯例写的 1.8 会画成 2.8 像素，2.6 会画成 4.1 像素——比下面那两张
   2D 切片图（放大 1.20 倍）的同类线粗了将近一倍，看着就是这张图「墨太重」。

   所以这里的线宽和半径一律按「渲染后想要多少 CSS 像素」来写，再由 ink()
   把倍率除回去。站内约定：主曲线 / 切线 1.8、辅助虚线 1.2–1.4、网格 0.6–0.9。 */
const BOX_W_CSS = 560          // 面板 maxWidth，见下面 <Box3D> 外面那层 lab-panel
const ink = (cssPx: number) => +(cssPx / (BOX_W_CSS / BVB_W)).toFixed(2)

type Item = { d: number; el: ReactNode }
/** 两个各自有序的列表合并成一个有序列表——曲面网格是静态的，只有曲线每帧新建。 */
function mergeByDepth(a: Item[], b: Item[]): ReactNode[] {
  const out: ReactNode[] = []
  let i = 0
  let j = 0
  while (i < a.length || j < b.length) {
    if (j >= b.length || (i < a.length && a[i].d <= b[j].d)) out.push(a[i++].el)
    else out.push(b[j++].el)
  }
  return out
}

function Box3D({ s, zMin, zMax, cx0, cy0, onPick }: {
  s: Surface
  zMin: number
  zMax: number
  cx0: number
  cy0: number
  onPick: (x: number, y: number) => void
}) {
  const ref = useRef<SVGSVGElement>(null)
  const zSpan = zMax - zMin || 1
  const absMax = Math.max(Math.abs(zMin), Math.abs(zMax)) || 1

  const toU = (x: number) => ((x - s.xMin) / (s.xMax - s.xMin)) * 2 - 1
  const toV = (y: number) => ((y - s.yMin) / (s.yMax - s.yMin)) * 2 - 1
  const toW = (z: number) => ((z - zMin) / zSpan) * W_SPAN
  const fromU = (u: number) => s.xMin + ((u + 1) / 2) * (s.xMax - s.xMin)
  const fromV = (v: number) => s.yMin + ((v + 1) / 2) * (s.yMax - s.yMin)
  const surfPt = (x: number, y: number) => pr(toU(x), toV(y), toW(s.f(x, y)))

  // 地板上的地形图：每格是一个平行四边形，不再是正的 rect。
  const floor = useMemo(() => {
    const out: { pts: string; fill: string }[] = []
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        const u0 = -1 + (2 * i) / N
        const u1 = -1 + (2 * (i + 1)) / N
        const v0 = -1 + (2 * j) / N
        const v1 = -1 + (2 * (j + 1)) / N
        const z = s.f(fromU((u0 + u1) / 2), fromV((v0 + v1) / 2))
        const t = Math.max(-1, Math.min(1, z / absMax))
        const fill = t >= 0
          ? `rgba(214,69,44,${(0.05 + 0.45 * t).toFixed(3)})`
          : `rgba(74,107,82,${(0.05 + 0.45 * -t).toFixed(3)})`
        out.push({
          pts: poly2([pr(u0, v0, W_FLOOR), pr(u1, v0, W_FLOOR), pr(u1, v1, W_FLOOR), pr(u0, v1, W_FLOOR)]),
          fill,
        })
      }
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.key])

  // 曲面网格：每格填不透明的色 + 描边，按格心深度排好序。只随曲面变。
  const quads = useMemo(() => {
    const out: Item[] = []
    for (let i = 0; i < M; i++) {
      for (let j = 0; j < M; j++) {
        const uu = [-1 + (2 * i) / M, -1 + (2 * (i + 1)) / M]
        const vv = [-1 + (2 * j) / M, -1 + (2 * (j + 1)) / M]
        const corners: Vec[] = []
        let wSum = 0
        let zSum = 0
        for (const [a, b] of [[0, 0], [1, 0], [1, 1], [0, 1]] as [number, number][]) {
          const z = s.f(fromU(uu[a]), fromV(vv[b]))
          const w = toW(z)
          wSum += w
          zSum += z
          corners.push(pr(uu[a], vv[b], w))
        }
        const d = depthOf((uu[0] + uu[1]) / 2, (vv[0] + vv[1]) / 2, wSum / 4)
        out.push({
          d,
          el: (
            <polygon key={`q${i}-${j}`} points={poly2(corners)}
              fill={tintOf(zSum / 4 / absMax)} stroke="rgba(58,56,47,0.20)" strokeWidth={ink(0.6)} />
          ),
        })
      }
    }
    out.sort((p, q) => p.d - q.d)
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.key])

  // 曲面上的两条剖面曲线：拆成小段一起参加排序，这样山脊能真的挡住它后面的线。
  // 深度偏置取两格半：曲线贴在曲面上，光靠格心深度排序会被相邻那几格盖住（它们
  // 挡的其实是同一片连续曲面，看不出来，但曲线会断成几截）。真正的山挡在前面时，
  // 高度差贡献的深度（0.68·Δw）远大于这点偏置，该挡的还是挡得住。
  const curveSegs = useMemo(() => {
    const out: Item[] = []
    const n = 44
    const push = (x1: number, y1: number, x2: number, y2: number, color: string, key: string) => {
      const a = surfPt(x1, y1)
      const b = surfPt(x2, y2)
      const d = depthOf((toU(x1) + toU(x2)) / 2, (toV(y1) + toV(y2)) / 2,
        (toW(s.f(x1, y1)) + toW(s.f(x2, y2))) / 2) + 2.5 / M
      out.push({ d, el: <line key={key} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={color} strokeWidth={ink(1.8)} strokeLinecap="round" /> })
    }
    for (let i = 0; i < n; i++) {
      const xa = s.xMin + ((s.xMax - s.xMin) * i) / n
      const xb = s.xMin + ((s.xMax - s.xMin) * (i + 1)) / n
      push(xa, cy0, xb, cy0, C_DX, `cx${i}`)
      const ya = s.yMin + ((s.yMax - s.yMin) * i) / n
      const yb = s.yMin + ((s.yMax - s.yMin) * (i + 1)) / n
      push(cx0, ya, cx0, yb, C_DY, `cy${i}`)
    }
    out.sort((p, q) => p.d - q.d)
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.key, cx0, cy0])

  // 取点：找「投影后离光标最近的那个曲面点」。
  // 不能反解地板平面——那样点一下曲面，采样点会往后跳到曲面底下的地板上去，
  // 而人的直觉是抓着曲面上那颗黑点拖。三维里同一个屏幕位置可能对应曲面上两处
  // （前面的山挡着后面的），所以并列的候选里取靠观察者近的那个。
  function pick(e: React.PointerEvent) {
    const svg = ref.current
    if (!svg) return
    const ctm = svg.getScreenCTM()
    if (!ctm) return
    const p = new DOMPointReadOnly(e.clientX, e.clientY).matrixTransform(ctm.inverse())

    const scan = (u0: number, v0: number, half: number, steps: number) => {
      let best = { u: u0, v: v0, dist: Infinity, d: -Infinity }
      for (let i = 0; i <= steps; i++) {
        const u = Math.max(-1, Math.min(1, u0 - half + (2 * half * i) / steps))
        for (let j = 0; j <= steps; j++) {
          const v = Math.max(-1, Math.min(1, v0 - half + (2 * half * j) / steps))
          const w = toW(s.f(fromU(u), fromV(v)))
          const q = pr(u, v, w)
          const dist = Math.hypot(q[0] - p.x, q[1] - p.y)
          const d = depthOf(u, v, w)
          // 差不多近的（3px 以内）算并列，挑离观察者近的那个
          if (dist < best.dist - 3 || (dist < best.dist + 3 && d > best.d)) {
            best = { u, v, dist: Math.min(dist, best.dist), d }
          }
        }
      }
      return best
    }
    const coarse = scan(0, 0, 1, 40)
    const fine = scan(coarse.u, coarse.v, 1 / 40, 8)
    onPick(fromU(fine.u), fromV(fine.v))
  }

  const fVal = s.f(cx0, cy0)
  const u0 = toU(cx0)
  const v0 = toV(cy0)
  const w0 = toW(fVal)
  const pSurf = pr(u0, v0, w0)
  const pFloor = pr(u0, v0, W_FLOOR)
  const pWallX = pr(u0, -HALF, w0)   // 沿 x 那一刀贴在后墙上的对应点
  const pWallY = pr(-HALF, v0, w0)   // 沿 y 那一刀贴在左墙上的对应点

  // 墙上的剖面：把曲面上那条曲线的另一个坐标压平到墙面，形状原封不动。
  const wallXPath = path2(Array.from({ length: 61 }, (_, i) => {
    const x = s.xMin + ((s.xMax - s.xMin) * i) / 60
    return pr(toU(x), -HALF, toW(s.f(x, cy0)))
  }))
  const wallYPath = path2(Array.from({ length: 61 }, (_, i) => {
    const y = s.yMin + ((s.yMax - s.yMin) * i) / 60
    return pr(-HALF, toV(y), toW(s.f(cx0, y)))
  }))

  // 两条切线：斜率就是两个偏导数，画在曲面上当前点的两侧。
  const dfx = partialX(s.f, cx0, cy0)
  const dfy = partialY(s.f, cx0, cy0)
  const spanX = (s.xMax - s.xMin) * 0.24
  const spanY = (s.yMax - s.yMin) * 0.24
  const tanX: [Vec, Vec] = [
    pr(toU(cx0 - spanX), v0, toW(fVal - dfx * spanX)),
    pr(toU(cx0 + spanX), v0, toW(fVal + dfx * spanX)),
  ]
  const tanY: [Vec, Vec] = [
    pr(u0, toV(cy0 - spanY), toW(fVal - dfy * spanY)),
    pr(u0, toV(cy0 + spanY), toW(fVal + dfy * spanY)),
  ]

  return (
    <svg
      ref={ref}
      viewBox={`0 0 ${BVB_W} ${BVB_H}`}
      onPointerDown={(ev) => { (ev.target as Element).setPointerCapture?.(ev.pointerId); pick(ev) }}
      onPointerMove={(ev) => { if (ev.buttons) pick(ev) }}
      role="img"
      aria-label="二元函数曲面与两个方向的切片，可拖动采样点"
    >
      {/* 两面墙：最远的两面，先画 */}
      <polygon points={poly2([pr(-HALF, -HALF, W_FLOOR), pr(HALF, -HALF, W_FLOOR), pr(HALF, -HALF, W_TOP), pr(-HALF, -HALF, W_TOP)])}
        fill="#f3ecdd" stroke="#ddd5c5" strokeWidth={ink(0.9)} />
      <polygon points={poly2([pr(-HALF, -HALF, W_FLOOR), pr(-HALF, HALF, W_FLOOR), pr(-HALF, HALF, W_TOP), pr(-HALF, -HALF, W_TOP)])}
        fill="#ece5d4" stroke="#ddd5c5" strokeWidth={ink(0.9)} />

      {/* 墙上的两条剖面曲线：就是下面那两张 2D 切片图。
          先画实线，会被曲面挡住一部分——挡住的那截等下用淡线补一遍（工程制图里的隐藏线）。 */}
      <path d={wallXPath} fill="none" stroke={C_DX} strokeWidth={ink(1.5)} opacity={0.85} />
      <path d={wallYPath} fill="none" stroke={C_DY} strokeWidth={ink(1.5)} opacity={0.85} />

      {/* 地板 = 那张地形图 + 两道切口。地板铺到墙根，地形图只占中间的数据范围。 */}
      <polygon points={poly2([pr(-HALF, -HALF, W_FLOOR), pr(HALF, -HALF, W_FLOOR), pr(HALF, HALF, W_FLOOR), pr(-HALF, HALF, W_FLOOR)])}
        fill="#f6f1e4" stroke="#ddd5c5" strokeWidth={ink(0.9)} />
      {floor.map((c, i) => <polygon key={`f${i}`} points={c.pts} fill={c.fill} />)}
      <polygon points={poly2([pr(-1, -1, W_FLOOR), pr(1, -1, W_FLOOR), pr(1, 1, W_FLOOR), pr(-1, 1, W_FLOOR)])}
        fill="none" stroke="#cfc6b2" strokeWidth={ink(0.9)} />
      <line {...seg(pr(-1, v0, W_FLOOR), pr(1, v0, W_FLOOR))} stroke={C_DX} strokeWidth={ink(1.2)} strokeDasharray="4 3" opacity={0.75} />
      <line {...seg(pr(u0, -1, W_FLOOR), pr(u0, 1, W_FLOOR))} stroke={C_DY} strokeWidth={ink(1.2)} strokeDasharray="4 3" opacity={0.75} />
      <circle cx={pFloor[0]} cy={pFloor[1]} r={ink(4)} fill="#3a382f" opacity={0.6} />

      {/* 曲面网格与两条剖面曲线：一起按深度排序后依次画出 */}
      {mergeByDepth(quads, curveSegs)}

      {/* 当前点的两条切线，斜率 = 两个偏导数。
          和下面 2D 切片图里那两条切线是同一件东西，所以粗细也要一样（1.8 CSS px）。 */}
      <line {...seg(tanX[0], tanX[1])} stroke={C_DX} strokeWidth={ink(1.8)} />
      <line {...seg(tanY[0], tanY[1])} stroke={C_DY} strokeWidth={ink(1.8)} />

      {/* 被曲面挡住的那截墙上曲线，用淡线补回来，顺带把两个「影子点」永远留在最上层 */}
      <path d={wallXPath} fill="none" stroke={C_DX} strokeWidth={ink(1.2)} strokeDasharray="3 3" opacity={0.5} />
      <path d={wallYPath} fill="none" stroke={C_DY} strokeWidth={ink(1.2)} strokeDasharray="3 3" opacity={0.5} />

      {/* 地板 → 曲面的垂线，和「切口贴到墙上」的两条牵引线 */}
      <line {...seg(pFloor, pSurf)} stroke="#3a382f" strokeWidth={ink(0.9)} strokeDasharray="3 3" opacity={0.5} />
      <line {...seg(pSurf, pWallX)} stroke={C_DX} strokeWidth={ink(0.9)} strokeDasharray="3 3" opacity={0.6} />
      <line {...seg(pSurf, pWallY)} stroke={C_DY} strokeWidth={ink(0.9)} strokeDasharray="3 3" opacity={0.6} />
      <circle cx={pWallX[0]} cy={pWallX[1]} r={ink(4.2)} fill={C_DX} stroke="#faf7f0" strokeWidth={ink(1.2)} />
      <circle cx={pWallY[0]} cy={pWallY[1]} r={ink(4.2)} fill={C_DY} stroke="#faf7f0" strokeWidth={ink(1.2)} />
      <circle cx={pSurf[0]} cy={pSurf[1]} r={ink(6.4)} fill="#3a382f" stroke="#faf7f0" strokeWidth={ink(1.8)} />
    </svg>
  )
}

function seg(a: Vec, b: Vec) {
  return { x1: a[0].toFixed(1), y1: a[1].toFixed(1), x2: b[0].toFixed(1), y2: b[1].toFixed(1) }
}

export function PartialDerivatives() {
  const [key, setKey] = useState('bowl')
  const s = SURFACES.find((surf) => surf.key === key)!
  const [x0, setX0] = useState(() => (s.xMin + s.xMax) * 0.5 + (s.xMax - s.xMin) * 0.2)
  const [y0, setY0] = useState(() => (s.yMin + s.yMax) * 0.5 - (s.yMax - s.yMin) * 0.18)
  const sliceXRef = useRef<SVGSVGElement>(null)
  const sliceYRef = useRef<SVGSVGElement>(null)

  const cx0 = Math.max(s.xMin, Math.min(s.xMax, x0))
  const cy0 = Math.max(s.yMin, Math.min(s.yMax, y0))

  // z 值域只随所选曲面变，与拖动的采样点无关——按 key 缓存，别每帧重算。
  // 曲面配色、盒子高度、两条切片曲线的纵轴都用这同一把尺，换点位置时轴不跳。
  const { zMin, zMax } = useMemo(() => {
    let zMin = Infinity
    let zMax = -Infinity
    for (let i = 0; i <= N; i++) {
      for (let j = 0; j <= N; j++) {
        const v = s.f(s.xMin + ((s.xMax - s.xMin) * i) / N, s.yMin + ((s.yMax - s.yMin) * j) / N)
        if (v < zMin) zMin = v
        if (v > zMax) zMax = v
      }
    }
    return { zMin, zMax }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  const zPad = (zMax - zMin) * 0.12 || 0.5

  const toPxX = makeToPx(s.xMin, s.xMax, zMin - zPad, zMax + zPad, SVB_W, SVB_H, SPAD)
  const toPxY = makeToPx(s.yMin, s.yMax, zMin - zPad, zMax + zPad, SVB_W, SVB_H, SPAD)

  const fVal = s.f(cx0, cy0)
  const dfx = partialX(s.f, cx0, cy0)
  const dfy = partialY(s.f, cx0, cy0)

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
          <span className="k">∂f/∂y</span> 反过来。在盒子的地板上拖动采样点，看曲面被切出的两条曲线怎么变——
          它们贴到两面墙上，就是下面那两张只让你拧一个旋钮的切片图。
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

        <div className="lab-panel" style={{ maxWidth: 560, margin: '0 auto 6px' }}>
          <h4>曲面 z = f(x,y) · 在地板上拖动采样点</h4>
          <Box3D s={s} zMin={zMin} zMax={zMax} cx0={cx0} cy0={cy0} onPick={(x, y) => { setX0(x); setY0(y) }} />
        </div>

        <div className="legend" style={{ justifyContent: 'center', marginBottom: 14 }}>
          <span><i style={{ background: C_DX }} />沿 x 切的一刀 → 后墙</span>
          <span><i style={{ background: C_DY }} />沿 y 切的一刀 → 左墙</span>
          <span><i style={{ background: '#3a382f' }} />当前点 (x, y, f)</span>
        </div>

        <div className="lab-panels">
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
              <line x1={tyx1} y1={tyy1} x2={tyx2} y2={tyy2} stroke={C_DY} strokeWidth={1.8} />
              <circle cx={ypx} cy={ypy} r={6} fill={C_DY} stroke="#faf7f0" strokeWidth={2} />
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
        地板上那两条虚线就是被冻住的那道「切口」：朱红那条把曲面竖着切开，切口的形状浮在曲面上，
        再贴到后墙上就成了一条普通的一元曲线；墨绿那条同理，贴在左墙上。切两刀，两个方向的陡度就都有了。
      </p>
      <p>
        盒子还顺手说清一件容易混的事：<strong>偏导数只管自己那一刀，别的方向要另外算</strong>。
        马鞍面上两刀切出来都是直线，一条上升一条下降（谁升谁降只看你站在哪个象限），
        可曲面本身是弯的。想知道「斜着走会怎样」，光把两个数加起来是不对的，
        得把它们打包成梯度，再和方向做点积。
      </p>

      <Landing>
        梯度 <span className="k">∇f = (∂f/∂x, ∂f/∂y)</span> 就是把这两个偏导数打包成一个向量，
        它指向的正是「同时拧两个旋钮、上升最快」的方向——下一站梯度场要画的就是这支箭头。
        深度学习里每个参数的梯度，本质上也只是「冻住其它所有参数，单看这一个」的偏导数。
      </Landing>
    </AlgoShell>
  )
}
