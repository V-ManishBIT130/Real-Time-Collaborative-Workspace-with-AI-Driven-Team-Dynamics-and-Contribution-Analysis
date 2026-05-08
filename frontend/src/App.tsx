import { Routes, Route, Navigate } from 'react-router-dom'
import Home from './pages/Home'
import Lobby from './pages/Lobby'
import Workspace from './pages/Workspace'

function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/lobby/:roomCode" element={<Lobby />} />
      <Route path="/workspace/:roomCode" element={<Workspace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
