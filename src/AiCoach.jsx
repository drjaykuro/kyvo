import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowUp, Bot, CalendarCheck2, RefreshCw, RotateCcw, Sparkles, Target, TrendingUp } from 'lucide-react'
import { supabase } from './supabaseClient'
import { getAllTimeScore, getLevelAndBadge, getStreak, todayStr } from './blocksLogic'
import './AiCoach.css'

const QUICK_PROMPTS = [
  { label: 'Prioritise my day', icon: CalendarCheck2, prompt: 'Help me prioritise my day' },
  { label: 'Review my goals', icon: Target, prompt: 'Review my goals' },
  { label: 'Analyse my progress', icon: TrendingUp, prompt: 'Analyse my progress' },
]
const WELCOME = { role: 'assistant', text: "Hey! 👋 I'm KYVO Coach. I can now review the tasks, goals, and progress saved in your KYVO account. What would you like to work on?" }
const fmtDate = (date) => date ? new Date(`${date}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : ''

function makeSnapshot(tasks, goals, profile) {
  const today = todayStr()
  const todayTasks = tasks.filter(t => t.date === today)
  const pendingToday = todayTasks.filter(t => !t.done).sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''))
  const overdue = tasks.filter(t => !t.done && t.date < today).sort((a, b) => (a.date || '').localeCompare(b.date || ''))
  const completed = tasks.filter(t => t.done).length
  const openGoals = goals.filter(g => !g.achieved)
  const achievedGoals = goals.filter(g => g.achieved)
  const { level, badge, streak } = getLevelAndBadge(tasks, Number(profile?.level) || 0)
  return {
    todayTasks, pendingToday, overdue, completed, total: tasks.length,
    completion: tasks.length ? Math.round(completed / tasks.length * 100) : 0,
    openGoals, achievedGoals, level, badge, streak,
    bestStreak: Math.max(Number(profile?.best_streak) || 0, streak),
    xp: Math.round(getAllTimeScore(tasks) * 10) / 10,
  }
}

function replyFor(message, s) {
  if (!s) return "I couldn't load your KYVO data, so I don't want to guess. Refresh the data and try again. If this continues, check your connection and sign-in status."
  const q = message.toLowerCase()
  const todayDone = s.todayTasks.filter(t => t.done).length
  if (/priorit|what should|\bday\b|\btasks?\b/.test(q)) {
    let out = `Your KYVO schedule shows ${todayDone} of ${s.todayTasks.length} tasks completed today.`
    if (s.overdue.length) out += `\n\nYou have ${s.overdue.length} unfinished task(s) from earlier dates. The oldest is “${s.overdue[0].name}” (${fmtDate(s.overdue[0].date)}).`
    if (s.pendingToday.length) {
      const t = s.pendingToday[0]
      out += `\n\nYour next scheduled task is “${t.name}”${t.start_time ? ` at ${t.start_time}` : ''}${t.end_time ? `–${t.end_time}` : ''}. Prepare for that block; if an older task is still urgent, decide whether to reschedule your plan.`
    } else if (!s.todayTasks.length) out += '\n\nYou have no tasks scheduled for today. Consider choosing one next action for an open goal.'
    else out += '\n\nAll tasks scheduled for today are marked complete. You could review your goals or plan tomorrow.'
    return out + '\n\nThis is based on saved dates and times; it cannot know about deadlines or changes you have not entered into KYVO.'
  }
  if (/goal/.test(q)) {
    if (!s.openGoals.length && !s.achievedGoals.length) return "I checked your saved goals and couldn't find any yet. Add a goal on your KYVO Home screen, then I can help you review it."
    let out = `You have ${s.openGoals.length} goal(s) in progress and ${s.achievedGoals.length} marked achieved.`
    if (s.openGoals.length) {
      out += '\n\nIn progress:\n' + s.openGoals.slice(0, 6).map(g => `• ${g.name}${g.target_date ? ` — target ${fmtDate(g.target_date)}` : ''}${g.timeframe ? ` (${g.timeframe}-term)` : ''}`).join('\n')
      const dated = s.openGoals.filter(g => g.target_date).sort((a, b) => a.target_date.localeCompare(b.target_date))
      if (dated[0]) out += `\n\nThe earliest target date saved is for “${dated[0].name}” on ${fmtDate(dated[0].target_date)}. Choose one concrete next action toward it.`
    }
    if (s.achievedGoals.length) out += '\n\nAchieved: ' + s.achievedGoals.slice(0, 4).map(g => g.name).join(', ') + '.'
    return out
  }
  if (/progress|analys|how am i|\bstats\b/.test(q)) {
    let out = `Your KYVO progress snapshot:\n\n• Tasks completed: ${s.completed} of ${s.total} (${s.completion}%).\n• Today's tasks: ${todayDone} of ${s.todayTasks.length} completed.\n• Current streak: ${s.streak} day(s); best recorded streak: ${s.bestStreak} day(s).\n• Level: ${s.level} — ${s.badge}.\n• XP calculated from your saved task history: ${s.xp}.`
    out += `\n• Goals: ${s.achievedGoals.length} achieved, ${s.openGoals.length} in progress.`
    if (s.overdue.length) out += `\n\nThere are ${s.overdue.length} unfinished task(s) dated before today. Review whether to reschedule them.`
    if (!s.total) out += '\n\nThere is not enough task history yet to identify a trend.'
    else if (s.completion >= 80) out += '\n\nYour recorded completion rate is strong. Keep your plan realistic and protect time for important work.'
    else if (s.completion < 50) out += '\n\nTry reducing active commitments and focusing on the most important unfinished task first.'
    else out += '\n\nYou have a base to build on. Identify one thing that commonly interrupts unfinished tasks and adjust it.'
    return out + '\n\nThese are summaries of records saved in KYVO, not a judgement of you.'
  }
  if (/streak|consistent|motivat/.test(q)) return `Your current KYVO streak is ${s.streak} day(s), and your best recorded streak is ${s.bestStreak} day(s).\n\n${s.streak ? 'Protect the routine that is helping you show up, and choose one manageable task for your next session.' : 'Start with one small task you can realistically complete today, then build a repeatable routine around it.'}\n\nA streak is one measure of consistency; it does not define your overall progress.`
  if (/overwhelm|stress|too much/.test(q)) {
    const t = s.overdue[0] || s.pendingToday[0]
    return t ? `Let's make the workload smaller. “${t.name}” ${s.overdue.length ? `is unfinished from ${fmtDate(t.date)}` : 'is one of your remaining tasks today'}. Try just the next 10 minutes, or reschedule it if it no longer fits. You have ${s.pendingToday.length} unfinished task(s) scheduled today.\n\nYou don't have to solve everything at once.` : "Your saved schedule has no unfinished tasks for today. Consider taking a break or choosing one manageable action toward an open goal. I can't measure stress from task records alone."
  }
  return 'I can help using the information saved in KYVO. Try asking:\n\n• “Help me prioritise my day” — review today’s schedule and older unfinished tasks.\n• “Review my goals” — list open and achieved goals.\n• “Analyse my progress” — summarise tasks, XP, level and streak.\n• “Help me build consistency” — review your streak.\n\nI’m a rule-based Smart Coach, not the main generative AI yet.'
}

