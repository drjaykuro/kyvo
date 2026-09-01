import { useState } from 'react'
import { supabase } from './supabaseClient'
import './Forms.css'

function Signup() {
  const [name, setName] = useState('')
  const [username, setUsername] = useState('')
  const [dob, setDob] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [timeCapsuleNote, setTimeCapsuleNote] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSignup(e) {
    e.preventDefault()
    setError('')

    if (!name || !username || !dob || !email || !password) {
      setError('Every field above is needed to start building.')
      return
    }

    setLoading(true)

    const { data: existing, error: checkError } = await supabase
      .from('users')
      .select('id')
      .eq('username', username)
      .maybeSingle()

    if (checkError) {
      setError('Could not check that username: ' + checkError.message)
      setLoading(false)
      return
    }
    if (existing) {
      setError('That username is already taken — try another.')
      setLoading(false)
      return
    }

    const { data: authData, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
    })

    if (signUpError) {
      setError(signUpError.message)
      setLoading(false)
      return
    }

    const newUserId = authData.user.id

    const { error: updateError } = await supabase
      .from('users')
      .update({
        name,
        username,
        dob,
        time_capsule_note: timeCapsuleNote || null,
      })
      .eq('id', newUserId)

    setLoading(false)

    if (updateError) {
      setError('Account created, but saving your details failed: ' + updateError.message)
      return
    }
  }

  return (
    <form className="auth-form" onSubmit={handleSignup}>
      <h1 className="auth-heading">Start building</h1>
      <p className="auth-subheading">Every future begins with one block.</p>

      {error && <p className="auth-error">{error}</p>}

      <label className="field-label" htmlFor="name">Full name</label>
      <input
        id="name"
        className="field-input"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />

      <label className="field-label" htmlFor="username">Username</label>
      <input
        id="username"
        className="field-input"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
      />

      <label className="field-label" htmlFor="dob">Date of birth</label>
      <input
        id="dob"
        type="date"
        className="field-input"
        value={dob}
        onChange={(e) => setDob(e.target.value)}
      />

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

      <label className="field-label" htmlFor="capsule">
        A note to the person you're becoming <span className="optional-tag">optional</span>
      </label>
      <textarea
        id="capsule"
        className="field-input field-textarea"
        value={timeCapsuleNote}
        onChange={(e) => setTimeCapsuleNote(e.target.value)}
        placeholder="You'll see this again in 90 days."
      />

      <button className="primary-button shine" type="submit" disabled={loading}>
        {loading ? 'Laying the foundation…' : 'Start building'}
      </button>
    </form>
  )
}

export default Signup