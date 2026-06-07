import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { createPerson, initChapters } from '../api'

const Welcome = () => {
  const navigate = useNavigate()
  const [form, setForm] = useState({
    name: '',
    birth_year: '',
    gender: '',
    bio: '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async () => {
    if (!form.name.trim()) {
      setError('请输入姓名')
      return
    }
    if (!form.birth_year || isNaN(form.birth_year)) {
      setError('请输入出生年份')
      return
    }
    if (!form.gender) {
      setError('请选择性别')
      return
    }

    setLoading(true)
    setError('')

    try {
      // 创建人物
      const res = await createPerson({
        name: form.name.trim(),
        birth_year: parseInt(form.birth_year),
        gender: form.gender,
        bio: form.bio.trim() || null,
      })
      const personId = res.data.id

      // 存储当前人物ID
      localStorage.setItem('current_person_id', personId)

      // 初始化章节
      await initChapters()

      navigate('/')
    } catch (err) {
      console.error('创建失败:', err)
      setError(err.response?.data?.detail || '创建失败，请重试')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#FAF7F2] flex flex-col items-center justify-center p-6">
      {/* 顶部标题 */}
      <div className="text-center mb-12">
        <h1 className="text-4xl font-serif text-[#5C3D2E] mb-3">根脉</h1>
        <p className="text-lg text-gray-500">记录你的故事，留给最爱的人</p>
      </div>

      {/* 表单 */}
      <div className="w-full max-w-sm space-y-6">
        {/* 姓名 */}
        <div>
          <label className="block text-lg text-[#5C3D2E] mb-2">您的姓名</label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="w-full h-14 px-4 text-xl border-2 border-[#E5DED3] rounded-xl focus:outline-none focus:border-[#5C3D2E] bg-white"
            placeholder="请输入您的姓名"
          />
        </div>

        {/* 出生年份 */}
        <div>
          <label className="block text-lg text-[#5C3D2E] mb-2">出生年份</label>
          <input
            type="number"
            value={form.birth_year}
            onChange={(e) => setForm({ ...form, birth_year: e.target.value })}
            className="w-full h-14 px-4 text-xl border-2 border-[#E5DED3] rounded-xl focus:outline-none focus:border-[#5C3D2E] bg-white"
            placeholder="比如：1945"
          />
        </div>

        {/* 性别 */}
        <div>
          <label className="block text-lg text-[#5C3D2E] mb-2">您的性别</label>
          <div className="flex gap-4">
            <button
              onClick={() => setForm({ ...form, gender: '男' })}
              className={`flex-1 h-14 text-xl rounded-xl border-2 transition-colors ${
                form.gender === '男'
                  ? 'bg-[#5C3D2E] text-white border-[#5C3D2E]'
                  : 'border-[#E5DED3] text-[#5C3D2E] hover:border-[#5C3D2E] bg-white'
              }`}
            >
              男
            </button>
            <button
              onClick={() => setForm({ ...form, gender: '女' })}
              className={`flex-1 h-14 text-xl rounded-xl border-2 transition-colors ${
                form.gender === '女'
                  ? 'bg-[#5C3D2E] text-white border-[#5C3D2E]'
                  : 'border-[#E5DED3] text-[#5C3D2E] hover:border-[#5C3D2E] bg-white'
              }`}
            >
              女
            </button>
          </div>
        </div>

        {/* 一句话介绍 */}
        <div>
          <label className="block text-lg text-[#5C3D2E] mb-2">一句话介绍（选填）</label>
          <input
            type="text"
            value={form.bio}
            onChange={(e) => setForm({ ...form, bio: e.target.value })}
            className="w-full h-14 px-4 text-xl border-2 border-[#E5DED3] rounded-xl focus:outline-none focus:border-[#5C3D2E] bg-white"
            placeholder="比如：我是一个普通的南京人"
          />
        </div>

        {/* 错误提示 */}
        {error && (
          <div className="text-center text-red-500 text-base">{error}</div>
        )}

        {/* 提交按钮 */}
        <button
          onClick={handleSubmit}
          disabled={loading}
          className="w-full h-14 text-xl bg-[#5C3D2E] text-white rounded-xl hover:bg-[#4A3125] disabled:opacity-50 transition-colors"
        >
          {loading ? '创建中...' : '开始记录我的故事'}
        </button>
      </div>
    </div>
  )
}

export default Welcome