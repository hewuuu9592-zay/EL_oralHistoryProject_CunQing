import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getStory, patchStory, getPersons, getStoryGenerationStatus, deleteStory, getSessionRounds, regeneratePolishing, retagStory } from '../api';

const StoryDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  const [story, setStory] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState(null);

  // Tab 切换状态
  const [activeTab, setActiveTab] = useState('story'); // story | transcript | structured
  const [showPolished, setShowPolished] = useState(true); // 润色版 vs 原始转录
  const [generationStatus, setGenerationStatus] = useState(null);
  const pollTimerRef = useRef(null);

  // 编辑模式状态
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  // Tab1 编辑状态 - narrative_polish
  const [editNarrativePolish, setEditNarrativePolish] = useState('');

  // Tab2 编辑状态 - 对话记录轮次
  const [editRounds, setEditRounds] = useState([]);
  const [roundsLoading, setRoundsLoading] = useState(false);

  // Tab3 编辑状态 - 结构化信息
  const [editStructured, setEditStructured] = useState({
    title: '',
    summary: '',
    year: '',
    decade: '',
    theme: '',
    tags: '',
    involved_people: '',
    key_events: '',
    time_range: '',
  });

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

        // 初始化编辑状态
        setEditNarrativePolish(res.data.narrative_polish || '');

        // 轮询生成状态（只对pending/生成中状态轮询）
        if (res.data?.generation_status && !['done', 'failed'].includes(res.data.generation_status)) {
          const pollStatus = async () => {
            try {
              const statusRes = await getStoryGenerationStatus(id);
              const status = statusRes.data;
              setGenerationStatus(status);
              if (status.status === 'done' || status.status === 'failed') {
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

  // 初始化编辑模式
  useEffect(() => {
    if (!story) return;

    if (activeTab === 'story') {
      setEditNarrativePolish(story.narrative_polish || '');
    } else if (activeTab === 'transcript') {
      loadRounds();
    } else if (activeTab === 'structured') {
      setEditStructured({
        title: story.title || '',
        summary: story.summary || '',
        year: story.year || '',
        decade: story.decade || '',
        theme: story.theme || '',
        tags: story.tags || '[]',
        involved_people: story.involved_people || '[]',
        key_events: story.key_events || '[]',
        time_range: story.time_range || '',
      });
    }
  }, [story, activeTab, isEditing]);

  // 加载对话轮次
  const loadRounds = async () => {
    setRoundsLoading(true);
    try {
      let rounds = [];
      if (story?.source_session_id) {
        // 有采访会话，从API加载
        const res = await getSessionRounds(story.source_session_id);
        rounds = res.data || [];
      } else if (story?.transcript) {
        // 无采访会话，从 transcript 字段解析
        const blocks = story.transcript.split('\n\n').filter(b => b.trim());
        rounds = blocks.map((transcript, i) => ({
          id: `manual-${i}`,
          round_index: i,
          transcript,
          question: '',
        }));
      }
      setEditRounds(rounds);
    } catch (err) {
      console.error('加载对话轮次失败:', err);
    } finally {
      setRoundsLoading(false);
    }
  };

  // 切换编辑模式
  const toggleEdit = () => {
    if (isEditing) {
      // 取消编辑，回复原始数据
      setIsEditing(false);
    } else {
      // 进入编辑模式
      setIsEditing(true);
    }
  };

  // 保存编辑
  const handleSave = async () => {
    setSaving(true);
    setError(null);

    try {
      if (activeTab === 'story') {
        // Tab1: 根据当前视图决定保存到哪个字段
        if (showPolished) {
          // 润色版视图 → 保存到 narrative_polish
          await patchStory(id, { narrative_polish: editNarrativePolish });
        } else {
          // 原始转录视图 → 保存到 transcript
          await patchStory(id, { transcript: editNarrativePolish });
        }
        // 立即刷新
        const res = await getStory(id);
        setStory(res.data);
      } else if (activeTab === 'transcript') {
        // Tab2: 保存对话轮次
        await patchStory(id, { transcript: editRounds.map(r => r.transcript).join('\n\n') });
        // 立即刷新
        const res = await getStory(id);
        setStory(res.data);
      } else if (activeTab === 'structured') {
        // Tab3: 保存结构化信息
        await patchStory(id, {
          title: editStructured.title || null,
          summary: editStructured.summary || null,
          year: editStructured.year ? parseInt(editStructured.year) : null,
          decade: editStructured.decade || null,
          theme: editStructured.theme || null,
          tags: editStructured.tags,
          involved_people: editStructured.involved_people,
          key_events: editStructured.key_events,
          time_range: editStructured.time_range || null,
        });
        // 立即刷新
        const res = await getStory(id);
        setStory(res.data);
      }
      setIsEditing(false);
    } catch (err) {
      console.error('保存失败:', err);
      setError(err.response?.data?.detail || '保存失败，请重试');
    } finally {
      setSaving(false);
    }
  };

  // 重新生成润色版
  const handleRegeneratePolish = async () => {
    setRegenerating(true);
    setError(null);

    try {
      const res = await regeneratePolishing(id);
      setEditNarrativePolish(res.data.narrative_polish);
      // 刷新故事数据
      const storyRes = await getStory(id);
      setStory(storyRes.data);
    } catch (err) {
      console.error('重新生成失败:', err);
      setError(err.response?.data?.detail || '重新生成失败，请重试');
    } finally {
      setRegenerating(false);
    }
  };

  // 重新生成结构化信息
  const handleRetag = async () => {
    setRegenerating(true);
    setError(null);

    try {
      await retagStory(id);
      // 刷新故事数据
      const res = await getStory(id);
      setStory(res.data);
      setEditStructured({
        title: res.data.title || '',
        summary: res.data.summary || '',
        year: res.data.year || '',
        decade: res.data.decade || '',
        theme: res.data.theme || '',
        tags: res.data.tags || '[]',
        involved_people: res.data.involved_people || '[]',
        key_events: res.data.key_events || '[]',
        time_range: res.data.time_range || '',
      });
    } catch (err) {
      console.error('重新生成失败:', err);
      setError(err.response?.data?.detail || '重新生成失败，请重试');
    } finally {
      setRegenerating(false);
    }
  };

  // 删除故事
  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteStory(id);
      navigate(-1);
    } catch (err) {
      console.error('删除失败:', err);
      setError(err.response?.data?.detail || '删除失败，请重试');
    } finally {
      setDeleting(false);
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

  // 渲染编辑/保存/取消按钮
  const renderTopRightButtons = () => {
    if (isEditing) {
      return (
        <div className="flex items-center gap-2">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 bg-[#4A3728] text-white rounded-lg hover:bg-[#5A4738] disabled:opacity-50 text-sm"
          >
            {saving ? '保存中...' : '保存'}
          </button>
          <button
            onClick={toggleEdit}
            disabled={saving}
            className="px-4 py-2 text-gray-500 hover:text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 text-sm disabled:opacity-50"
          >
            取消
          </button>
        </div>
      );
    }

    return (
      <button
        onClick={toggleEdit}
        className="px-4 py-2 bg-[#4A3728] text-white rounded-lg hover:bg-[#5A4738] text-sm"
      >
        编辑
      </button>
    );
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

            {story.decade && (
              <span className="px-3 py-1 rounded-full text-sm shadow-sm bg-gray-100 text-gray-600">
                {story.decade}
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
          </div>

          {/* 右侧按钮组 */}
          <div className="flex items-center gap-2">
            {/* 编辑/保存/取消按钮 */}
            {renderTopRightButtons()}

            {/* 删除按钮 */}
            <button
              onClick={() => setIsDeleteModalOpen(true)}
              className="w-10 h-10 rounded-full bg-white flex items-center justify-center shadow-sm hover:shadow text-red-500"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
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
              {generationStatus && generationStatus.status !== 'done' && generationStatus.status !== 'failed' && (
                <div className="mb-4 text-sm text-gray-500">
                  {generationStatus.status === 'generating_layer2' && 'AI 正在提炼结构化信息...'}
                  {generationStatus.status === 'generating_layer3' && 'AI 正在撰写故事文章...'}
                  {generationStatus.status === 'pending' && '故事生成中...'}
                  {generationStatus.status === 'failed' && '故事生成失败'}
                </div>
              )}
              {generationStatus?.status === 'failed' && (
                <div className="mb-4 text-sm text-red-500">故事生成失败</div>
              )}

              {/* 切换：润色版/原始转录 + 重新生成按钮 */}
              <div className="flex justify-between items-center mb-3">
                <button
                  onClick={() => {
                    const newShowPolished = !showPolished;
                    setShowPolished(newShowPolished);
                    // 同步更新编辑框内容
                    if (isEditing) {
                      if (newShowPolished) {
                        setEditNarrativePolish(story.narrative_polish || '');
                      } else {
                        setEditNarrativePolish(story.transcript || '');
                      }
                    }
                  }}
                  className="text-xs text-gray-400 hover:text-gray-600"
                >
                  {showPolished ? '查看原始转录' : '查看润色版'}
                </button>
                {isEditing && (
                  <button
                    onClick={handleRegeneratePolish}
                    disabled={regenerating}
                    className="px-3 py-1 text-xs bg-[#D4A574] text-white rounded-lg hover:bg-[#C49564] disabled:opacity-50"
                  >
                    {regenerating ? '生成中...' : '重新生成润色版'}
                  </button>
                )}
              </div>

              {/* 内容 */}
              {isEditing ? (
                <textarea
                  value={editNarrativePolish}
                  onChange={(e) => setEditNarrativePolish(e.target.value)}
                  className="w-full h-60 p-3 border border-[#E5DED3] rounded-lg resize-none focus:outline-none focus:border-[#D4A574] font-serif text-[#4A3728] text-lg leading-[1.8]"
                  placeholder="请输入润色后的故事..."
                />
              ) : (
                ((showPolished ? story.narrative_polish : story.transcript) ? (
                  <p className="font-serif text-[#4A3728] text-lg leading-[1.8] whitespace-pre-wrap">
                    {showPolished ? story.narrative_polish : story.transcript}
                  </p>
                ) : (
                  <p className="text-gray-400 text-center py-8">故事生成中...</p>
                ))
              )}
            </div>
          )}

          {/* Tab2: 对话记录（第一层） */}
          {activeTab === 'transcript' && (
            <div className="bg-white rounded-2xl p-4 shadow-sm">
              {/* 按\n\n拆分，再分别提取【问】和【答-第X轮】 */}
              <div className="space-y-4">
                {roundsLoading ? (
                  <p className="text-gray-400 text-center py-8">加载中...</p>
                ) : editRounds.length === 0 ? (
                  <p className="text-gray-400 text-center py-8">暂无对话记录</p>
                ) : (
                  editRounds.map((round, i) => (
                    <div key={round.id || i} className="pb-4 border-b border-gray-100 last:border-0">
                      {round.round_index !== undefined && (
                        <div className="text-xs text-gray-400 mb-2">第 {round.round_index + 1} 轮</div>
                      )}

                      {/* AI 问题气泡（左侧，灰色） */}
                      {round.question && (
                        <div className="flex justify-start mb-3">
                          <div className="bg-gray-100 rounded-2xl px-4 py-2 max-w-[80%]">
                            <p className="text-sm text-gray-700">{round.question}</p>
                          </div>
                        </div>
                      )}

                      {/* 老人回答区（右侧，暖色） */}
                      {isEditing ? (
                        <div className="flex justify-end">
                          <textarea
                            value={round.transcript || ''}
                            onChange={(e) => {
                              const newRounds = [...editRounds];
                              newRounds[i].transcript = e.target.value;
                              setEditRounds(newRounds);
                            }}
                            className="w-full max-w-[80%] px-4 py-2 border border-[#E5DED3] rounded-2xl resize-none focus:outline-none focus:border-[#D4A574] text-sm text-gray-700"
                            rows={3}
                          />
                        </div>
                      ) : (
                        <div className="flex justify-end">
                          <div className="bg-[#FFF8EE] rounded-2xl px-4 py-2 max-w-[80%]">
                            <p className="text-sm text-gray-700 whitespace-pre-wrap">{round.transcript}</p>
                          </div>
                        </div>
                      )}

                      {/* 音频播放器（如果有） */}
                      {round.audio_url && (
                        <div className="mt-2">
                          <audio
                            src={round.audio_url}
                            controls
                            className="w-full h-8"
                          />
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Tab3: 结构化信息（第二层） */}
          {activeTab === 'structured' && (
            <div className="bg-white rounded-2xl p-6 shadow-sm space-y-4">
              {/* 右上角重新生成按钮 */}
              {isEditing && (
                <div className="flex justify-end">
                  <button
                    onClick={handleRetag}
                    disabled={regenerating}
                    className="px-3 py-1 text-xs bg-[#D4A574] text-white rounded-lg hover:bg-[#C49564] disabled:opacity-50"
                  >
                    {regenerating ? '生成中...' : '重新生成结构化信息'}
                  </button>
                </div>
              )}

              {/* 生成中状态 */}
              {(!generationStatus || (generationStatus.status !== 'done' && generationStatus.status !== 'failed')) && !story.title && !story.summary && (
                <p className="text-gray-400 text-center py-8">结构化信息生成中...</p>
              )}

              {/* 标题 */}
              {isEditing ? (
                <div>
                  <label className="block text-xs text-gray-400 uppercase mb-1">标题</label>
                  <input
                    type="text"
                    value={editStructured.title}
                    onChange={(e) => setEditStructured({ ...editStructured, title: e.target.value })}
                    className="w-full px-3 py-2 border border-[#E5DED3] rounded-lg focus:outline-none focus:border-[#D4A574] text-[#4A3728]"
                    placeholder="故事标题"
                  />
                </div>
              ) : story.title && (
                <div>
                  <h3 className="text-xl font-serif text-[#4A3728]">{story.title}</h3>
                </div>
              )}

              {/* 摘要 */}
              {isEditing ? (
                <div>
                  <label className="block text-xs text-gray-400 uppercase mb-1">故事概要</label>
                  <textarea
                    value={editStructured.summary}
                    onChange={(e) => setEditStructured({ ...editStructured, summary: e.target.value })}
                    className="w-full px-3 py-2 border border-[#E5DED3] rounded-lg focus:outline-none focus:border-[#D4A574] text-[#4A3728] text-sm"
                    rows={3}
                    placeholder="故事概要"
                  />
                </div>
              ) : story.summary && (
                <div>
                  <h4 className="text-xs text-gray-400 uppercase mb-1">故事概要</h4>
                  <p className="text-gray-700">{story.summary}</p>
                </div>
              )}

              {/* 时间范围 */}
              {isEditing ? (
                <div>
                  <label className="block text-xs text-gray-400 uppercase mb-1">时间范围</label>
                  <input
                    type="text"
                    value={editStructured.time_range}
                    onChange={(e) => setEditStructured({ ...editStructured, time_range: e.target.value })}
                    className="w-full px-3 py-2 border border-[#E5DED3] rounded-lg focus:outline-none focus:border-[#D4A574] text-[#4A3728]"
                    placeholder="例如: 1960-1970年"
                  />
                </div>
              ) : story.time_range && (
                <div>
                  <h4 className="text-xs text-gray-400 uppercase mb-1">时间范围</h4>
                  <p className="text-gray-700">{story.time_range}</p>
                </div>
              )}

              {/* 年份 */}
              {isEditing ? (
                <div className="flex gap-4">
                  <div className="flex-1">
                    <label className="block text-xs text-gray-400 uppercase mb-1">年份</label>
                    <input
                      type="number"
                      value={editStructured.year}
                      onChange={(e) => setEditStructured({ ...editStructured, year: e.target.value })}
                      className="w-full px-3 py-2 border border-[#E5DED3] rounded-lg focus:outline-none focus:border-[#D4A574] text-[#4A3728]"
                      placeholder="故事发生在哪一年"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="block text-xs text-gray-400 uppercase mb-1">年代</label>
                    <input
                      type="text"
                      value={editStructured.decade}
                      onChange={(e) => setEditStructured({ ...editStructured, decade: e.target.value })}
                      className="w-full px-3 py-2 border border-[#E5DED3] rounded-lg focus:outline-none focus:border-[#D4A574] text-[#4A3728]"
                      placeholder="例如: 1960年代"
                    />
                  </div>
                </div>
              ) : (story.year || story.decade) && (
                <div className="flex gap-4">
                  {story.year && (
                    <div>
                      <h4 className="text-xs text-gray-400 uppercase mb-1">年份</h4>
                      <p className="text-gray-700">{story.year}</p>
                    </div>
                  )}
                  {story.decade && (
                    <div>
                      <h4 className="text-xs text-gray-400 uppercase mb-1">年代</h4>
                      <p className="text-gray-700">{story.decade}</p>
                    </div>
                  )}
                </div>
              )}

              {/* 主题
              {isEditing ? (
                <div>
                  <label className="block text-xs text-gray-400 uppercase mb-1">主题</label>
                  <input
                    type="text"
                    value={editStructured.theme}
                    onChange={(e) => setEditStructured({ ...editStructured, theme: e.target.value })}
                    className="w-full px-3 py-2 border border-[#E5DED3] rounded-lg focus:outline-none focus:border-[#D4A574] text-[#4A3728]"
                    placeholder="故事主题"
                  />
                </div>
              ) : story.theme && (
                <div>
                  <h4 className="text-xs text-gray-400 uppercase mb-1">主题</h4>
                  <p className="text-gray-700">{story.theme}</p>
                </div>
              )} */}

              {/* 核心标签 */}
              {isEditing ? (
                <div>
                  <label className="block text-xs text-gray-400 uppercase mb-1">核心标签 (JSON 数组)</label>
                  <input
                    type="text"
                    value={editStructured.tags}
                    onChange={(e) => setEditStructured({ ...editStructured, tags: e.target.value })}
                    className="w-full px-3 py-2 border border-[#E5DED3] rounded-lg focus:outline-none focus:border-[#D4A574] text-[#4A3728]"
                    placeholder='["标签1", "标签2"]'
                  />
                </div>
              ) : story.tags && (
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
              {isEditing ? (
                <div>
                  <label className="block text-xs text-gray-400 uppercase mb-1">涉及人物 (JSON 数组)</label>
                  <input
                    type="text"
                    value={editStructured.involved_people}
                    onChange={(e) => setEditStructured({ ...editStructured, involved_people: e.target.value })}
                    className="w-full px-3 py-2 border border-[#E5DED3] rounded-lg focus:outline-none focus:border-[#D4A574] text-[#4A3728]"
                    placeholder='["人物1", "人物2"]'
                  />
                </div>
              ) : story.involved_people && (
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
              {isEditing ? (
                <div>
                  <label className="block text-xs text-gray-400 uppercase mb-1">核心事件 (JSON 数组)</label>
                  <input
                    type="text"
                    value={editStructured.key_events}
                    onChange={(e) => setEditStructured({ ...editStructured, key_events: e.target.value })}
                    className="w-full px-3 py-2 border border-[#E5DED3] rounded-lg focus:outline-none focus:border-[#D4A574] text-[#4A3728]"
                    placeholder='["事件1", "事件2"]'
                  />
                </div>
              ) : story.key_events && (
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
                    {(() => {
                    const rounds = story.transcript?.split('\n\n').filter(block => block.trim()) || [];
                    return rounds.length;
                  })()} 轮对话
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 错误提示 */}
        {error && (
          <div className="mb-4 text-red-500 text-sm text-center py-2 bg-red-50 rounded-lg">
            {error}
          </div>
        )}

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

      {/* 删除确认 Modal */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6">
            <div className="text-center">
              {/* 警告图标 */}
              <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-red-100 flex items-center justify-center">
                <svg className="w-6 h-6 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>

              <h3 className="text-lg font-medium text-gray-900 mb-2">确定删除这个故事吗？</h3>
              <p className="text-sm text-gray-500 mb-6">删除后无法恢复</p>

              <div className="flex gap-3">
                <button
                  onClick={() => setIsDeleteModalOpen(false)}
                  disabled={deleting}
                  className="flex-1 px-4 py-2 text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="flex-1 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 disabled:opacity-50 transition-colors"
                >
                  {deleting ? '删除中...' : '删除'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StoryDetail;