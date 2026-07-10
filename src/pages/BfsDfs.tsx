import { useMemo, useState } from 'react'
import { AlgoShell, Landing } from '../components/AlgoShell'
import { Player } from '../components/Player'
import { usePlayer } from '../lib/player'

/* ────────────────────────────────────────────────────────────
   广度优先 / 深度优先 · 一层层铺开，还是一条道走到黑
   核心直觉：两个算法的代码逐字相同，只差一行：手里那袋待访问的
   格子，是从头上取，还是从尾上取。从头取（先进先出）就摊成一圈
   圈同心波纹，第一次碰到终点必是最短路；从尾取（后进先出）就扎
   成一条长蛇，撞墙才回头，碰到终点纯属先撞上而已。
   下面那条队列格子带把这件事画出来了：切换模式时，只有「出口箭
   头」从左端跳到右端，别的什么都没变。
   ──────────────────────────────────────────────────────────── */

type Mode = 'bfs' | 'dfs'

interface Frame {
  current: number      // 这一帧弹出的格子；-1 表示还没开始 / 已结束
  open: number[]       // 待访问袋子，已剔除「早就走过」的陈旧条目
  visited: boolean[]
  order: number[]      // 访问序号，-1 = 没走过
  parent: number[]
  found: boolean
  path: number[]
  em: string           // step-note 里高亮的那半句
  note: string
}

const W = 17
const H = 11
const N = W * H
const START = 1 * W + 1   // (1, 1)
const GOAL = 9 * W + 15   // (15, 9)

const CELL = 26
const PAD = 6
const GVW = W * CELL + PAD * 2
const GVH = H * CELL + PAD * 2

const RED = '#d6452c'
const RED_INK = '#b5391f'
const MOSS = '#4a6b52'
const WALL = '#6d6a60'
const PAPER = '#faf7f0'
const LINE = '#d9d2c4'
const FAINT = '#9a968a'

const col = (i: number) => i % W
const row = (i: number) => Math.floor(i / W)
const cx = (i: number) => PAD + col(i) * CELL
const cy = (i: number) => PAD + row(i) * CELL

// 邻居顺序写死成 上 右 下 左：同样的墙必然跑出同样的帧，方便反复对照。
const DIRS: ReadonlyArray<readonly [number, number]> = [[-1, 0], [0, 1], [1, 0], [0, -1]]

function neighbors(i: number): number[] {
  const r = row(i)
  const c = col(i)
  const out: number[] = []
  for (const [dr, dc] of DIRS) {
    const nr = r + dr
    const nc = c + dc
    if (nr >= 0 && nr < H && nc >= 0 && nc < W) out.push(nr * W + nc)
  }
  return out
}

