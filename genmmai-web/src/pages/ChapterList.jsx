import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { getPersonChapters, getChapterStories, updateChapterStatus, startInterview } from '../api'

const ChapterList = ({ personId }) => {
  const navigate = useNavigate()
  const [chapters, setChapters] = useState([])
  const [loading, setLoading] = useState(true)
  const [expandedChapter, setExpandedChapter] = useState(null)
  const [chapterStories, setChapterStories] = useState({})
  const [showModal, setShowModal] = useState(false)
  const [selectedChapter, setSelectedChapter] = useState(null)

  useEffect(() => {
    if (personId) {
      fetchChapters()
    }
  }, [personId])

  const fetchChapters = async () => {
    setLoading(true)
    try {
      const res = await getPersonChapters(personId)
      setChapters(res.data || [])
    } catch (err) {
      console.error('获取章节失败:', err)
    } finally {
      setLoading(false)
    }
  }

  const fetchChapterStories = async (chapterId) => {
    try {
      const res = await getChapterStories(personId, chapterId)
      setChapterStories(prev => ({ ...prev, [chapterId]: res.data || [] }))
    } catch (err) {
      console.error('获取故事失败:', err)
    }
  }

  const handleStart = (chapter) => {
    setSelectedChapter(chapter)
    setShowModal(true)
  }

  const handleContinue = (chapter) => {
    navigate(`/interview?personId=${personId}&chapterId=${chapter.chapter_id}`)
  }

  const handleView = (chapter) => {
    if (expandedChapter === chapter.chapter_id) {
      setExpandedChapter(null)
    } else {
      setExpandedChapter(chapter.chapter_id)
      fetchChapterStories(chapter.chapter_id)
    }
  }

  const handleAIInterview = async () => {
    if (!selectedChapter) return
    setShowModal(false)
    try {
      const res = await startInterview(personId, { chapter_id: selectedChapter.chapter_id })
      navigate(`/interview?sessionId=${res.data.session_id}`)
    } catch (err) {
      console.error('开始采访失败:', err)
    }
  }

  const handleFreeRecord = () => {
    if (!selectedChapter) return
    setShowModal(false)
    navigate(`/record?personId=${personId}&chapterId=${selectedChapter.chapter_id}`)
  }

  const completedCount = chapters.filter(c => c.status === 'completed').length
  const progress = (completedCount / 11) * 100

  if (loading) {
    return <div className="p-6 text-center text-gray-400">加载中...</div>
  }

  return (
    <div className="p-6">
      {/* 顶部进度 */}
      <div className="mb-6">
        <div className="flex justify-between text-sm text-gray-500 mb-2">
          <span>自传进度</span>
          <span>已完成 {completedCount}/11 章</span>
        </div>
        <div className="h-2 bg-gray-100 rounded-full">
          <div
            className="h-full bg-[#D4A574] rounded-full transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* 章节列表 */}
      <div className="space-y-3">
        {chapters.map((chapter) => (
          <div key={chapter.chapter_id} className="bg-white rounded-xl p-4 shadow-sm">
            <div className="flex items-center gap-4">
              {/* 序号 */}
              <span className="text-3xl font-serif text-[#D4A574] w-10">
                {chapter.order_index}
              </span>

              {/* 标题和状态 */}
              <div className="flex-1">
                <h3 className="font-bold text-[#5C3D2E]">{chapter.title}</h3>
                <div className="flex items-center gap-2 mt-1">
                  {chapter.status === 'not_started' && (
                    <span className="text-xs text-gray-400">未开始</span>
                  )}
                  {chapter.status === 'in_progress' && (
                    <span className="flex items-center gap-1 text-xs text-orange-500">
                      <span className="w-2 h-2 bg-orange-500 rounded-full" />
                      进行中
                    </span>
                  )}
                  {chapter.status === 'completed' && (
                    <span className="text-xs text-green-600">已完成 · {chapter.stories_count || 0}个故事</span>
                  )}
                </div>
              </div>

              {/* 操作按钮 */}
              {chapter.status === 'not_started' && (
                <button
                  onClick={() => handleStart(chapter)}
                  className="px-4 py-2 text-sm border border-[#5C3D2E] text-[#5C3D2E] rounded-lg hover:bg-[#F5F1E9]"
                >
                  开始
                </button>
              )}
              {chapter.status === 'in_progress' && (
                <button
                  onClick={() => handleContinue(chapter)}
                  className="px-4 py-2 text-sm bg-[#5C3D2E] text-white rounded-lg hover:bg-[#4A3125]"
                >
                  继续
                </button>
              )}
              {chapter.status === 'completed' && (
                <button
                  onClick={() => handleView(chapter)}
                  className="px-4 py-2 text-sm border border-[#5C3D2E] text-[#5C3D2E] rounded-lg hover:bg-[#F5F1E9]"
                >
                  {expandedChapter === chapter.chapter_id ? '收起' : '查看'}
                </button>
              )}
            </div>

            {/* 展开的故事列表 */}
            {expandedChapter === chapter.chapter_id && chapterStories[chapter.chapter_id] && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                {chapterStories[chapter.chapter_id].length > 0 ? (
                  <div className="space-y-3">
                    {chapterStories[chapter.chapter_id].map((story) => (
                      <div
                        key={story.id}
                        onClick={() => navigate(`/story/${story.id}`)}
                        className="p-3 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100"
                      >
                        <p className="text-sm text-gray-700 line-clamp-2">
                          {story.transcript || '暂无内容'}
                        </p>
                        <p className="text-xs text-gray-400 mt-1">
                          {story.created_at ? new Date(story.created_at).toLocaleDateString('zh-CN') : ''}
                        </p>
                      </div>
                    ))}
                    <button
                      onClick={() => handleContinue(chapter)}
                      className="w-full py-2 text-sm text-[#5C3D2E] border border-[#5C3D2E] rounded-lg hover:bg-[#F5F1E9]"
                    >
                      继续为这章补充故事
                    </button>
                  </div>
                ) : (
                  <p className="text-sm text-gray-400">暂无故事</p>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* 录入方式 Modal */}
      {showModal && selectedChapter && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6">
            <h3 className="text-xl font-serif text-[#5C3D2E] mb-6 text-center">
              {selectedChapter.title}
            </h3>

            <div className="space-y-3">
              <button
                onClick={handleAIInterview}
                className="w-full h-14 text-lg bg-[#5C3D2E] text-white rounded-xl hover:bg-[#4A3125]"
              >
                AI采访
              </button>
              <button
                onClick={handleFreeRecord}
                className="w-full h-12 text-lg border-2 border-[#5C3D2E] text-[#5C3D2E] rounded-xl hover:bg-[#F5F1E9]"
              >
                自由录音
              </button>
            </div>

            <button
              onClick={() => setShowModal(false)}
              className="w-full h-10 mt-4 text-gray-400 hover:text-gray-600"
            >
              取消
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default ChapterList