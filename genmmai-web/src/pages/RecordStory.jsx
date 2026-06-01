import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { getPerson } from '../api';

const RecordStory = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const personId = searchParams.get('personId');
  const [person, setPerson] = useState(null);
  const [loading, setLoading] = useState(true);

  // 录音状态
  const [isRecording, setIsRecording] = useState(false);
  const [audioUrl, setAudioUrl] = useState(null);
  const [recordingTime, setRecordingTime] = useState(0);
  const [error, setError] = useState(null);

  // Refs
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const audioRef = useRef(null);

  useEffect(() => {
    const fetchPerson = async () => {
      if (!personId) {
        setLoading(false);
        return;
      }
      try {
        const response = await getPerson(personId);
        setPerson(response.data);
      } catch (err) {
        console.error('获取人物信息失败:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchPerson();
  }, [personId]);

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
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start(1000);
      setIsRecording(true);
      setRecordingTime(0);

      // 开始计时
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
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FAF7F2] flex items-center justify-center">
        <div className="text-[#4A3728]">加载中...</div>
      </div>
    );
  }

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

      {/* 错误提示 */}
      {error && (
        <div className="bg-red-50 border border-red-200 mx-4 mt-4 p-3 rounded-lg">
          <p className="text-red-600 text-sm text-center">{error}</p>
        </div>
      )}

      {/* 录音区域 */}
      <div className="flex-1 flex flex-col items-center justify-center p-8">
        {/* 计时器 */}
        {(isRecording || audioUrl) && (
          <div className="text-3xl font-mono text-[#4A3728] mb-8">
            {formatTime(recordingTime)}
          </div>
        )}

        {/* 录音按钮 */}
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
          <p className="mt-6 text-[#6B4F35]">
            点击开始录音
          </p>
        )}

        {/* 录音中提示 */}
        {isRecording && (
          <p className="mt-6 text-red-500 font-medium">
            录音中...
          </p>
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
                onClick={() => alert('下一步')}
                className="flex-1 py-3 bg-[#4A3728] text-white rounded-lg hover:bg-[#5A4738]"
              >
                下一步
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default RecordStory;