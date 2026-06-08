import React, { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  getPersonMigrations,
  createMigration,
  updateMigration,
  deleteMigration,
  batchExtractMigrations,
  addMigrationEvent,
  deleteMigrationEvent,
  getChapters,
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
  const validMigrations = migrations.filter(m =>
    m.latitude != null && m.longitude != null &&
    !isNaN(Number(m.latitude)) && !isNaN(Number(m.longitude))
  )

  useEffect(() => {
    setTimeout(() => map.invalidateSize(), 100)
    if (validMigrations.length > 0) {
      const bounds = validMigrations.map(m => [Number(m.latitude), Number(m.longitude)])
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 5 })
    }
  }, [migrations])

  return null
}

// 确认弹窗
const ConfirmModal = ({ title, message, onConfirm, onCancel }) => (
  <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[1100]">
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

// 编辑事件弹窗
const EditEventModal = ({ event, onSave, onCancel }) => {
  const [form, setForm] = useState({
    year: event?.year || '',
    description: event?.description || '',
  })
  const [loading, setLoading] = useState(false)

  const handleSubmit = async () => {
    setLoading(true)
    try {
      await onSave({
        year: form.year ? parseInt(form.year) : null,
        description: form.description.trim() || null,
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[1100]">
      <div className="bg-white rounded-xl p-6 w-[350px]">
        <h3 className="text-lg font-bold text-[#5C3D2E] mb-4">编辑事件</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-gray-600 mb-1">年份</label>
            <input
              type="number"
              value={form.year}
              onChange={(e) => setForm({ ...form, year: e.target.value })}
              className="w-full px-3 py-2 border border-[#E5DED3] rounded-lg"
              placeholder="���：1985"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">描述</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full px-3 py-2 border border-[#E5DED3] rounded-lg resize-none"
              rows={3}
              placeholder="事件描述"
            />
          </div>
        </div>
        <div className="flex gap-3 mt-6">
          <button onClick={onCancel} className="flex-1 py-2 border border-[#5C3D2E] text-[#5C3D2E] rounded-lg">取消</button>
          <button onClick={handleSubmit} disabled={loading} className="flex-1 py-2 bg-[#5C3D2E] text-white rounded-lg">
            {loading ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </div>
  )
}

// 添加/编辑迁徙记录弹窗
const AddMigrationModal = ({ migration, onSave, onCancel }) => {
  const [form, setForm] = useState({
    place_name: migration?.place_name || '',
    year: migration?.year || '',
    description: migration?.description || '',
    latitude: migration?.latitude || '',
    longitude: migration?.longitude || '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searchTimeout, setSearchTimeout] = useState(null)

  const searchPlace = async (keyword) => {
    if (!keyword || keyword.length < 2) {
      setSearchResults([])
      return
    }
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(keyword)}&format=json&limit=5&accept-language=zh`
      )
      const data = await response.json()
      setSearchResults(data)
    } catch (e) {
      console.error('搜索失败:', e)
    }
  }

  const handlePlaceChange = (value) => {
    setForm({ ...form, place_name: value })
    if (searchTimeout) clearTimeout(searchTimeout)
    if (value.length >= 2) {
      const timeout = setTimeout(() => searchPlace(value), 300)
      setSearchTimeout(timeout)
    } else {
      setSearchResults([])
    }
  }

  const selectPlace = (place) => {
    setForm({
      ...form,
      place_name: place.display_name,
      latitude: String(place.lat),
      longitude: place.lon,
    })
    setSearchResults([])
  }

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
        latitude: form.latitude ? parseFloat(form.latitude) : null,
        longitude: form.longitude ? parseFloat(form.longitude) : null,
      })
    } catch (err) {
      setError(err.response?.data?.detail || '保存失败')
    } finally {
      setLoading(false)
    }
  }

  const hasSelectedPlace = form.latitude && form.longitude

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[1100]">
      <div className="bg-white rounded-xl p-6 w-[400px] max-h-[90vh] overflow-y-auto">
        <h3 className="text-xl font-serif text-[#5C3D2E] mb-6">
          {migration ? '编辑地点' : '添加地点'}
        </h3>
        <div className="space-y-4">
          <div className="relative">
            <label className="block text-sm text-gray-600 mb-1">地点名称 <span className="text-red-500">*</span></label>
            <input
              type="text"
              value={form.place_name}
              onChange={(e) => handlePlaceChange(e.target.value)}
              className="w-full px-4 py-2 border border-[#E5DED3] rounded-lg focus:outline-none focus:border-[#5C3D2E]"
              placeholder="输入地名搜索或手动输入"
            />
            {searchResults.length > 0 && (
              <div className="absolute z-10 w-full mt-1 bg-white border border-[#E5DED3] rounded-lg shadow-lg max-h-48 overflow-y-auto">
                {searchResults.map((place, idx) => (
                  <div
                    key={idx}
                    onClick={() => selectPlace(place)}
                    className="px-3 py-2 cursor-pointer hover:bg-[#F5F1E9] text-sm border-b border-[#F5F1E9] last:border-b-0"
                  >
                    {place.display_name}
                  </div>
                ))}
              </div>
            )}
          </div>
          {hasSelectedPlace && (
            <div className="flex items-center justify-between bg-green-50 px-3 py-2 rounded-lg border border-green-200">
              <span className="text-sm text-green-700 truncate">
                {form.place_name} ({form.latitude}, {form.longitude})
              </span>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-gray-600 mb-1">纬度</label>
              <input
                type="text"
                value={form.latitude}
                onChange={(e) => setForm({ ...form, latitude: e.target.value })}
                className="w-full px-4 py-2 border border-[#E5DED3] rounded-lg"
                placeholder="如：39.9042"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">经度</label>
              <input
                type="text"
                value={form.longitude}
                onChange={(e) => setForm({ ...form, longitude: e.target.value })}
                className="w-full px-4 py-2 border border-[#E5DED3] rounded-lg"
                placeholder="如：116.4074"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">年份（第一个事件）</label>
            <input
              type="number"
              value={form.year}
              onChange={(e) => setForm({ ...form, year: e.target.value })}
              className="w-full px-4 py-2 border border-[#E5DED3] rounded-lg"
              placeholder="如：1985"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">描述（第一个事件）</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full px-4 py-2 border border-[#E5DED3] rounded-lg resize-none"
              rows={2}
              placeholder="这个地点的经历"
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
const MapView = ({ migrations }) => {
  const validMigrations = migrations.filter(m =>
    m.latitude != null && m.longitude != null &&
    !isNaN(Number(m.latitude)) && !isNaN(Number(m.longitude))
  )

  const center = validMigrations.length > 0
    ? [Number(validMigrations[0].latitude), Number(validMigrations[0].longitude)]
    : [35.8617, 104.1954]

  return (
    <MapContainer center={center} zoom={4} style={{ height: '100%', width: '100%' }}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FitBounds migrations={validMigrations} />
      {validMigrations.map(m => {
        const events = m.events || []
        return (
          <Marker
            key={m.id}
            position={[Number(m.latitude), Number(m.longitude)]}
            icon={createIcon(m.year, '#5C3D2E', true)}
          >
            <Popup>
              <div className="text-sm max-w-[250px]">
                <div className="font-medium text-[#5C3D2E] mb-2">{m.place_name}</div>
                {events.length > 0 && (
                  <div className="space-y-1">
                    {events.map((e, idx) => (
                      <div key={idx} className="text-xs border-l-2 border-[#D4A574] pl-2">
                        <span className="font-medium">{e.year || '?'}年</span>
                        <span className="text-gray-500 ml-1">{e.description}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Popup>
          </Marker>
        )
      })}
    </MapContainer>
  )
}

const MyFootprint = ({ personId }) => {
  const [migrations, setMigrations] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAddModal, setShowAddModal] = useState(false)
  const [editingMigration, setEditingMigration] = useState(null)
  const [deleteConfirm, setDeleteConfirm] = useState(null)
  const [expandedPlace, setExpandedPlace] = useState(null)
  const [editingEvent, setEditingEvent] = useState(null)
  const [editingEventIndex, setEditingEventIndex] = useState(null)

  const fetchData = async () => {
    setLoading(true)
    try {
      const res = await getPersonMigrations(personId)
      setMigrations(res.data || [])
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
    const years = migrations.map(m => m.year).filter(y => y)
    const minYear = years.length > 0 ? Math.min(...years) : null
    const maxYear = years.length > 0 ? Math.max(...years) : null
    const eventCount = migrations.reduce((sum, m) => sum + (m.events?.length || 0), 0)
    return {
      count: migrations.length,
      eventCount,
      yearRange: minYear && maxYear ? `${minYear} - ${maxYear}` : minYear ? `${minYear}年至今` : '-',
    }
  }, [migrations])

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

  const handleDeletePlace = async (m) => {
    await deleteMigration(personId, m.id)
    setDeleteConfirm(null)
    fetchData()
  }

  const handleAddEvent = async (m, eventData) => {
    await addMigrationEvent(personId, m.id, eventData)
    setEditingEvent(null)
    fetchData()
  }

  const handleDeleteEvent = async (m, eventIndex) => {
    await deleteMigrationEvent(personId, m.id, eventIndex)
    fetchData()
  }

  const handleEditEvent = async (m, eventIndex, eventData) => {
    // 需要整体更新 events 数组
    const events = [...(m.events || [])]
    events[eventIndex] = { ...events[eventIndex], ...eventData }
    await updateMigration(personId, m.id, { events })
    setEditingEvent(null)
    setEditingEventIndex(null)
    fetchData()
  }

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
      <div className="h-[50%] relative">
        <MapView migrations={migrations} />
      </div>

      {/* 下方列表区域 */}
      <div className="flex-1 bg-[#FAF7F2] overflow-hidden flex flex-col">
        {/* 顶部统计 */}
        <div className="p-4 border-b border-[#E5DED3]">
          <div>
            <span className="text-[#5C3D2E] font-medium">走过 {stats.count} 个地方</span>
            <span className="text-gray-400 mx-2">·</span>
            <span className="text-gray-400">{stats.eventCount} 个事件</span>
            <span className="text-gray-400 mx-2">·</span>
            <span className="text-gray-400">{stats.yearRange}</span>
          </div>
        </div>

        {/* 列表 */}
        <div className="flex-1 overflow-y-auto p-4">
          {migrations.map(m => {
            const events = m.events || []
            const isExpanded = expandedPlace === m.id

            return (
              <div key={m.id} className="mb-3 bg-white rounded-lg">
                {/* 地点头部 - 可点击展开 */}
                <div
                  className="p-3 flex items-center justify-between cursor-pointer"
                  onClick={() => setExpandedPlace(isExpanded ? null : m.id)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-[#5C3D2E]">{m.place_name}</span>
                      <span className="text-xs text-gray-400">{events.length}个事件</span>
                    </div>
                    {m.year && <span className="text-xs text-gray-400">{m.year}年</span>}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={(e) => { e.stopPropagation(); setEditingMigration(m); setShowAddModal(true) }}
                      className="text-gray-400 hover:text-[#5C3D2E] text-sm"
                    >
                      地点
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDeletePlace(m) }}
                      className="text-gray-400 hover:text-red-500 text-sm"
                    >
                      删除
                    </button>
                  </div>
                </div>

                {/* 展开显示事件列表 */}
                {isExpanded && events.length > 0 && (
                  <div className="px-3 pb-3 space-y-2 border-t border-[#F5F1E9]">
                    {events.map((e, idx) => (
                      <div key={idx} className="flex items-center justify-between py-2 border-b border-[#F5F1E9] last:border-b-0">
                        <div className="flex-1 min-w-0">
                          {e.year && <span className="text-sm font-medium">{e.year}年</span>}
                          <span className="text-sm text-gray-500 ml-2">{e.description}</span>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => { setEditingEvent(e); setEditingEventIndex(idx); setEditingMigration(m) }}
                            className="text-gray-400 hover:text-[#5C3D2E] text-xs"
                          >
                            编辑
                          </button>
                          <button
                            onClick={() => handleDeleteEvent(m, idx)}
                            className="text-gray-400 hover:text-red-500 text-xs"
                          >
                            删除
                          </button>
                        </div>
                      </div>
                    ))}
                    {/* 添加新事件按钮 */}
                    <button
                      onClick={() => { setEditingEvent({}); setEditingEventIndex(-1); setEditingMigration(m) }}
                      className="text-sm text-[#5C3D2E] hover:underline"
                    >
                      + 添加事件
                    </button>
                  </div>
                )}
              </div>
            )
          })}

          {migrations.length === 0 && (
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
            onClick={() => batchExtractMigrations(personId).then(fetchData)}
            className="flex-1 py-2 bg-[#5C3D2E] text-white rounded-lg hover:bg-[#4A3125]"
          >
            从故事提取
          </button>
        </div>
      </div>

      {/* 添加/编辑地点弹窗 */}
      {showAddModal && (
        <AddMigrationModal
          migration={editingMigration}
          onSave={handleSave}
          onCancel={() => { setShowAddModal(false); setEditingMigration(null) }}
        />
      )}

      {/* 编辑事件弹窗 */}
      {editingEvent !== null && editingMigration && (
        <EditEventModal
          event={editingEvent}
          onSave={(data) => {
            if (editingEventIndex === -1) {
              // 新增事件
              handleAddEvent(editingMigration, data)
            } else {
              // 编辑现有事件
              handleEditEvent(editingMigration, editingEventIndex, data)
            }
          }}
          onCancel={() => { setEditingEvent(null); setEditingEventIndex(null); setEditingMigration(null) }}
        />
      )}

      {/* 删除确认弹窗 */}
      {deleteConfirm && (
        <ConfirmModal
          title="删除地点"
          message={`确定删除"${deleteConfirm.place_name}"？此操作不可恢复。`}
          onConfirm={() => handleDeletePlace(deleteConfirm)}
          onCancel={() => setDeleteConfirm(null)}
        />
      )}
    </div>
  )
}

export default MyFootprint