import React, { useState, useEffect } from 'react'
import { Bell, AlertTriangle, Info, Lightbulb, Video, X, RefreshCw } from 'lucide-react'
import { getNotifications } from '../../services/api'

const ICONS = {
  warning: <AlertTriangle size={14} color="var(--orange)"/>,
  info:    <Info size={14} color="var(--blue)"/>,
  tip:     <Lightbulb size={14} color="var(--a)"/>,
  success: <Bell size={14} color="var(--green)"/>,
}
const BG = {
  warning:'var(--obg)', info:'var(--bbg)', tip:'var(--abg)', success:'var(--gbg)'
}
const BORDER = {
  warning:'rgba(246,173,85,0.2)', info:'rgba(99,179,245,0.2)',
  tip:'rgba(245,166,35,0.2)', success:'rgba(86,212,160,0.2)'
}

export default function NotificationsView({ onNavigate }) {
  const [notifs, setNotifs]   = useState([])
  const [loading, setLoading] = useState(true)
  const [dismissed, setDismiss] = useState(new Set())

  useEffect(()=>{ load() }, [])
  const load = async () => {
    setLoading(true)
    try { setNotifs(await getNotifications()) } catch{}
    setLoading(false)
  }

  const visible = notifs.filter((_,i)=>!dismissed.has(i))

  return (
    <div style={{ flex:1, overflow:'auto', padding:24, display:'flex', flexDirection:'column', gap:20 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <div>
          <h1 style={{ fontFamily:'var(--serif)', fontSize:26, fontWeight:600 }}>
            <Bell size={20} style={{ display:'inline', marginRight:8, verticalAlign:'middle', color:'var(--a)' }}/>
            Notifications
          </h1>
          <p style={{ color:'var(--t3)', fontSize:12, marginTop:3 }}>Smart alerts from your research workspace</p>
        </div>
        <button className="btn btn-glass btn-sm" onClick={load}><RefreshCw size={11}/>Refresh</button>
      </div>

      {loading ? (
        <div style={{ display:'flex', gap:8, color:'var(--t3)' }}><div className="spinner"/>Loading…</div>
      ) : visible.length===0 ? (
        <div style={{ padding:48, textAlign:'center', display:'flex', flexDirection:'column', alignItems:'center', gap:12, color:'var(--t3)' }}>
          <Bell size={36} strokeWidth={1} style={{ opacity:0.15 }}/>
          <div style={{ fontFamily:'var(--serif)', fontSize:16 }}>All caught up!</div>
          <div style={{ fontSize:12 }}>No new notifications</div>
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:10, maxWidth:640 }}>
          {notifs.map((n,i)=>dismissed.has(i)?null:(
            <div key={i} className="fade-up" style={{ padding:16, borderRadius:10, background:BG[n.type]||'var(--bg3)', border:`1px solid ${BORDER[n.type]||'var(--border)'}`, display:'flex', gap:12, alignItems:'flex-start', animation:'notif-in 0.25s ease' }}>
              <div style={{ flexShrink:0, marginTop:2 }}>{ICONS[n.type]||ICONS.info}</div>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:13, fontWeight:700, color:'var(--t1)', marginBottom:4 }}>{n.title}</div>
                <div style={{ fontSize:12, color:'var(--t2)', lineHeight:1.5 }}>{n.message}</div>
                <div style={{ marginTop:8, display:'flex', gap:6 }}>
                  {n.action && (
                    <button className="btn btn-glass btn-xs" onClick={()=>onNavigate(n.action)}>
                      Go to {n.action}
                    </button>
                  )}
                  {n.meet_link && (
                    <a href={n.meet_link} target="_blank" rel="noreferrer"
                      className="btn btn-glass btn-xs" style={{ textDecoration:'none' }}>
                      <Video size={9}/>Join Meet
                    </a>
                  )}
                </div>
              </div>
              <button onClick={()=>setDismiss(s=>new Set([...s,i]))} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--t4)', padding:2, flexShrink:0 }}
                onMouseEnter={e=>e.currentTarget.style.color='var(--t2)'}
                onMouseLeave={e=>e.currentTarget.style.color='var(--t4)'}>
                <X size={13}/>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
