import React, { useState, useEffect, useMemo } from 'react';
import {
  getPersonMigrations,
  createMigration,
  updateMigration,
  deleteMigration,
  batchExtractMigrations,
} from '../api';
import { MapContainer, TileLayer, Marker, Polyline, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';

// 自定义暖金色圆形 marker
const createIcon = (year) => L.divIcon({
  className: '',
  html: `<div style="
    width:36px;height:36px;background:#C9A84C;
    border-radius:50%;display:flex;align-items:center;
    justify-content:center;color:white;font-weight:bold;
    font-size:12px;border:2px solid #5C3D2E;
    box-shadow:0 2px 6px rgba(0,0,0,0.3);
  ">${year ? String(year).slice(-2) : '?'}</div>`,
  iconSize: [36, 36],
  iconAnchor: [18, 18],
});

// 自动适配所有点的组件
const FitBounds = ({ migrations }) => {
  const map = useMap();
  const validMigrations = migrations.filter(m => m.latitude && m.longitude);

  useEffect(() => {
    // 地图首次渲染后强制重新计算尺寸，解决 display:none 导致的尺寸计算错误
    setTimeout(() => map.invalidateSize(), 100);

    if (validMigrations.length > 0) {
      const bounds = validMigrations.map(m => [m.latitude, m.longitude]);
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 5 });
    }
  }, [migrations]);

  return null;
};

// ========== 地图组件 ==========
const MapView = ({ migrations, onMarkerClick }) => {
  const validMigrations = migrations.filter(m => m.latitude && m.longitude);
  const sorted = [...validMigrations].sort((a, b) => (a.year || 0) - (b.year || 0));

  const center = validMigrations.length > 0
    ? [validMigrations[0].latitude, validMigrations[0].longitude]
    : [36, 105];

  return (
    <MapContainer
      center={center}
      zoom={4}
      style={{ width: '100%', height: '100%', minHeight: '500px' }}
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='© OpenStreetMap'
      />
      <FitBounds migrations={sorted} />
      {sorted.map((m) => (
        <Marker
          key={m.id}
          position={[m.latitude, m.longitude]}
          icon={createIcon(m.year)}
          eventHandlers={{ click: () => onMarkerClick(m) }}
        >
          <Popup>
            <div>
              <strong>{m.place_name}</strong>
              {m.year && <div>{m.year}年</div>}
              {m.description && <div>{m.description}</div>}
            </div>
          </Popup>
        </Marker>
      ))}
      {sorted.length >= 2 && (
        <Polyline
          positions={sorted.map(m => [m.latitude, m.longitude])}
          color="#5C3D2E"
          weight={3}
          opacity={0.8}
        />
      )}
    </MapContainer>
  );
};