function buildFrames(mode: Mode, walls: boolean[]): { frames: Frame[]; totalVisited: number } {
  const visited = new Array<boolean>(N).fill(false)
  const order = new Array<number>(N).fill(-1)
  const parent = new Array<number>(N).fill(-1)
  // 袋子里存「格子」，from 里存「谁把它推进来的」；父亲等到弹出那一刻才认。
  // 这样 DFS 的 parent 链就是真正走过的那条深路，而不是某个早期兄弟节点。
  const open: number[] = [START]
  const from: number[] = [-1]
  const frames: Frame[] = []
  let rank = 0

  // 袋子里同一个格子可能有好几份（几个邻居各推了一次），但真正会被处理的只有一份：
  // BFS 从左端出，算最早那条；DFS 从右端出，算最晚那条。其余的弹出时撞上 visited 就丢了。
  // 画到袋子带上、数进 readout 的都只能是这一份，否则数字和网格上的高亮格子对不上。
  const liveOpen = (): number[] => {
    const seen = new Set<number>()
    const out: number[] = []
    const idx = mode === 'bfs'
      ? open.map((_, k) => k)
      : open.map((_, k) => open.length - 1 - k)
    for (const k of idx) {
      const n = open[k]
      if (visited[n] || seen.has(n)) continue
      seen.add(n)
      out.push(n)
    }
    if (mode === 'dfs') out.reverse() // 还原成「左边旧、右边新」，出口箭头才对得上右端
    return out
  }

  // 每一帧都是全新副本，播放器随便倒放拖拽都不会串状态。
  const snap = (current: number, em: string, note: string, found: boolean, path: number[]): Frame => ({
    current,
    open: liveOpen(),
    visited: visited.slice(),
    order: order.slice(),
    parent: parent.slice(),
    found,
    path,
    em,
    note,
  })

  frames.push(snap(-1, '', '起点进袋，等着被弹出。', false, []))

  while (open.length) {
    // ★ 两个算法唯一的区别就在这一行：从头取，还是从尾取。
    const cur = mode === 'bfs' ? open.shift()! : open.pop()!
    const par = mode === 'bfs' ? from.shift()! : from.pop()!

    if (visited[cur]) continue // 同一个格子可能被几个邻居各推进来一次，后来者直接丢掉

    visited[cur] = true
    order[cur] = rank++
    parent[cur] = par

    if (cur === GOAL) {
      const path: number[] = []
      for (let v: number = GOAL; v !== -1; v = parent[v]) path.push(v)
      path.reverse()
      frames.push(snap(cur, '撞到终点', `，沿 parent 回溯出一条 ${path.length - 1} 步的路径。`, true, path))
      break
    }

    let added = 0
    for (const nb of neighbors(cur)) {
      if (walls[nb] || visited[nb]) continue
      open.push(nb)
      from.push(cur)
      added++
    }
    const bag = mode === 'bfs' ? '队列' : '栈'
    frames.push(
      added > 0
        ? snap(cur, '', `弹出 (${col(cur)}, ${row(cur)})，把 ${added} 个没走过的邻居放进${bag}。`, false, [])
        : snap(cur, '', `弹出 (${col(cur)}, ${row(cur)})，四周无路可走，回头。`, false, []),
    )
  }

  if (!frames[frames.length - 1].found) {
    frames.push(snap(-1, '', '袋子空了：终点被墙封死，走不到。', false, []))
  }
  return { frames, totalVisited: Math.max(1, rank) }
}

// 只为拿一个基准数字：无权图上 BFS 的路径长度就是真·最短。
function shortestSteps(walls: boolean[]): number {
  const dist = new Array<number>(N).fill(-1)
  dist[START] = 0
  const q = [START]
  for (let h = 0; h < q.length; h++) {
    const cur = q[h]
    if (cur === GOAL) return dist[cur]
    for (const nb of neighbors(cur)) {
      if (walls[nb] || dist[nb] !== -1) continue
      dist[nb] = dist[cur] + 1
      q.push(nb)
    }
  }
  return -1
}

// 默认关卡：三道错位的长墙，逼出一条蛇形通道，BFS 和 DFS 的差别看得最清楚。
function defaultWalls(): boolean[] {
  const walls = new Array<boolean>(N).fill(false)
  const seg = (c: number, r0: number, r1: number) => {
    for (let r = r0; r <= r1; r++) walls[r * W + c] = true
  }
  seg(4, 0, 7)
  seg(8, 3, 10)
  seg(12, 0, 6)
  walls[START] = false
  walls[GOAL] = false
  return walls
}

