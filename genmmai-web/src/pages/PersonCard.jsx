import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  getPerson, getPersonStories, getPersonStoryThemes, getPersonRelations,
  updatePerson, getRelationships, deleteRelationship, createRelationship,
  getPersons   // 这个是获取所有人列表的，需要用到
} from '../api';
import MigrationMapTab from './MigrationMapTab';
// ========== 主题颜色映射 ==========
const THEME_COLORS = {
  '家乡记忆': { bg: '#DCFCE7', text: '#166534', emoji: '🏠' },
  '工作岁月': { bg: '#DBEAFE', text: '#1E40AF', emoji: '💼' },
  '爱情婚姻': { bg: '#FCE7F9', text: '#9D174D', emoji: '💕' },
  '历史亲历': { bg: '#FEF9C3', text: '#854D0E', emoji: '📜' },
  '家族传承': { bg: '#166534', text: '#FFFFFF', emoji: '🌳' },
  '童年往事': { bg: '#FFEDD5', text: '#9A3412', emoji: '🧒' },
  '其他': { bg: '#F3F4F6', text: '#374151', emoji: '📝' },
};

const getThemeStyle = (theme) => {
  const key = theme || '其他';
  return THEME_COLORS[key] || THEME_COLORS['其他'];
};

// ========== SVG 关系图组件 ==========
const RelationsGraph = ({ currentPerson, relations, stories, onEdgeClick }) => {
  const navigate = useNavigate();

  // 计算布局参数
  const { centerX, centerY, radius } = useMemo(() => {
    const cx = 400;
    const cy = 300;
    const total = relations?.length || 0;
    const r = total <= 4 ? 160 : total <= 8 ? 220 : 280;
    return { centerX: cx, centerY: cy, radius: r };
  }, [relations?.length]);

  // 计算每个关系的坐标
  const nodes = useMemo(() => {
    if (!relations || relations.length === 0) return [];

    return relations.map((rel, index) => {
      const angle = (index / relations.length) * 2 * Math.PI - Math.PI / 2;
      const x = centerX + radius * Math.cos(angle);
      const y = centerY + radius * Math.sin(angle);
      return {
        ...rel,
        x,
        y,
        angle,
      };
    });
  }, [relations, centerX, centerY, radius]);

  // 处理连线点击
  const handleEdgeClick = (related) => {
    onEdgeClick(related);
  };

  // 处理节点点击
  const handleNodeClick = (personId) => {
    navigate(`/person/${personId}`);
  };

  // 空状态
  if (!relations || relations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <p className="text-gray-500 mb-4">还没有与其他人共同出现的故事</p>
        <button
          onClick={() => navigate(`/record?personId=${currentPerson.id}`)}
          className="px-4 py-2 bg-[#4A3728] text-white rounded-lg"
        >
          去录入故事
        </button>
      </div>
    );
  }

  return (
    <div className="relative w-full" style={{ height: 600 }}>
      <svg width="100%" viewBox="0 0 800 600" className="w-full">
        <defs>
          <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="2" stdDeviation="3" floodOpacity="0.15"/>
          </filter>
        </defs>

        {/* 连线层 - 先画，在节点下方 */}
        {nodes.map((node) => {
          const strokeWidth = node.story_count <= 2 ? 1.5 : node.story_count <= 5 ? 2.5 : 4;
          const midX = (centerX + node.x) / 2;
          const midY = (centerY + node.y) / 2;

          return (
            <g key={`edge-${node.person.id}`}>
              {/* 实体连线 */}
              <line
                x1={centerX}
                y1={centerY}
                x2={node.x}
                y2={node.y}
                stroke="#C9A84C"
                strokeWidth={strokeWidth}
              />
              {/* 箭头 */}
              <polygon
                points={`${node.x - 8},${node.y - 6} ${node.x},${node.y} ${node.x + 8},${node.y - 6}`}
                fill="#C9A84C"
                transform={`rotate(${(node.angle * 180 / Math.PI) + 90}, ${node.x}, ${node.y})`}
              />
              {/* 可点击的标签区域 */}
              <g
                transform={`translate(${midX}, ${midY})`}
                style={{ cursor: 'pointer' }}
                onClick={() => handleEdgeClick(node)}
              >
                <rect
                  x={-30}
                  y={-12}
                  width={60}
                  height={24}
                  fill="transparent"
                />
                <text
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize={12}
                  fill="#8B7355"
                  className="pointer-events-none"
                >
                  {node.relation_type}
                </text>
              </g>
            </g>
          );
        })}

        {/* 中心节点 */}
        <g transform={`translate(${centerX}, ${centerY})`}>
          <circle r={40} fill="white" stroke="#5C3D2E" strokeWidth={2} filter="url(#shadow)" />
          {currentPerson?.avatar ? (
            <clipPath id="centerClip">
              <circle r={36} />
            </clipPath>
          ) : null}
          {currentPerson?.avatar ? (
            <image
              href={currentPerson.avatar}
              x={-36}
              y={-36}
              width={72}
              height={72}
              clipPath="url(#centerClip)"
            />
          ) : (
            <text
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={28}
              fontWeight="bold"
              fill="#5C3D2E"
            >
              {currentPerson?.name?.charAt(0) || '?'}
            </text>
          )}
        </g>
        {/* 中心节点名字 */}
        <text
          x={centerX}
          y={centerY + 55}
          textAnchor="middle"
          fontSize={13}
          fill="#5C3D2E"
          fontWeight="500"
        >
          {currentPerson?.name}
        </text>

        {/* 周围节点 */}
        {nodes.map((node) => (
          <g key={node.person.id} transform={`translate(${node.x}, ${node.y})`}>
            <circle
              r={30}
              fill="white"
              stroke="#C9A84C"
              strokeWidth={1.5}
              style={{ cursor: 'pointer', transition: 'stroke 0.2s' }}
              className="hover:stroke-[#A08040]"
              onClick={() => handleNodeClick(node.person.id)}
            />
            {node.person?.avatar_url ? (
              <clipPath id={`clip-${node.person.id}`}>
                <circle r={26} />
              </clipPath>
            ) : null}
            {node.person?.avatar_url ? (
              <image
                href={node.person.avatar_url}
                x={-26}
                y={-26}
                width={52}
                height={52}
                clipPath={`url(#clip-${node.person.id})`}
                style={{ cursor: 'pointer' }}
                onClick={() => handleNodeClick(node.person.id)}
              />
            ) : (
              <text
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={22}
                fontWeight="bold"
                fill="#5C3D2E"
                style={{ cursor: 'pointer' }}
                onClick={() => handleNodeClick(node.person.id)}
              >
                {node.person?.name?.charAt(0) || '?'}
              </text>
            )}
            {/* 节点名字 */}
            <text
              y={45}
              textAnchor="middle"
              fontSize={12}
              fill="#5C3D2E"
            >
              {node.person?.name}
            </text>
            {/* 故事数量 */}
            <text
              y={-35}
              textAnchor="middle"
              fontSize={10}
              fill="#C9A84C"
              fontWeight="600"
            >
              {node.story_count}则
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
};

// ========== 关系侧边栏 ==========
const RelationSidebar = ({ currentPerson, relatedPerson, stories, onClose }) => {
  const [sharedStories, setSharedStories] = useState([]);

  useEffect(() => {
    if (!stories || !relatedPerson) {
      setSharedStories([]);
      return;
    }
    // 筛选同时包含这两个人的故事
    const shared = stories.filter(story => {
      const personIds = story.person_ids ? JSON.parse(story.person_ids) : [];
      return personIds.includes(relatedPerson.person.id);
    });
    setSharedStories(shared);
  }, [stories, relatedPerson]);

  return (
    <div className="h-full">
      {/* 头部 */}
      <div className="sticky top-0 bg-white border-b border-[#E5DED3] p-4">
        <div className="flex justify-between items-center">
          <h2 className="text-lg font-bold text-[#4A3728] font-serif">
            {currentPerson?.name} × {relatedPerson?.person?.name}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl"
          >
            ✕
          </button>
        </div>
        <p className="text-sm text-[#D4A574] mt-1">共同的故事</p>
      </div>

      {/* 内容区 */}
      <div className="p-4">
        {sharedStories.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-gray-500 mb-4">还没有共同的故事</p>
          </div>
        ) : (
          <div className="space-y-3">
            {sharedStories.map(story => {
              const themeStyle = getThemeStyle(story.theme);
              return (
                <div
                  key={story.id}
                  className="p-3 bg-[#FAF7F2] rounded-lg cursor-pointer hover:bg-[#F5EDE0] transition-colors"
                  onClick={() => window.location.href = `/story/${story.id}`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-bold text-[#D4A574]">
                      {story.year || '?'}
                    </span>
                    <span
                      className="text-xs px-2 py-0.5 rounded-full"
                      style={{ backgroundColor: themeStyle.bg, color: themeStyle.text }}
                    >
                      {themeStyle.emoji} {story.theme || '其他'}
                    </span>
                  </div>
                  <p className="text-sm text-[#4A3728] line-clamp-2">
                    {story.summary || story.transcript?.slice(0, 50) || '暂无摘要'}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

// ========== 时间轴组件 ==========
const Timeline = ({ stories, person }) => {
  const navigate = useNavigate();
  const birthYear = person?.birth_year;
  const deathYear = person?.death_year;

  if (!stories || stories.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <p className="text-gray-500 mb-4">还没有故事</p>
        <button
          onClick={() => navigate(`/record?personId=${person.id}`)}
          className="px-4 py-2 bg-[#4A3728] text-white rounded-lg"
        >
          录入第一个故事
        </button>
      </div>
    );
  }

  const sortedStories = [...stories].sort((a, b) => {
    if (!a.year) return 1;
    if (!b.year) return -1;
    return a.year - b.year;
  });

  return (
    <div className="relative pl-4">
      <div className="flex items-center mb-4">
        <div className="w-2 h-2 rounded-full bg-[#4A3728] mr-3" />
        <span className="text-sm font-bold text-[#D4A574]">{birthYear}</span>
      </div>

      <div className="absolute left-[calc(0.5rem+3px)] top-6 bottom-6 w-0.5 bg-[#E8DDD0]" />

      <div className="space-y-6">
        {sortedStories.map((story) => {
          const themeStyle = getThemeStyle(story.theme);
          return (
            <div
              key={story.id}
              className="relative pl-6 cursor-pointer group"
              onClick={() => navigate(`/story/${story.id}`)}
            >
              <div className="absolute left-0 top-1 w-2 h-2 rounded-full bg-[#4A3728]" />
              <div>
                <div className="text-sm font-bold text-[#D4A574]">
                  {story.year || '未知年份'}
                </div>
                <div
                  className="inline-block px-2 py-0.5 rounded-full text-xs mt-1"
                  style={{ backgroundColor: themeStyle.bg, color: themeStyle.text }}
                >
                  {themeStyle.emoji} {story.theme || '其他'}
                </div>
                <p className="text-sm text-[#4A3728] mt-1 group-hover:opacity-70">
                  {story.summary || story.transcript?.slice(0, 50) || '暂无摘要'}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-center mt-4">
        <div className="w-2 h-2 rounded-full bg-[#4A3728] mr-3" />
        <span className="text-sm font-bold text-[#D4A574]">
          {deathYear ? `${deathYear}` : '至今'}
        </span>
      </div>
    </div>
  );
};

// ========== 主题故事集组件 ==========
const THEMES_ORDER = [
  '家乡记忆', '工作岁月', '爱情婚姻', '历史亲历',
  '家族传承', '童年往事', '其他'
];

const ThemeStories = ({ themes, stories }) => {
  const [expandedTheme, setExpandedTheme] = useState(null);

  const orderedThemes = THEMES_ORDER.map(themeName => {
    const themeData = themes.find(t => t.theme === themeName);
    return {
      name: themeName,
      count: themeData?.count || 0,
    };
  });

  const getStoriesByTheme = (themeName) => {
    return stories.filter(s => (s.theme || '其他') === themeName);
  };

  if (!themes || themes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <p className="text-gray-500">还没有故事</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3">
      {orderedThemes.map(({ name, count }) => {
        const themeStyle = getThemeStyle(name);
        const isExpanded = expandedTheme === name;
        const themeStories = getStoriesByTheme(name);
        const hasStories = count > 0;

        return (
          <div key={name}>
            <div
              className={`p-4 rounded-lg cursor-pointer transition-all ${
                hasStories
                  ? 'bg-white border border-[#E5DED3]'
                  : 'bg-gray-100'
              }`}
              onClick={() => hasStories && setExpandedTheme(isExpanded ? null : name)}
            >
              <div className="flex items-center justify-between">
                <span className="text-2xl">{themeStyle.emoji}</span>
                <span
                  className={`text-2xl font-bold ${
                    hasStories ? 'text-[#D4A574]' : 'text-gray-400'
                  }`}
                >
                  {hasStories ? count : '暂无'}
                </span>
              </div>
              <div
                className={`mt-2 text-sm ${hasStories ? 'text-[#4A3728]' : 'text-gray-400'}`}
              >
                {name}
              </div>
            </div>

            {isExpanded && themeStories.length > 0 && (
              <div className="mt-2 space-y-2 pl-2">
                {themeStories.map(story => (
                  <div
                    key={story.id}
                    className="flex items-start gap-2 p-2 bg-white rounded border border-[#E5DED3] cursor-pointer hover:bg-gray-50"
                    onClick={() => window.location.href = `/story/${story.id}`}
                  >
                    <span className="text-xs font-bold text-[#D4A574] shrink-0">
                      {story.year || '?'}
                    </span>
                    <span className="text-xs text-[#4A3728] line-clamp-2">
                      {story.summary || story.transcript?.slice(0, 30) || '暂无摘要'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

// ========== 主组件 ==========
const PersonCard = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [person, setPerson] = useState(null);
  const [stories, setStories] = useState([]);
  const [themes, setThemes] = useState([]);
  const [relations, setRelations] = useState([]);
  const [allPersons, setAllPersons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('timeline');
  const [selectedRelated, setSelectedRelated] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [allRelationships, setAllRelationships] = useState([]); // 全量关系
  const [showEditModal, setShowEditModal] = useState(false);
  const [editForm, setEditForm] = useState({
    name: '',
    birth_year: '',
    death_year: '',
    gender: '女',
    bio: '',
    father_id: '',
    mother_id: '',
    spouse_id: '',
    isDeceased: false   // 新增
  });

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [personRes, storiesRes, themesRes, relationsRes, allRelsRes, allPersonsRes] = await Promise.all([
          getPerson(id),
          getPersonStories(id),
          getPersonStoryThemes(id),
          getPersonRelations(id),
          getRelationships(), // 新增：获取全量关系
          getPersons() // 新增：获取所有人
        ]);
        setPerson(personRes.data);
        setStories(storiesRes.data);
        setThemes(themesRes.data);
        setRelations(relationsRes.data || []);
        setAllRelationships(allRelsRes.data || []);
        setAllPersons(allPersonsRes.data || []);
      } catch (error) {
        console.error('获取数据失败:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [id]);

  const handleEdit = () => {
    if (!person) return;
  
    // 从 allRelationships 中找出当前人物的父亲、母亲、配偶
    let fatherId = '';
    let motherId = '';
    let spouseId = '';
  
    allRelationships.forEach(rel => {
      if (rel.relation_type === 'father' && rel.person_b_id === person.id) {
        fatherId = rel.person_a_id;
      } else if (rel.relation_type === 'mother' && rel.person_b_id === person.id) {
        motherId = rel.person_a_id;
      } else if (rel.relation_type === 'spouse') {
        if (rel.person_a_id === person.id) {
          spouseId = rel.person_b_id;
        } else if (rel.person_b_id === person.id) {
          spouseId = rel.person_a_id;
        }
      }
    });
  
    // 计算是否已逝世
    const isDeceased = !!(person.death_year && person.death_year !== '');
  
    setEditForm({
      name: person.name || '',
      birth_year: person.birth_year ? String(person.birth_year) : '',
      death_year: person.death_year ? String(person.death_year) : '',
      gender: person.gender || '男',
      bio: person.bio || '',
      father_id: fatherId,
      mother_id: motherId,
      spouse_id: spouseId,
      isDeceased: isDeceased,   // 新增
    });
    setShowEditModal(true);
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    try {
      // 1. 更新基本信息
      await updatePerson(person.id, {
        name: editForm.name,
        gender: editForm.gender,
        birth_year: editForm.birth_year ? parseInt(editForm.birth_year) : null,
        death_year: editForm.isDeceased && editForm.death_year ? parseInt(editForm.death_year) : null,
        bio: editForm.bio,
      });
  
      // 2. 处理关系更新：先删除当前人物相关的所有父子关系和配偶关系
      const relatedRels = allRelationships.filter(rel => {
        if (rel.relation_type === 'father' && rel.person_b_id === person.id) return true;
        if (rel.relation_type === 'mother' && rel.person_b_id === person.id) return true;
        if (rel.relation_type === 'spouse' && (rel.person_a_id === person.id || rel.person_b_id === person.id)) return true;
        return false;
      });
      await Promise.all(relatedRels.map(rel => deleteRelationship(rel.id)));
  
      // 3. 创建新的关系
      const newRels = [];
      if (editForm.father_id) {
        newRels.push(createRelationship({ person_a_id: editForm.father_id, person_b_id: person.id, relation_type: 'father' }));
      }
      if (editForm.mother_id) {
        newRels.push(createRelationship({ person_a_id: editForm.mother_id, person_b_id: person.id, relation_type: 'mother' }));
      }
      if (editForm.spouse_id) {
        newRels.push(createRelationship({ person_a_id: editForm.spouse_id, person_b_id: person.id, relation_type: 'spouse' }));
      }
      await Promise.all(newRels);
  
      // 4. 刷新页面数据
      const [updatedPerson, updatedStories, updatedThemes, updatedRelations, updatedAllRels] = await Promise.all([
        getPerson(id),
        getPersonStories(id),
        getPersonStoryThemes(id),
        getPersonRelations(id),
        getRelationships()
      ]);
      setPerson(updatedPerson.data);
      setStories(updatedStories.data);
      setThemes(updatedThemes.data);
      setRelations(updatedRelations.data || []);
      setAllRelationships(updatedAllRels.data || []);
      setShowEditModal(false);
    } catch (err) {
      console.error('保存失败:', err);
      alert('保存失败，请检查网络或数据');
    }
  };

  const getNameInitial = (name) => {
    return name ? name.charAt(0) : '?';
  };

  const formatYears = (birthYear, deathYear) => {
    if (birthYear) {
      if (deathYear) {
        return `${birthYear} - ${deathYear}`;
      }
      return `${birthYear}`;
    }
    return '';
  };

  const handleEdgeClick = (related) => {
    setSelectedRelated(related);
    setSidebarOpen(true);
  };

  const handleCloseSidebar = () => {
    setSidebarOpen(false);
    setTimeout(() => setSelectedRelated(null), 300);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FAF7F2] flex items-center justify-center">
        <div className="text-[#4A3728]">加载中...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAF7F2] relative">
      {/* Header */}
      <div className="bg-white border-b border-[#E5DED3] pb-6 pt-4 px-4">
        <div className="max-w-md mx-auto">
          <div className="flex justify-between items-start mb-4">
            <button
              onClick={() => navigate('/')}
              className="text-[#4A3728] hover:opacity-70"
            >
              ← 返回
            </button>
            <button
              onClick={handleEdit}
              className="text-[#4A3728] hover:opacity-70"
            >
              编辑
            </button>
          </div>

          <div className="flex flex-col items-center">
            {person?.avatar ? (
              <img
                src={person.avatar}
                alt={person.name}
                className="w-[100px] h-[100px] rounded-full object-cover"
              />
            ) : (
              <div className="w-[100px] h-[100px] rounded-full bg-[#D4A574] flex items-center justify-center text-white text-4xl font-bold">
                {getNameInitial(person?.name)}
              </div>
            )}

            <h1 className="mt-4 text-2xl font-bold text-[#4A3728]">
              {person?.name || '未知'}
            </h1>

            <p className="mt-1 text-sm text-gray-500">
              {formatYears(person?.birth_year, person?.death_year)}
            </p>

            <p className="mt-2 text-sm italic text-gray-500 text-center max-w-xs">
              {person?.bio || ''}
            </p>
          </div>
        </div>
      </div>

      {/* Tab 导航 */}
      <div className="bg-white border-b border-[#E5DED3]">
        <div className="max-w-md mx-auto flex">
          {[
            { key: 'relations', label: '人际关系图' },
            { key: 'timeline', label: '个人时间轴' },
            { key: 'stories', label: '主题故事集' },
            { key: 'migrations', label: '迁徙地图' },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 py-3 text-sm relative ${
                activeTab === tab.key
                  ? 'text-[#4A3728] font-medium'
                  : 'text-gray-400'
              }`}
            >
              {tab.label}
              {activeTab === tab.key && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#4A3728]" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* 内容区域 */}
      <div className="p-4 pb-20">
        <div className="max-w-md mx-auto">
          <div style={{ display: activeTab === 'relations' ? 'block' : 'none' }}>
            <RelationsGraph
              currentPerson={person}
              relations={relations}
              stories={stories}
              onEdgeClick={handleEdgeClick}
            />
          </div>
          <div style={{ display: activeTab === 'timeline' ? 'block' : 'none' }}>
            <Timeline stories={stories} person={person} />
          </div>
          <div style={{ display: activeTab === 'stories' ? 'block' : 'none' }}>
            <ThemeStories themes={themes} stories={stories} />
          </div>
          <div style={{ display: activeTab === 'migrations' ? 'block' : 'none' }}>
            <MigrationMapTab personId={id} />
          </div>
        </div>
      </div>

      {/* 关系侧边栏 */}
      {selectedRelated && (
        <>
          <div
            className="fixed inset-0 bg-black bg-opacity-20 z-40"
            onClick={handleCloseSidebar}
          />
          <div
            className={`fixed inset-y-0 right-0 w-[300px] bg-white shadow-2xl z-50 transform transition-transform duration-300 overflow-y-auto ${
              sidebarOpen ? 'translate-x-0' : 'translate-x-full'
            }`}
          >
            <RelationSidebar
              currentPerson={person}
              relatedPerson={selectedRelated}
              stories={stories}
              onClose={handleCloseSidebar}
            />
          </div>
        </>
      )}

      {/* 右下角固定 "+" 按钮 */}
      <button
        onClick={() => navigate(`/record?personId=${id}`)}
        className="fixed bottom-8 right-8 w-12 h-12 rounded-full bg-[#4A3728] text-white text-2xl flex items-center justify-center shadow-lg hover:bg-[#5A4738] transition-colors"
      >
        +
      </button>

      {/* 编辑弹窗 */}
      {showEditModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-[10000]">
          <div className="bg-white rounded-xl p-8 max-w-md w-full shadow-2xl border-2 border-[#D4C4B0] max-h-[90vh] overflow-y-auto">
            <h2 className="text-2xl font-serif text-[#5C3D2E] mb-6 text-center">
              编辑成员
            </h2>
            <form onSubmit={handleEditSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[#6B5344] mb-1">姓名</label>
                <input 
                  required
                  className="w-full border-[#D4C4B0] border rounded-md p-2 focus:ring-[#C9A84C] focus:border-[#C9A84C] outline-none"
                  value={editForm.name}
                  onChange={e => setEditForm({...editForm, name: e.target.value})}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-[#6B5344] mb-1">出生年份</label>
                  <input 
                    className="w-full border-[#D4C4B0] border rounded-md p-2 outline-none"
                    value={editForm.birth_year}
                    onChange={e => setEditForm({...editForm, birth_year: e.target.value})}
                    placeholder="如：1950"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#6B5344] mb-1">性别</label>
                  <select 
                    className="w-full border-[#D4C4B0] border rounded-md p-2 outline-none"
                    value={editForm.gender}
                    onChange={e => setEditForm({...editForm, gender: e.target.value})}
                  >
                    <option>男</option>
                    <option>女</option>
                  </select>
                </div>
              </div>

              {/* 已逝世复选框 + 逝世年份（条件显示） */}
              <div className="space-y-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editForm.isDeceased}
                    onChange={e => {
                      const checked = e.target.checked;
                      setEditForm({
                        ...editForm,
                        isDeceased: checked,
                        death_year: checked ? editForm.death_year : ''   // 取消勾选时清空年份
                      });
                    }}
                    className="w-4 h-4 text-[#5C3D2E] rounded border-[#D4C4B0] focus:ring-[#C9A84C]"
                  />
                  <span className="text-sm text-[#6B5344]">已逝世</span>
                </label>

                {editForm.isDeceased && (
                  <div>
                    <label className="block text-sm font-medium text-[#6B5344] mb-1">逝世年份</label>
                    <input 
                      className="w-full border-[#D4C4B0] border rounded-md p-2 outline-none"
                      value={editForm.death_year}
                      onChange={e => setEditForm({...editForm, death_year: e.target.value})}
                      placeholder="如：2020"
                    />
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-[#6B5344] mb-1">简介</label>
                <textarea 
                  className="w-full border-[#D4C4B0] border rounded-md p-2 outline-none"
                  rows="3"
                  value={editForm.bio}
                  onChange={e => setEditForm({...editForm, bio: e.target.value})}
                  placeholder="简要描述生平..."
                />
              </div>

              {/* 关系设置 */}
              <div className="p-3 bg-[#FAF7F2] rounded-lg border border-[#D4C4B0] space-y-2">
                <label className="block text-xs font-bold text-[#8B7355] uppercase mb-1">家族关系设置</label>
                <div className="grid grid-cols-1 gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500 w-12 text-right">父亲:</span>
                    <select 
                      className="flex-1 border-[#D4C4B0] border rounded p-1 text-xs outline-none bg-white"
                      value={editForm.father_id}
                      onChange={e => setEditForm({...editForm, father_id: e.target.value})}
                    >
                      <option value="">(空)</option>
                      {allPersons.map(p => p.gender === '男' && p.id !== person.id && (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500 w-12 text-right">母亲:</span>
                    <select 
                      className="flex-1 border-[#D4C4B0] border rounded p-1 text-xs outline-none bg-white"
                      value={editForm.mother_id}
                      onChange={e => setEditForm({...editForm, mother_id: e.target.value})}
                    >
                      <option value="">(空)</option>
                      {allPersons.map(p => p.gender === '女' && p.id !== person.id && (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500 w-12 text-right">配偶:</span>
                    <select 
                      className="flex-1 border-[#D4C4B0] border rounded p-1 text-xs outline-none bg-white"
                      value={editForm.spouse_id}
                      onChange={e => setEditForm({...editForm, spouse_id: e.target.value})}
                    >
                      <option value="">(无)</option>
                      {allPersons.map(p => p.id !== person.id && (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-6">
                <button 
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="px-4 py-2 text-[#8B7355] hover:text-[#5C3D2E]"
                >
                  取消
                </button>
                <button 
                  type="submit"
                  className="px-6 py-2 bg-[#5C3D2E] text-white rounded-md hover:bg-[#3D281E] transition-colors"
                >
                  保存修改
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default PersonCard;

