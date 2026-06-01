import React from 'react';
import { useParams } from 'react-router-dom';

const PersonCard = () => {
  const { id } = useParams();
  return (
    <div className="p-8">
      <h2 className="text-3xl font-serif text-[#4A3728]">人物详情 ID: {id}</h2>
      <p className="mt-4">这里将显示人物的生平和故事列表。</p>
    </div>
  );
};

export default PersonCard;