// ========== 主组件 ==========
const MigrationMapTab = ({ personId }) => {
  const [migrations, setMigrations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showSuggestModal, setShowSuggestModal] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [extracting, setExtracting] = useState(false);
  const [selectedMarker, setSelectedMarker] = useState(null);
  const [editingMigration, setEditingMigration] = useState(null);

  // 加载迁徙记录
  useEffect(() => {
    const fetchMigrations = async () => {
      try {
        const res = await getPersonMigrations(personId);
        setMigrations(res.data || []);
      } catch (e) {
        console.error('加载迁徙记录失败:', e);
      } finally {
        setLoading(false);
      }
    };
    fetchMigrations();
  }, [personId]);

  // 保存迁徙记录
  const handleSave = async (data) => {
    try {
      let syncToStory = false;

      console.log('editing migration:', editingMigration)
      // 编辑模式且有 source_story_id 时，询问是否同步
      if (editingMigration && editingMigration.source_story_id) {
        const shouldSync = confirm(
          '这条记录来自一个共同故事，是否同步更新到该故事的所有关联人物？\n\n确定 = 同步所有人\n取消 = 只更新当前人物'
        );
        if (shouldSync) {
          syncToStory = true;
        }
      }

      const saveData = syncToStory ? { ...data, sync_to_story: true } : data;

      if (editingMigration) {
        await updateMigration(personId, editingMigration.id, saveData);
      } else {
        await createMigration(personId, data);
      }
      const res = await getPersonMigrations(personId);
      setMigrations(res.data || []);
      setShowAddModal(false);
      setEditingMigration(null);
    } catch (e) {
      console.error('保存失败:', e);
      alert('保存失败');
    }
  };

  // 删除迁徙记录
  const handleDelete = async (mid) => {
    // 查找该记录
    const migration = migrations.find(m => m.id === mid);
    if (!migration) return;

    let syncToStory = false;

    // 有 source_story_id 时，询问是否同步删除
    if (migration.source_story_id) {
      const shouldSync = confirm(
        '是否同时删除该故事其他关联人物的相同迁徙记录？\n\n确定 = 删除所有人\n取消 = 只删除当前人物'
      );
      if (shouldSync) {
        syncToStory = true;
      }
    } else if (!confirm('确定删除这条迁徙记录？')) {
      return;
    }

    try {
      await deleteMigration(personId, mid, syncToStory);
      const res = await getPersonMigrations(personId);
      setMigrations(res.data || []);
    } catch (e) {
      console.error('删除失败:', e);
    }
  };

  // 一键提取迁徙记录
  const handleBatchExtract = async () => {
    if (!confirm('将分析该人物所有未提取过的故事，提取其中的地点信息。是否继续？')) return;

    setExtracting(true);
    try {
      const res = await batchExtractMigrations(personId);
      const result = res.data || {};

      // 刷新迁徙记录列表
      const migrationsRes = await getPersonMigrations(personId);
      setMigrations(migrationsRes.data || []);

      alert(`本次新增 ${result.written_count || 0} 条迁徙记录，涉及 ${result.stories_count || 0} 个故事`);
    } catch (e) {
      console.error('提取失败:', e);
      alert('提取失败，请重试');
    } finally {
      setExtracting(false);
    }
  };

  // 批量保存建议 (保留用于兼容旧逻辑)
  const handleConfirmSuggestions = async (items) => {
    try {
      await Promise.all(items.map(item => createMigration(personId, item)));
      const res = await getPersonMigrations(personId);
      setMigrations(res.data || []);
      setShowSuggestModal(false);
    } catch (e) {
      console.error('批量保存失败:', e);
    }
  };

  // 编辑
  const handleEdit = (migration) => {
    setEditingMigration(migration);
    setShowAddModal(true);
  };

  // 按年份排序
  const sortedMigrations = useMemo(() => {
    return [...migrations].sort((a, b) => {
      if (!a.year) return 1;
      if (!b.year) return -1;
      return a.year - b.year;
    });
  }, [migrations]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-[#4A3728]">加载中...</div>
      </div>
    );
  }

  return (
    <div className="flex h-[600px]">
      {/* 左侧 - 列表区域 */}
      <div className="w-[35%] border-r border-[#E5DED3] flex flex-col bg-white">
        {/* 按钮区 */}
        <div className="p-4 border-b border-[#E5DED3] flex gap-2">
          <button
            onClick={() => {
              setEditingMigration(null);
              setShowAddModal(true);
            }}
            className="flex-1 px-3 py-2 bg-[#5C3D2E] text-white text-sm rounded-md hover:bg-[#3D281E] transition-colors"
          >
            + 手动添加地点
          </button>
          <button
            onClick={handleBatchExtract}
            disabled={extracting}
            className="flex-1 px-3 py-2 bg-[#C9A84C] text-white text-sm rounded-md hover:bg-[#A08040] transition-colors disabled:opacity-50"
          >
            {extracting ? (
              <>
                <div className="w-3 h-3 inline-block mr-1 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                分析中...
              </>
            ) : (
              <>✨ 从故事一键提取</>
            )}
          </button>
        </div>

        {/* 列表 */}
        <div className="flex-1 overflow-y-auto p-4">
          {sortedMigrations.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-500 mb-2">暂无迁徙记录</p>
              <p className="text-sm text-gray-400">点击上方按钮添加地点</p>
            </div>
          ) : (
            <div className="space-y-2">
              {sortedMigrations.map((m) => (
                <div
                  key={m.id}
                  className="p-3 rounded-lg border border-[#E5DED3] hover:bg-[#FAF7F2] transition-colors"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-[#4A3728]">
                      {m.year || '?'}年
                    </span>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleEdit(m)}
                        className="text-xs text-[#C9A84C] hover:text-[#A08040]"
                      >
                        编辑
                      </button>
                      <button
                        onClick={() => handleDelete(m.id)}
                        className="text-xs text-red-400 hover:text-red-600"
                      >
                        删除
                      </button>
                    </div>
                  </div>
                  <div className="text-sm text-[#8B7355] mb-1">{m.place_name}</div>
                  {m.description && (
                    <div className="text-xs text-gray-500 line-clamp-2">
                      {m.description.slice(0, 20)}
                      {m.description.length > 20 ? '...' : ''}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 右侧 - 地图区域 */}
      <div className="w-[65%] h-[600px]">
        {sortedMigrations.length === 0 ? (
          <div className="w-full h-full flex items-center justify-center bg-[#F5F0E8]">
            <div className="text-center">
              <div className="text-4xl mb-2">🗺️</div>
              <p className="text-gray-500">添加第一个地点，开始记录迁徙轨迹</p>
            </div>
          </div>
        ) : (
          <MapView
            migrations={sortedMigrations}
            onMarkerClick={setSelectedMarker}
          />
        )}
      </div>

      {/* 手动添加弹窗 */}
      {showAddModal && (
        <AddMigrationModal
          onClose={() => {
            setShowAddModal(false);
            setEditingMigration(null);
          }}
          onSave={handleSave}
          initialData={editingMigration}
        />
      )}

      {/* AI 建议弹窗 */}
      {showSuggestModal && (
        <SuggestModal
          suggestions={suggestions}
          onClose={() => setShowSuggestModal(false)}
          onConfirm={handleConfirmSuggestions}
        />
      )}
    </div>
  );
};

// ========== 手动添加表单 ==========
const AddMigrationModal = ({ onClose, onSave, initialData }) => {
  const [form, setForm] = useState({
    place_name: initialData?.place_name || '',
    latitude: initialData?.latitude || '',
    longitude: initialData?.longitude || '',
    year: initialData?.year || '',
    description: initialData?.description || '',
  });
  const [searchResults, setSearchResults] = useState([]);

  // Nominatim 搜索
  const searchPlace = async (keyword) => {
    if (!keyword || keyword.length < 2) {
      setSearchResults([]);
      return;
    }
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(keyword)}&format=json&limit=5&accept-language=zh`
      );
      const data = await response.json();
      setSearchResults(data);
    } catch (e) {
      console.error('搜索失败:', e);
    }
  };

  const handlePlaceChange = (value) => {
    setForm({ ...form, place_name: value });
    if (value.length >= 2) {
      searchPlace(value);
    } else {
      setSearchResults([]);
    }
  };

  const selectPlace = (pois) => {
    setForm({
      ...form,
      place_name: pois.display_name,
      latitude: parseFloat(pois.lat),
      longitude: parseFloat(pois.lon),
    });
    setSearchResults([]);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.place_name.trim()) return;
    const data = {
      place_name: form.place_name,
      latitude: form.latitude ? parseFloat(form.latitude) : null,
      longitude: form.longitude ? parseFloat(form.longitude) : null,
      year: form.year ? parseInt(form.year) : null,
      description: form.description || null,
    };
    await onSave(data);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999] p-4">
      <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-2xl">
        <h2 className="text-xl font-serif text-[#5C3D2E] mb-4">
          {initialData ? '编辑迁徙地点' : '添加迁徙地点'}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-[#6B5344] mb-1">
              地点名称 <span className="text-red-500">*</span>
            </label>
            <input
              required
              className="w-full border-[#D4C4B0] border rounded-md p-2 focus:ring-[#C9A84C] focus:border-[#C9A84C] outline-none"
              value={form.place_name}
              onChange={(e) => handlePlaceChange(e.target.value)}
              placeholder="输入地名自动补全坐标"
            />
            {searchResults.length > 0 && (
              <div className="bg-white border border-[#D4C4B0] rounded-md mt-1 max-h-40 overflow-y-auto">
                {searchResults.map((pois, idx) => (
                  <div
                    key={idx}
                    className="p-2 hover:bg-[#FAF7F2] cursor-pointer"
                    onClick={() => selectPlace(pois)}
                  >
                    <div className="text-sm text-[#4A3728]">{pois.display_name}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-[#6B5344] mb-1">纬度</label>
              <input
                type="number"
                step="any"
                className="w-full border-[#D4C4B0] border rounded-md p-2 outline-none"
                value={form.latitude}
                onChange={(e) => setForm({ ...form, latitude: e.target.value })}
                placeholder="自动填充"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#6B5344] mb-1">经度</label>
              <input
                type="number"
                step="any"
                className="w-full border-[#D4C4B0] border rounded-md p-2 outline-none"
                value={form.longitude}
                onChange={(e) => setForm({ ...form, longitude: e.target.value })}
                placeholder="自动填充"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-[#6B5344] mb-1">年份</label>
            <input
              type="number"
              className="w-full border-[#D4C4B0] border rounded-md p-2 outline-none"
              value={form.year}
              onChange={(e) => setForm({ ...form, year: e.target.value })}
              placeholder="如：1990"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[#6B5344] mb-1">备注</label>
            <textarea
              className="w-full border-[#D4C4B0] border rounded-md p-2 outline-none"
              rows="2"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="这个地方发生了什么..."
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-[#8B7355]">
              取消
            </button>
            <button type="submit" className="px-6 py-2 bg-[#5C3D2E] text-white rounded-md">
              保存
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ========== AI 建议确认面板 ==========
const SuggestModal = ({ suggestions, onClose, onConfirm }) => {
  const [selected, setSelected] = useState(suggestions.map(() => true));

  const toggle = (index) => {
    const newSelected = [...selected];
    newSelected[index] = !newSelected[index];
    setSelected(newSelected);
  };

  const handleConfirm = async () => {
    const selectedItems = suggestions
      .filter((_, idx) => selected[idx])
      .map(s => ({
        place_name: s.place_name,
        year: s.year,
        description: s.description,
      }));
    await onConfirm(selectedItems);
  };

  if (!suggestions || suggestions.length === 0) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999] p-4">
        <div className="bg-white rounded-xl p-8 w-full max-w-md shadow-2xl text-center">
          <div className="text-4xl mb-4">🤔</div>
          <h2 className="text-xl font-serif text-[#5C3D2E] mb-2">未找到迁徙建议</h2>
          <p className="text-gray-500 mb-4">该人物的故事中没有提取到明确的迁徙地点。</p>
          <button onClick={onClose} className="px-6 py-2 bg-[#5C3D2E] text-white rounded-md">
            关闭
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl p-6 w-full max-w-lg shadow-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <h2 className="text-xl font-serif text-[#5C3D2E] mb-2">AI 智能提取结果</h2>
        <p className="text-sm text-gray-500 mb-4">请勾选确认要保存的迁徙节点</p>

        <div className="flex-1 overflow-y-auto space-y-3 mb-4">
          {suggestions.map((s, idx) => (
            <div
              key={idx}
              className={`p-3 rounded-lg border cursor-pointer ${
                selected[idx] ? 'bg-[#FBF7EE] border-[#C9A84C]' : 'bg-gray-50 border-gray-200'
              }`}
              onClick={() => toggle(idx)}
            >
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={selected[idx]}
                  onChange={() => {}}
                  className="mt-1 w-4 h-4"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-[#4A3728]">{s.place_name}</span>
                    <span className="text-xs px-2 py-0.5 bg-[#C9A84C] text-white rounded">{s.confidence}</span>
                  </div>
                  <div className="text-sm text-gray-500 mt-1">{s.year ? `年份：${s.year}` : '年份未知'}</div>
                  {s.description && <div className="text-sm text-gray-600 mt-1">{s.description}</div>}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-[#8B7355]">取消</button>
          <button onClick={handleConfirm} className="px-6 py-2 bg-[#C9A84C] text-white rounded-md">
            确认保存
          </button>
        </div>
      </div>
    </div>
  );
};

export default MigrationMapTab;