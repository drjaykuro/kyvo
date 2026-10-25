import { useEffect, useRef, useState } from 'react'
import { ArrowUp, Bot, CalendarCheck2, RotateCcw, Sparkles, Target, TrendingUp } from 'lucide-react'
import './AiCoach.css'

const QUICK_PROMPTS = [
  { label: 'Prioritise my day', icon: CalendarCheck2, prompt: 'Help me prioritise my day' },
  { label: 'Review my goals', icon: Target, prompt: 'Help me review my goals' },
  { label: 'Build consistency', icon: TrendingUp, prompt: 'How can I build consistency?' },
]

const WELCOME_MESSAGE = {
  role: 'assistant',
  text: "Hey! 👋 I'm KYVO Coach. I can help you think through your tasks, goals, and routines. What would you like to work on?",
}

function getDemoReply(message) {
  const text = message.toLowerCase()

  if (text.includes('priorit') || text.includes('what should') || text.includes('day')) {
    return "Let's make your day manageable. Try this simple order:\n\n1. Start with one important task that has a clear deadline.\n2. Do a smaller task that you can finish quickly.\n3. Leave flexible or less urgent work for later.\n\nThis is a demo suggestion, not yet based on your actual KYVO tasks. In the main AI release, I'll be able to use your available task data to make this more personal."
  }

  if (text.includes('goal')) {
    return "A useful goal review starts with three questions:\n\n• What progress have you made so far?\n• What is the next small, concrete action?\n• Is your current target still realistic?\n\nPick one goal and define an action you can complete today. Demo mode means I can't see your saved goals yet."
  }

  if (text.includes('streak') || text.includes('consistent') || text.includes('motivat')) {
    return "Consistency grows when the next step is small enough to repeat. Try choosing a minimum daily action, linking it to a routine you already have, and tracking completion without aiming for perfection.\n\nIf you miss a day, restart with the next available opportunity. Your progress is bigger than one imperfect day. This demo reply isn't analysing your actual streak."
  }

  if (text.includes('progress') || text.includes('analyse') || text.includes('analy')) {
    return "Here's a simple way to review your progress:\n\n1. Notice what you completed.\n2. Identify what got in the way of unfinished work.\n3. Choose one adjustment for tomorrow.\n\nI'm currently in demo mode, so I can't access or analyse your real KYVO progress yet. The main AI will be designed to use the relevant data securely."
  }

  if (text.includes('overwhelm') || text.includes('stress') || text.includes('too much')) {
    return "Let's reduce the pressure. Write down everything on your mind, choose just one next action, and give yourself permission to focus on that before switching. If something isn't urgent, it may be okay to schedule it for later.\n\nWhat's one thing you could make progress on in the next 10 minutes?"
  }

  return "Let's break that down into a small next step. What outcome matters most to you, and what is one action you could take today?\n\nI'm using prepared demo replies for now, so I don't understand messages the way the main KYVO AI will. Your chat here isn't connected to your tasks or goals yet."
}

function AiCoach() {
  const [messages, setMessages] = useState([WELCOME_MESSAGE])
  const [draft, setDraft] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const endOfMessagesRef = useRef(null)
  const timeoutRef = useRef(null)

  useEffect(() => {
    endOfMessagesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, isTyping])

  useEffect(() => () => window.clearTimeout(timeoutRef.current), [])

  function sendMessage(value = draft) {
    const text = value.trim()
    if (!text || isTyping) return

    setMessages((current) => [...current, { role: 'user', text }])
    setDraft('')
    setIsTyping(true)

    timeoutRef.current = window.setTimeout(() => {
      setMessages((current) => [...current, { role: 'assistant', text: getDemoReply(text) }])
      setIsTyping(false)
    }, 650)
  }

  function startNewChat() {
    window.clearTimeout(timeoutRef.current)
    setMessages([WELCOME_MESSAGE])
    setDraft('')
    setIsTyping(false)
  }

  return (
    <main className="ai-coach-page">
      <header className="ai-coach-header">
        <div className="ai-coach-brand">
          <div className="ai-coach-mark" aria-hidden="true"><Sparkles size={21} /></div>
          <div>
            <h1>KYVO Coach</h1>
            <p><span className="ai-coach-status-dot" /> Demo mode · Progress Coach</p>
          </div>
        </div>
        <button className="ai-coach-reset" type="button" onClick={startNewChat} aria-label="Start a new chat" title="New chat">
          <RotateCcw size={18} />
        </button>
      </header>

      <div className="ai-coach-demo-notice">
        <Bot size={16} />
        <span>You're chatting with the demo. Replies are examples and aren't based on your saved tasks or goals yet.</span>
      </div>

      <section className="ai-coach-conversation" aria-label="Conversation">
        {messages.map((message, index) => (
          <div className={`ai-coach-message-row ${message.role === 'user' ? 'from-user' : 'from-coach'}`} key={`${index}-${message.role}`}>
            {message.role === 'assistant' && <div className="ai-coach-avatar"><Sparkles size={15} /></div>}
            <div className="ai-coach-bubble">{message.text}</div>
          </div>
        ))}
        {isTyping && (
          <div className="ai-coach-message-row from-coach" role="status" aria-label="KYVO Coach is typing">
            <div className="ai-coach-avatar"><Sparkles size={15} /></div>
            <div className="ai-coach-bubble ai-coach-typing"><span /><span /><span /></div>
          </div>
        )}
        <div ref={endOfMessagesRef} />
      </section>

      {messages.length === 1 && (
        <section className="ai-coach-quick-prompts" aria-label="Suggested prompts">
          <p>What can I help with?</p>
          {QUICK_PROMPTS.map(({ label, icon: Icon, prompt }) => (
            <button key={label} type="button" onClick={() => sendMessage(prompt)} disabled={isTyping}>
              <Icon size={17} />
              <span>{label}</span>
              <span className="ai-coach-prompt-arrow">↗</span>
            </button>
          ))}
        </section>
      )}

      <form className="ai-coach-composer" onSubmit={(event) => { event.preventDefault(); sendMessage() }}>
        <label className="ai-coach-sr-only" htmlFor="ai-coach-input">Message KYVO Coach</label>
        <textarea
          id="ai-coach-input"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              sendMessage()
            }
          }}
          placeholder="Ask about your productivity..."
          rows={1}
          maxLength={1000}
          disabled={isTyping}
        />
        <button className="ai-coach-send" type="submit" disabled={!draft.trim() || isTyping} aria-label="Send message">
          <ArrowUp size={19} />
        </button>
      </form>
      <p className="ai-coach-footnote">Demo responses · Press Enter to send, Shift + Enter for a new line</p>
    </main>
  )
}

export default AiCoach
