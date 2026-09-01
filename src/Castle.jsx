import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import { getStreak, getPeriodStats, CATEGORY_COLOR_HEX } from './blocksLogic'
import './Home.css'
import './Castle.css'


const SIZE_BASE_WIDTH = { Small: 55, Medium: 85, Large: 115, Giant: 150 }

const PERIODS = [
  { key: 'day', label: 'Day' },
  { key: 'week', label: 'Week' },
  { key: 'month', label: 'Month' },
  { key: 'year', label: 'Year' },
  { key: 'all', label: 'All Time' },
]

// Small deterministic jitter so brick widths feel organic rather than a
// perfect grid, without reshuffling on every re-render (no Math.random()).
function jitter(id, range) {
  let h = 0
  const s = String(id)
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 1000
  return (h % range) - range / 2
}

function Castle({ userId }) {
  const [tasks, setTasks] = useState([])
  const [bestStreak, setBestStreak] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [period, setPeriod] = useState('week')

  useEffect(() => {
    loadEverything()
  }, [userId])

  async function loadEverything() {
    setLoading(true)
    setError('')

    const [{ data: profile, error: profileError }, { data: taskRows, error: tasksError }] =
      await Promise.all([
        supabase.from('users').select('best_streak').eq('id', userId).single(),
        supabase.from('tasks').select('*, subtasks(*)').eq('user_id', userId),
      ])

    if (profileError) setError(profileError.message)
    if (tasksError) setError(tasksError.message)

    const loadedTasks = taskRows || []
    setTasks(loadedTasks)

    const storedBest = profile?.best_streak ?? 0
    const currentStreak = getStreak(loadedTasks)

    if (currentStreak > storedBest) {
      await supabase.from('users').update({ best_streak: currentStreak }).eq('id', userId)
      setBestStreak(currentStreak)
    } else {
      setBestStreak(storedBest)
    }

    setLoading(false)
  }

  if (loading) {
    return <p className="home-loading">Loading your castle…</p>
  }

  const doneTasks = tasks.filter((t) => t.done)
  const totalBlocks =
    doneTasks.length +
    tasks.reduce((sum, t) => sum + (t.subtasks || []).filter((s) => s.done).length, 0)

  const stats = getPeriodStats(tasks, period)

  const recentlyCompleted = [...doneTasks]
    .sort((a, b) => {
      const aKey = `${a.date} ${a.actual_end_time || '00:00'}`
      const bKey = `${b.date} ${b.actual_end_time || '00:00'}`
      return bKey.localeCompare(aKey)
    })
    .slice(0, 4)

  const wallBricks = [...doneTasks]
    .sort((a, b) => `${a.date} ${a.start_time}`.localeCompare(`${b.date} ${b.start_time}`))
    .slice(-80)

  return (
    <div className="home-screen">
      <h1 className="home-greeting">Your Castle 🏰</h1>

      {error && <p className="home-error">{error}</p>}

      <div className="stat-row" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <div className="stat-card">
          <div className="stat-value">{totalBlocks}</div>
          <div className="stat-label">Total Blocks</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">🔥 {bestStreak}d</div>
          <div className="stat-label">Best Streak</div>
        </div>
      </div>

      <h2 className="section-heading">Your Structure</h2>

      <div className="period-tabs">
        {PERIODS.map((p) => (
          <button
            key={p.key}
            className={`period-tab${period === p.key ? ' active' : ''}`}
            onClick={() => setPeriod(p.key)}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="stat-row">
        <div className="stat-card">
          <div className="stat-value small">{stats.completionRate}%</div>
          <div className="stat-label">Completion</div>
        </div>
        <div className="stat-card">
          <div className="stat-value small">{stats.blocksBuilt}</div>
          <div className="stat-label">Blocks Built</div>
        </div>
        <div className="stat-card">
          <div className="stat-value small">{stats.xpEarned}</div>
          <div className="stat-label">XP Earned</div>
        </div>
        <div className="stat-card">
          <div className="stat-value small">{stats.timeFocusedHours}h</div>
          <div className="stat-label">Time Focused</div>
        </div>
      </div>

      <h2 className="section-heading">The Castle</h2>

      {wallBricks.length === 0 ? (
        <p className="empty-text">Complete your first task to start building.</p>
      ) : (
        <div className="castle-wall">
          {wallBricks.map((t) => {
            const baseWidth = SIZE_BASE_WIDTH[t.size] || 70
            const width = baseWidth + jitter(t.id, 16)
            const color = CATEGORY_COLOR_HEX[t.category] || 'var(--green)'
            return (
              <div
                key={t.id}
                className="castle-brick block-3d"
                style={{ width: `${width}px`, '--block-color': color }}
                title={t.name}
              />
            )
          })}
        </div>
      )}

      <h2 className="section-heading">Recently Completed</h2>

      {recentlyCompleted.length === 0 ? (
        <p className="empty-text">Nothing completed yet.</p>
      ) : (
        recentlyCompleted.map((t) => (
          <div className="task-card" key={t.id}>
            <div className="task-row">
              <span
                className="size-pill block-3d shine"
                style={{ '--block-color': CATEGORY_COLOR_HEX[t.category] || 'var(--green)' }}
              >
                {t.category?.slice(0, 4).toUpperCase()}
              </span>
              <div className="task-info">
                <div className="task-name">{t.name}</div>
                <div className="task-meta">
                  {t.date} · {t.actual_end_time || t.end_time}
                </div>
              </div>
            </div>
          </div>
        ))
      )}
    <div style={{ height: '80px' }} />
   </div>
  )
}

export default Castle