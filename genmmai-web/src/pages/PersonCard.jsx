import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getPerson } from '../api';

const PersonCard = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [person, setPerson] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('timeline');

  useEffect(() => {
    const fetchPerson = async () => {
      try {
        const response = await getPerson(id);
        setPerson(response.data);
      } catch (error) {
        console.error('获取人物数据失败:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchPerson();
  }, [id]);

  const handleEdit = () => {
    alert('编辑');
  };

  const getNameInitial = (name) => {
    return name ? name.charAt(0) : '?';
  };

  const formatYears = (birthYear, deathYear) => {
    if (birthYear) {
      if (deathYear) {
        return `${birthYear} - ${deathYear}`;
      }
      return `${birthYear}+`;
    }
    return '';
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FAF7F2] flex items-center justify-center">
        <div className="text-[#4A3728]">加载中...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAF7F2]">
      {/* Header 区域 - 白色卡片带浅棕色底边线 */}
      <div className="bg-white border-b border-[#E5DED3] pb-6 pt-4 px-4">
        <div className="max-w-md mx-auto">
          {/* 返回按钮和编辑按钮行 */}
          <div className="flex justify-between items-start mb-4">
            <button
              onClick={() => navigate('/')}
              className="text-[#4A3728] hover:opacity-70"
            >
              ← 返回
            </button>
            <button
              onClick={handleEdit}
              className="text-[#4A3728] hover:opacity-70"
            >
              编辑
            </button>
          </div>

          {/* 头像区域 */}
          <div className="flex flex-col items-center">
            {person?.avatar ? (
              <img
                src={person.avatar}
                alt={person.name}
                className="w-[100px] h-[100px] rounded-full object-cover"
              />
            ) : (
              <div className="w-[100px] h-[100px] rounded-full bg-[#D4A574] flex items-center justify-center text-white text-4xl font-bold">
                {getNameInitial(person?.name)}
              </div>
            )}

            {/* 姓名 */}
            <h1 className="mt-4 text-2xl font-bold text-[#4A3728]">
              {person?.name || '未知'}
            </h1>

            {/* 生卒年 */}
            <p className="mt-1 text-sm text-gray-500">
              {formatYears(person?.birth_year, person?.death_year)}
            </p>

            {/* 一句话简介 */}
            <p className="mt-2 text-sm italic text-gray-500 text-center max-w-xs">
              {person?.bio || ''}
            </p>
          </div>
        </div>
      </div>

      {/* Tab 导航 */}
      <div className="bg-white border-b border-[#E5DED3]">
        <div className="max-w-md mx-auto flex">
          {[
            { key: 'relations', label: '人际关系图' },
            { key: 'timeline', label: '个人时间轴' },
            { key: 'stories', label: '主题故事集' },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 py-3 text-sm relative ${
                activeTab === tab.key
                  ? 'text-[#4A3728] font-medium'
                  : 'text-gray-400'
              }`}
            >
              {tab.label}
              {activeTab === tab.key && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#4A3728]" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* 内容区域 */}
      <div className="p-4">
        <div className="max-w-md mx-auto">
          {activeTab === 'relations' && (
            <p className="text-gray-500">人际关系图（开发中）</p>
          )}
          {activeTab === 'timeline' && (
            <p className="text-gray-500">个人时间轴（开发中）</p>
          )}
          {activeTab === 'stories' && (
            <p className="text-gray-500">主题故事集（开发中）</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default PersonCard;