import React, { useRef, useEffect, useCallback, useState } from 'react'
import Editor from '@monaco-editor/react'
import { FileText, Play, AlertTriangle, CheckCircle, XCircle, Eye, Code, ChevronDown, ChevronUp } from 'lucide-react'
import { compileLatex, getPdfUrl } from '../../services/api'
import toast from 'react-hot-toast'

// ── Compiler Output Panel ─────────────────────────────────────────
function CompilerPanel({ pid, output, compiling, onCompile }) {
  const [pdfVisible, setPdfVisible] = useState(false)
  const pdfUrl = pid ? getPdfUrl(pid) : null

  return (
    <div style={{
      height: pdfVisible ? 340 : 200,
      background: '#0a0c10', borderTop: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column', flexShrink: 0,
      transition: 'height 0.2s ease',
    }}>
      {/* Toolbar */}
      <div style={{ height: 32, background: 'var(--bg2)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', padding: '0 10px', gap: 8, flexShrink: 0 }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Compiler Output</span>
        {output && (
          output.success
            ? <span style={{ fontSize: 10, color: 'var(--green)', display: 'flex', alignItems: 'center', gap: 4 }}><CheckCircle size={10} /> Compiled OK</span>
            : <span style={{ fontSize: 10, color: 'var(--red)', display: 'flex', alignItems: 'center', gap: 4 }}><XCircle size={10} /> {output.errors?.length} error(s)</span>
        )}
        <div style={{ flex: 1 }} />
        {output?.success && pdfUrl && (
          <button className="btn btn-glass btn-xs" onClick={() => setPdfVisible(!pdfVisible)}>
            <Eye size={10} /> {pdfVisible ? 'Hide' : 'Preview'} PDF
          </button>
        )}
        <button className="btn btn-primary btn-xs" onClick={onCompile} disabled={compiling || !pid}>
          {compiling ? <><div className="spinner spinner-sm" /> Compiling…</> : <><Play size={10} /> Compile</>}
        </button>
      </div>

      {pdfVisible && output?.success && pdfUrl ? (
        <iframe
          src={pdfUrl + '?t=' + Date.now()}
          style={{ flex: 1, border: 'none', background: '#fff' }}
          title="PDF Preview"
        />
      ) : (
        <div style={{ flex: 1, overflow: 'auto', padding: '8px 12px', fontFamily: 'var(--mono)', fontSize: 11, lineHeight: 1.7 }}>
          {!output && !compiling && (
            <div style={{ color: 'var(--t4)', paddingTop: 8 }}>
              Press <kbd style={{ background: 'var(--bg4)', padding: '1px 5px', borderRadius: 3, fontSize: 10 }}>Compile</kbd> to run pdflatex on your document.
            </div>
          )}
          {compiling && (
            <div style={{ color: 'var(--t3)', display: 'flex', gap: 8, alignItems: 'center', paddingTop: 8 }}>
              <div className="spinner spinner-sm" /> Running pdflatex…
            </div>
          )}
          {output && !compiling && (
            <>
              {output.errors?.length > 0 && (
                <div style={{ marginBottom: 8 }}>
                  {output.errors.map((e, i) => (
                    <div key={i} style={{ color: 'var(--red)', padding: '2px 0' }}>❌ {e}</div>
                  ))}
                </div>
              )}
              {output.warnings?.length > 0 && (
                <div style={{ marginBottom: 8 }}>
                  {output.warnings.slice(0, 5).map((w, i) => (
                    <div key={i} style={{ color: 'var(--orange)', padding: '2px 0' }}>⚠ {w}</div>
                  ))}
                </div>
              )}
              <div style={{ color: 'var(--t4)', whiteSpace: 'pre-wrap', marginTop: 4, maxHeight: 120, overflow: 'auto' }}>
                {output.log?.split('\n').filter(l =>
                  l.includes('Error') || l.includes('Warning') || l.includes('error') || l.startsWith('!')
                ).slice(0, 30).join('\n') || output.log?.slice(-1500)}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main Editor ───────────────────────────────────────────────────
export default function LatexEditor({ pid, value, onChange, onSave }) {
  const editorRef   = useRef(null)
  const monacoRef   = useRef(null)
  const onSaveRef   = useRef(onSave)
  const onChangeRef = useRef(onChange)
  const [compiling, setCompiling]     = useState(false)
  const [compileOut, setCompileOut]   = useState(null)
  const [showCompiler, setShowCompiler] = useState(true)

  useEffect(() => { onSaveRef.current = onSave }, [onSave])
  useEffect(() => { onChangeRef.current = onChange }, [onChange])

  const handleMount = useCallback((editor, monaco) => {
    editorRef.current = editor; monacoRef.current = monaco
    // Ctrl+S → save
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      onSaveRef.current(editor.getValue())
    })
    // Ctrl+Shift+B → compile
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyB, () => {
      handleCompile()
    })
  }, [])  // eslint-disable-line

  // Sync external value changes (streaming, reloadTex)
  useEffect(() => {
    const ed = editorRef.current
    if (!ed || ed.getValue() === value) return
    const pos = ed.getPosition()
    ed.setValue(value || '')
    if (pos) ed.setPosition(pos)
  }, [value])

  const handleCompile = useCallback(async () => {
    if (!pid) { toast.error('Select a project first'); return }
    setCompiling(true)
    setCompileOut(null)
    setShowCompiler(true)
    // Save first
    if (editorRef.current) {
      await onSaveRef.current(editorRef.current.getValue())
    }
    try {
      const out = await compileLatex(pid)
      setCompileOut(out)
      if (out.success) toast.success('✓ Compiled successfully — PDF ready', { duration: 3000 })
      else toast.error(`${out.errors?.length || 0} LaTeX errors`, { duration: 4000 })
    } catch (e) {
      setCompileOut({ success: false, log: e.message, errors: [e.message], warnings: [] })
      toast.error(e.message)
    }
    setCompiling(false)
  }, [pid])

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
      {/* Tab bar */}
      <div style={{ height: 36, background: 'var(--bg2)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', padding: '0 12px', gap: 8, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 9px', background: 'var(--bg3)', borderRadius: 5, border: '1px solid var(--border)' }}>
          <FileText size={11} color="var(--a)" />
          <span style={{ fontSize: 11, color: 'var(--t2)', fontFamily: 'var(--mono)' }}>main.tex</span>
        </div>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 10, color: 'var(--t4)' }}>Ctrl+S save · Ctrl+Shift+B compile</span>
        <button className="btn btn-glass btn-xs" onClick={() => setShowCompiler(!showCompiler)} style={{ gap: 3 }}>
          {showCompiler ? <ChevronDown size={10} /> : <ChevronUp size={10} />} Terminal
        </button>
        <button className="btn btn-primary btn-xs" onClick={handleCompile} disabled={compiling || !pid} style={{ minWidth: 80 }}>
          {compiling ? <div className="spinner spinner-sm" /> : <Play size={10} />} Compile
        </button>
      </div>

      {/* Monaco */}
      <div style={{ flex: 1, overflow: 'hidden', minHeight: 0 }}>
        <Editor
          height="100%"
          defaultLanguage="latex"
          value={value || ''}
          theme="vs-dark"
          onMount={handleMount}
          onChange={val => onChangeRef.current(val)}
          options={{
            fontSize: 13, lineHeight: 1.65,
            fontFamily: "'Fira Code', 'Cascadia Code', monospace",
            fontLigatures: true,
            minimap: { enabled: false },
            wordWrap: 'on', padding: { top: 14, bottom: 14 },
            scrollBeyondLastLine: false,
            renderLineHighlight: 'gutter',
            cursorBlinking: 'smooth', smoothScrolling: true,
            bracketPairColorization: { enabled: true },
            lineNumbers: 'on', folding: true, automaticLayout: true,
          }}
        />
      </div>

      {/* Compiler output panel */}
      {showCompiler && (
        <CompilerPanel
          pid={pid}
          output={compileOut}
          compiling={compiling}
          onCompile={handleCompile}
        />
      )}
    </div>
  )
}
