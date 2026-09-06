import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
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

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setCheckingSession(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
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

  if (activeTab === 'home' && showAddTask) {
    return (
      <>
        {statusBanner}
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
