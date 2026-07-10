import { useMemo, useState, type ReactNode } from 'react'
import { AlgoShell, Landing } from '../components/AlgoShell'
import { Player } from '../components/Player'
import { usePlayer } from '../lib/player'

/* ────────────────────────────────────────────────────────────
   最短路 · Dijkstra
   核心直觉：手里有一堆「暂定距离」，每一轮挑出最小的那个敲定，
   再拿它去更新邻居。挑最小的之所以能直接敲定，是因为边权非负：
   任何绕远的走法都得先跨过一个比它还远的点，只会更长。
   把所有权重设成 1，优先队列的出队顺序就退化成先进先出，
   Dijkstra 一步不改地变回 BFS。切一下「边权」那个开关就能看见。
   ──────────────────────────────────────────────────────────── */

type Kind = 'init' | 'pick' | 'relax-ok' | 'relax-skip' | 'done'

interface Frame {
  dist: number[]
  prev: number[]
  visited: boolean[]
  current: number
  edge: [number, number] | null
  relaxed: number   // 松弛成功次数（累计）
  checked: number   // 检查过的边数（累计）
  kind: Kind
  note: ReactNode
}

// 手调坐标：3×3 网格轻微抖动，只连相邻格 + 两条不出格的对角线，
// 这样 14 条边彼此不交叉，权重标签也不会压在别的线上。
const NODES = [
  { n: 'A', x: 62, y: 62, lx: 0, ly: -26, anchor: 'middle' },
  { n: 'B', x: 268, y: 50, lx: 0, ly: -26, anchor: 'middle' },
  { n: 'C', x: 470, y: 72, lx: 0, ly: -26, anchor: 'middle' },
  { n: 'D', x: 52, y: 186, lx: -25, ly: 5, anchor: 'end' },
  { n: 'E', x: 266, y: 190, lx: -24, ly: 32, anchor: 'end' },
  { n: 'F', x: 478, y: 178, lx: 24, ly: 5, anchor: 'start' },
  { n: 'G', x: 72, y: 312, lx: 0, ly: 34, anchor: 'middle' },
  { n: 'H', x: 276, y: 302, lx: 0, ly: 34, anchor: 'middle' },
  { n: 'I', x: 470, y: 300, lx: 25, ly: 6, anchor: 'start' },
] as const

const N = NODES.length
const SRC_DEFAULT = 0 // A
const DST = 8         // I

const EDGES: ReadonlyArray<readonly [number, number]> = [
  [0, 1], [1, 2],           // A-B, B-C
  [3, 4], [4, 5],           // D-E, E-F
  [6, 7], [7, 8],           // G-H, H-I
  [0, 3], [1, 4], [2, 5],   // A-D, B-E, C-F
  [3, 6], [4, 7], [5, 8],   // D-G, E-H, F-I
  [0, 4], [4, 8],           // A-E, E-I（两条对角线，各自待在一个格子里）
]

const W_DEFAULT = [4, 8, 3, 6, 7, 2, 2, 5, 1, 9, 4, 3, 7, 5]

const PAPER = '#faf7f0'
const RED = '#d6452c'
const RED_INK = '#b5391f'
const MOSS = '#4a6b52'
const LINE = '#c9c2b2'
const FAINT = '#9a968a'

const nm = (i: number) => NODES[i].n
const fmtDist = (v: number) => (v === Infinity ? '∞' : String(v))
const ekey = (u: number, v: number) => (u < v ? `${u}-${v}` : `${v}-${u}`)

