import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getThemesWithCount, createTheme, deleteTheme, updateTheme } from '../api';
import { useTheme, getThemeStyle } from '../contexts/ThemeContext';

const THEMES_PRESET = [
  { color_bg: '#DCFCE7', color_text: '#166534' },
  { color_bg: '#DBEAFE', color_text: '#1E40AF' },
  { color_bg: '#FCE7F9', color_text: '#9D174D' },
  { color_bg: '#FEF9C3', color_text: '#854D0E' },
  { color_bg: '#FFEDD5', color_text: '#9A3412' },
  { color_bg: '#F3F4F6', color_text: '#374151' },
];

const Settings = () => {
  const navigate = useNavigate();
  const { refreshThemes } = useTheme();
  const [themes, setThemes] = useState([]);
  const [loading, setLoading] = useState(true);

  // 新增主题表单
  const [newTheme, setNewTheme] = useState({ name: '', emoji: '', color_bg: THEMES_PRESET[0].color_bg, color_text: THEMES_PRESET[0].color_text });
  const [saving, setSaving] = useState(false);

  // 编辑状态
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});

  useEffect(() => {
    fetchThemes();
  }, []);

  const fetchThemes = async () => {
    try {
      const res = await getThemesWithCount();
      setThemes(res.data || []);
    } catch (e) {
      console.error('加载主题失败:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleAddTheme = async (e) => {
    e.preventDefault();
    if (!newTheme.name.trim()) return;

    setSaving(true);
    try {
      await createTheme(newTheme);
      await refreshThemes();
      await fetchThemes();
      setNewTheme({ name: '', emoji: '', color_bg: THEMES_PRESET[0].color_bg, color_text: THEMES_PRESET[0].color_text });
    } catch (e) {
      console.error('创建主题失败:', e);
      alert('创建失败: ' + (e.response?.data?.detail || e.message));
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteTheme = async (id, name, count) => {
    if (!confirm(`确定删除主题"${name}"？\n该主题下的${count}条故事将归入"其他"。`)) return;

    try {
      await deleteTheme(id);
      await refreshThemes();
      await fetchThemes();
    } catch (e) {
      console.error('删除失败:', e);
      alert('删除失败: ' + (e.response?.data?.detail || e.message));
    }
  };

  const handleEditStart = (theme) => {
    setEditingId(theme.id);
    setEditForm({ name: theme.name, emoji: theme.emoji || '' });
  };

  const handleEditSave = async (id) => {
    try {
      await updateTheme(id, editForm);
      await refreshThemes();
      await fetchThemes();
      setEditingId(null);
    } catch (e) {
      console.error('更新失败:', e);
      alert('更新失败');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FAF7F2] flex items-center justify-center">
        <div className="text-[#8B7355]">加载中...</div>
      </div>
    );
  }

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
        {/* 主题管理 */}
        <div className="bg-white rounded-lg border border-[#E5DED3] p-4">
          <h2 className="text-lg font-bold text-[#5C3D2E] mb-4">主题管理</h2>

          {/* 主题列表 */}
          <div className="space-y-2 mb-4">
            {themes.map(theme => {
              const style = { backgroundColor: theme.color_bg, color: theme.color_text };

              return (
                <div key={theme.id} className="flex items-center gap-3 p-3 bg-[#FAF7F2] rounded-lg">
                  {/* Emoji + 名称 */}
                  <span className="text-xl">{theme.emoji}</span>
                  <div className="flex-1">
                    <div className="font-medium text-[#4A3728]">{theme.name}</div>
                    <div className="text-xs text-gray-500">{theme.story_count} 条故事</div>
                  </div>

                  {/* 预设标签 */}
                  {theme.is_default && (
                    <span className="text-xs px-2 py-1 bg-gray-200 text-gray-500 rounded-full">预设</span>
                  )}

                  {/* 操作按钮 */}
                  {!theme.is_default && (
                    <div className="flex gap-2">
                      {editingId === theme.id ? (
                        <>
                          <input
                            className="w-20 border rounded px-1 py-0.5 text-sm"
                            value={editForm.name}
                            onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                          />
                          <input
                            className="w-10 border rounded px-1 py-0.5 text-sm"
                            value={editForm.emoji}
                            onChange={(e) => setEditForm({ ...editForm, emoji: e.target.value })}
                          />
                          <button
                            onClick={() => handleEditSave(theme.id)}
                            className="text-sm text-[#C9A84C]"
                          >
                            保存
                          </button>
                          <button
                            onClick={() => setEditingId(null)}
                            className="text-sm text-gray-500"
                          >
                            取消
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => handleEditStart(theme)}
                            className="text-sm text-[#8B7355]"
                          >
                            编辑
                          </button>
                          <button
                            onClick={() => handleDeleteTheme(theme.id, theme.name, theme.story_count)}
                            className="text-sm text-red-500"
                          >
                            删除
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* 新增主题 */}
          <form onSubmit={handleAddTheme} className="border-t border-[#E5DED3] pt-4">
            <h3 className="text-sm font-bold text-[#8B7355] mb-3">新增主题</h3>

            <div className="space-y-3">
              {/* Emoji + 名称行 */}
              <div className="flex gap-2">
                <input
                  className="w-12 border border-[#D4C4B0] rounded px-2 py-2 text-center"
                  placeholder="😀"
                  value={newTheme.emoji}
                  onChange={(e) => setNewTheme({ ...newTheme, emoji: e.target.value })}
                />
                <input
                  className="flex-1 border border-[#D4C4B0] rounded px-2 py-2"
                  placeholder="主题名称"
                  value={newTheme.name}
                  onChange={(e) => setNewTheme({ ...newTheme, name: e.target.value })}
                />
              </div>

              {/* 颜色选择 */}
              <div className="flex gap-2 items-center">
                <span className="text-sm text-gray-500">颜色：</span>
                {THEMES_PRESET.map((preset, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setNewTheme({ ...newTheme, color_bg: preset.color_bg, color_text: preset.color_text })}
                    className={`w-8 h-8 rounded-full transition-transform ${
                      newTheme.color_bg === preset.color_bg ? 'scale-110 ring-2 ring-[#C9A84C]' : ''
                    }`}
                    style={{ backgroundColor: preset.color_bg }}
                  />
                ))}
              </div>

              {/* 预览 */}
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500">预览：</span>
                <span
                  className="px-3 py-1 rounded-full"
                  style={{ backgroundColor: newTheme.color_bg, color: newTheme.color_text }}
                >
                  {newTheme.emoji || '😀'} {newTheme.name || '主题名'}
                </span>
              </div>

              {/* 确认添加按钮 */}
              <button
                type="submit"
                disabled={saving || !newTheme.name.trim()}
                className="w-full py-2 bg-[#5C3D2E] text-white rounded-lg disabled:opacity-50"
              >
                {saving ? '添加中...' : '确认添加'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Settings;