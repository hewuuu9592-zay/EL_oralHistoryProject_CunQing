import { Routes, Route, useNavigate } from 'react-router-dom'
import { useEffect } from 'react'
import MyMemoir from './pages/MyMemoir'
// import PersonCard from './pages/PersonCard'
import StoryDetail from './pages/StoryDetail'
import RecordStory from './pages/RecordStory'
import InterviewPage from './pages/InterviewPage'
import Settings from './pages/Settings'
import Welcome from './pages/Welcome'
import { getPerson } from './api'
import './App.css'

function App() {
  const navigate = useNavigate()

  useEffect(() => {
    // 启动检测：验证 current_person_id 对应的 person 是否存在
    const checkPerson = async () => {
      const currentPersonId = localStorage.getItem('current_person_id')
      if (!currentPersonId) {
        navigate('/welcome', { replace: true })
        return
      }
      try {
        await getPerson(currentPersonId)
      } catch (error) {
        // person 不存在，清除 localStorage 并跳转 welcome
        localStorage.removeItem('current_person_id')
        navigate('/welcome', { replace: true })
      }
    }
    checkPerson()
  }, [navigate])

  return (
    <div className="min-h-screen bg-[#F5F1E9]">
      <Routes>
        <Route path="/" element={<MyMemoir />} />
        {/* <Route path="/person/:id" element={<PersonCard />} /> */}
        <Route path="/story/:id" element={<StoryDetail />} />
        <Route path="/record" element={<RecordStory />} />
        <Route path="/interview" element={<InterviewPage />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/welcome" element={<Welcome />} />
      </Routes>
    </div>
  )
}

export default App