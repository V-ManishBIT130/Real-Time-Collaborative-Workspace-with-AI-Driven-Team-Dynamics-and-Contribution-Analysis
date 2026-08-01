import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App'

// Catch and suppress harmless third-party browser extension errors
// (e.g. Chrome extensions closing message channels prematurely)
window.addEventListener('unhandledrejection', (event) => {
  if (
    event.reason &&
    typeof event.reason.message === 'string' &&
    event.reason.message.includes('A listener indicated an asynchronous response by returning true')
  ) {
    event.preventDefault();
  }
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)

