/**
 * ResizableSplitter组件
 * 可拖拽的分割条,用于调整左右分屏比例
 */

/**
 * 创建可拖拽的分割条
 * @param {Function} onResize - 比例变化时的回调函数 (ratio) => void
 * @returns {HTMLElement} - 分割条DOM元素
 */
export function createSplitter(onResize) {
  let isDragging = false;
  let rafId = null; // requestAnimationFrame ID,用于性能优化

  // 创建分割条元素
  const splitter = document.createElement('div');
  splitter.className = 'resizable-splitter';
  splitter.setAttribute('role', 'separator');
  splitter.setAttribute('aria-label', '拖拽调整左右分屏比例');

  // 创建拖拽手柄(可视化提示)
  const handle = document.createElement('div');
  handle.className = 'splitter-handle';
  splitter.appendChild(handle);

  /**
   * 计算并更新分屏比例
   * @param {number} clientX - 鼠标X坐标
   */
  function updateRatio(clientX) {
    const windowWidth = window.innerWidth;
    const ratio = (clientX / windowWidth) * 100;

    // 限制比例范围: 20% - 80%
    const clampedRatio = Math.max(20, Math.min(80, ratio));

    // 调用回调函数
    if (onResize) {
      onResize(clampedRatio);
    }
  }

  /**
   * 鼠标按下事件 - 开始拖拽
   */
  function handleMouseDown(e) {
    e.preventDefault();
    isDragging = true;

    // 改变鼠标样式
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none'; // 防止文本选中

    // 添加拖拽中的视觉反馈
    splitter.classList.add('dragging');

    // 仅在拖动开始时添加监听器，减少性能开销
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }

  /**
   * 鼠标移动事件 - 拖拽中
   */
  function handleMouseMove(e) {
    if (!isDragging) return;

    // 使用requestAnimationFrame优化性能,避免过度渲染
    if (rafId) {
      cancelAnimationFrame(rafId);
    }

    rafId = requestAnimationFrame(() => {
      updateRatio(e.clientX);
    });
  }

  /**
   * 鼠标释放事件 - 结束拖拽
   */
  function handleMouseUp() {
    if (!isDragging) return;

    isDragging = false;

    // 恢复鼠标样式
    document.body.style.cursor = '';
    document.body.style.userSelect = '';

    // 移除拖拽中的视觉反馈
    splitter.classList.remove('dragging');

    // 清理requestAnimationFrame
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }

    // 拖动结束后移除监听器，避免空闲时占用资源
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
  }

  // 绑定事件监听器（只在分割条上绑定mousedown，mousemove和mouseup按需添加）
  splitter.addEventListener('mousedown', handleMouseDown);

  // 触摸事件处理函数
  function handleTouchMove(e) {
    if (!isDragging) return;
    const touch = e.touches[0];
    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(() => {
      updateRatio(touch.clientX);
    });
  }

  function handleTouchEnd() {
    if (!isDragging) return;
    isDragging = false;
    splitter.classList.remove('dragging');
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    // 移除触摸监听器
    document.removeEventListener('touchmove', handleTouchMove);
    document.removeEventListener('touchend', handleTouchEnd);
  }

  // 触摸事件支持(移动端) - 按需添加监听器
  splitter.addEventListener('touchstart', (e) => {
    e.preventDefault();
    isDragging = true;
    splitter.classList.add('dragging');
    // 开始触摸时才添加监听器
    document.addEventListener('touchmove', handleTouchMove);
    document.addEventListener('touchend', handleTouchEnd);
  });

  // 清理函数(供外部调用)
  splitter.destroy = () => {
    // 清理可能残留的监听器
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
    document.removeEventListener('touchmove', handleTouchMove);
    document.removeEventListener('touchend', handleTouchEnd);
    if (rafId) cancelAnimationFrame(rafId);
  };

  return splitter;
}
