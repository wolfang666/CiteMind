import React, { useState, useRef, useEffect, useCallback } from 'react'
import { Sparkles, Send, Bot, ChevronDown, ChevronRight, Wrench, Copy, FileText } from 'lucide-react'
import { sendChat, callTool, getTools, streamSection } from '../../services/api'
import toast from 'react-hot-toast'

const QUICK_ACTIONS = [
  { label: 'Abstract',    icon: '', tool: 'write_section',     params: pid => ({ project_id: pid, section_name: 'Abstract',     context: 'concise research paper abstract' }) },
  { label: 'Intro',       icon: '', tool: 'write_section',     params: pid => ({ project_id: pid, section_name: 'Introduction', context: 'paper introduction and motivation' }) },
  { label: 'Methods',     icon: '', tool: 'write_section',     params: pid => ({ project_id: pid, section_name: 'Methodology',  context: 'research methodology and approach' }) },
  { label: 'Conclusion',  icon: '', tool: 'write_section',     params: pid => ({ project_id: pid, section_name: 'Conclusion',   context: 'conclusion and future work' }) },
  { label: 'Verify',      icon: '', tool: 'verify_citations',  params: pid => ({ project_id: pid }) },
  { label: 'Stats',       icon: '', tool: 'get_project_stats', params: pid => ({ project_id: pid }) },
  { label: 'Calendar',    icon: '', tool: 'get_calendar_events', params: () => ({ days: 7 }) },
  { label: 'Todos',       icon: '', tool: 'list_todos',        params: () => ({}) },
]

