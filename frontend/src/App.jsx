import { useState, useEffect, useCallback } from 'react'
import axios from 'axios'

// ── API base URL: reads from env (set to your EC2 URL in production) ──
const API_URL = import.meta.env.VITE_API_URL || '/api'

// ── Toast hook ──────────────────────────────────────────────────────────
function useToast() {
  const [toasts, setToasts] = useState([])
  const addToast = (message, type = 'success') => {
    const id = Date.now()
    setToasts(prev => [...prev, { id, message, type }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3500)
  }
  return { toasts, addToast }
}

// ── StatusBadge component ────────────────────────────────────────────────
function StatusBadge({ label, status }) {
  const cls = status === 'online' ? 'online' : status === 'loading' ? 'loading' : 'offline'
  const icon = status === 'online' ? '✓' : status === 'loading' ? '…' : '✗'
  return (
    <span className={`status-badge ${cls}`}>
      <span className="status-dot" />
      {icon} {label}
    </span>
  )
}

// ── TaskCard component ───────────────────────────────────────────────────
function TaskCard({ task, onDelete, onToggle }) {
  const [deleting, setDeleting] = useState(false)

  const handleDelete = async () => {
    setDeleting(true)
    await onDelete(task.id)
    setDeleting(false)
  }

  const createdAt = new Date(task.created_at).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
  })

  return (
    <div className={`task-card ${task.completed ? 'completed' : ''}`}>
      <div
        className={`task-checkbox ${task.completed ? 'checked' : ''}`}
        onClick={() => onToggle(task.id, !task.completed)}
        title={task.completed ? 'Mark incomplete' : 'Mark complete'}
      >
        {task.completed ? '✓' : ''}
      </div>

      <div className="task-body">
        <div className="task-title">{task.title}</div>
        <div className="task-meta">
          <span className={`task-priority priority-${task.priority}`}>{task.priority}</span>
          <span className="task-time">🕒 {createdAt}</span>
          <span className="task-id">id:{task.id}</span>
        </div>
      </div>

      <div className="task-actions">
        <button
          className="btn-icon btn-delete"
          onClick={handleDelete}
          disabled={deleting}
          title="Delete task"
          id={`delete-task-${task.id}`}
        >
          {deleting ? '…' : '🗑'}
        </button>
      </div>
    </div>
  )
}

