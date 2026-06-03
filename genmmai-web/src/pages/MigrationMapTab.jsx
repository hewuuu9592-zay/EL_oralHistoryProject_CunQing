import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  getPersonMigrations,
  createMigration,
  updateMigration,
  deleteMigration,
  suggestMigrations,
} from '../api';

// ========== 地图组件 ==========
const MapView = ({ migrations, onMarkerClick, mapContainerRef }) => {
  const mapInstanceRef = useRef(null);
  const markersRef = useRef([]);
  const polylinesRef = useRef([]);

  // 初始化地图
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    // 确保 AMap 已加载
    if (!window.AMap) {
      console.warn('AMap 未加载');
      return;
    }

    const map = new window.AMap.Map(mapContainerRef.current, {
      zoom: 4,
      center: [105, 36], // 中国中心
      mapStyle: 'amap://styles/normal',
    });

    mapInstanceRef.current = map;
  }, []);

  // 更新markers和路线
  useEffect(() => {
    if (!mapInstanceRef.current) return;
    const map = mapInstanceRef.current;

    // 清除旧的markers和路线
    markersRef.current.forEach(m => map.remove(m));
    polylinesRef.current.forEach(p => map.remove(p));
    markersRef.current = [];
    polylinesRef.current = [];

    const validMigrations = migrations.filter(m => m.latitude && m.longitude);

    if (validMigrations.length === 0) {
      // 无节点，显示中国全图
      map.setZoomAndCenter(4, [105, 36]);
      return;
    }

    // 创建markers
    validMigrations.forEach((migration, index) => {
      const marker = new window.AMap.Marker({
        position: [migration.longitude, migration.latitude],
        title: `${migration.place_name} (${migration.year || '?'})`,
        ext: {
          data: migration,
        },
        content: `
          <div style="
            width: 36px;
            height: 36px;
            background: #C9A84C;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-weight: bold;
            font-size: 12px;
            border: 2px solid #5C3D2E;
            cursor: pointer;
            box-shadow: 0 2px 6px rgba(0,0,0,0.3);
          ">
            ${migration.year ? String(migration.year).slice(-2) : '?'}
          </div>
        `,
      });

      marker.on('click', () => {
        onMarkerClick(migration);
      });

      markersRef.current.push(marker);
      map.add(marker);
    });

    // 按年份排序，创建连线
    const sorted = [...validMigrations].sort((a, b) => (a.year || 0) - (b.year || 0));

    if (sorted.length >= 2) {
      const path = sorted.map(m => [m.longitude, m.latitude]);

      // 带箭头的折线
      const polyline = new window.AMap.Polyline({
        path,
        strokeColor: '#5C3D2E',
        strokeWeight: 3,
        strokeOpacity: 0.8,
        isOutline: false,
        lineJoin: 'round',
      });

      polylinesRef.current.push(polyline);
      map.add(polyline);

      // 箭头标记
      for (let i = 0; i < path.length - 1; i++) {
        const start = path[i];
        const end = path[i + 1];
        const mid = [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2];
        const angle = Math.atan2(end[1] - start[1], end[0] - start[0]) * 180 / Math.PI;

        const arrowMarker = new window.AMap.Marker({
          position: mid,
          anchor: 'center',
          angle,
          rotation: angle + 90,
          content: `
            <div style="
              width: 0;
              height: 0;
              border-left: 6px solid transparent;
              border-right: 6px solid transparent;
              border-bottom: 10px solid #5C3D2E;
            "></div>
          `,
        });
        polylinesRef.current.push(arrowMarker);
        map.add(arrowMarker);
      }
    }

    // 自动缩放
    if (validMigrations.length > 0) {
      map.setFitView(validMigrations.map(m =>
        new window.AMap.LngLat(m.longitude, m.latitude)
      ));
    }
  }, [migrations]);

  return (
    <div
      ref={mapContainerRef}
      className="w-full h-full"
      style={{ minHeight: '500px' }}
    />
  );
};

