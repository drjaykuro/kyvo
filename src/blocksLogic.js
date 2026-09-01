// Ported directly from backend.py. Same rules, same numbers — just
// translated from Python to JavaScript. This file is the single source of
// truth for streak/badge/scoring logic across the React app.

export const CATEGORY_COLORS = {
  spiritual: 'purple',
  work: 'green',
  study: 'blue',
  gym: 'orange',
  chores: 'grey',
  eat: 'brown',
  other: 'white',
}

export const SIZE_POINTS = { Small: 1, Medium: 2.3, Large: 3.5, Giant: 5 }
export const DIFFICULTY_MULTIPLIER = { easy: 1, medium: 1.5, hard: 2 }

// (level, days_required, badge_name) — must stay ascending, same as BADGE_TIERS in backend.py
export const BADGE_TIERS = [
  [1, 7, 'Foundation Block I'],
  [2, 14, 'Foundation Block II'],
  [3, 28, 'Foundation Block III'],
  [4, 60, 'Builder I'],
  [5, 90, 'Builder II'],
  [6, 150, 'Builder III'],
  [7, 240, 'Architect I'],
  [8, 360, 'Architect II'],
  [9, 450, 'Architect III'],
  [10, 540, 'Skyscraper I'],
  [11, 720, 'Skyscraper II'],
  [12, 900, 'Skyscraper III'],
  [13, 1080, 'Legacy I'],
  [14, 1260, 'Legacy II'],
  [15, 1440, 'Legacy III'],
]

export const MOTIVATIONAL_QUOTES = [
  'No place for fear and worry.',
  'I can do all things.',
  'I am not alone. I cannot be moved',
  'If God be for me, who can be against me?',
  'Everything works for my good.',
  'The just shall live by faith.',
  'Build me, then visibility.',
  'Failure to plan will definitely amount to failure.',
  'Fortune favours the bold.',
  'Ideas do not come out fully formed, they only become clear as you work on them.',
  'Have the courage to trust that it will all work out.',
  "Don't choose what to do, do what is right.",
  'If I am worth something later I am worth something now, for wheat is wheat, even if it looks like grass at the beginning.',
  'Tommorrow belongs to those who prepare for it today.',
  'JESUS IS LORD.',
  'Building your future, one block at a time.',
  'Build what you want to become.',
  'Small blocks. Big future.',
  'Every block counts.',
  'Keep building.',
  'Your future is under construction.',
  'Start with one block.',
  'Build today. Become tomorrow.',
  'Progress is built, not wished for.',
  'Your next block is waiting.',
  "You don't have to finish everything. Just build something.",
  "One missed day doesn't erase what you've built.",
  'Start again. Add another block.',
  'You can still build something today.',
  "The foundation doesn't have to be perfect.",
  "Don't wait for motivation. Place the first block.",
  'A small block is still progress.',
  "You've built before. You can build again.",
  "You don't need to rush. Just keep building.",
  "Today is another chance to add to what you've built.",
  'Slow progress is still construction.',
  'Breathe. Choose a block. Begin.',
  "You don't need a perfect day to make progress.",
]