function AiCoach({ userId }) {
  const [messages, setMessages] = useState([WELCOME])
  const [draft, setDraft] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const [loadingData, setLoadingData] = useState(true)
  const [dataError, setDataError] = useState('')
  const [snapshot, setSnapshot] = useState(null)
  const endRef = useRef(null)
  const timeoutRef = useRef(null)

  const loadData = useCallback(async () => {
    if (!userId) {
      setSnapshot(null); setDataError('Please sign in to view your productivity data.'); setLoadingData(false); return
    }
    setLoadingData(true); setDataError('')
    try {
      const [taskResult, goalResult, profileResult] = await Promise.all([
        supabase.from('tasks').select('*, subtasks(*)').eq('user_id', userId),
        supabase.from('goals').select('*').eq('user_id', userId),
        supabase.from('users').select('level, best_streak, xp_score').eq('id', userId).single(),
      ])
      const error = taskResult.error || goalResult.error || profileResult.error
      if (error) throw error
      setSnapshot(makeSnapshot(taskResult.data || [], goalResult.data || [], profileResult.data || {}))
    } catch (error) {
      console.error('KYVO Smart Coach data load failed:', error)
      setSnapshot(null); setDataError('We could not load your KYVO data. Check your connection and refresh.')
    } finally { setLoadingData(false) }
  }, [userId])

  useEffect(() => { loadData() }, [loadData])
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }) }, [messages, isTyping])
  useEffect(() => () => window.clearTimeout(timeoutRef.current), [])

  function sendMessage(value = draft) {
    const text = value.trim()
    if (!text || isTyping) return
    setMessages(current => [...current, { role: 'user', text }])
    setDraft(''); setIsTyping(true)
    timeoutRef.current = window.setTimeout(() => {
      setMessages(current => [...current, { role: 'assistant', text: replyFor(text, snapshot) }])
      setIsTyping(false)
    }, 400)
  }

  function newChat() {
    window.clearTimeout(timeoutRef.current); setMessages([WELCOME]); setDraft(''); setIsTyping(false)
  }

  return (
    <main className="ai-coach-page">
      <header className="ai-coach-header">
        <div className="ai-coach-brand">
          <div className="ai-coach-mark" aria-hidden="true"><Sparkles size={21} /></div>
          <div><h1>KYVO Coach</h1><p><span className={`ai-coach-status-dot ${loadingData ? 'loading' : snapshot ? 'connected' : 'error'}`} />{loadingData ? 'Loading your data…' : snapshot ? 'Connected to your KYVO data' : 'Data unavailable'}</p></div>
        </div>
        <div className="ai-coach-header-actions">
          <button className="ai-coach-reset" type="button" onClick={loadData} disabled={loadingData} aria-label="Refresh productivity data" title="Refresh data"><RefreshCw size={17} className={loadingData ? 'ai-coach-spinning' : ''} /></button>
          <button className="ai-coach-reset" type="button" onClick={newChat} aria-label="Start a new chat" title="New chat"><RotateCcw size={18} /></button>
        </div>
      </header>
      <div className="ai-coach-demo-notice"><Bot size={16} /><span>This is KYVO’s rule-based Smart Coach. It reads your saved tasks, goals and progress to provide data-based suggestions. It is not the main generative AI yet.</span></div>
      {dataError && <div className="ai-coach-data-error" role="alert">{dataError}</div>}
      {snapshot && <section className="ai-coach-data-panel" aria-label="Your KYVO data summary">
        <div className="ai-coach-data-panel-heading"><div><strong>Your snapshot</strong><span>Based on your saved KYVO data</span></div><button type="button" onClick={loadData} disabled={loadingData}>Refresh</button></div>
        <div className="ai-coach-stat-grid">
          <div><strong>{snapshot.todayTasks.filter(t => t.done).length}/{snapshot.todayTasks.length}</strong><span>Today's tasks</span></div>
          <div><strong>{snapshot.openGoals.length}</strong><span>Open goals</span></div>
          <div><strong>{snapshot.streak} days</strong><span>Current streak</span></div>
          <div><strong>{snapshot.completion}%</strong><span>Task completion</span></div>
        </div>
        {snapshot.pendingToday[0] && <p className="ai-coach-data-detail"><b>Next up:</b> {snapshot.pendingToday[0].name}{snapshot.pendingToday[0].start_time ? ` · ${snapshot.pendingToday[0].start_time}` : ''}</p>}
        {snapshot.openGoals[0] && <p className="ai-coach-data-detail"><b>Goal to keep in view:</b> {snapshot.openGoals[0].name}</p>}
        {!snapshot.todayTasks.length && !snapshot.openGoals.length && <p className="ai-coach-data-detail">No tasks are scheduled today and no open goals were found. Add them in KYVO for more tailored suggestions.</p>}
      </section>}
      <section className="ai-coach-conversation" aria-label="Conversation">
        {messages.map((message, index) => <div className={`ai-coach-message-row ${message.role === 'user' ? 'from-user' : 'from-coach'}`} key={`${index}-${message.role}`}>
          {message.role === 'assistant' && <div className="ai-coach-avatar"><Sparkles size={15} /></div>}<div className="ai-coach-bubble">{message.text}</div>
        </div>)}
        {isTyping && <div className="ai-coach-message-row from-coach" role="status" aria-label="KYVO Coach is preparing a response"><div className="ai-coach-avatar"><Sparkles size={15} /></div><div className="ai-coach-bubble ai-coach-typing"><span /><span /><span /></div></div>}
        <div ref={endRef} />
      </section>
      {messages.length === 1 && <section className="ai-coach-quick-prompts" aria-label="Suggested prompts"><p>Try asking</p>{QUICK_PROMPTS.map(({ label, icon: Icon, prompt }) => <button key={label} type="button" onClick={() => sendMessage(prompt)} disabled={isTyping || loadingData || !snapshot}><Icon size={17} /><span>{label}</span><span className="ai-coach-prompt-arrow">↗</span></button>)}</section>}
      <form className="ai-coach-composer" onSubmit={event => { event.preventDefault(); sendMessage() }}>
        <label className="ai-coach-sr-only" htmlFor="ai-coach-input">Message KYVO Coach</label>
        <textarea id="ai-coach-input" value={draft} onChange={event => setDraft(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendMessage() } }} placeholder="Ask about your productivity..." rows={1} maxLength={1000} disabled={isTyping} />
        <button className="ai-coach-send" type="submit" disabled={!draft.trim() || isTyping} aria-label="Send message"><ArrowUp size={19} /></button>
      </form>
      <p className="ai-coach-footnote">Smart Coach · Based on your saved KYVO data · Enter to send</p>
    </main>
  )
}
export default AiCoach
