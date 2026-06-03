import React, { createContext, useContext, useState, useEffect } from 'react';
import { getThemes } from '../api';

const ThemeContext = createContext(null);

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context;
};

// 辅助函数：从主题列表获取颜色样式
export const getThemeStyle = (themes, themeName) => {
  if (!themes || !themeName) {
    return { bg: '#F3F4F6', text: '#374151', emoji: '📖' };
  }
  const theme = themes.find(t => t.name === themeName);
  if (!theme) {
    return { bg: '#F3F4F6', text: '#374151', emoji: '📖' };
  }
  return {
    bg: theme.color_bg || '#F3F4F6',
    text: theme.color_text || '#374151',
    emoji: theme.emoji || '📖'
  };
};

// 辅助函数：从主题列表获取 emoji
export const getThemeEmoji = (themes, themeName) => {
  if (!themes || !themeName) return '📖';
  const theme = themes.find(t => t.name === themeName);
  return theme?.emoji || '📖';
};

export const ThemeProvider = ({ children }) => {
  const [themes, setThemes] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchThemes = async () => {
      try {
        const res = await getThemes();
        setThemes(res.data || []);
      } catch (e) {
        console.error('加载主题失败:', e);
      } finally {
        setLoading(false);
      }
    };
    fetchThemes();
  }, []);

  // 刷新主题
  const refreshThemes = async () => {
    try {
      const res = await getThemes();
      setThemes(res.data || []);
    } catch (e) {
      console.error('刷新主题失败:', e);
    }
  };

  return (
    <ThemeContext.Provider value={{ themes, loading, refreshThemes, getThemeStyle, getThemeEmoji }}>
      {children}
    </ThemeContext.Provider>
  );
};

export default ThemeContext;