// 朴素 O(V²)：每轮线性扫一遍找最小。9 个点用不上二叉堆。
function buildFrames(src: number, w: number[]): Frame[] {
  const adj: Array<Array<[number, number]>> = NODES.map(() => [])
  EDGES.forEach(([u, v], i) => {
    adj[u].push([v, w[i]])
    adj[v].push([u, w[i]])
  })

  const dist = Array<number>(N).fill(Infinity)
  const prev = Array<number>(N).fill(-1)
  const visited = Array<boolean>(N).fill(false)
  dist[src] = 0
  let relaxed = 0
  let checked = 0
  const frames: Frame[] = []

  // 每帧都存一份深拷贝，倒放和拖进度条才不会读到后来被改掉的数组。
  const snap = (current: number, edge: [number, number] | null, kind: Kind, note: ReactNode) => {
    frames.push({
      dist: dist.slice(), prev: prev.slice(), visited: visited.slice(),
      current, edge, relaxed, checked, kind, note,
    })
  }

  snap(src, null, 'init', <>起点 {nm(src)} 的暂定距离是 0，其余全是 ∞。谁都还没敲定。</>)

  for (;;) {
    let u = -1
    for (let i = 0; i < N; i++) if (!visited[i] && dist[i] < Infinity && (u < 0 || dist[i] < dist[u])) u = i
    if (u < 0) break
    visited[u] = true

    snap(u, null, 'pick',
      u === src
        ? <>起点 {nm(u)} 的暂定距离 0 已经不可能更小，敲定它，从这里出发。</>
        : <>未确定的节点里 {nm(u)} 的暂定距离最小（<em>{dist[u]}</em>），敲定它。从此 {nm(u)} 的 {dist[u]} 不会再变。</>,
    )

    if (u === DST) {
      const path: string[] = []
      for (let k = DST; k >= 0; k = prev[k]) path.unshift(nm(k))
      snap(u, null, 'done',
        <span className="done">终点 {nm(DST)} 敲定，最短距离 {dist[DST]}，路径 {path.join(' → ')}</span>)
      return frames
    }

    for (const [v, wt] of adj[u]) {
      if (visited[v]) continue // 已敲定的邻居不可能再变短，跳过
      checked++
      const cand = dist[u] + wt
      if (cand < dist[v]) {
        const old = dist[v]
        dist[v] = cand
        prev[v] = u
        relaxed++
        snap(u, [u, v], 'relax-ok',
          <>松弛边 {nm(u)}→{nm(v)}：<em>{dist[u]} + {wt} = {cand} &lt; {fmtDist(old)}</em>，{nm(v)} 的暂定距离更新为 {cand}</>)
      } else {
        snap(u, [u, v], 'relax-skip',
          <>松弛边 {nm(u)}→{nm(v)}：{dist[u]} + {wt} = {cand}，不比 {nm(v)} 现在的 {dist[v]} 短，跳过</>)
      }
    }
  }

  snap(-1, null, 'done', <span className="done">所有能到的节点都敲定了，终点 {nm(DST)} 走不到。</span>)
  return frames
}

