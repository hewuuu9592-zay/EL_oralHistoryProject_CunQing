import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { getFamilyMembers, getFamilyMemberStories, createPerson, updatePerson, deletePerson, deletePersonForce } from '../api'

// 确认弹窗
const ConfirmModal = ({ title, message, onConfirm, onCancel }) => {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-80">
        <h3 className="text-lg font-bold text-[#4A3728] mb-2">{title}</h3>
        <p className="text-sm text-gray-600 mb-4">{message}</p>
        <div className="flex gap-3">
          <button
            onClick={onConfirm}
            className="flex-1 py-2 bg-red-500 text-white rounded hover:bg-red-600"
          >
            删除
          </button>
          <button
            onClick={onCancel}
            className="flex-1 py-2 border border-gray-300 rounded hover:bg-gray-100"
          >
            取消
          </button>
        </div>
      </div>
    </div>
  )
}

// 添加/编辑家人弹窗
const AddMemberModal = ({ person, onSave, onCancel }) => {
  const [form, setForm] = useState({
    name: person?.name || '',
    relation_to_owner: person?.relation_to_owner || '',
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
    if (!form.relation_to_owner.trim()) {
      setError('请输入与我的关系')
      return
    }

    setLoading(true)
    setError('')

    try {
      await onSave({
        name: form.name.trim(),
        relation_to_owner: form.relation_to_owner.trim(),
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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl p-6 w-[400px] max-h-[90vh] overflow-y-auto">
        <h3 className="text-xl font-serif text-[#5C3D2E] mb-6">
          {person ? '编辑家人' : '添加家人'}
        </h3>

        <div className="space-y-4">
          <div>
            <label className="block text-sm text-gray-600 mb-1">姓名 <span className="text-red-500">*</span></label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full px-4 py-2 border border-[#E5DED3] rounded-lg focus:outline-none focus:border-[#5C3D2E]"
              placeholder="请输入姓名"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-600 mb-1">与我的关系 <span className="text-red-500">*</span></label>
            <input
              type="text"
              value={form.relation_to_owner}
              onChange={(e) => setForm({ ...form, relation_to_owner: e.target.value })}
              className="w-full px-4 py-2 border border-[#E5DED3] rounded-lg focus:outline-none focus:border-[#5C3D2E]"
              placeholder="如：大哥、母亲、老伴"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-600 mb-1">出生年份</label>
            <input
              type="number"
              value={form.birth_year}
              onChange={(e) => setForm({ ...form, birth_year: e.target.value })}
              className="w-full px-4 py-2 border border-[#E5DED3] rounded-lg focus:outline-none focus:border-[#5C3D2E]"
              placeholder="如：1960"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-600 mb-1">简介</label>
            <textarea
              value={form.bio}
              onChange={(e) => setForm({ ...form, bio: e.target.value })}
              className="w-full px-4 py-2 border border-[#E5DED3] rounded-lg focus:outline-none focus:border-[#5C3D2E] resize-none"
              rows={3}
              placeholder="几句话介绍这个人"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-600 mb-1">头像链接</label>
            <input
              type="text"
              value={form.avatar_url}
              onChange={(e) => setForm({ ...form, avatar_url: e.target.value })}
              className="w-full px-4 py-2 border border-[#E5DED3] rounded-lg focus:outline-none focus:border-[#5C3D2E]"
              placeholder="图片网址"
            />
          </div>

          {error && <p className="text-red-500 text-sm">{error}</p>}
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={onCancel}
            className="flex-1 py-2 border border-[#5C3D2E] text-[#5C3D2E] rounded-lg hover:bg-[#F5F1E9]"
          >
            取消
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="flex-1 py-2 bg-[#5C3D2E] text-white rounded-lg hover:bg-[#4A3125] disabled:opacity-50"
          >
            {loading ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </div>
  )
}

// 家人卡片
const MemberCard = ({ person, onClick }) => {
  const [storiesCount, setStoriesCount] = useState(0)

  useEffect(() => {
    getFamilyMemberStories(person.id).then(res => {
      setStoriesCount(res.data?.length || 0)
    })
  }, [person.id])

  const getInitial = () => person.name.charAt(0)

  return (
    <div
      onClick={() => onClick(person)}
      className="bg-white rounded-xl p-4 shadow-sm hover:shadow-md cursor-pointer transition-shadow"
    >
      {/* 头像 */}
      <div className="flex items-center gap-3 mb-3">
        {person.avatar_url ? (
          <img
            src={person.avatar_url}
            alt={person.name}
            className="w-12 h-12 rounded-full object-cover"
          />
        ) : (
          <div className="w-12 h-12 rounded-full bg-[#D4A574] flex items-center justify-center text-white text-lg font-medium">
            {getInitial()}
          </div>
        )}
        <div>
          <h4 className="font-medium text-[#5C3D2E]">{person.name}</h4>
          {person.relation_to_owner && (
            <span className="text-xs px-2 py-0.5 bg-[#F5F1E9] text-[#8B7355] rounded-full">
              {person.relation_to_owner}
            </span>
          )}
        </div>
      </div>

      {/* 简介 */}
      {person.bio && (
        <p className="text-sm text-gray-500 line-clamp-2 mb-3">{person.bio}</p>
      )}

      {/* 故事数量 */}
      <p className="text-xs text-gray-400">{storiesCount}个相关故事</p>
    </div>
  )
}

// 右侧详情面板
const MemberDetail = ({ person, onEdit, onDelete, onClose }) => {
  const navigate = useNavigate()
  const [stories, setStories] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getFamilyMemberStories(person.id).then(res => {
      setStories(res.data || [])
      setLoading(false)
    })
  }, [person.id])

  const getInitial = () => person.name.charAt(0)

  return (
    <div className="fixed inset-y-0 right-0 w-[400px] bg-white shadow-xl z-30 flex flex-col">
      {/* 头部 */}
      <div className="p-6 border-b border-[#E5DED3]">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            {person.avatar_url ? (
              <img
                src={person.avatar_url}
                alt={person.name}
                className="w-16 h-16 rounded-full object-cover"
              />
            ) : (
              <div className="w-16 h-16 rounded-full bg-[#D4A574] flex items-center justify-center text-white text-2xl font-medium">
                {getInitial()}
              </div>
            )}
            <div>
              <h3 className="text-xl font-serif text-[#5C3D2E]">{person.name}</h3>
              {person.relation_to_owner && (
                <span className="text-sm px-2 py-0.5 bg-[#F5F1E9] text-[#8B7355] rounded-full">
                  {person.relation_to_owner}
                </span>
              )}
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            ✕
          </button>
        </div>
        {person.bio && (
          <p className="mt-4 text-gray-600">{person.bio}</p>
        )}
        {person.birth_year && (
          <p className="mt-2 text-sm text-gray-400">出生于 {person.birth_year} 年</p>
        )}
      </div>

      {/* 操作按钮 */}
      <div className="px-6 py-4 border-b border-[#E5DED3] flex gap-3">
        <button
          onClick={onEdit}
          className="flex-1 py-2 border border-[#5C3D2E] text-[#5C3D2E] rounded-lg hover:bg-[#F5F1E9]"
        >
          编辑
        </button>
        <button
          onClick={onDelete}
          className="flex-1 py-2 border border-red-500 text-red-500 rounded-lg hover:bg-red-50"
        >
          删除
        </button>
      </div>

      {/* 相关故事列表 */}
      <div className="flex-1 overflow-y-auto p-6">
        <h4 className="font-medium text-[#5C3D2E] mb-4">相关故事</h4>
        {loading ? (
          <p className="text-center text-gray-400">加载中...</p>
        ) : stories.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-gray-400 mb-4">还没有提到{person.name}的故事</p>
            <button
              onClick={() => navigate(`/?personId=${person.id}`)}
              className="text-[#5C3D2E] hover:underline"
            >
              去录入一个吧
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {stories.map(story => (
              <div
                key={story.id}
                onClick={() => navigate(`/story/${story.id}`)}
                className="p-3 bg-[#FAF7F2] rounded-lg cursor-pointer hover:bg-[#F5F1E9]"
              >
                <div className="flex items-center gap-2 mb-1">
                  {story.chapter_id && (
                    <span className="text-xs px-2 py-0.5 bg-[#D4A574] text-white rounded">
                      第{story.chapter_id}章
                    </span>
                  )}
                  {story.year && (
                    <span className="text-xs text-gray-400">{story.year}年</span>
                  )}
                </div>
                <p className="text-sm text-[#5C3D2E] line-clamp-2">
                  {story.summary || '无��要'}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

const FamilyMembers = ({ onSelectPerson }) => {
  const [familyMembers, setFamilyMembers] = useState({})
  const [loading, setLoading] = useState(true)
  const [showAddModal, setShowAddModal] = useState(false)
  const [editingPerson, setEditingPerson] = useState(null)
  const [selectedPerson, setSelectedPerson] = useState(null)
  const [deleteConfirm, setDeleteConfirm] = useState(null)

  const fetchFamilyMembers = async () => {
    setLoading(true)
    try {
      const res = await getFamilyMembers()
      setFamilyMembers(res.data || {})
    } catch (error) {
      console.error('Failed to load family members:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchFamilyMembers()
  }, [])

  // 处理保存（添加或编辑）
  const handleSave = async (data) => {
    if (editingPerson) {
      await updatePerson(editingPerson.id, data)
    } else {
      await createPerson(data)
    }
    setShowAddModal(false)
    setEditingPerson(null)
    fetchFamilyMembers()
  }

  // 处理编辑
  const handleEdit = (person) => {
    setEditingPerson(person)
    setShowAddModal(true)
  }

  // 处理删除
  const handleDelete = async () => {
    if (!deleteConfirm) return
    try {
      await deletePersonForce(deleteConfirm.id)
      setDeleteConfirm(null)
      setSelectedPerson(null)
      fetchFamilyMembers()
    } catch (err) {
      console.error('Delete failed:', err)
    }
  }

  // 选择家人卡片
  const handleSelect = (person) => {
    setSelectedPerson(person)
    if (onSelectPerson) {
      onSelectPerson(person)
    }
  }

  // 分组映射
  const groupLabels = {
    '父母': '父母',
    '兄弟姐妹': '兄弟姐妹',
    '伴侣': '伴侣',
    '子女': '子女',
    '其他': '其他',
  }

  const groupOrder = ['父母', '兄弟姐妹', '伴侣', '子女', '其他']

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-gray-400">加载中...</p>
      </div>
    )
  }

  return (
    <div className="h-full flex">
      {/* 主内容区 */}
      <div className="flex-1 overflow-y-auto p-6">
        {/* 顶部标题和按钮 */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-serif text-[#5C3D2E]">我的家人</h2>
          <button
            onClick={() => {
              setEditingPerson(null)
              setShowAddModal(true)
            }}
            className="px-4 py-2 bg-[#5C3D2E] text-white rounded-lg hover:bg-[#4A3125]"
          >
            + 添加家人
          </button>
        </div>

        {/* 分组列表 */}
        {groupOrder.map(group => {
          const members = familyMembers[group] || []
          if (members.length === 0) return null

          return (
            <div key={group} className="mb-8">
              <h3 className="text-lg font-medium text-[#5C3D2E] mb-4">{groupLabels[group]}</h3>
              <div className="grid grid-cols-3 gap-4">
                {members.map(person => (
                  <MemberCard
                    key={person.id}
                    person={person}
                    onClick={handleSelect}
                  />
                ))}
              </div>
            </div>
          )
        })}

        {/* 空状态 */}
        {Object.keys(familyMembers).every(g => (familyMembers[g] || []).length === 0) && (
          <div className="text-center py-16">
            <div className="text-4xl mb-4">👨‍👩‍👧‍👦</div>
            <p className="text-[#8B7355] mb-2">还没有家人</p>
            <p className="text-sm text-gray-500 mb-4">点击右上角添加家人</p>
            <button
              onClick={() => setShowAddModal(true)}
              className="px-4 py-2 bg-[#5C3D2E] text-white rounded-lg hover:bg-[#4A3125]"
            >
              + 添加家人
            </button>
          </div>
        )}
      </div>

      {/* 右侧详情面板 */}
      {selectedPerson && (
        <MemberDetail
          person={selectedPerson}
          onEdit={() => handleEdit(selectedPerson)}
          onDelete={() => setDeleteConfirm(selectedPerson)}
          onClose={() => setSelectedPerson(null)}
        />
      )}

      {/* 添加/编辑弹窗 */}
      {showAddModal && (
        <AddMemberModal
          person={editingPerson}
          onSave={handleSave}
          onCancel={() => {
            setShowAddModal(false)
            setEditingPerson(null)
          }}
        />
      )}

      {/* 删除确认弹窗 */}
      {deleteConfirm && (
        <ConfirmModal
          title="删除家人"
          message={`确定要删除「${deleteConfirm.name}」吗？此操作不可恢复。`}
          onConfirm={handleDelete}
          onCancel={() => setDeleteConfirm(null)}
        />
      )}
    </div>
  )
}

export default FamilyMembers