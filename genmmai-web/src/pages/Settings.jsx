import React from 'react';
import { useNavigate } from 'react-router-dom';

const Settings = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-[#FAF7F2]">
      {/* 头部 */}
      <div className="bg-white border-b border-[#E5DED3] p-4">
        <div className="max-w-md mx-auto flex items-center justify-between">
          <button onClick={() => navigate('/')} className="text-[#4A3728]">← 返回</button>
          <h1 className="text-lg font-bold text-[#5C3D2E]">设置</h1>
          <div className="w-10" />
        </div>
      </div>

      <div className="max-w-md mx-auto p-4">
        <div className="bg-white rounded-lg border border-[#E5DED3] p-4">
          <h2 className="text-lg font-bold text-[#5C3D2E] mb-4">设置</h2>
          <p className="text-gray-500">功能开发中...</p>
        </div>
      </div>
    </div>
  );
};

export default Settings;