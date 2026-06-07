import React, { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  getMigrationsByChapter,
  getChapters,
  createMigration,
  updateMigration,
  deleteMigration,
  batchExtractMigrations,
  getPerson,
} from '../api'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'

// 章节颜色
const CHAPTER_COLORS = [
  '#D4A574', '#8B7355', '#5C3D2E', '#A67C52', '#C4A484',
  '#9B8B7A', '#6B5B4E', '#B8956E', '#7D6B5A', '#8C7A6A', '#6E5D4E'
]

// 自定义圆形 marker
const createIcon = (year, color, isActive = true) => L.divIcon({
  className: '',
  html: `<div style="
    width:32px;height:32px;background:${isActive ? color : '#CCC'};
    border-radius:50%;display:flex;align-items:center;
    justify-content:center;color:white;font-weight:bold;
    font-size:11px;border:2px solid ${isActive ? '#5C3D2E' : '#999'};
    box-shadow:0 2px 6px rgba(0,0,0,0.3);opacity:${isActive ? 1 : 0.5};
  ">${year ? String(year).slice(-2) : '?'}</div>`,
  iconSize: [32, 32],
  iconAnchor: [16, 16],
})

// 自动适配所有点的组件
const FitBounds = ({ migrations }) => {
  const map = useMap()
  const validMigrations = migrations.filter(m => m.latitude && m.longitude)

  useEffect(() => {
    setTimeout(() => map.invalidateSize(), 100)
    if (validMigrations.length > 0) {
      const bounds = validMigrations.map(m => [m.latitude, m.longitude])
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 5 })
    }
  }, [migrations])

  return null
}

// 确认弹窗
const ConfirmModal = ({ title, message, onConfirm, onCancel }) => (
  <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
    <div className="bg-white rounded-lg p-6 w-80">
      <h3 className="text-lg font-bold text-[#4A3728] mb-2">{title}</h3>
      <p className="text-sm text-gray-600 mb-4">{message}</p>
      <div className="flex gap-3">
        <button onClick={onConfirm} className="flex-1 py-2 bg-red-500 text-white rounded hover:bg-red-600">删除</button>
        <button onClick={onCancel} className="flex-1 py-2 border border-gray-300 rounded hover:bg-gray-100">取消</button>
      </div>
    </div>
  </div>
)

