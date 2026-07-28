import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import WorkspacePage from './pages/workspace/WorkspacePage.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <WorkspacePage />
  </StrictMode>,
)