function ToolResult({ result }) {
  const [open, setOpen] = useState(false)
  if (!result) return null
  return (
    <div style={{ marginTop: 4, background: 'var(--bg4)', border: '1px solid var(--border2)', borderRadius: 7, overflow: 'hidden' }}>
      <button onClick={() => setOpen(!open)} style={{ width: '100%', padding: '4px 9px', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, color: 'var(--t3)', fontSize: 10, textAlign: 'left' }}>
        <Wrench size={9} color="var(--a)" />
        <span style={{ flex: 1, fontWeight: 600 }}>{result.summary || 'Tool result'}</span>
        {open ? <ChevronDown size={9} /> : <ChevronRight size={9} />}
      </button>
      {open && (
        <div style={{ padding: '0 9px 7px', fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--t3)', whiteSpace: 'pre-wrap', maxHeight: 130, overflowY: 'auto' }}>
          {JSON.stringify(result, null, 2)}
        </div>
      )}
    </div>
  )
}

// "Insert into paper" button — appears on AI messages that have insertable text
function InsertButton({ text, onInsert }) {
  if (!text || text.length < 20) return null
  // Only show if text looks like LaTeX or substantial prose
  const isLatex = text.includes('\\') || text.includes('$') || text.includes('%')
  const isSubstantial = text.length > 60
  if (!isLatex && !isSubstantial) return null
  return (
    <button
      onClick={() => onInsert(text)}
      className="btn btn-glass btn-xs"
      style={{ marginTop: 5, fontSize: 10, gap: 3 }}>
      <FileText size={9} /> Insert into paper
    </button>
  )
}

function Msg({ m, onInsertIntoPaper }) {
  const ai = m.role === 'assistant'
  return (
    <div style={{ display: 'flex', gap: 7, padding: '4px 0', animation: 'fadeUp 0.18s ease', flexDirection: ai ? 'row' : 'row-reverse' }}>
      <div style={{ width: 22, height: 22, borderRadius: '50%', flexShrink: 0, marginTop: 3, display: 'flex', alignItems: 'center', justifyContent: 'center', background: ai ? 'linear-gradient(135deg,var(--a),#e8831a)' : 'var(--bg4)', border: '1px solid var(--border)' }}>
        {ai ? <Sparkles size={10} color="#0d0f14" /> : <Bot size={10} color="var(--t3)" />}
      </div>
      <div style={{ maxWidth: '88%', display: 'flex', flexDirection: 'column', gap: 3 }}>
        <div style={{ padding: '8px 11px', background: ai ? 'var(--bg3)' : 'var(--bg4)', color: 'var(--t1)', borderRadius: ai ? '3px 9px 9px 9px' : '9px 3px 9px 9px', border: '1px solid var(--border)', fontSize: 12, lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
          {m.content}
          {m.streaming && <span style={{ display: 'inline-block', width: 7, height: 13, background: 'var(--a)', marginLeft: 2, verticalAlign: 'text-bottom', animation: 'pulse 0.8s infinite', borderRadius: 1 }} />}
        </div>
        {m.toolResult && <ToolResult result={m.toolResult} />}
        {/* Insert into paper — for AI responses with LaTeX/text content */}
        {ai && !m.streaming && m.content && onInsertIntoPaper && (
          <InsertButton text={m.content} onInsert={onInsertIntoPaper} />
        )}
      </div>
    </div>
  )
}

export default function Copilot({ project, llm, onStreamDone, onRefresh, onInsertText }) {
  const [msgs, setMsgs]   = useState([{
    role: 'assistant',
    content: `Hi! I'm CiteMind Copilot \n\nI can:\n• Stream LaTeX sections directly into the editor\n• Search papers from 4 sources\n• Verify citations\n• Check calendar & todos\n• Insert AI responses into your paper\n\nTry: "write introduction about transformers"`
  }])
  const [input, setInput] = useState('')
  const [busy,  setBusy]  = useState(false)
  const [tools, setTools] = useState([])
  const bottom = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => { bottom.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs])
  useEffect(() => { getTools().then(setTools).catch(() => {}) }, [])

  const updateLast = useCallback((content, toolResult = null, streaming = false) => {
    setMsgs(p => { const u = [...p]; u[u.length - 1] = { ...u[u.length - 1], content, toolResult, streaming }; return u })
  }, [])

  // Handle "Insert into paper" — appends text to the current tex content
  const handleInsert = useCallback((text) => {
    if (!project) { toast.error('Select a project first'); return }
    if (onInsertText) {
      onInsertText(text)
      toast.success('Inserted into editor ✓')
    }
  }, [project, onInsertText])

  // Stream write section
  const streamWrite = useCallback(async (sectionName, context, instructions = '') => {
    if (!project) { toast.error('Select a project first'); return }
    setBusy(true)
    setMsgs(p => [...p, { role: 'assistant', content: `Writing "${sectionName}"…`, streaming: true }])
    let accumulated = ''
    try {
      await streamSection(
        project.id,
        { section_name: sectionName, context, instructions },
        (token) => {
          accumulated += token
          setMsgs(p => { const u = [...p]; u[u.length - 1] = { ...u[u.length - 1], content: accumulated, streaming: true }; return u })
        },
        () => {
          setMsgs(p => { const u = [...p]; u[u.length - 1] = { ...u[u.length - 1], content: accumulated, streaming: false }; return u })
          onStreamDone && onStreamDone()
        }
      )
    } catch (e) {
      updateLast(`Error: ${e.message}`)
      onRefresh && onRefresh()
    }
    setBusy(false)
  }, [project, onStreamDone, onRefresh, updateLast])

  // Run MCP tool
  const runTool = useCallback(async (toolName, params) => {
    setBusy(true)
    setMsgs(p => [...p, { role: 'assistant', content: '', streaming: true }])
    try {
      const result = await callTool(toolName, params)
      let display = result.summary || `✓ ${toolName}`

      if (result.section && (result.content || result.edited)) {
        display = `✓ "${result.section}" written\n\n${(result.content || result.edited || '').slice(0, 300)}…`
        onRefresh && onRefresh()
      }
      if (result.todos) {
        const pending = result.todos.filter(t => !t.done).slice(0, 6)
        display = ` ${result.pending_count || pending.length} tasks:\n${pending.map(t => `• [${t.priority}] ${t.title}${t.due_date ? ' (' + t.due_date + ')' : ''}`).join('\n')}`
      }
      if (result.events) {
        display = ` ${result.count} upcoming:\n${result.events.slice(0, 5).map(e => `• ${e.title}${e.meet_link ? ' ' : ''}${e.start ? ' · ' + e.start.slice(0, 10) : ''}`).join('\n')}`
      }
      if (result.results) {
        const papers = result.results.all || []
        display = ` ${result.results.total} papers:\n${papers.slice(0, 4).map(p => `• ${p.title.slice(0, 65)} (${p.year || 'n.d.'}) [${p.source}]`).join('\n')}`
      }
      updateLast(display, result)
    } catch (e) { updateLast(`Error: ${e.message}`) }
    setBusy(false)
  }, [onRefresh, updateLast])

  const handleSend = useCallback(async () => {
    const text = input.trim()
    if (!text || busy) return
    setInput('')
    setMsgs(p => [...p, { role: 'user', content: text }])
    inputRef.current?.focus()

    const low = text.toLowerCase()
    const writeM  = low.match(/(?:write|draft|generate|create)\s+(?:a\s+|the\s+)?(?:latex\s+)?([a-z][a-z\s]{2,25?})(?:\s+section|\s+for me)?(?:\s+(?:about|on|for|of)\s+(.+))?$/i)
    const searchM = low.match(/(?:find|search|look up|papers?)\s+(?:about|on|for)?\s+(.+)/i)
    const taskM   = low.match(/(?:add|create)\s+(?:a\s+)?(?:task|todo)[:\s]+(.+)/i)
    const editM   = low.match(/(?:edit|fix|improve|rewrite|refine)\s+(?:the\s+)?([a-z][a-z\s]{2,20?}?)(?:\s+section)?[:\s]+(.+)/i)
    const insertM = low.match(/(?:insert|add to paper|append)\s+(.+)/i)

    if (writeM && project) {
      const secName = writeM[1].trim().replace(/\b\w/g, c => c.toUpperCase())
      const about   = writeM[2] || text
      await streamWrite(secName, about)

    } else if (insertM && project) {
      // User explicitly asks to insert something
      setBusy(true)
      setMsgs(p => [...p, { role: 'assistant', content: '', streaming: true }])
      try {
        const r = await sendChat({ message: insertM[1], context: project ? `Project: ${project.name}` : '', project_id: project?.id })
        updateLast(r.response)
        // Auto-insert
        onInsertText && onInsertText(r.response)
        toast.success('Inserted into editor ✓')
      } catch (e) { updateLast(`Error: ${e.message}`) }
      setBusy(false)

    } else if (editM && project) {
      await runTool('edit_section', { project_id: project.id, section_name: editM[1].trim().replace(/\b\w/g, c => c.toUpperCase()), instruction: editM[2].trim() })
      onRefresh && onRefresh()

    } else if (searchM) {
      await runTool('search_papers', { query: searchM[1].trim(), limit: 4 })

    } else if ((low.includes('verify') || low.includes('citation')) && project) {
      await runTool('verify_citations', { project_id: project.id })

    } else if (low.includes('stats') && project) {
      await runTool('get_project_stats', { project_id: project.id })

    } else if (taskM) {
      await runTool('add_todo', { title: taskM[1].trim(), priority: 'medium' })

    } else if (low.includes('todo') || low.includes('task')) {
      await runTool('list_todos', {})

    } else if (low.includes('calendar') || low.includes('meeting') || low.includes('schedule')) {
      await runTool('get_calendar_events', { days: 7 })

    } else {
      // General Groq chat
      setBusy(true)
      setMsgs(p => [...p, { role: 'assistant', content: '', streaming: true }])
      try {
        const r = await sendChat({ message: text, context: project ? `Project: ${project.name}` : '', project_id: project?.id })
        updateLast(r.response)
      } catch (e) { updateLast(`Error: ${e.message}`) }
      setBusy(false)
    }
  }, [input, busy, project, streamWrite, runTool, onInsertText, onRefresh, updateLast])

  const b = llm?.backend || 'mock'
  const llmLabel = { groq: ' Groq', ollama: '🖥 Ollama', claude: '☁️ Claude', mock: ' Mock' }[b] || b

  return (
    <div style={{ width: 300, background: 'var(--bg2)', borderLeft: '1px solid var(--border)', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
      {/* Header */}
      <div style={{ padding: '9px 12px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <div style={{ width: 26, height: 26, borderRadius: 8, background: 'linear-gradient(135deg,var(--a),#e8831a)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 8px rgba(245,166,35,0.3)', flexShrink: 0 }}>
          <Sparkles size={12} color="#0d0f14" />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--t1)' }}>AI Copilot</div>
          <div style={{ fontSize: 10, color: 'var(--t3)' }}>{llmLabel} · {tools.length} tools</div>
        </div>
        {busy && <div className="spinner spinner-sm" />}
      </div>

      {/* Quick actions */}
      <div style={{ padding: '6px 8px', borderBottom: '1px solid var(--border)', display: 'flex', flexWrap: 'wrap', gap: 3, flexShrink: 0 }}>
        {QUICK_ACTIONS.map(q => (
          <button key={q.label} disabled={busy}
            onClick={() => {
              const needsProj = q.tool.includes('section') || q.tool.includes('citation') || q.tool.includes('stat')
              if (needsProj && !project) { toast.error('Select a project first'); return }
              if (q.tool === 'write_section') {
                const p = q.params(project?.id)
                streamWrite(p.section_name, p.context)
              } else {
                runTool(q.tool, q.params(project?.id))
              }
            }}
            className="btn btn-glass btn-xs" style={{ fontSize: 10, gap: 2 }}>
            {q.icon} {q.label}
          </button>
        ))}
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '5px 9px' }}>
        {msgs.map((m, i) => (
          <Msg key={i} m={m} onInsertIntoPaper={project ? handleInsert : null} />
        ))}
        <div ref={bottom} />
      </div>

      {/* Input */}
      <div style={{ padding: '6px 9px', borderTop: '1px solid var(--border)', display: 'flex', gap: 5, flexShrink: 0 }}>
        <textarea
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
          placeholder={project ? 'Write intro, search papers, insert text…' : 'Ask anything…'}
          disabled={busy}
          rows={2}
          style={{ flex: 1, resize: 'none', maxHeight: 72, fontSize: 12, lineHeight: 1.5 }}
        />
        <button className="btn btn-primary btn-icon" onClick={handleSend} disabled={busy || !input.trim()} style={{ alignSelf: 'flex-end', padding: 7 }}>
          <Send size={13} />
        </button>
      </div>
    </div>
  )
}
