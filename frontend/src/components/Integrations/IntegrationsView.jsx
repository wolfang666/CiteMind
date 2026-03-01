import React, { useState, useEffect, useCallback, useRef } from 'react'
import {
  Calendar, Video, Plus, ExternalLink, CheckSquare, Square, Trash2, Flag,
  Book, RefreshCw, LogIn, LogOut, CheckCircle, AlertCircle, Link,
  FileText, Search, PenLine, Building2,
} from 'lucide-react'
import {
  getCalendar, createEvent, getNotion, createNotion, getTodos, createTodo,
  toggleTodo, deleteTodo,
  getGoogleAuthUrl, getGoogleStatus, disconnectGoogle,
  getNotionAuthUrl, getNotionStatus, disconnectNotion,
} from '../../services/api'
import toast from 'react-hot-toast'

// Try to use date-fns if available, fallback to native
let dateFns = null
try { dateFns = require('date-fns') } catch {}

const fmt = (iso) => {
  if (!iso) return ''
  try {
    const d = new Date(iso)
    if (dateFns) return dateFns.format(d, 'MMM d, h:mm a')
    return d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  } catch { return iso }
}
const isToday    = d => { const n = new Date(); return d.getDate() === n.getDate() && d.getMonth() === n.getMonth() }
const isTomorrow = d => { const n = new Date(); n.setDate(n.getDate() + 1); return d.getDate() === n.getDate() && d.getMonth() === n.getMonth() }


// ══════════════════════════════════════════════════════
// SHARED: OAUTH CONNECT PANEL (works for Google & Notion)
// ══════════════════════════════════════════════════════
function OAuthPanel({ connected, workspaceName, providerName, providerColor, onConnect, onDisconnect, loading }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '10px 14px',
      background: connected ? `${providerColor}10` : 'var(--bg4)',
      borderRadius: 9,
      border: `1px solid ${connected ? `${providerColor}30` : 'var(--border)'}`,
      transition: 'all 0.2s',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1 }}>
        {connected ? (
          <>
            <CheckCircle size={14} color={providerColor} />
            <span style={{ fontSize: 12, color: providerColor, fontWeight: 600 }}>
              {providerName} connected
              {workspaceName && (
                <span style={{ color: 'var(--t2)', fontWeight: 400 }}> · {workspaceName}</span>
              )}
            </span>
          </>
        ) : (
          <>
            <AlertCircle size={14} color="var(--t3)" />
            <span style={{ fontSize: 12, color: 'var(--t2)' }}>
              Connect {providerName} to sync your data
            </span>
          </>
        )}
      </div>
      {connected ? (
        <button className="btn btn-glass btn-sm" onClick={onDisconnect}>
          <LogOut size={11} /> Disconnect
        </button>
      ) : (
        <button className="btn btn-primary btn-sm" onClick={onConnect} disabled={loading}
          style={connected ? {} : { background: providerColor, color: '#0d0f14' }}>
          {loading ? <div className="spinner spinner-sm" /> : <LogIn size={11} />}
          {loading ? 'Connecting…' : `Connect ${providerName}`}
        </button>
      )}
    </div>
  )
}


// ══════════════════════════════════════════════════════
// GOOGLE AUTH PANEL
// ══════════════════════════════════════════════════════
function GoogleAuthPanel({ connected, onStatusChange }) {
  const [loading, setLoading] = useState(false)
  const popupRef = useRef(null)

  const connect = async () => {
    setLoading(true)
    try {
      const { url } = await getGoogleAuthUrl()
      const popup = window.open(url, 'google_oauth', 'width=520,height=620,scrollbars=yes')
      popupRef.current = popup
      const handler = (e) => {
        if (e.data?.type === 'oauth_success') {
          toast.success('✓ Google Calendar connected!')
          onStatusChange(true)
          window.removeEventListener('message', handler)
        } else if (e.data?.type === 'oauth_error') {
          toast.error(`Auth error: ${e.data.error}`)
          window.removeEventListener('message', handler)
        }
      }
      window.addEventListener('message', handler)
      const poll = setInterval(() => {
        if (popup?.closed) {
          clearInterval(poll)
          window.removeEventListener('message', handler)
          onStatusChange()
          setLoading(false)
        }
      }, 800)
    } catch (e) {
      toast.error(e.message)
      setLoading(false)
    }
  }

  const disconnect = async () => {
    try {
      await disconnectGoogle()
      onStatusChange(false)
      toast.success('Disconnected from Google')
    } catch (e) { toast.error(e.message) }
  }

  return (
    <OAuthPanel
      connected={connected}
      providerName="Google Calendar"
      providerColor="var(--blue)"
      loading={loading}
      onConnect={connect}
      onDisconnect={disconnect}
    />
  )
}


