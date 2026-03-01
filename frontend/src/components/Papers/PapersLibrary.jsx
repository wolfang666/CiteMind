import React, { useState, useEffect, useCallback } from 'react'
import { Search, BookOpen, Plus, ExternalLink, Trash2, RefreshCw, CheckSquare, Square } from 'lucide-react'
import { searchPapers, savePaper, deletePaper, listPapers, generateBib } from '../../services/api'
import toast from 'react-hot-toast'

const SOURCES = {
  crossref:         { label: 'CrossRef',         cls: 'src-crossref' },
  semantic_scholar: { label: 'Semantic Scholar',  cls: 'src-semantic' },
  openalex:         { label: 'OpenAlex',          cls: 'src-openalex' },
  arxiv:            { label: 'arXiv',             cls: 'src-arxiv'    },
  local:            { label: 'Library',           cls: 'badge-gray'   },
}

function PaperCard({ paper, onRemove, inLibrary, selected, onToggleSelect, showSelect }) {
  const [expanded, setExpanded] = useState(false)
  const src = SOURCES[paper.source] || SOURCES.local

  return (
    <div className="card" style={{
      padding: 13, display: 'flex', gap: 10, alignItems: 'flex-start',
      transition: 'border-color 0.12s, box-shadow 0.12s',
      borderColor: selected ? 'var(--a)' : undefined,
      boxShadow: selected ? '0 0 0 1px var(--a)' : undefined,
    }}
      onMouseEnter={e => { if (!selected) e.currentTarget.style.borderColor = 'var(--border2)' }}
      onMouseLeave={e => { if (!selected) e.currentTarget.style.borderColor = 'var(--border)' }}
    >
      {/* Checkbox */}
      {showSelect && (
        <button onClick={() => onToggleSelect(paper.cite_key)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: selected ? 'var(--a)' : 'var(--t4)', padding: '2px 0', flexShrink: 0, marginTop: 1 }}>
          {selected ? <CheckSquare size={15} /> : <Square size={15} />}
        </button>
      )}

      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', gap: 7, alignItems: 'flex-start' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t1)', lineHeight: 1.35, marginBottom: 3 }}>{paper.title}</div>
            <div style={{ fontSize: 11, color: 'var(--t3)', display: 'flex', flexWrap: 'wrap', gap: 5, alignItems: 'center' }}>
              {paper.authors && <span>{paper.authors.split(',').slice(0, 2).join(', ')}{paper.authors.split(',').length > 2 ? ' et al.' : ''}</span>}
              {paper.year && <><span style={{ color: 'var(--border2)' }}>·</span><span style={{ color: 'var(--t2)' }}>{paper.year}</span></>}
              {paper.citations > 0 && <><span style={{ color: 'var(--border2)' }}>·</span><span style={{ color: 'var(--green)' }}>{paper.citations.toLocaleString()} cited</span></>}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 4, flexShrink: 0, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <span className={`badge ${src.cls}`}>{src.label}</span>
            {inLibrary && <span className="badge badge-green" style={{ fontSize: 9 }}>✓ Saved</span>}
            {onRemove && (
              <button onClick={() => onRemove(paper)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t4)', padding: 3 }}
                onMouseEnter={e => e.currentTarget.style.color = 'var(--red)'}
                onMouseLeave={e => e.currentTarget.style.color = 'var(--t4)'}>
                <Trash2 size={12} />
              </button>
            )}
          </div>
        </div>

        {paper.abstract?.length > 30 && (
          <div style={{ fontSize: 11.5, color: 'var(--t2)', lineHeight: 1.6 }}>
            {expanded ? paper.abstract : paper.abstract.slice(0, 200) + '…'}
            <button onClick={() => setExpanded(!expanded)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--a)', fontSize: 10, fontWeight: 600, marginLeft: 5 }}>
              {expanded ? 'Less' : 'More'}
            </button>
          </div>
        )}

        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          {paper.doi && (
            <a href={`https://doi.org/${paper.doi}`} target="_blank" rel="noreferrer" className="btn btn-glass btn-xs" style={{ textDecoration: 'none' }}>
              <ExternalLink size={9} /> DOI
            </a>
          )}
          {paper.url && !paper.doi && (
            <a href={paper.url} target="_blank" rel="noreferrer" className="btn btn-glass btn-xs" style={{ textDecoration: 'none' }}>
              <ExternalLink size={9} /> Open
            </a>
          )}
          {paper.cite_key && (
            <button className="btn btn-glass btn-xs" onClick={() => {
              navigator.clipboard?.writeText(`\\cite{${paper.cite_key}}`)
              toast.success(`Copied \\cite{${paper.cite_key}}`)
            }}>
              {`📋 \\cite{${paper.cite_key}}`}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default function PapersLibrary({ project }) {
  const [query,      setQuery]      = useState('')
  const [results,    setResults]    = useState(null)
  const [library,    setLibrary]    = useState([])
  const [searching,  setSearching]  = useState(false)
  const [saving,     setSaving]     = useState(false)
  const [tab,        setTab]        = useState('search')
  const [srcFilter,  setSrcFilter]  = useState('all')
  const [selected,   setSelected]   = useState(new Set()) // cite_keys of checked papers
  const [libLoading, setLibLoading] = useState(false)

  const loadLibrary = useCallback(async () => {
    setLibLoading(true)
    try { setLibrary(await listPapers()) } catch {}
    setLibLoading(false)
  }, [])

  useEffect(() => { loadLibrary() }, [loadLibrary])

  const search = async () => {
    if (!query.trim()) return
    setSearching(true)
    setResults(null)
    setSelected(new Set())
    setTab('search')
    try {
      const r = await searchPapers({ query: query.trim(), limit: 5 })
      setResults(r)
      if (r.total === 0) toast('No results found', { icon: '🔍' })
      else toast.success(`Found ${r.total} papers across 4 sources`)
    } catch (e) { toast.error(e.message) }
    setSearching(false)
  }

  const toggleSelect = (citeKey) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(citeKey)) next.delete(citeKey)
      else next.add(citeKey)
      return next
    })
  }

  const selectAll = () => {
    const all = displayResults.map(p => p.cite_key)
    setSelected(new Set(all))
  }

  const clearSelection = () => setSelected(new Set())

  // Only add the selected papers (not all)
  const addSelected = async () => {
    if (!project) { toast.error('Select a project first from the Dashboard'); return }
    if (selected.size === 0) { toast.error('Check at least one paper first'); return }
    const toAdd = displayResults.filter(p => selected.has(p.cite_key))
    setSaving(true)
    let added = 0
    for (const paper of toAdd) {
      try {
        await savePaper({ ...paper, project_id: project.id })
        await generateBib(project.id, {
          title: paper.title, authors: paper.authors || '',
          year: String(paper.year || ''), doi: paper.doi || ''
        })
        added++
      } catch {}
    }
    toast.success(`Added ${added} paper${added !== 1 ? 's' : ''} to project`)
    setSelected(new Set())
    await loadLibrary()
    setSaving(false)
  }

  const handleRemove = async (paper) => {
    if (!paper.id) { toast.error('No DB id'); return }
    try {
      await deletePaper(paper.id)
      setLibrary(prev => prev.filter(p => p.id !== paper.id))
      toast.success('Removed from library')
    } catch (e) { toast.error(e.message) }
  }

  const libraryKeys = new Set(library.map(p => p.cite_key))
  const displayResults = results
    ? (srcFilter === 'all' ? results.all || [] : results[srcFilter] || [])
    : []

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header */}
      <div>
        <h1 style={{ fontFamily: 'var(--serif)', fontSize: 22, fontWeight: 600, letterSpacing: '-0.02em' }}>
          <BookOpen size={19} style={{ display: 'inline', marginRight: 8, verticalAlign: 'middle', color: 'var(--a)' }} />
          Paper Library
        </h1>
        <p style={{ color: 'var(--t3)', fontSize: 12, marginTop: 3 }}>
          CrossRef · Semantic Scholar · OpenAlex · arXiv — free, no API key
        </p>
      </div>

      {/* Search */}
      <div className="card-glow" style={{ padding: 13, display: 'flex', flexDirection: 'column', gap: 9 }}>
        <div style={{ display: 'flex', gap: 7 }}>
          <div style={{ flex: 1, position: 'relative' }}>
            <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--t3)', pointerEvents: 'none' }} />
            <input
              placeholder="Search: attention mechanism, BERT, diffusion models…"
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && search()}
              style={{ paddingLeft: 30, fontSize: 13 }}
            />
          </div>
          <button className="btn btn-primary" onClick={search} disabled={searching || !query.trim()} style={{ minWidth: 130 }}>
            {searching ? <><div className="spinner spinner-sm" /> Searching…</> : <><Search size={12} /> Search All</>}
          </button>
        </div>

        {/* Source filters */}
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center' }}>
          {['crossref', 'semantic_scholar', 'openalex', 'arxiv'].map(s => (
            <button key={s} onClick={() => setSrcFilter(srcFilter === s ? 'all' : s)}
              className={`badge ${SOURCES[s].cls}`}
              style={{ cursor: 'pointer', opacity: srcFilter === 'all' || srcFilter === s ? 1 : 0.3, transition: 'opacity 0.15s', border: 'none' }}>
              {SOURCES[s].label}{results?.[s] !== undefined ? ` (${results[s]?.length})` : ''}
            </button>
          ))}
          {results && <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--t3)' }}>{displayResults.length} results</span>}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div className="tabs" style={{ width: 'fit-content' }}>
          <button className={`tab ${tab === 'search' ? 'active' : ''}`} onClick={() => setTab('search')}>
            Search{results ? ` (${displayResults.length})` : ''}
          </button>
          <button className={`tab ${tab === 'library' ? 'active' : ''}`} onClick={() => setTab('library')}>
            My Library ({library.length})
          </button>
        </div>

        {/* Bulk add bar — only shown when something is selected in search tab */}
        {tab === 'search' && displayResults.length > 0 && (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: 'var(--t3)' }}>
              {selected.size > 0 ? `${selected.size} selected` : 'Check papers to add'}
            </span>
            <button className="btn btn-glass btn-xs" onClick={selectAll}>All</button>
            {selected.size > 0 && <button className="btn btn-glass btn-xs" onClick={clearSelection}>None</button>}
            <button
              className="btn btn-primary btn-sm"
              onClick={addSelected}
              disabled={saving || selected.size === 0}
              style={{ minWidth: 110 }}>
              {saving ? <div className="spinner spinner-sm" /> : <Plus size={11} />}
              {saving ? 'Adding…' : `Add ${selected.size > 0 ? selected.size : ''} to Project`}
            </button>
          </div>
        )}
      </div>

      {/* Search tab */}
      {tab === 'search' && (
        searching ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="card" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div className="skeleton" style={{ height: 14, width: `${55 + i * 10}%` }} />
                <div className="skeleton" style={{ height: 11, width: '40%' }} />
              </div>
            ))}
          </div>
        ) : !results ? (
          <div style={{ padding: 48, textAlign: 'center', color: 'var(--t3)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
            <Search size={36} strokeWidth={1} style={{ opacity: 0.1 }} />
            <div style={{ fontFamily: 'var(--serif)', fontSize: 16 }}>Search to discover papers</div>
            <div style={{ fontSize: 12 }}>Searches CrossRef, Semantic Scholar, OpenAlex, and arXiv simultaneously</div>
          </div>
        ) : displayResults.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--t3)', fontSize: 13 }}>
            No results {srcFilter !== 'all' && `from ${SOURCES[srcFilter]?.label}`}
            {srcFilter !== 'all' && <button className="btn btn-ghost btn-sm" style={{ marginLeft: 8 }} onClick={() => setSrcFilter('all')}>Show all</button>}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {displayResults.map((p, i) => (
              <PaperCard
                key={`${p.cite_key || i}`}
                paper={p}
                inLibrary={libraryKeys.has(p.cite_key)}
                selected={selected.has(p.cite_key)}
                onToggleSelect={toggleSelect}
                showSelect={true}
              />
            ))}
          </div>
        )
      )}

      {/* Library tab */}
      {tab === 'library' && (
        libLoading ? (
          <div style={{ display: 'flex', gap: 8, color: 'var(--t3)' }}><div className="spinner" /> Loading…</div>
        ) : library.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center', color: 'var(--t3)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
            <BookOpen size={36} strokeWidth={1} style={{ opacity: 0.1 }} />
            <div style={{ fontFamily: 'var(--serif)', fontSize: 16 }}>Library is empty</div>
            <div style={{ fontSize: 12 }}>Search papers, check the ones you want, then click "Add to Project"</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: 'var(--t3)' }}>{library.length} saved papers</span>
              <button className="btn btn-glass btn-sm" onClick={loadLibrary}><RefreshCw size={11} /> Refresh</button>
            </div>
            {library.map((p, i) => (
              <PaperCard key={`lib-${p.id || i}`} paper={{ ...p, source: p.source || 'local' }}
                onRemove={handleRemove} inLibrary={true} showSelect={false} />
            ))}
          </div>
        )
      )}
    </div>
  )
}
