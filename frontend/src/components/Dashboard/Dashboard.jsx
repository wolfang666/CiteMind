import React, { useState, useEffect } from 'react'
import { BookMarked, CheckCircle, AlertTriangle, XCircle, Plus, Trash2, FolderOpen, TrendingUp, RefreshCw } from 'lucide-react'
import { RadialBarChart, RadialBar, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts'
import { getProjects, createProject, deleteProject, getStats, verifyCitations } from '../../services/api'
import toast from 'react-hot-toast'

function Stat({ icon:Icon, label, value, color, sub }) {
  return (
    <div className="card-glow" style={{ padding:'14px 16px', display:'flex', flexDirection:'column', gap:10 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <span style={{ fontSize:10, color:'var(--t3)', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em' }}>{label}</span>
        <div style={{ width:28, height:28, borderRadius:7, background:`${color}18`, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <Icon size={13} color={color} />
        </div>
      </div>
      <div style={{ fontSize:28, fontFamily:'var(--serif)', fontWeight:600, color:'var(--t1)', lineHeight:1 }}>{value??'—'}</div>
      {sub && <div style={{ fontSize:10, color:'var(--t3)' }}>{sub}</div>}
    </div>
  )
}

export default function Dashboard({ project, onProjectChange }) {
  const [projects, setProjects] = useState([])
  const [stats, setStats]   = useState(null)
  const [name, setName]     = useState('')
  const [creating, setCreating] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [deleting, setDeleting] = useState(null)

  useEffect(() => { load() }, [])
  useEffect(() => { if (project) getStats(project.id).then(setStats).catch(()=>{}) }, [project])

  const load = () => getProjects().then(setProjects).catch(()=>{})

  const handleCreate = async () => {
    if (!name.trim()) return
    setCreating(true)
    try {
      const p = await createProject(name.trim())
      toast.success(`"${p.name}" created`)
      setName(''); await load(); onProjectChange(p)
    } catch(e) { toast.error(e.message) }
    setCreating(false)
  }

  const handleDelete = async (e, pid) => {
    e.stopPropagation()
    setDeleting(pid)
    try {
      await deleteProject(pid)
      if (project?.id===pid) onProjectChange(null)
      await load(); toast.success('Deleted')
    } catch(e) { toast.error(e.message) }
    setDeleting(null)
  }

  const handleVerify = async () => {
    if (!project) return
    setVerifying(true)
    try {
      const r = await verifyCitations(project.id)
      toast.success(`Missing: ${r.missing_from_bib?.length||0} | Unused: ${r.unused_in_tex?.length||0}`)
      const s = await getStats(project.id); setStats(s)
    } catch(e) { toast.error(e.message) }
    setVerifying(false)
  }

  const pct = stats ? Math.round((stats.verified / Math.max(stats.total_citations,1))*100) : 0
  const barData = stats ? [
    { n:'In .tex', v:stats.total_citations, fill:'var(--blue)' },
    { n:'In .bib', v:stats.total_bib_entries, fill:'var(--purple)' },
    { n:'Verified', v:stats.verified, fill:'var(--green)' },
    { n:'Missing', v:stats.missing, fill:'var(--red)' },
  ] : []

  return (
    <div style={{ flex:1, overflow:'auto', padding:24, display:'flex', flexDirection:'column', gap:22 }}>
      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
        <div>
          <h1 style={{ fontFamily:'var(--serif)', fontSize:26, fontWeight:600, letterSpacing:'-0.02em', color:'var(--t1)' }}>
            Research Dashboard
          </h1>
          <p style={{ color:'var(--t3)', fontSize:12.5, marginTop:4 }}>Manage papers, citations, and projects</p>
        </div>
        {project && (
          <div style={{ display:'flex', gap:8 }}>
            <button className="btn btn-glass btn-sm" onClick={handleVerify} disabled={verifying}>
              {verifying ? <div className="spinner spinner-sm"/> : <RefreshCw size={11}/>} Verify
            </button>
          </div>
        )}
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'280px 1fr', gap:20, alignItems:'start' }}>
        {/* Left panel */}
        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
          {/* New project */}
          <div className="card" style={{ padding:16 }}>
            <div style={{ fontSize:11, fontWeight:700, color:'var(--t3)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:10 }}>New Project</div>
            <div style={{ display:'flex', gap:7 }}>
              <input placeholder="Paper title…" value={name} onChange={e=>setName(e.target.value)}
                onKeyDown={e=>e.key==='Enter'&&handleCreate()} style={{ flex:1 }} />
              <button className="btn btn-primary btn-sm" onClick={handleCreate} disabled={creating||!name.trim()}>
                {creating?<div className="spinner spinner-sm"/>:<Plus size={13}/>}
              </button>
            </div>
          </div>

          {/* Projects list */}
          <div className="card" style={{ overflow:'hidden' }}>
            <div style={{ padding:'10px 14px', borderBottom:'1px solid var(--border)', fontSize:11, fontWeight:700, color:'var(--t3)', textTransform:'uppercase', letterSpacing:'0.08em' }}>
              Projects ({projects.length})
            </div>
            <div style={{ maxHeight:320, overflowY:'auto' }}>
              {projects.length===0
                ? <div style={{ padding:24, textAlign:'center', color:'var(--t3)', fontSize:12 }}>No projects yet</div>
                : projects.map(p=>(
                  <div key={p.id} onClick={()=>onProjectChange(p)} style={{
                    display:'flex', alignItems:'center', gap:8, padding:'9px 14px',
                    background: project?.id===p.id ? 'var(--abg)' : 'transparent',
                    borderLeft:`2px solid ${project?.id===p.id?'var(--a)':'transparent'}`,
                    cursor:'pointer', transition:'all 0.12s',
                  }}
                    onMouseEnter={e=>{ if(project?.id!==p.id) e.currentTarget.style.background='var(--bg3)' }}
                    onMouseLeave={e=>{ if(project?.id!==p.id) e.currentTarget.style.background='transparent' }}
                  >
                    <FolderOpen size={13} color={project?.id===p.id?'var(--a)':'var(--t3)'} />
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:12.5, fontWeight:600, color:project?.id===p.id?'var(--t1)':'var(--t2)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{p.name}</div>
                      <div style={{ fontSize:10, color:'var(--t3)', fontFamily:'var(--mono)' }}>id:{p.id}</div>
                    </div>
                    <button onClick={e=>handleDelete(e,p.id)} disabled={deleting===p.id} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--t4)', padding:3, flexShrink:0, opacity:0, transition:'opacity 0.15s' }}
                      className="del-btn"
                      onMouseEnter={e=>e.currentTarget.style.color='var(--red)'}
                      onMouseLeave={e=>e.currentTarget.style.color='var(--t4)'}>
                      <Trash2 size={12}/>
                    </button>
                  </div>
                ))
              }
            </div>
          </div>
        </div>

        {/* Right panel — stats */}
        {!project ? (
          <div className="card" style={{ padding:48, textAlign:'center', display:'flex', flexDirection:'column', alignItems:'center', gap:12, color:'var(--t3)' }}>
            <BookMarked size={36} strokeWidth={1.2} style={{ opacity:0.18 }} />
            <div style={{ fontFamily:'var(--serif)', fontSize:16, fontWeight:400 }}>Select a project to view analytics</div>
            <div style={{ fontSize:12 }}>Or create a new one →</div>
          </div>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10 }}>
              <Stat icon={BookMarked} label="Citations" value={stats?.total_citations} color="var(--blue)" sub="in .tex" />
              <Stat icon={CheckCircle} label="Verified" value={stats?.verified} color="var(--green)" sub="confirmed" />
              <Stat icon={AlertTriangle} label="Missing" value={stats?.missing} color="var(--orange)" sub="not in .bib" />
              <Stat icon={XCircle} label="Unused" value={stats?.unused} color="var(--red)" sub="in .bib only" />
            </div>

            <div style={{ display:'grid', gridTemplateColumns:'160px 1fr', gap:14 }}>
              <div className="card-glow" style={{ padding:16, display:'flex', flexDirection:'column', alignItems:'center', gap:8 }}>
                <div style={{ fontSize:10, fontWeight:700, color:'var(--t3)', textTransform:'uppercase', letterSpacing:'0.08em' }}>Health</div>
                <div style={{ position:'relative', width:96, height:96 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <RadialBarChart cx="50%" cy="50%" innerRadius="68%" outerRadius="100%" data={[{v:pct,fill:'var(--a)'}]} startAngle={90} endAngle={-270}>
                      <RadialBar dataKey="v" cornerRadius={5} background={{fill:'var(--bg4)'}} />
                    </RadialBarChart>
                  </ResponsiveContainer>
                  <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column' }}>
                    <span style={{ fontSize:18, fontWeight:700, fontFamily:'var(--serif)', color:'var(--t1)' }}>{pct}%</span>
                    <span style={{ fontSize:9, color:'var(--t3)' }}>verified</span>
                  </div>
                </div>
              </div>

              <div className="card-glow" style={{ padding:'14px 16px' }}>
                <div style={{ fontSize:10, fontWeight:700, color:'var(--t3)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:10 }}>Citation Breakdown</div>
                <ResponsiveContainer width="100%" height={100}>
                  <BarChart data={barData} barSize={20}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="n" tick={{fontSize:10, fill:'var(--t3)', fontFamily:'var(--font)'}} axisLine={false} tickLine={false} />
                    <YAxis tick={{fontSize:10, fill:'var(--t3)'}} axisLine={false} tickLine={false} width={20} />
                    <Tooltip contentStyle={{background:'var(--bg3)',border:'1px solid var(--border)',borderRadius:6,color:'var(--t1)',fontSize:11}} cursor={{fill:'var(--abg)'}} />
                    <Bar dataKey="v" radius={[3,3,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
