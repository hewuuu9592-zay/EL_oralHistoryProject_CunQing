import { Routes, Route } from 'react-router-dom'
import FamilyTree from './pages/FamilyTree'
import PersonCard from './pages/PersonCard'
import StoryDetail from './pages/StoryDetail'
import RecordStory from './pages/RecordStory'
import Settings from './pages/Settings'
import { ThemeProvider } from './contexts/ThemeContext'
import './App.css'

function App() {
  return (
    <ThemeProvider>
      <div className="min-h-screen bg-[#F5F1E9]">
        <Routes>
          <Route path="/" element={<FamilyTree />} />
          <Route path="/person/:id" element={<PersonCard />} />
          <Route path="/story/:id" element={<StoryDetail />} />
          <Route path="/record" element={<RecordStory />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </div>
    </ThemeProvider>
  )
}

export default App