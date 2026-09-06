import { useEffect, useRef, useState } from 'react'
import { supabase } from './supabaseClient'
import { requestNotificationPermission, showKyvoNotification } from './notifications'
import AuthLayout from './AuthLayout'
import Signup from './Signup'
import Login from './Login'
import BottomNav from './BottomNav'
import Home from './Home'
import AddTask from './AddTask'
import Castle from './Castle'
import Progress from './Progress'
import Profile from './Profile'

function App() {
  const [session, setSession] = useState(null)
  const [checkingSession, setCheckingSession] = useState(true)
  const [showSignup, setShowSignup] = useState(true)
  const [activeTab, setActiveTab] = useState('home')
  const [showAddTask, setShowAddTask] = useState(false)
  const [offline, setOffline] = useState(() => typeof navigator !== 'undefined' && !navigator.onLine)
  const [justReconnected, setJustReconnected] = useState(false)
  const [notificationPermission, setNotificationPermission] = useState(() => (
    typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'unsupported'
  ))
  const [latestNotification, setLatestNotification] = useState(null)
  const seenNotificationIds = useRef(new Set())

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setCheckingSession(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      seenNotificationIds.current.clear()
      setLatestNotification(null)
    })

    const handleOffline = () => {
      setOffline(true)
      setJustReconnected(false)
    }
    const handleOnline = () => {
      setOffline(false)
      setJustReconnected(true)
      supabase.sync().catch(() => {})
      window.setTimeout(() => setJustReconnected(false), 2500)
    }

    window.addEventListener('offline', handleOffline)
    window.addEventListener('online', handleOnline)

    return () => {
      listener.subscription.unsubscribe()
      window.removeEventListener('offline', handleOffline)
      window.removeEventListener('online', handleOnline)
    }
  }, [])

  useEffect(() => {
    if (!session?.user?.id || offline) return undefined

    let cancelled = false

    async function checkNotifications() {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', session.user.id)
        .eq('seen', false)
        .order('date', { ascending: true })
        .limit(10)

      if (cancelled || error || !data?.length) return

      for (const notification of data) {
        if (!notification?.id || seenNotificationIds.current.has(notification.id)) continue
        seenNotificationIds.current.add(notification.id)
        setLatestNotification(notification)

        await showKyvoNotification('KYVO Reminder', {
          body: notification.message,
          tag: `kyvo-${notification.id}`,
          data: { notificationId: notification.id },
        })

        await supabase
          .from('notifications')
          .update({ seen: true })
          .eq('id', notification.id)
          .eq('user_id', session.user.id)
      }
    }

    checkNotifications().catch(() => {})
    const interval = window.setInterval(() => checkNotifications().catch(() => {}), 30000)

    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [session?.user?.id, offline])

  async function enableNotifications() {
    const permission = await requestNotificationPermission()
    setNotificationPermission(permission)
  }

  async function handleLogout() {
    await supabase.auth.signOut()
  }

  if (checkingSession) {
    return <p style={{ padding: 40 }}>Loading...</p>
  }

  if (!session) {
    return (
      <AuthLayout>
        {showSignup ? <Signup /> : <Login />}
        <button className="toggle-link" onClick={() => setShowSignup(!showSignup)}>
          {showSignup ? 'Already building? Log in' : "New here? Start building"}
        </button>
      </AuthLayout>
    )
  }

  const statusBanner = (offline || justReconnected) ? (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 1000,
        padding: '9px 16px',
        textAlign: 'center',
        fontSize: 13,
        fontWeight: 600,
        background: 'var(--card, #111)',
        color: 'var(--text, #fff)',
        borderBottom: '1px solid var(--border, rgba(255,255,255,.12))',
      }}
    >
      {offline
        ? 'Offline mode — your changes are saved on this device and will sync when you’re back online.'
        : 'Back online · Syncing your changes…'}
    </div>
  ) : null

  const notificationBanner = notificationPermission === 'default' ? (
    <div
      style={{
        position: 'fixed',
        top: offline || justReconnected ? 42 : 0,
        left: 0,
        right: 0,
        zIndex: 999,
        padding: '8px 16px',
        textAlign: 'center',
        fontSize: 12,
        background: 'var(--bg, #0b0b0b)',
        color: 'var(--text, #fff)',
        borderBottom: '1px solid var(--border, rgba(255,255,255,.12))',
      }}
    >
      KYVO can remind you about upcoming blocks.{' '}
      <button
        type="button"
        onClick={enableNotifications}
        style={{
          border: 0,
          background: 'transparent',
          color: 'var(--accent, #8fff72)',
          fontWeight: 700,
          cursor: 'pointer',
          padding: 0,
        }}
      >
        Enable notifications
      </button>
    </div>
  ) : null

  const reminderBanner = latestNotification ? (
    <div
      role="status"
      onClick={() => setLatestNotification(null)}
      style={{
        position: 'fixed',
        left: 16,
        right: 16,
        bottom: 84,
        zIndex: 1001,
        padding: '12px 14px',
        borderRadius: 12,
        background: 'var(--card, #151515)',
        color: 'var(--text, #fff)',
        border: '1px solid var(--border, rgba(255,255,255,.12))',
        boxShadow: '0 12px 30px rgba(0,0,0,.25)',
        cursor: 'pointer',
      }}
    >
      <strong style={{ display: 'block', marginBottom: 4 }}>KYVO Reminder</strong>
      <span style={{ fontSize: 13, color: 'var(--text-dim, #aaa)' }}>{latestNotification.message}</span>
    </div>
  ) : null

  if (activeTab === 'home' && showAddTask) {
    return (
      <>
        {statusBanner}
        {notificationBanner}
        {reminderBanner}
        <AddTask
          userId={session.user.id}
          onBack={() => setShowAddTask(false)}
          onDone={() => setShowAddTask(false)}
        />
      </>
    )
  }

  return (
    <div style={{ minHeight: '100vh' }}>
      {statusBanner}
      {notificationBanner}
      {reminderBanner}
      {activeTab === 'home' && (
        <Home userId={session.user.id} onAddTask={() => setShowAddTask(true)} />
      )}
      {activeTab === 'blocks' && <Castle userId={session.user.id} />}
      {activeTab === 'progress' && <Progress userId={session.user.id} />}
      {activeTab === 'profile' && <Profile userId={session.user.id} />}
      {activeTab !== 'home' &&
        activeTab !== 'blocks' &&
        activeTab !== 'progress' &&
        activeTab !== 'profile' && (
        <div style={{ maxWidth: 480, margin: '0 auto', padding: '24px 16px', paddingBottom: 100 }}>
          <p style={{ color: 'var(--text-dim)' }}>
            "{activeTab}" screen coming soon.
          </p>
          <button className="toggle-link" onClick={handleLogout}>Log out</button>
        </div>
      )}
      <BottomNav active={activeTab} onChange={setActiveTab} />
    </div>
  )
}

export default App