// Local-date formatting (avoids UTC-shift bugs toISOString() would cause
// for a Nigeria-based user — always uses the browser's local date).
export function toDateStr(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function todayStr() {
  return toDateStr(new Date())
}

export function calculateBlockSize(startTime, endTime) {
  const [sh, sm] = startTime.split(':').map(Number)
  const [eh, em] = endTime.split(':').map(Number)
  let startMinutes = sh * 60 + sm
  let endMinutes = eh * 60 + em
  if (endMinutes <= startMinutes) endMinutes += 24 * 60
  const minutes = endMinutes - startMinutes

  if (minutes <= 15) return 'Small'
  if (minutes <= 60) return 'Medium'
  if (minutes <= 180) return 'Large'
  return 'Giant'
}

// Anti-cheat: a task can only be marked done starting 10 minutes before its
// scheduled end time. Handles overnight tasks (end time past midnight) the
// same way backend.py's _earliest_completion_time() does.
export function earliestCompletionTime(task) {
  const [y, m, d] = task.date.split('-').map(Number)
  const [sh, sm] = task.start_time.split(':').map(Number)
  const [eh, em] = task.end_time.split(':').map(Number)
  const start = new Date(y, m - 1, d, sh, sm)
  let end = new Date(y, m - 1, d, eh, em)
  if (end <= start) end = new Date(end.getTime() + 24 * 60 * 60 * 1000)
  return new Date(end.getTime() - 10 * 60 * 1000)
}

// Same day-walking logic as get_streak() in backend.py: today only needs to
// be complete to count, but an unfinished today doesn't zero out past days.
// A genuinely missed PAST day breaks the streak.
export function getStreak(tasks) {
  let streak = 0
  let currentDay = new Date()
  const todayString = todayStr()

  while (true) {
    const dayStr = toDateStr(currentDay)
    const dayTasks = tasks.filter((t) => t.date === dayStr)

    if (dayTasks.length === 0) {
      if (dayStr === todayString) {
        currentDay = new Date(currentDay.getTime() - 24 * 60 * 60 * 1000)
        continue
      } else {
        break
      }
    }

    if (dayTasks.every((t) => t.done)) {
      streak += 1
      currentDay = new Date(currentDay.getTime() - 24 * 60 * 60 * 1000)
    } else if (dayStr === todayString) {
      currentDay = new Date(currentDay.getTime() - 24 * 60 * 60 * 1000)
      continue
    } else {
      break
    }
  }

  return streak
}

export function getLevelAndBadge(tasks) {
  const streak = getStreak(tasks)
  let level = 0
  let badge = 'No badge yet'
  for (const [lvl, daysRequired, badgeName] of BADGE_TIERS) {
    if (streak >= daysRequired) {
      level = lvl
      badge = badgeName
    } else {
      break
    }
  }
  return { level, badge, streak }
}

// Progress toward the NEXT tier, for the progress bar. Returns 0-100.
export function getLevelProgress(streak, level) {
  if (level >= BADGE_TIERS.length) return 100
  const lo = level === 0 ? 0 : BADGE_TIERS[level - 1][1]
  const hi = BADGE_TIERS[level][1]
  const pct = ((streak - lo) / (hi - lo)) * 100
  return Math.min(100, Math.max(0, Math.round(pct)))
}

export function getDailyScore(tasks, dayStr) {
  const dayTasks = tasks.filter((t) => t.date === dayStr)
  let total = 0

  for (const task of dayTasks) {
    const points = SIZE_POINTS[task.size] ?? 1
    const multiplier = DIFFICULTY_MULTIPLIER[task.difficulty] ?? 1
    const maxPoints = points * multiplier

    if (task.subtasks && task.subtasks.length > 0) {
      const completed = task.subtasks.filter((s) => s.done).length
      total += maxPoints * (completed / task.subtasks.length)
    } else if (task.done) {
      total += maxPoints
    }
  }

  return total
}

export function getMotivationalQuote() {
  return MOTIVATIONAL_QUOTES[Math.floor(Math.random() * MOTIVATIONAL_QUOTES.length)]
}

export function getScheduledQuote() {
  const hour = new Date().getHours()
  if (hour === 7) return `Good morning! ${getMotivationalQuote()}`
  if (hour === 21) return `Good night! ${getMotivationalQuote()}`
  return null
}


// Caches one quote per calendar day in localStorage, mirroring the
// st.session_state date-keyed cache from the Streamlit version — but this
// survives full page reloads too, not just re-renders.
export function getDailyQuote() {
  const key = `blocks_daily_quote_${todayStr()}`
  const cached = localStorage.getItem(key)
  if (cached) return cached

  const quote = getScheduledQuote() || getMotivationalQuote()
  localStorage.setItem(key, quote)
  return quote
}
// Stats for a given time window, used by the Castle/Blocks screen's
// Day/Week/Month/Year/All Time selector.
export function getPeriodStats(tasks, period) {
  function daysBetween(dateStr) {
    const [y, m, d] = dateStr.split('-').map(Number)
    const taskDate = new Date(y, m - 1, d)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    return Math.round((today - taskDate) / 86400000)
  }

  const filtered = tasks.filter((t) => {
    if (period === 'all') return true
    const db = daysBetween(t.date)
    if (period === 'day') return db === 0
    if (period === 'week') return db >= 0 && db < 7
    if (period === 'month') return db >= 0 && db < 30
    if (period === 'year') return db >= 0 && db < 365
    return true
  })

  const totalTasks = filtered.length
  const completedTasks = filtered.filter((t) => t.done).length
  const completionRate = totalTasks ? Math.round((completedTasks / totalTasks) * 100) : 0
  const blocksBuilt =
    completedTasks +
    filtered.reduce((sum, t) => sum + (t.subtasks || []).filter((s) => s.done).length, 0)

  const uniqueDates = [...new Set(filtered.map((t) => t.date))]
  const xpEarned = uniqueDates.reduce((sum, d) => sum + getDailyScore(tasks, d), 0)

  function taskMinutes(t) {
    const [sh, sm] = t.start_time.split(':').map(Number)
    const [eh, em] = t.end_time.split(':').map(Number)
    let s = sh * 60 + sm
    let e = eh * 60 + em
    if (e <= s) e += 24 * 60
    return e - s
  }

  const timeFocusedHours =
    Math.round(
      (filtered.filter((t) => t.done).reduce((sum, t) => sum + taskMinutes(t), 0) / 60) * 10
    ) / 10

  return {
    totalTasks,
    completedTasks,
    completionRate,
    blocksBuilt,
    xpEarned: +xpEarned.toFixed(1),
    timeFocusedHours,
  }
}
export const CATEGORY_COLOR_HEX = {
  spiritual: '#a855f7',
  work: 'var(--green)',
  study: '#3b82f6',
  gym: '#f97316',
  chores: '#8891a8',
  eat: '#b5563c',
  other: '#e8ebf5',
}

export function taskDurationMinutes(t) {
  const [sh, sm] = t.start_time.split(':').map(Number)
  const [eh, em] = t.end_time.split(':').map(Number)
  let s = sh * 60 + sm
  let e = eh * 60 + em
  if (e <= s) e += 24 * 60
  return e - s
}

export function getAllTimeScore(tasks) {
  const uniqueDates = [...new Set(tasks.map((t) => t.date))]
  return +uniqueDates.reduce((sum, d) => sum + getDailyScore(tasks, d), 0).toFixed(1)
}

export function getSevenDayStats(tasks) {
  const days = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const dayStr = toDateStr(d)
    const dayTasks = tasks.filter((t) => t.date === dayStr)
    const completed = dayTasks.filter((t) => t.done).length
    const total = dayTasks.length
    const plannedHours = +(dayTasks.reduce((s, t) => s + taskDurationMinutes(t), 0) / 60).toFixed(1)
    const completedHours = +(
      dayTasks.filter((t) => t.done).reduce((s, t) => s + taskDurationMinutes(t), 0) / 60
    ).toFixed(1)
    days.push({ date: dayStr, completed, total, plannedHours, completedHours })
  }
  return days
}

