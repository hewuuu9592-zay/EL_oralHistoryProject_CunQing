import React, { useState, useEffect, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { getPersons, getRelationships, getPerson, getPersonChapters, updateChapterStatus, getStoriesCount, startInterview, getPersonStories, getPersonInterviews, createPerson, updatePerson, deletePerson, deleteRelationship, getPersonMigrations } from '../api'
// import FamilyTimeline from './FamilyTimeline'
// import FamilyMigrationMap from './FamilyMigrationMap'
import FamilyMembers from './FamilyMembers'
import MyFootprint from './MyFootprint'
import MyStories from './MyStories'

// 日期格式化
const formatDate = () => {
  const now = new Date()
  const options = { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' }
  return now.toLocaleDateString('zh-CN', options)
}

const MyMemoir = () => {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('today') // today | stories | tree | map
  const [sidebarExpanded, setSidebarExpanded] = useState(true)
  const [currentPersonId, setCurrentPersonId] = useState(null)
  const [currentPerson, setCurrentPerson] = useState(null)
  const [chapters, setChapters] = useState([])
  const [totalStories, setTotalStories] = useState(0)
  const [selectedChapterIndex, setSelectedChapterIndex] = useState(0)
  const [showMyInfo, setShowMyInfo] = useState(false)

  // 加载数据
  const fetchData = async (personId) => {
    if (!personId) return
    setLoading(true)
    try {
      const [personRes, chaptersRes, storiesCountRes] = await Promise.all([
        getPerson(personId),
        getPersonChapters(personId),
        getStoriesCount(),
      ])
      setCurrentPerson(personRes.data)
      setChapters(chaptersRes.data || [])
      setTotalStories(storiesCountRes.data?.count || 0)
    } catch (error) {
      console.error('Failed to load data:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const pid = localStorage.getItem('current_person_id')
    setCurrentPersonId(pid)
    if (pid) {
      fetchData(pid)
    }
  }, [])

  // 开始AI采访
  const handleStartInterview = () => {
    const firstChapter = chapters.find(c => c.order_index === selectedChapterIndex + 1)
    if (!currentPersonId || !firstChapter) return
    navigate(`/interview?personId=${currentPersonId}&chapterId=${firstChapter.chapter_id}`)
  }

  // 自由记录
  const handleFreeRecord = () => {
    navigate(`/record?personId=${currentPersonId}`)
  }

  // 导航项
  const navItems = [
    { key: 'today', label: '我的自传' },
    { key: 'stories', label: '我的故事' },
    { key: 'tree', label: '家族脉络' },
    { key: 'map', label: '我的足迹' },
  ]

  // // 计算进度
  // const completedCount = chapters.filter(c => c.status === 'completed').length
  // const progress = completedCount / 11

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FAF7F2] flex items-center justify-center">
        <div className="text-[#5C3D2E] text-xl">加载中...</div>
      </div>
    )
  }

  return (
    <div className="h-screen bg-[#FAF7F2] flex flex-col">
      {/* 侧边栏 */}
      <div
        className={`fixed left-0 top-0 h-full flex flex-col bg-[#FAF7F2] border-r border-[#E5DED3] z-40 transition-all duration-300 ${
          sidebarExpanded ? 'w-[180px]' : 'w-0 overflow-hidden'
        }`}
      >
        {/* Logo - 仅展开时显示 */}
        {sidebarExpanded && (
          <div className="h-16 flex items-center justify-center border-b border-[#E5DED3]">
            <h1 className="text-2xl font-serif font-bold text-[#5C3D2E]">存青</h1>
          </div>
        )}

        {/* 导航项 */}
        <div className="flex-1 py-4">
          {navItems.map((item) => (
            <button
              key={item.key}
              onClick={() => setActiveTab(item.key)}
              className={`w-full px-4 py-3 transition-colors ${
                activeTab === item.key
                  ? 'bg-[#5C3D2E] text-white'
                  : 'text-[#4A3728] hover:bg-[#E8DFD0]'
              }`}
            >
              <span className="text-sm">{item.label}</span>
            </button>
          ))}
        </div>

        {/* 我的信息按钮 */}
        <button
          onClick={() => setShowMyInfo(true)}
          className="h-12 border-t border-[#E5DED3] flex items-center justify-center text-[#5C3D2E] hover:bg-[#E8DFD0]"
        >
          我的信息
        </button>

        {/* 收起按钮 */}
        <button
          onClick={() => setSidebarExpanded(!sidebarExpanded)}
          className="h-12 border-t border-[#E5DED3] flex items-center justify-center text-[#5C3D2E] hover:bg-[#E8DFD0]"
        >
          «
        </button>
      </div>

      {/* 悬浮展开按钮 */}
      <button
        onClick={() => setSidebarExpanded(true)}
        className={`fixed left-0 top-1/2 -translate-y-1/2 z-30 w-8 h-16 bg-[#FAF7F2] border-r border-[#E5DED3] flex items-center justify-center text-[#5C3D2E] hover:bg-[#E8DFD0] rounded-r-full transition-opacity duration-200 ${
          sidebarExpanded ? 'opacity-0 pointer-events-none' : 'opacity-100'
        }`}
      >
        »
      </button>

      {/* 主内容区 */}
      <div className={`flex flex-col overflow-hidden transition-all duration-300 h-full ${sidebarExpanded ? 'ml-[180px]' : 'ml-0'}`}>
        {/* 顶部栏 */}
        <div className="h-16 bg-white border-b border-[#E5DED3] flex items-center justify-between px-6">
          <div className="text-[#5C3D2E] font-medium">
            {navItems.find(n => n.key === activeTab)?.label}
          </div>
        </div>

        {/* 内容区域 */}
        <div className="flex-1 overflow-hidden">
          {/* 我的自传首页 */}
          {activeTab === 'today' && (
            <div className="p-6">
              {/* 顶部问候 */}
              <div className="mb-8">
                <h2 className="text-3xl font-serif text-[#5C3D2E] mb-1">
                  你好，{currentPerson?.name || ''}
                </h2>
                <p className="text-gray-400">{formatDate()}</p>
              </div>

              {/* 第一章卡片 */}
              {(() => {
                const firstChapter = chapters.find(c => c.order_index === selectedChapterIndex + 1)
                return firstChapter ? (
                  <div className="bg-white rounded-2xl p-6 shadow-sm mb-6">
                    {/* 章节序号和标题 */}
                    <div className="flex items-center gap-4 mb-4">
                      <span className="text-5xl font-serif text-[#D4A574]">{firstChapter.order_index}</span>
                      <div>
                        <h3 className="text-2xl font-serif text-[#5C3D2E]">{firstChapter.title}</h3>
                        <p className="text-gray-400 text-sm mt-1">第{firstChapter.order_index}章 · 共11章</p>
                      </div>
                    </div>

                    {/* 引导语 */}
                    <p className="text-gray-500 mb-6">{firstChapter.description || '请分享您的故事'}</p>

                    {/* 进度条
                    <div className="h-1 bg-gray-100 rounded-full mb-8">
                      <div
                        className="h-full bg-[#D4A574] rounded-full transition-all"
                        style={{ width: `${progress * 100}%` }}
                      />
                    </div> */}

                    {/* 操作按钮 */}
                    <div className="space-y-3">
                      <button
                        onClick={handleStartInterview}
                        className="w-full h-14 text-lg bg-[#5C3D2E] text-white rounded-xl hover:bg-[#4A3125] transition-colors"
                      >
                        开始AI采访
                      </button>
                      <button
                        onClick={handleFreeRecord}
                        className="w-full h-12 text-lg border-2 border-[#5C3D2E] text-[#5C3D2E] rounded-xl hover:bg-[#F5F1E9] transition-colors"
                      >
                        自由记录
                      </button>
                    </div>
                  </div>
                ) : null
              })()}

              {/* 底部进度条 */}
              <div className="mt-8">
                <div className="flex gap-2">
                  {Array.from({ length: 11 }, (_, i) => {
                    const chapter = chapters.find(c => c.order_index === i + 1)
                    const isCompleted = chapter?.status === 'completed'
                    return (
                      <div
                        key={i}
                        onClick={() => setSelectedChapterIndex(i)}
                        className={`flex-1 h-4 rounded-full transition-colors cursor-pointer hover:opacity-70 ${
                          i === selectedChapterIndex ? 'bg-[#D4A574]' :  // 当前选中：深棕色
                          'bg-gray-200'                                    // 未开始：灰色
                        }`}
                      />
                    )
                    })}
                </div>
              </div>
            </div>
          )}

          {/* 我的故事 */}
          {activeTab === 'stories' && currentPersonId && (
            <MyStories personId={currentPersonId} />
          )}

          {/* 家族脉络 */}
          {activeTab === 'tree' && <FamilyMembers />}

          {/* 我的足迹 */}
          {activeTab === 'map' && currentPersonId && (
            <MyFootprint personId={currentPersonId} />
          )}
        </div>
      </div>

      {/* 我的信息弹窗 */}
      {showMyInfo && currentPerson && (
        <MyInfoModal
          person={currentPerson}
          onSave={async (data) => {
            await updatePerson(currentPersonId, data)
            fetchData(currentPersonId)
            setShowMyInfo(false)
          }}
          onClose={() => setShowMyInfo(false)}
        />
      )}
    </div>
  )
}

