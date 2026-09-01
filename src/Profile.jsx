import { useEffect, useState } from 'react'
import { Lock, Check, LogOut } from 'lucide-react'
import { supabase } from './supabaseClient'
import { getStreak, getAllTimeScore, BADGE_TIERS } from './blocksLogic'
import './Home.css'
import './Profile.css'

function Profile({ userId }) {
  const [profile, setProfile] = useState(null)
  const [tasks, setTasks] = useState([])
  const [ownRank, setOwnRank] = useState(null)
  const [leaderboardSize, setLeaderboardSize] = useState(0)
  const [bio, setBio] = useState('')
  const [bioSaving, setBioSaving] = useState(false)
  const [bioSaved, setBioSaved] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [feedbackStatus, setFeedbackStatus] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    loadEverything()
  }, [userId])

  async function loadEverything() {
    setLoading(true)
    setError('')

    const [{ data: profileRow, error: profileError }, { data: taskRows, error: tasksError }] =
      await Promise.all([
        supabase.from('users').select('*').eq('id', userId).single(),
        supabase.from('tasks').select('*, subtasks(*)').eq('user_id', userId),
      ])

    if (profileError) setError(profileError.message)
    if (tasksError) setError(tasksError.message)

    if (profileRow) {
      setProfile(profileRow)
      setBio(profileRow.bio || '')
    }
    if (taskRows) setTasks(taskRows)

    const { data: board, error: boardError } = await supabase
      .from('users')
      .select('id')
      .order('level', { ascending: false })
      .order('xp_score', { ascending: false })
      .limit(1000)
    if (!boardError && board) {
      setLeaderboardSize(board.length)
      const idx = board.findIndex((u) => u.id === userId)
      setOwnRank(idx >= 0 ? idx + 1 : null)
    }

    setLoading(false)
  }

  async function handleSaveBio() {
    setBioSaving(true)
    setBioSaved(false)
    const { error: bioError } = await supabase.from('users').update({ bio }).eq('id', userId)
    setBioSaving(false)
    if (bioError) {
      setError(bioError.message)
      return
    }
    setBioSaved(true)
    setTimeout(() => setBioSaved(false), 2000)
  }

  async function handleSubmitFeedback() {
    if (!feedback.trim()) return
    setFeedbackStatus('sending')
    const { error: fbError } = await supabase
      .from('feedback')
      .insert({ user_id: userId, message: feedback.trim() })
    if (fbError) {
      setFeedbackStatus('error')
      setError(fbError.message)
      return
    }
    setFeedback('')
    setFeedbackStatus('sent')
    setTimeout(() => setFeedbackStatus(''), 3000)
  }

  async function handleLogout() {
    await supabase.auth.signOut()
  }

  if (loading || !profile) {
    return <p className="home-loading">Loading your profile…</p>
  }

  const streak = getStreak(tasks)
  const score = getAllTimeScore(tasks)
  const initials = (profile.name || '?')
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  let currentLevel = 0
  let currentBadge = 'No badge yet'
  for (const [lvl, days, name] of BADGE_TIERS) {
    if (streak >= days) {
      currentLevel = lvl
      currentBadge = name
    } else break
  }

  return (
    <div className="home-screen">
      <h1 className="home-greeting">Profile</h1>

      {error && <p className="home-error">{error}</p>}

      <div className="profile-header">
        <div className="avatar-circle block-3d shine" style={{ '--block-color': 'var(--green)' }}>
          {initials}
        </div>
        <div>
          <div className="profile-name">{profile.name}</div>
          <div className="profile-username">@{profile.username}</div>
          <div className="profile-joined">Joined {profile.signup_date}</div>
        </div>
      </div>

      <div className="level-card">
        <div className="level-card-top">
          <div>
            <div className="stat-label">CURRENT LEVEL</div>
            <div className="stat-value">
              Level {currentLevel} · {currentBadge}
            </div>
          </div>
          <div className="level-card-right">
            <div className="stat-label">{streak}-day streak</div>
            <div className="level-progress-text">{score} XP all-time</div>
          </div>
        </div>
        {ownRank && (
          <div className="week-rate-line">
            Ranked #{ownRank} of {leaderboardSize} on the leaderboard
          </div>
        )}
      </div>

      <h2 className="section-heading">Badges</h2>
      <div className="badge-list">
        {BADGE_TIERS.map(([lvl, days, name]) => {
          const achieved = streak >= days
          return (
            <div className={`badge-row${achieved ? ' achieved' : ''}`} key={name}>
              <div className={`badge-icon${achieved ? ' achieved' : ''}`}>
                {achieved ? <Check size={16} /> : <Lock size={14} />}
              </div>
              <div className="badge-info">
                <div className="badge-name">{name}</div>
                <div className="badge-req">{days} day streak</div>
              </div>
            </div>
          )
        })}
      </div>

      <h2 className="section-heading">About Me</h2>
      <textarea
        className="field-input field-textarea"
        placeholder="Tell people a bit about yourself…"
        value={bio}
        onChange={(e) => setBio(e.target.value)}
      />
      <button className="subtasks-toggle" onClick={handleSaveBio} disabled={bioSaving}>
        {bioSaving ? 'Saving…' : bioSaved ? 'Saved ✓' : 'Save bio'}
      </button>

      <h2 className="section-heading">Feedback</h2>
      <p className="empty-text">Tell us what to add, remove, or improve.</p>
      <textarea
        className="field-input field-textarea"
        placeholder="What would make Blocks better for you?"
        value={feedback}
        onChange={(e) => setFeedback(e.target.value)}
      />
      <button
        className="add-task-button shine"
        onClick={handleSubmitFeedback}
        disabled={feedbackStatus === 'sending'}
      >
        {feedbackStatus === 'sending'
          ? 'Sending…'
          : feedbackStatus === 'sent'
          ? 'Thank you! ✓'
          : 'Send Feedback'}
      </button>

      <button className="logout-button" onClick={handleLogout}>
        <LogOut size={16} />
        Log out
      </button>

      <div style={{ height: '80px' }} />
    </div>
  )
}

export default Profile