export function getDifficultyBreakdown(tasks) {
  const done = tasks.filter((t) => t.done)
  const counts = { easy: 0, medium: 0, hard: 0 }
  done.forEach((t) => {
    if (counts[t.difficulty] !== undefined) counts[t.difficulty] += 1
  })
  const total = done.length
  const pct = {}
  Object.keys(counts).forEach((k) => {
    pct[k] = total ? Math.round((counts[k] / total) * 100) : 0
  })
  return { counts, pct, total }
}

export function getCategoryBreakdown(tasks) {
  const buckets = {}
  tasks.forEach((t) => {
    if (!buckets[t.category]) buckets[t.category] = [0, 0]
    buckets[t.category][1] += 1
    if (t.done) buckets[t.category][0] += 1
  })
  const rates = {}
  Object.entries(buckets).forEach(([cat, [done, total]]) => {
    rates[cat] = { rate: total ? Math.round((done / total) * 100) : 0, total }
  })
  return rates
}
// Ported from generate_recurring_tasks() in backend.py. Given the tasks
// already loaded, returns any NEW task rows (no id yet) that need to be
// inserted today because a recurring template hasn't spawned today's
// instance yet. Pure function — the caller does the actual DB insert.
export function getMissingRecurringInstances(tasks) {
  const todayString = todayStr()
  const templates = tasks.filter((t) => t.recurring)
  const toCreate = []

  for (const template of templates) {
    const alreadyExists = tasks.some((t) => t.name === template.name && t.date === todayString)
    if (alreadyExists) continue

    const baseFields = {
      user_id: template.user_id,
      name: template.name,
      done: false,
      start_time: template.start_time,
      end_time: template.end_time,
      recurring: template.recurring,
      category: template.category,
      color: template.color,
      size: template.size,
      difficulty: template.difficulty,
      miss_reason: null,
      actual_end_time: null,
    }

    if (template.recurring === 'daily') {
      toCreate.push({ ...baseFields, date: todayString })
    } else if (template.recurring === 'weekly') {
      const [y, m, d] = template.date.split('-').map(Number)
      const originalDate = new Date(y, m - 1, d)
      const today = new Date()
      if (today.getDay() === originalDate.getDay()) {
        toCreate.push({ ...baseFields, date: todayString })
      }
    }
  }

  return toCreate
}

export function goalAchievedMessage(goalName) {
  return `Goal achieved: ${goalName}! What's next? 🧱`
}