// 先随机游走挖通一条起点→终点的路，再往剩下的格子撒墙。
// 连通性由构造保证，不用「撒完再验、不通就重撒」那套。
function randomWalls(): boolean[] {
  const walls = new Array<boolean>(N).fill(false)
  const carved = new Set<number>([START])
  let r = row(START)
  let c = col(START)
  for (let guard = 0; guard < 600 && (r !== row(GOAL) || c !== col(GOAL)); guard++) {
    const dr = Math.sign(row(GOAL) - r)
    const dc = Math.sign(col(GOAL) - c)
    if (Math.random() < 0.6 && (dr !== 0 || dc !== 0)) {
      if (dr !== 0 && (dc === 0 || Math.random() < 0.5)) r += dr
      else c += dc
    } else if (Math.random() < 0.5) {
      r = Math.max(0, Math.min(H - 1, r + (Math.random() < 0.5 ? -1 : 1)))
    } else {
      c = Math.max(0, Math.min(W - 1, c + (Math.random() < 0.5 ? -1 : 1)))
    }
    carved.add(r * W + c)
  }
  for (let i = 0; i < N; i++) if (!carved.has(i) && Math.random() < 0.3) walls[i] = true
  walls[START] = false
  walls[GOAL] = false
  return walls
}

/* ── 队列 / 栈 那条格子带 ─────────────────────────────── */
const QVW = 454
const QVH = 92
const MAXQ = 8
const BW = 26
const BGAP = 3.5
const BX0 = 84
const BY = 30
const BH = 26
const BMID = BY + BH / 2
const BEND = BX0 + (MAXQ - 1) * (BW + BGAP) + BW

function Arrow({ x1, x2, y, color }: { x1: number; x2: number; y: number; color: string }) {
  const dir = Math.sign(x2 - x1)
  return (
    <g stroke={color} fill={color}>
      <line x1={x1} y1={y} x2={x2 - dir * 5} y2={y} strokeWidth={1.4} />
      <polygon points={`${x2},${y} ${x2 - dir * 6},${y - 3.6} ${x2 - dir * 6},${y + 3.6}`} stroke="none" />
    </g>
  )
}

