import axios from 'axios'

const api = axios.create({ baseURL: '/api/v3', timeout: 60000 })
api.interceptors.response.use(
  r => r.data,
  e => {
    const d = e.response?.data
    const msg = d?.detail || d?.error || d?.message || e.message || 'Request failed'
    return Promise.reject(new Error(String(msg)))
  }
)

//  Projects
export const getProjects     = ()       => api.get('/projects')
export const createProject   = (name)   => api.post('/projects', { name })
export const deleteProject   = (id)     => api.delete(`/projects/${id}`)
export const getTex          = (id)     => api.get(`/projects/${id}/tex`)
export const updateTex       = (id, c)  => api.put(`/projects/${id}/tex`, { content: c })
export const getBib          = (id)     => api.get(`/projects/${id}/bib`)
export const getSections     = (id)     => api.get(`/projects/${id}/sections`)
export const getStats        = (id)     => api.get(`/projects/${id}/stats`)
export const writeSection    = (id, d)  => api.post(`/projects/${id}/write-section`, d)
export const editSection     = (id, d)  => api.post(`/projects/${id}/edit-section`, d)
export const verifyCitations = (id)     => api.post(`/projects/${id}/verify-citations`)
export const generateBib     = (id, d)  => api.post(`/projects/${id}/generate-bib`, d)
export const compileLatex    = (id)     => api.post(`/projects/${id}/compile`)
export const getPdfUrl       = (id)     => `/api/v3/projects/${id}/pdf`

export const exportProject   = (id) => {
  const a = document.createElement('a')
  a.href = `/api/v3/projects/${id}/export`
  a.download = `project_${id}.zip`
  document.body.appendChild(a); a.click(); document.body.removeChild(a)
}

// Papers
export const searchPapers    = (d)      => api.post('/papers/search', d)
export const savePaper       = (d)      => api.post('/papers/save', d)
export const deletePaper     = (id)     => api.delete(`/papers/${id}`)
export const listPapers      = ()       => api.get('/papers')

// Chat + MCP 
export const sendChat        = (d)      => api.post('/chat', d)
export const callTool        = (t, p)   => api.post('/tools/call', { tool: t, params: p })
export const getTools        = ()       => api.get('/tools')

// Streaming section writer 
export const streamSection = (pid, body, onToken, onDone) =>
  new Promise((resolve, reject) => {
    fetch(`/api/v3/projects/${pid}/stream-section`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then(res => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const reader = res.body.getReader(), dec = new TextDecoder()
      let buf = ''
      const pump = () => reader.read().then(({ done, value }) => {
        if (done) { resolve(); return }
        buf += dec.decode(value, { stream: true })
        const lines = buf.split('\n'); buf = lines.pop()
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const d = JSON.parse(line.slice(6))
            if (d.done) { onDone(d); resolve() } else if (d.token) onToken(d.token)
          } catch {}
        }
        pump()
      }).catch(reject)
      pump()
    }).catch(reject)
  })

//Google OAuth2 
export const getGoogleAuthUrl    = ()   => api.get('/integrations/google/auth-url')
export const getGoogleStatus     = ()   => api.get('/integrations/google/status')
export const disconnectGoogle    = ()   => api.delete('/integrations/google/disconnect')
export const saveGoogleTok       = (t, r='') => api.post('/integrations/google/token', { access_token: t, refresh_token: r })

// Calendar 
export const getCalendar         = (d=14) => api.get(`/integrations/calendar?days=${d}`)
export const createEvent         = (d)    => api.post('/integrations/calendar', d)

// Notion OAuth2 
export const getNotionAuthUrl    = ()     => api.get('/integrations/notion/auth-url')
export const getNotionStatus     = ()     => api.get('/integrations/notion/status')
export const disconnectNotion    = ()     => api.delete('/integrations/notion/disconnect')

//Notion pages 
export const getNotion           = (q='') => api.get(`/integrations/notion${q ? '?q=' + encodeURIComponent(q) : ''}`)
export const createNotion        = (d)    => api.post('/integrations/notion', d)

// Todos 
export const getTodos            = (pid)  => api.get(`/todos${pid ? '?project_id=' + pid : ''}`)
export const createTodo          = (d)    => api.post('/todos', d)
export const toggleTodo          = (id)   => api.patch(`/todos/${id}/toggle`)
export const deleteTodo          = (id)   => api.delete(`/todos/${id}`)

// Status 
export const getNotifications    = ()     => api.get('/notifications')
export const checkHealth         = ()     => axios.get('/health').then(r => r.data)
