import { useState, useEffect, useCallback, useRef } from 'react'
import { getTex, updateTex, getBib, getSections, getStats } from '../services/api'

export function usePaperState(projectId) {
  const [tex,      setTex]     = useState('')
  const [bib,      setBib]     = useState('')
  const [sections, setSections]= useState([])
  const [stats,    setStats]   = useState(null)
  const [loading,  setLoading] = useState(false)
  const [saving,   setSaving]  = useState(false)

  const saveTimerRef = useRef(null)

  const loadAll = useCallback(async () => {
    if (!projectId) { setTex(''); setBib(''); setSections([]); setStats(null); return }
    setLoading(true)
    try {
      // Parallel fetch for speed
      const [texData, bibData, secData, statsData] = await Promise.all([
        getTex(projectId),
        getBib(projectId),
        getSections(projectId),
        getStats(projectId).catch(() => null),
      ])
      setTex(texData.content || '')
      setBib(bibData.content || '')
      setSections(secData.sections || [])
      if (statsData) setStats(statsData)
    } catch (e) { console.error('loadAll:', e) }
    setLoading(false)
  }, [projectId])

  useEffect(() => { loadAll() }, [loadAll])

  const refreshSections = useCallback(async () => {
    if (!projectId) return
    try { const d = await getSections(projectId); setSections(d.sections || []) } catch {}
  }, [projectId])

  const refreshStats = useCallback(async () => {
    if (!projectId) return
    try { setStats(await getStats(projectId)) } catch {}
  }, [projectId])

  // Reload tex from disk — call after LLM finishes writing
  const reloadTex = useCallback(async () => {
    if (!projectId) return
    try { const d = await getTex(projectId); setTex(d.content || '') } catch {}
  }, [projectId])

  const saveTex = useCallback(async (content) => {
    if (!projectId) return
    setSaving(true)
    try {
      await updateTex(projectId, content)
      const d = await getSections(projectId)
      setSections(d.sections || [])
    } catch (e) { console.error('saveTex:', e) }
    setSaving(false)
  }, [projectId])

  // Debounced auto-save (2s after last keystroke)
  const debouncedSave = useCallback((content) => {
    clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      if (projectId) saveTex(content)
    }, 2000)
  }, [projectId, saveTex])

  return { tex, setTex, bib, sections, stats, loading, saving, saveTex, loadAll, refreshSections, refreshStats, reloadTex, debouncedSave }
}
