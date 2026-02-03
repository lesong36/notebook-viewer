/**
 * HtmlViewer组件
 * 负责加载和渲染HTML可视化内容
 * 画笔功能已移至 GlobalDrawingCanvas.js
 * 包含 iframe 遮罩层用于画笔事件捕获
 */

/**
 * 创建HTML查看器
 * @param {string} lessonId - 课程ID (如 'L2-01')
 * @param {HTMLElement} container - 容器DOM元素
 * @returns {Promise<void>}
 */
export async function createHtmlViewer(lessonId, container) {
  // 清空容器
  container.innerHTML = '';

  // 创建iframe容器
  const iframeWrapper = document.createElement('div');
  iframeWrapper.className = 'html-viewer-wrapper';
  
  // 创建 iframe 遮罩层（用于画笔模式下捕获事件）
  const iframeMask = document.createElement('div');
  iframeMask.className = 'iframe-drawing-mask';
  iframeMask.id = `iframe-mask-${lessonId}`;

  // 创建加载提示
  const loadingEl = document.createElement('div');
  loadingEl.className = 'html-loading';
  loadingEl.innerHTML = '<div class="loading-spinner"></div><p>加载可视化内容中...</p>';
  iframeWrapper.appendChild(loadingEl);

  container.appendChild(iframeWrapper);

  try {
    // 检查HTML文件是否存在（添加时间戳防止缓存）
    const timestamp = Date.now();
    const htmlPath = `html/${lessonId}.html`;
    const htmlPathWithCache = `${htmlPath}?v=${timestamp}`;
    const response = await fetch(htmlPathWithCache, { method: 'HEAD' });

    if (!response.ok) {
      throw new Error(`无法加载课程 ${lessonId} 的HTML文件 (${response.status})`);
    }

    // 移除加载提示
    iframeWrapper.removeChild(loadingEl);

    // 创建iframe - 使用 src 而不是 srcdoc 以避免 React 冲突
    const iframe = document.createElement('iframe');
    iframe.className = 'html-content-iframe';
    iframe.sandbox = 'allow-scripts allow-same-origin';
    iframe.title = `${lessonId} 教学可视化`;

    // 使用 src 属性直接加载文件,避免与父页面的 React 冲突
    // 添加时间戳参数强制刷新，避免浏览器缓存旧内容
    iframe.src = htmlPathWithCache;

    // 设置iframe样式
    iframe.style.border = 'none';
    iframe.style.width = '100%';
    iframe.style.height = '100%';

    iframeWrapper.appendChild(iframe);
    
    // 添加遮罩层（在 iframe 之上）
    iframeWrapper.appendChild(iframeMask);
    
    // 为遮罩层添加滚动透传事件
    setupIframeMaskScrollPassthrough(iframeMask, iframe);

  } catch (error) {
    // 错误处理
    iframeWrapper.innerHTML = '';
    const errorEl = document.createElement('div');
    errorEl.className = 'html-error';
    errorEl.innerHTML = `
      <div class="error-icon">⚠️</div>
      <h3>内容加载失败</h3>
      <p>${error.message}</p>
      <div class="error-hint">
        <p>可能的原因:</p>
        <ul>
          <li>HTML文件不存在</li>
          <li>文件路径不正确</li>
          <li>网络连接问题</li>
        </ul>
      </div>
    `;
    iframeWrapper.appendChild(errorEl);
    console.error('Failed to load HTML content:', error);
  }
}

/**
 * 设置 iframe 遮罩层的滚动透传
 * 策略：遮罩层默认 pointer-events: none，只在绘制时临时启用
 * @param {HTMLElement} mask - 遮罩层元素
 * @param {HTMLIFrameElement} iframe - iframe 元素
 */
function setupIframeMaskScrollPassthrough(mask, iframe) {
  // 滚轮事件 - 始终透传，不拦截
  mask.addEventListener('wheel', (e) => {
    // 临时禁用遮罩层，让滚轮事件穿透到 iframe
    const wasActive = mask.style.pointerEvents === 'auto';
    mask.style.pointerEvents = 'none';
    
    // 直接滚动 iframe 内容
    if (iframe.contentWindow) {
      iframe.contentWindow.scrollBy({
        top: e.deltaY,
        left: e.deltaX,
        behavior: 'auto'
      });
    }
    
    // 恢复遮罩层（如果之前是激活状态）
    if (wasActive) {
      requestAnimationFrame(() => {
        if (mask.classList.contains('drawing-active')) {
          mask.style.pointerEvents = 'auto';
        }
      });
    }
  }, { passive: true });
  
  // 触摸滚动（双指） - 透传
  mask.addEventListener('touchstart', (e) => {
    if (e.touches.length === 2) {
      // 双指触摸，临时禁用遮罩层，允许滚动
      mask.style.pointerEvents = 'none';
      setTimeout(() => {
        if (mask.classList.contains('drawing-active')) {
          mask.style.pointerEvents = 'auto';
        }
      }, 200);
    }
  }, { passive: true });
}

/**
 * 检查HTML文件是否存在
 * @param {string} lessonId - 课程ID
 * @returns {Promise<boolean>}
 */
export async function checkHtmlExists(lessonId) {
  try {
    // 添加时间戳防止缓存
    const timestamp = Date.now();
    const response = await fetch(`html/${lessonId}.html?v=${timestamp}`, { method: 'HEAD' });
    return response.ok;
  } catch {
    return false;
  }
}
