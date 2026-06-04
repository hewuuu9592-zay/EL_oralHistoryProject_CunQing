import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { getFamilyTimeline, getPersons, getThemes, getHistoricalEvents, createEventMemory, getEventStories } from '../api';
import { useTheme, getThemeStyle } from '../contexts/ThemeContext';

const CATEGORY_ICONS = {
  '政治': '🏛️',
  '经济': '💰',
  '社会': '👥',
  '文化': '🎭',
  '战争': '⚔️',
  '科技': '🔬',
  '外交': '🌍',
  '教育': '📚',
  '体育': '🏅',
  '军事': '🪖',
  '国际': '🌐',
};

// 筛选栏组件
const FilterBar = ({
  persons,
  selectedPersons,
  setSelectedPersons,
  yearRange,
  setYearRange,
  selectedThemes,
  setSelectedThemes,
  themes,
  getThemeStyle,
}) => {
  const toggleTheme = (theme) => {
    if (selectedThemes.includes(theme)) {
      setSelectedThemes(selectedThemes.filter(t => t !== theme));
    } else {
      setSelectedThemes([...selectedThemes, theme]);
    }
  };

  const togglePerson = (pid) => {
    if (selectedPersons.includes(pid)) {
      setSelectedPersons(selectedPersons.filter(p => p !== pid));
    } else {
      setSelectedPersons([...selectedPersons, pid]);
    }
  };

  if (!themes || themes.length === 0) return null;

  return (
    <div className="p-4 bg-white border-b border-[#E5DED3] space-y-3">
      {/* 主题多选 */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <span className="text-sm text-[#8B7355]">主题：</span>
          <button
            onClick={() =>
              selectedThemes.length === themes.length
                ? setSelectedThemes([])
                : setSelectedThemes(themes.map((t) => t.name))
            }
            className="text-xs text-[#C9A84C] underline"
          >
            {selectedThemes.length === themes.length ? '取消全选' : '全选'}
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {themes.map((theme) => {
            const style = getThemeStyle(themes, theme.name);
            const isSelected = selectedThemes.includes(theme.name);
            return (
              <button
                key={theme.name}
                onClick={() => toggleTheme(theme.name)}
                className={`px-3 py-1 rounded-full text-sm transition-colors ${
                  isSelected ? 'ring-2 ring-[#C9A84C]' : ''
                }`}
                style={{ backgroundColor: style.bg, color: style.text }}
              >
                {style.emoji} {theme.name}
              </button>
            );
          })}
        </div>
      </div>

      {/* 年代范围 */}
      <div className="flex items-center gap-4">
        <span className="text-sm text-[#8B7355]">年代：</span>
        <div className="flex items-center gap-2">
          <input
            type="number"
            className="w-20 border border-[#D4C4B0] rounded px-2 py-1 text-sm"
            placeholder="1900"
            value={yearRange[0] || ''}
            onChange={(e) =>
              setYearRange([
                e.target.value ? parseInt(e.target.value) : null,
                yearRange[1],
              ])
            }
          />
          <span className="text-gray-400">-</span>
          <input
            type="number"
            className="w-20 border border-[#D4C4B0] rounded px-2 py-1 text-sm"
            placeholder="2000"
            value={yearRange[1] || ''}
            onChange={(e) =>
              setYearRange([
                yearRange[0],
                e.target.value ? parseInt(e.target.value) : null,
              ])
            }
          />
        </div>
      </div>

      {/* 人物多选 */}
      <div>
        <span className="text-sm text-[#8B7355] mr-2">人物：</span>
        <select
          multiple
          className="border border-[#D4C4B0] rounded px-2 py-1 text-sm min-h-[80px]"
          onChange={(e) => {
            const options = Array.from(e.target.selectedOptions, (opt) => opt.value);
            setSelectedPersons(options);
          }}
        >
          {persons.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        {selectedPersons.length > 0 && (
          <span className="ml-2 text-xs text-[#C9A84C]">
            已选 {selectedPersons.length} 人
          </span>
        )}
      </div>
    </div>
  );
};

const EVENT_CATEGORY_ICONS = {
  '政治': '🏛️',
  '经济': '💰',
  '社会': '👥',
  '文化': '🎭',
  '战争': '⚔️',
  '科技': '🔬',
  '外交': '🌍',
  '教育': '📚',
  '体育': '🏅',
  '军事': '🪖',
  '国际': '🌐',
};

// 故事卡片组件
const StoryCard = ({ story }) => {
  const navigate = useNavigate();

  return (
    <div
      className="p-3 bg-white rounded-lg border border-[#E5DED3] hover:border-[#C9A84C] shadow-sm hover:shadow transition-all cursor-pointer"
      onClick={() => navigate(`/story/${story.id}`)}
    >
      {/* 主题标签 */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs px-2 py-0.5 rounded-full bg-[#FAF7F2] text-[#4A3728]">
          {story.theme}
        </span>
        {story.audio_url && (
          <span className="text-[#C9A84C]">🔊</span>
        )}
      </div>

      {/* 摘要 */}
      <p className="text-sm text-[#4A3728] line-clamp-2 mb-2">
        {story.summary || story.transcript?.slice(0, 50) || '暂无摘要'}
      </p>

      {/* 涉及人物头像 */}
      {story.persons && story.persons.length > 0 && (
        <div className="flex -space-x-2">
          {story.persons.slice(0, 5).map((person, idx) => (
            <div
              key={person.id || idx}
              className="w-6 h-6 rounded-full bg-[#C9A84C] border-2 border-white flex items-center justify-center overflow-hidden"
              title={person.name}
            >
              {person.avatar_url ? (
                <img src={person.avatar_url} alt={person.name} className="w-full h-full object-cover" />
              ) : (
                <span className="text-white text-xs font-bold">{person.name?.charAt(0)}</span>
              )}
            </div>
          ))}
          {story.persons.length > 5 && (
            <div className="w-6 h-6 rounded-full bg-[#8B7355] border-2 border-white flex items-center justify-center">
              <span className="text-white text-xs">+{story.persons.length - 5}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// 历史事件卡片组件
const HistoryEventCard = ({ event, onAddMemory }) => {
  const [showInput, setShowInput] = useState(false);
  const [content, setContent] = useState('');
  const [showRelatedStories, setShowRelatedStories] = useState(false);
  const [relatedStories, setRelatedStories] = useState([]);
  const [loadingStories, setLoadingStories] = useState(false);

  const handleSubmit = () => {
    if (content.trim()) {
      onAddMemory(event.id, content);
      setContent('');
      setShowInput(false);
    }
  };

  // 加载关联故事
  const loadRelatedStories = async () => {
    if (relatedStories.length > 0) {
      setShowRelatedStories(!showRelatedStories);
      return;
    }
    setLoadingStories(true);
    try {
      const res = await getEventStories(event.id);
      setRelatedStories(res.data || []);
      setShowRelatedStories(true);
    } catch (e) {
      console.error('加载关联故事失败:', e);
    } finally {
      setLoadingStories(false);
    }
  };

  const icon = EVENT_CATEGORY_ICONS[event.category] || '📌';
  const isLarge = event.importance === 3;

  return (
    <div
      className={`p-3 bg-[#F0F4F8] rounded-lg border border-gray-300 hover:border-gray-400 transition-all ${
        isLarge ? 'w-52' : 'w-44'
      }`}
    >
      {/* 标题和图标 */}
      <div className="flex items-start gap-2 mb-1">
        <span className="text-lg">{icon}</span>
        <div className={`text-[#4A3728] ${isLarge ? 'font-bold' : 'font-medium'}`}>
          {event.title}
        </div>
      </div>

      {/* 年份 */}
      <div className="text-xs text-gray-500 mb-1">{event.year} 年</div>

      {/* 描述 */}
      {event.description && (
        <p className="text-xs text-gray-600 line-clamp-2 mb-2">{event.description}</p>
      )}

      {/* 关联故事入口 */}
      <button
        onClick={loadRelatedStories}
        className="text-xs text-[#5C3D2E] hover:underline mr-2"
      >
        本家族有相关记忆 📖
      </button>

      {/* 按钮区 */}
      <div className="flex gap-2 mt-1">
        <button
          onClick={() => setShowInput(!showInput)}
          className="text-xs text-[#5C3D2E] hover:underline"
        >
          + 记录亲历
        </button>
      </div>

      {/* 关联故事列表 */}
      {showRelatedStories && (
        <div className="mt-2 pt-2 border-t border-gray-200">
          {loadingStories ? (
            <div className="text-xs text-gray-400">加载中...</div>
          ) : relatedStories.length > 0 ? (
            <div className="space-y-2">
              {relatedStories.map((story) => (
                <div
                  key={story.id}
                  className="p-2 bg-white rounded border border-gray-200 text-xs cursor-pointer hover:border-[#C9A84C]"
                  onClick={() => navigate(`/story/${story.id}`)}
                >
                  <div className="font-medium text-[#4A3728] line-clamp-1">
                    {story.summary || story.transcript?.slice(0, 30) || '暂无'}...
                  </div>
                  {story.year && (
                    <span className="text-gray-400">{story.year}年</span>
                  )}
                  {story.persons && story.persons.length > 0 && (
                    <span className="text-gray-400 ml-2">
                      👤 {story.persons.map(p => p.name).join('、')}
                    </span>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-xs text-gray-400">暂无关联故事</div>
          )}
        </div>
      )}

      {/* 快速录入框 */}
      {showInput && (
        <div className="mt-2 space-y-2">
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="写下你的亲历回忆..."
            className="w-full text-xs p-2 border border-gray-300 rounded resize-none"
            rows={2}
          />
          <div className="flex gap-2">
            <button
              onClick={handleSubmit}
              className="flex-1 text-xs py-1 bg-[#5C3D2E] text-white rounded hover:bg-[#4A3020]"
            >
              保存
            </button>
            <button
              onClick={() => setShowInput(false)}
              className="flex-1 text-xs py-1 border border-gray-300 rounded hover:bg-gray-100"
            >
              取消
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// 连接线组件
const ConnectionLine = ({ fromYear, toYear, totalYears }) => {
  if (Math.abs(fromYear - toYear) > 3) return null;

  const distance = Math.abs(fromYear - toYear) / totalYears * 100;
  if (distance < 3) return null;

  return (
    <div
      className="absolute w-12 h-px border-t border-dashed border-gray-300 opacity-30 hover:opacity-60 transition-opacity"
      style={{
        left: `calc(25% - ${distance / 2}px)`,
        top: '50%',
      }}
    />
  );
};

// 时间轴标记组件
const TimelineAxis = ({ yearFrom, yearTo }) => {
  const years = [];
  for (let y = Math.ceil(yearFrom / 10) * 10; y <= yearTo; y += 10) {
    years.push(y);
  }

  return (
    <div className="absolute left-0 top-0 bottom-0 w-1/4 pointer-events-none">
      {years.map((year) => (
        <div
          key={year}
          className="absolute -translate-x-1/2 text-xs font-bold text-[#5C3D2E]"
          style={{
            top: ((year - yearFrom) / (yearTo - yearFrom)) * 100 + '%',
          }}
        >
          {year}
        </div>
      ))}
    </div>
  );
};

// 主组件
const FamilyTimeline = () => {
  const navigate = useNavigate();
  const [stories, setStories] = useState([]);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [persons, setPersons] = useState([]);
  const [themes, setThemes] = useState([]);

  // 筛选状态
  const [yearRange, setYearRange] = useState([null, null]);
  const [selectedPersons, setSelectedPersons] = useState([]);
  const [selectedThemes, setSelectedThemes] = useState([]);

  // 加载数据
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [timelineRes, personsRes, themesRes] = await Promise.all([
          getFamilyTimeline(),
          getPersons(),
          getThemes(),
        ]);
        const familyStories = timelineRes.data || [];
        setStories(familyStories);
        setPersons(personsRes.data || []);
        setThemes(themesRes.data || []);
        setSelectedThemes(themesRes.data?.map(t => t.name) || []);

        // 确定年份范围
        const storyYears = familyStories
          .map(s => s.year)
          .filter(y => y && y > 1800 && y < 2030);

        let minYear = storyYears.length > 0 ? Math.min(...storyYears) : 1950;
        let maxYear = storyYears.length > 0 ? Math.max(...storyYears) : 2025;

        minYear = minYear - 10;
        maxYear = maxYear + 5;

        setYearRange([minYear, maxYear]);

        // 加载历史事件
        try {
          const eventsRes = await getHistoricalEvents(minYear, maxYear);
          setEvents(eventsRes.data || []);
        } catch (e) {
          console.error('加载历史事件失败:', e);
          setEvents([]);
        }
      } catch (e) {
        console.error('加载失败:', e);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  // 过滤家族故事
  const filteredStories = useMemo(() => {
    let filtered = stories;

    if (yearRange[0]) {
      filtered = filtered.filter(s => s.year >= yearRange[0]);
    }
    if (yearRange[1]) {
      filtered = filtered.filter(s => !s.year || s.year <= yearRange[1]);
    }
    if (selectedThemes.length > 0) {
      filtered = filtered.filter(s => s.theme && selectedThemes.includes(s.theme));
    }
    if (selectedPersons.length > 0) {
      filtered = filtered.filter(s =>
        s.persons?.some(p => selectedPersons.includes(p.id))
      );
    }

    return filtered;
  }, [stories, yearRange, selectedThemes, selectedPersons]);

  // 合并时间轴数据
  const timelineData = useMemo(() => {
    const items = [];
    const yearFrom = yearRange[0] || 1950;
    const yearTo = yearRange[1] || 2025;

    // 添加家族故事
    filteredStories.forEach(story => {
      if (story.year) {
        items.push({
          type: 'story',
          year: story.year,
          data: story,
        });
      }
    });

    // 添加历史事件
    events.forEach(event => {
      if (event.year >= yearFrom && event.year <= yearTo) {
        items.push({
          type: 'event',
          year: event.year,
          data: event,
        });
      }
    });

    // 按年份排序
    items.sort((a, b) => a.year - b.year);

    return items;
  }, [filteredStories, events, yearRange]);

  // 添加亲历记录
  const handleAddMemory = async (eventId, content) => {
    try {
      await createEventMemory(eventId, { content });
      alert('保存成功');
    } catch (e) {
      console.error('保存失败:', e);
      alert('保存失败');
    }
  };

  // 计算年份范围变量
  const yearFrom = yearRange[0] || 1950;
  const yearTo = yearRange[1] || 2025;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40">
        <div className="text-[#8B7355]">加载中...</div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen bg-[#FAF7F2]">
      {/* 筛选栏 */}
      <FilterBar
        persons={persons}
        selectedPersons={selectedPersons}
        setSelectedPersons={setSelectedPersons}
        yearRange={yearRange}
        setYearRange={setYearRange}
        selectedThemes={selectedThemes}
        setSelectedThemes={setSelectedThemes}
        themes={themes}
        getThemeStyle={getThemeStyle}
      />

      {/* 时间轴内容 */}
      <div className="p-4">
        {timelineData.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-4xl mb-4">📖</div>
            <p className="text-[#8B7355] mb-2">还没有任何故事</p>
            <p className="text-sm text-gray-500">去给家族成员录制故事吧</p>
          </div>
        ) : (
          <div className="relative">
            {/* 轴线 */}
            <div
              className="absolute left-1/3 top-0 bottom-0 w-0.5 bg-[#5C3D2E]"
              style={{ transform: 'translateX(-50%)' }}
            />

            {/* 年份标记 */}
            <div className="relative mb-4">
              {Array.from(
                { length: Math.ceil((yearTo - yearFrom) / 10) + 1 },
                (_, i) => yearFrom + i * 10
              ).map((year) => {
                const topPct = ((year - yearFrom) / (yearTo - yearFrom)) * 100;
                return (
                  <div
                    key={year}
                    className="absolute text-xs font-bold text-[#5C3D2E] -left-10"
                    style={{ top: `${topPct}%` }}
                  >
                    {year}
                  </div>
                );
              })}
            </div>

            {/* 卡片列表-历史卡片和故事卡片 */}
            <div className="space-y-3 ml-8">
              {timelineData.map((item, idx) => {
                if (item.type === 'event') {
                  return (
                    <div
                      key={`event-${item.data.id}`}
                      className="relative flex justify-end"
                      style={{ width: '30%', justifyContent: 'flex-end', paddingRight: '16px' }}
                    >
                      <HistoryEventCard
                        event={item.data}
                        onAddMemory={handleAddMemory}
                      />
                    </div>
                  );
                } else {
                  return (
                    <div
                      key={`story-${item.data.id}`}
                      className="relative"
                      style={{ marginLeft: '33.33%', maxWidth: '60%' }}
                    >
                      <StoryCard story={item.data} />
                    </div>
                  );
                }
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default FamilyTimeline;