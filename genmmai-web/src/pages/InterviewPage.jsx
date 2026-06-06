import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { getPerson, startInterview, submitInterviewAnswer, getInterviewRoundStatus, getNextQuestion, completeInterview, abandonInterview, getPersonInterviews, getThemes, getStoryGenerationStatus, getStory } from '../api';
import { useTheme, getThemeStyle } from '../contexts/ThemeContext';

// 录音辅助函数

const InterviewPage = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const personId = searchParams.get('personId');

  const [stage, setStage] = useState('loading'); // loading | ready | interviewing | completing | done
  const [selectedThemes, setSelectedThemes] = useState([]);  // 选中的主题

  // 使用 ThemeContext
  const { themes, getThemeStyle } = useTheme();
  const [person, setPerson] = useState(null);
  const [session, setSession] = useState(null);
  const [currentRound, setCurrentRound] = useState(null);
  const [rounds, setRounds] = useState([]); // 历史轮次
  const [loading, setLoading] = useState(true);

  // 录音状态
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioBlob, setAudioBlob] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [completed, setCompleted] = useState(false);

  // 完成阶段
  const [saving, setSaving] = useState(false);
  const [storiesCreated, setStoriesCreated] = useState(0);
  const [generatedStories, setGeneratedStories] = useState([]);
  const [showExitModal, setShowExitModal] = useState(false);

  // 生成进度相关状态
  const [currentStoryId, setCurrentStoryId] = useState(null);
  const [genStatus, setGenStatus] = useState(null); // { status, has_layer2, has_layer3 }
  const [pollTimeout, setPollTimeout] = useState(false);

  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const scrollRef = useRef(null);
  const pollTimerRef = useRef(null);
  const genPollTimerRef = useRef(null);

  // 加载人物信息
  useEffect(() => {
    const fetchPerson = async () => {
      if (!personId) {
        navigate('/');
        return;
      }
      try {
        const res = await getPerson(personId);
        setPerson(res.data);

        // 检查是否继续现有采访
        const continueSessionId = searchParams.get('continue');
        if (continueSessionId) {
          // TODO: 加载已有采访
        }
      } catch (e) {
        console.error('获取人物失败:', e);
      } finally {
        setLoading(false);
        setStage('ready');  // 加载完成后进入准备阶段
      }
    };
    fetchPerson();
  }, [personId]);

  // 开始采访
  const handleStart = async () => {
    try {
      // 先进入采访界面，显示"问题生成中..."
      setStage('interviewing');
      setSession({ id: null, topic_hint: selectedThemes.join(',') });
      setRounds([{
        round_index: 1,
        question: null, // 等待生成
        transcript: null,
        audio_url: null,
      }]);

      // 然后异步创建采访并生成问题
      const res = await startInterview(personId, selectedThemes);
      const data = res.data;
      setSession({
        id: data.session_id,
        topic_hint: data.topic_hint,
      });
      setRounds([{
        round_index: data.round_index,
        question: data.question,
        transcript: null,
        audio_url: null,
      }]);
    } catch (e) {
      console.error('开始采访失败:', e);
      alert('开始失败，请重试');
      setStage('ready');
    }
  };

  // 切换主题选择
  const toggleTheme = (themeName) => {
    setSelectedThemes(prev =>
      prev.includes(themeName)
        ? prev.filter(t => t !== themeName)
        : [...prev, themeName]
    );
  };

  // 开始录音
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream);
      chunksRef.current = [];

      mediaRecorderRef.current.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorderRef.current.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        setAudioBlob(blob);
        setAudioUrl(URL.createObjectURL(blob));
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorderRef.current.start();
      setIsRecording(true);
      setRecordingTime(0);

      timerRef.current = setInterval(() => {
        setRecordingTime(t => t + 1);
      }, 1000);
    } catch (e) {
      console.error('打开麦克风失败:', e);
      alert('无法访问麦克风，请检查权限');
    }
  };

  // 停止录音
  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      // 先停止计时器
      clearInterval(timerRef.current);
      timerRef.current = null;
      // 再停止录音，确保 timer 已停
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  // 上传录音文件
  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAudioBlob(file);
    const url = URL.createObjectURL(file);
    setAudioUrl(url);
    setRecordingTime(0);
  };

  // 重新录制
  const handleReRecord = () => {
    setAudioBlob(null);
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
      setAudioUrl(null);
    }
    setRecordingTime(0);
  };

  // 提交回答
  const handleSubmit = async () => {
    if (!audioBlob || !session) return;

    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('audio_file', audioBlob);
      // 获取当前问题（最后一轮）
      const currentQuestion = rounds[rounds.length - 1]?.question || '';
      const res = await submitInterviewAnswer(session.id, formData, currentQuestion);
      const roundId = res.data.round_id;

      setCurrentRound({ id: roundId, status: 'processing' });
      setTranscribing(true);

      // 轮询转写状态
      pollTimerRef.current = setInterval(async () => {
        try {
          const statusRes = await getInterviewRoundStatus(session.id, roundId);
          const data = statusRes.data;

          if (data.status === 'done') {
            clearInterval(pollTimerRef.current);
            setTranscribing(false);

            // 更新当前轮次
            setCurrentRound({
              id: roundId,
              transcript: data.transcript,
              status: 'done'
            });

            // 更新历史
            setRounds(prev => {
              return prev.map((r, idx) =>
                idx === prev.length - 1
                  ? { ...r, id: roundId, transcript: data.transcript }
                  : r
              )
            })
          } else if (data.status === 'failed') {
            clearInterval(pollTimerRef.current);
            setTranscribing(false);
            alert('转写失败，请重新录制');
          }
        } catch (e) {
          console.error('轮询失败:', e);
        }
      }, 2000);
    } catch (e) {
      console.error('提交失败:', e);
      alert('提交失败，请重试');
    } finally {
      setSubmitting(false);
    }
  };

  // 继续下一问
  const handleNextQuestion = async (skip = false) => {
    if (!session) return;

    let roundId = null;
    if (!skip && currentRound) {
      roundId = currentRound.id;
    }

    try {
      const res = await getNextQuestion(session.id, roundId);
      const data = res.data;

      const newRound = {
        id: null,  // 提交回答后才有 id
        round_index: data.round_index,
        question: data.question,
        transcript: null,
        audio_url: null,
      };

      setRounds(prev => [...prev, newRound]);
      setCurrentRound(null);
      setAudioBlob(null);
      setAudioUrl(null);
      setRecordingTime(0);
      setTranscribing(false);

      // 自动滚动到底部
      setTimeout(() => {
        scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);

      if (data.should_end) {
        // AI 建议结束，但允许用户继续
      }
    } catch (e) {
      console.error('获取下一问失败:', e);
    }
  };

  // 结束采访
  const handleComplete = async () => {
    setStage('completing');
  };

  // 放弃采访
  const handleAbandon = async () => {
    if (!session) return;
    try {
      await abandonInterview(session.id);
      navigate(`/person/${personId}`);
    } catch (e) {
      console.error('放弃失败:', e);
    }
  };

  // 弹窗确认保存
  const handleExitModalSave = async () => {
    if (!session) return;
    try {
      setSaving(true);
      await completeInterview(session.id);
      navigate(`/person/${personId}`);
    } catch (e) {
      console.error('保存失败:', e);
      alert('保存失败，请重试');
      setSaving(false);
    }
  };

  // 弹窗确认不保存
  const handleExitModalAbandon = async () => {
    if (!session) return;
    try {
      await abandonInterview(session.id);
      navigate(`/person/${personId}`);
    } catch (e) {
      console.error('放弃失败:', e);
    }
  };

  // 保存并生成故事
  const handleSave = async () => {
    if (!session) return;

    setSaving(true);
    setPollTimeout(false);
    try {
      // 调用 complete 接口，获取 story_id
      const res = await completeInterview(session.id);
      const storyId = res.data?.story_id;
      if (!storyId) {
        throw new Error('创建故事失败');
      }
      setCurrentStoryId(storyId);

      // 开始轮询生成状态
      const startPolling = async () => {
        const startTime = Date.now();
        const maxDuration = 3 * 60 * 1000; // 3分钟超时

        const poll = async () => {
          if (Date.now() - startTime > maxDuration) {
            setPollTimeout(true);
            return;
          }

          try {
            const statusRes = await getStoryGenerationStatus(storyId);
            const status = statusRes.data;
            console.log('轮询结果:', status);  // 加这行
            setGenStatus(status);

            if (status.status === 'done') {
              // 完成，获取故事详情
              const storyRes = await getStory(storyId);
              setGeneratedStories([storyRes.data]);
              setStage('done');
            } else if (status.status === 'failed') {
              // 失败，也进入完成页面
              setStage('done');
            } else {
              // 继续轮询
              genPollTimerRef.current = setTimeout(poll, 3000);
            }
          } catch (e) {
            console.error('轮询失败:', e);
            pollTimerRef.current = setTimeout(poll, 3000);
          }
        };

        poll();
      };

      startPolling();
    } catch (e) {
      console.error('保存失败:', e);
      alert('保存失败，请重试');
      setSaving(false);
    }
  };

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  // 清理：组件卸载时放弃空记录
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      if (genPollTimerRef.current) clearTimeout(genPollTimerRef.current);
      // 如果 session 存在但没有任何轮次，自动放弃
      if (session && session.rounds?.length === 0) {
        abandonInterview(session.id).catch(console.error);
      }
    };
  }, [session]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FAF7F2] flex items-center justify-center">
        <div className="text-[#8B7355]">加载中...</div>
      </div>
    );
  }

  // ========== 阶段一：准备 ==========
  if (stage === 'ready') {
    return (
      <div className="min-h-screen bg-[#FAF7F2] flex flex-col">
        <div className="bg-white border-b border-[#E5DED3] px-4 py-4">
          <button onClick={() => navigate(`/person/${personId}`)} className="text-[#4A3728]">
            ← 返回
          </button>
        </div>

        <div className="flex-1 flex flex-col items-center p-6 overflow-auto">
          {/* 人物信息 */}
          <div className="w-20 h-20 rounded-full bg-[#C9A84C] flex items-center justify-center text-white text-3xl mb-4">
            {person?.avatar_url
              ? <img src={person.avatar_url} className="w-full h-full object-cover rounded-full" />
              : person?.name?.charAt(0)
            }
          </div>
          <h1 className="text-xl font-bold text-[#4A3728] mb-1">{person?.name}</h1>
          <p className="text-[#8B7355] text-sm mb-6">今天我们来聊聊TA的故事</p>

          {/* 主题选择 */}
          <div className="w-full max-w-sm mb-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-medium text-[#4A3728]">今天想聊什么？</h2>
              <button
                onClick={() => setSelectedThemes([])}
                className="text-xs text-gray-400"
              >
                全部都可以
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {(themes || []).map((theme) => {
                const style = getThemeStyle(themes, theme.name);
                const isSelected = selectedThemes.includes(theme.name);
                return (
                  <button
                    key={theme.name}
                    onClick={() => toggleTheme(theme.name)}
                    className={`px-3 py-1.5 rounded-full text-sm transition-colors ${
                      isSelected
                        ? 'ring-2 ring-[#C9A84C]'
                        : ''
                    }`}
                    style={{
                      backgroundColor: isSelected ? '#C9A84C' : style.bg,
                      color: isSelected ? 'white' : style.text
                    }}
                  >
                    {style.emoji} {theme.name}
                  </button>
                );
              })}
            </div>
            {selectedThemes.length === 0 && (
              <p className="text-xs text-gray-400 mt-2">不限定主题，让AI自由发挥</p>
            )}
          </div>

          {/* 开始按钮 */}
          <button
            onClick={handleStart}
            className="w-40 h-40 rounded-full bg-[#4A3728] text-white text-lg font-bold shadow-lg hover:bg-[#5A4738] transition-all"
          >
            开始采访
          </button>
        </div>
      </div>
    );
  }

  // ========== 阶段二：进行中 ==========
  if (stage === 'interviewing') {
    const roundNum = rounds.length;
    const maxRounds = 5;

    return (
      <div className="min-h-screen bg-[#FAF7F2] flex flex-col">
        {/* 顶部进度 */}
        <div className="bg-white border-b border-[#E5DED3] px-4 py-3 flex-shrink-0">
          <div className="flex items-center justify-between max-w-md mx-auto">
            <button onClick={() => setShowExitModal(true)} className="text-[#4A3728] text-sm">
              ← 退出
            </button>
            <div className="flex gap-1">
              {Array.from({ length: maxRounds }).map((_, i) => (
                <div
                  key={i}
                  className={`w-2 h-2 rounded-full ${
                    i < roundNum ? 'bg-[#C9A84C]' : 'bg-gray-300'
                  }`}
                />
              ))}
            </div>
            <span className="text-sm text-gray-500">{roundNum}/{maxRounds}轮</span>
          </div>
        </div>

        {/* 对话滚动区域 */}
        <div ref={scrollRef} className="flex-1 overflow-auto p-4">
          <div className="max-w-md mx-auto space-y-4">
            {/* 显示所有轮次 */}
            {rounds.map((r, i) => (
              <div key={i}>
                {/* AI问题：左侧气泡 */}
                <div className="flex items-start gap-2 mb-2">
                  <div className="w-7 h-7 rounded-full bg-gray-300 flex-shrink-0 flex items-center justify-center text-xs">🎙️</div>
                  <div className="bg-gray-100 rounded-xl px-3 py-2 text-sm text-[#4A3728] max-w-[80%]">
                    {r.question || '正在生成问题...'}
                  </div>
                </div>
                {/* 老人回答：右侧气泡 */}
                <div className="flex justify-end">
                  <div className="bg-[#FFF8EE] rounded-xl px-3 py-2 text-sm text-gray-700 max-w-[80%]">
                    {r.transcript ? (
                      r.transcript
                    ) : i === rounds.length - 1 && transcribing ? (
                      // 当前轮转写中
                      <span className="text-gray-400 animate-pulse">...</span>
                    ) : i === rounds.length - 1 && !transcribing && !audioUrl ? (
                      // 当前轮待录音
                      <span className="text-gray-400">点击下方麦克风回答</span>
                    ) : i === rounds.length - 1 && !transcribing && audioUrl && !currentRound ? (
                      // 当前轮已录音待提交
                      <span className="text-gray-400">回答已录制，点击"提交回答"</span>
                    ) : (
                      <span className="text-gray-400">（未录音）</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 底部固定操作区 */}
        <div className="bg-white border-t border-[#E5DED3] p-4 flex-shrink-0">
          <div className="max-w-md mx-auto">
            {/* 统一录音区域 */}
            {!currentRound && !transcribing && (
              <div className="flex flex-col items-center py-2">
                {/* 待录音状态 */}
                {!audioUrl && !isRecording && (
                  <div className="flex flex-col items-center gap-3">
                    <button
                      onClick={startRecording}
                      className="w-20 h-20 rounded-full bg-[#C9A84C] flex items-center justify-center hover:bg-[#D4B85C] transition-all shadow-lg"
                    >
                      <div className="w-16 h-16 rounded-full bg-[#D4B85C]" />
                    </button>
                    <label className="cursor-pointer px-4 py-2 border border-gray-300 rounded text-sm text-gray-500">
                      <span>上传录音文件</span>
                      <input
                        type="file"
                        accept="audio/*"
                        className="hidden"
                        onChange={handleFileSelect}
                      />
                    </label>
                  </div>
                )}

                {/* 录音中 */}
                {isRecording && (
                  <>
                    <div className="text-red-500 font-bold mb-2">{formatTime(recordingTime)}</div>
                    <button
                      onClick={stopRecording}
                      className="w-20 h-20 rounded-full bg-red-500 flex items-center justify-center shadow-lg"
                    >
                      <div className="w-16 h-16 rounded-full bg-red-600" />
                    </button>
                  </>
                )}

                {/* 已录音 */}
                {audioUrl && !isRecording && (
                  <div className="space-y-3 w-full">
                    <audio src={audioUrl} controls className="w-full" />
                    <div className="flex gap-3 justify-center">
                      <button
                        onClick={handleReRecord}
                        className="px-4 py-2 border border-gray-300 rounded"
                      >
                        重新录制
                      </button>
                      <button
                        onClick={handleSubmit}
                        disabled={submitting}
                        className="px-4 py-2 bg-[#4A3728] text-white rounded disabled:opacity-50"
                      >
                        {submitting ? '提交中...' : '提交回答'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 转写中 */}
            {transcribing && (
              <div className="flex items-center justify-center py-2">
                <div className="text-[#8B7355]">AI 转写中...</div>
              </div>
            )}

            {/* 转写完成 - 显示操作按钮 */}
            {currentRound?.status === 'done' && (
              <div className="space-y-2">
                <div className="flex gap-3">
                  <button
                    onClick={() => handleNextQuestion(false)}
                    className="flex-1 py-3 bg-[#4A3728] text-white rounded font-bold"
                  >
                    继续下一问 →
                  </button>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowExitModal(true)}
                    className="flex-1 py-2 text-gray-400 text-sm"
                  >
                    放弃
                  </button>
                  <button
                    onClick={handleComplete}
                    className="flex-1 py-2 text-gray-400 text-sm"
                  >
                    结束采访
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 跳过按钮 */}
        {!currentRound && !transcribing && !isRecording && (
          <div className="text-center pb-3">
            <button
              onClick={() => handleNextQuestion(true)}
              className="text-xs text-gray-400"
            >
              跳过这个问题 →
            </button>
          </div>
        )}

        {/* 退出确认弹窗 */}
        {showExitModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl p-6 m-4 max-w-sm w-full">
              <h3 className="text-lg font-bold text-[#4A3728] mb-2 text-center">
                是否保存当前记录？
              </h3>
              <p className="text-sm text-gray-500 mb-6 text-center">
                共 {rounds.length} 轮对话
              </p>
              <div className="space-y-3">
                <button
                  onClick={handleExitModalSave}
                  disabled={saving}
                  className="w-full py-3 bg-[#4A3728] text-white rounded font-bold disabled:opacity-50"
                >
                  {saving ? '保存中...' : '保存'}
                </button>
                <button
                  onClick={handleExitModalAbandon}
                  className="w-full py-3 border border-gray-300 rounded text-gray-600"
                >
                  不保存
                </button>
                <button
                  onClick={() => setShowExitModal(false)}
                  className="w-full py-2 text-gray-400 text-sm"
                >
                  取消
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ========== 阶段三：完成确认 ==========
  if (stage === 'completing') {
    // 轮询超时，显示提示
    if (pollTimeout) {
      return (
        <div className="min-h-screen bg-[#FAF7F2] flex flex-col">
          <div className="bg-white border-b border-[#E5DED3] px-4 py-4 text-center">
            <h1 className="text-lg font-bold text-[#4A3728]">生成需要一点时间</h1>
          </div>
          <div className="flex-1 p-4 flex items-center justify-center">
            <div className="text-center text-gray-500">
              <p className="mb-4">故事已保存，稍后可在故事库查看</p>
              <button
                onClick={() => navigate('/')}
                className="py-2 px-6 bg-[#4A3728] text-white rounded"
              >
                返回主页
              </button>
            </div>
          </div>
        </div>
      );
    }

    const isLayer1Done = !!currentStoryId; // 有 story_id 就说明对话记录已保存
    const isLayer2Done = genStatus?.has_layer2 === true;
    const isLayer3Done = genStatus?.has_layer3 === true;

    return (
      <div className="min-h-screen bg-[#FAF7F2] flex flex-col">
        <div className="bg-white border-b border-[#E5DED3] px-4 py-4 text-center">
          <h1 className="text-lg font-bold text-[#4A3728]">正在生成故事</h1>
        </div>

        <div className="flex-1 p-4 overflow-auto">
          <div className="max-w-sm mx-auto">
            {/* 采访摘要 */}
            <div className="bg-white rounded-xl p-4 shadow-sm mb-6">
              <p className="text-center text-[#8B7355] mb-2">
                共 {rounds.length} 轮对话
              </p>
              <p className="text-center text-sm text-gray-400">
                主题：{session?.topic_hint || '未指定'}
              </p>
            </div>

            {/* 进度指示器 */}
            <div className="bg-white rounded-xl p-4 shadow-sm mb-6">
              {/* 阶段1：对话记录 */}
              <div className="flex items-center gap-3 mb-4">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-white text-sm ${
                  isLayer1Done ? 'bg-green-500' : 'bg-gray-300'
                }`}>
                  {isLayer1Done ? '✓' : '1'}
                </div>
                <span className="text-sm text-gray-600">对话记录已保存</span>
              </div>

              {/* 阶段2：结构化信息 */}
              <div className="flex items-center gap-3 mb-4">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-white text-sm ${
                  isLayer2Done ? 'bg-green-500' : 'bg-orange-400'
                }`}>
                  {isLayer2Done ? '✓' : '2'}
                </div>
                <span className="text-sm text-gray-600">
                  {isLayer2Done ? '结构化信息已提取' : 'AI 正在提炼结构化信息...'}
                </span>
              </div>
              {isLayer2Done && genStatus && (
                <div className="ml-9 text-xs text-gray-500 mb-4">
                  标题：{generatedStories[0]?.title || '未生成'}
                </div>
              )}

              {/* 阶段3：叙事文章 */}
              <div className="flex items-center gap-3">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-white text-sm ${
                  isLayer3Done ? 'bg-green-500' : 'bg-gray-300'
                }`}>
                  {isLayer3Done ? '✓' : '3'}
                </div>
                <span className="text-sm text-gray-600">
                  {isLayer3Done ? '叙事文章已生成' : 'AI 正在撰写故事文章...'}
                </span>
              </div>
              {isLayer3Done && generatedStories[0]?.narrative_polish && (
                <div className="ml-9 text-xs text-gray-500 mt-2">
                  {generatedStories[0].narrative_polish.slice(0, 100)}...
                </div>
              )}
            </div>

            {/* 完成按钮（仅完成后显示） */}
            {isLayer3Done && (
              <div className="space-y-3">
                <div className="text-center text-green-600 font-bold mb-4">故事已生成</div>
                <div className="bg-white rounded-xl p-4 shadow-sm mb-4">
                  <div className="text-lg font-bold text-[#4A3728] text-center mb-2">
                    {generatedStories[0]?.title || '故事'}
                  </div>
                  <div className="text-sm text-gray-600">
                    {generatedStories[0]?.narrative_polish?.slice(0, 100)}...
                  </div>
                </div>
                <button
                  onClick={() => navigate('/story/' + currentStoryId)}
                  className="w-full py-3 bg-[#4A3728] text-white rounded font-bold"
                >
                  查看完整故事
                </button>
                <button
                  onClick={() => navigate('/')}
                  className="w-full py-3 border border-gray-300 rounded text-gray-600"
                >
                  返回主页
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ========== 完成 ==========
  if (stage === 'done') {
    return (
      <div className="min-h-screen bg-[#FAF7F2] flex flex-col">
        <div className="flex-1 p-4 flex flex-col items-center justify-center">
          <div className="text-4xl mb-4">✨</div>
          <h1 className="text-xl font-bold text-[#4A3728] mb-2">采访已完成</h1>
          <p className="text-[#8B7355] mb-6">
            本次采访生成了 {storiesCreated} 个故事
          </p>

          <button
            onClick={() => navigate(`/person/${personId}`)}
            className="px-6 py-3 bg-[#4A3728] text-white rounded font-bold"
          >
            返回人物主页
          </button>
        </div>
      </div>
    );
  }

  // 默认加载状态
  return (
    <div className="min-h-screen bg-[#FAF7F2] flex items-center justify-center">
      <div className="text-[#8B7355]">加载中...</div>
    </div>
  );
};

export default InterviewPage;