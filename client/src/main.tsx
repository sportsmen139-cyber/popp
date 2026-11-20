import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ApplicationBoundary } from './components/ui/ApplicationBoundary'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ApplicationBoundary><App /></ApplicationBoundary>
  </StrictMode>,
)
