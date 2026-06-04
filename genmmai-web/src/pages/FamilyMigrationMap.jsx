import React, { useState, useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { getFamilyMigrations, getFamilyMigrationPersons } from '../api';

// 8 种颜色循环使用
const COLORS = [
  '#C9A84C', // 暖金色
  '#5C3D2E', // 深棕色
  '#8B7355', // 咖啡色
  '#166534', // 深绿
  '#1E40AF', // 深蓝
  '#9D174D', // 深红
  '#854D0E', // 深橙
  '#6B7280', // 灰色
];

const getColor = (index) => COLORS[index % COLORS.length];

// 自定义 marker 图标
const createIcon = (color, year) => L.divIcon({
  className: '',
  html: `<div style="
    width:36px;height:36px;background:${color};
    border-radius:50%;display:flex;align-items:center;
    justify-content:center;color:white;font-weight:bold;
    font-size:12px;border:2px solid white;
    box-shadow:0 2px 6px rgba(0,0,0,0.3);
  ">${year ? String(year).slice(-2) : '?'}</div>`,
  iconSize: [36, 36],
  iconAnchor: [18, 18],
});

// 自动适配所有点
const FitBounds = ({ migrations }) => {
  const map = useMap();
  const validMigrations = migrations.filter(m => m.latitude && m.longitude);

  useEffect(() => {
    setTimeout(() => map.invalidateSize(), 100);
    if (validMigrations.length > 0) {
      const bounds = validMigrations.map(m => [m.latitude, m.longitude]);
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 5 });
    }
  }, [migrations]);

  return null;
};

// 地图组件
const MapView = ({ migrations, selectedPersons }) => {
  const filtered = selectedPersons.length === 0
    ? migrations
    : migrations.filter(m => selectedPersons.includes(m.person_id));

  const validMigrations = filtered.filter(m => m.latitude && m.longitude);

  // 按人物分组
  const personData = useMemo(() => {
    const map = {};
    validMigrations.forEach((m, idx) => {
      if (!map[m.person_id]) {
        map[m.person_id] = { color: getColor(Object.keys(map).length), migrations: [], person: m };
      }
      map[m.person_id].migrations.push(m);
    });
    return Object.values(map);
  }, [validMigrations]);

  const center = validMigrations.length > 0
    ? [validMigrations[0].latitude, validMigrations[0].longitude]
    : [36, 105];

  return (
    <div className="w-full h-full" style={{ minHeight: '500px' }}>
      <MapContainer
        center={center}
        zoom={4}
        style={{ width: '100%', height: '100%' }}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='© OpenStreetMap'
        />
        <FitBounds migrations={validMigrations} />

        {/* 每个人的迁徙路线 */}
        {personData.map(data => {
          const sorted = [...data.migrations].sort((a, b) => (a.year || 0) - (b.year || 0));
          const path = sorted.map(m => [m.latitude, m.longitude]);

          return (
            <React.Fragment key={data.person.person_id}>
              {/* 折线 */}
              {path.length >= 2 && (
                <Polyline
                  positions={path}
                  pathOptions={{ color: data.color, weight: 3, opacity: 0.8 }}
                />
              )}
              {/* 标记点 */}
              {sorted.map((m, idx) => (
                <Marker
                  key={m.id}
                  position={[m.latitude, m.longitude]}
                  icon={createIcon(data.color, m.year)}
                >
                  <Popup>
                    <div className="text-center">
                      <strong>{m.place_name}</strong>
                      {m.year && <div>{m.year}年</div>}
                      <div style={{ color: data.color }}>{m.person_name}</div>
                      {m.description && <div className="text-sm text-gray-500 mt-1">{m.description}</div>}
                    </div>
                  </Popup>
                </Marker>
              ))}
            </React.Fragment>
          );
        })}
      </MapContainer>
    </div>
  );
};

// 主组件
const FamilyMigrationMap = () => {
  const [migrations, setMigrations] = useState([]);
  const [persons, setPersons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedPersons, setSelectedPersons] = useState([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [migRes, personsRes] = await Promise.all([
          getFamilyMigrations(),
          getFamilyMigrationPersons()
        ]);
        setMigrations(migRes.data || []);
        setPersons(personsRes.data || []);
      } catch (e) {
        console.error('加载失败:', e);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const togglePerson = (pid) => {
    if (selectedPersons.includes(pid)) {
      setSelectedPersons(selectedPersons.filter(p => p !== pid));
    } else {
      setSelectedPersons([...selectedPersons, pid]);
    }
  };

  // 统计
  const stats = useMemo(() => {
    const uniquePersons = new Set(migrations.map(m => m.person_id)).size;
    const uniquePlaces = new Set(migrations.map(m => m.place_name)).size;
    const years = migrations.filter(m => m.year).map(m => m.year);
    const range = years.length > 0 ? Math.max(...years) - Math.min(...years) : 0;
    return { persons: uniquePersons, places: uniquePlaces, range };
  }, [migrations]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40">
        <div className="text-[#8B7355]">加载中...</div>
      </div>
    );
  }

  return (
    <div className="flex h-[600px]">
      {/* 左侧控制面板 - 30% */}
      <div className="w-[30%] border-r border-[#E5DED3] flex flex-col bg-white">
        {/* 标题 */}
        <div className="p-4 border-b border-[#E5DED3]">
          <h2 className="text-lg font-bold text-[#5C3D2E]">家族迁徙全图</h2>
        </div>

        {/* 按人物过滤 */}
        <div className="flex-1 overflow-y-auto p-4">
          <p className="text-sm text-[#8B7355] mb-3">点击选择人物：</p>
          {persons.length === 0 ? (
            <p className="text-gray-500 text-sm">暂无迁徙记录</p>
          ) : (
            <div className="space-y-2">
              {persons.map((person, idx) => {
                const isSelected = selectedPersons.includes(person.id);
                const color = getColor(idx);
                return (
                  <div
                    key={person.id}
                    className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-colors ${
                      isSelected ? 'bg-[#FAF7F2] border-2' : 'bg-gray-50'
                    }`}
                    style={isSelected ? { borderColor: color } : {}}
                    onClick={() => togglePerson(person.id)}
                  >
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center"
                      style={{ backgroundColor: color }}
                    >
                      {person.avatar_url ? (
                        <img src={person.avatar_url} alt={person.name} className="w-full h-full rounded-full object-cover" />
                      ) : (
                        <span className="text-white text-sm font-bold">{person.name?.charAt(0)}</span>
                      )}
                    </div>
                    <span className="text-sm text-[#4A3728]">{person.name}</span>
                    {isSelected && (
                      <span className="ml-auto text-xs" style={{ color }}>✓</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 统计 */}
        <div className="p-4 border-t border-[#E5DED3] bg-[#FAF7F2]">
          <p className="text-sm text-[#8B7355]">
            {stats.persons} 位成员 / {stats.places} 个地点 / 跨越 {stats.range} 年
          </p>
        </div>
      </div>

      {/* 右侧地图 - 70% */}
      <div className="w-[70%] relative">
        {migrations.length === 0 ? (
          <div className="w-full h-full flex items-center justify-center bg-[#F5F0E8]">
            <div className="text-center">
              <div className="text-4xl mb-2">🗺️</div>
              <p className="text-gray-500 mb-2">还没有迁徙记录</p>
              <p className="text-sm text-gray-400">去人物卡片里添加迁徙地点吧</p>
            </div>
          </div>
        ) : (
          <MapView migrations={migrations} selectedPersons={selectedPersons} />
        )}
      </div>
    </div>
  );
};

export default FamilyMigrationMap;