import { useState } from 'react'
import {
  ArrowLeft, Heart, Briefcase, BookOpen, Dumbbell, ClipboardList, Utensils,
  MoreHorizontal, Flame, Ban, RotateCw, CalendarDays, X,
} from 'lucide-react'
import { supabase } from './supabaseClient'
import { calculateBlockSize, SIZE_POINTS, DIFFICULTY_MULTIPLIER, CATEGORY_COLORS, todayStr } from './blocksLogic'
import './AddTask.css'

const CATEGORIES = [
  { key: 'spiritual', icon: Heart }, { key: 'work', icon: Briefcase }, { key: 'study', icon: BookOpen },
  { key: 'gym', icon: Dumbbell }, { key: 'chores', icon: ClipboardList }, { key: 'eat', icon: Utensils },
  { key: 'other', icon: MoreHorizontal },
]
const DIFFICULTIES = [
  { key: 'easy', flames: 1 }, { key: 'medium', flames: 2 }, { key: 'hard', flames: 3 },
]
const RECURRING_OPTIONS = [
  { key: null, label: 'None', icon: Ban }, { key: 'daily', label: 'Daily', icon: RotateCw },
  { key: 'weekly', label: 'Weekly', icon: CalendarDays },
]
const SIZE_COLOR_VAR = {
  Small: 'var(--size-small)', Medium: 'var(--size-medium)', Large: 'var(--size-large)', Giant: 'var(--size-giant)',
}

function AddTask({ userId, onBack, onDone }) {
  const [taskDate, setTaskDate] = useState(() => todayStr())
  const [name, setName] = useState('')
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
  const [category, setCategory] = useState('other')
  const [difficulty, setDifficulty] = useState('medium')
  const [recurring, setRecurring] = useState(null)
  const [subtaskDraft, setSubtaskDraft] = useState('')
  const [subtasks, setSubtasks] = useState([])
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const previewValid = startTime && endTime
  const previewSize = previewValid ? calculateBlockSize(startTime, endTime) : null
  const previewXp = previewSize
    ? +((SIZE_POINTS[previewSize] ?? 1) * (DIFFICULTY_MULTIPLIER[difficulty] ?? 1)).toFixed(1)
    : null

  function addSubtaskDraft() {
    const trimmed = subtaskDraft.trim()
    if (!trimmed) return
    setSubtasks((prev) => [...prev, trimmed])
    setSubtaskDraft('')
  }
  function removeSubtaskDraft(index) { setSubtasks((prev) => prev.filter((_, i) => i !== index)) }

  async function handleSubmit() {
    setError('')
    if (!name.trim()) { setError('Give the task a name first.'); return }
    if (!startTime || !endTime) { setError('Set a start and end time.'); return }
    if (!taskDate) { setError('Choose a date first.'); return }
    setSaving(true)

    const size = calculateBlockSize(startTime, endTime)
    const color = CATEGORY_COLORS[category] || 'white'
    const { data: newTask, error: insertError } = await supabase
      .from('tasks')
      .insert({
        user_id: userId, name: name.trim(), done: false, date: taskDate,
        start_time: startTime, end_time: endTime, recurring, category, color, size, difficulty,
        miss_reason: null, actual_end_time: null,
      })
      .select().single()

    if (insertError) { setError(insertError.message); setSaving(false); return }

    if (subtasks.length > 0) {
      const rows = subtasks.map((subName) => ({ task_id: newTask.id, name: subName, done: false }))
      const { error: subError } = await supabase.from('subtasks').insert(rows)
      if (subError) {
        setError('Task created, but subtasks failed to save: ' + subError.message)
        setSaving(false)
        return
      }
    }
    setSaving(false)
    onDone()
  }

  return (
    <div className="add-task-screen">
      <button className="back-button" onClick={onBack} aria-label="Back"><ArrowLeft size={20} /></button>
      <h1 className="add-task-heading">Add Task</h1>
      <p className="add-task-subheading">Build something <span className="highlight">important</span> today</p>
      {error && <p className="home-error">{error}</p>}

      <label className="field-label" htmlFor="task-date">Date</label>
      <input id="task-date" type="date" className="field-input" value={taskDate} onChange={(e) => setTaskDate(e.target.value)} />
      <label className="field-label" htmlFor="task-name">Task name</label>
      <input id="task-name" className="field-input" placeholder="What do you want to accomplish?" value={name} onChange={(e) => setName(e.target.value)} />

      <div className="time-row">
        <div className="time-field">
          <label className="field-label" htmlFor="start-time">Start time</label>
          <input id="start-time" type="time" className="field-input" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
        </div>
        <div className="time-field">
          <label className="field-label" htmlFor="end-time">End time</label>
          <input id="end-time" type="time" className="field-input" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
        </div>
      </div>

      <span className="field-label">Category</span>
      <div className="icon-grid">
        {CATEGORIES.map(({ key, icon: Icon }) => (
          <button key={key} type="button" className={`icon-choice${category === key ? ' active' : ''}`} onClick={() => setCategory(key)} aria-label={key}><Icon size={20} /></button>
        ))}
      </div>
      <p className="selection-caption">Category: {category}</p>

      <span className="field-label">Difficulty</span>
      <div className="icon-grid">
        {DIFFICULTIES.map(({ key, flames }) => (
          <button key={key} type="button" className={`icon-choice wide${difficulty === key ? ' active' : ''}`} onClick={() => setDifficulty(key)} aria-label={key}>
            {Array.from({ length: flames }).map((_, i) => <Flame key={i} size={16} />)}
          </button>
        ))}
      </div>
      <p className="selection-caption">Difficulty: {difficulty}</p>

      <span className="field-label">Repeat</span>
      <div className="icon-grid">
        {RECURRING_OPTIONS.map(({ key, icon: Icon, label }) => (
          <button key={label} type="button" className={`icon-choice${recurring === key ? ' active' : ''}`} onClick={() => setRecurring(key)} aria-label={label}><Icon size={20} /></button>
        ))}
      </div>
      <p className="selection-caption">Repeat: {RECURRING_OPTIONS.find((r) => r.key === recurring)?.label}</p>

      {previewValid && (
        <div className="preview-card">
          <span className="size-pill block-3d shine" style={{ '--block-color': SIZE_COLOR_VAR[previewSize] }}>{previewSize?.toUpperCase()}</span>
          <span className="preview-xp">Estimated XP: <strong>+{previewXp}</strong></span>
        </div>
      )}

      <span className="field-label">Subtasks (optional)</span>
      {subtasks.length > 0 && (
        <div className="subtask-chip-list">
          {subtasks.map((s, i) => (
            <span className="subtask-chip" key={i}>{s}<button type="button" onClick={() => removeSubtaskDraft(i)} aria-label="Remove"><X size={13} /></button></span>
          ))}
        </div>
      )}
      <div className="add-subtask-row">
        <input className="subtask-input" placeholder="Add a subtask" value={subtaskDraft} onChange={(e) => setSubtaskDraft(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addSubtaskDraft())} />
        <button type="button" className="add-subtask-button" onClick={addSubtaskDraft}>Add</button>
      </div>
      <button className="add-task-button shine" onClick={handleSubmit} disabled={saving}>{saving ? 'Placing block…' : '+ Add Task'}</button>
    </div>
  )
}
export default AddTask