// ══════════════════════════════════════════════════════
// NOTION AUTH PANEL
// ══════════════════════════════════════════════════════
function NotionAuthPanel({ connected, workspaceName, onStatusChange }) {
  const [loading, setLoading] = useState(false)
  const popupRef = useRef(null)

  const connect = async () => {
    setLoading(true)
    try {
      const { url } = await getNotionAuthUrl()
      const popup = window.open(url, 'notion_oauth', 'width=560,height=680,scrollbars=yes')
      popupRef.current = popup

      const handler = (e) => {
        if (e.data?.type === 'oauth_success') {
          const ws = e.data.workspace || ''
          toast.success(`✓ Notion connected${ws ? ` — ${ws}` : ''}!`)
          onStatusChange(true, ws)
          window.removeEventListener('message', handler)
        } else if (e.data?.type === 'oauth_error') {
          toast.error(`Notion auth error: ${e.data.error}`)
          window.removeEventListener('message', handler)
        }
      }
      window.addEventListener('message', handler)

      const poll = setInterval(() => {
        if (popup?.closed) {
          clearInterval(poll)
          window.removeEventListener('message', handler)
          onStatusChange()   // re-check
          setLoading(false)
        }
      }, 800)
    } catch (e) {
      // If NOTION_CLIENT_ID not set, backend returns 400 with useful message
      toast.error(e.message || 'Could not get Notion auth URL. Set NOTION_CLIENT_ID in .env')
      setLoading(false)
    }
  }

  const disconnect = async () => {
    try {
      await disconnectNotion()
      onStatusChange(false, '')
      toast.success('Disconnected from Notion')
    } catch (e) { toast.error(e.message) }
  }

  return (
    <OAuthPanel
      connected={connected}
      workspaceName={workspaceName}
      providerName="Notion"
      providerColor="var(--t1)"
      loading={loading}
      onConnect={connect}
      onDisconnect={disconnect}
    />
  )
}