// ── Main App ─────────────────────────────────────────────────────────────
export default function App() {
  const [tasks, setTasks]           = useState([])
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState(null)
  const [filter, setFilter]         = useState('all')
  const [apiStatus, setApiStatus]   = useState('loading')
  const [dbStatus, setDbStatus]     = useState('loading')

  const [form, setForm] = useState({ title: '', priority: 'medium' })
  const [adding, setAdding]         = useState(false)

  const { toasts, addToast } = useToast()

  // ── Health check ──
  const checkHealth = useCallback(async () => {
    try {
      const res = await axios.get(`${API_URL}/health`, { timeout: 5000 })
      setApiStatus(res.data.status === 'ok' ? 'online' : 'offline')
      setDbStatus(res.data.db === 'connected' ? 'online' : 'offline')
    } catch {
      setApiStatus('offline')
      setDbStatus('offline')
    }
  }, [])

  // ── Fetch tasks ──
  const fetchTasks = useCallback(async () => {
    try {
      setError(null)
      const res = await axios.get(`${API_URL}/tasks`, { timeout: 8000 })
      setTasks(res.data)
    } catch (err) {
      setError('Cannot reach the backend. Make sure the server is running.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    checkHealth()
    fetchTasks()
    const interval = setInterval(checkHealth, 15000)
    return () => clearInterval(interval)
  }, [checkHealth, fetchTasks])

  // ── Add task ──
  const handleAdd = async (e) => {
    e.preventDefault()
    if (!form.title.trim()) return
    setAdding(true)
    try {
      const res = await axios.post(`${API_URL}/tasks`, form)
      setTasks(prev => [res.data, ...prev])
      setForm({ title: '', priority: 'medium' })
      addToast('✅ Task added successfully!')
    } catch {
      addToast('Failed to add task. Check the backend.', 'error')
    } finally {
      setAdding(false)
    }
  }

  // ── Delete task ──
  const handleDelete = async (id) => {
    try {
      await axios.delete(`${API_URL}/tasks/${id}`)
      setTasks(prev => prev.filter(t => t.id !== id))
      addToast('🗑 Task deleted.')
    } catch {
      addToast('Failed to delete task.', 'error')
    }
  }

  // ── Toggle complete ──
  const handleToggle = async (id, completed) => {
    try {
      const res = await axios.patch(`${API_URL}/tasks/${id}`, { completed })
      setTasks(prev => prev.map(t => t.id === id ? res.data : t))
    } catch {
      addToast('Failed to update task.', 'error')
    }
  }

  // ── Filtered tasks ──
  const filtered = tasks.filter(t => {
    if (filter === 'active')    return !t.completed
    if (filter === 'completed') return  t.completed
    if (filter === 'high')      return  t.priority === 'high'
    return true
  })

  const counts = {
    all: tasks.length,
    active: tasks.filter(t => !t.completed).length,
    completed: tasks.filter(t => t.completed).length,
    high: tasks.filter(t => t.priority === 'high').length,
  }

  return (
    <>
      {/* ── Navbar ── */}
      <nav className="navbar">
        <div className="container">
          <div className="navbar-inner">
            <div className="logo">
              <div className="logo-icon">⚡</div>
              <span className="logo-text">TaskFlow</span>
            </div>
            <span className="nav-badge">3-Tier Cloud</span>
          </div>
        </div>
      </nav>

      {/* ── Status Bar ── */}
      <div className="status-bar">
        <div className="container">
          <div className="status-inner">
            <span className="status-label">Tiers:</span>
            <StatusBadge label="React (S3)" status="online" />
            <span className="status-arrow">→</span>
            <StatusBadge label="Express (EC2)" status={apiStatus} />
            <span className="status-arrow">→</span>
            <StatusBadge label="PostgreSQL (Docker)" status={dbStatus} />
          </div>
        </div>
      </div>

      <main>
        <div className="container">
          {/* ── Hero ── */}
          <section className="hero">
            <div className="hero-tag">🚀 Internship Project Demo</div>
            <h1>3-Tier Cloud Architecture</h1>
            <p>Full-stack task manager deployed across S3 + EC2 + PostgreSQL with GitHub Actions CI/CD</p>

            {/* Architecture banner */}
            <div className="arch-banner">
              <div className="arch-tier frontend">🌐 React Frontend (S3 + CloudFront)</div>
              <span className="arch-arrow">⟷</span>
              <div className="arch-tier backend">⚙️ Express Backend (EC2 + Docker)</div>
              <span className="arch-arrow">⟷</span>
              <div className="arch-tier database">🗄️ PostgreSQL (Docker volume)</div>
            </div>
          </section>

          {/* ── Stats ── */}
          <div className="stats-row">
            <div className="stat-card">
              <div className="stat-number">{tasks.length}</div>
              <div className="stat-label">Total Tasks</div>
            </div>
            <div className="stat-card">
              <div className="stat-number">{counts.active}</div>
              <div className="stat-label">In Progress</div>
            </div>
            <div className="stat-card">
              <div className="stat-number">{counts.completed}</div>
              <div className="stat-label">Completed</div>
            </div>
          </div>

          {/* ── Add Task ── */}
          <div className="add-task-section">
            <div className="section-title">➕ New Task</div>
            <form onSubmit={handleAdd}>
              <div className="form-row">
                <div className="form-group" style={{ flex: 3 }}>
                  <label htmlFor="task-title">Task Title</label>
                  <input
                    id="task-title"
                    className="form-input"
                    type="text"
                    placeholder="What needs to be done?"
                    value={form.title}
                    onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                    maxLength={120}
                    required
                  />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label htmlFor="task-priority">Priority</label>
                  <select
                    id="task-priority"
                    className="form-select"
                    value={form.priority}
                    onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}
                  >
                    <option value="high">🔴 High</option>
                    <option value="medium">🟡 Medium</option>
                    <option value="low">🟢 Low</option>
                  </select>
                </div>
                <button
                  type="submit"
                  className="btn-add"
                  id="btn-add-task"
                  disabled={adding || !form.title.trim()}
                >
                  {adding ? '⏳ Adding…' : '+ Add Task'}
                </button>
              </div>
            </form>
          </div>

          {/* ── Filter Bar ── */}
          <div className="filter-bar">
            {[
              ['all', 'All'],
              ['active', 'Active'],
              ['completed', 'Done'],
              ['high', 'High Priority'],
            ].map(([key, label]) => (
              <button
                key={key}
                id={`filter-${key}`}
                className={`filter-btn ${filter === key ? 'active' : ''}`}
                onClick={() => setFilter(key)}
              >
                {label}
                <span className="filter-count">{counts[key]}</span>
              </button>
            ))}
          </div>

          {/* ── Task List ── */}
          {loading ? (
            <div className="spinner" />
          ) : error ? (
            <div className="error-box">
              <p>⚠️ {error}</p>
              <button className="btn-retry" onClick={fetchTasks}>Retry Connection</button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">📭</div>
              <div className="empty-title">
                {filter === 'all' ? 'No tasks yet' : `No ${filter} tasks`}
              </div>
              <div className="empty-sub">
                {filter === 'all' ? 'Add your first task above!' : 'Try a different filter.'}
              </div>
            </div>
          ) : (
            <div className="task-list">
              {filtered.map(task => (
                <TaskCard
                  key={task.id}
                  task={task}
                  onDelete={handleDelete}
                  onToggle={handleToggle}
                />
              ))}
            </div>
          )}
        </div>
      </main>

      {/* ── Footer ── */}
      <footer className="footer">
        <div className="container">
          <p>
            Built for internship demo · 3-Tier Architecture ·
            <a href="https://github.com" target="_blank" rel="noreferrer"> GitHub Actions CI/CD</a> ·
            AWS Free Tier
          </p>
        </div>
      </footer>

      {/* ── Toast Container ── */}
      <div className="toast-container">
        {toasts.map(t => (
          <div key={t.id} className={`toast ${t.type}`}>{t.message}</div>
        ))}
      </div>
    </>
  )
}
