/**
 * 涂鸦管理器初始化脚本
 * 在主页面添加涂鸦管理入口按钮
 */

import { createDrawingManager } from './components/DrawingManager.js';

/**
 * 初始化涂鸦管理入口
 */
export function initDrawingManagerButton() {
  // 查找或创建工具栏
  let toolbar = document.querySelector('.main-toolbar');

  if (!toolbar) {
    // 如果没有工具栏，创建一个
    toolbar = document.createElement('div');
    toolbar.className = 'main-toolbar';

    // 插入到页面顶部
    const body = document.body;
    body.insertBefore(toolbar, body.firstChild);
  }

  // 创建涂鸦管理按钮
  const drawingMangerBtn = document.createElement('button');
  drawingMangerBtn.className = 'drawing-manager-button';
  drawingMangerBtn.innerHTML = `
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M12 19l7-7 3 3-7 7-3-3z"/>
      <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/>
      <path d="M2 2l7.586 7.586"/>
      <circle cx="11" cy="11" r="2"/>
    </svg>
    <span>涂鸦管理</span>
  `;
  drawingMangerBtn.title = '管理所有课程的涂鸦';

  // 点击事件
  drawingMangerBtn.addEventListener('click', async () => {
    const manager = await createDrawingManager();
    document.body.appendChild(manager);
  });

  toolbar.appendChild(drawingMangerBtn);

  console.log('[DrawingManager] Initialization complete');
}

// 页面加载完成后自动初始化
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initDrawingManagerButton);
} else {
  initDrawingManagerButton();
}
