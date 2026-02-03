/**
 * SplitViewLesson组件
 * 左右分屏的课程视图主组件
 * 支持3个内容源的动态切换：Notebook笔记、HTML可视化、练习题
 * 支持全局画笔涂鸦功能
 */

import { createNotebookViewer } from './NotebookViewer.js';
import { createHtmlViewer } from './HtmlViewer.js';
import { createQuestionBankViewer } from './QuestionBankViewer.js';
import { createSplitter } from './ResizableSplitter.js';
import {
  initGlobalCanvas,
  toggleDrawingMode,
  clearDrawing,
  isDrawingActive,
  setDrawingTool,
  getCurrentTool,
  setDrawingColor,
  getCurrentColor,
  setLineWidth,
  getLineWidth,
  getPresetColors,
  getLineWidthOptions,
  destroyCanvas,
  saveDrawingData,
  updateViewTypes,
  reinitializeCanvases
} from './GlobalDrawingCanvas.js';

/**
 * 创建分屏课程视图
 * @param {string} lessonId - 课程ID (如 'L2-01')
 * @param {HTMLElement} container - 容器DOM元素
 * @param {Function} onBack - 返回按钮回调函数
 * @returns {Promise<Object>} - 返回组件控制对象
 */
export async function createSplitView(lessonId, container, onBack) {
  // 清空容器
  container.innerHTML = '';

  // 创建主容器
  const splitViewContainer = document.createElement('div');
  splitViewContainer.className = 'split-view-container';
  splitViewContainer.id = 'split-view-lesson';

  // 初始分屏比例 50/50
  let splitRatio = 50;

  // 从localStorage读取用户上次的比例设置
  const savedRatio = localStorage.getItem('splitViewRatio');
  if (savedRatio) {
    splitRatio = parseFloat(savedRatio);
  }

  // 检测题库可用性
  const grade = extractGrade(lessonId);
  const hasQuestions = await checkQuestionBankAvailability(grade);

  // 加载视图状态偏好（哪两个内容源被选中）
  let viewState = loadViewPreference(lessonId);

  // 如果当前课程没有题库，但用户上次选择了questions，则回退到默认
  if (!hasQuestions && viewState.selected.includes('questions')) {
    viewState = {
      left: 'notebook',
      right: 'html',
      selected: ['notebook', 'html']
    };
  }

  // 创建左侧面板
  const leftPane = document.createElement('div');
  leftPane.className = 'split-pane left-pane';
  leftPane.style.width = `${splitRatio}%`;
  leftPane.setAttribute('role', 'region');
  leftPane.setAttribute('aria-label', '左侧内容');

  // 创建右侧面板
  const rightPane = document.createElement('div');
  rightPane.className = 'split-pane right-pane';
  rightPane.style.width = `${100 - splitRatio}%`;
  rightPane.setAttribute('role', 'region');
  rightPane.setAttribute('aria-label', '右侧内容');

  // 创建分割条
  let saveTimer = null;
  const splitter = createSplitter((newRatio) => {
    splitRatio = newRatio;
    leftPane.style.width = `${splitRatio}%`;
    rightPane.style.width = `${100 - splitRatio}%`;

    // 使用debounce延迟保存用户偏好，避免拖动时频繁写入localStorage导致卡顿
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      localStorage.setItem('splitViewRatio', splitRatio.toString());
    }, 300);
  });

  // 创建工具栏
  const toolbar = document.createElement('div');
  toolbar.className = 'split-view-toolbar';

  // 创建返回按钮
  const backButton = document.createElement('button');
  backButton.className = 'back-button';
  backButton.innerHTML = `
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M19 12H5M12 19l-7-7 7-7"/>
    </svg>
    <span>返回地图</span>
  `;
  backButton.onclick = () => {
    // 清理 NotebookViewer 挂在 body 上的悬浮元素（如“本节目录”工具条/遮罩）
    cleanupNotebookOverlays(leftPane, rightPane);
    if (onBack) onBack();
  };
  toolbar.appendChild(backButton);

  // 创建视图切换按钮组（动态创建）
  const viewToggleGroup = createViewToggleButtons(
    hasQuestions,
    viewState,
    lessonId,
    leftPane,
    rightPane
  );
  toolbar.appendChild(viewToggleGroup);

  // 创建画笔工具组
  const drawingToolsGroup = document.createElement('div');
  drawingToolsGroup.className = 'drawing-tools-group';

  // 画笔扩展工具容器（初始隐藏）
  const extendedTools = document.createElement('div');
  extendedTools.className = 'drawing-extended-tools';
  extendedTools.style.display = 'none';

  // 画笔切换按钮
  const drawingButton = document.createElement('button');
  drawingButton.className = 'drawing-toolbar-button';
  drawingButton.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M12 19l7-7 3 3-7 7-3-3z"/>
      <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/>
      <path d="M2 2l7.586 7.586"/>
      <circle cx="11" cy="11" r="2"/>
    </svg>
    <span>画笔</span>
  `;
  drawingButton.title = '开启/关闭画笔涂鸦';
  drawingButton.onclick = () => {
    const isActive = toggleDrawingMode();
    if (isActive) {
      drawingButton.classList.add('active');
      extendedTools.style.display = 'flex';
      setDrawingTool('pen');
      penButton.classList.add('active');
      eraserButton.classList.remove('active');
    } else {
      drawingButton.classList.remove('active');
      extendedTools.style.display = 'none';
    }
  };
  drawingToolsGroup.appendChild(drawingButton);

  // === 扩展工具：画笔/橡皮擦切换 ===
  const penButton = document.createElement('button');
  penButton.className = 'tool-button active';
  penButton.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>
    </svg>
  `;
  penButton.title = '画笔';
  
  const eraserButton = document.createElement('button');
  eraserButton.className = 'tool-button';
  eraserButton.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M20 20H7L3 16l9-9 8 8-4 4"/>
      <path d="M6 11l5 5"/>
    </svg>
  `;
  eraserButton.title = '橡皮擦';

  penButton.onclick = () => {
    setDrawingTool('pen');
    penButton.classList.add('active');
    eraserButton.classList.remove('active');
  };

  eraserButton.onclick = () => {
    setDrawingTool('eraser');
    eraserButton.classList.add('active');
    penButton.classList.remove('active');
  };

  const toolToggle = document.createElement('div');
  toolToggle.className = 'tool-toggle-group';
  toolToggle.appendChild(penButton);
  toolToggle.appendChild(eraserButton);
  extendedTools.appendChild(toolToggle);

  // === 颜色选择器 ===
  const colorPicker = document.createElement('div');
  colorPicker.className = 'color-picker-group';
  
  const presetColors = getPresetColors();
  presetColors.forEach(color => {
    const colorBtn = document.createElement('button');
    colorBtn.className = 'color-button';
    colorBtn.style.backgroundColor = color.value;
    colorBtn.title = color.name;
    if (color.value === getCurrentColor()) {
      colorBtn.classList.add('active');
    }
    // 白色需要边框
    if (color.value === '#ffffff') {
      colorBtn.style.border = '1px solid #ccc';
    }
    colorBtn.onclick = () => {
      setDrawingColor(color.value);
      colorPicker.querySelectorAll('.color-button').forEach(b => b.classList.remove('active'));
      colorBtn.classList.add('active');
      // 切换到画笔工具
      setDrawingTool('pen');
      penButton.classList.add('active');
      eraserButton.classList.remove('active');
    };
    colorPicker.appendChild(colorBtn);
  });

  // 自定义颜色输入
  const customColorInput = document.createElement('input');
  customColorInput.type = 'color';
  customColorInput.className = 'custom-color-input';
  customColorInput.value = getCurrentColor();
  customColorInput.title = '自定义颜色';
  customColorInput.onchange = (e) => {
    setDrawingColor(e.target.value);
    colorPicker.querySelectorAll('.color-button').forEach(b => b.classList.remove('active'));
    // 切换到画笔工具
    setDrawingTool('pen');
    penButton.classList.add('active');
    eraserButton.classList.remove('active');
  };
  colorPicker.appendChild(customColorInput);
  
  extendedTools.appendChild(colorPicker);

  // === 线宽选择器 ===
  const lineWidthGroup = document.createElement('div');
  lineWidthGroup.className = 'line-width-group';
  
  const lineWidthOptions = getLineWidthOptions();
  lineWidthOptions.forEach(width => {
    const widthBtn = document.createElement('button');
    widthBtn.className = 'line-width-button';
    widthBtn.title = `${width}px`;
    if (width === getLineWidth()) {
      widthBtn.classList.add('active');
    }
    // 创建线宽指示器
    const indicator = document.createElement('span');
    indicator.className = 'line-width-indicator';
    indicator.style.width = `${Math.min(width * 2, 20)}px`;
    indicator.style.height = `${Math.min(width * 2, 20)}px`;
    widthBtn.appendChild(indicator);
    
    widthBtn.onclick = () => {
      setLineWidth(width);
      lineWidthGroup.querySelectorAll('.line-width-button').forEach(b => b.classList.remove('active'));
      widthBtn.classList.add('active');
    };
    lineWidthGroup.appendChild(widthBtn);
  });
  
  extendedTools.appendChild(lineWidthGroup);

  // === 清除按钮 ===
  const clearButton = document.createElement('button');
  clearButton.className = 'clear-drawing-button';
  clearButton.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M3 6h18"/>
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
    </svg>
  `;
  clearButton.title = '清除所有涂鸦';
  clearButton.onclick = () => {
    clearDrawing();
  };
  extendedTools.appendChild(clearButton);

  // === 保存按钮 ===
  const saveButton = document.createElement('button');
  saveButton.className = 'save-drawing-button';
  saveButton.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
      <polyline points="17 21 17 13 7 13 7 21"/>
      <polyline points="7 3 7 8 15 8"/>
    </svg>
  `;
  saveButton.title = '保存涂鸦';
  saveButton.onclick = () => {
    const success = saveDrawingData();
    if (success) {
      showToast('涂鸦已保存', 'success');
    } else {
      showToast('保存失败', 'error');
    }
  };
  extendedTools.appendChild(saveButton);

  drawingToolsGroup.appendChild(extendedTools);
  toolbar.appendChild(drawingToolsGroup);

  // 创建全屏切换按钮
  const fullscreenButton = document.createElement('button');
  fullscreenButton.className = 'toolbar-button fullscreen-button';
  fullscreenButton.innerHTML = `
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>
    </svg>
  `;
  fullscreenButton.title = '全屏显示';
  fullscreenButton.onclick = toggleFullscreen;
  toolbar.appendChild(fullscreenButton);

  // 创建内容区包装器
  const contentWrapper = document.createElement('div');
  contentWrapper.className = 'split-view-content';
  contentWrapper.appendChild(leftPane);
  contentWrapper.appendChild(splitter);
  contentWrapper.appendChild(rightPane);

  // 组装组件
  splitViewContainer.appendChild(toolbar);
  splitViewContainer.appendChild(contentWrapper);
  container.appendChild(splitViewContainer);

  // ⚠️ 关键：先加载内容，再初始化画布
  // 这样避免Canvas被 container.innerHTML = '' 删除
  await updatePaneContents(lessonId, viewState, leftPane, rightPane, true);

  // 初始化全局画布（覆盖在内容上）
  initGlobalCanvas(contentWrapper, lessonId, viewState.left, viewState.right);

  // ⚠️ 页面卸载时自动保存涂鸦
  // 当用户关闭标签页、刷新页面或导航离开时，自动保存当前涂鸦
  window.addEventListener('beforeunload', () => {
    // 只在画笔激活时保存，避免不必要的localStorage操作
    // 注意：这里不判断isDrawingActive()，因为用户可能关闭了画笔但有内容
    saveDrawingData();
  });

  // 返回控制对象
  return {
    lessonId,
    container: splitViewContainer,
    destroy: () => {
      // 清理函数
      destroyCanvas();
      splitter.destroy && splitter.destroy();
      container.innerHTML = '';
    },
    getRatio: () => splitRatio,
    setRatio: (ratio) => {
      const clampedRatio = Math.max(20, Math.min(80, ratio));
      splitRatio = clampedRatio;
      leftPane.style.width = `${splitRatio}%`;
      rightPane.style.width = `${100 - splitRatio}%`;
    }
  };
}

function cleanupNotebookOverlays(...panes) {
  // 关闭目录遮罩
  const overlay = document.getElementById('notebook-toc-overlay');
  if (overlay) overlay.remove();

  // 清理每个面板可能创建的 dock（NotebookViewer 里挂在 pane.__notebookDockCleanup）
  panes.filter(Boolean).forEach(pane => {
    try {
      const cleanup = pane.__notebookDockCleanup;
      if (typeof cleanup === 'function') cleanup();
    } catch {}

    try { pane.classList.remove('has-notebook-dock'); } catch {}

    const dockId = pane.dataset?.notebookDockId;
    if (dockId) {
      const el = document.getElementById(dockId);
      if (el) el.remove();
      try { delete pane.dataset.notebookDockId; } catch {}
    }

    try { delete pane.__notebookDockCleanup; } catch {}
  });
}

/**
 * 提取年级标识
 * @param {string} lessonId - 如 'L3-01'
 * @returns {string} - 如 'L3'
 */
function extractGrade(lessonId) {
  const match = lessonId.match(/^(L\d+)-/);
  return match ? match[1] : null;
}

/**
 * 检测题库可用性
 * @param {string} grade - 年级 (如 'L3')
 * @returns {Promise<boolean>}
 */
async function checkQuestionBankAvailability(grade) {
  if (!grade) return false;

  try {
    const response = await fetch(`question bank/${grade}.json`, {
      method: 'HEAD'
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * 创建视图切换下拉选择器（双下拉模式）
 * @param {boolean} hasQuestions - 是否有题库
 * @param {Object} viewState - 当前视图状态
 * @param {string} lessonId - 课程ID
 * @param {HTMLElement} leftPane - 左侧面板
 * @param {HTMLElement} rightPane - 右侧面板
 * @returns {HTMLElement}
 */
function createViewToggleButtons(hasQuestions, viewState, lessonId, leftPane, rightPane) {
  const group = document.createElement('div');
  group.className = 'view-toggle-group';

  // 定义选项配置
  const options = [
    { id: 'notebook', label: '📓 笔记', title: 'Jupyter Notebook教学笔记' },
    { id: 'html', label: '🎨 可视化', title: 'HTML可视化内容' }
  ];

  // 如果有题库，添加练习题选项
  if (hasQuestions) {
    options.push({ id: 'questions', label: '📝 练习', title: '课程练习题' });
  }

  // 创建左侧面板选择器
  const leftSelectWrapper = document.createElement('div');
  leftSelectWrapper.className = 'view-select-wrapper';

  const leftLabel = document.createElement('label');
  leftLabel.className = 'view-select-label';
  leftLabel.textContent = '左侧:';
  leftLabel.setAttribute('for', 'left-view-select');

  const leftSelect = document.createElement('select');
  leftSelect.className = 'view-select';
  leftSelect.id = 'left-view-select';
  leftSelect.title = '选择左侧面板内容';

  options.forEach(opt => {
    const option = document.createElement('option');
    option.value = opt.id;
    option.textContent = opt.label;
    if (opt.id === viewState.left) {
      option.selected = true;
    }
    leftSelect.appendChild(option);
  });

  leftSelect.addEventListener('change', async (e) => {
    const newView = e.target.value;

    // 如果新视图与右侧相同，交换
    if (newView === viewState.right) {
      const temp = viewState.left;
      viewState.left = newView;
      viewState.right = temp;
      rightSelect.value = viewState.right;
    } else {
      viewState.left = newView;
    }

    // 更新 selected 数组
    viewState.selected = [viewState.left, viewState.right];

    // 直接调用更新函数
    await updatePaneContents(lessonId, viewState, leftPane, rightPane);

    // 持久化
    saveViewPreference(lessonId, viewState);
  });

  leftSelectWrapper.appendChild(leftLabel);
  leftSelectWrapper.appendChild(leftSelect);

  // 创建右侧面板选择器
  const rightSelectWrapper = document.createElement('div');
  rightSelectWrapper.className = 'view-select-wrapper';

  const rightLabel = document.createElement('label');
  rightLabel.className = 'view-select-label';
  rightLabel.textContent = '右侧:';
  rightLabel.setAttribute('for', 'right-view-select');

  const rightSelect = document.createElement('select');
  rightSelect.className = 'view-select';
  rightSelect.id = 'right-view-select';
  rightSelect.title = '选择右侧面板内容';

  options.forEach(opt => {
    const option = document.createElement('option');
    option.value = opt.id;
    option.textContent = opt.label;
    if (opt.id === viewState.right) {
      option.selected = true;
    }
    rightSelect.appendChild(option);
  });

  rightSelect.addEventListener('change', async (e) => {
    const newView = e.target.value;

    // 如果新视图与左侧相同，交换
    if (newView === viewState.left) {
      const temp = viewState.right;
      viewState.right = newView;
      viewState.left = temp;
      leftSelect.value = viewState.left;
    } else {
      viewState.right = newView;
    }

    // 更新 selected 数组
    viewState.selected = [viewState.left, viewState.right];

    // 直接调用更新函数
    await updatePaneContents(lessonId, viewState, leftPane, rightPane);

    // 持久化
    saveViewPreference(lessonId, viewState);
  });

  rightSelectWrapper.appendChild(rightLabel);
  rightSelectWrapper.appendChild(rightSelect);

  group.appendChild(leftSelectWrapper);
  group.appendChild(rightSelectWrapper);

  return group;
}

/**
 * 切换视图
 * @param {string} newView - 新视图ID
 * @param {Object} viewState - 视图状态对象
 * @param {string} lessonId - 课程ID
 * @param {HTMLElement} leftPane - 左侧面板
 * @param {HTMLElement} rightPane - 右侧面板
 */
async function toggleView(newView, viewState, lessonId, leftPane, rightPane) {
  // 验证输入
  if (!['notebook', 'html', 'questions'].includes(newView)) {
    throw new Error(`Invalid view: ${newView}`);
  }

  // 已选中则忽略
  if (viewState.selected.includes(newView)) {
    return;
  }

  // FIFO：移除最早选中的
  viewState.selected.shift();
  viewState.selected.push(newView);

  // 验证状态一致性
  if (viewState.selected.length !== 2) {
    throw new Error('State corruption: must have exactly 2 selected');
  }

  // 更新left/right映射
  viewState.left = viewState.selected[0];
  viewState.right = viewState.selected[1];

  // 重新渲染内容
  await updatePaneContents(lessonId, viewState, leftPane, rightPane);

  // 持久化
  saveViewPreference(lessonId, viewState);
}

/**
 * 更新面板内容
 * @param {string} lessonId - 课程ID
 * @param {Object} viewState - 视图状态
 * @param {HTMLElement} leftPane - 左侧面板
 * @param {HTMLElement} rightPane - 右侧面板
 * @param {boolean} isInitial - 是否是初始化调用（默认false）
 */
async function updatePaneContents(lessonId, viewState, leftPane, rightPane, isInitial = false) {
  try {
    // ⚠️ 关键修复：保护Canvas不被删除
    let leftCanvas = null;
    let rightCanvas = null;

    if (!isInitial) {
      // 1. 先保存当前涂鸦
      saveDrawingData();

      // 2. 临时移除Canvas（避免被 container.innerHTML = '' 删除）
      leftCanvas = leftPane.querySelector('.drawing-canvas-left');
      rightCanvas = rightPane.querySelector('.drawing-canvas-right');

      if (leftCanvas) leftCanvas.remove();
      if (rightCanvas) rightCanvas.remove();
    }

    // 3. 加载新内容（会执行 container.innerHTML = ''）
    await Promise.all([
      loadContentByType(viewState.left, lessonId, leftPane),
      loadContentByType(viewState.right, lessonId, rightPane)
    ]);

    // 4. 恢复Canvas到DOM并重新初始化
    if (!isInitial && leftCanvas && rightCanvas) {
      // 恢复Canvas到面板
      leftPane.appendChild(leftCanvas);
      rightPane.appendChild(rightCanvas);

      // ⚠️ 关键：恢复后重新初始化Canvas尺寸和位置
      reinitializeCanvases();

      // 5. 更新视图类型并加载新视图的涂鸦
      // 延迟执行，确保DOM完全更新
      setTimeout(() => {
        updateViewTypes(viewState.left, viewState.right);
      }, 100);
    }
  } catch (error) {
    console.error('Failed to update pane contents:', error);
  }
}

/**
 * 根据类型加载内容
 * @param {string} contentType - 内容类型 ('notebook' | 'html' | 'questions')
 * @param {string} lessonId - 课程ID
 * @param {HTMLElement} container - 容器
 */
async function loadContentByType(contentType, lessonId, container) {
  switch (contentType) {
    case 'notebook':
      await createNotebookViewer(lessonId, container);
      break;
    case 'html':
      await createHtmlViewer(lessonId, container);
      break;
    case 'questions':
      await createQuestionBankViewer(lessonId, container);
      break;
    default:
      throw new Error(`Unknown content type: ${contentType}`);
  }
}

/**
 * 加载视图偏好设置
 * @param {string} lessonId - 课程ID
 * @returns {Object} - 视图状态
 */
function loadViewPreference(lessonId) {
  // 定义默认状态:左边笔记,右边可视化
  const defaultState = {
    left: 'notebook',
    right: 'html',
    selected: ['notebook', 'html']
  };

  // 总是返回默认状态(忽略localStorage中的旧偏好)
  // 如果未来需要记住用户偏好,可以恢复下面注释的代码
  return defaultState;

  /*
  // 原代码:会记住用户上次的选择
  const allStates = JSON.parse(
    localStorage.getItem('splitViewState') || '{}'
  );
  return allStates[lessonId] || defaultState;
  */
}

/**
 * 保存视图偏好设置
 * @param {string} lessonId - 课程ID
 * @param {Object} viewState - 视图状态
 */
function saveViewPreference(lessonId, viewState) {
  const allStates = JSON.parse(
    localStorage.getItem('splitViewState') || '{}'
  );

  allStates[lessonId] = {
    ...viewState,
    timestamp: Date.now()
  };

  localStorage.setItem('splitViewState', JSON.stringify(allStates));
}

/**
 * 全屏切换函数
 */
function toggleFullscreen() {
  const container = document.getElementById('split-view-lesson');
  if (!container) return;

  if (!document.fullscreenElement) {
    container.requestFullscreen().catch(err => {
      console.error(`全屏失败: ${err.message}`);
    });
  } else {
    document.exitFullscreen();
  }
}

/**
 * 显示Toast提示
 * @param {string} message - 提示消息
 * @param {string} type - 类型：'success' | 'error' | 'info'
 */
function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;

  document.body.appendChild(toast);

  // 动画显示
  setTimeout(() => {
    toast.classList.add('show');
  }, 10);

  // 2秒后自动消失
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => {
      document.body.removeChild(toast);
    }, 300);
  }, 2000);
}
