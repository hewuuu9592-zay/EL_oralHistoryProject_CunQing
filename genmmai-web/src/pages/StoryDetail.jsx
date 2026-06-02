import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getStory, patchStory } from '../api';

const THEMES = [
  { name: '家乡记忆', emoji: '🏠' },
  { name: '工作岁月', emoji: '💼' },
  { name: '爱情婚姻', emoji: '💕' },
  { name: '历史亲历', emoji: '📜' },
  { name: '家族传承', emoji: '🌳' },
  { name: '童年往事', emoji: '🧒' },
  { name: '其他', emoji: '📝' },
];

const StoryDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  const [story, setStory] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [editTranscript, setEditTranscript] = useState('');
  const [saving, setSaving] = useState(false);

  // 音频播放状态
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const audioRef = useRef(null);

  useEffect(() => {
    const fetchStory = async () => {
      try {
        const res = await getStory(id);
        setStory(res.data);
        setEditTranscript(res.data.transcript || '');
      } catch (err) {
        console.error('获取故事失败:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchStory();
  }, [id]);

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
    return THEMES.find(t => t.name === themeName) || { name: themeName, emoji: '📝' };
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await patchStory(id, { transcript: editTranscript });
      setStory({ ...story, transcript: editTranscript });
      setIsEditing(false);
    } catch (err) {
      console.error('保存失败:', err);
      alert('保存失败，请重试');
    } finally {
      setSaving(false);
    }
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
        <div className="flex items-center gap-3 mb-6">
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
            <span className="px-3 py-1 bg-white rounded-full text-sm shadow-sm">
              {story.decade && <span className="text-gray-400">{story.decade} </span>}
              <span>{themeInfo.emoji} {story.theme}</span>
            </span>
          )}
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

        {/* 故事正文 */}
        <div className="bg-white rounded-2xl p-6 mb-6 shadow-sm relative">
          {isEditing ? (
            <div className="space-y-4">
              <textarea
                value={editTranscript}
                onChange={(e) => setEditTranscript(e.target.value)}
                className="w-full h-64 p-3 border border-[#E5DED3] rounded-lg resize-none focus:outline-none focus:border-[#D4A574] font-serif text-[#4A3728] text-lg leading-relaxed"
              />
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setIsEditing(false)}
                  className="px-4 py-2 text-gray-500 hover:text-gray-700"
                >
                  取消
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="px-4 py-2 bg-[#4A3728] text-white rounded-lg hover:bg-[#5A4738] disabled:opacity-50"
                >
                  {saving ? '保存中...' : '保存'}
                </button>
              </div>
            </div>
          ) : (
            <>
              <button
                onClick={() => setIsEditing(true)}
                className="absolute top-4 right-4 text-gray-300 hover:text-[#D4A574]"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a3 3 0 114.243 4.243m-4.836 6.428l4.836 6.428m0 0a3 3 0 105.648-5.648l-3.536 3.536m0 0l3.536-3.536m-3.536 3.536L9.464 5.232" />
                </svg>
              </button>
              <p className="font-serif text-[#4A3728] text-lg leading-[1.8] whitespace-pre-wrap">
                {story.transcript || '暂无文字内容'}
              </p>
            </>
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
    </div>
  );
};

export default StoryDetail;