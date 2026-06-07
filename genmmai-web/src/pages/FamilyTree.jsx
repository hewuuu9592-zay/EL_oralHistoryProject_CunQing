import React, { useState, useEffect, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { getPersons, getRelationships, getPerson, getPersonChapters, getNextChapter, updateChapterStatus, getStoriesCount, startInterview, getPersonStories, getPersonInterviews, createPerson, updatePerson, deletePerson, deleteRelationship, getPersonMigrations } from '../api'
import FamilyTimeline from './FamilyTimeline'
import FamilyMigrationMap from './FamilyMigrationMap'
import ChapterList from './ChapterList'
import FamilyMembers from './FamilyMembers'

// 日期格式化
const formatDate = () => {
  const now = new Date()
  const options = { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' }
  return now.toLocaleDateString('zh-CN', options)
}

const FamilyTree = () => {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('today') // today | stories | tree | map
  const [sidebarExpanded, setSidebarExpanded] = useState(true)
  const [currentPersonId, setCurrentPersonId] = useState(null)
  const [currentPerson, setCurrentPerson] = useState(null)
  const [nextChapter, setNextChapter] = useState(null)
  const [chapters, setChapters] = useState([])
  const [totalStories, setTotalStories] = useState(0)
  const [showChapterList, setShowChapterList] = useState(false)

  // 加载数据
  const fetchData = async (personId) => {
    if (!personId) return
    setLoading(true)
    try {
      const [personRes, nextChapterRes, chaptersRes, storiesCountRes] = await Promise.all([
        getPerson(personId),
        getNextChapter(personId),
        getPersonChapters(personId),
        getStoriesCount(),
      ])
      setCurrentPerson(personRes.data)
      setNextChapter(nextChapterRes.data)
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
  const handleStartInterview = async () => {
    if (!currentPersonId || !nextChapter) return
    try {
      const res = await startInterview(currentPersonId, { chapter_id: nextChapter.chapter_id })
      navigate(`/interview?sessionId=${res.data.session_id}`)
    } catch (err) {
      console.error('开始采访失败:', err)
    }
  }

  // 跳过当前章节
  const handleSkipChapter = async () => {
    if (!currentPersonId || !nextChapter) return
    try {
      await updateChapterStatus(currentPersonId, nextChapter.chapter_id, { status: 'skipped', skip_reason: '用户跳过' })
      fetchData(currentPersonId)
    } catch (err) {
      console.error('跳过失败:', err)
    }
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
    { key: 'map', label: '家族地图' },
  ]

  // 计算进度
  const completedCount = chapters.filter(c => c.status === 'completed').length
  const progress = completedCount / 11

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FAF7F2] flex items-center justify-center">
        <div className="text-[#5C3D2E] text-xl">加载中...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#FAF7F2]">
      {/* 侧边栏 */}
      <div
        className={`fixed left-0 top-0 h-full flex flex-col bg-[#FAF7F2] border-r border-[#E5DED3] z-40 transition-all duration-300 ${
          sidebarExpanded ? 'w-[180px]' : 'w-0 overflow-hidden'
        }`}
      >
        {/* Logo - 仅展开时显示 */}
        {sidebarExpanded && (
          <div className="h-16 flex items-center justify-center border-b border-[#E5DED3]">
            <h1 className="text-2xl font-serif text-[#5C3D2E]">根脉</h1>
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
      <div className={`flex flex-col overflow-hidden transition-all duration-300 ${sidebarExpanded ? 'ml-[180px]' : 'ml-0'}`}>
        {/* 顶部栏 */}
        <div className="h-16 bg-white border-b border-[#E5DED3] flex items-center justify-between px-6">
          <div className="text-[#5C3D2E] font-medium">
            {navItems.find(n => n.key === activeTab)?.label}
          </div>
        </div>

        {/* 内容区域 */}
        <div className="flex-1 overflow-auto">
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

              {/* 当前章节卡片 */}
              {nextChapter ? (
                <div className="bg-white rounded-2xl p-6 shadow-sm mb-6">
                  {/* 章节序号和标题 */}
                  <div className="flex items-center gap-4 mb-4">
                    <span className="text-5xl font-serif text-[#D4A574]">{nextChapter.order_index}</span>
                    <div>
                      <h3 className="text-2xl font-serif text-[#5C3D2E]">{nextChapter.title}</h3>
                      <p className="text-gray-400 text-sm mt-1">第{nextChapter.order_index}章 · 共11章</p>
                    </div>
                  </div>

                  {/* 引导语 */}
                  <p className="text-gray-500 mb-6">{nextChapter.description || '请分享您的故事'}</p>

                  {/* 进度条 */}
                  <div className="h-1 bg-gray-100 rounded-full mb-8">
                    <div
                      className="h-full bg-[#D4A574] rounded-full transition-all"
                      style={{ width: `${progress * 100}%` }}
                    />
                  </div>

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
                    <button
                      onClick={handleSkipChapter}
                      className="w-full h-10 text-sm text-gray-400 hover:text-gray-600"
                    >
                      今天先跳过
                    </button>
                  </div>
                </div>
              ) : (
                /* 全部完成 */
                <div className="bg-white rounded-2xl p-8 shadow-sm text-center">
                  <p className="text-xl text-[#5C3D2E] mb-6">你的故事，我们都记下来了</p>
                  <button
                    onClick={() => setActiveTab('stories')}
                    className="px-6 py-3 bg-[#5C3D2E] text-white rounded-xl hover:bg-[#4A3125]"
                  >
                    翻看我的自传
                  </button>
                </div>
              )}

              {/* 底部章节进度 */}
              <div className="mt-8">
                <button
                  onClick={() => setShowChapterList(!showChapterList)}
                  className="w-full py-3 text-center text-[#5C3D2E] border border-[#E5DED3] rounded-xl hover:bg-[#F5F1E9]"
                >
                  {showChapterList ? '收起章节列表' : '查看全部章节'}
                </button>

                {showChapterList && (
                  <div className="mt-4">
                    <ChapterList personId={currentPersonId} />
                  </div>
                )}

                {!showChapterList && (
                  <div className="flex gap-2 mt-4">
                    {Array.from({ length: 11 }, (_, i) => {
                      const chapter = chapters.find(c => c.order_index === i + 1)
                      const isCompleted = chapter?.status === 'completed'
                      return (
                        <button
                          key={i}
                          onClick={() => chapter && setNextChapter(chapter)}
                          className={`flex-1 h-2 rounded-full transition-colors ${
                            isCompleted ? 'bg-[#D4A574]' : 'bg-gray-200'
                          }`}
                        />
                      )
                    })}
                </div>
                )}
              </div>
            </div>
          )}

          {/* 我的故事 */}
          {activeTab === 'stories' && currentPersonId && (
            <FamilyTimeline personId={currentPersonId} />
          )}

          {/* 家族脉络 */}
          {activeTab === 'tree' && <FamilyMembers />}

          {/* 家族地图 */}
          {activeTab === 'map' && (
            <div className="p-6">
              <p className="text-center text-gray-400">家族地图页面</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default FamilyTree