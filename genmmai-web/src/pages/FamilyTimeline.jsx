import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { getFamilyTimeline, getPersons } from '../api';
import { useTheme, getThemeStyle } from '../contexts/ThemeContext';

// 筛选栏组件
const FilterBar = ({ persons, selectedPersons, setSelectedPersons, yearRange, setYearRange }) => {
  const { themes, getThemeStyle } = useTheme();
  const [selectedThemes, setSelectedThemes] = useState([]);

  // 初始化选中所有主题
  useEffect(() => {
    if (themes && themes.length > 0 && selectedThemes.length === 0) {
      setSelectedThemes(themes.map(t => t.name));
    }
  }, [themes]);

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
            onClick={() => selectedThemes.length === themes.length ? setSelectedThemes([]) : setSelectedThemes(themes.map(t => t.name))}
            className="text-xs text-[#C9A84C] underline"
          >
            {selectedThemes.length === themes.length ? '取消全选' : '全选'}
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {themes.map(theme => {
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
            value={yearRange[0]}
            onChange={(e) => setYearRange([e.target.value ? parseInt(e.target.value) : null, yearRange[1]])}
          />
          <span className="text-gray-400">-</span>
          <input
            type="number"
            className="w-20 border border-[#D4C4B0] rounded px-2 py-1 text-sm"
            placeholder="2000"
            value={yearRange[1]}
            onChange={(e) => setYearRange([yearRange[0], e.target.value ? parseInt(e.target.value) : null])}
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
            const options = Array.from(e.target.selectedOptions, opt => opt.value);
            setSelectedPersons(options);
          }}
        >
          {persons.map(p => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        {selectedPersons.length > 0 && (
          <span className="ml-2 text-xs text-[#C9A84C]">已选 {selectedPersons.length} 人</span>
        )}
      </div>
    </div>
  );
};

// 故事卡片组件
const StoryCard = ({ story, onClick }) => {
  const { themes, getThemeStyle } = useTheme();
  const navigate = useNavigate();
  const themeStyle = getThemeStyle(themes, story.theme);

  return (
    <div
      className="p-3 bg-white rounded-lg border border-[#E5DED3] hover:border-[#C9A84C] transition-colors cursor-pointer"
      onClick={() => navigate(`/story/${story.id}`)}
    >
      {/* 主题标签 */}
      <div className="flex items-center justify-between mb-2">
        <span
          className="text-xs px-2 py-0.5 rounded-full"
          style={{ backgroundColor: themeStyle.bg, color: themeStyle.text }}
        >
          {themeStyle.emoji} {story.theme}
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

// 时间轴分组组件
const YearGroup = ({ year, stories }) => {
  return (
    <div className="mb-6">
      {/* 年份标题 */}
      <div className="flex items-center mb-3">
        <div className="w-20 text-2xl font-bold text-[#C9A84C]">
          {year || '年代不详'}
        </div>
        <div className="flex-1 h-px bg-[#E5DED3]" />
      </div>

      {/* 故事卡片列表 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pl-20">
        {stories.map(story => (
          <StoryCard key={story.id} story={story} />
        ))}
      </div>
    </div>
  );
};

// 主组件
const FamilyTimeline = () => {
  const [stories, setStories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [persons, setPersons] = useState([]);

  // 筛选状态
  const [selectedPersons, setSelectedPersons] = useState([]);
  const [yearRange, setYearRange] = useState([null, null]);

  // 加载数据
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [timelineRes, personsRes] = await Promise.all([
          getFamilyTimeline(),
          getPersons()
        ]);
        setStories(timelineRes.data || []);
        setPersons(personsRes.data || []);
      } catch (e) {
        console.error('加载失败:', e);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  // 按年份分组
  const groupedStories = useMemo(() => {
    const grouped = {};
    const noYear = [];

    stories.forEach(story => {
      if (!story.year) {
        noYear.push(story);
      } else {
        const year = story.year;
        if (!grouped[year]) grouped[year] = [];
        grouped[year].push(story);
      }
    });

    // 按年份排序
    const years = Object.keys(grouped).map(Number).sort((a, b) => a - b);

    return { years, grouped, noYear };
  }, [stories]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40">
        <div className="text-[#8B7355]">加载中...</div>
      </div>
    );
  }

  return (
    <div>
      {/* 筛选栏 */}
      <FilterBar
        persons={persons}
        selectedPersons={selectedPersons}
        setSelectedPersons={setSelectedPersons}
        yearRange={yearRange}
        setYearRange={setYearRange}
      />

      {/* 时间轴内容 */}
      <div className="p-4">
        {stories.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-4xl mb-4">📖</div>
            <p className="text-[#8B7355] mb-2">还没有任何故事</p>
            <p className="text-sm text-gray-500">去给家族成员录制故事吧</p>
          </div>
        ) : (
          <>
            {groupedStories.years.map(year => (
              <YearGroup key={year} year={year} stories={groupedStories.grouped[year]} />
            ))}
            {groupedStories.noYear.length > 0 && (
              <YearGroup year={null} stories={groupedStories.noYear} />
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default FamilyTimeline;