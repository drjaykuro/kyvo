import { Home, LayoutGrid, Sparkles, BarChart3, CircleUserRound } from 'lucide-react'
import './BottomNav.css'

const NAV_ITEMS = [
  { key: 'home', icon: Home },
  { key: 'blocks', icon: LayoutGrid },
  { key: 'ai', icon: Sparkles, center: true },
  { key: 'progress', icon: BarChart3 },
  { key: 'profile', icon: CircleUserRound },
]

function BottomNav({ active, onChange }) {
  return (
    <nav className="bottom-nav">
      {NAV_ITEMS.map(({ key, icon: Icon, center }) => (
        <button
          key={key}
          className={`nav-icon-button${center ? ' ai-center shine' : ''}${active === key ? ' active' : ''}`}
          onClick={() => onChange(key)}
          aria-label={key}
        >
          <Icon size={center ? 24 : 22} strokeWidth={2} />
        </button>
      ))}
    </nav>
  )
}

export default BottomNav