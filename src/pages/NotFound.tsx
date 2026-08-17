import { useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { liveAlgos } from '../catalog'

/* ────────────────────────────────────────────────────────────
   404 · 走岔了
   部署在 nginx 的 try_files 后面：任何没命中的路径都会拿到 SPA 壳，
   所以「这个地址不存在」这件事只能由前端说。没有这一页的时候，
   /a/写错的slug 会渲染成一片空白，连顶栏和侧栏都不出现。
   ──────────────────────────────────────────────────────────── */

// 拼错时给个最接近的候选：按 slug 的公共前缀长度粗排，够用了。
function nearest(slug: string) {
  if (!slug) return []
  const score = (s: string) => {
    let k = 0
    while (k < s.length && k < slug.length && s[k] === slug[k]) k++
    return k
  }
  return liveAlgos
    .map((a) => ({ a, k: score(a.slug) }))
    .filter((r) => r.k >= 2)
    .sort((x, y) => y.k - x.k)
    .slice(0, 3)
    .map((r) => r.a)
}

export function NotFound() {
  const { pathname } = useLocation()
  const slug = pathname.startsWith('/a/') ? pathname.slice(3) : ''
  const guesses = nearest(slug)

  useEffect(() => {
    document.title = '这个地址不存在 · 算法可视化实验室'
    return () => { document.title = '算法可视化实验室 · algo-viz' }
  }, [])

  return (
    <article className="wrap page">
      <div className="crumb"><Link to="/">目录</Link> · 404</div>
      <header className="masthead">
        <h1>走岔了</h1>
        <p className="hook">这个地址下面没有东西。</p>
        <p className="lede">
          你要找的是 <span className="k">{pathname}</span>。它要么是拼错了，要么是我还没写。
          目录里现在有 {liveAlgos.length} 个能玩的，左边侧栏也列全了。
        </p>
      </header>

      {guesses.length > 0 && (
        <>
          <h2>是不是想去这几个之一</h2>
          <div className="grid">
            {guesses.map((a) => (
              <Link className="card is-live" to={`/a/${a.slug}`} key={a.slug}>
                <div className="card-top">
                  <span className="card-meta"><span className="card-num">{a.slug}</span></span>
                  <span className="badge live">可玩</span>
                </div>
                <h3>{a.title}</h3>
                <p className="hook">{a.hook}</p>
              </Link>
            ))}
          </div>
        </>
      )}

      <p className="page-foot">
        共 {liveAlgos.length} 个能玩 · <Link to="/">← 回目录挑一个</Link>
      </p>
    </article>
  )
}
