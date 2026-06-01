import React from 'react';
import { useNavigate } from 'react-router-dom';

const FamilyTree = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-[#F5F1E9] flex flex-col items-center justify-center p-4">
      <div className="text-center">
        <h1 className="text-6xl font-serif text-[#4A3728] mb-4">根脉</h1>
        <p className="text-xl text-[#6B4F35] mb-8">记录家族的声音与故事</p>
        <button 
          onClick={() => navigate('/record')}
          className="px-8 py-3 bg-[#8B5E3C] text-white rounded-full hover:bg-[#6D4A2E] transition-colors shadow-lg"
        >
          开始记录
        </button>
      </div>
    </div>
  );
};

export default FamilyTree;
