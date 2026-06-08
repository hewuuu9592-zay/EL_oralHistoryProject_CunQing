import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { getPersonChapters, getChapterStories } from '../api'

const MyStories = ({ personId }) => {
  const navigate = useNavigate()
  const [chapters, setChapters] = useState([])
  const [loading, setLoading] = useState(true)
  const [expandedChapter, setExpandedChapter] = useState(null)
  const [chapterStories, setChapterStories] = useState({})
  const [loadingStories, setLoadingStories] = useState({})

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
    if (chapterStories[chapterId]) return // already loaded
    setLoadingStories(prev => ({ ...prev, [chapterId]: true }))
    try {
      const res = await getChapterStories(personId, chapterId)
      setChapterStories(prev => ({ ...prev, [chapterId]: res.data || [] }))
    } catch (err) {
      console.error('获取故事失败:', err)
    } finally {
      setLoadingStories(prev => ({ ...prev, [chapterId]: false }))
    }
  }

  const handleChapterClick = (chapter) => {
    if (expandedChapter === chapter.chapter_id) {
      setExpandedChapter(null)
    } else {
      setExpandedChapter(chapter.chapter_id)
      fetchChapterStories(chapter.chapter_id)
    }
  }

  const handleAddStory = (e, chapter) => {
    e.stopPropagation()
    navigate(`/interview?personId=${personId}&chapterId=${chapter.chapter_id}`)
  }

  const handleStoryClick = (story) => {
    navigate(`/story/${story.id}`)
  }

  // 统计
  const completedCount = chapters.filter(c => c.status === 'completed').length
  const totalStories = Object.values(chapterStories).flat().length

  if (loading) {
    return <div className="p-6 text-center text-gray-400">加载中...</div>
  }

  return (
    <div className="p-4">
      {/* 顶部标题和统计 */}
      <div className="mb-4">
        <h2 className="text-2xl font-serif text-[#5C3D2E]">我的故事</h2>
        <p className="text-sm text-gray-400 mt-1">
          已完成 {completedCount} 章 · 共 {totalStories} 个故事
        </p>
      </div>

      {/* 章节卡片列表 */}
      <div className="space-y-3">
        {chapters.map((chapter) => {
          const stories = chapterStories[chapter.chapter_id] || []
          const isExpanded = expandedChapter === chapter.chapter_id
          const isLoadingStories = loadingStories[chapter.chapter_id]

          return (
            <div
              key={chapter.chapter_id}
              className="bg-white rounded-xl shadow-sm overflow-hidden"
            >
              {/* 章节卡片标题行 */}
              <div
                onClick={() => handleChapterClick(chapter)}
                className="flex items-center gap-3 p-4 cursor-pointer hover:bg-gray-50"
              >
                {/* 左侧：章节序号 */}
                <span className="text-3xl font-serif text-[#D4A574] w-10">
                  {chapter.order_index}
                </span>

                {/* 中间：标题和状态 */}
                <div className="flex-1">
                  <h3 className="font-bold text-[#5C3D2E]">{chapter.title}</h3>
                  <div className="flex items-center gap-2 mt-1">
                    {chapter.status === 'completed' && (
                      <span className="text-xs text-green-600">
                        已完成 · {chapter.stories_count || stories.length}个故事
                      </span>
                    )}
                    {chapter.status === 'not_started' && (
                      <span className="text-xs text-gray-400">未开始</span>
                    )}
                    {chapter.status === 'in_progress' && (
                      <span className="text-xs text-orange-500">进行中</span>
                    )}
                  </div>
                </div>

                {/* 右侧：箭头 */}
                <span className={`text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
                  ▼
                </span>
              </div>

              {/* 展开的故事列表 */}
              {isExpanded && (
                <div className="px-4 pb-4 border-t border-gray-100">
                  {isLoadingStories ? (
                    <div className="py-4 text-center text-gray-400">加载中...</div>
                  ) : stories.length > 0 ? (
                    <div className="py-3 space-y-2">
                      {stories.map((story) => (
                        <div
                          key={story.id}
                          onClick={() => handleStoryClick(story)}
                          className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100"
                        >
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-gray-700 truncate">
                              {story.title || story.transcript?.slice(0, 30) || '暂无标题'}
                            </p>
                            <p className="text-xs text-gray-400 truncate mt-1">
                              {story.title ? story.transcript?.slice(0, 50) : ''}
                            </p>
                          </div>
                          <span className="text-gray-400">→</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="py-4 text-center text-gray-400">
                      这章还没有故事，去录入一个吧
                    </div>
                  )}

                  {/* 底部添加按钮 */}
                  <button
                    onClick={(e) => handleAddStory(e, chapter)}
                    className="w-full py-2 mt-2 text-sm text-[#5C3D2E] border border-[#5C3D2E] rounded-lg hover:bg-[#F5F1E9]"
                  >
                    + 为这章录入故事
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default MyStories