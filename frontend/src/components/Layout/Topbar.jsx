import React from 'react'
import { Save, Download, CheckCircle, AlertCircle, Zap, Cpu, Cloud, Bot } from 'lucide-react'

function LLMPill({ llm }) {
  if (!llm) return null
  const cfg = {
    groq:   { label:'Groq ⚡', c:'var(--a)',    bg:'var(--abg)' },
    ollama: { label:'Ollama', c:'var(--blue)',  bg:'var(--bbg)' },
    claude: { label:'Claude', c:'var(--purple)',bg:'var(--pbg)' },
    mock:   { label:'Mock',   c:'var(--t3)',    bg:'var(--bg4)' },
  }[llm.backend] || { label:llm.backend, c:'var(--t3)', bg:'var(--bg4)' }
  return (
    <div style={{ padding:'3px 10px', borderRadius:20, background:cfg.bg, color:cfg.c, fontSize:10, fontWeight:700, letterSpacing:'0.04em', border:`1px solid ${cfg.c}25` }}>
      {cfg.label}
    </div>
  )
}

export default function Topbar({ project, saving, serverOk, llm, onSave, onVerify, onExport }) {
  return (
    <header style={{
      height:48, background:'var(--bg2)', borderBottom:'1px solid var(--border)',
      display:'flex', alignItems:'center', padding:'0 16px', gap:10, flexShrink:0,
    }}>
      <span style={{ fontFamily:'var(--serif)', fontSize:18, fontWeight:600, color:'var(--a)', fontStyle:'italic', letterSpacing:'-0.01em' }}>
        Cite<span style={{ fontStyle:'normal', color:'var(--t1)' }}>Mind</span>
      </span>
      <span style={{ color:'var(--t3)', fontSize:10, fontWeight:700, background:'var(--bg4)', padding:'1px 6px', borderRadius:4 }}>v3</span>

      {project && (
        <>
          <span style={{ color:'var(--border2)', fontSize:13 }}>·</span>
          <span style={{ fontSize:12.5, color:'var(--t2)', fontWeight:600, maxWidth:220, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{project.name}</span>
        </>
      )}

      <div style={{ flex:1 }} />

      <LLMPill llm={llm} />

      <div style={{ display:'flex', alignItems:'center', gap:5, fontSize:11, fontWeight:600, color: serverOk?'var(--green)':'var(--red)' }}>
        {serverOk ? <CheckCircle size={12}/> : <AlertCircle size={12}/>}
        {serverOk ? 'Live' : 'Offline'}
      </div>

      <div style={{ width:1, height:18, background:'var(--border)' }} />

      <button className="btn btn-glass btn-sm" onClick={onVerify} disabled={!project}>
        <CheckCircle size={12}/>Verify
      </button>
      <button className="btn btn-glass btn-sm" onClick={onExport} disabled={!project}>
        <Download size={12}/>Export
      </button>
      <button className="btn btn-primary btn-sm" onClick={onSave} disabled={!project||saving}>
        {saving ? <><div className="spinner spinner-sm"/>Saving…</> : <><Save size={12}/>Save</>}
      </button>
    </header>
  )
}
