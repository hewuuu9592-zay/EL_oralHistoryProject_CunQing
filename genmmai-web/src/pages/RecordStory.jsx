import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { getPerson, getPersons, getSuggestQuestion, uploadAndProcessAudio, updateStory, getStory, createStoryPerson, tagStory, extractStoryMigrations, confirmStoryMigrations } from '../api';
import { useTheme, getThemeStyle } from '../contexts/ThemeContext';

const DEFAULT_QUESTION = "您有什么想留给后代的故事吗？";

const RecordStory = () => {
  const { themes, getThemeStyle, loading: themeLoading } = useTheme();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const personId = searchParams.get('personId');
  const [person, setPerson] = useState(null);
  const [persons, setPersons] = useState([]);
  const [loading, setLoading] = useState(true);

  // 阶段：'record' | 'confirm'
  const [stage, setStage] = useState('record');

  // AI 提问状态
  const [question, setQuestion] = useState('');
  const [questionLoading, setQuestionLoading] = useState(true);

  // 录音状态
  const [isRecording, setIsRecording] = useState(false);
  const [audioUrl, setAudioUrl] = useState(null);
  const [recordingTime, setRecordingTime] = useState(0);
  const [error, setError] = useState(null);

  // 确认表单状态
  const [transcript, setTranscript] = useState('');
  const [year, setYear] = useState('');
  const [selectedThemes, setSelectedThemes] = useState([]);
  const [selectedPersons, setSelectedPersons] = useState([]);
  const [processing, setProcessing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [storyId, setStoryId] = useState(null);
  const [transcriptionStatus, setTranscriptionStatus] = useState('pending'); // 'pending' | 'processing' | 'done' | 'failed'
  const [aiTagStatus, setAiTagStatus] = useState('untagged'); // 'untagged' | 'processing' | 'done' | 'failed'

  // 迁徙提取状态
  const [migrationsExtracted, setMigrationsExtracted] = useState([]);  // AI 提取的迁徙建议
  const [selectedMigrations, setSelectedMigrations] = useState([]);    // 用户选中的迁徙
  const [extractingMigrations, setExtractingMigrations] = useState(false);

  // 文件上传状态
  const [isUploading, setIsUploading] = useState(false);

  // Refs
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const audioRef = useRef(null);
  const audioBlobRef = useRef(null);
  const fileInputRef = useRef(null);
  const hasLoadedQuestion = useRef(false);

  useEffect(() => {
    const fetchData = async () => {
      if (!personId) {
        setLoading(false);
        return;
      }
      try {
        const [personRes, personsRes] = await Promise.all([
          getPerson(personId),
          getPersons(),
        ]);
        setPerson(personRes.data);
        setPersons(personsRes.data || []);
      } catch (err) {
        console.error('获取数据失败:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [personId]);

  // 获取 AI 引导问题
  useEffect(() => {
    if (!personId || hasLoadedQuestion.current) return
    
    const fetchQuestion = async () => {
      setQuestionLoading(true)
      try {
        const response = await getSuggestQuestion(personId)
        setQuestion(response.data?.question || DEFAULT_QUESTION)
      } catch (err) {
        setQuestion(DEFAULT_QUESTION)
      } finally {
        setQuestionLoading(false)
      }
    }
    
    hasLoadedQuestion.current = true
    fetchQuestion()
  }, [personId])

  const refreshQuestion = async () => {
    setQuestionLoading(true);
    try {
      const response = await getSuggestQuestion(personId);
      setQuestion(response.data?.question || DEFAULT_QUESTION);
    } catch (err) {
      console.error('获取引导问题失败:', err);
      setQuestion(DEFAULT_QUESTION);
    } finally {
      setQuestionLoading(false);
    }
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const startRecording = async () => {
    try {
      setError(null);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        audioBlobRef.current = blob;
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start(1000);
      setIsRecording(true);
      setRecordingTime(0);

      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } catch (err) {
      console.error('录音权限被拒绝:', err);
      setError('请在浏览器设置中允许麦克风权限');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      clearInterval(timerRef.current);
    }
  };

  const handleRecordToggle = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  const handleReRecord = () => {
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
      setAudioUrl(null);
      setRecordingTime(0);
      chunksRef.current = [];
      audioBlobRef.current = null;
    }
  };

  // 处理文件上传
  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 检查是否是音频文件
    if (!file.type.startsWith('audio/') && !file.name.match(/\.(webm|wav|mp3|m4a|ogg|flac)$/i)) {
      setError('请上传音频文件');
      return;
    }

    setError(null);
    setIsUploading(true);

    const url = URL.createObjectURL(file);
    audioBlobRef.current = file;
    setAudioUrl(url);
    setIsUploading(false);
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  const handleGoToConfirm = async () => {
    setProcessing(true);
    try {
      // 1. 上传音频并获取 storyId，同时传递 person_id 以便后端创建关联
      const response = await uploadAndProcessAudio(audioBlobRef.current, personId);
      const data = response.data;
      
      setStoryId(data.id);
      setTranscriptionStatus('processing');
      
      // 默认选中当前人物
      setSelectedPersons([personId]);
      setStage('confirm');
    } catch (err) {
      console.error('上传音频失败:', err);
      setError('上传失败，请检查网络连接或后端服务');
    } finally {
      setProcessing(false);
    }
  };

  // 轮询转写结果
  useEffect(() => {
    let pollInterval;
    if (stage === 'confirm' && storyId && (transcriptionStatus === 'processing' || transcriptionStatus === 'pending')) {
      pollInterval = setInterval(async () => {
        try {
          const res = await getStory(storyId);
          const story = res.data;

          if (story.transcription_status === 'done') {
            setTranscript(story.transcript || '');
            setTranscriptionStatus('done');
            clearInterval(pollInterval);
          } else if (story.transcription_status === 'failed') {
            setTranscript(story.transcript || '转写失败');
            setTranscriptionStatus('failed');
            clearInterval(pollInterval);
          }
        } catch (err) {
          console.error('轮询转写状态失败:', err);
        }
      }, 3000); // 每3秒查一次
    }
    return () => clearInterval(pollInterval);
  }, [stage, storyId, transcriptionStatus]);

  const toggleTheme = (themeName) => {
    setSelectedThemes(prev =>
      prev.includes(themeName)
        ? prev.filter(t => t !== themeName)
        : [...prev, themeName]
    );
  };

  const togglePerson = (pId) => {
    if (pId === personId) return; // 当前人物不可取消
    setSelectedPersons(prev =>
      prev.includes(pId)
        ? prev.filter(id => id !== pId)
        : [...prev, pId]
    );
  };

  // 一键 AI 标注
  const handleAITag = async () => {
    if (!storyId || aiTagStatus !== 'untagged' || !transcript) return;
    setAiTagStatus('processing');
    try {
      const res = await tagStory(storyId, transcript);
      const data = res.data;
      if (data.year) setYear(String(data.year));
      if (data.theme) setSelectedThemes([data.theme]);
      setAiTagStatus('done');
    } catch (err) {
      console.error('AI 标注失败:', err);
      setAiTagStatus('failed');
      alert('标注失败，请手动填写');
    }
  };

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);

    try {
      // 更新现有故事
      await updateStory(storyId, {
        transcript: transcript,
        summary: transcript?.slice(0, 50) || '',
        year: year ? parseInt(year) : null,
        theme: selectedThemes[0] || null,
        person_ids: JSON.stringify(selectedPersons),
      });

      // 故事人物关联已经在后端上传时创建了部分，这里补充其他关联
      const otherPersons = selectedPersons.filter(id => id !== personId);
      for (const pId of otherPersons) {
        await createStoryPerson({
          story_id: storyId,
          person_id: pId,
          is_protagonist: false,
        });
      }

      // 尝试提取迁徙记录
      setExtractingMigrations(true);
      try {
        const res = await extractStoryMigrations(storyId);
        const extracted = res.data || [];

        if (extracted.length > 0) {
          // 有提取结果，显示迁徙确认卡片
          setMigrationsExtracted(extracted);
          setSelectedMigrations(extracted.map(m => ({
            ...m,
            selected: true
          })));
          setExtractingMigrations(false);
          return;  // 不跳转，等待用户确认
        }
      } catch (extractErr) {
        console.error('提取迁徙记录失败:', extractErr);
      }

      // 没有提取到迁徙记录，直接跳转
      navigate(`/person/${personId}`);
    } catch (err) {
      console.error('保存故事失败:', err);
      alert('保存失败，请重试');
    } finally {
      setSaving(false);
    }
  };

  // 处理迁徙确认
  const handleConfirmMigrations = async () => {
    try {
      // 筛选选中的迁徙
      const selected = selectedMigrations.filter(m => m.selected);
      if (selected.length > 0) {
        await confirmStoryMigrations(storyId, {
          migrations: selected.map(m => ({
            place_name: m.place_name,
            latitude: m.latitude,
            longitude: m.longitude,
            year: m.year,
            description: m.description,
            person_ids: selectedPersons
          }))
        });
      }
      navigate(`/person/${personId}`);
    } catch (err) {
      console.error('保存迁徙记录失败:', err);
      alert('保存迁徙记录失败，请重试');
    }
  };

  // 跳过迁徙直接跳转
  const handleSkipMigrations = () => {
    navigate(`/person/${personId}`);
  };

  // 切换迁徙选择
  const toggleMigrationSelection = (index) => {
    setSelectedMigrations(prev => prev.map((m, i) =>
      i === index ? { ...m, selected: !m.selected } : m
    ));
  };

  const getNameInitial = (name) => {
    return name ? name.charAt(0) : '?';
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FAF7F2] flex items-center justify-center">
        <div className="text-[#4A3728]">加载中...</div>
      </div>
    );
  }

  // ===== 确认阶段 =====
  if (stage === 'confirm') {
    return (
      <div className="min-h-screen bg-[#FAF7F2] flex flex-col">
        {/* 顶部导航 */}
        <div className="bg-white border-b border-[#E5DED3] px-4 py-4">
          <div className="max-w-md mx-auto flex items-center justify-between">
            <button
              onClick={() => setStage('record')}
              className="text-[#4A3728] hover:opacity-70"
            >
              ← 返回
            </button>
            <span className="text-[#4A3728] font-medium">确认标注</span>
            <div className="w-12" />
          </div>
        </div>

        {/* 处理中状态 */}
        {(transcriptionStatus === 'processing' || transcriptionStatus === 'pending') && (
          <div className="bg-[#FAF7F2] border border-[#D4A574] mx-4 mt-4 p-4 rounded-xl flex items-center justify-center gap-4 shadow-sm">
            <div className="w-5 h-5 border-3 border-[#D4A574] border-t-transparent rounded-full animate-spin"></div>
            <p className="text-[#6B4F35] font-medium">本地 AI 正在努力转写中，请稍候...</p>
          </div>
        )}

        {transcriptionStatus === 'failed' && (
          <div className="bg-red-50 border border-red-200 mx-4 mt-4 p-3 rounded-lg">
            <p className="text-red-700 text-sm text-center">转写失败，您可以手动输入内容</p>
          </div>
        )}

        {/* 表单内容 */}
        <div className="flex-1 overflow-auto p-4">
          <div className="max-w-md mx-auto space-y-4">
            {/* 转录文字 */}
            <div>
              <label className="text-xs text-gray-500">AI 转录结果（可修改）</label>
              <textarea
                value={transcript}
                onChange={(e) => setTranscript(e.target.value)}
                placeholder="请输入或修改故事内容..."
                className="w-full h-32 p-3 mt-1 border border-[#E5DED3] rounded-lg resize-none focus:outline-none focus:border-[#D4A574]"
              />
            </div>

            {/* 一键标注按钮 */}
            {transcriptionStatus === 'done' && (
              <button
                onClick={handleAITag}
                disabled={aiTagStatus !== 'untagged'}
                className={`w-full py-2.5 px-4 rounded-xl border flex items-center justify-center gap-2 transition-all ${
                  aiTagStatus === 'untagged'
                    ? 'bg-white border-[#D4A574] text-[#D4A574] hover:bg-[#FAF7F2] shadow-sm'
                    : aiTagStatus === 'processing'
                    ? 'bg-gray-50 border-gray-200 text-gray-400 cursor-not-allowed'
                    : 'bg-green-50 border-green-200 text-green-600'
                }`}
              >
                {aiTagStatus === 'processing' ? (
                  <div className="w-4 h-4 border-2 border-gray-300 border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  <span className="text-lg">✨</span>
                )}
                <span className="font-medium">
                  {aiTagStatus === 'processing' ? 'AI 标注中...' :
                   aiTagStatus === 'done' ? '已自动标注' :
                   aiTagStatus === 'failed' ? '标注失败，请手动填写' :
                   '一键 AI 标注（自动填入年份与主题）'}
                </span>
              </button>
            )}

            {/* 故事年份 */}
            <div>
              <label className="text-xs text-gray-500">故事年份</label>
              <input
                type="number"
                value={year}
                onChange={(e) => setYear(e.target.value)}
                placeholder="故事发生在哪一年？（如1965）"
                className="w-full p-3 mt-1 border border-[#E5DED3] rounded-lg focus:outline-none focus:border-[#D4A574]"
              />
            </div>

            {/* 主题标签 */}
            <div>
              <label className="text-xs text-gray-500">主题标签（多选）</label>
              <div className="flex flex-wrap gap-2 mt-1">
                {(themes || []).map(theme => {
                  const style = getThemeStyle(themes, theme.name);
                  return (
                    <button
                      key={theme.name}
                      onClick={() => toggleTheme(theme.name)}
                      className={`px-3 py-1.5 rounded-full text-sm ${
                        selectedThemes.includes(theme.name)
                          ? 'bg-[#4A3728] text-white'
                          : 'bg-white border border-[#E5DED3] text-[#4A3728]'
                      }`}
                      style={selectedThemes.includes(theme.name) ? {} : { backgroundColor: style.bg, color: style.text }}
                    >
                      {style.emoji} {theme.name}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 涉及人物 */}
            <div>
              <label className="text-xs text-gray-500">涉及人物（多选）</label>
              <div className="flex flex-wrap gap-2 mt-1">
                {persons.map((p) => {
                  const isSelected = selectedPersons.includes(p.id);
                  const isCurrentPerson = p.id === personId;
                  return (
                    <div
                      key={p.id}
                      onClick={() => !isCurrentPerson && togglePerson(p.id)}
                      className={`flex items-center gap-2 px-2 py-1 rounded-lg cursor-pointer ${
                        isSelected
                          ? 'bg-[#4A3728] text-white'
                          : 'bg-white border border-[#E5DED3]'
                      } ${isCurrentPerson ? 'cursor-not-allowed opacity-80' : ''}`}
                    >
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${
                        isSelected ? 'bg-white/20 text-white' : 'bg-[#D4A574] text-white'
                      }`}>
                        {getNameInitial(p.name)}
                      </div>
                      <span className="text-sm">{p.name}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* 迁徙提取确认卡片 */}
        {(migrationsExtracted.length > 0 || extractingMigrations) && (
          <div className="mx-4 mb-4 bg-white rounded-xl border border-[#D4A574] p-4 shadow-sm">
            {extractingMigrations ? (
              <div className="flex items-center justify-center gap-3 py-4">
                <div className="w-5 h-5 border-2 border-[#D4A574] border-t-transparent rounded-full animate-spin"></div>
                <span className="text-[#6B4F35]">正在分析故事中的地点信息...</span>
              </div>
            ) : (
              <div className="space-y-4">
                <h3 className="text-lg font-medium text-[#4A3728] pb-2 border-b border-[#E5DED3]">
                  是否为这个故事生成迁徙记录？
                </h3>

                {/* 提取的地名列表 */}
                <div className="space-y-2">
                  {selectedMigrations.map((m, index) => (
                    <label
                      key={index}
                      className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={m.selected}
                        onChange={() => toggleMigrationSelection(index)}
                        className="w-4 h-4 text-[#4A3728] rounded focus:ring-[#D4A574]"
                      />
                      <div>
                        <div className="font-medium text-[#4A3728]">{m.place_name}</div>
                        {m.year && <span className="text-sm text-gray-500">{m.year}年</span>}
                        {m.description && <span className="text-sm text-gray-400 ml-2">{m.description}</span>}
                      </div>
                    </label>
                  ))}
                </div>

                {/* 涉及人物说明 */}
                <div className="text-sm text-gray-500 pt-2 border-t border-[#E5DED3]">
                  以下成员都将同步此记录：{selectedPersons.map(pid => persons.find(p => p.id === pid)?.name).filter(Boolean).join('、')}
                </div>

                {/* 按钮 */}
                <div className="flex gap-3 pt-2">
                  <button
                    onClick={handleSkipMigrations}
                    className="flex-1 py-2 border border-gray-200 text-gray-500 rounded-lg hover:bg-gray-50"
                  >
                    跳过
                  </button>
                  <button
                    onClick={handleConfirmMigrations}
                    className="flex-1 py-2 bg-[#4A3728] text-white rounded-lg hover:bg-[#5A4738]"
                  >
                    确认生成
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 底部按钮 - 仅在不显示迁徙卡片时显示 */}
        {!migrationsExtracted.length && !extractingMigrations && (
          <div className="bg-white border-t border-[#E5DED3] p-4">
            <div className="max-w-md mx-auto">
              <button
                onClick={handleSave}
                disabled={saving}
                className="w-full py-3 bg-[#4A3728] text-white rounded-lg hover:bg-[#5A4738] disabled:opacity-50"
              >
                {saving ? '保存中...' : '保存故事'}
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ===== 录音阶段 =====
  return (
    <div className="min-h-screen bg-[#FAF7F2] flex flex-col">
      {/* 顶部导航 */}
      <div className="bg-white border-b border-[#E5DED3] px-4 py-4">
        <div className="max-w-md mx-auto flex items-center">
          <button
            onClick={() => navigate(-1)}
            className="text-[#4A3728] hover:opacity-70"
          >
            ← 返回
          </button>
        </div>
      </div>

      {/* 标题 */}
      <div className="bg-white border-b border-[#E5DED3] pb-6">
        <div className="max-w-md mx-auto text-center">
          <h1 className="text-xl font-bold text-[#4A3728]">
            为 {person?.name || '家族成员' } 录入故事
          </h1>
        </div>
      </div>

      {/* AI 引导问题卡片 */}
      <div className="px-4 mt-4">
        <div className="max-w-md mx-auto bg-[#FFFDF5] border-l-4 border-[#D4A574] rounded-r-lg p-4 relative">
          <p className="text-xs text-gray-500 mb-1">今天可以聊聊：</p>
          {questionLoading ? (
            <p className="text-[#4A3728]">AI 正在思考问题...</p>
          ) : (
            <>
              <p className="text-base text-[#4A3728] pr-16">{question}</p>
              <button
                onClick={refreshQuestion}
                className="absolute top-4 right-4 text-sm text-[#D4A574] hover:opacity-70"
              >
                换一个问题
              </button>
            </>
          )}
        </div>
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="bg-red-50 border border-red-200 mx-4 mt-4 p-3 rounded-lg">
          <p className="text-red-600 text-sm text-center">{error}</p>
        </div>
      )}

      {/* 录音区域 */}
      <div className="flex-1 flex flex-col items-center justify-center p-8">
        {(isRecording || audioUrl) && (
          <div className="text-3xl font-mono text-[#4A3728] mb-8">
            {formatTime(recordingTime)}
          </div>
        )}

        {!audioUrl && (
          <button
            onClick={handleRecordToggle}
            className={`w-[140px] h-[140px] rounded-full flex items-center justify-center transition-all ${
              isRecording
                ? 'bg-red-500 animate-pulse'
                : 'bg-[#4A3728] hover:bg-[#5A4738]'
            }`}
          >
            {isRecording ? (
              <svg className="w-12 h-12 text-white" fill="currentColor" viewBox="0 0 24 24">
                <rect x="6" y="6" width="12" height="12" rx="2" />
              </svg>
            ) : (
              <svg className="w-16 h-16 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
            )}
          </button>
        )}

        {!isRecording && !audioUrl && (
          <p className="mt-6 text-[#6B4F35]">点击开始录音</p>
        )}

        {/* 上传已有音频文件 */}
        {!isRecording && !audioUrl && (
          <div className="mt-8">
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*"
              onChange={handleFileUpload}
              className="hidden"
            />
            <button
              onClick={triggerFileInput}
              disabled={isUploading}
              className="text-sm text-[#D4A574] hover:opacity-70 flex items-center gap-1"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              {isUploading ? '上传中...' : '或上传已有音频文件'}
            </button>
          </div>
        )}

        {isRecording && (
          <p className="mt-6 text-red-500 font-medium">录音中...</p>
        )}

        {/* 录音预览和按钮 */}
        {audioUrl && (
          <div className="w-full max-w-md">
            <audio ref={audioRef} src={audioUrl} controls className="w-full mb-6" />

            <div className="flex gap-4">
              <button
                onClick={handleReRecord}
                className="flex-1 py-3 border border-[#4A3728] text-[#4A3728] rounded-lg hover:bg-[#F5F1E9]"
              >
                重新录制
              </button>
              <button
                onClick={handleGoToConfirm}
                disabled={processing}
                className="flex-1 py-3 bg-[#4A3728] text-white rounded-lg hover:bg-[#5A4738] disabled:opacity-50"
              >
                {processing ? '处理中...' : '下一步'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default RecordStory;