// 我的信息弹窗
const MyInfoModal = ({ person, onSave, onClose }) => {
  const [form, setForm] = useState({
    name: person?.name || '',
    birth_year: person?.birth_year || '',
    bio: person?.bio || '',
    avatar_url: person?.avatar_url || '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async () => {
    if (!form.name.trim()) {
      setError('请输入姓名')
      return
    }
    setLoading(true)
    setError('')
    try {
      await onSave({
        name: form.name.trim(),
        birth_year: form.birth_year ? parseInt(form.birth_year) : null,
        bio: form.bio.trim() || null,
        avatar_url: form.avatar_url || null,
      })
    } catch (err) {
      setError(err.response?.data?.detail || '保存失败，请重试')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[1100]">
      <div className="bg-white rounded-xl w-[400px] max-h-[90vh] flex flex-col">
        
        <div className="p-6 pb-2">
          <h3 className="text-xl font-serif text-[#5C3D2E]">我的信息</h3>
        </div>

        <div className="flex-1 overflow-y-auto px-6">
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-gray-600 mb-1">姓名</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full px-4 py-2 border border-[#E5DED3] rounded-lg focus:outline-none focus:border-[#5C3D2E]"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-600 mb-1">出生年份</label>
              <input
                type="number"
                value={form.birth_year}
                onChange={(e) => setForm({ ...form, birth_year: e.target.value })}
                className="w-full px-4 py-2 border border-[#E5DED3] rounded-lg focus:outline-none focus:border-[#5C3D2E]"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-600 mb-1">简介</label>
              <textarea
                value={form.bio}
                onChange={(e) => setForm({ ...form, bio: e.target.value })}
                className="w-full px-4 py-2 border border-[#E5DED3] rounded-lg focus:outline-none focus:border-[#5C3D2E] resize-none"
                rows={3}
              />
            </div>

            <div>
              <label className="block text-sm text-gray-600 mb-1">头像链接</label>
              <input
                type="text"
                value={form.avatar_url}
                onChange={(e) => setForm({ ...form, avatar_url: e.target.value })}
                className="w-full px-4 py-2 border border-[#E5DED3] rounded-lg focus:outline-none focus:border-[#5C3D2E]"
              />
            </div>
          </div>
        

          {error && <p className="text-red-500 text-sm">{error}</p>}
        </div>

        <div className="p-6 pt-2">
        <div className="flex gap-3">
            <button onClick={onClose} className="flex-1 py-2 border border-[#5C3D2E] text-[#5C3D2E] rounded-lg hover:bg-[#F5F1E9]">
              取消
            </button>
            <button onClick={handleSubmit} disabled={loading} className="flex-1 py-2 bg-[#5C3D2E] text-white rounded-lg hover:bg-[#4A3125] disabled:opacity-50">
              {loading ? '保存中...' : '保存'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default MyMemoir