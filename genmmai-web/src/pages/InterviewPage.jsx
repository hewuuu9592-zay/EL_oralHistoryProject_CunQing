import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { getPerson, startInterview, submitInterviewAnswer, getInterviewRoundStatus, getNextQuestion, completeInterview, abandonInterview, getPersonInterviews } from '../api';

// 录音辅助函数

const InterviewPage = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const personId = searchParams.get('personId');

  const [stage, setStage] = useState('loading'); // loading | ready | interviewing | completing | done
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

  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const pollTimerRef = useRef(null);

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
      } catch (e) {
        console.error('获取人物失败:', e);
      } finally {
        setLoading(false);
      }
    };
    fetchPerson();
  }, [personId]);

  // 开始采访
  const handleStart = async () => {
    try {
      const res = await startInterview(personId);
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
      setStage('interviewing');
    } catch (e) {
      console.error('开始采访失败:', e);
      alert('开始失败，请重试');
    }
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
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      clearInterval(timerRef.current);
    }
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
      const res = await submitInterviewAnswer(session.id, formData);
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
            setRounds(prev => prev.map(r =>
              r.round_index === (session.round_index || rounds.length)
                ? { ...r, transcript: data.transcript }
                : r
            ));
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
      const res = await getNextQuestion(session.id, roundId || '');
      const data = res.data;

      const newRound = {
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

  // 保存并生成故事
  const handleSave = async () => {
    if (!session) return;

    setSaving(true);
    try {
      await completeInterview(session.id);

      // 等待一下再查询
      await new Promise(r => setTimeout(r, 2000));

      // 查询该人物的采访记录
      const interviewsRes = await getPersonInterviews(personId);
      const sessions = interviewsRes.data || [];
      const latestSession = sessions.find(s => s.session_id === session.id);

      setStoriesCreated(latestSession?.stories_created || 0);
      setStage('done');
    } catch (e) {
      console.error('保存失败:', e);
      alert('保存失败，请重试');
    } finally {
      setSaving(false);
    }
  };

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  // 清理
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, []);

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

        <div className="flex-1 flex flex-col items-center justify-center p-6">
          <div className="w-24 h-24 rounded-full bg-[#C9A84C] flex items-center justify-center text-white text-4xl mb-4">
            {person?.avatar_url
              ? <img src={person.avatar_url} className="w-full h-full object-cover rounded-full" />
              : person?.name?.charAt(0)
            }
          </div>
          <h1 className="text-2xl font-bold text-[#4A3728] mb-2">{person?.name}</h1>
          <p className="text-[#8B7355] mb-8">想和您聊聊天</p>

          <div className="bg-white rounded-xl p-6 shadow-sm max-w-sm w-full mb-8">
            <p className="text-center text-[#4A3728]">
              今天想聊聊<span className="font-bold text-[#C9A84C]">{session?.topic_hint || '您的人生故事'}</span>
            </p>
            <p className="text-center text-gray-500 text-sm mt-2">
              我们会进行几轮对话，您只需要放松地讲述就可以了
            </p>
          </div>

          <button
            onClick={handleStart}
            className="w-48 h-48 rounded-full bg-[#4A3728] text-white text-xl font-bold shadow-lg hover:bg-[#5A4738] transition-all"
          >
            开始采访
          </button>
        </div>
      </div>
    );
  }

  // ========== 阶段二：进行中 ==========
  if (stage === 'interviewing') {
    const currentQ = rounds[rounds.length - 1]?.question || '请分享您的故事...';
    const roundNum = rounds.length;
    const maxRounds = 5;

    return (
      <div className="min-h-screen bg-[#FAF7F2] flex flex-col">
        {/* 顶部进度 */}
        <div className="bg-white border-b border-[#E5DED3] px-4 py-3">
          <div className="flex items-center justify-between max-w-md mx-auto">
            <button onClick={() => navigate(`/person/${personId}`)} className="text-[#4A3728] text-sm">
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

        {/* 历史轮次 */}
        <div className="flex-1 overflow-auto p-4">
          <div className="max-w-md mx-auto space-y-4">
            {rounds.slice(0, -1).map((r, i) => (
              <div key={i} className="bg-white rounded-lg p-3 shadow-sm">
                <div className="text-xs text-gray-400 mb-1">第{i + 1}轮</div>
                <div className="text-sm text-[#4A3728] mb-2">👤 {r.question}</div>
                {r.transcript && (
                  <div className="text-sm text-gray-600 pl-3 border-l-2 border-gray-200">
                    {r.transcript.slice(0, 100)}...
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* 当前轮次 */}
        <div className="p-4 bg-white border-t border-[#E5DED3]">
          <div className="max-w-md mx-auto">
            {/* AI问题气泡 */}
            <div className="flex items-start gap-3 mb-4">
              <div className="w-8 h-8 rounded-full bg-gray-300 flex-shrink-0 flex items-center justify-center text-sm">🤖</div>
              <div className="bg-gray-100 rounded-xl px-4 py-3 text-[#4A3728]">
                {currentQ}
              </div>
            </div>

            {/* 录音按钮区域 */}
            {!currentRound && !transcribing && (
              <div className="flex flex-col items-center py-4">
                {!audioUrl ? (
                  <button
                    onClick={startRecording}
                    className={`w-20 h-20 rounded-full flex items-center justify-center transition-all ${
                      isRecording ? 'bg-red-500 animate-pulse' : 'bg-[#C9A84C]'
                    }`}
                  >
                    <div className={`w-16 h-16 rounded-full ${isRecording ? 'bg-red-600' : 'bg-[#D4B85C]'}`} />
                  </button>
                ) : (
                  <div className="flex gap-3">
                    <button onClick={handleReRecord} className="px-4 py-2 border border-gray-300 rounded">
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
                )}
              </div>
            )}

            {/* 录音中 */}
            {isRecording && (
              <div className="flex flex-col items-center py-4">
                <div className="text-red-500 font-bold mb-2">{formatTime(recordingTime)}</div>
                <button
                  onClick={stopRecording}
                  className="w-20 h-20 rounded-full bg-red-500 flex items-center justify-center"
                >
                  <div className="w-16 h-16 rounded-full bg-red-600" />
                </button>
              </div>
            )}

            {/* 转写中 */}
            {transcribing && (
              <div className="flex items-center justify-center py-4">
                <div className="text-[#8B7355]">AI 转写中...</div>
              </div>
            )}

            {/* 转写完成 */}
            {currentRound?.status === 'done' && (
              <div className="space-y-3">
                <div className="bg-white rounded-lg p-3 shadow-sm">
                  <div className="text-xs text-gray-400 mb-1">您的回答</div>
                  <div className="text-sm text-gray-700">{currentRound.transcript}</div>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => handleNextQuestion(false)}
                    className="flex-1 py-3 bg-[#4A3728] text-white rounded font-bold"
                  >
                    继续下一问 →
                  </button>
                </div>
                <button
                  onClick={handleComplete}
                  className="w-full py-2 text-gray-400 text-sm"
                >
                  结束采访
                </button>
              </div>
            )}
          </div>
        </div>

        {/* 跳过按钮 */}
        {!currentRound && !transcribing && !isRecording && (
          <div className="text-center pb-4">
            <button
              onClick={() => handleNextQuestion(true)}
              className="text-xs text-gray-400"
            >
              跳过这个问题 →
            </button>
          </div>
        )}
      </div>
    );
  }

  // ========== 阶段三：完成确认 ==========
  if (stage === 'completing') {
    return (
      <div className="min-h-screen bg-[#FAF7F2] flex flex-col">
        <div className="bg-white border-b border-[#E5DED3] px-4 py-4 text-center">
          <h1 className="text-lg font-bold text-[#4A3728]">采访完成</h1>
        </div>

        <div className="flex-1 p-4 overflow-auto">
          <div className="max-w-sm mx-auto">
            <div className="bg-white rounded-xl p-4 shadow-sm mb-6">
              <p className="text-center text-[#8B7355] mb-4">
                共 {rounds.length} 轮对话
              </p>
              <div className="space-y-2">
                {rounds.map((r, i) => (
                  <div key={i} className="text-sm text-gray-600">
                    <span className="text-gray-400">{i + 1}.</span> {r.question}
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <button
                onClick={handleAbandon}
                className="w-full py-3 border border-gray-300 rounded text-gray-600"
              >
                放弃这次采访
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="w-full py-3 bg-[#4A3728] text-white rounded font-bold disabled:opacity-50"
              >
                {saving ? 'AI 正在整理故事...' : '保存并生成故事'}
              </button>
            </div>
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