import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getStory, patchStory, getPersons, getStoryGenerationStatus } from '../api';
import { useTheme } from '../contexts/ThemeContext';

const StoryDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { themes, getThemeStyle } = useTheme();

  const [story, setStory] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // Tab 切换状态
  const [activeTab, setActiveTab] = useState('story'); // story | transcript | structured
  const [showPolished, setShowPolished] = useState(true); // 润色版 vs 原始转录
  const [generationStatus, setGenerationStatus] = useState(null);
  const pollTimerRef = useRef(null);

  // 编辑表单状态
  const [editTranscript, setEditTranscript] = useState('');
  const [editYear, setEditYear] = useState(null);
  const [editTheme, setEditTheme] = useState('');
  const [editPersonIds, setEditPersonIds] = useState([]);
  const [allPersons, setAllPersons] = useState([]);
  const [personsLoading, setPersonsLoading] = useState(false);

  // 音频播放状态
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const audioRef = useRef(null);

  // 获取故事数据
  useEffect(() => {
    const fetchStory = async () => {
      try {
        const res = await getStory(id);
        setStory(res.data);

        // 轮询生成状态
        if (res.data?.generation_status && res.data.generation_status !== 'done') {
          const pollStatus = async () => {
            try {
              const statusRes = await getStoryGenerationStatus(id);
              setGenerationStatus(statusRes);
              if (statusRes.status === 'done' || statusRes.status === 'failed') {
                // 刷新故事数据
                const storyRes = await getStory(id);
                setStory(storyRes.data);
              } else {
                pollTimerRef.current = setTimeout(pollStatus, 3000);
              }
            } catch (e) {
              console.error('轮询失败:', e);
            }
          };
          pollTimerRef.current = setTimeout(pollStatus, 3000);
        }
      } catch (err) {
        console.error('获取故事失败:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchStory();

    // 清理轮询
    return () => {
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    };
  }, [id]);

  // 打开编辑 Modal
  const openEditModal = async () => {
    if (!story) return;

    // 初始化表单数据
    setEditTranscript(story.transcript || '');
    setEditYear(story.year || null);
    setEditTheme(story.theme || '');
    setEditPersonIds(story.persons?.map(p => p.id) || []);

    // 获取家族成员列表
    setPersonsLoading(true);
    try {
      const res = await getPersons();
      setAllPersons(res.data || []);
    } catch (err) {
      console.error('获取人物列表失败:', err);
    } finally {
      setPersonsLoading(false);
    }

    setIsModalOpen(true);
    setError(null);
  };

  // 关闭 Modal
  const closeModal = () => {
    setIsModalOpen(false);
    setError(null);
  };

  // 切换人物选择
  const togglePerson = (personId) => {
    if (editPersonIds.includes(personId)) {
      // 至少保留一个人物
      if (editPersonIds.length > 1) {
        setEditPersonIds(editPersonIds.filter(id => id !== personId));
      }
    } else {
      setEditPersonIds([...editPersonIds, personId]);
    }
  };

  // 保存编辑
  const handleSave = async () => {
    setSaving(true);
    setError(null);

    try {
      // 构造更新数据
      const updateData = {};

      if (editTranscript !== story.transcript) {
        updateData.transcript = editTranscript;
      }
      if (editYear !== story.year) {
        updateData.year = editYear;
      }
      if (editTheme !== story.theme) {
        updateData.theme = editTheme;
      }
      if (editPersonIds.length > 0) {
        updateData.person_ids = editPersonIds;
      }

      // 调用 API 更新
      await patchStory(id, updateData);

      // 刷新故事数据
      const res = await getStory(id);
      setStory(res.data);

      closeModal();
    } catch (err) {
      console.error('保存失败:', err);
      setError(err.response?.data?.detail || '保存失败，请重试');
    } finally {
      setSaving(false);
    }
  };

  // 音频事件监听
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const onLoadedMetadata = () => setDuration(audio.duration);
    const onEnded = () => setIsPlaying(false);

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('ended', onEnded);

    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('ended', onEnded);
    };
  }, [story?.audio_url]);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
    } else {
      audio.play();
    }
    setIsPlaying(!isPlaying);
  };

  const handleSeek = (e) => {
    const audio = audioRef.current;
    if (!audio || !duration) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    audio.currentTime = percent * duration;
  };

  const formatTime = (seconds) => {
    if (!seconds || isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getThemeInfo = (themeName) => {
    const theme = themes?.find(t => t.name === themeName);
    return theme || { name: themeName, emoji: '📝', color_bg: '#F3F4F6', color_text: '#374151' };
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FAF7F2] flex items-center justify-center">
        <div className="text-[#4A3728]">加载中...</div>
      </div>
    );
  }

  if (!story) {
    return (
      <div className="min-h-screen bg-[#FAF7F2] flex items-center justify-center">
        <div className="text-red-500">故事不存在</div>
      </div>
    );
  }

  const themeInfo = getThemeInfo(story.theme);

  return (
    <div className="min-h-screen bg-[#FAF7F2] flex flex-col">
      {/* 隐藏音频元素 */}
      {story.audio_url && (
        <audio
          ref={audioRef}
          src={story.audio_url}
          preload="metadata"
        />
      )}

      <div className="max-w-[680px] mx-auto w-full px-4 py-6">
        {/* 顶部区域 */}
        <div className="flex items-center justify-between gap-3 mb-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(-1)}
              className="w-10 h-10 rounded-full bg-white flex items-center justify-center shadow-sm hover:shadow"
            >
              <svg className="w-5 h-5 text-[#4A3728]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
              </svg>
            </button>

            {story.year && (
            <span className="text-3xl font-serif text-[#D4A574]">
              {story.year} 年
            </span>
          )}

          {(story.theme || story.decade) && (
            <span
              className="px-3 py-1 rounded-full text-sm shadow-sm"
              style={{ backgroundColor: themeInfo.color_bg, color: themeInfo.color_text }}
            >
              {story.decade && <span className="text-gray-400">{story.decade} </span>}
              <span>{themeInfo.emoji} {story.theme}</span>
            </span>
          )}

          {/* 关联历史事件标签 */}
          {story.related_history && (
            <button
              onClick={() => navigate(`/?highlight_event=${story.related_history_id}`)}
              className="px-3 py-1 rounded-full text-sm bg-[#EEF2F7] text-[#4A3728] hover:underline"
            >
              📜 {story.related_history}
            </button>
          )}

          {/* 编辑按钮 */}
          <button
            onClick={openEditModal}
            className="w-10 h-10 rounded-full bg-white flex items-center justify-center shadow-sm hover:shadow"
          >
            <svg className="w-5 h-5 text-[#D4A574]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a3 3 0 114.243 4.243m-4.836 6.428l4.836 6.428m0 0a3 3 0 105.648-5.648l-3.536 3.536m0 0l3.536-3.536m-3.536 3.536L9.464 5.232" />
            </svg>
          </button>
          </div>
        </div>

        {/* 音频播放器 */}
        {story.audio_url && (
          <div className="bg-white rounded-2xl p-4 mb-6 shadow-sm">
            <div className="flex items-center gap-4">
              {/* 播放按钮 */}
              <button
                onClick={togglePlay}
                className="w-12 h-12 rounded-full bg-[#4A3728] flex items-center justify-center flex-shrink-0 hover:bg-[#5A4738]"
              >
                {isPlaying ? (
                  <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                    <rect x="6" y="4" width="4" height="16" rx="1" />
                    <rect x="14" y="4" width="4" height="16" rx="1" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5 text-white ml-1" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                )}
              </button>

              {/* 进度条和时间 */}
              <div className="flex-1 flex items-center gap-3">
                <span className="text-sm text-gray-400 w-10">{formatTime(currentTime)}</span>

                <div
                  className="flex-1 h-1.5 bg-gray-100 rounded-full cursor-pointer relative"
                  onClick={handleSeek}
                >
                  <div
                    className="absolute left-0 top-0 h-full bg-[#4A3728] rounded-full"
                    style={{ width: `${duration ? (currentTime / duration) * 100 : 0}%` }}
                  />
                </div>

                <span className="text-sm text-gray-400 w-10">{formatTime(duration)}</span>

                {/* 音量图标 */}
                <svg className="w-5 h-5 text-gray-300" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M3 9v6h4l5 5V4l-5 5H3z" />
                  <path d="M16 9a3 3 0 010 6" fill="none" stroke="currentColor" strokeWidth="2" />
                </svg>
              </div>
            </div>
          </div>
        )}

        {/* Tab 切换区域 */}
        <div className="mb-6">
          {/* Tab 标题 */}
          <div className="flex border-b border-gray-200 mb-4">
            <button
              onClick={() => setActiveTab('story')}
              className={`px-4 py-2 text-sm font-medium ${
                activeTab === 'story'
                  ? 'text-[#4A3728] border-b-2 border-[#4A3728]'
                  : 'text-gray-400'
              }`}
            >
              故事
            </button>
            <button
              onClick={() => setActiveTab('transcript')}
              className={`px-4 py-2 text-sm font-medium ${
                activeTab === 'transcript'
                  ? 'text-[#4A3728] border-b-2 border-[#4A3728]'
                  : 'text-gray-400'
              }`}
            >
              对话记录
            </button>
            <button
              onClick={() => setActiveTab('structured')}
              className={`px-4 py-2 text-sm font-medium ${
                activeTab === 'structured'
                  ? 'text-[#4A3728] border-b-2 border-[#4A3728]'
                  : 'text-gray-400'
              }`}
            >
              结构化信息
            </button>
          </div>

          {/* Tab1: 故事（第三层） */}
          {activeTab === 'story' && (
            <div className="bg-white rounded-2xl p-6 shadow-sm">
              {/* 生成进度条 */}
              {generationStatus && generationStatus.status !== 'done' && (
                <div className="mb-4 text-sm text-gray-500">
                  {generationStatus.status === 'generating_layer2' && 'AI 正在提炼结构化信息...'}
                  {generationStatus.status === 'generating_layer3' && 'AI 正在撰写故事文章...'}
                  {generationStatus.status === 'pending' && '故事生成中...'}
                  {generationStatus.status === 'failed' && '故事生成失败'}
                </div>
              )}

              {/* 切换：润色版/原始转录 */}
              <div className="flex justify-end mb-3">
                <button
                  onClick={() => setShowPolished(!showPolished)}
                  className="text-xs text-gray-400 hover:text-gray-600"
                >
                  {showPolished ? '查看原始转录' : '查看润色版'}
                </button>
              </div>

              {/* 内容 */}
              {(showPolished ? story.narrative_polish : story.transcript) ? (
                <p className="font-serif text-[#4A3728] text-lg leading-[1.8] whitespace-pre-wrap">
                  {showPolished ? story.narrative_polish : story.transcript}
                </p>
              ) : (
                <p className="text-gray-400 text-center py-8">故事生成中...</p>
              )}
            </div>
          )}

          {/* Tab2: 对话记录（第一层） */}
          {activeTab === 'transcript' && (
            <div className="bg-white rounded-2xl p-4 shadow-sm">
              {/* 非采访录入的故事 */}
              {!story.source_session_id ? (
                <p className="font-serif text-[#4A3728] text-base leading-relaxed whitespace-pre-wrap">
                  {story.transcript || '暂无对话记录'}
                </p>
              ) : (
                /* 按【第X轮】拆分显示 */
                <div className="space-y-4">
                  {story.transcript?.split('【第').filter(Boolean).map((roundText, i) => {
                    // 解析轮次
                    const roundMatch = roundText.match(/^(\d+)轮】/);
                    const roundNum = roundMatch ? roundMatch[1] : i + 1;
                    const content = roundText.replace(/^\d+轮】/, '');

                    // 尝试拆分问题和回答
                    let question = '';
                    let answer = content;
                    if (content.includes('\n')) {
                      const parts = content.split('\n');
                      question = parts[0];
                      answer = parts.slice(1).join('\n');
                    }

                    return (
                      <div key={i} className="pb-4 border-b border-gray-100 last:border-0">
                        <div className="text-xs text-gray-400 mb-2">第 {roundNum} 轮</div>

                        {/* AI 问题气泡（左侧，灰色） */}
                        {question && (
                          <div className="flex justify-start mb-3">
                            <div className="bg-gray-100 rounded-2xl px-4 py-2 max-w-[80%]">
                              <p className="text-sm text-gray-700">{question}</p>
                            </div>
                          </div>
                        )}

                        {/* 老人回答区（右侧，暖色） */}
                        {answer && (
                          <div className="flex justify-end">
                            <div className="bg-[#FFF8EE] rounded-2xl px-4 py-2 max-w-[80%]">
                              {/* 音频播放器（如果有） */}
                              {/* 转写文字 */}
                              <p className="text-sm text-gray-700 whitespace-pre-wrap">{answer}</p>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {!story.transcript && (
                    <p className="text-gray-400 text-center py-8">暂无对话记录</p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Tab3: 结构化信息（第二层） */}
          {activeTab === 'structured' && (
            <div className="bg-white rounded-2xl p-6 shadow-sm space-y-4">
              {/* 生成中状态 */}
              {(!generationStatus || generationStatus.status !== 'done') && !story.title && !story.summary && (
                <p className="text-gray-400 text-center py-8">结构化信息生成中...</p>
              )}

              {/* 时间范围 */}
              {story.time_range && (
                <div>
                  <h4 className="text-xs text-gray-400 uppercase mb-1">时间范围</h4>
                  <p className="text-gray-700">{story.time_range}</p>
                </div>
              )}

              {/* 核心标签 */}
              {story.tags && (
                <div>
                  <h4 className="text-xs text-gray-400 uppercase mb-1">核心标签</h4>
                  <div className="flex flex-wrap gap-2">
                    {JSON.parse(story.tags || '[]').map((tag, i) => (
                      <span key={i} className="px-3 py-1 bg-[#FEF3C7] text-amber-700 rounded-full text-sm">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* 涉及人物 */}
              {story.involved_people && (
                <div>
                  <h4 className="text-xs text-gray-400 uppercase mb-1">涉及人物</h4>
                  <div className="flex flex-wrap gap-2">
                    {JSON.parse(story.involved_people || '[]').map((person, i) => (
                      <span key={i} className="px-3 py-1 bg-[#DBEAFE] text-blue-700 rounded-full text-sm">
                        {person}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* 核心事件 */}
              {story.key_events && (
                <div>
                  <h4 className="text-xs text-gray-400 uppercase mb-1">核心事件</h4>
                  <ol className="space-y-1 list-decimal list-inside">
                    {JSON.parse(story.key_events || '[]').map((event, i) => (
                      <li key={i} className="text-gray-700">{event}</li>
                    ))}
                  </ol>
                </div>
              )}

              {/* 来源采访 */}
              {story.source_session_id && (
                <div>
                  <h4 className="text-xs text-gray-400 uppercase mb-1">来源采访</h4>
                  <button
                    onClick={() => navigate(`/person/${story.persons?.[0]?.id}?tab=interviews`)}
                    className="text-sm text-[#4A3728] hover:underline"
                  >
                    {story.created_at ? new Date(story.created_at).toLocaleDateString('zh-CN') : ''} ·{' '}
                    {story.transcript?.split('【第').length - 1} 轮对话
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 涉及人物 */}
        {story.persons && story.persons.length > 0 && (
          <div className="mb-6">
            <h3 className="text-xs text-gray-400 uppercase mb-3">故事中的人</h3>
            <div className="flex gap-4">
              {story.persons.map((person) => (
                <div
                  key={person.id}
                  onClick={() => navigate(`/person/${person.id}`)}
                  className="flex flex-col items-center cursor-pointer"
                >
                  {person.avatar_url ? (
                    <img
                      src={person.avatar_url}
                      alt={person.name}
                      className="w-12 h-12 rounded-full object-cover border-2 border-white shadow"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-[#D4A574] text-white flex items-center justify-center text-lg font-medium">
                      {person.name?.charAt(0) || '?'}
                    </div>
                  )}
                  <span className="text-xs text-gray-500 mt-1">{person.name}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 底部信息 */}
        <div className="text-center text-xs text-gray-300">
          {story.created_at && (
            <p>录入于 {new Date(story.created_at).toLocaleDateString('zh-CN')}</p>
          )}
        </div>
      </div>

      {/* 编辑 Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
            {/* Modal 头部 */}
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-xl font-serif text-[#4A3728]">编辑故事</h2>
              <button
                onClick={closeModal}
                className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center"
              >
                <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal 内容 */}
            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              {/* 故事内容 */}
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-2">故事内容</label>
                <textarea
                  value={editTranscript}
                  onChange={(e) => setEditTranscript(e.target.value)}
                  className="w-full h-40 p-3 border border-[#E5DED3] rounded-lg resize-none focus:outline-none focus:border-[#D4A574] font-serif text-[#4A3728] text-base leading-relaxed"
                  placeholder="请输入故事内容..."
                />
              </div>

              {/* 年份标注 */}
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-2">年份标注</label>
                <input
                  type="number"
                  value={editYear || ''}
                  onChange={(e) => setEditYear(e.target.value ? parseInt(e.target.value) : null)}
                  className="w-full px-3 py-2 border border-[#E5DED3] rounded-lg focus:outline-none focus:border-[#D4A574] text-[#4A3728]"
                  placeholder="故事发生在哪一年"
                />
              </div>

              {/* 所属类目 */}
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-2">所属类目</label>
                {personsLoading ? (
                  <div className="text-gray-400 text-sm">加载中...</div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {themes?.map((theme) => {
                      const isSelected = editTheme === theme.name;
                      return (
                        <button
                          key={theme.id}
                          onClick={() => setEditTheme(theme.name)}
                          className={`px-3 py-1.5 rounded-full text-sm transition-colors ${
                            isSelected
                              ? 'text-white'
                              : 'text-gray-600 hover:bg-gray-100'
                          }`}
                          style={{
                            backgroundColor: isSelected
                              ? '#4A3728'
                              : theme.color_bg || '#F3F4F6',
                            color: isSelected
                              ? '#fff'
                              : theme.color_text || '#374151',
                          }}
                        >
                          {theme.emoji} {theme.name}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* 关联人物 */}
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-2">
                  关联人物
                  <span className="text-xs text-gray-400 ml-1">(至少选择一个)</span>
                </label>
                {personsLoading ? (
                  <div className="text-gray-400 text-sm">加载中...</div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {allPersons.map((person) => {
                      const isSelected = editPersonIds.includes(person.id);
                      return (
                        <button
                          key={person.id}
                          onClick={() => togglePerson(person.id)}
                          className={`flex items-center gap-2 px-2 py-1.5 rounded-full text-sm transition-all ${
                            isSelected
                              ? 'bg-[#4A3728] text-white'
                              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                          }`}
                        >
                          {person.avatar_url ? (
                            <img
                              src={person.avatar_url}
                              alt={person.name}
                              className="w-6 h-6 rounded-full object-cover"
                            />
                          ) : (
                            <div
                              className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${
                                isSelected ? 'bg-white/20 text-white' : 'bg-[#D4A574] text-white'
                              }`}
                            >
                              {person.name?.charAt(0) || '?'}
                            </div>
                          )}
                          <span>{person.name}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* 错误提示 */}
              {error && (
                <div className="text-red-500 text-sm text-center py-2 bg-red-50 rounded-lg">
                  {error}
                </div>
              )}
            </div>

            {/* Modal 底部按钮 */}
            <div className="px-6 py-4 border-t border-gray-100 flex gap-3 justify-end">
              <button
                onClick={closeModal}
                className="px-5 py-2 text-gray-500 hover:text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-5 py-2 bg-[#4A3728] text-white rounded-lg hover:bg-[#5A4738] disabled:opacity-50 transition-colors"
              >
                {saving ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StoryDetail;