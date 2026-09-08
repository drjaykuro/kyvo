import { useEffect, useRef, useState } from 'react'
import { Lock, Check, LogOut, Camera } from 'lucide-react'
import { createClient } from '@supabase/supabase-js'
import { supabase } from './supabaseClient'
import { getStreak, getAllTimeScore, BADGE_TIERS } from './blocksLogic'
import './Home.css'
import './Profile.css'

const storageClient = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
)

const MAX_AVATAR_SIZE = 10 * 1024 * 1024
const MAX_AVATAR_DIMENSION = 800
const TARGET_AVATAR_SIZE = 900 * 1024
const AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

async function compressAvatar(file) {
  const objectUrl = URL.createObjectURL(file)

  try {
    const image = new Image()
    image.decoding = 'async'
    image.src = objectUrl
    await image.decode()

    const scale = Math.min(1, MAX_AVATAR_DIMENSION / Math.max(image.naturalWidth, image.naturalHeight))
    const width = Math.max(1, Math.round(image.naturalWidth * scale))
    const height = Math.max(1, Math.round(image.naturalHeight * scale))

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Could not prepare the image for upload.')

    context.imageSmoothingEnabled = true
    context.imageSmoothingQuality = 'high'
    context.drawImage(image, 0, 0, width, height)

    const qualities = [0.82, 0.72, 0.62, 0.52]
    let bestBlob = null

    for (const quality of qualities) {
      const blob = await new Promise((resolve) => {
        canvas.toBlob(resolve, 'image/webp', quality)
      })
      if (!blob) continue
      bestBlob = blob
      if (blob.size <= TARGET_AVATAR_SIZE) break
    }

    if (!bestBlob) {
      bestBlob = await new Promise((resolve) => {
        canvas.toBlob(resolve, 'image/jpeg', 0.78)
      })
    }

    if (!bestBlob) throw new Error('Could not compress the image. Please try another photo.')

    return new File([bestBlob], 'avatar.webp', {
      type: bestBlob.type || 'image/webp',
      lastModified: Date.now(),
    })
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

function Profile({ userId }) {
  const [profile, setProfile] = useState(null)
  const [tasks, setTasks] = useState([])
  const [ownRank, setOwnRank] = useState(null)
  const [leaderboardSize, setLeaderboardSize] = useState(0)
  const [bio, setBio] = useState('')
  const [bioSaving, setBioSaving] = useState(false)
  const [bioSaved, setBioSaved] = useState(false)
  const [avatarUploading, setAvatarUploading] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [feedbackStatus, setFeedbackStatus] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const avatarInputRef = useRef(null)

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

  async function handleAvatarChange(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    if (!AVATAR_TYPES.includes(file.type)) {
      setError('Please choose a JPG, PNG, WEBP, or GIF image.')
      return
    }
    if (file.size > MAX_AVATAR_SIZE) {
      setError('Profile pictures must be 10 MB or smaller.')
      return
    }

    setAvatarUploading(true)
    setError('')

    try {
      const compressedFile = await compressAvatar(file)
      const path = `${userId}/${crypto.randomUUID()}.webp`
      const { error: uploadError } = await storageClient.storage
        .from('avatars')
        .upload(path, compressedFile, {
          cacheControl: '31536000',
          contentType: 'image/webp',
          upsert: false,
        })

      if (uploadError) throw uploadError

      const { data: publicUrlData } = storageClient.storage.from('avatars').getPublicUrl(path)
      const avatarUrl = publicUrlData.publicUrl

      const { error: profileError } = await supabase
        .from('users')
        .update({ avatar_url: avatarUrl })
        .eq('id', userId)

      if (profileError) throw profileError

      const previousUrl = profile?.avatar_url
      setProfile((current) => ({ ...current, avatar_url: avatarUrl }))

      if (previousUrl) {
        const marker = '/storage/v1/object/public/avatars/'
        const previousPath = previousUrl.includes(marker) ? previousUrl.split(marker)[1].split('?')[0] : null
        if (previousPath) {
          await storageClient.storage.from('avatars').remove([previousPath]).catch(() => {})
        }
      }
    } catch (avatarError) {
      setError(avatarError.message || 'Could not update your profile picture. Please try again.')
    } finally {
      setAvatarUploading(false)
    }
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

  if (loading) {
    return <p className="home-loading">Loading your profile…</p>
  }

  if (!profile) {
    return (
      <div className="home-screen">
        <h1 className="home-greeting">Profile</h1>
        <p className="empty-text">Your profile is not available on this device yet. Connect to the internet once to load it.</p>
        <button className="logout-button" onClick={handleLogout}>
          <LogOut size={16} />
          Log out
        </button>
      </div>
    )
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

      <div style={{ marginTop: '-8px', marginBottom: '22px', color: 'var(--text-dim)', fontSize: 11, letterSpacing: '0.04em' }}>
        Built by J Gravity Labs
      </div>

      {error && <p className="home-error">{error}</p>}

      <div className="profile-header">
        <button
          type="button"
          className="avatar-button"
          onClick={() => avatarInputRef.current?.click()}
          disabled={avatarUploading}
          aria-label="Change profile picture"
        >
          <div className="avatar-circle block-3d shine" style={{ '--block-color': 'var(--green)' }}>
            {profile.avatar_url ? (
              <img src={profile.avatar_url} alt="Profile" className="avatar-image" />
            ) : (
              initials
            )}
          </div>
          <span className="avatar-camera"><Camera size={14} /></span>
        </button>
        <input
          ref={avatarInputRef}
          className="avatar-file-input"
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          onChange={handleAvatarChange}
        />
        <div>
          <div className="profile-name">{profile.name}</div>
          <div className="profile-username">@{profile.username}</div>
          <div className="profile-joined">
            {avatarUploading ? 'Optimizing profile picture…' : `Joined ${profile.signup_date}`}
          </div>
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

      <div style={{ textAlign: 'center', padding: '20px 0 8px', color: 'var(--text-dim)' }}>
        <div style={{ fontSize: 10, marginTop: 3 }}>© 2026 J Gravity Labs</div>
      </div>

      <div style={{ height: '80px' }} />
    </div>
  )
}

export default Profile
