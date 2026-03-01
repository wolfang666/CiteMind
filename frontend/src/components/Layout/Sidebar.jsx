import React from 'react'
import { LayoutDashboard, FileText, BookOpen, Calendar, CheckSquare, Plug, Sparkles, Bell } from 'lucide-react'

const NAV = [
  { id:'dashboard', icon:LayoutDashboard, label:'Dashboard' },
  { id:'editor',    icon:FileText,         label:'LaTeX Editor' },
  { id:'papers',    icon:BookOpen,         label:'Paper Library' },
  { id:'calendar',  icon:Calendar,         label:'Calendar & Meet' },
  { id:'todos',     icon:CheckSquare,      label:'Todo List' },
  { id:'integrations', icon:Plug,          label:'Integrations' },
]

export default function Sidebar({ view, onView, notifCount=0 }) {
  return (
    <aside style={{
      width:54, background:'var(--bg2)', borderRight:'1px solid var(--border)',
      display:'flex', flexDirection:'column', alignItems:'center',
      padding:'12px 0', gap:2, flexShrink:0,
    }}>
      {/* Logo */}
      <div onClick={()=>onView('dashboard')} style={{
        width:36, height:36, borderRadius:10, cursor:'pointer',
        background:'linear-gradient(135deg, var(--a) 0%, #e8831a 100%)',
        display:'flex', alignItems:'center', justifyContent:'center', marginBottom:16,
        boxShadow:'0 4px 16px rgba(245,166,35,0.4)',
        transition:'transform 0.15s',
      }}
        onMouseEnter={e=>e.currentTarget.style.transform='scale(1.08)'}
        onMouseLeave={e=>e.currentTarget.style.transform='scale(1)'}
      >
        <Sparkles size={17} color="#0d0f14" strokeWidth={2.5} />
      </div>

      {NAV.map(({ id, icon:Icon, label }) => (
        <button key={id} onClick={()=>onView(id)} title={label} style={{
          width:40, height:40, borderRadius:9, border:'none',
          background: view===id ? 'var(--abg)' : 'transparent',
          color: view===id ? 'var(--a)' : 'var(--t3)',
          cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center',
          transition:'all 0.15s', position:'relative',
          outline: view===id ? '1px solid rgba(245,166,35,0.3)' : 'none',
          outlineOffset:'-1px',
        }}
          onMouseEnter={e=>{ if(view!==id) e.currentTarget.style.color='var(--t2)' }}
          onMouseLeave={e=>{ if(view!==id) e.currentTarget.style.color='var(--t3)' }}
        >
          <Icon size={17} />
        </button>
      ))}

      <div style={{ flex:1 }} />

      {/* Notifications bell */}
      <button onClick={()=>onView('notifications')} title="Notifications" style={{
        width:40, height:40, borderRadius:9, border:'none',
        background: view==='notifications' ? 'var(--abg)' : 'transparent',
        color: notifCount>0 ? 'var(--a)' : 'var(--t3)',
        cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center',
        transition:'all 0.15s', position:'relative',
      }}>
        <Bell size={17} />
        {notifCount>0 && <div className="notif-dot" />}
      </button>
    </aside>
  )
}
