import React from 'react'
import { List } from 'lucide-react'

export default function OutlinePanel({ sections=[], activeSection, onSectionClick }) {
  return (
    <div style={{ width:180, background:'var(--bg2)', borderRight:'1px solid var(--border)', display:'flex', flexDirection:'column', flexShrink:0, overflow:'hidden' }}>
      <div style={{ height:36, borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', padding:'0 12px', gap:6, flexShrink:0 }}>
        <List size={12} color="var(--t3)"/>
        <span style={{ fontSize:10, fontWeight:700, color:'var(--t3)', textTransform:'uppercase', letterSpacing:'0.08em' }}>Outline</span>
      </div>
      <div style={{ flex:1, overflowY:'auto', padding:'6px 0' }}>
        {sections.length===0
          ? <div style={{ padding:'12px 14px', fontSize:11, color:'var(--t4)' }}>No sections</div>
          : sections.map((s,i)=>(
            <button key={i} onClick={()=>onSectionClick(s)} style={{
              width:'100%', padding:'6px 14px', border:'none', textAlign:'left',
              background: activeSection===s ? 'var(--abg)' : 'transparent',
              color: activeSection===s ? 'var(--a)' : 'var(--t2)',
              cursor:'pointer', fontSize:12, fontWeight:500,
              transition:'all 0.12s', fontFamily:'var(--font)',
              borderLeft:`2px solid ${activeSection===s?'var(--a)':'transparent'}`,
            }}
              onMouseEnter={e=>{ if(activeSection!==s) e.currentTarget.style.background='var(--bg3)' }}
              onMouseLeave={e=>{ if(activeSection!==s) e.currentTarget.style.background='transparent' }}
            >{s}</button>
          ))
        }
      </div>
    </div>
  )
}