export function BfsDfs() {
  const [mode, setMode] = useState<Mode>('bfs')
  const [walls, setWalls] = useState<boolean[]>(defaultWalls)

  const { frames, totalVisited } = useMemo(() => buildFrames(mode, walls), [mode, walls])
  const best = useMemo(() => shortestSteps(walls), [walls])
  const p = usePlayer(frames.length, 6)
  const f = frames[p.i]

  // 改墙后帧数组换了一批；帧数恰好没变时 usePlayer 不会自动重置，这里补一刀。
  function toggleWall(i: number) {
    if (i === START || i === GOAL) return
    setWalls((w) => w.map((v, k) => (k === i ? !v : v)))
    p.reset()
  }
  function newMaze() {
    setWalls(randomWalls())
    p.reset()
  }
  function clearWalls() {
    setWalls(new Array<boolean>(N).fill(false))
    p.reset()
  }

  const openSet = new Set(f.open)
  const steps = f.found ? f.path.length - 1 : -1
  const bag = mode === 'bfs' ? '队列' : '栈'

  let optimal = '—'
  if (f.found) {
    if (mode === 'bfs') optimal = '是'
    else if (steps === best) optimal = '是（碰巧）'
    else optimal = `否，多绕 ${steps - best} 步`
  }

  // 袋子带：BFS 从左端弹，所以只显示最靠头的一批；DFS 从右端弹，显示最靠尾的一批。
  const shown = mode === 'bfs' ? f.open.slice(0, MAXQ) : f.open.slice(-MAXQ)
  const hidden = f.open.length - shown.length
  const popIdx = mode === 'bfs' ? 0 : shown.length - 1

  return (
    <AlgoShell
      slug="bfs-dfs"
      lede={
        <>
          手里有一袋待访问的格子。<strong>从头上取</strong>，走出来的是一圈圈同心波纹，
          第一次碰到终点就是最短路；<strong>从尾上取</strong>，走出来的是一条长蛇，撞墙才回头。
          除了这一行，两个算法的代码逐字相同。点格子放墙拆墙，看下面那条袋子带上的
          <span className="k">出口箭头</span>怎么换边。
        </>
      }
    >
      <div className="lab">
        <div className="controls" style={{ marginTop: 0, marginBottom: 18, borderTop: 'none', paddingTop: 0 }}>
          <div className="seg" role="tablist" aria-label="选择遍历方式">
            <button className={mode === 'bfs' ? 'on' : ''} onClick={() => { setMode('bfs'); p.reset() }}>广度优先 BFS</button>
            <button className={mode === 'dfs' ? 'on' : ''} onClick={() => { setMode('dfs'); p.reset() }}>深度优先 DFS</button>
          </div>
          <div style={{ fontSize: 13.5, color: 'var(--ink-soft)' }}>
            点任意空地或墙可以切换；起点和终点点不动。
          </div>
        </div>

        <div className="lab-panels">
          <div className="lab-panel">
            <h4>迷宫 · 格子里的数字是访问顺序</h4>
            <svg
              viewBox={`0 0 ${GVW} ${GVH}`}
              style={{ fontFamily: 'var(--font-mono)' }}
              role="img"
              aria-label={`${W} 乘 ${H} 的网格迷宫，起点在左上、终点在右下。墨绿格子按访问先后渐深，朱红格子是当前弹出的格子和边界。点击格子可以放墙或拆墙。`}
            >
              {Array.from({ length: N }, (_, i) => {
                const x = cx(i)
                const y = cy(i)
                const isWall = walls[i]
                const o = f.order[i]
                const isCur = i === f.current
                const inOpen = openSet.has(i)
                let fill = PAPER
                let fo = 1
                if (isWall) fill = WALL
                else if (isCur) fill = RED
                else if (o >= 0) {
                  fill = MOSS
                  fo = 0.12 + 0.5 * (o / totalVisited)
                } else if (inOpen) {
                  fill = RED
                  fo = 0.1
                }
                const showRank = o >= 0 && i !== START && i !== GOAL
                return (
                  <g
                    key={i}
                    onClick={() => toggleWall(i)}
                    style={{ cursor: i === START || i === GOAL ? 'default' : 'pointer' }}
                  >
                    <rect x={x} y={y} width={CELL} height={CELL} fill={fill} fillOpacity={fo} stroke={LINE} strokeWidth={0.6} />
                    {!isWall && inOpen && (
                      <rect x={x + 1} y={y + 1} width={CELL - 2} height={CELL - 2} fill="none" stroke={RED} strokeWidth={1.2} />
                    )}
                    {showRank && (
                      <text
                        x={x + CELL / 2} y={y + CELL / 2} textAnchor="middle" dominantBaseline="central"
                        fontSize={8.5} fill={isCur || fo > 0.38 ? PAPER : '#3f5a46'}
                      >
                        {o}
                      </text>
                    )}
                  </g>
                )
              })}

              {f.found && (
                <polyline
                  points={f.path.map((i) => `${cx(i) + CELL / 2},${cy(i) + CELL / 2}`).join(' ')}
                  fill="none" stroke={RED} strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" opacity={0.9}
                />
              )}

              {/* 终点：墨绿粗环 */}
              <rect x={cx(GOAL) + 2} y={cy(GOAL) + 2} width={CELL - 4} height={CELL - 4} fill="none" stroke={MOSS} strokeWidth={2.4} />
              <text
                x={cx(GOAL) + CELL / 2} y={cy(GOAL) + CELL / 2} textAnchor="middle" dominantBaseline="central"
                fontSize={10} fill={f.current === GOAL ? PAPER : MOSS}
              >
                终
              </text>
              {/* 起点：朱红实心块 */}
              <rect x={cx(START) + 3} y={cy(START) + 3} width={CELL - 6} height={CELL - 6} fill={RED} />
              <text x={cx(START) + CELL / 2} y={cy(START) + CELL / 2} textAnchor="middle" dominantBaseline="central" fontSize={10} fill={PAPER}>
                起
              </text>
            </svg>
          </div>
        </div>

        <div className="lab-panels" style={{ marginTop: 14 }}>
          <div className="lab-panel">
            <h4>袋子本身 · {mode === 'bfs' ? '队列（左端出）' : '栈（右端出）'}</h4>
            <svg
              viewBox={`0 0 ${QVW} ${QVH}`}
              style={{ fontFamily: 'var(--font-mono)' }}
              role="img"
              aria-label={
                mode === 'bfs'
                  ? '待访问队列：新格子从右端进，下一个从左端出，先进先出。'
                  : '待访问栈：新格子从右端进，下一个也从右端出，后进先出。'
              }
            >
              {shown.map((n, k) => {
                const x = BX0 + k * (BW + BGAP)
                const isNext = k === popIdx
                return (
                  <g key={`${n}-${k}`}>
                    <rect
                      x={x} y={BY} width={BW} height={BH} rx={2}
                      fill={RED} fillOpacity={isNext ? 1 : 0.1}
                      stroke={RED} strokeWidth={isNext ? 0 : 1.1}
                    />
                    <text
                      x={x + BW / 2} y={BMID} textAnchor="middle" dominantBaseline="central"
                      fontSize={9} fill={isNext ? PAPER : RED_INK}
                    >
                      {col(n)},{row(n)}
                    </text>
                  </g>
                )
              })}

              {shown.length === 0 && (
                <text x={(BX0 + BEND) / 2} y={BMID} textAnchor="middle" dominantBaseline="central" fontSize={11} fill={FAINT}>
                  袋子空了
                </text>
              )}

              {/* 被折叠的那一批：BFS 藏在尾部（右），DFS 藏在底部（左） */}
              {hidden > 0 && mode === 'bfs' && (
                <text x={BEND + 6} y={BMID} textAnchor="start" dominantBaseline="central" fontSize={9.5} fill={FAINT}>
                  …+{hidden}
                </text>
              )}
              {hidden > 0 && mode === 'dfs' && (
                <text x={BX0 - 6} y={BMID} textAnchor="end" dominantBaseline="central" fontSize={9.5} fill={FAINT}>
                  …+{hidden}
                </text>
              )}

              {/* 入口永远在右端 */}
              <Arrow x1={434} x2={356} y={mode === 'bfs' ? BMID : BY + 6} color={FAINT} />
              <text x={398} y={mode === 'bfs' ? 20 : 12} textAnchor="middle" fontSize={10} fill={FAINT}>入</text>

              {/* 出口：整页的核心洞察就是这一个箭头在左边还是在右边 */}
              {mode === 'bfs' ? (
                <>
                  <Arrow x1={74} x2={26} y={BMID} color={RED} />
                  <text x={50} y={20} textAnchor="middle" fontSize={10} fill={RED_INK}>出</text>
                </>
              ) : (
                <>
                  <Arrow x1={362} x2={434} y={BY + BH - 6} color={RED} />
                  <text x={398} y={78} textAnchor="middle" fontSize={10} fill={RED_INK}>出</text>
                </>
              )}

              <text x={QVW / 2} y={86} textAnchor="middle" fontSize={10.5} fill={RED_INK}>
                {mode === 'bfs' ? '先进先出：右边进，左边出' : '后进先出：右边进，右边出'}
              </text>
            </svg>
          </div>
        </div>

        <div className="step-note">
          {f.found ? (
            <>
              <em>{f.em}</em>
              <span className="done">{f.note}</span>
            </>
          ) : (
            <>
              {f.em && <em>{f.em}</em>}
              {f.note}
            </>
          )}
        </div>

        <div className="legend">
          <span><i style={{ background: RED }} />当前弹出</span>
          <span><i style={{ background: 'rgba(214,69,44,0.10)', border: `1.2px solid ${RED}` }} />在{bag}里（边界）</span>
          <span><i style={{ background: 'rgba(74,107,82,0.45)' }} />已访问（越深越晚）</span>
          <span><i style={{ background: WALL }} />墙</span>
          <span><i style={{ background: PAPER, border: `1px solid ${LINE}` }} />空地</span>
        </div>

        <Player
          p={p}
          extra={
            <>
              <button className="btn" onClick={newMaze}>随机迷宫</button>
              <button className="btn" onClick={clearWalls}>清空墙</button>
            </>
          }
        />

        <div className="readout">
          <div className="item">
            <span className="lbl">已访问格数</span>
            <span className="val">{f.order.filter((o) => o >= 0).length}</span>
          </div>
          <div className="item">
            <span className="lbl">{bag}里待处理</span>
            <span className="val">{f.open.length}</span>
          </div>
          <div className="item">
            <span className="lbl">这条路走了几步</span>
            <span className="val">{f.found ? steps : '—'}</span>
          </div>
          <div className="item">
            <span className="lbl">BFS 最短基准</span>
            <span className="val">{best >= 0 ? best : '不可达'}</span>
          </div>
          <div className="item">
            <span className="lbl">是最短路吗</span>
            <span className="val">{optimal}</span>
          </div>
        </div>
      </div>

      <h2>两份代码，一行之差</h2>
      <p>
        袋子里装着「知道存在、但还没去看」的格子。每一轮从袋子里拿一个出来，标记走过，
        把它没走过的邻居丢进袋子。整个循环里只有一行需要做选择：
        <span className="k">const cur = mode === 'bfs' ? open.shift() : open.pop()</span>。
        <span className="k">shift</span> 从头上取，先进的先出，这袋子就是<strong>队列</strong>，算法叫广度优先；
        <span className="k">pop</span> 从尾上取，后进的先出，这袋子就是<strong>栈</strong>，算法叫深度优先。
        新格子从来都是从尾巴推进去的，所以变的只有出口那一头。
      </p>
      <p>
        网格上的访问序号把这件事翻译成了图形。BFS 的序号一圈一圈同心地涨，
        因为它先把「离起点 1 步」的格子全取完，才轮到「2 步」的。DFS 的序号沿一条蛇形长条一路狂奔，
        因为最后推进去的那个邻居马上就被拿了出来。
      </p>

      <h2>为什么 BFS 保证最短，DFS 不保证</h2>
      <p>
        BFS 严格按距离分层扩展：袋子里的格子，距离永远是非递减的。第一次弹出终点时，
        它的距离就是所有可能路径里最小的那个。理由很硬：假如真存在一条更短的路，那条路上的每个点距离都更小，
        早该在更早的层里被弹出来，终点也就该更早被碰到，矛盾。所以「第一次碰到」和「最短」在 BFS 里是同一件事。
      </p>
      <p>
        DFS 一头扎到底，撞墙才回头。它第一次碰到终点的那条路，只是「碰巧先撞上」的那条，跟长短毫无关系。
        把上面的模式切到 DFS，看 readout 里那两个数字并排放着：右边是 BFS 的最短基准，左边是 DFS 这次绕出来的长度。
        换几次随机迷宫，差距通常大得离谱。
      </p>

      <h2>那 DFS 凭什么还活着</h2>
      <p>
        空间。BFS 的队列要同时装下整整一层的边界，最坏情况下是整张图的「宽度」，
        在宽而浅的图上非常吃内存。DFS 的栈只装当前这一条路上的格子，占用是「深度」量级。
        这是 DFS 唯一的结构性优势，也足够它在很多场景里活得很好。
      </p>
      <p>
        顺带一句：如果把这个袋子换成「按累计距离排序的优先队列」，每次取出距离最小的那个，
        算法就变成了 Dijkstra，边可以带权重了。三个算法共用同一副骨架，区别全在「下一个该拿谁」。
      </p>

      <Landing>
        BFS 是无权图上的最短路，社交网络算「几度人脉」、网页爬虫按层抓取、棋类残局求最少步数，
        用的都是它。DFS 是拓扑排序、找环、求连通分量的骨架；数独、八皇后、迷宫生成这些回溯搜索，
        本质上就是带剪枝的 DFS。同一段循环，换个取法，换个世界。
      </Landing>
    </AlgoShell>
  )
}
