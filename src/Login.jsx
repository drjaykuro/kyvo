import { useState } from 'react'
import { supabase } from './supabaseClient'
import './Forms.css'

function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleLogin(e) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const { error: loginError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    setLoading(false)

    if (loginError) {
      setError(loginError.message)
    }
  }

  return (
    <form className="auth-form" onSubmit={handleLogin}>
      <h1 className="auth-heading">Welcome back</h1>
      <p className="auth-subheading">Your blocks are right where you left them.</p>

      {error && <p className="auth-error">{error}</p>}

      <label className="field-label" htmlFor="email">Email</label>
      <input
        id="email"
        type="email"
        className="field-input"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />

      <label className="field-label" htmlFor="password">Password</label>
      <input
        id="password"
        type="password"
        className="field-input"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />

      <button className="primary-button shine" type="submit" disabled={loading}>
        {loading ? 'Logging in…' : 'Log in'}
      </button>
    </form>
  )
}

export default Login