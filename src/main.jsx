import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

const savedTheme = localStorage.getItem('kyvo-theme') || 'dark'
document.documentElement.dataset.theme = savedTheme

if ('serviceWorker' in navigator) {
window.addEventListener('load', () => {
navigator.serviceWorker.register('/sw.js')
})
}

createRoot(document.getElementById('root')).render( <StrictMode> <App /> </StrictMode>,
)