// ========== 信息卡片 ==========
const MarkerInfoCard = ({ migration, onClose, onEdit }) => {
  if (!migration) return null;

  return (
    <div className="absolute top-4 right-4 bg-white rounded-lg shadow-xl border border-[#E5DED3] p-4 z-10 w-64">
      <div className="flex justify-between items-start mb-2">
        <h3 className="font-bold text-[#5C3D2E]">{migration.place_name}</h3>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg">×</button>
      </div>
      <div className="text-sm text-[#8B7355] mb-2">
        {migration.year ? `年份：${migration.year}` : '年份未知'}
      </div>
      {migration.description && (
        <p className="text-sm text-gray-600 mb-3">{migration.description}</p>
      )}
      <button
        onClick={() => onEdit(migration)}
        className="text-sm text-[#C9A84C] hover:text-[#A08040]"
      >
        编辑
      </button>
    </div>
  );
};

// ========== 手动添加表单 ==========
const AddMigrationModal = ({ onClose, onSave, initialData, personId }) => {
  const [form, setForm] = useState({
    place_name: initialData?.place_name || '',
    latitude: initialData?.latitude || '',
    longitude: initialData?.longitude || '',
    year: initialData?.year || '',
    description: initialData?.description || '',
  });
  const [searchResults, setSearchResults] = useState([]);
  const [loadingCoords, setLoadingCoords] = useState(false);

  // 搜索地点
  const searchPlace = async (keyword) => {
    if (!keyword || keyword.length < 2) {
      setSearchResults([]);
      return;
    }

    try {
      const response = await fetch(
        `https://restapi.amap.com/v3/place/text?key=302ac82dfcd78411387579fdc6613ec4&keywords=${encodeURIComponent(keyword)}&types=190100|190200|190300|190400&city=china&output=json`
      );
      const data = await response.json();

      if (data.status === '1' && data.pois) {
        setSearchResults(data.pois.slice(0, 5));
      }
    } catch (e) {
      console.error('搜索失败:', e);
    }
  };

  const handlePlaceChange = (value) => {
    setForm({ ...form, place_name: value });
    searchPlace(value);
  };

  const selectPlace = (pois) => {
    const location = pois.location.split(',');
    setForm({
      ...form,
      place_name: pois.name + (pois.cityname ? ` (${pois.cityname})` : ''),
      longitude: parseFloat(location[0]),
      latitude: parseFloat(location[1]),
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
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
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
                    <div className="text-sm text-[#4A3728]">{pois.name}</div>
                    <div className="text-xs text-gray-500">{pois.address || pois.cityname}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-[#6B5344] mb-1">
                纬度
              </label>
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
              <label className="block text-sm font-medium text-[#6B5344] mb-1">
                经度
              </label>
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
            <label className="block text-sm font-medium text-[#6B5344] mb-1">
              年份
            </label>
            <input
              type="number"
              className="w-full border-[#D4C4B0] border rounded-md p-2 outline-none"
              value={form.year}
              onChange={(e) => setForm({ ...form, year: e.target.value })}
              placeholder="如：1990"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[#6B5344] mb-1">
              备注
            </label>
            <textarea
              className="w-full border-[#D4C4B0] border rounded-md p-2 outline-none"
              rows="2"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="这个地方发生了什么..."
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-[#8B7355] hover:text-[#5C3D2E]"
            >
              取消
            </button>
            <button
              type="submit"
              className="px-6 py-2 bg-[#5C3D2E] text-white rounded-md hover:bg-[#3D281E]"
            >
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
  const [selected, setSelected] = useState(
    suggestions.map(() => true)
  );

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
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-xl p-8 w-full max-w-md shadow-2xl text-center">
          <div className="text-4xl mb-4">🤔</div>
          <h2 className="text-xl font-serif text-[#5C3D2E] mb-2">未找到迁徙建议</h2>
          <p className="text-gray-500 mb-4">
            该人物的故事中没有提取到明确的迁徙地点。
          </p>
          <button
            onClick={onClose}
            className="px-6 py-2 bg-[#5C3D2E] text-white rounded-md"
          >
            关闭
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl p-6 w-full max-w-lg shadow-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <h2 className="text-xl font-serif text-[#5C3D2E] mb-2">
          AI 智能提取结果
        </h2>
        <p className="text-sm text-gray-500 mb-4">
          请勾选确认要保存的迁徙节点
        </p>

        <div className="flex-1 overflow-y-auto space-y-3 mb-4">
          {suggestions.map((s, idx) => (
            <div
              key={idx}
              className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                selected[idx]
                  ? 'bg-[#FBF7EE] border-[#C9A84C]'
                  : 'bg-gray-50 border-gray-200'
              }`}
              onClick={() => toggle(idx)}
            >
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={selected[idx]}
                  onChange={() => {}}
                  className="mt-1 w-4 h-4 text-[#C9A84C] rounded border-[#D4C4B0]"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-[#4A3728]">
                      {s.place_name}
                    </span>
                    <span className="text-xs px-2 py-0.5 bg-[#C9A84C] bg-opacity-20 text-[#8B7355] rounded">
                      {s.confidence}
                    </span>
                  </div>
                  <div className="text-sm text-gray-500 mt-1">
                    {s.year ? `年份：${s.year}` : '年份未知'}
                  </div>
                  {s.description && (
                    <div className="text-sm text-gray-600 mt-1">
                      {s.description}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-[#8B7355] hover:text-[#5C3D2E]"
          >
            取消
          </button>
          <button
            onClick={handleConfirm}
            className="px-6 py-2 bg-[#C9A84C] text-white rounded-md hover:bg-[#A08040]"
          >
            确认保存
          </button>
        </div>
      </div>
    </div>
  );
};

// ========== 主组件 ==========
const MigrationMapTab = ({ personId }) => {
  const [migrations, setMigrations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showSuggestModal, setShowSuggestModal] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [selectedMarker, setSelectedMarker] = useState(null);
  const [editingMigration, setEditingMigration] = useState(null);
  const mapContainerRef = useRef(null);

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
      if (editingMigration) {
        await updateMigration(personId, editingMigration.id, data);
      } else {
        await createMigration(personId, data);
      }
      // 刷新
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
    if (!confirm('确定删除这条迁徙记录？')) return;
    try {
      await deleteMigration(personId, mid);
      const res = await getPersonMigrations(personId);
      setMigrations(res.data || []);
    } catch (e) {
      console.error('删除失败:', e);
    }
  };

  // AI 智能提取
  const handleAISuggest = async () => {
    try {
      const res = await suggestMigrations(personId);
      setSuggestions(res.data || []);
      setShowSuggestModal(true);
    } catch (e) {
      console.error('AI 提取失败:', e);
      alert('AI 提取失败');
    }
  };

  // 批量保存建议
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

  // 空状态
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
            onClick={handleAISuggest}
            className="flex-1 px-3 py-2 bg-[#C9A84C] text-white text-sm rounded-md hover:bg-[#A08040] transition-colors"
          >
            ✨ AI 智能提取
          </button>
        </div>

        {/* 列表 */}
        <div className="flex-1 overflow-y-auto p-4">
          {sortedMigrations.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-500 mb-2">暂无迁徙记录</p>
              <p className="text-sm text-gray-400">
                点击上方按钮添加地点
              </p>
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
                  <div className="text-sm text-[#8B7355] mb-1">
                    {m.place_name}
                  </div>
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
      <div className="w-[65%] relative">
        {sortedMigrations.length === 0 ? (
          <div className="w-full h-full flex items-center justify-center bg-[#F5F0E8]">
            <div className="text-center">
              <div className="text-4xl mb-2">🗺️</div>
              <p className="text-gray-500">
                添加第一个地点，开始记录迁徙轨迹
              </p>
            </div>
          </div>
        ) : (
          <MapView
            migrations={sortedMigrations}
            onMarkerClick={setSelectedMarker}
            mapContainerRef={mapContainerRef}
          />
        )}
        {selectedMarker && (
          <MarkerInfoCard
            migration={selectedMarker}
            onClose={() => setSelectedMarker(null)}
            onEdit={(m) => {
              setSelectedMarker(null);
              handleEdit(m);
            }}
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
          personId={personId}
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

export default MigrationMapTab;