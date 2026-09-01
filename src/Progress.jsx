import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import {
  getLevelAndBadge,
  getLevelProgress,
  getAllTimeScore,
  getSevenDayStats,
  getDifficultyBreakdown,
  getCategoryBreakdown,
  CATEGORY_COLOR_HEX,
} from './blocksLogic'
import './Home.css'
import './Progress.css'

const DIFFICULTY_COLOR = { easy: 'var(--size-small)', medium: 'var(--size-medium)', hard: 'var(--size-large)' }

function Progress({ userId }) {
  const [tasks, setTasks] = useState([])
  const [username, setUsername] = useState('')
  const [leaderboard, setLeaderboard] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    loadEverything()
  }, [userId])

  async function loadEverything() {
    setLoading(true)
    setError('')

    const { data: profile, error: profileError } = await supabase
      .from('users')
      .select('username')
      .eq('id', userId)
      .single()
    if (profileError) setError(profileError.message)
    if (profile?.username) setUsername(profile.username)

    const { data: taskRows, error: tasksError } = await supabase
      .from('tasks')
      .select('*, subtasks(*)')
      .eq('user_id', userId)
    if (tasksError) setError(tasksError.message)

    const loadedTasks = taskRows || []
    setTasks(loadedTasks)

    // Compute this user's score/level, then write it to their own public
    // profile columns so the leaderboard (below) can read it without ever
    // touching another user's private tasks.
    const score = getAllTimeScore(loadedTasks)
    const { level } = getLevelAndBadge(loadedTasks)
    await supabase.from('users').update({ xp_score: score, level }).eq('id', userId)

    const { data: board, error: boardError } = await supabase
      .from('users')
      .select('id, username, xp_score, level')
      .order('level', { ascending: false })
      .order('xp_score', { ascending: false })
      .limit(100)
    if (boardError) setError(boardError.message)
    if (board) setLeaderboard(board)

    setLoading(false)
  }

  if (loading) {
    return <p className="home-loading">Loading your progress…</p>
  }

  const { level, badge, streak } = getLevelAndBadge(tasks)
  const levelProgress = getLevelProgress(streak, level)
  const sevenDay = getSevenDayStats(tasks)
  const weekCompleted = sevenDay.reduce((s, d) => s + d.completed, 0)
  const weekTotal = sevenDay.reduce((s, d) => s + d.total, 0)
  const weekRate = weekTotal ? Math.round((weekCompleted / weekTotal) * 100) : 0

  const maxDayCount = Math.max(1, ...sevenDay.map((d) => d.completed))
  const maxHours = Math.max(1, ...sevenDay.map((d) => Math.max(d.plannedHours, d.completedHours)))

  const difficulty = getDifficultyBreakdown(tasks)
  const easyEnd = difficulty.pct.easy
  const mediumEnd = easyEnd + difficulty.pct.medium
  const donutGradient =
    difficulty.total === 0
      ? 'var(--card-border)'
      : `conic-gradient(var(--size-small) 0% ${easyEnd}%, var(--size-medium) ${easyEnd}% ${mediumEnd}%, var(--size-large) ${mediumEnd}% 100%)`

  const categoryRates = getCategoryBreakdown(tasks)
  const categoryEntries = Object.entries(categoryRates).sort((a, b) => b[1].rate - a[1].rate)

  const top10 = leaderboard.slice(0, 10)
  const ownIndex = leaderboard.findIndex((u) => u.id === userId)
  const ownRank = ownIndex + 1
  const showOwnRowSeparately = ownIndex >= 10

  return (
    <div className="home-screen">
      <h1 className="home-greeting">Progress</h1>

      {error && <p className="home-error">{error}</p>}

      <div className="level-card">
        <div className="level-card-top">
          <div>
            <div className="stat-label">CURRENT LEVEL</div>
            <div className="stat-value">
              Level {level} · {badge}
            </div>
          </div>
          <div className="level-card-right">
            <div className="stat-label">{streak}-day streak</div>
            <div className="level-progress-text">{levelProgress}% to next level</div>
          </div>
        </div>
        <div className="progress-track">
          <div className="progress-fill" style={{ width: `${levelProgress}%` }} />
        </div>
        <div className="week-rate-line">Last 7 days: {weekRate}% completion</div>
      </div>

      <h2 className="section-heading">Tasks Completed (7 Days)</h2>
      <div className="week-bar-chart">
        {sevenDay.map((d) => (
          <div className="week-bar-col" key={d.date}>
            <span className="week-bar-count">{d.completed}</span>
            <div
              className="week-bar block-3d"
              style={{
                '--block-color': 'var(--green)',
                height: `${(d.completed / maxDayCount) * 90}px`,
              }}
            />
            <span className="week-bar-label">
              {new Date(d.date).toLocaleDateString('en', { weekday: 'short' })[0]}
            </span>
          </div>
        ))}
      </div>

      <h2 className="section-heading">Planned vs Completed Hours</h2>
      <div className="week-bar-chart">
        {sevenDay.map((d) => (
          <div className="week-bar-col" key={d.date}>
            <div className="hour-bar-pair">
              <div
                className="week-bar block-3d thin"
                style={{
                  '--block-color': 'var(--text-dim)',
                  height: `${(d.plannedHours / maxHours) * 90}px`,
                }}
                title={`Planned: ${d.plannedHours}h`}
              />
              <div
                className="week-bar block-3d thin"
                style={{
                  '--block-color': 'var(--green)',
                  height: `${(d.completedHours / maxHours) * 90}px`,
                }}
                title={`Completed: ${d.completedHours}h`}
              />
            </div>
            <span className="week-bar-label">
              {new Date(d.date).toLocaleDateString('en', { weekday: 'short' })[0]}
            </span>
          </div>
        ))}
      </div>
      <div className="legend-row">
        <span className="legend-dot" style={{ background: 'var(--text-dim)' }} /> Planned
        <span className="legend-dot" style={{ background: 'var(--green)', marginLeft: 16 }} /> Completed
      </div>

      <h2 className="section-heading">Completion by Difficulty</h2>
      {difficulty.total === 0 ? (
        <p className="empty-text">Complete a task to see this breakdown.</p>
      ) : (
        <div className="donut-row">
          <div className="donut" style={{ background: donutGradient }}>
            <div className="donut-hole">
              <span>{difficulty.total}</span>
              <span className="donut-hole-label">done</span>
            </div>
          </div>
          <div className="donut-legend">
            {['easy', 'medium', 'hard'].map((k) => (
              <div className="legend-row" key={k}>
                <span className="legend-dot" style={{ background: DIFFICULTY_COLOR[k] }} />
                {k.charAt(0).toUpperCase() + k.slice(1)} — {difficulty.pct[k]}%
              </div>
            ))}
          </div>
        </div>
      )}

      <h2 className="section-heading">By Category</h2>
      {categoryEntries.length === 0 ? (
        <p className="empty-text">No tasks yet.</p>
      ) : (
        categoryEntries.map(([cat, { rate }]) => (
          <div className="category-row" key={cat}>
            <span className="category-name">{cat}</span>
            <div className="category-bar-track">
              <div
                className="category-bar-fill block-3d"
                style={{ '--block-color': CATEGORY_COLOR_HEX[cat] || 'var(--green)', width: `${rate}%` }}
              />
            </div>
            <span className="category-pct">{rate}%</span>
          </div>
        ))
      )}

      <h2 className="section-heading">Leaderboard</h2>
      {top10.map((u, i) => (
        <div className={`task-card leaderboard-row${u.id === userId ? ' own-row' : ''}`} key={u.id}>
          <div className="task-row">
            <span className="rank-badge">{i + 1}</span>
            <div className="task-info">
              <div className="task-name">{u.username}</div>
              <div className="task-meta">Level {u.level}</div>
            </div>
            <span className="leaderboard-score">{u.xp_score}</span>
          </div>
        </div>
      ))}

      {showOwnRowSeparately && (
        <>
          <p className="leaderboard-ellipsis">···</p>
          <div className="task-card leaderboard-row own-row">
            <div className="task-row">
              <span className="rank-badge">{ownRank}</span>
              <div className="task-info">
                <div className="task-name">{username || 'You'}</div>
                <div className="task-meta">Level {level}</div>
              </div>
              <span className="leaderboard-score">{getAllTimeScore(tasks)}</span>
            </div>
          </div>
        </>
      )}

      <div style={{ height: '80px' }} />
    </div>
  )
}

export default Progress