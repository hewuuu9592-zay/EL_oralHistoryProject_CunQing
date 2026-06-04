import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { getFamilyTimeline, getPersons, getThemes } from '../api';
import { getThemeStyle } from '../contexts/ThemeContext';

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

  const handleSubmit = () => {
    if (content.trim()) {
      onAddMemory(event.id, content);
      setContent('');
      setShowInput(false);
    }
  };

  const icon = CATEGORY_ICONS[event.category] || '📌';
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

      {/* 亲历记录入口 */}
      <button
        onClick={() => setShowInput(!showInput)}
        className="text-xs text-[#5C3D2E] hover:underline"
      >
        + 记录亲历
      </button>

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

// 筛选栏组件
const FilterBar = ({ yearFrom, yearTo, setYearFrom, setYearTo }) => {
  return (
    <div className="p-3 bg-white border-b border-[#E5DED3] flex items-center gap-4">
      <span className="text-sm text-[#8B7355]">年代范围：</span>
      <input
        type="number"
        className="w-20 border border-[#D4C4B0] rounded px-2 py-1 text-sm"
        placeholder="1900"
        value={yearFrom || ''}
        onChange={(e) => setYearFrom(e.target.value ? parseInt(e.target.value) : null)}
      />
      <span className="text-gray-400">-</span>
      <input
        type="number"
        className="w-20 border border-[#D4C4B0] rounded px-2 py-1 text-sm"
        placeholder="2025"
        value={yearTo || ''}
        onChange={(e) => setYearTo(e.target.value ? parseInt(e.target.value) : null)}
      />
      <span className="text-sm text-gray-400 ml-auto">
        共 {yearFrom || '?'} - {yearTo || '?'} 年
      </span>
    </div>
  );
};

// 主组件
const FamilyTimeline = () => {
  const navigate = useNavigate();
  const [stories, setStories] = useState([]);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  // 筛选状态
  const [yearFrom, setYearFrom] = useState(null);
  const [yearTo, setYearTo] = useState(null);

  // 加载数据
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [timelineRes] = await Promise.all([
          getFamilyTimeline(),
        ]);
        const familyStories = timelineRes.data || [];

        // 确定年份范围
        const storyYears = familyStories
          .map(s => s.year)
          .filter(y => y && y > 1800 && y < 2030);

        let minYear = Math.min(...storyYears);
        let maxYear = Math.max(...storyYears);

        // 如果没有故事，设置默认范围
        if (!minYear) minYear = 1950;
        if (!maxYear) maxYear = 2025;

        minYear = minYear - 10;
        maxYear = maxYear + 5;

        setYearFrom(minYear);
        setYearTo(maxYear);
        setStories(familyStories);

        // 加载历史事件
        try {
          const eventsRes = await fetch(
            `http://localhost:8000/historical-events?year_from=${minYear}&year_to=${maxYear}`
          ).then(r => r.json());
          setEvents(eventsRes || []);
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

  // 合并时间轴数据
  const timelineData = useMemo(() => {
    const items = [];

    // 添加家族故事
    stories.forEach(story => {
      if (story.year && story.year >= yearFrom && story.year <= yearTo) {
        items.push({
          type: 'story',
          year: story.year,
          data: story,
        });
      }
    });

    // 添加历史事件
    events.forEach(event => {
      if (event.year && event.year >= yearFrom && event.year <= yearTo) {
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
  }, [stories, events, yearFrom, yearTo]);

  // 添加亲历记录
  const handleAddMemory = async (eventId, content) => {
    try {
      await fetch(`/historical-events/${eventId}/memories`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });
      alert('保存成功');
    } catch (e) {
      console.error('保存失败:', e);
      alert('保存失败');
    }
  };

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
        yearFrom={yearFrom}
        yearTo={yearTo}
        setYearFrom={setYearFrom}
        setYearTo={setYearTo}
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