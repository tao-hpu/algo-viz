import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { catalog } from '../catalog'

// 侧栏：按分类列出所有算法，live 可点、planned 灰显（同时充当路线图）。
// active 态用朱红文字 + 淡底，不用左边框（刻意避开那套 AI 套路）。
function Sidebar({ onNavigate }: { onNavigate: () => void }) {
  const { pathname } = useLocation()
  return (
    <nav className="sidebar" aria-label="全部算法">
      <Link to="/" className={`side-home ${pathname === '/' ? 'is-active' : ''}`} onClick={onNavigate}>
        ◇ 目录首页
      </Link>
      {catalog.map((cat) => (
        <div className="side-cat" key={cat.name}>
          <div className="side-cat-name">{cat.name}</div>
          <ul>
            {cat.algos.map((a) => {
              const live = a.status === 'live'
              const active = pathname === `/a/${a.slug}`
              return (
                <li key={a.slug}>
                  {live ? (
                    <NavLink to={`/a/${a.slug}`} onClick={onNavigate}
                      className={`side-link is-live ${active ? 'is-active' : ''}`}>
                      {a.title}
                    </NavLink>
                  ) : (
                    <span className="side-link is-planned" title="还没做">
                      {a.title}
                    </span>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </nav>
  )
}

export function Layout() {
  const { pathname } = useLocation()
  const [open, setOpen] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth > 960 : true)

  useEffect(() => { window.scrollTo(0, 0) }, [pathname])

  const closeIfNarrow = () => {
    if (typeof window !== 'undefined' && window.innerWidth <= 960) setOpen(false)
  }

  return (
    <div className={`shell ${open ? 'nav-open' : 'nav-closed'}`}>
      <header className="topbar">
        <div className="topbar-left">
          <button className="nav-toggle" onClick={() => setOpen((o) => !o)}
            aria-label="切换侧栏" aria-expanded={open}>
            {open ? '✕' : '☰'}
          </button>
          <Link to="/" className="wordmark">
            <span className="mark">{'{ }'}</span>
            算法可视化
            <span className="sub">实验笔记</span>
          </Link>
        </div>
        <nav className="topnav">
          <NavLink to="/" end className={({ isActive }) => (isActive ? 'active' : '')}>目录</NavLink>
          <a href="https://github.com/tao-hpu/algo-viz" target="_blank" rel="noreferrer">★ GitHub</a>
        </nav>
      </header>

      <div className="body">
        {open && <Sidebar onNavigate={closeIfNarrow} />}
        {open && <div className="nav-scrim" onClick={() => setOpen(false)} />}
        <main className="content">
          <Outlet />
          <footer className="site-footer">
            <span>© 2026 <a href="https://fim.ai" target="_blank" rel="noreferrer">FIM Labs</a></span>
            <span>拖一拖，比看十遍公式管用 · 一本慢慢长出来的开源笔记</span>
          </footer>
        </main>
      </div>
    </div>
  )
}
