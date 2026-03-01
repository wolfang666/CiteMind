import React, { useState, useEffect, useCallback, useRef } from 'react'
import { Toaster } from 'react-hot-toast'
import toast from 'react-hot-toast'
import Sidebar from './components/Layout/Sidebar.jsx'
import Topbar from './components/Layout/Topbar.jsx'
import Dashboard from './components/Dashboard/Dashboard.jsx'
import PapersLibrary from './components/Papers/PapersLibrary.jsx'
import LatexEditor from './components/Editor/LatexEditor.jsx'
import OutlinePanel from './components/Editor/OutlinePanel.jsx'
import Copilot from './components/Copilot/Copilot.jsx'
import IntegrationsView from './components/Integrations/IntegrationsView.jsx'
import NotificationsView from './components/Integrations/NotificationsView.jsx'
import { usePaperState } from './hooks/usePaperState.js'
import { checkHealth, verifyCitations, getNotifications, exportProject } from './services/api.js'

// ── Persist view + project across page refreshes ──────────────────
const SS = {
  getView: ()  => sessionStorage.getItem('cm_view') || 'dashboard',
  setView: (v) => sessionStorage.setItem('cm_view', v),
  getProj: ()  => { try { return JSON.parse(sessionStorage.getItem('cm_project')) } catch { return null } },
  setProj: (p) => sessionStorage.setItem('cm_project', p ? JSON.stringify(p) : 'null'),
}

export default function App() {
  const [view,       setView]       = useState(() => SS.getView())
  const [project,    setProject]    = useState(() => SS.getProj())
  const [serverOk,   setServerOk]   = useState(false)
  const [llm,        setLlm]        = useState(null)
  const [notifCount, setNotifCount] = useState(0)
  const [activeSection, setActiveSection] = useState(null)

  const navigate = (v) => { setView(v); SS.setView(v) }

  const selectProject = useCallback((p) => {
    setProject(p); SS.setProj(p)
    if (p) navigate('editor')
  }, [])

  const {
    tex, setTex, bib, sections, loading, saving,
    saveTex, loadAll, refreshSections, reloadTex, debouncedSave
  } = usePaperState(project?.id)

  const texRef = useRef(tex)
  useEffect(() => { texRef.current = tex }, [tex])

  // ── Health check ─────────────────────────────────────────────
  useEffect(() => {
    const check = async () => {
      try { const h = await checkHealth(); setServerOk(true); if (h.llm) setLlm(h.llm) }
      catch { setServerOk(false) }
    }
    check(); const t = setInterval(check, 20000); return () => clearInterval(t)
  }, [])

  // ── Notification badge ────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      try { const n = await getNotifications(); setNotifCount(n.length) } catch {}
    }
    load(); const t = setInterval(load, 60000); return () => clearInterval(t)
  }, [])

  // ── Topbar handlers ───────────────────────────────────────────
  const handleSave = useCallback(() => {
    if (!project) return
    saveTex(texRef.current)
  }, [project, saveTex])

  const handleVerify = useCallback(async () => {
    if (!project) return toast.error('Select a project first')
    try {
      const r = await verifyCitations(project.id)
      const missing = r.missing_from_bib?.length || 0
      const unused  = r.unused_in_tex?.length || 0
      if (missing === 0 && unused === 0) toast.success('All citations clean ✓')
      else toast(`⚠ Missing: ${missing} | Unused: ${unused}`, { icon: '🔍', duration: 5000 })
    } catch (e) { toast.error(e.message) }
  }, [project])

  const handleExport = useCallback(() => {
    if (!project) return toast.error('Select a project first')
    exportProject(project.id)
  }, [project])

  // ── Copilot → editor callbacks ───────────────────────────────
  // Called when streaming is done — reload canonical file from disk
  const handleStreamDone = useCallback(async () => {
    await reloadTex()
    await refreshSections()
  }, [reloadTex, refreshSections])

  // Called when user clicks "Insert into paper" in Copilot
  // Appends the text at end of current tex content
  const handleInsertText = useCallback((text) => {
    setTex(prev => {
      // Find a good insertion point — before \end{document} or just append
      const endMatch = prev.match(/\\end\{document\}/)
      if (endMatch) {
        const idx = prev.lastIndexOf('\\end{document}')
        const formatted = `\n\n% AI-generated content\n${text.trim()}\n`
        const next = prev.slice(0, idx) + formatted + prev.slice(idx)
        texRef.current = next
        debouncedSave(next)
        return next
      }
      const next = prev + `\n\n% AI-generated\n${text.trim()}\n`
      texRef.current = next
      debouncedSave(next)
      return next
    })
  }, [setTex, debouncedSave])

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--bg)' }}>
      <Toaster position="bottom-right" toastOptions={{
        style: { fontFamily: 'var(--font)', fontSize: 12.5, background: 'var(--bg3)', color: 'var(--t1)', border: '1px solid var(--border)', borderRadius: 9 },
        success: { iconTheme: { primary: 'var(--green)', secondary: 'var(--bg3)' } },
        error:   { iconTheme: { primary: 'var(--red)',   secondary: 'var(--bg3)' } },
      }} />

      <Sidebar view={view} onView={navigate} notifCount={notifCount} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
        <Topbar project={project} saving={saving} serverOk={serverOk} llm={llm}
          onSave={handleSave} onVerify={handleVerify} onExport={handleExport} />

        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

          {view === 'dashboard' && <Dashboard project={project} onProjectChange={selectProject} />}
          {view === 'papers'    && <PapersLibrary project={project} />}

          {(view === 'integrations' || view === 'calendar' || view === 'todos') && (
            <IntegrationsView project={project}
              initialTab={view === 'todos' ? 'todos' : view === 'calendar' ? 'calendar' : 'calendar'} />
          )}

          {view === 'notifications' && (
            <NotificationsView onNavigate={v => { navigate(v); setNotifCount(0) }} />
          )}

          {view === 'editor' && (
            <>
              <OutlinePanel sections={sections} activeSection={activeSection} onSectionClick={setActiveSection} />

              <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minWidth: 0 }}>
                {loading ? (
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, color: 'var(--t3)' }}>
                    <div className="spinner" /> Loading project…
                  </div>
                ) : !project ? (
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, color: 'var(--t3)' }}>
                    <div style={{ fontSize: 48, opacity: 0.07 }}>📄</div>
                    <div style={{ fontFamily: 'var(--serif)', fontSize: 18, color: 'var(--t2)' }}>No project selected</div>
                    <button className="btn btn-primary" onClick={() => navigate('dashboard')}>Go to Dashboard</button>
                  </div>
                ) : (
                  <LatexEditor
                    pid={project.id}
                    value={tex}
                    onChange={val => { setTex(val); debouncedSave(val) }}
                    onSave={saveTex}
                  />
                )}
              </div>

              <Copilot
                project={project}
                llm={llm}
                onStreamDone={handleStreamDone}
                onRefresh={loadAll}
                onInsertText={handleInsertText}
              />
            </>
          )}

        </div>
      </div>
    </div>
  )
}