// ══════════════════════════════════════════════════════
// CALENDAR TAB
// ══════════════════════════════════════════════════════
function CalendarTab() {
  const [events,    setEvents]    = useState([])
  const [loading,   setLoading]   = useState(true)
  const [creating,  setCreating]  = useState(false)
  const [showForm,  setShowForm]  = useState(false)
  const [connected, setConnected] = useState(false)
  const [form, setForm] = useState({ title: '', start: '', end: '', description: '', with_meet: true })

  const checkStatus = useCallback(async (forceConnected) => {
    if (forceConnected !== undefined) { setConnected(forceConnected); if (forceConnected) load(); return }
    try { const s = await getGoogleStatus(); setConnected(s.connected); if (s.connected) load() } catch {}
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try { setEvents(await getCalendar(14)) } catch {}
    setLoading(false)
  }, [])

  useEffect(() => { checkStatus(); load() }, [])

  const create = async () => {
    if (!form.title || !form.start) { toast.error('Title and start time required'); return }
    setCreating(true)
    try {
      const startISO = new Date(form.start).toISOString()
      const endISO   = form.end ? new Date(form.end).toISOString() : new Date(+new Date(form.start) + 3600000).toISOString()
      const r = await createEvent({ ...form, start: startISO, end: endISO })
      if (r.mock) toast('Created (mock — connect Google for real sync)', { icon: 'ℹ️' })
      else toast.success('Event created in Google Calendar!')
      if (r.meet_link) toast(`🎥 ${r.meet_link}`, { duration: 7000 })
      setShowForm(false)
      setForm({ title: '', start: '', end: '', description: '', with_meet: true })
      load()
    } catch (e) { toast.error(e.message) }
    setCreating(false)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h2 style={{ fontFamily: 'var(--serif)', fontSize: 18, fontWeight: 600 }}>Calendar & Meet</h2>
          <p style={{ color: 'var(--t3)', fontSize: 11.5, marginTop: 2 }}>Next 14 days</p>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="btn btn-glass btn-sm" onClick={load}><RefreshCw size={11} /></button>
          <button className="btn btn-primary btn-sm" onClick={() => setShowForm(!showForm)}><Plus size={11} /> New Event</button>
        </div>
      </div>

      <GoogleAuthPanel connected={connected} onStatusChange={checkStatus} />

      {showForm && (
        <div className="card-glow" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div style={{ gridColumn: '1/-1' }}>
              <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--t3)', display: 'block', marginBottom: 4, textTransform: 'uppercase' }}>Title *</label>
              <input placeholder="Meeting title…" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
            </div>
            <div>
              <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--t3)', display: 'block', marginBottom: 4, textTransform: 'uppercase' }}>Start *</label>
              <input type="datetime-local" value={form.start} onChange={e => setForm(f => ({ ...f, start: e.target.value }))} />
            </div>
            <div>
              <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--t3)', display: 'block', marginBottom: 4, textTransform: 'uppercase' }}>End</label>
              <input type="datetime-local" value={form.end} onChange={e => setForm(f => ({ ...f, end: e.target.value }))} />
            </div>
            <div style={{ gridColumn: '1/-1' }}>
              <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--t3)', display: 'block', marginBottom: 4, textTransform: 'uppercase' }}>Description</label>
              <input placeholder="Optional description…" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
            </div>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12, color: 'var(--t2)' }}>
            <input type="checkbox" checked={form.with_meet} onChange={e => setForm(f => ({ ...f, with_meet: e.target.checked }))} style={{ width: 14, height: 14 }} />
            <Video size={12} color="var(--blue)" /> Auto-generate Google Meet link
          </label>
          <div style={{ display: 'flex', gap: 7 }}>
            <button className="btn btn-primary btn-sm" onClick={create} disabled={creating}>
              {creating ? <div className="spinner spinner-sm" /> : <Plus size={11} />} Create Event
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => setShowForm(false)}>Cancel</button>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', color: 'var(--t3)' }}><div className="spinner" /> Loading events…</div>
      ) : events.length === 0 ? (
        <div style={{ padding: 32, textAlign: 'center', color: 'var(--t3)', fontSize: 13 }}>
          {connected ? 'No upcoming events' : 'Connect Google Calendar to see your events'}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(270px, 1fr))', gap: 10 }}>
          {events.map(e => {
            const startDate = e.start ? new Date(e.start) : null
            return (
              <div key={e.id} className="card fade-up" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 6 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, flex: 1, lineHeight: 1.3 }}>{e.title}</div>
                  <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    {startDate && isToday(startDate)    && <span className="badge badge-green">Today</span>}
                    {startDate && isTomorrow(startDate) && <span className="badge badge-orange">Tomorrow</span>}
                    {e.meet_link && <span className="badge badge-blue"><Video size={9} /> Meet</span>}
                  </div>
                </div>
                {e.start && <div style={{ fontSize: 11, color: 'var(--t3)' }}>📅 {fmt(e.start)}</div>}
                {e.description && <div style={{ fontSize: 11, color: 'var(--t2)', lineHeight: 1.5 }}>{e.description}</div>}
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {e.meet_link && (
                    <a href={e.meet_link} target="_blank" rel="noreferrer"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', background: 'var(--bbg)', color: 'var(--blue)', borderRadius: 6, fontSize: 11, fontWeight: 600, textDecoration: 'none', border: '1px solid rgba(99,179,245,0.2)' }}>
                      <Video size={11} /> Join Meet
                    </a>
                  )}
                  {e.html_link && (
                    <a href={e.html_link} target="_blank" rel="noreferrer"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 8px', background: 'var(--bg4)', color: 'var(--t3)', borderRadius: 6, fontSize: 10, textDecoration: 'none', border: '1px solid var(--border)' }}>
                      <ExternalLink size={9} /> Google Cal
                    </a>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}


// ══════════════════════════════════════════════════════
// TODO TAB
// ══════════════════════════════════════════════════════
const P = {
  high:   { c: 'var(--red)',    bg: 'var(--rbg)' },
  medium: { c: 'var(--orange)', bg: 'var(--obg)' },
  low:    { c: 'var(--green)',  bg: 'var(--gbg)' },
}

function TodoTab({ project }) {
  const [todos,    setTodos]    = useState([])
  const [title,    setTitle]    = useState('')
  const [priority, setPriority] = useState('medium')
  const [due,      setDue]      = useState('')
  const [filter,   setFilter]   = useState('all')
  const [adding,   setAdding]   = useState(false)

  useEffect(() => { load() }, [project?.id])

  const load = () => getTodos(project?.id).then(setTodos).catch(() => {})

  const add = async () => {
    if (!title.trim()) return
    setAdding(true)
    try {
      const t = await createTodo({ title: title.trim(), priority, due_date: due || null, project_id: project?.id ? parseInt(project.id) : null })
      setTodos(p => [t, ...p]); setTitle(''); setDue('')
      toast.success('Task added!')
    } catch (e) { toast.error(e.message) }
    setAdding(false)
  }

  const toggle = async (id) => {
    const r = await toggleTodo(id)
    setTodos(p => p.map(t => t.id === id ? { ...t, done: r.done } : t))
  }

  const remove = async (id) => {
    await deleteTodo(id)
    setTodos(p => p.filter(t => t.id !== id))
  }

  const counts   = { all: todos.length, active: todos.filter(t => !t.done).length, done: todos.filter(t => t.done).length }
  const filtered = todos.filter(t => filter === 'all' ? true : filter === 'active' ? !t.done : t.done)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <h2 style={{ fontFamily: 'var(--serif)', fontSize: 18, fontWeight: 600 }}>Tasks</h2>
        <p style={{ color: 'var(--t3)', fontSize: 11.5, marginTop: 2 }}>{project ? `For "${project.name}"` : 'All projects'}</p>
      </div>

      <div className="card-glow" style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 9 }}>
        <div style={{ display: 'flex', gap: 7 }}>
          <input placeholder="New task… (Enter to add)" value={title} onChange={e => setTitle(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && add()} style={{ flex: 1 }} />
          <select value={priority} onChange={e => setPriority(e.target.value)} style={{ width: 110 }}>
            <option value="high">🔴 High</option>
            <option value="medium">🟡 Medium</option>
            <option value="low">🟢 Low</option>
          </select>
          <input type="date" value={due} onChange={e => setDue(e.target.value)} style={{ width: 130 }} />
          <button className="btn btn-primary btn-sm" onClick={add} disabled={adding || !title.trim()}>
            {adding ? <div className="spinner spinner-sm" /> : <Plus size={13} />}
          </button>
        </div>
      </div>

      <div className="tabs" style={{ width: 'fit-content' }}>
        {['all', 'active', 'done'].map(f => (
          <button key={f} className={`tab ${filter === f ? 'active' : ''}`} onClick={() => setFilter(f)}>
            {f.charAt(0).toUpperCase() + f.slice(1)} ({counts[f]})
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {filtered.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--t3)', fontSize: 12 }}>
            {filter === 'done' ? 'No completed tasks' : 'No tasks — add one above!'}
          </div>
        ) : filtered.map(t => {
          const pc = P[t.priority] || P.medium
          return (
            <div key={t.id} className="card fade-up" style={{ padding: '9px 13px', display: 'flex', alignItems: 'center', gap: 9, opacity: t.done ? 0.5 : 1, transition: 'opacity 0.15s' }}>
              <button onClick={() => toggle(t.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: t.done ? 'var(--green)' : 'var(--t3)', flexShrink: 0, padding: 2 }}>
                {t.done ? <CheckSquare size={16} /> : <Square size={16} />}
              </button>
              <span style={{ flex: 1, fontSize: 13, textDecoration: t.done ? 'line-through' : 'none', color: t.done ? 'var(--t3)' : 'var(--t1)' }}>{t.title}</span>
              {t.due_date && <span style={{ fontSize: 10, color: 'var(--t3)', whiteSpace: 'nowrap' }}>📅 {t.due_date}</span>}
              <span style={{ padding: '2px 7px', borderRadius: 4, background: pc.bg, color: pc.c, fontSize: 10, fontWeight: 700, whiteSpace: 'nowrap' }}>
                <Flag size={8} style={{ display: 'inline', marginRight: 2 }} />{t.priority}
              </span>
              <button onClick={() => remove(t.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t4)', padding: 2 }}
                onMouseEnter={e => e.currentTarget.style.color = 'var(--red)'}
                onMouseLeave={e => e.currentTarget.style.color = 'var(--t4)'}>
                <Trash2 size={12} />
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}


// ══════════════════════════════════════════════════════
// NOTION TAB  — full OAuth2 + pages + create note
// ══════════════════════════════════════════════════════
function NotionTab() {
  const [connected,      setConnected]      = useState(false)
  const [workspaceName,  setWorkspaceName]  = useState('')
  const [pages,          setPages]          = useState([])
  const [query,          setQuery]          = useState('')
  const [loading,        setLoading]        = useState(false)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [creating,       setCreating]       = useState(false)
  const [newTitle,       setNewTitle]       = useState('')
  const [newContent,     setNewContent]     = useState('')

  // Check connection status on mount
  useEffect(() => {
    getNotionStatus()
      .then(s => {
        setConnected(s.connected)
        setWorkspaceName(s.workspace_name || '')
        if (s.connected) loadPages()
      })
      .catch(() => {})
  }, [])

  const loadPages = useCallback(async (q = '') => {
    setLoading(true)
    try { setPages(await getNotion(q)) } catch {}
    setLoading(false)
  }, [])

  const handleStatusChange = (isConnected, wsName) => {
    if (isConnected !== undefined) {
      setConnected(isConnected)
      setWorkspaceName(wsName || '')
      if (isConnected) loadPages()
      else setPages([])
    } else {
      // Re-fetch status (called when popup closes without postMessage)
      getNotionStatus()
        .then(s => {
          setConnected(s.connected)
          setWorkspaceName(s.workspace_name || '')
          if (s.connected) loadPages()
        })
        .catch(() => {})
    }
  }

  const handleSearch = (e) => {
    if (e.key === 'Enter') loadPages(query)
  }

  const handleCreate = async () => {
    if (!newTitle.trim()) { toast.error('Title is required'); return }
    setCreating(true)
    try {
      const r = await createNotion({ title: newTitle.trim(), content: newContent.trim() })
      if (r.error) { toast.error(r.error); return }
      toast.success(`Page "${newTitle}" created in Notion!`)
      setNewTitle(''); setNewContent(''); setShowCreateForm(false)
      loadPages(query)
    } catch (e) { toast.error(e.message) }
    setCreating(false)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h2 style={{ fontFamily: 'var(--serif)', fontSize: 18, fontWeight: 600 }}>Notion</h2>
          <p style={{ color: 'var(--t3)', fontSize: 11.5, marginTop: 2 }}>Browse and create pages in your workspace</p>
        </div>
        {connected && (
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn btn-glass btn-sm" onClick={() => loadPages(query)}><RefreshCw size={11} /></button>
            <button className="btn btn-primary btn-sm" onClick={() => setShowCreateForm(v => !v)}>
              <PenLine size={11} /> New Page
            </button>
          </div>
        )}
      </div>

      {/* Auth panel */}
      <NotionAuthPanel
        connected={connected}
        workspaceName={workspaceName}
        onStatusChange={handleStatusChange}
      />

      {/* Workspace badge */}
      {connected && workspaceName && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '7px 12px', background: 'var(--bg3)', borderRadius: 7, border: '1px solid var(--border)', width: 'fit-content' }}>
          <Building2 size={11} color="var(--t3)" />
          <span style={{ fontSize: 11, color: 'var(--t2)' }}>Workspace: <strong style={{ color: 'var(--t1)' }}>{workspaceName}</strong></span>
        </div>
      )}

      {/* New page form */}
      {showCreateForm && (
        <div className="card-glow" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            New Notion Page
          </div>
          <div>
            <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--t3)', display: 'block', marginBottom: 4, textTransform: 'uppercase' }}>Title *</label>
            <input
              placeholder="Page title…"
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !newContent && handleCreate()}
            />
          </div>
          <div>
            <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--t3)', display: 'block', marginBottom: 4, textTransform: 'uppercase' }}>Content</label>
            <textarea
              placeholder="Page content… (optional)"
              value={newContent}
              onChange={e => setNewContent(e.target.value)}
              style={{ minHeight: 80, resize: 'vertical' }}
            />
          </div>
          <div style={{ display: 'flex', gap: 7 }}>
            <button className="btn btn-primary btn-sm" onClick={handleCreate} disabled={creating || !newTitle.trim()}>
              {creating ? <div className="spinner spinner-sm" /> : <Plus size={11} />} Create Page
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => { setShowCreateForm(false); setNewTitle(''); setNewContent('') }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Search — only when connected */}
      {connected && (
        <div style={{ display: 'flex', gap: 7 }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <Search size={12} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--t3)', pointerEvents: 'none' }} />
            <input
              placeholder="Search Notion pages…"
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={handleSearch}
              style={{ paddingLeft: 30 }}
            />
          </div>
          <button className="btn btn-glass btn-sm" onClick={() => loadPages(query)}>
            <Search size={11} /> Search
          </button>
        </div>
      )}

      {/* Pages list */}
      {!connected ? (
        <div style={{ padding: 40, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, color: 'var(--t3)' }}>
          <Book size={32} strokeWidth={1.2} style={{ opacity: 0.2 }} />
          <div style={{ fontSize: 13 }}>Connect Notion to browse and create pages</div>
          <div style={{ fontSize: 11 }}>Uses OAuth2 — no manual token needed</div>
        </div>
      ) : loading ? (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', color: 'var(--t3)' }}>
          <div className="spinner" /> Loading pages…
        </div>
      ) : pages.length === 0 ? (
        <div style={{ padding: 32, textAlign: 'center', color: 'var(--t3)', fontSize: 12 }}>
          {query ? `No pages matching "${query}"` : 'No pages found — try creating one above!'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {pages.map(p => (
            <a key={p.id} href={p.url} target="_blank" rel="noreferrer"
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 14px',
                background: 'var(--bg3)',
                borderRadius: 8, textDecoration: 'none',
                border: '1px solid var(--border)',
                transition: 'border-color 0.12s, background 0.12s',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--border2)'; e.currentTarget.style.background = 'var(--bg4)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)';  e.currentTarget.style.background = 'var(--bg3)' }}
            >
              {/* Icon based on object type */}
              {p.object === 'database'
                ? <FileText size={13} color="var(--blue)"   style={{ flexShrink: 0 }} />
                : <Book     size={13} color="var(--purple)" style={{ flexShrink: 0 }} />
              }
              <span style={{ flex: 1, fontSize: 13, color: 'var(--t1)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {p.title}
              </span>
              {p.object === 'database' && (
                <span className="badge badge-blue" style={{ fontSize: 9 }}>DB</span>
              )}
              <span style={{ fontSize: 10, color: 'var(--t3)', whiteSpace: 'nowrap' }}>
                {p.last_edited?.slice(0, 10)}
              </span>
              <ExternalLink size={10} color="var(--t3)" style={{ flexShrink: 0 }} />
            </a>
          ))}
        </div>
      )}
    </div>
  )
}


// ══════════════════════════════════════════════════════
// ROOT EXPORT
// ══════════════════════════════════════════════════════
export default function IntegrationsView({ project, initialTab }) {
  const [tab, setTab] = useState(initialTab || 'calendar')
  return (
    <div style={{ flex: 1, overflow: 'auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div>
        <h1 style={{ fontFamily: 'var(--serif)', fontSize: 24, fontWeight: 600, letterSpacing: '-0.02em' }}>Integrations</h1>
        <p style={{ color: 'var(--t3)', fontSize: 12, marginTop: 3 }}>Google Calendar · Notion · Todos</p>
      </div>
      <div className="tabs" style={{ width: 'fit-content' }}>
        <button className={`tab ${tab === 'calendar' ? 'active' : ''}`} onClick={() => setTab('calendar')}>📅 Calendar & Meet</button>
        <button className={`tab ${tab === 'todos'    ? 'active' : ''}`} onClick={() => setTab('todos')}>✅ Tasks</button>
        <button className={`tab ${tab === 'notion'   ? 'active' : ''}`} onClick={() => setTab('notion')}>📝 Notion</button>
      </div>
      {tab === 'calendar' && <CalendarTab />}
      {tab === 'todos'    && <TodoTab project={project} />}
      {tab === 'notion'   && <NotionTab />}
    </div>
  )
}
