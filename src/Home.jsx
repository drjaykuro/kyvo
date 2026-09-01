import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { supabase } from './supabaseClient'
import {
  getStreak,
  getLevelAndBadge,
  getLevelProgress,
  getDailyScore,
  getDailyQuote,
  goalAchievedMessage,
  getMissingRecurringInstances,
  earliestCompletionTime,
  todayStr,
  toDateStr,
} from './blocksLogic'
import './Home.css'

const SIZE_COLOR_VAR = {
  Small: 'var(--size-small)',
  Medium: 'var(--size-medium)',
  Large: 'var(--size-large)',
  Giant: 'var(--size-giant)',
}
const SIZE_LABEL = { Small: 'SIMPLE', Medium: 'MEDIUM', Large: 'HARD', Giant: 'GIANT' }
const SIZE_ORDER = ['Small', 'Medium', 'Large', 'Giant']

function Home({ userId, onAddTask }) {
  const [tasks, setTasks] = useState([])
  const [goals, setGoals] = useState([])
  const [firstName, setFirstName] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [quote] = useState(() => getDailyQuote())
  const [openSubtasks, setOpenSubtasks] = useState({})
  const [newSubtaskName, setNewSubtaskName] = useState({})
  const [selectedDate, setSelectedDate] = useState(todayStr())

  const [showAddGoal, setShowAddGoal] = useState(false)
  const [goalName, setGoalName] = useState('')
  const [goalTimeframe, setGoalTimeframe] = useState('short')
  const [goalTargetDate, setGoalTargetDate] = useState('')

  useEffect(() => {
    loadEverything()
  }, [userId])

  async function loadEverything() {
    setLoading(true)
    setError('')

    const [
      { data: profile, error: profileError },
      { data: taskRows, error: tasksError },
      { data: goalRows, error: goalsError },
    ] = await Promise.all([
      supabase.from('users').select('name').eq('id', userId).single(),
      supabase.from('tasks').select('*, subtasks(*)').eq('user_id', userId),
      supabase.from('goals').select('*').eq('user_id', userId),
    ])

    if (profileError) setError(profileError.message)
    if (tasksError) setError(tasksError.message)
    if (goalsError) setError(goalsError.message)

    if (profile?.name) setFirstName(profile.name.split(' ')[0])

    let loadedTasks = taskRows || []

    // Generate today's instance of any recurring task templates that
    // haven't spawned yet, same as generate_recurring_tasks() in backend.py.
    const toCreate = getMissingRecurringInstances(loadedTasks)
    if (toCreate.length > 0) {
      const { data: inserted, error: recurError } = await supabase
        .from('tasks')
        .insert(toCreate)
        .select('*, subtasks(*)')
      if (!recurError && inserted) {
        loadedTasks = [...loadedTasks, ...inserted]
      }
    }

    setTasks(loadedTasks)
    if (goalRows) setGoals(goalRows)

    setLoading(false)
  }

  function shiftDay(delta) {
    const [y, m, d] = selectedDate.split('-').map(Number)
    const next = new Date(y, m - 1, d + delta)
    setSelectedDate(toDateStr(next))
  }

  async function handleMarkDone(task) {
    if (task.done) return
    const allowedFrom = earliestCompletionTime(task)
    if (new Date() < allowedFrom) {
      setError(
        `Too early to mark this done — you can complete it starting at ${allowedFrom
          .toTimeString()
          .slice(0, 5)} (10 minutes before it ends).`
      )
      return
    }
    setError('')

    const actualEndTime = new Date().toTimeString().slice(0, 5)
    const { error: updateError } = await supabase
      .from('tasks')
      .update({ done: true, actual_end_time: actualEndTime })
      .eq('id', task.id)

    if (updateError) {
      setError(updateError.message)
      return
    }

    setTasks((prev) =>
      prev.map((t) => (t.id === task.id ? { ...t, done: true, actual_end_time: actualEndTime } : t))
    )
  }

  async function handleMarkSubtaskDone(task, subtask) {
    if (subtask.done) return
    setError('')

    const { error: subError } = await supabase
      .from('subtasks')
      .update({ done: true })
      .eq('id', subtask.id)

    if (subError) {
      setError(subError.message)
      return
    }

    const updatedSubtasks = task.subtasks.map((s) => (s.id === subtask.id ? { ...s, done: true } : s))
    const allDone = updatedSubtasks.every((s) => s.done)
    let updatedTask = { ...task, subtasks: updatedSubtasks }

    if (allDone && !task.done) {
      const allowedFrom = earliestCompletionTime(task)
      if (new Date() >= allowedFrom) {
        const actualEndTime = new Date().toTimeString().slice(0, 5)
        await supabase
          .from('tasks')
          .update({ done: true, actual_end_time: actualEndTime })
          .eq('id', task.id)
        updatedTask = { ...updatedTask, done: true, actual_end_time: actualEndTime }
      }
    }

    setTasks((prev) => prev.map((t) => (t.id === task.id ? updatedTask : t)))
  }

  async function handleAddSubtask(task) {
    const name = (newSubtaskName[task.id] || '').trim()
    if (!name) return

    const { data, error: insertError } = await supabase
      .from('subtasks')
      .insert({ task_id: task.id, name, done: false })
      .select()
      .single()

    if (insertError) {
      setError(insertError.message)
      return
    }

    setTasks((prev) =>
      prev.map((t) => (t.id === task.id ? { ...t, subtasks: [...(t.subtasks || []), data] } : t))
    )
    setNewSubtaskName((prev) => ({ ...prev, [task.id]: '' }))
  }

  async function handleAchieveGoal(goal) {
    if (goal.achieved) return
    setError('')

    const { error: updateError } = await supabase
      .from('goals')
      .update({ achieved: true })
      .eq('id', goal.id)

    if (updateError) {
      setError(updateError.message)
      return
    }

    await supabase.from('notifications').insert({
      user_id: userId,
      type: 'goal_achieved',
      message: goalAchievedMessage(goal.name),
      date: new Date().toISOString(),
      seen: false,
    })

    setGoals((prev) => prev.map((g) => (g.id === goal.id ? { ...g, achieved: true } : g)))
  }

  async function handleAddGoal() {
    if (!goalName.trim()) {
      setError('Give the goal a name first.')
      return
    }
    setError('')

    const { data, error: insertError } = await supabase
      .from('goals')
      .insert({
        user_id: userId,
        name: goalName.trim(),
        timeframe: goalTimeframe,
        target_date: goalTargetDate || null,
        achieved: false,
      })
      .select()
      .single()

    if (insertError) {
      setError(insertError.message)
      return
    }

    setGoals((prev) => [...prev, data])
    setGoalName('')
    setGoalTimeframe('short')
    setGoalTargetDate('')
    setShowAddGoal(false)
  }

  if (loading) {
    return <p className="home-loading">Loading your blocks…</p>
  }

  const today = todayStr()
  const isToday = selectedDate === today
  const viewedTasks = tasks.filter((t) => t.date === selectedDate)

  const todayTasksForStats = tasks.filter((t) => t.date === today)
  const completedToday = todayTasksForStats.filter((t) => t.done).length
  const todayPct = todayTasksForStats.length
    ? Math.round((completedToday / todayTasksForStats.length) * 100)
    : 0
  const blocksToday =
    completedToday +
    todayTasksForStats.reduce((sum, t) => sum + (t.subtasks || []).filter((s) => s.done).length, 0)

  const { level, badge, streak } = getLevelAndBadge(tasks)
  const levelProgress = getLevelProgress(streak, level)
  const xpToday = getDailyScore(tasks, today)

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'

  const doneTasks = tasks.filter((t) => t.done)
  const sizeCounts = { Small: 0, Medium: 0, Large: 0, Giant: 0 }
  doneTasks.forEach((t) => {
    if (sizeCounts[t.size] !== undefined) sizeCounts[t.size] += 1
  })
  const maxCount = Math.max(1, ...Object.values(sizeCounts))

  const dayHeading = isToday
    ? "Today's Tasks"
    : new Date(selectedDate).toLocaleDateString('en', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      })

  return (
    <div className="home-screen">
      <h1 className="home-greeting">
        {greeting}{firstName ? `, ${firstName}` : ''}! 👋
      </h1>

      <div className="quote-card shine">
        <span className="quote-text">"{quote}"</span>
      </div>

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
      </div>

      <div className="stat-row">
        <div className="stat-card">
          <div className="stat-value small">🔥 {streak}d</div>
          <div className="stat-label">Streak</div>
        </div>
        <div className="stat-card">
          <div className="stat-value small">{todayPct}%</div>
          <div className="stat-label">Today</div>
        </div>
        <div className="stat-card">
          <div className="stat-value small">{xpToday.toFixed(1)}</div>
          <div className="stat-label">XP Today</div>
        </div>
        <div className="stat-card">
          <div className="stat-value small">{blocksToday}</div>
          <div className="stat-label">Blocks Today</div>
        </div>
      </div>

      <div className="day-nav">
        <button className="day-nav-arrow" onClick={() => shiftDay(-1)} aria-label="Previous day">
          <ChevronLeft size={18} />
        </button>
        <h2 className="section-heading day-nav-heading">{dayHeading}</h2>
        <button className="day-nav-arrow" onClick={() => shiftDay(1)} aria-label="Next day">
          <ChevronRight size={18} />
        </button>
      </div>
      {!isToday && (
        <button className="toggle-link" onClick={() => setSelectedDate(today)}>
          Jump to today
        </button>
      )}

      {viewedTasks.length === 0 ? (
        <p className="empty-text">
          {isToday
            ? 'No tasks for today yet. Add your first block below.'
            : 'Nothing scheduled for this day yet.'}
        </p>
      ) : (
        viewedTasks.map((task) => {
          const sizeColor = SIZE_COLOR_VAR[task.size] || 'var(--green)'
          const sizeLabel = SIZE_LABEL[task.size] || task.size
          const subtasksDone = (task.subtasks || []).filter((s) => s.done).length
          const subtasksTotal = (task.subtasks || []).length
          const isOpen = !!openSubtasks[task.id]

          return (
            <div className="task-card" key={task.id}>
              <div className="task-row">
                <button
                  className={`task-checkbox${task.done ? ' checked' : ''}`}
                  onClick={() => handleMarkDone(task)}
                  disabled={task.done}
                  aria-label={`Mark ${task.name} done`}
                >
                  {task.done && '✓'}
                </button>

                <div className="task-info">
                  <div className={`task-name${task.done ? ' done' : ''}`}>{task.name}</div>
                  <div className="task-meta">
                    {task.start_time}–{task.end_time} · {task.category}
                  </div>
                </div>

                <span className="size-pill block-3d shine" style={{ '--block-color': sizeColor }}>
                  {sizeLabel}
                </span>
              </div>

              <button
                className="subtasks-toggle"
                onClick={() => setOpenSubtasks((prev) => ({ ...prev, [task.id]: !prev[task.id] }))}
              >
                {subtasksTotal > 0
                  ? `Subtasks (${subtasksDone}/${subtasksTotal}) ${isOpen ? '▲' : '▼'}`
                  : `+ Add subtasks ${isOpen ? '▲' : '▼'}`}
              </button>

              {isOpen && (
                <div className="subtasks-panel">
                  {(task.subtasks || []).map((sub) => (
                    <div className="subtask-row" key={sub.id}>
                      <button
                        className={`task-checkbox small${sub.done ? ' checked' : ''}`}
                        onClick={() => handleMarkSubtaskDone(task, sub)}
                        disabled={sub.done}
                        aria-label={`Mark ${sub.name} done`}
                      >
                        {sub.done && '✓'}
                      </button>
                      <span className={sub.done ? 'subtask-name done' : 'subtask-name'}>
                        {sub.name}
                      </span>
                    </div>
                  ))}

                  <div className="add-subtask-row">
                    <input
                      className="subtask-input"
                      placeholder="Add a subtask"
                      value={newSubtaskName[task.id] || ''}
                      onChange={(e) =>
                        setNewSubtaskName((prev) => ({ ...prev, [task.id]: e.target.value }))
                      }
                      onKeyDown={(e) => e.key === 'Enter' && handleAddSubtask(task)}
                    />
                    <button className="add-subtask-button" onClick={() => handleAddSubtask(task)}>
                      Add
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })
      )}

      <button className="add-task-button shine" onClick={onAddTask}>
        + Add a task
      </button>

      <h2 className="section-heading">Goals</h2>

      {goals.length === 0 ? (
        <p className="empty-text">No goals yet — add one below.</p>
      ) : (
        goals.map((goal) => (
          <div className="task-card" key={goal.id}>
            <div className="task-row">
              <button
                className={`task-checkbox${goal.achieved ? ' checked' : ''}`}
                onClick={() => handleAchieveGoal(goal)}
                disabled={goal.achieved}
                aria-label={`Mark ${goal.name} achieved`}
              >
                {goal.achieved && '✓'}
              </button>
              <div className="task-info">
                <div className={`task-name${goal.achieved ? ' done' : ''}`}>{goal.name}</div>
                <div className="task-meta">
                  Target: {goal.target_date || '—'}
                  {goal.achieved ? ' · ACHIEVED' : ''}
                </div>
              </div>
              <span
                className="size-pill block-3d shine"
                style={{ '--block-color': goal.achieved ? 'var(--green)' : 'var(--size-medium)' }}
              >
                {goal.timeframe?.toUpperCase()}-TERM
              </span>
            </div>
          </div>
        ))
      )}

      {!showAddGoal ? (
        <button className="subtasks-toggle" onClick={() => setShowAddGoal(true)}>
          + Add a goal
        </button>
      ) : (
        <div className="task-card">
          <label className="field-label" htmlFor="goal-name">Goal name</label>
          <input
            id="goal-name"
            className="field-input"
            value={goalName}
            onChange={(e) => setGoalName(e.target.value)}
          />

          <span className="field-label">Timeframe</span>
          <div className="icon-grid">
            {['short', 'mid', 'long'].map((tf) => (
              <button
                key={tf}
                type="button"
                className={`icon-choice wide${goalTimeframe === tf ? ' active' : ''}`}
                onClick={() => setGoalTimeframe(tf)}
              >
                {tf}
              </button>
            ))}
          </div>

          <label className="field-label" htmlFor="goal-date">Target date</label>
          <input
            id="goal-date"
            type="date"
            className="field-input"
            value={goalTargetDate}
            onChange={(e) => setGoalTargetDate(e.target.value)}
          />

          <button className="add-task-button shine" onClick={handleAddGoal}>
            Add Goal
          </button>
        </div>
      )}

      <h2 className="section-heading">Your Blocks</h2>

      {doneTasks.length === 0 ? (
        <p className="empty-text">Complete a task to start seeing your blocks here.</p>
      ) : (
        <div className="blocks-chart">
          {SIZE_ORDER.map((size) => (
            <div className="blocks-chart-col" key={size}>
              <span className="blocks-chart-count">{sizeCounts[size]}</span>
              <div
                className="blocks-chart-bar block-3d shine"
                style={{
                  '--block-color': SIZE_COLOR_VAR[size],
                  height: `${(sizeCounts[size] / maxCount) * 100}px`,
                }}
              />
              <span className="blocks-chart-label">{SIZE_LABEL[size]}</span>
            </div>
          ))}
        </div>
      )}
     <div style={{ height: '80px' }} />
    </div>
  )
}

export default Home