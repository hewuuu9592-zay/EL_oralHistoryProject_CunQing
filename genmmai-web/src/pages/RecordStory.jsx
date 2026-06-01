import React from 'react';

const RecordStory = () => {
  return (
    <div className="p-8 flex flex-col items-center">
      <h2 className="text-3xl font-serif text-[#4A3728] mb-8">记录家族故事</h2>
      <div className="w-64 h-64 bg-[#E8E2D6] rounded-full flex items-center justify-center cursor-pointer hover:bg-[#DED5C5] transition-colors border-4 border-[#8B5E3C]">
        <span className="text-5xl">🎙️</span>
      </div>
      <p className="mt-6 text-[#6B4F35]">点击麦克风开始录音</p>
    </div>
  );
};

export default RecordStory;
