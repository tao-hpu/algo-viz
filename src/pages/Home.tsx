import { Link } from 'react-router-dom'
import { catalog, liveAlgos, allAlgos } from '../catalog'

export function Home() {
  return (
    <div className="wrap">
      <section className="hero">
        <h1>
          算法，<span className="accent hand-underline">拖一拖</span>就懂了
        </h1>
        <p className="lede">
          每一个算法拆成一张能亲手拨动的图：改参数、看几何当场变，再一句话把它焊到现实里。
          <span className="hand"> 一本边学边长的活笔记，</span>
          没做完的先留个位子。
        </p>
      </section>

      {catalog.map((cat) => {
        const live = cat.algos.filter((a) => a.status === 'live').length
        return (
          <section className="cat" key={cat.name}>
            <div className="cat-head">
              <h2>{cat.name}</h2>
              <span className="count">{live}/{cat.algos.length} 上线</span>
            </div>
            <p className="cat-blurb">{cat.blurb}</p>
            <div className="grid">
              {cat.algos.map((a) =>
                a.status === 'live' ? (
                  <Link className="card is-live" to={`/a/${a.slug}`} key={a.slug}>
                    <div className="card-top">
                      <span className="card-num">{a.slug}</span>
                      <span className="badge live">可玩</span>
                    </div>
                    <h3>{a.title}</h3>
                    <p className="hook">{a.hook}</p>
                  </Link>
                ) : (
                  <div className="card is-planned" key={a.slug} aria-disabled>
                    <div className="card-top">
                      <span className="card-num">{a.slug}</span>
                      <span className="badge todo">todo</span>
                    </div>
                    <h3>{a.title}</h3>
                    <p className="hook">{a.hook}</p>
                    {a.todo && <p className="todo-note">✎ {a.todo}</p>}
                  </div>
                )
              )}
            </div>
          </section>
        )
      })}

      <p className="page-foot">
        共 {allAlgos.length} 个算法 · {liveAlgos.length} 个能玩了 · 其余慢慢补
      </p>
    </div>
  )
}
