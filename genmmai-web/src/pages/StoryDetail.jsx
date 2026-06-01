import React from 'react';
import { useParams } from 'react-router-dom';

const StoryDetail = () => {
  const { id } = useParams();
  return (
    <div className="p-8">
      <h2 className="text-3xl font-serif text-[#4A3728]">故事详情 ID: {id}</h2>
      <p className="mt-4">这里将显示家族故事的具体内容和语音回放。</p>
    </div>
  );
};

export default StoryDetail;