// 添加/编辑迁徙记录弹窗
const AddMigrationModal = ({ personId, migration, chapters, onSave, onCancel }) => {
  const [form, setForm] = useState({
    place_name: migration?.place_name || '',
    year: migration?.year || '',
    description: migration?.description || '',
    chapter_id: migration?.chapter_id || '',
    latitude: migration?.latitude || '',
    longitude: migration?.longitude || '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async () => {
    if (!form.place_name.trim()) {
      setError('请输入地点名称')
      return
    }
    setLoading(true)
    setError('')
    try {
      await onSave({
        place_name: form.place_name.trim(),
        year: form.year ? parseInt(form.year) : null,
        description: form.description.trim() || null,
        chapter_id: form.chapter_id || null,
        latitude: form.latitude ? parseFloat(form.latitude) : null,
        longitude: form.longitude ? parseFloat(form.longitude) : null,
      })
    } catch (err) {
      setError(err.response?.data?.detail || '保存失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl p-6 w-[400px] max-h-[90vh] overflow-y-auto">
        <h3 className="text-xl font-serif text-[#5C3D2E] mb-6">
          {migration ? '编辑地点' : '添加地点'}
        </h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-gray-600 mb-1">地点名称 <span className="text-red-500">*</span></label>
            <input
              type="text"
              value={form.place_name}
              onChange={(e) => setForm({ ...form, place_name: e.target.value })}
              className="w-full px-4 py-2 border border-[#E5DED3] rounded-lg focus:outline-none focus:border-[#5C3D2E]"
              placeholder="请输入地点名称"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">所属章节</label>
            <select
              value={form.chapter_id}
              onChange={(e) => setForm({ ...form, chapter_id: e.target.value })}
              className="w-full px-4 py-2 border border-[#E5DED3] rounded-lg focus:outline-none focus:border-[#5C3D2E]"
            >
              <option value="">不关联章节</option>
              {chapters.map(c => (
                <option key={c.id} value={c.id}>第{c.order_index}章 · {c.title}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">年份</label>
            <input
              type="number"
              value={form.year}
              onChange={(e) => setForm({ ...form, year: e.target.value })}
              className="w-full px-4 py-2 border border-[#E5DED3] rounded-lg focus:outline-none focus:border-[#5C3D2E]"
              placeholder="如：1985"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">备注</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full px-4 py-2 border border-[#E5DED3] rounded-lg focus:outline-none focus:border-[#5C3D2E] resize-none"
              rows={2}
              placeholder="几句话说这个地方"
            />
          </div>
          {error && <p className="text-red-500 text-sm">{error}</p>}
        </div>
        <div className="flex gap-3 mt-6">
          <button onClick={onCancel} className="flex-1 py-2 border border-[#5C3D2E] text-[#5C3D2E] rounded-lg hover:bg-[#F5F1E9]">取消</button>
          <button onClick={handleSubmit} disabled={loading} className="flex-1 py-2 bg-[#5C3D2E] text-white rounded-lg hover:bg-[#4A3125] disabled:opacity-50">
            {loading ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </div>
  )
}

// 地图组件
const MapView = ({ migrations, selectedChapter, chapters }) => {
  const validMigrations = migrations.filter(m => m.latitude && m.longitude)
  const chapterMap = useMemo(() => {
    const map = {}
    chapters.forEach(c => { map[c.id] = c })
    return map
  }, [chapters])

  const getColor = (chapterId) => {
    if (!chapterId) return '#999'
    const chapter = chapterMap[chapterId]
    return chapter ? CHAPTER_COLORS[(chapter.order_index - 1) % CHAPTER_COLORS.length] : '#999'
  }

  const filteredMigrations = selectedChapter
    ? migrations.filter(m => m.chapter_id === selectedChapter)
    : migrations

  const filteredValid = filteredMigrations.filter(m => m.latitude && m.longitude)
  const center = filteredValid.length > 0
    ? [filteredValid[0].latitude, filteredValid[0].longitude]
    : [35.8617, 104.1954]

  return (
    <MapContainer center={center} zoom={4} style={{ height: '100%', width: '100%' }}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FitBounds migrations={filteredMigrations} />
      {filteredMigrations.map(m => (
        <Marker
          key={m.id}
          position={[m.latitude, m.longitude]}
          icon={createIcon(m.year, getColor(m.chapter_id), !selectedChapter || m.chapter_id === selectedChapter)}
        >
          <Popup>
            <div className="text-sm">
              <div className="font-medium text-[#5C3D2E]">{m.place_name}</div>
              <div className="text-gray-500">{m.year}年</div>
              {m.chapter_id && chapterMap[m.chapter_id] && (
                <div className="mt-1 text-xs px-2 py-0.5 bg-[#D4A574] text-white rounded inline-block">
                  第{chapterMap[m.chapter_id].order_index}章 · {chapterMap[m.chapter_id].title}
                </div>
              )}
              {m.description && <div className="mt-1 text-gray-400 text-xs">{m.description}</div>}
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  )
}

const MyFootprint = ({ personId }) => {
  const [groupedMigrations, setGroupedMigrations] = useState([])
  const [chapters, setChapters] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedChapter, setSelectedChapter] = useState(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [editingMigration, setEditingMigration] = useState(null)
  const [deleteConfirm, setDeleteConfirm] = useState(null)
  const [listExpanded, setListExpanded] = useState(false)

  const fetchData = async () => {
    setLoading(true)
    try {
      const [groupRes, chaptersRes] = await Promise.all([
        getMigrationsByChapter(personId),
        getChapters(),
      ])
      setGroupedMigrations(groupRes.data || [])
      setChapters(chaptersRes.data || [])
    } catch (error) {
      console.error('Failed to load data:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (personId) fetchData()
  }, [personId])

  // 统计
  const stats = useMemo(() => {
    const allMigrations = groupedMigrations.flatMap(g => g.migrations || [])
    const years = allMigrations.map(m => m.year).filter(y => y)
    const minYear = years.length > 0 ? Math.min(...years) : null
    const maxYear = years.length > 0 ? Math.max(...years) : null
    return {
      count: allMigrations.length,
      yearRange: minYear && maxYear ? `${minYear} - ${maxYear}` : minYear ? `${minYear}年至今` : '-',
    }
  }, [groupedMigrations])

  const handleSave = async (data) => {
    if (editingMigration) {
      await updateMigration(personId, editingMigration.id, data)
    } else {
      await createMigration(personId, data)
    }
    setShowAddModal(false)
    setEditingMigration(null)
    fetchData()
  }

  const handleDelete = async () => {
    if (!deleteConfirm) return
    await deleteMigration(personId, deleteConfirm.id)
    setDeleteConfirm(null)
    fetchData()
  }

  const handleExtract = async () => {
    try {
      await batchExtractMigrations(personId)
      fetchData()
    } catch (err) {
      console.error('提取失败:', err)
    }
  }

  const chapterMap = useMemo(() => {
    const map = {}
    chapters.forEach(c => { map[c.id] = c })
    return map
  }, [chapters])

  // 筛选后的迁徙记录
  const filteredGrouped = selectedChapter
    ? groupedMigrations.filter(g => g.chapter_id === selectedChapter)
    : groupedMigrations

  const allMigrations = filteredGrouped.flatMap(g => g.migrations || [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-gray-400">加载中...</p>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      {/* 地图区域 */}
      <div className="h-[60%] relative">
        {/* 章节筛选条 */}
        <div className="absolute top-2 left-2 right-2 z-[1000] flex gap-2 overflow-x-auto pb-2">
          <button
            onClick={() => setSelectedChapter(null)}
            className={`px-3 py-1.5 rounded-full text-sm whitespace-nowrap transition-colors ${
              selectedChapter === null
                ? 'bg-[#5C3D2E] text-white'
                : 'bg-white text-[#5C3D2E] border border-[#E5DED3] hover:bg-[#F5F1E9]'
            }`}
          >
            全部
          </button>
          {chapters.map(c => (
            <button
              key={c.id}
              onClick={() => setSelectedChapter(c.id)}
              className={`px-3 py-1.5 rounded-full text-sm whitespace-nowrap transition-colors ${
                selectedChapter === c.id
                  ? 'bg-[#5C3D2E] text-white'
                  : 'bg-white text-[#5C3D2E] border border-[#E5DED3] hover:bg-[#F5F1E9]'
              }`}
              style={selectedChapter === c.id ? {} : { borderColor: CHAPTER_COLORS[(c.order_index - 1) % CHAPTER_COLORS.length] }}
            >
              {c.order_index}
            </button>
          ))}
        </div>

        {/* 地图 */}
        <MapView migrations={allMigrations} selectedChapter={selectedChapter} chapters={chapters} />

        {/* 图例 */}
        <div className="absolute bottom-4 right-4 z-[1000] bg-white/90 rounded-lg p-2 text-xs">
          <div className="font-medium text-[#5C3D2E] mb-1">图例</div>
          <div className="flex flex-wrap gap-1 max-w-[150px]">
            {chapters.slice(0, 6).map(c => (
              <div key={c.id} className="flex items-center gap-1">
                <div className="w-3 h-3 rounded-full" style={{ background: CHAPTER_COLORS[(c.order_index - 1) % CHAPTER_COLORS.length] }} />
                <span>{c.order_index}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 下方列表区域 */}
      <div className={`flex-1 bg-[#FAF7F2] overflow-hidden flex flex-col transition-all ${listExpanded ? 'flex-1' : 'h-[40%]'}`}>
        {/* 顶部统计和操作 */}
        <div className="p-4 border-b border-[#E5DED3] flex items-center justify-between">
          <div>
            <span className="text-[#5C3D2E] font-medium">走过 {stats.count} 个地方</span>
            <span className="text-gray-400 mx-2">·</span>
            <span className="text-gray-400">跨越 {stats.yearRange}</span>
          </div>
          <button
            onClick={() => setListExpanded(!listExpanded)}
            className="text-[#5C3D2E] text-sm"
          >
            {listExpanded ? '收起' : '展开'}
          </button>
        </div>

        {/* 列表 */}
        <div className="flex-1 overflow-y-auto p-4">
          {filteredGrouped.map(group => (
            <div key={group.chapter_id || 'other'} className="mb-6">
              <h3 className="text-sm font-medium text-[#5C3D2E] mb-2">
                {group.chapter_title || '其他记录'}
              </h3>
              <div className="space-y-2">
                {(group.migrations || []).map(m => (
                  <div key={m.id} className="bg-white rounded-lg p-3 flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-[#5C3D2E]">{m.place_name}</span>
                        <span className="text-xs text-gray-400">{m.year}年</span>
                      </div>
                      {m.description && (
                        <p className="text-sm text-gray-400 truncate">{m.description}</p>
                      )}
                    </div>
                    <div className="flex gap-2 ml-2">
                      <button
                        onClick={() => { setEditingMigration(m); setShowAddModal(true) }}
                        className="text-gray-400 hover:text-[#5C3D2E]"
                      >
                        编辑
                      </button>
                      <button
                        onClick={() => setDeleteConfirm(m)}
                        className="text-gray-400 hover:text-red-500"
                      >
                        删除
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {allMigrations.length === 0 && (
            <div className="text-center py-8">
              <p className="text-gray-400 mb-4">还没有记录足迹</p>
              <button
                onClick={() => setShowAddModal(true)}
                className="px-4 py-2 bg-[#5C3D2E] text-white rounded-lg hover:bg-[#4A3125]"
              >
                + 添加地点
              </button>
            </div>
          )}
        </div>

        {/* 底部按钮 */}
        <div className="p-4 border-t border-[#E5DED3] flex gap-3">
          <button
            onClick={() => { setEditingMigration(null); setShowAddModal(true) }}
            className="flex-1 py-2 border border-[#5C3D2E] text-[#5C3D2E] rounded-lg hover:bg-[#F5F1E9]"
          >
            + 手动添加地点
          </button>
          <button
            onClick={handleExtract}
            className="flex-1 py-2 bg-[#5C3D2E] text-white rounded-lg hover:bg-[#4A3125]"
          >
            从故事提取
          </button>
        </div>
      </div>

      {/* 添加/编辑弹窗 */}
      {showAddModal && (
        <AddMigrationModal
          personId={personId}
          migration={editingMigration}
          chapters={chapters}
          onSave={handleSave}
          onCancel={() => { setShowAddModal(false); setEditingMigration(null) }}
        />
      )}

      {/* 删除确认 */}
      {deleteConfirm && (
        <ConfirmModal
          title="删除地点"
          message={`确定要删除「${deleteConfirm.place_name}」吗？`}
          onConfirm={handleDelete}
          onCancel={() => setDeleteConfirm(null)}
        />
      )}
    </div>
  )
}

export default MyFootprint