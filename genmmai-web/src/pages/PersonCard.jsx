import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getPerson, getPersonStories, getPersonStoryThemes } from '../api';

// 主题颜色映射
const THEME_COLORS = {
  '家乡记忆': { bg: '#DCFCE7', text: '#166534', emoji: '🏠' },  // 绿色
  '工作岁月': { bg: '#DBEAFE', text: '#1E40AF', emoji: '💼' },  // 蓝色
  '爱情婚姻': { bg: '#FCE7F9', text: '#9D174D', emoji: '💕' },  // 粉色
  '历史亲历': { bg: '#FEF9C3', text: '#854D0E', emoji: '📜' },  // 黄色
  '家族传承': { bg: '#166534', text: '#FFFFFF', emoji: '🌳' },  // 深绿
  '童年往事': { bg: '#FFEDD5', text: '#9A3412', emoji: '🧒' },  // 橙色
  '其他': { bg: '#F3F4F6', text: '#374151', emoji: '📝' },  // 灰色
};

const getThemeStyle = (theme) => {
  const key = theme || '其他';
  return THEME_COLORS[key] || THEME_COLORS['其他'];
};

const Timeline = ({ stories, person, onStoryClick }) => {
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

  // 按 year 排序（null 值排最后）
  const sortedStories = [...stories].sort((a, b) => {
    if (!a.year) return 1;
    if (!b.year) return -1;
    return a.year - b.year;
  });

  return (
    <div className="relative pl-4">
      {/* 顶部起点 */}
      <div className="flex items-center mb-4">
        <div className="w-2 h-2 rounded-full bg-[#4A3728] mr-3" />
        <span className="text-sm font-bold text-[#D4A574]">{birthYear}</span>
      </div>

      {/* 竖线 */}
      <div className="absolute left-[calc(0.5rem+3px)] top-6 bottom-6 w-0.5 bg-[#E8DDD0]" />

      {/* 故事节点 */}
      <div className="space-y-6">
        {sortedStories.map((story, index) => {
          const themeStyle = getThemeStyle(story.theme);
          return (
            <div
              key={story.id}
              className="relative pl-6 cursor-pointer group"
              onClick={() => onStoryClick(story.id)}
            >
              {/* 节点圆点 */}
              <div className="absolute left-0 top-1 w-2 h-2 rounded-full bg-[#4A3728]" />

              {/* 内容 */}
              <div>
                {/* 年份 */}
                <div className="text-sm font-bold text-[#D4A574]">
                  {story.year || '未知年份'}
                </div>

                {/* 主题标签 */}
                <div
                  className="inline-block px-2 py-0.5 rounded-full text-xs mt-1"
                  style={{ backgroundColor: themeStyle.bg, color: themeStyle.text }}
                >
                  {themeStyle.emoji} {story.theme || '其他'}
                </div>

                {/* 摘要 */}
                <p className="text-sm text-[#4A3728] mt-1 group-hover:opacity-70">
                  {story.summary || story.transcript?.slice(0, 50) || '暂无摘要'}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* 底部终点 */}
      <div className="flex items-center mt-4">
        <div className="w-2 h-2 rounded-full bg-[#4A3728] mr-3" />
        <span className="text-sm font-bold text-[#D4A574]">
          {deathYear ? `${deathYear}` : '至今'}
        </span>
      </div>
    </div>
  );
};

// 主题顺序
const THEMES_ORDER = [
  '家乡记忆', '工作岁月', '爱情婚姻', '历史亲历',
  '家族传承', '童年往事', '其他'
];

const ThemeStories = ({ themes, stories, onStoryClick }) => {
  const [expandedTheme, setExpandedTheme] = useState(null);

  // 将 themes 数据转换为按顺序排列
  const orderedThemes = THEMES_ORDER.map(themeName => {
    const themeData = themes.find(t => t.theme === themeName);
    return {
      name: themeName,
      count: themeData?.count || 0,
    };
  });

  const toggleTheme = (themeName) => {
    setExpandedTheme(prev => prev === themeName ? null : themeName);
  };

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
              onClick={() => hasStories && toggleTheme(name)}
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

            {/* 展开的故事列表 */}
            {isExpanded && themeStories.length > 0 && (
              <div className="mt-2 space-y-2 pl-2">
                {themeStories.map(story => (
                  <div
                    key={story.id}
                    className="flex items-start gap-2 p-2 bg-white rounded border border-[#E5DED3] cursor-pointer hover:bg-gray-50"
                    onClick={() => onStoryClick(story.id)}
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

const PersonCard = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [person, setPerson] = useState(null);
  const [stories, setStories] = useState([]);
  const [themes, setThemes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('timeline');

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [personRes, storiesRes, themesRes] = await Promise.all([
          getPerson(id),
          getPersonStories(id),
          getPersonStoryThemes(id),
        ]);
        setPerson(personRes.data);
        setStories(storiesRes.data);
        setThemes(themesRes.data);
      } catch (error) {
        console.error('获取数据失败:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [id]);

  const handleEdit = () => {
    alert('编辑');
  };

  const getNameInitial = (name) => {
    return name ? name.charAt(0) : '?';
  };

  const formatYears = (birthYear, deathYear) => {
    if (birthYear) {
      if (deathYear) {
        return `${birthYear} - ${deathYear}`;
      }
      return `${birthYear}+`;
    }
    return '';
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
      {/* Header 区域 - 白色卡片带浅棕色底边线 */}
      <div className="bg-white border-b border-[#E5DED3] pb-6 pt-4 px-4">
        <div className="max-w-md mx-auto">
          {/* 返回按钮和编辑按钮行 */}
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

          {/* 头像区域 */}
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

            {/* 姓名 */}
            <h1 className="mt-4 text-2xl font-bold text-[#4A3728]">
              {person?.name || '未知'}
            </h1>

            {/* 生卒年 */}
            <p className="mt-1 text-sm text-gray-500">
              {formatYears(person?.birth_year, person?.death_year)}
            </p>

            {/* 一句话简介 */}
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
          {activeTab === 'relations' && (
            <p className="text-gray-500">人际关系图（开发中）</p>
          )}
          {activeTab === 'timeline' && (
            <Timeline
              stories={stories}
              person={person}
              onStoryClick={(storyId) => navigate(`/story/${storyId}`)}
            />
          )}
          {activeTab === 'stories' && (
            <ThemeStories
              themes={themes}
              stories={stories}
              onStoryClick={(storyId) => navigate(`/story/${storyId}`)}
            />
          )}
        </div>
      </div>

      {/* 右下角固定 "+" 按钮 */}
      <button
        onClick={() => navigate(`/record?personId=${id}`)}
        className="fixed bottom-8 right-8 w-12 h-12 rounded-full bg-[#4A3728] text-white text-2xl flex items-center justify-center shadow-lg hover:bg-[#5A4738] transition-colors"
      >
        +
      </button>
    </div>
  );
};

export default PersonCard;