export function Dijkstra() {
  const [src, setSrc] = useState<number>(SRC_DEFAULT)
  const [weights, setWeights] = useState<number[]>(W_DEFAULT)
  const [unit, setUnit] = useState(false)

  const w = useMemo(() => (unit ? EDGES.map(() => 1) : weights), [unit, weights])
  const frames = useMemo(() => buildFrames(src, w), [src, w])
  const p = usePlayer(frames.length, 4)
  const f = frames[p.i]

  // total 可能不变（换起点后帧数一样多），所以在 handler 里手动回第 0 帧。
  const restart = (fn: () => void) => { fn(); p.reset() }

  // 终点敲定的那一帧，把 A→I 这条路径上的边挑出来单独描粗。
  const pathEdges = useMemo(() => {
    const s = new Set<string>()
    if (f.kind !== 'done' || f.dist[DST] === Infinity) return s
    for (let k = DST; f.prev[k] >= 0; k = f.prev[k]) s.add(ekey(f.prev[k], k))
    return s
  }, [f])

  const active = f.edge
  const settled = f.visited.filter(Boolean).length
  const justRelaxed = f.kind === 'relax-ok' && active ? active[1] : -1

  const distColor = (i: number) =>
    i === justRelaxed ? RED_INK : f.visited[i] ? MOSS : f.dist[i] === Infinity ? FAINT : 'var(--ink-soft)'

  return (
    <AlgoShell
      slug="dijkstra"
      lede={
        <>
          地图上每条路有长有短，怎么找最省的那条？Dijkstra 的答案朴素得过分：手里攥着一堆
          <span className="k">暂定距离</span>，每轮挑最小的那个敲定，再拿它去更新邻居。
          点任一节点换起点，或者把边权全部拨成 1，看它怎么原地变回 BFS。
        </>
      }
    >
      <div className="lab">
        <div className="controls" style={{ marginTop: 0, marginBottom: 18, borderTop: 'none', paddingTop: 0 }}>
          <div className="seg" role="tablist" aria-label="选择边权">
            <button className={unit ? '' : 'on'} onClick={() => restart(() => setUnit(false))}>原始权重</button>
            <button className={unit ? 'on' : ''} onClick={() => restart(() => setUnit(true))}>全部权重 = 1</button>
          </div>
          <div style={{ fontSize: 13.5, color: 'var(--ink-soft)' }}>
            起点 <b style={{ color: RED_INK }}>{nm(src)}</b> · 终点 <b style={{ color: RED_INK }}>{nm(DST)}</b>
            ，点击任一节点可换起点
          </div>
        </div>

        <svg viewBox="0 0 560 370" role="img" aria-label={`九个节点的带权无向图，起点 ${nm(src)}，终点 ${nm(DST)}。点击任一节点可将其设为起点并重跑算法。当前步骤的文字说明在图下方。`}>
          {EDGES.map(([u, v], i) => {
            const key = ekey(u, v)
            const isPath = pathEdges.has(key)
            const isActive = !!active && ekey(active[0], active[1]) === key
            // prev 在松弛成功的那一刻就写了，可那时距离还只是「暂定」，之后可能改挂别的父亲。
            // 只有节点被敲定，它那条 prev 边才真正属于最短路径树，才配用墨绿。
            const isTree = (f.visited[v] && f.prev[v] === u) || (f.visited[u] && f.prev[u] === v)
            const stroke = isPath || isActive ? RED : isTree ? MOSS : LINE
            const width = isPath ? 4.2 : isActive ? 3.2 : isTree ? 2.6 : 1.4
            const a = NODES[u]
            const b = NODES[v]
            const mx = (a.x + b.x) / 2
            const my = (a.y + b.y) / 2
            return (
              <g key={key}>
                <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={stroke} strokeWidth={width} strokeLinecap="round" />
                {/* 纸色垫底，否则边线会从数字中间穿过去 */}
                <circle cx={mx} cy={my} r={9.5} fill={PAPER} />
                <text x={mx} y={my + 3.8} textAnchor="middle" fontSize={11}
                  fontFamily="var(--font-mono)" fill={isPath || isActive ? RED_INK : 'var(--ink-soft)'}>
                  {w[i]}
                </text>
              </g>
            )
          })}

          {NODES.map((nd, i) => {
            const isCurrent = i === f.current && f.kind !== 'done'
            const known = f.visited[i]
            const onFringe = !known && f.dist[i] < Infinity
            const fill = isCurrent ? RED : known ? MOSS : onFringe ? 'rgba(214,69,44,0.12)' : PAPER
            const stroke = isCurrent || onFringe ? RED : known ? MOSS : LINE
            const solid = isCurrent || known
            return (
              <g key={nd.n} onClick={() => restart(() => setSrc(i))} style={{ cursor: 'pointer' }}>
                <circle cx={nd.x} cy={nd.y} r={17} fill={fill} stroke={stroke} strokeWidth={2} />
                <text x={nd.x} y={nd.y + 5} textAnchor="middle" fontSize={14} fontWeight={600}
                  fontFamily="var(--font-mono)" fill={solid ? PAPER : 'var(--ink)'}>
                  {nd.n}
                </text>
                <text x={nd.x + nd.lx} y={nd.y + nd.ly} textAnchor={nd.anchor} fontSize={12.5}
                  fontFamily="var(--font-mono)" fontWeight={i === justRelaxed ? 700 : 400} fill={distColor(i)}>
                  {fmtDist(f.dist[i])}
                </text>
              </g>
            )
          })}
        </svg>

        <div className="legend">
          <span><i style={{ background: RED }} />当前敲定的节点 / 正在松弛的边</span>
          <span><i style={{ background: MOSS }} />距离已敲定 · 最短路径树</span>
          <span><i style={{ background: 'rgba(214,69,44,0.35)' }} />边界：有暂定距离，还没敲定</span>
          <span><i style={{ background: LINE }} />还没碰过的边</span>
        </div>

        <div className="step-note">{f.note}</div>

        <Player
          p={p}
          extra={
            <button className="btn" onClick={() => restart(() => setWeights(EDGES.map(() => 1 + Math.floor(Math.random() * 9))))}>
              随机权重
            </button>
          }
        />

        <div className="readout">
          <div className="item">
            <span className="lbl">已确定节点数</span>
            <span className="val">{settled} / {N}</span>
          </div>
          <div className="item">
            <span className="lbl">松弛成功次数</span>
            <span className="val">{f.relaxed}</span>
          </div>
          <div className="item">
            <span className="lbl">检查过的边数</span>
            <span className="val">{f.checked}</span>
          </div>
          <div className="item">
            <span className="lbl">到终点 {nm(DST)} 的最短距离</span>
            <span className="val">{fmtDist(f.dist[DST])}{f.visited[DST] ? '' : f.dist[DST] === Infinity ? '' : ' (暂定)'}</span>
          </div>
          <div className="item" style={{ flexBasis: '100%' }}>
            <span className="lbl">暂定距离表 dist（墨绿=已敲定，朱红=这一步刚更新）</span>
            <span className="matrix-box">
              {NODES.map((nd, i) => (
                <span key={nd.n} style={{
                  display: 'inline-block', minWidth: '4.2em',
                  color: distColor(i), fontWeight: i === justRelaxed ? 700 : 400,
                }}>
                  {nd.n}:{fmtDist(f.dist[i])}
                </span>
              ))}
            </span>
          </div>
        </div>
      </div>

      <h2>每一步只有两件事</h2>
      <p>
        从还没敲定的节点里挑一个暂定距离最小的，敲定它；然后拿它去松弛所有邻居：
        <span className="k">if (dist[u] + w &lt; dist[v]) dist[v] = dist[u] + w</span>。
        松弛就是「借道 u 走过去更近吗」这一句问话，答是就改写 <span className="k">dist[v]</span> 并记下
        <span className="k">prev[v] = u</span>。所有 <span className="k">prev</span> 连起来，就是那棵墨绿色的最短路径树。
        注意「敲定」是不可撤销的：一个节点被挑出来之后，它的距离再也不会被任何后来的松弛改动。
      </p>

      <h2>凭什么挑最小的就能直接敲定</h2>
      <p>
        设 <span className="k">u</span> 是当前暂定距离最小的未敲定节点。任何一条还没被算进来的、通往 u 的路，
        都必须先从已敲定的区域跨出来，落到某个未敲定的节点 <span className="k">v</span> 上。而 v 也是未敲定的，
        所以 <span className="k">dist[v] ≥ dist[u]</span>；从 v 再走到 u，只会更长。既然绕路不可能更短，
        <span className="k">dist[u]</span> 就已经是最终答案。
      </p>
      <p>
        整个论证压在一个前提上：<strong>边权非负</strong>。多走一段路不可能让总长变短，所以「先到的一定最短」。
        这个前提一旦破掉，贪心立刻失效。
      </p>

      <h2>负权一来就塌</h2>
      <p>
        三个点：<span className="k">A→B</span> 权 2，<span className="k">A→C</span> 权 5，<span className="k">C→B</span> 权 −4。
        Dijkstra 第一轮就把 B 敲定成 2，因为 2 是当时最小的。可真正的最短路是 <span className="k">A→C→B = 1</span>。
        它敲定得太早了，而敲定又不可撤销。负权的图要换 Bellman-Ford：那个算法不挑最小的，
        而是老老实实把每条边反复松弛 V−1 轮，用时间换掉这个前提。
      </p>

      <h2>优先队列，以及它和 BFS 的关系</h2>
      <p>
        「每轮找暂定距离最小的节点」朴素做法是线性扫一遍，<span className="k">O(V)</span> 一轮、
        <span className="k">O(V²)</span> 一共。这一页 9 个点就是这么写的。换成二叉堆，
        取最小和更新距离都是 <span className="k">O(log V)</span>，总共 <span className="k">O(E log V)</span>。
        图稀疏的时候后者快得多，这也是「Dijkstra 要配优先队列」这句话的全部来历：
        队列本身不改变算法，只是让「找最小」这一步不必每次从头扫。
      </p>
      <p>
        现在把所有边权拨成 1。暂定距离只可能取 0、1、2、…… 这一串连续整数，优先队列的出队顺序
        和一个普通的先进先出队列一模一样：先弹完所有距离 1 的，再弹距离 2 的。这正是
        <strong>上一页 BFS 一圈一圈往外铺</strong>的样子。<strong>BFS 是 Dijkstra 在边权全相等时的特例</strong>，
        切一下上面那个开关就能亲眼看见。
      </p>

      <Landing>
        导航软件算路线走的就是这一套；A* 无非是给 Dijkstra 的优先队列加一个「朝着目标方向偏心」的启发式，
        让它少往反方向铺。OSPF 路由协议里，每台路由器拿到全网链路状态之后，各自跑一遍 Dijkstra 得出自己的转发表。
        游戏里的寻路、技能范围的可达格子，底下也是同一个循环：挑最小，松弛邻居。
      </Landing>
    </AlgoShell>
  )
}
