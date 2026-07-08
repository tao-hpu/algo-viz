import { type ReactNode, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { findAlgo, categoryOf, liveAlgos } from '../catalog'

// 算法页统一外壳：面包屑 + 标题 + 一句话直觉 + 正文 + 回目录。
export function AlgoShell({ slug, lede, children }: {
  slug: string
  lede: ReactNode
  children: ReactNode
}) {
  const me = findAlgo(slug)
  // 站内跳转（SPA）时预渲染的 <head> 不会重跑，手动同步浏览器标签标题。
  useEffect(() => {
    if (me) document.title = `${me.title} · 算法可视化实验室`
    return () => { document.title = '算法可视化实验室 · algo-viz' }
  }, [me])
  if (!me) return <div className="wrap page">未找到算法：{slug}</div>
  const cat = categoryOf(slug)

  return (
    <article className="wrap page">
      <div className="crumb"><Link to="/">目录</Link> · {cat}</div>
      <header className="masthead">
        <h1>{me.title}</h1>
        <p className="hook">{me.hook}</p>
        <p className="lede">{lede}</p>
      </header>

      {children}

      <p className="page-foot">
        共 {liveAlgos.length} 个能玩 · <Link to="/">← 回目录挑下一个</Link>
      </p>
    </article>
  )
}

// 每个算法末尾一句「它在现实里是什么」。
export function Landing({ children }: { children: ReactNode }) {
  return (
    <section className="landing">
      <div className="tag">它落在哪儿</div>
      <p>{children}</p>
    </section>
  )
}
