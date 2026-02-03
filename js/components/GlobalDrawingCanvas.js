/**
 * GlobalDrawingCanvas - 全局画布模块
 * ⚠️ 架构说明：
 * - Canvas使用absolute定位，放在contentWrapper内部
 * - Canvas高度 = max(leftPane.scrollHeight, rightPane.scrollHeight)
 * - 当面板滚动时，Canvas随之滚动（因为在容器内）
 * - 涂鸦自然"粘"在内容上，无需特殊处理scrollTop
 */

// 导入服务器API客户端
import { drawingAPI } from '../api/DrawingAPI.js';

// localStorage存储键前缀
const STORAGE_KEY_PREFIX = 'drawing_data_';

// 预设颜色
const PRESET_COLORS = [
  { name: '红色', value: '#ef4444' },
  { name: '蓝色', value: '#3b82f6' },
  { name: '绿色', value: '#22c55e' },
  { name: '黄色', value: '#eab308' },
  { name: '紫色', value: '#a855f7' },
  { name: '橙色', value: '#f97316' },
  { name: '黑色', value: '#1f2937' },
  { name: '白色', value: '#ffffff' }
];

// 线宽选项
const LINE_WIDTHS = [2, 4, 6, 8, 12];

// 全局画笔状态
let drawingState = {
  isActive: false,
  isDrawing: false,
  leftCanvas: null,    // 左面板Canvas
  rightCanvas: null,   // 右面板Canvas
  leftCtx: null,
  rightCtx: null,
  container: null,
  lessonId: null,
  currentPane: null,   // 当前正在绘制的面板 'left' | 'right'
  leftView: null,      // 左侧视图类型 'notebook' | 'html' | 'questions'
  rightView: null,     // 右侧视图类型
  tool: 'pen',
  color: '#ef4444',
  lineWidth: 4,
  autoSaveTimer: null,
  // iframe滚动监听器引用（用于移除监听）
  leftIframeScrollHandler: null,
  rightIframeScrollHandler: null,
  // 事件处理函数引用（用于移除监听）
  handlers: {
    mousedown: null,
    mousemove: null,
    mouseup: null,
    touchstart: null,
    touchmove: null,
    touchend: null
  },
  // ✨ Apple Pencil Pro 按钮状态
  barrelButton: {
    pressed: false,              // 按钮是否按下
    pressStartTime: 0,           // 按下开始时间
    longPressTimer: null,        // 长按定时器
    longPressTriggered: false,   // 是否已触发长按
    toolBeforePress: 'pen',      // 长按前的工具类型
    currentColorIndex: 0         // 当前颜色索引（用于循环）
  },
  // ✨ Hover 检测状态
  hover: {
    isHovering: false,           // 当前是否悬停
    activationTimer: null,       // 500ms 激活定时器
    deactivationTimer: null,     // 1500ms 关闭定时器
    autoActivated: false         // 是否由 hover 自动激活
  },
  // ✨ 长按切换工具状态
  longPress: {
    timer: null,                 // 长按定时器
    startX: 0,                   // 起始 X 坐标
    startY: 0,                   // 起始 Y 坐标
    isActive: false,             // 是否正在长按中
    hasMoved: false              // 是否已经移动（移动则取消长按）
  },
  // ✨ iPad 调试面板
  debugPanel: {
    enabled: false,              // 是否启用调试面板
    element: null,               // 调试面板 DOM 元素
    logs: []                     // 日志记录（最多保留10条）
  }
};

/**
 * 初始化全局画布
 * @param {HTMLElement} contentWrapper - 内容区容器（包含左右面板）
 * @param {string} lessonId - 课程ID
 * @param {string} leftView - 左侧视图类型 ('notebook' | 'html' | 'questions')
 * @param {string} rightView - 右侧视图类型
 */
export function initGlobalCanvas(contentWrapper, lessonId, leftView, rightView) {
  // 先清理旧的事件监听
  removeDrawingEvents();

  // 移除旧画布
  const oldLeftCanvas = contentWrapper.querySelector('.drawing-canvas-left');
  const oldRightCanvas = contentWrapper.querySelector('.drawing-canvas-right');
  if (oldLeftCanvas) oldLeftCanvas.remove();
  if (oldRightCanvas) oldRightCanvas.remove();

  // 获取左右面板
  const leftPane = contentWrapper.querySelector('.left-pane');
  const rightPane = contentWrapper.querySelector('.right-pane');

  if (!leftPane || !rightPane) {
    console.error('Left or right pane not found');
    return null;
  }

  // ⚠️ 关键：确保面板是定位上下文
  leftPane.style.position = 'relative';
  rightPane.style.position = 'relative';

  // 创建左面板Canvas
  const leftCanvas = createPaneCanvas('left', lessonId);
  leftPane.appendChild(leftCanvas);

  // 创建右面板Canvas
  const rightCanvas = createPaneCanvas('right', lessonId);
  rightPane.appendChild(rightCanvas);

  // 保存引用
  drawingState.leftCanvas = leftCanvas;
  drawingState.rightCanvas = rightCanvas;
  drawingState.leftCtx = leftCanvas.getContext('2d');
  drawingState.rightCtx = rightCanvas.getContext('2d');
  drawingState.container = contentWrapper;
  drawingState.lessonId = lessonId;
  drawingState.leftView = leftView;   // 保存视图类型
  drawingState.rightView = rightView;

  // 设置画布大小
  updateCanvasSize(leftCanvas, leftPane);
  updateCanvasSize(rightCanvas, rightPane);

  // 监听窗口大小变化
  window.addEventListener('resize', () => {
    updateCanvasSize(leftCanvas, leftPane);
    updateCanvasSize(rightCanvas, rightPane);
  }, { passive: true });

  // 监听面板滚动（用于同步Canvas位置）
  leftPane.addEventListener('scroll', () => {
    syncCanvasScroll(leftCanvas, leftPane);
  }, { passive: true });

  rightPane.addEventListener('scroll', () => {
    syncCanvasScroll(rightCanvas, rightPane);
  }, { passive: true });

  // ⚠️ 监听iframe内部滚动（可视化视图）
  // iframe可能还未加载，延迟检查并添加监听
  setTimeout(setupIframeScrollListeners, 500);
  // 也尝试在更长时间后再次设置（防止iframe延迟加载）
  setTimeout(setupIframeScrollListeners, 2000);

  // 绑定绘图事件到 document
  bindDrawingEvents();

  // ⚠️ 延迟加载保存的涂鸦数据（增加延迟确保Canvas完全初始化）
  setTimeout(() => {
    console.log('Attempting to load drawing data for lesson:', lessonId);
    const success = loadDrawingData();
    if (success) {
      console.log('Drawing data loaded successfully');
    } else {
      console.log('No drawing data to load or loading failed');
    }
  }, 300);

  return { leftCanvas, rightCanvas };
}

/**
 * 创建面板Canvas元素
 */
function createPaneCanvas(paneName, lessonId) {
  const canvas = document.createElement('canvas');
  canvas.className = `global-drawing-canvas drawing-canvas-${paneName}`;
  canvas.id = `canvas-${paneName}-${lessonId}`;
  return canvas;
}

/**
 * 更新Canvas大小以匹配面板
 */
function updateCanvasSize(canvas, pane) {
  if (!canvas || !pane) return;

  // 检查当前Canvas内容（避免在尺寸为0时调用getImageData）
  const beforeCtx = canvas.getContext('2d');
  let hadContentBefore = false;

  if (canvas.width > 0 && canvas.height > 0) {
    const beforeData = beforeCtx.getImageData(0, 0, Math.min(10, canvas.width), Math.min(10, canvas.height));
    for (let i = 3; i < beforeData.data.length; i += 4) {
      if (beforeData.data[i] > 0) {
        hadContentBefore = true;
        break;
      }
    }
  }

  console.log(`[CANVAS] 🔧 updateCanvasSize called, had content before: ${hadContentBefore}, current size: ${canvas.width}x${canvas.height}`);

  // 保存当前画布内容
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = canvas.width;
  tempCanvas.height = canvas.height;
  const tempCtx = tempCanvas.getContext('2d');
  tempCtx.drawImage(canvas, 0, 0);

  // Canvas高度 = 面板的scrollHeight（包括滚动区域）
  const canvasHeight = Math.max(pane.clientHeight, pane.scrollHeight);

  // 设置CSS样式
  canvas.style.position = 'absolute';
  canvas.style.top = '0';
  canvas.style.left = '0';
  canvas.style.width = `${pane.clientWidth}px`;
  canvas.style.height = `${canvasHeight}px`;
  canvas.style.pointerEvents = 'none';

  // ⚠️ 关键：初始化transform，确保Canvas跟随滚动（负值向上）
  canvas.style.transform = `translateY(-${pane.scrollTop}px)`;

  // 设置实际像素大小（考虑设备像素比）
  const dpr = window.devicePixelRatio || 1;
  const newWidth = pane.clientWidth * dpr;
  const newHeight = canvasHeight * dpr;

  const ctx = canvas.getContext('2d');

  // 如果尺寸变化，恢复内容
  if (canvas.width !== newWidth || canvas.height !== newHeight) {
    console.log(`[CANVAS] ⚠️ Size changed: ${canvas.width}x${canvas.height} → ${newWidth}x${newHeight}`);

    canvas.width = newWidth;
    canvas.height = newHeight;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);

    // 恢复画布内容
    if (tempCanvas.width > 0 && tempCanvas.height > 0) {
      ctx.drawImage(tempCanvas, 0, 0);
      console.log(`[CANVAS] ✅ Content restored from ${tempCanvas.width}x${tempCanvas.height}`);
    }

    // 应用画笔设置
    applyBrushSettings(ctx);
  } else {
    console.log(`[CANVAS] ℹ️ Size unchanged, no restoration needed`);
  }

  // 验证恢复后的内容（避免在尺寸为0时调用getImageData）
  let hasContentAfter = false;
  if (canvas.width > 0 && canvas.height > 0) {
    const afterData = ctx.getImageData(0, 0, Math.min(10, canvas.width), Math.min(10, canvas.height));
    for (let i = 3; i < afterData.data.length; i += 4) {
      if (afterData.data[i] > 0) {
        hasContentAfter = true;
        break;
      }
    }
    console.log(`[CANVAS] 🔍 After updateCanvasSize, has content: ${hasContentAfter}`);
  } else {
    console.log(`[CANVAS] ⚠️ Canvas size is 0, skipping content verification`);
  }
}

/**
 * 同步Canvas的滚动位置
 * 使用transform让Canvas随面板滚动移动
 * ⚠️ 使用负值：面板向下滚动(scrollTop增加)时，Canvas向上移动
 * ⚠️ 支持iframe：如果面板中有iframe（可视化视图），也考虑iframe内部滚动
 * @param {HTMLCanvasElement} canvas - 画布元素
 * @param {HTMLElement} pane - 面板元素
 */
function syncCanvasScroll(canvas, pane) {
  if (!canvas || !pane) return;

  // 1. 面板本身的滚动
  let totalScroll = pane.scrollTop;

  // 2. 检查是否有iframe（可视化视图）
  const iframe = pane.querySelector('iframe.html-content-iframe');
  if (iframe && iframe.contentWindow) {
    try {
      // 加上iframe内部文档的滚动
      const iframeScroll = iframe.contentWindow.pageYOffset || iframe.contentWindow.scrollY || 0;
      totalScroll += iframeScroll;
    } catch (e) {
      // 跨域iframe无法访问，静默失败
      console.warn('[CANVAS] Cannot access iframe scroll (cross-origin):', e.message);
    }
  }

  // 使用负值：滚动时Canvas反向移动，保持涂鸦位置不变
  canvas.style.transform = `translateY(-${totalScroll}px)`;
}

/**
 * 重新初始化Canvas尺寸和位置
 * 在Canvas被移除并恢复到DOM后调用
 * @export
 */
export function reinitializeCanvases() {
  const container = drawingState.container;
  if (!container) {
    console.warn('Container not available for canvas reinitialization');
    return;
  }

  const leftPane = container.querySelector('.left-pane');
  const rightPane = container.querySelector('.right-pane');

  if (!leftPane || !rightPane) {
    console.warn('Panes not found for canvas reinitialization');
    return;
  }

  // 重新计算并同步左侧Canvas
  if (drawingState.leftCanvas) {
    updateCanvasSize(drawingState.leftCanvas, leftPane);
    syncCanvasScroll(drawingState.leftCanvas, leftPane);
  }

  // 重新计算并同步右侧Canvas
  if (drawingState.rightCanvas) {
    updateCanvasSize(drawingState.rightCanvas, rightPane);
    syncCanvasScroll(drawingState.rightCanvas, rightPane);
  }

  // ⚠️ 视图切换后，重新设置iframe滚动监听
  setupIframeScrollListeners();

  console.log('[CANVAS] Canvases reinitialized after DOM restoration');
}

/**
 * 设置iframe内部滚动监听（用于可视化视图）
 * @private
 */
function setupIframeScrollListeners() {
  const container = drawingState.container;
  if (!container) return;

  const leftPane = container.querySelector('.left-pane');
  const rightPane = container.querySelector('.right-pane');

  if (!leftPane || !rightPane) return;

  // 检查左侧面板的iframe
  const leftIframe = leftPane.querySelector('iframe.html-content-iframe');
  if (leftIframe && leftIframe.contentWindow && drawingState.leftCanvas) {
    try {
      // 移除旧监听（如果存在）- 防止重复添加
      leftIframe.contentWindow.removeEventListener('scroll', drawingState.leftIframeScrollHandler);

      // 创建新的监听函数
      drawingState.leftIframeScrollHandler = () => {
        syncCanvasScroll(drawingState.leftCanvas, leftPane);
      };

      leftIframe.contentWindow.addEventListener('scroll', drawingState.leftIframeScrollHandler, { passive: true });
      console.log('[CANVAS] ✅ Added scroll listener to LEFT iframe');
    } catch (e) {
      console.warn('[CANVAS] Cannot add scroll listener to LEFT iframe (cross-origin)');
    }
  }

  // 检查右侧面板的iframe
  const rightIframe = rightPane.querySelector('iframe.html-content-iframe');
  if (rightIframe && rightIframe.contentWindow && drawingState.rightCanvas) {
    try {
      // 移除旧监听（如果存在）- 防止重复添加
      rightIframe.contentWindow.removeEventListener('scroll', drawingState.rightIframeScrollHandler);

      // 创建新的监听函数
      drawingState.rightIframeScrollHandler = () => {
        syncCanvasScroll(drawingState.rightCanvas, rightPane);
      };

      rightIframe.contentWindow.addEventListener('scroll', drawingState.rightIframeScrollHandler, { passive: true });
      console.log('[CANVAS] ✅ Added scroll listener to RIGHT iframe');
    } catch (e) {
      console.warn('[CANVAS] Cannot add scroll listener to RIGHT iframe (cross-origin)');
    }
  }
}

/**
 * 绑定绘图事件到 document
 */
function bindDrawingEvents() {
  // 鼠标按下
  drawingState.handlers.mousedown = (e) => {
    if (!drawingState.isActive) return;

    // 判断点击在哪个Canvas上
    const { canvas, ctx, paneName } = getCanvasAtPoint(e.clientX, e.clientY);
    if (!canvas || !ctx) return;

    e.preventDefault();
    drawingState.isDrawing = true;
    drawingState.currentPane = paneName;

    const coords = getCanvasCoordinates(e.clientX, e.clientY, canvas);
    applyBrushSettings(ctx);
    ctx.beginPath();
    ctx.moveTo(coords.x, coords.y);
  };

  // 鼠标移动
  drawingState.handlers.mousemove = (e) => {
    if (!drawingState.isActive || !drawingState.isDrawing) return;
    if (!drawingState.currentPane) return;

    const ctx = drawingState.currentPane === 'left' ? drawingState.leftCtx : drawingState.rightCtx;
    const canvas = drawingState.currentPane === 'left' ? drawingState.leftCanvas : drawingState.rightCanvas;

    const coords = getCanvasCoordinates(e.clientX, e.clientY, canvas);
    ctx.lineTo(coords.x, coords.y);
    ctx.stroke();
  };

  // 鼠标抬起
  drawingState.handlers.mouseup = () => {
    if (drawingState.isDrawing) {
      stopDrawing();
    }
  };

  // 触摸事件（支持 Apple Pencil）
  drawingState.handlers.touchstart = (e) => {
    if (!drawingState.isActive) return;

    // ⚠️ iPad优化：只处理单点触摸
    if (e.touches.length !== 1) return;

    const touch = e.touches[0];

    // ✨ 关键：检测 Apple Pencil
    const isApplePencil = isStylus(touch);

    // 如果是 Apple Pencil，检查是否在画布区域
    if (isApplePencil) {
      // ✨ 启动长按检测（1秒切换工具）
      startLongPressDetection(touch.clientX, touch.clientY);

      const { canvas, ctx, paneName } = getCanvasAtPoint(touch.clientX, touch.clientY);
      if (!canvas || !ctx) return;

      // ✅ Apple Pencil：阻止滚动和默认行为
      e.preventDefault();
      e.stopPropagation();

      drawingState.isDrawing = true;
      drawingState.currentPane = paneName;

      const coords = getCanvasCoordinates(touch.clientX, touch.clientY, canvas);
      applyBrushSettings(ctx);
      ctx.beginPath();
      ctx.moveTo(coords.x, coords.y);
    } else {
      // 🖐️ 手指触摸：不处理绘制，允许滚动
      // 不调用 preventDefault()，让系统处理滚动
      return;
    }
  };

  drawingState.handlers.touchmove = (e) => {
    if (!drawingState.isActive || !drawingState.isDrawing) return;

    // ⚠️ 手掌防误触：检查触摸数量和类型
    if (e.touches.length !== 1) {
      // 多点触摸（可能是手掌）：停止绘制
      stopDrawing();
      return;
    }

    const touch = e.touches[0];

    // ✨ 只处理 Apple Pencil 的移动
    if (!isStylus(touch)) {
      // 非 Apple Pencil（可能是手掌误触）：停止绘制
      stopDrawing();
      return;
    }

    // ✨ 长按移动检测：如果移动超过10px，取消长按
    checkLongPressMovement(touch.clientX, touch.clientY);

    if (!drawingState.currentPane) return;

    // ✅ Apple Pencil 移动：阻止滚动，执行绘制
    e.preventDefault();
    e.stopPropagation();

    const ctx = drawingState.currentPane === 'left' ? drawingState.leftCtx : drawingState.rightCtx;
    const canvas = drawingState.currentPane === 'left' ? drawingState.leftCanvas : drawingState.rightCanvas;

    // 🎨 笔触连续性优化1：使用 coalesced touches（合并触摸）
    // iOS 在两次 touchmove 事件之间可能采样了多个触摸点
    // 使用 coalescedTouchesForTouch 获取所有中间点，使线条更平滑
    let touchesToDraw = [touch]; // 默认只有当前触摸点

    if (typeof e.coalescedTouchesForTouch === 'function') {
      try {
        const coalescedTouches = e.coalescedTouchesForTouch(touch);
        if (coalescedTouches && coalescedTouches.length > 0) {
          // 使用合并的触摸点（包含更多中间采样点）
          touchesToDraw = Array.from(coalescedTouches);
        }
      } catch (err) {
        // 某些浏览器可能不支持，静默失败
        console.warn('[DRAW] coalescedTouchesForTouch not supported:', err.message);
      }
    }

    // 绘制所有触摸点（包括中间点）
    touchesToDraw.forEach((t) => {
      const coords = getCanvasCoordinates(t.clientX, t.clientY, canvas);
      ctx.lineTo(coords.x, coords.y);
      ctx.stroke();
    });

    // 🎨 笔触连续性优化2：使用 predicted touches（预测触摸）
    // 基于当前运动预测未来的触摸位置，减少延迟感
    if (typeof e.predictedTouchesForTouch === 'function') {
      try {
        const predictedTouches = e.predictedTouchesForTouch(touch);
        if (predictedTouches && predictedTouches.length > 0) {
          // 保存当前状态
          ctx.save();

          // 使用更透明的样式绘制预测路径
          ctx.globalAlpha = 0.5;

          // 绘制预测点
          Array.from(predictedTouches).forEach((t) => {
            const coords = getCanvasCoordinates(t.clientX, t.clientY, canvas);
            ctx.lineTo(coords.x, coords.y);
            ctx.stroke();
          });

          // 恢复状态
          ctx.restore();
        }
      } catch (err) {
        // 某些浏览器可能不支持，静默失败
        console.warn('[DRAW] predictedTouchesForTouch not supported:', err.message);
      }
    }
  };

  drawingState.handlers.touchend = (e) => {
    if (drawingState.isDrawing) {
      // 检查是否是 Apple Pencil 结束
      const touch = e.changedTouches?.[0];
      if (touch && isStylus(touch)) {
        // Apple Pencil 抬起：阻止可能的滚动惯性
        e.preventDefault();
      }

      // ✨ 取消长按检测
      cancelLongPressDetection();

      stopDrawing();
    }
  };

  // 添加事件监听
  document.addEventListener('mousedown', drawingState.handlers.mousedown, true);
  document.addEventListener('mousemove', drawingState.handlers.mousemove);
  document.addEventListener('mouseup', drawingState.handlers.mouseup);
  document.addEventListener('touchstart', drawingState.handlers.touchstart, { passive: false, capture: true });
  document.addEventListener('touchmove', drawingState.handlers.touchmove, { passive: false });
  document.addEventListener('touchend', drawingState.handlers.touchend);

  // ✨ 添加 Pointer Events 监听器用于检测 Apple Pencil Pro 按钮
  // Pointer Events 提供更丰富的笔输入信息，包括 barrel button
  document.addEventListener('pointerdown', handlePointerDown, true);
  document.addEventListener('pointerup', handlePointerUp, true);

  // ✨ 添加 Hover 检测监听器
  // 用于检测 Apple Pencil 悬停状态（pressure === 0）
  document.addEventListener('pointermove', handlePointerMove, { passive: true });
  document.addEventListener('pointerleave', handlePointerLeave, true);
}

/**
 * ✨ 启动长按检测（1秒切换工具）
 * @param {number} x - 起始X坐标
 * @param {number} y - 起始Y坐标
 */
function startLongPressDetection(x, y) {
  const lp = drawingState.longPress;
  lp.startX = x;
  lp.startY = y;
  lp.isActive = true;
  lp.hasMoved = false;

  // 清除旧的定时器
  if (lp.timer) {
    clearTimeout(lp.timer);
  }

  // 启动1秒定时器
  lp.timer = setTimeout(() => {
    // 1秒后检查是否仍在长按且没有移动
    if (lp.isActive && !lp.hasMoved) {
      // 切换工具
      const newTool = drawingState.tool === 'pen' ? 'eraser' : 'pen';
      setDrawingTool(newTool);

      // 同步更新工具栏按钮状态
      const penButton = document.querySelector('.tool-toggle-group .tool-button:nth-child(1)');
      const eraserButton = document.querySelector('.tool-toggle-group .tool-button:nth-child(2)');
      if (penButton && eraserButton) {
        if (newTool === 'pen') {
          penButton.classList.add('active');
          eraserButton.classList.remove('active');
        } else {
          eraserButton.classList.add('active');
          penButton.classList.remove('active');
        }
      }

      // 显示提示
      const text = newTool === 'pen' ? '✏️ 画笔' : '🧹 橡皮擦';
      const color = newTool === 'pen' ? drawingState.color : '#64748b';
      showToolToast(`${text}（长按1秒切换）`, color);
      debugLog(`⏱️ 长按1秒切换 → ${text}`, 'success');

      // 震动反馈（如果支持）
      if (navigator.vibrate) {
        navigator.vibrate(50);
      }
    }
  }, 1000); // 1秒
}

/**
 * ✨ 检查长按移动距离
 * @param {number} x - 当前X坐标
 * @param {number} y - 当前Y坐标
 */
function checkLongPressMovement(x, y) {
  const lp = drawingState.longPress;
  if (lp.isActive && !lp.hasMoved) {
    const distance = Math.sqrt(
      Math.pow(x - lp.startX, 2) +
      Math.pow(y - lp.startY, 2)
    );

    // 移动超过10px，取消长按检测
    if (distance > 10) {
      lp.hasMoved = true;
      debugLog('🚫 长按检测取消（移动距离过大）', 'info');
    }
  }
}

/**
 * ✨ 取消长按检测
 */
function cancelLongPressDetection() {
  const lp = drawingState.longPress;
  lp.isActive = false;
  if (lp.timer) {
    clearTimeout(lp.timer);
    lp.timer = null;
  }
}

/**
 * ✨ Pointer Down - 检测 Apple Pencil Pro 按钮按下
 */
function handlePointerDown(e) {
  // 只处理 Apple Pencil (pen type)
  if (e.pointerType !== 'pen') return;
  if (!drawingState.isActive) return;

  // ✨ 启动长按检测（1秒切换工具）
  startLongPressDetection(e.clientX, e.clientY);

  // 检测 barrel button (侧边按钮)
  // buttons 位掩码：
  // - 1: 主按钮（笔尖接触）
  // - 2: 次要按钮
  // - 4: 辅助按钮
  // - 32: Apple Pencil barrel button (第5个按钮)
  const hasBarrelButton = (e.buttons & 32) !== 0;

  if (hasBarrelButton && !drawingState.barrelButton.pressed) {
    // 按钮刚刚按下
    drawingState.barrelButton.pressed = true;
    drawingState.barrelButton.pressStartTime = Date.now();
    drawingState.barrelButton.longPressTriggered = false;

    // 设置长按定时器（500ms）
    drawingState.barrelButton.longPressTimer = setTimeout(() => {
      handleBarrelButtonLongPress();
    }, 500);

    debugLog('✋ 按钮按下', 'info');
    updateDebugPanel();
  }
}

/**
 * ✨ Pointer Up - 检测 Apple Pencil Pro 按钮松开
 */
function handlePointerUp(e) {
  // 只处理 Apple Pencil
  if (e.pointerType !== 'pen') return;

  // ✨ 取消长按检测
  cancelLongPressDetection();

  // 检查按钮是否松开
  const hasBarrelButton = (e.buttons & 32) !== 0;

  if (!hasBarrelButton && drawingState.barrelButton.pressed) {
    // 按钮松开
    debugLog('🖐️ 按钮松开', 'info');
    handleBarrelButtonRelease();
  }
}

/**
 * 检测触摸是否来自 Apple Pencil
 * @param {Touch} touch - 触摸对象
 * @returns {boolean} 是否是 Apple Pencil
 */
function isStylus(touch) {
  // 标准方式：检查 touchType 属性
  // touchType: 'stylus' - Apple Pencil
  // touchType: 'direct' - 手指直接触摸
  if (touch.touchType !== undefined) {
    return touch.touchType === 'stylus';
  }

  // 降级方案1：检查 force 属性（Apple Pencil 通常支持压感）
  // 注意：某些 iPad 手指触摸也支持 force，所以这不是可靠的检测方式
  // 但可以作为辅助判断
  if (touch.force !== undefined && touch.force > 0) {
    // 有压力值，可能是 Apple Pencil，但也可能是支持压感的手指
    // 无法单独依靠这个判断
  }

  // 降级方案2：检查触摸半径（radiusX/radiusY）
  // Apple Pencil 的触摸半径通常很小（<5）
  // 手指的触摸半径通常较大（>10）
  // 手掌的触摸半径非常大（>20）
  if (touch.radiusX !== undefined && touch.radiusY !== undefined) {
    const avgRadius = (touch.radiusX + touch.radiusY) / 2;
    // 如果平均半径小于8，很可能是 Apple Pencil
    if (avgRadius < 8) {
      return true;
    }
    // 如果半径很大（>15），肯定不是 Apple Pencil
    if (avgRadius > 15) {
      return false;
    }
  }

  // 无法确定：默认保守处理
  // 在画笔模式下，假设是 Apple Pencil（允许绘制）
  // 这样即使检测失败，用户仍然可以绘制，只是可能无法完美区分手指和笔
  return true;
}

/**
 * ✨ Apple Pencil Pro 按钮处理：短按切换颜色
 */
function handleBarrelButtonShortPress() {
  if (!drawingState.isActive) return;

  // 切换到下一个预设颜色
  const colors = PRESET_COLORS;
  drawingState.barrelButton.currentColorIndex =
    (drawingState.barrelButton.currentColorIndex + 1) % colors.length;

  const nextColor = colors[drawingState.barrelButton.currentColorIndex];
  setDrawingColor(nextColor.value);

  // 显示提示
  showToolToast(`颜色：${nextColor.name}`, nextColor.value);
  debugLog(`🎨 短按切换颜色 → ${nextColor.name}`, 'success');
}

/**
 * ✨ Apple Pencil Pro 按钮处理：长按切换橡皮擦
 */
function handleBarrelButtonLongPress() {
  if (!drawingState.isActive) return;

  // 记住长按前的工具
  drawingState.barrelButton.toolBeforePress = drawingState.tool;

  // 切换到橡皮擦
  if (drawingState.tool !== 'eraser') {
    setDrawingTool('eraser');
    showToolToast('橡皮擦（长按中）', '#64748b');
    debugLog('🧹 长按切换 → 橡皮擦', 'warning');
  }

  drawingState.barrelButton.longPressTriggered = true;
}

/**
 * ✨ Apple Pencil Pro 按钮处理：松开恢复画笔
 */
function handleBarrelButtonRelease() {
  const bb = drawingState.barrelButton;

  // 清除长按定时器
  if (bb.longPressTimer) {
    clearTimeout(bb.longPressTimer);
    bb.longPressTimer = null;
  }

  // 如果触发了长按（橡皮擦模式），松开时恢复
  if (bb.longPressTriggered) {
    setDrawingTool(bb.toolBeforePress);
    showToolToast('画笔', drawingState.color);
    debugLog('✏️ 松开恢复 → 画笔', 'success');
  }
  // 如果是短按（没触发长按），说明是快速按下松开
  else if (bb.pressed && Date.now() - bb.pressStartTime < 500) {
    handleBarrelButtonShortPress();
  }

  // 重置状态
  bb.pressed = false;
  bb.pressStartTime = 0;
  bb.longPressTriggered = false;

  updateDebugPanel();
}

/**
 * ✨ 显示工具切换提示（Toast）
 * @param {string} text - 提示文本
 * @param {string} color - 颜色（可选）
 */
function showToolToast(text, color = null) {
  // 移除旧的 Toast
  const oldToast = document.querySelector('.drawing-tool-toast');
  if (oldToast) {
    oldToast.remove();
  }

  // 创建新 Toast
  const toast = document.createElement('div');
  toast.className = 'drawing-tool-toast';
  toast.textContent = text;

  // 如果提供了颜色，显示色块
  if (color) {
    const colorDot = document.createElement('span');
    colorDot.className = 'toast-color-dot';
    colorDot.style.backgroundColor = color;
    toast.insertBefore(colorDot, toast.firstChild);
  }

  document.body.appendChild(toast);

  // 动画显示
  requestAnimationFrame(() => {
    toast.classList.add('show');
  });

  // 2秒后移除
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 2000);
}

/**
 * ✨ Hover 检测：处理指针移动
 * 检测 Apple Pencil 悬停状态变化
 * @param {PointerEvent} e - 指针事件
 */
function handlePointerMove(e) {
  // 只处理 Apple Pencil
  if (e.pointerType !== 'pen') return;

  // ✨ 长按移动检测：如果移动超过10px，取消长按
  const lp = drawingState.longPress;
  if (lp.isActive && !lp.hasMoved) {
    const distance = Math.sqrt(
      Math.pow(e.clientX - lp.startX, 2) +
      Math.pow(e.clientY - lp.startY, 2)
    );

    // 移动超过10px，取消长按检测
    if (distance > 10) {
      lp.hasMoved = true;
      debugLog('🚫 长按检测取消（移动距离过大）', 'info');
    }
  }

  // 判断是否悬停（pressure === 0 表示笔未接触屏幕）
  const isHovering = e.pressure === 0;
  const wasHovering = drawingState.hover.isHovering;

  if (isHovering && !wasHovering) {
    // 🟢 开始悬停
    drawingState.hover.isHovering = true;
    cancelHoverDeactivation(); // 取消关闭计时
    startHoverActivation();     // 开始激活计时（500ms）
    debugLog('🖊️ Apple Pencil 开始悬停', 'info');
  } else if (!isHovering && wasHovering) {
    // 🔴 笔接触屏幕，停止悬停
    drawingState.hover.isHovering = false;
    cancelHoverActivation(); // 取消激活计时
    debugLog('🖊️ Apple Pencil 接触屏幕', 'info');
  }
}

/**
 * ✨ Hover 检测：处理指针离开
 * 检测 Apple Pencil 离开屏幕区域
 * @param {PointerEvent} e - 指针事件
 */
function handlePointerLeave(e) {
  // 只处理 Apple Pencil
  if (e.pointerType !== 'pen') return;

  const wasHovering = drawingState.hover.isHovering;

  if (wasHovering) {
    // 笔离开屏幕
    drawingState.hover.isHovering = false;
    cancelHoverActivation(); // 取消激活计时

    // 仅当由 hover 自动激活时，才启动关闭计时
    if (drawingState.hover.autoActivated && drawingState.isActive) {
      startHoverDeactivation(); // 3000ms 后关闭
      debugLog('🖊️ Apple Pencil 离开，3000ms 后自动关闭', 'info');
    } else {
      debugLog('🖊️ Apple Pencil 离开（手动激活模式，不自动关闭）', 'info');
    }
  }
}

/**
 * ✨ Hover 激活：开始 300ms 计时
 * 悬停持续 300ms 后自动激活涂鸦模式（提升灵敏度）
 */
function startHoverActivation() {
  cancelHoverActivation(); // 先取消旧计时器

  drawingState.hover.activationTimer = setTimeout(() => {
    // 检查是否仍在悬停状态
    if (drawingState.hover.isHovering && !drawingState.isActive) {
      // 自动激活涂鸦模式
      toggleDrawingMode();
      drawingState.hover.autoActivated = true;

      // ✨ 同步更新工具栏 UI
      updateDrawingToolbarUI(true);

      showToolToast('✨ Hover 激活涂鸦', drawingState.color);
      debugLog('✅ Hover 300ms 达成，自动激活涂鸦模式', 'success');
    }
  }, 300);
}

/**
 * ✨ Hover 激活：取消激活计时
 */
function cancelHoverActivation() {
  if (drawingState.hover.activationTimer) {
    clearTimeout(drawingState.hover.activationTimer);
    drawingState.hover.activationTimer = null;
  }
}

/**
 * ✨ Hover 关闭：开始 3000ms 计时
 * 笔离开后，3000ms 自动关闭涂鸦模式（仅限自动激活的情况）
 * 延长时间避免用户思考时误关闭
 */
function startHoverDeactivation() {
  cancelHoverDeactivation(); // 先取消旧计时器

  drawingState.hover.deactivationTimer = setTimeout(() => {
    // 只有在自动激活模式下才自动关闭
    if (drawingState.hover.autoActivated && drawingState.isActive) {
      toggleDrawingMode();
      drawingState.hover.autoActivated = false;

      // ✨ 同步更新工具栏 UI
      updateDrawingToolbarUI(false);

      showToolToast('💤 Hover 关闭涂鸦', '#8e8e93');
      debugLog('⏰ Hover 3000ms 超时，自动关闭涂鸦模式', 'info');
    }
  }, 3000);
}

/**
 * ✨ Hover 关闭：取消关闭计时
 */
function cancelHoverDeactivation() {
  if (drawingState.hover.deactivationTimer) {
    clearTimeout(drawingState.hover.deactivationTimer);
    drawingState.hover.deactivationTimer = null;
  }
}

/**
 * ✨ 更新涂鸦工具栏 UI 状态
 * 同步画笔按钮和扩展工具栏的显示状态
 * @param {boolean} isActive - 涂鸦模式是否激活
 */
function updateDrawingToolbarUI(isActive) {
  // 查找画笔按钮（通过类名）
  const drawingButton = document.querySelector('.drawing-toolbar-button');
  // 查找扩展工具栏
  const extendedTools = document.querySelector('.drawing-extended-tools');

  if (!drawingButton || !extendedTools) {
    console.warn('[Hover] Drawing toolbar elements not found');
    return;
  }

  if (isActive) {
    // 激活状态
    drawingButton.classList.add('active');
    extendedTools.style.display = 'flex';
    debugLog('✅ 工具栏已打开', 'info');
  } else {
    // 关闭状态
    drawingButton.classList.remove('active');
    extendedTools.style.display = 'none';
    debugLog('❌ 工具栏已关闭', 'info');
  }
}

/**
 * ✨ iPad 调试面板：添加日志
 * @param {string} message - 日志消息
 * @param {string} type - 日志类型 ('info' | 'success' | 'warning' | 'error')
 */
function debugLog(message, type = 'info') {
  // 如果调试面板未启用，静默跳过
  if (!drawingState.debugPanel.enabled) {
    console.log(`[DEBUG] ${message}`);
    return;
  }

  const timestamp = new Date().toLocaleTimeString('zh-CN', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 1
  });

  // 添加到日志数组（保留最近20条）
  drawingState.debugPanel.logs.push({ timestamp, message, type });
  if (drawingState.debugPanel.logs.length > 20) {
    drawingState.debugPanel.logs.shift();
  }

  // 更新调试面板显示
  updateDebugPanel();

  // 同时输出到控制台（如果连接了 Mac）
  console.log(`[DEBUG] ${message}`);
}

/**
 * ✨ iPad 调试面板：创建或更新显示
 */
function updateDebugPanel() {
  if (!drawingState.debugPanel.enabled) return;

  let panel = drawingState.debugPanel.element;

  // 如果面板不存在，创建它
  if (!panel) {
    panel = document.createElement('div');
    panel.className = 'debug-panel';
    panel.innerHTML = `
      <div class="debug-panel-header">
        <span>🔍 Apple Pencil Pro 调试</span>
        <button class="debug-close-btn" onclick="window.closeDebugPanel?.()">×</button>
      </div>
      <div class="debug-panel-status">
        <div class="debug-status-item">
          <span class="debug-label">工具:</span>
          <span class="debug-value" id="debug-tool">-</span>
        </div>
        <div class="debug-status-item">
          <span class="debug-label">颜色:</span>
          <span class="debug-value" id="debug-color">
            <span class="debug-color-dot"></span>
            <span id="debug-color-name">-</span>
          </span>
        </div>
        <div class="debug-status-item">
          <span class="debug-label">按钮:</span>
          <span class="debug-value" id="debug-button">-</span>
        </div>
      </div>
      <div class="debug-panel-logs">
        <div class="debug-logs-header">事件日志</div>
        <div class="debug-logs-content" id="debug-logs"></div>
      </div>
    `;
    document.body.appendChild(panel);
    drawingState.debugPanel.element = panel;

    // 注册关闭函数
    window.closeDebugPanel = () => {
      drawingState.debugPanel.enabled = false;
      if (drawingState.debugPanel.element) {
        drawingState.debugPanel.element.remove();
        drawingState.debugPanel.element = null;
      }
    };
  }

  // 更新状态显示
  const toolText = drawingState.tool === 'pen' ? '画笔' : '橡皮擦';
  const toolEl = document.getElementById('debug-tool');
  if (toolEl) toolEl.textContent = toolText;

  const colorName = PRESET_COLORS.find(c => c.value === drawingState.color)?.name || '自定义';
  const colorDot = panel.querySelector('.debug-color-dot');
  const colorNameEl = document.getElementById('debug-color-name');
  if (colorDot) colorDot.style.backgroundColor = drawingState.color;
  if (colorNameEl) colorNameEl.textContent = colorName;

  const buttonState = drawingState.barrelButton.pressed ?
    (drawingState.barrelButton.longPressTriggered ? '长按中' : '按下') : '松开';
  const buttonEl = document.getElementById('debug-button');
  if (buttonEl) {
    buttonEl.textContent = buttonState;
    buttonEl.className = `debug-value ${drawingState.barrelButton.pressed ? 'button-pressed' : ''}`;
  }

  // 更新日志显示
  const logsEl = document.getElementById('debug-logs');
  if (logsEl) {
    logsEl.innerHTML = drawingState.debugPanel.logs
      .map(log => `
        <div class="debug-log-item debug-log-${log.type}">
          <span class="debug-log-time">${log.timestamp}</span>
          <span class="debug-log-msg">${log.message}</span>
        </div>
      `)
      .reverse() // 最新的在上面
      .join('');

    // 自动滚动到顶部（最新日志）
    logsEl.scrollTop = 0;
  }
}

/**
 * ✨ iPad 调试面板：开启/关闭
 * @export
 */
export function toggleDebugPanel() {
  drawingState.debugPanel.enabled = !drawingState.debugPanel.enabled;

  if (drawingState.debugPanel.enabled) {
    debugLog('调试面板已开启', 'success');
    updateDebugPanel();
  } else {
    if (drawingState.debugPanel.element) {
      drawingState.debugPanel.element.remove();
      drawingState.debugPanel.element = null;
    }
    console.log('[DEBUG] 调试面板已关闭');
  }

  return drawingState.debugPanel.enabled;
}

/**
 * 获取鼠标位置对应的Canvas
 */
function getCanvasAtPoint(clientX, clientY) {
  const clickedElement = document.elementFromPoint(clientX, clientY);
  if (!clickedElement) return { canvas: null, ctx: null, paneName: null };

  // 查找点击元素所在的面板
  const leftPane = clickedElement.closest('.left-pane');
  const rightPane = clickedElement.closest('.right-pane');

  if (leftPane) {
    return {
      canvas: drawingState.leftCanvas,
      ctx: drawingState.leftCtx,
      paneName: 'left'
    };
  } else if (rightPane) {
    return {
      canvas: drawingState.rightCanvas,
      ctx: drawingState.rightCtx,
      paneName: 'right'
    };
  }

  return { canvas: null, ctx: null, paneName: null };
}

/**
 * 移除绘图事件监听
 */
function removeDrawingEvents() {
  if (drawingState.handlers.mousedown) {
    document.removeEventListener('mousedown', drawingState.handlers.mousedown);
    document.removeEventListener('mousemove', drawingState.handlers.mousemove);
    document.removeEventListener('mouseup', drawingState.handlers.mouseup);
    document.removeEventListener('touchstart', drawingState.handlers.touchstart);
    document.removeEventListener('touchmove', drawingState.handlers.touchmove);
    document.removeEventListener('touchend', drawingState.handlers.touchend);
  }

  // ✨ 移除 Pointer Events 监听器
  document.removeEventListener('pointerdown', handlePointerDown);
  document.removeEventListener('pointerup', handlePointerUp);

  // ✨ 移除 Hover 检测监听器
  document.removeEventListener('pointermove', handlePointerMove);
  document.removeEventListener('pointerleave', handlePointerLeave);

  // 清理 barrel button 状态
  const bb = drawingState.barrelButton;
  if (bb.longPressTimer) {
    clearTimeout(bb.longPressTimer);
    bb.longPressTimer = null;
  }
  bb.pressed = false;
  bb.longPressTriggered = false;

  // ✨ 清理 Hover 状态
  cancelHoverActivation();
  cancelHoverDeactivation();
  drawingState.hover.isHovering = false;
  drawingState.hover.autoActivated = false;

  // ✨ 清理长按状态
  const lp = drawingState.longPress;
  if (lp.timer) {
    clearTimeout(lp.timer);
    lp.timer = null;
  }
  lp.isActive = false;
  lp.hasMoved = false;
}

/**
 * 获取绘制坐标（画布使用 absolute 定位，坐标相对于画布）
 * ⚠️ 架构关键：Canvas是absolute定位在面板内部，随面板滚动
 * 因此坐标计算极其简单，无需考虑scrollTop！
 *
 * @param {number} clientX - 鼠标/触摸的 clientX
 * @param {number} clientY - 鼠标/触摸的 clientY
 * @param {HTMLCanvasElement} canvas - 目标画布
 * @returns {{x: number, y: number}} 画布坐标
 */
function getCanvasCoordinates(clientX, clientY, canvas) {
  if (!canvas) return { x: 0, y: 0 };

  // 获取画布在视口中的位置
  const canvasRect = canvas.getBoundingClientRect();

  // 直接计算相对于画布的坐标
  // Canvas随面板滚动，点击的clientX/Y自然对应正确的canvas坐标
  const x = clientX - canvasRect.left;
  const y = clientY - canvasRect.top;

  return { x, y };
}

/**
 * 停止绘图
 */
function stopDrawing() {
  drawingState.isDrawing = false;

  // 关闭当前正在绘制的面板的路径
  if (drawingState.currentPane) {
    const ctx = drawingState.currentPane === 'left' ?
      drawingState.leftCtx : drawingState.rightCtx;
    ctx?.closePath();
  }

  // ⚠️ 自动保存（debounce优化）
  clearTimeout(drawingState.autoSaveTimer);
  drawingState.autoSaveTimer = setTimeout(() => {
    saveDrawingData();
  }, 1000);
}

/**
 * 应用画笔设置
 * @param {CanvasRenderingContext2D} ctx 
 */
function applyBrushSettings(ctx) {
  if (!ctx) return;
  
  if (drawingState.tool === 'eraser') {
    ctx.globalCompositeOperation = 'destination-out';
    ctx.strokeStyle = 'rgba(0,0,0,1)';
    ctx.lineWidth = drawingState.lineWidth * 3;
    ctx.shadowBlur = 0;
  } else {
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = drawingState.color;
    ctx.lineWidth = drawingState.lineWidth;
    ctx.shadowColor = drawingState.color + '4D';
    ctx.shadowBlur = 2;
  }
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
}

/**
 * 切换画笔模式
 * @returns {boolean} 当前画笔状态
 */
export function toggleDrawingMode() {
  drawingState.isActive = !drawingState.isActive;

  const leftCanvas = drawingState.leftCanvas;
  const rightCanvas = drawingState.rightCanvas;
  const container = drawingState.container;

  // ✨ 手动关闭时重置 hover 状态
  if (!drawingState.isActive) {
    drawingState.hover.autoActivated = false;
    cancelHoverActivation();
    cancelHoverDeactivation();
    debugLog('🔴 手动关闭涂鸦模式，重置 Hover 状态', 'info');
  }

  // 更新两个画布的状态
  if (leftCanvas) {
    if (drawingState.isActive) {
      leftCanvas.classList.add('drawing-active');
    } else {
      leftCanvas.classList.remove('drawing-active');
    }
  }

  if (rightCanvas) {
    if (drawingState.isActive) {
      rightCanvas.classList.add('drawing-active');
    } else {
      rightCanvas.classList.remove('drawing-active');
    }
  }

  // 在容器上设置光标
  if (container) {
    if (drawingState.isActive) {
      container.style.cursor = drawingState.tool === 'eraser' ? 'cell' : 'crosshair';
    } else {
      container.style.cursor = '';
    }

    // ✨ iPad优化：动态设置 touch-action
    // 画笔激活时，JavaScript 会处理所有触摸事件并区分 Apple Pencil 和手指
    // 这里不设置 touch-action: none，因为我们在 JS 中选择性地 preventDefault
    // 这样可以保证手指仍然可以滚动，而 Apple Pencil 会被拦截绘制
  }

  // 更新所有 iframe 遮罩层的状态
  updateIframeMasks(drawingState.isActive);

  return drawingState.isActive;
}

/**
 * 更新所有 iframe 遮罩层的状态
 * @param {boolean} isActive - 画笔是否激活
 */
function updateIframeMasks(isActive) {
  const masks = document.querySelectorAll('.iframe-drawing-mask');
  masks.forEach(mask => {
    if (isActive) {
      mask.classList.add('drawing-active');
      mask.style.cursor = drawingState.tool === 'eraser' ? 'cell' : 'crosshair';
      mask.style.pointerEvents = 'auto'; // 启用事件捕获
    } else {
      mask.classList.remove('drawing-active');
      mask.style.cursor = '';
      mask.style.pointerEvents = 'none'; // 禁用事件捕获
    }
  });
}

/**
 * 获取画笔状态
 * @returns {boolean}
 */
export function isDrawingActive() {
  return drawingState.isActive;
}

/**
 * 更新视图类型（视图切换时调用）
 * @param {string} leftView - 新的左侧视图类型
 * @param {string} rightView - 新的右侧视图类型
 */
export function updateViewTypes(leftView, rightView) {
  // ⚠️ 关键：先取消自动保存定时器，避免在加载期间保存空白Canvas
  clearTimeout(drawingState.autoSaveTimer);

  drawingState.leftView = leftView;
  drawingState.rightView = rightView;
  console.log(`[VIEW] View types updated: left=${leftView}, right=${rightView}`);

  // 注意：不在这里清空Canvas
  // loadCanvasData 会在加载前自动清空Canvas
  // 这样避免了"清空→加载(异步)→自动保存空白"的时序问题

  // 加载新视图的涂鸦
  loadDrawingData();
}

/**
 * 清除画布
 */
export function clearDrawing() {
  // ⚠️ 关键：取消自动保存计时器，避免保存空白画布
  clearTimeout(drawingState.autoSaveTimer);

  // 清除左侧画布
  if (drawingState.leftCanvas && drawingState.leftCtx) {
    const leftCtx = drawingState.leftCtx;
    const currentOp = leftCtx.globalCompositeOperation;
    leftCtx.globalCompositeOperation = 'source-over';
    leftCtx.clearRect(0, 0, drawingState.leftCanvas.width, drawingState.leftCanvas.height);
    leftCtx.globalCompositeOperation = currentOp;
  }

  // 清除右侧画布
  if (drawingState.rightCanvas && drawingState.rightCtx) {
    const rightCtx = drawingState.rightCtx;
    const currentOp = rightCtx.globalCompositeOperation;
    rightCtx.globalCompositeOperation = 'source-over';
    rightCtx.clearRect(0, 0, drawingState.rightCanvas.width, drawingState.rightCanvas.height);
    rightCtx.globalCompositeOperation = currentOp;
  }
}

/**
 * 设置工具类型
 * @param {string} tool - 'pen' | 'eraser'
 */
export function setDrawingTool(tool) {
  drawingState.tool = tool;

  const container = drawingState.container;
  const cursor = tool === 'eraser' ? 'cell' : 'crosshair';

  if (container && drawingState.isActive) {
    container.style.cursor = cursor;
  }

  // 同步更新 iframe 遮罩层的光标
  if (drawingState.isActive) {
    const masks = document.querySelectorAll('.iframe-drawing-mask.drawing-active');
    masks.forEach(mask => {
      mask.style.cursor = cursor;
    });
  }

  // 应用到两个画布的 ctx
  if (drawingState.leftCtx) {
    applyBrushSettings(drawingState.leftCtx);
  }
  if (drawingState.rightCtx) {
    applyBrushSettings(drawingState.rightCtx);
  }
}

/**
 * 获取当前工具
 * @returns {string}
 */
export function getCurrentTool() {
  return drawingState.tool;
}

/**
 * 设置画笔颜色
 * @param {string} color
 */
export function setDrawingColor(color) {
  drawingState.color = color;

  // ✨ 同步更新颜色索引（用于 Apple Pencil Pro 按钮切换）
  const colorIndex = PRESET_COLORS.findIndex(c => c.value === color);
  if (colorIndex !== -1) {
    drawingState.barrelButton.currentColorIndex = colorIndex;
  }

  // 应用到两个画布的 ctx
  if (drawingState.leftCtx) {
    applyBrushSettings(drawingState.leftCtx);
  }
  if (drawingState.rightCtx) {
    applyBrushSettings(drawingState.rightCtx);
  }
}

/**
 * 获取当前颜色
 * @returns {string}
 */
export function getCurrentColor() {
  return drawingState.color;
}

/**
 * 设置线宽
 * @param {number} width
 */
export function setLineWidth(width) {
  drawingState.lineWidth = width;
  // 应用到两个画布的 ctx
  if (drawingState.leftCtx) {
    applyBrushSettings(drawingState.leftCtx);
  }
  if (drawingState.rightCtx) {
    applyBrushSettings(drawingState.rightCtx);
  }
}

/**
 * 获取当前线宽
 * @returns {number}
 */
export function getLineWidth() {
  return drawingState.lineWidth;
}

/**
 * 获取预设颜色列表
 * @returns {Array}
 */
export function getPresetColors() {
  return PRESET_COLORS;
}

/**
 * 获取线宽选项
 * @returns {Array}
 */
export function getLineWidthOptions() {
  return LINE_WIDTHS;
}

/**
 * 导出为PDF
 */
export async function exportToPDF() {
  const canvas = drawingState.canvas;
  const container = drawingState.container;
  const lessonId = drawingState.lessonId;
  
  if (!canvas || !container) {
    console.error('Canvas or container not available');
    return;
  }
  
  try {
    // 显示加载提示
    const loadingOverlay = document.createElement('div');
    loadingOverlay.className = 'pdf-export-loading';
    loadingOverlay.innerHTML = `
      <div class="loading-content">
        <div class="loading-spinner"></div>
        <p>正在生成 PDF...</p>
      </div>
    `;
    document.body.appendChild(loadingOverlay);
    
    // 动态加载库
    await loadExportLibraries();
    
    // 使用 html2canvas 截取内容区
    const contentCanvas = await html2canvas(container, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#ffffff',
      ignoreElements: (element) => {
        // 忽略画布本身，后面单独合并
        return element.classList.contains('global-drawing-canvas');
      }
    });
    
    // 创建合并画布
    const mergedCanvas = document.createElement('canvas');
    mergedCanvas.width = contentCanvas.width;
    mergedCanvas.height = contentCanvas.height;
    const mergedCtx = mergedCanvas.getContext('2d');
    
    // 绘制内容
    mergedCtx.drawImage(contentCanvas, 0, 0);
    
    // 绘制涂鸦层（按比例缩放）
    const scaleX = contentCanvas.width / canvas.width;
    const scaleY = contentCanvas.height / canvas.height;
    mergedCtx.save();
    mergedCtx.scale(scaleX, scaleY);
    mergedCtx.drawImage(canvas, 0, 0);
    mergedCtx.restore();
    
    // 创建 PDF
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({
      orientation: mergedCanvas.width > mergedCanvas.height ? 'landscape' : 'portrait',
      unit: 'px',
      format: [mergedCanvas.width, mergedCanvas.height]
    });
    
    // 添加图像到 PDF
    const imgData = mergedCanvas.toDataURL('image/jpeg', 0.95);
    pdf.addImage(imgData, 'JPEG', 0, 0, mergedCanvas.width, mergedCanvas.height);
    
    // 保存 PDF
    const fileName = `${lessonId || 'lesson'}_${formatDate(new Date())}.pdf`;
    pdf.save(fileName);
    
    // 移除加载提示
    document.body.removeChild(loadingOverlay);
    
  } catch (error) {
    console.error('PDF export failed:', error);
    alert('导出 PDF 失败: ' + error.message);
    
    const overlay = document.querySelector('.pdf-export-loading');
    if (overlay) {
      document.body.removeChild(overlay);
    }
  }
}

/**
 * 动态加载导出所需的库
 */
async function loadExportLibraries() {
  if (window.html2canvas && window.jspdf) {
    return;
  }
  
  if (!window.html2canvas) {
    await loadScript('https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js');
  }
  
  if (!window.jspdf) {
    await loadScript('https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js');
  }
}

/**
 * 动态加载脚本
 * @param {string} src
 * @returns {Promise}
 */
function loadScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

/**
 * 格式化日期
 * @param {Date} date 
 * @returns {string}
 */
function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const h = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${y}${m}${d}_${h}${min}`;
}

/**
 * 销毁画布
 */
export function destroyCanvas() {
  // 移除事件监听
  removeDrawingEvents();

  // 移除窗口事件监听
  if (drawingState.windowHandlers) {
    window.removeEventListener('resize', drawingState.windowHandlers.resize);
    drawingState.windowHandlers = null;
  }

  // 移除滚动监听
  if (drawingState.scrollHandlers) {
    const { leftPane, rightPane, handler } = drawingState.scrollHandlers;
    if (leftPane) {
      leftPane.removeEventListener('scroll', handler);
    }
    if (rightPane) {
      rightPane.removeEventListener('scroll', handler);
    }
    drawingState.scrollHandlers = null;
  }

  // 恢复容器光标
  if (drawingState.container) {
    drawingState.container.style.cursor = '';
  }

  // 移除两个画布
  if (drawingState.leftCanvas) {
    drawingState.leftCanvas.remove();
  }
  if (drawingState.rightCanvas) {
    drawingState.rightCanvas.remove();
  }

  // 重置状态
  drawingState.leftCanvas = null;
  drawingState.rightCanvas = null;
  drawingState.leftCtx = null;
  drawingState.rightCtx = null;
  drawingState.container = null;
  drawingState.isActive = false;
  drawingState.isDrawing = false;
}

/**
 * 保存当前涂鸦到localStorage
 * @returns {Promise<boolean>} 是否保存成功
 */
export async function saveDrawingData() {
  const lessonId = drawingState.lessonId;
  const leftView = drawingState.leftView;
  const rightView = drawingState.rightView;

  if (!lessonId) {
    console.warn('LessonId not available for saving');
    return false;
  }

  let allSuccess = true;

  // 保存左侧画布（绑定到leftView内容类型）
  if (drawingState.leftCanvas && drawingState.leftCtx && leftView) {
    try {
      const success = await saveCanvasData(
        drawingState.leftCanvas,
        drawingState.leftCtx,
        lessonId,
        leftView  // 移除pane参数，只传viewType
      );
      allSuccess = allSuccess && success;
    } catch (error) {
      console.error('Failed to save left canvas:', error);
      allSuccess = false;
    }
  }

  // 保存右侧画布（绑定到rightView内容类型）
  if (drawingState.rightCanvas && drawingState.rightCtx && rightView) {
    try {
      const success = await saveCanvasData(
        drawingState.rightCanvas,
        drawingState.rightCtx,
        lessonId,
        rightView  // 移除pane参数，只传viewType
      );
      allSuccess = allSuccess && success;
    } catch (error) {
      console.error('Failed to save right canvas:', error);
      allSuccess = false;
    }
  }

  return allSuccess;
}

/**
 * ✨ 压缩画布数据
 * 优化策略：
 * 1. 创建临时画布，填充白色背景
 * 2. 绘制原始涂鸦内容
 * 3. 使用JPEG格式压缩（质量0.7）
 * 4. 限制最大分辨率（2400px）
 * @param {HTMLCanvasElement} canvas - 原始画布
 * @param {CanvasRenderingContext2D} ctx - 画布上下文
 * @returns {Object} 压缩结果对象
 */
function compressCanvasData(canvas, ctx) {
  const MAX_WIDTH = 2400; // 最大宽度限制
  const JPEG_QUALITY = 0.7; // JPEG质量（0-1）

  // 计算压缩后的尺寸
  let targetWidth = canvas.width;
  let targetHeight = canvas.height;

  if (targetWidth > MAX_WIDTH) {
    const scale = MAX_WIDTH / targetWidth;
    targetWidth = MAX_WIDTH;
    targetHeight = Math.round(targetHeight * scale);
  }

  // 创建临时画布用于压缩
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = targetWidth;
  tempCanvas.height = targetHeight;
  const tempCtx = tempCanvas.getContext('2d');

  // 填充白色背景（JPEG不支持透明度）
  tempCtx.fillStyle = '#FFFFFF';
  tempCtx.fillRect(0, 0, targetWidth, targetHeight);

  // 绘制原始内容（如果有缩放则自动缩放）
  tempCtx.drawImage(canvas, 0, 0, targetWidth, targetHeight);

  // 获取原始PNG大小（用于对比）
  const originalDataURL = canvas.toDataURL('image/png');
  const originalSize = originalDataURL.length;

  // 转换为JPEG格式
  const compressedDataURL = tempCanvas.toDataURL('image/jpeg', JPEG_QUALITY);
  const compressedSize = compressedDataURL.length;

  // 计算压缩率
  const compressionRatio = Math.round((1 - compressedSize / originalSize) * 100);

  return {
    dataURL: compressedDataURL,
    format: 'jpeg',
    quality: JPEG_QUALITY,
    originalSize: originalSize,
    compressedSize: compressedSize,
    compressionRatio: compressionRatio,
    scaled: targetWidth !== canvas.width
  };
}

/**
 * ✨ 获取LocalStorage使用情况
 * @returns {Object} 存储使用信息
 */
function getStorageUsageInfo() {
  try {
    // 计算总使用量
    let totalBytes = 0;
    let drawingBytes = 0;

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      const value = localStorage.getItem(key);
      const size = key.length + value.length;
      totalBytes += size;

      if (key.startsWith(STORAGE_KEY_PREFIX)) {
        drawingBytes += size;
      }
    }

    // 浏览器通常限制5-10MB，保守估计5MB
    const quotaBytes = 5 * 1024 * 1024;

    return {
      usedMB: (totalBytes / 1024 / 1024).toFixed(2),
      drawingMB: (drawingBytes / 1024 / 1024).toFixed(2),
      quotaMB: (quotaBytes / 1024 / 1024).toFixed(0),
      usagePercent: Math.round((totalBytes / quotaBytes) * 100)
    };
  } catch (error) {
    console.error('[STORAGE] Failed to get usage info:', error);
    return {
      usedMB: 'N/A',
      drawingMB: 'N/A',
      quotaMB: '5',
      usagePercent: 'N/A'
    };
  }
}

/**
 * 保存单个画布的数据
 * ⚠️ 关键：涂鸦数据只绑定到viewType，不绑定到面板位置
 * 这样当视图在左右面板切换时，涂鸦会跟随内容
 * @param {HTMLCanvasElement} canvas - 画布元素
 * @param {CanvasRenderingContext2D} ctx - 画布上下文
 * @param {string} lessonId - 课程ID
 * @param {string} viewType - 视图类型 ('notebook' | 'html' | 'questions')
 * @returns {Promise<boolean>} 是否保存成功
 */
async function saveCanvasData(canvas, ctx, lessonId, viewType) {
  try {
    console.log(`[SAVE] Saving drawing for lesson ${lessonId}, view: ${viewType}`);

    // 检查画布是否为空
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const pixels = imageData.data;

    let hasContent = false;
    for (let i = 3; i < pixels.length; i += 4) {
      if (pixels[i] > 0) { // alpha通道不为0
        hasContent = true;
        break;
      }
    }

    // ⚠️ 关键改动：存储键只包含 lessonId 和 viewType，移除 pane
    // 这样涂鸦数据绑定到内容类型，不绑定到面板位置
    const storageKey = `${STORAGE_KEY_PREFIX}${lessonId}_${viewType}`;

    if (!hasContent) {
      // 画布为空，清除存储

      // 1. 尝试从服务器删除
      try {
        await drawingAPI.deleteDrawing(lessonId, viewType);
        console.log(`[SAVE] 🗑️ Deleted empty drawing from server: ${lessonId}/${viewType}`);
      } catch (error) {
        console.warn('[SAVE] Failed to delete from server, fallback to localStorage only');
      }

      // 2. 从 localStorage 删除
      localStorage.removeItem(storageKey);
      console.log(`[SAVE] Empty canvas, removed saved data for ${lessonId}/${viewType}`);
      return true;
    }

    // ✨ 优化：压缩画布数据
    const compressedData = compressCanvasData(canvas, ctx);

    // 构造存储对象（移除pane字段）
    const drawingData = {
      version: '2.0',  // 版本升级到2.0（支持压缩）
      lessonId: lessonId,
      viewType: viewType,
      timestamp: Date.now(),
      canvasWidth: canvas.width,
      canvasHeight: canvas.height,
      imageData: compressedData.dataURL,
      compressionInfo: {
        format: compressedData.format,
        quality: compressedData.quality,
        originalSize: compressedData.originalSize,
        compressedSize: compressedData.compressedSize,
        compressionRatio: compressedData.compressionRatio
      }
    };

    // ⚡ 新逻辑：优先保存到服务器
    try {
      const result = await drawingAPI.saveDrawing(lessonId, viewType, drawingData);
      if (result.success) {
        console.log(`[SAVE] ✅ Saved to server: ${lessonId}/${viewType}`);
        console.log(`[SAVE] 🗜️ Compression: ${compressedData.compressionRatio}% (${Math.round(compressedData.originalSize / 1024)}KB → ${Math.round(compressedData.compressedSize / 1024)}KB)`);

        // 同时保存到 localStorage 作为本地缓存
        localStorage.setItem(storageKey, JSON.stringify(drawingData));
        console.log(`[SAVE] 💾 Cached to localStorage, size: ${Math.round(compressedData.compressedSize / 1024)}KB`);
        return true;
      }
    } catch (error) {
      console.warn(`[SAVE] Server unavailable, fallback to localStorage: ${error.message}`);
    }

    // 降级：只保存到 localStorage
    localStorage.setItem(storageKey, JSON.stringify(drawingData));
    console.log(`[SAVE] ⚠️ Saved to localStorage only (server unavailable), size: ${Math.round(compressedData.compressedSize / 1024)}KB`);
    console.log(`[SAVE] 🗜️ Compression: ${compressedData.compressionRatio}% (${Math.round(compressedData.originalSize / 1024)}KB → ${Math.round(compressedData.compressedSize / 1024)}KB)`);
    return true;

  } catch (error) {
    console.error(`[SAVE] ❌ Failed to save canvas:`, error);

    // 检查是否是配额超限错误
    if (error.name === 'QuotaExceededError') {
      const storageInfo = getStorageUsageInfo();
      const message = `存储空间不足，无法保存涂鸦\n\n` +
        `当前LocalStorage使用: ${storageInfo.usedMB}MB / ${storageInfo.quotaMB}MB (${storageInfo.usagePercent}%)\n` +
        `涂鸦数据占用: ${storageInfo.drawingMB}MB\n\n` +
        `建议操作：\n` +
        `1. 删除不需要的涂鸦（使用清除按钮）\n` +
        `2. 清理浏览器缓存数据\n` +
        `3. 涂鸦会自动保存到服务器，可删除本地缓存`;
      alert(message);
    }

    return false;
  }
}

/**
 * 从localStorage加载涂鸦数据
 * @returns {Promise<boolean>} 是否加载成功
 */
export async function loadDrawingData() {
  const lessonId = drawingState.lessonId;
  const leftView = drawingState.leftView;
  const rightView = drawingState.rightView;

  console.log(`[LOAD] 📋 Loading state: lessonId=${lessonId}, leftView=${leftView}, rightView=${rightView}`);

  if (!lessonId) {
    console.warn('LessonId not available for loading');
    return false;
  }

  // 调试：检查localStorage中的所有drawing keys
  console.log('[LOAD] 🔍 localStorage中的所有drawing keys:');
  Object.keys(localStorage).filter(k => k.startsWith(STORAGE_KEY_PREFIX)).forEach(k => {
    console.log(`  - ${k}`);
  });

  let allSuccess = true;

  // 加载左侧画布（从leftView内容类型加载）
  if (drawingState.leftCanvas && drawingState.leftCtx && leftView) {
    console.log(`[LOAD] 🔄 Attempting to load LEFT canvas for viewType: ${leftView}`);
    const success = await loadCanvasData(
      drawingState.leftCanvas,
      drawingState.leftCtx,
      lessonId,
      leftView  // 移除pane参数，只传viewType
    );
    allSuccess = allSuccess && success;
  } else {
    console.log(`[LOAD] ⏭️ Skipping LEFT canvas: canvas=${!!drawingState.leftCanvas}, ctx=${!!drawingState.leftCtx}, view=${leftView}`);
  }

  // 加载右侧画布（从rightView内容类型加载）
  if (drawingState.rightCanvas && drawingState.rightCtx && rightView) {
    console.log(`[LOAD] 🔄 Attempting to load RIGHT canvas for viewType: ${rightView}`);
    const success = await loadCanvasData(
      drawingState.rightCanvas,
      drawingState.rightCtx,
      lessonId,
      rightView  // 移除pane参数，只传viewType
    );
    allSuccess = allSuccess && success;
  } else {
    console.log(`[LOAD] ⏭️ Skipping RIGHT canvas: canvas=${!!drawingState.rightCanvas}, ctx=${!!drawingState.rightCtx}, view=${rightView}`);
  }

  return allSuccess;
}

/**
 * 加载单个画布的数据
 * ⚠️ 关键：从viewType加载涂鸦数据到指定canvas
 * 无论内容显示在左侧还是右侧，都加载同样的涂鸦
 * @param {HTMLCanvasElement} canvas - 画布元素
 * @param {CanvasRenderingContext2D} ctx - 画布上下文
 * @param {string} lessonId - 课程ID
 * @param {string} viewType - 视图类型 ('notebook' | 'html' | 'questions')
 * @returns {Promise<boolean>} 是否加载成功
 */
async function loadCanvasData(canvas, ctx, lessonId, viewType) {
  try {
    // ⚠️ 关键：先清空Canvas，避免旧内容残留
    const currentOp = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.globalCompositeOperation = currentOp;

    // 清空后先隐藏Canvas
    canvas.style.opacity = '0';

    let drawingData = null;

    // ⚡ 新逻辑：优先从服务器加载
    try {
      const serverData = await drawingAPI.getDrawing(lessonId, viewType);
      if (serverData) {
        console.log(`[LOAD] ✅ Loaded from server: ${lessonId}/${viewType}`);
        drawingData = serverData;

        // 更新本地缓存
        const storageKey = `${STORAGE_KEY_PREFIX}${lessonId}_${viewType}`;
        localStorage.setItem(storageKey, JSON.stringify(serverData));
        console.log(`[LOAD] 💾 Cached to localStorage`);
      }
    } catch (error) {
      console.warn(`[LOAD] Server unavailable, fallback to localStorage: ${error.message}`);
    }

    // 降级：从 localStorage 加载
    if (!drawingData) {
      const storageKey = `${STORAGE_KEY_PREFIX}${lessonId}_${viewType}`;
      console.log(`[LOAD] 🔑 Looking for key in localStorage: "${storageKey}"`);

      const savedData = localStorage.getItem(storageKey);
      console.log(`[LOAD] 📦 Data found: ${savedData !== null}, size: ${savedData ? Math.round(savedData.length / 1024) + 'KB' : 'N/A'}`);

      if (!savedData) {
        console.log(`[LOAD] No saved drawing for ${lessonId}/${viewType}`);
        // ⚠️ 关键修复：没有数据时，清除内联opacity样式，让CSS类控制可见性
        canvas.style.opacity = '';  // 清除内联样式
        return false;
      }

      drawingData = JSON.parse(savedData);
      console.log(`[LOAD] ⚠️ Loaded from localStorage only (server unavailable)`);
    }

    // 验证数据版本（支持1.0和2.0）
    const supportedVersions = ['1.0', '2.0'];
    if (!supportedVersions.includes(drawingData.version)) {
      console.warn('[LOAD] Unsupported drawing data version:', drawingData.version);
      return false;
    }

    // 显示压缩信息（仅2.0版本）
    if (drawingData.version === '2.0' && drawingData.compressionInfo) {
      const info = drawingData.compressionInfo;
      console.log(`[LOAD] 🗜️ Compressed format: ${info.format}, quality: ${info.quality}, ratio: ${info.compressionRatio}%`);
    }

    // 验证lessonId匹配
    if (drawingData.lessonId !== lessonId) {
      console.warn('[LOAD] Lesson ID mismatch');
      return false;
    }

    // 验证viewType匹配
    if (drawingData.viewType !== viewType) {
      console.warn('[LOAD] ViewType mismatch');
      return false;
    }

    // 加载图片（使用 Promise 包装）
    await new Promise((resolve, reject) => {
      const img = new Image();

      img.onload = () => {
        console.log(`[LOAD] 🔄 Image loaded, drawing to canvas for ${lessonId}/${viewType}`);
        console.log(`[LOAD] 📐 Current Canvas size: ${canvas.width}x${canvas.height}, Image size: ${img.width}x${img.height}`);
        console.log(`[LOAD] 📐 Saved Canvas size: ${drawingData.canvasWidth}x${drawingData.canvasHeight}`);

        // ⚠️ 关键修复：保存当前transform状态
        ctx.save();

        // 重置transform到单位矩阵（移除DPR缩放）
        ctx.setTransform(1, 0, 0, 1, 0, 0);

        // 清空当前内容，确保干净的画布（使用物理像素坐标）
        const currentOp = ctx.globalCompositeOperation;
        ctx.globalCompositeOperation = 'source-over';
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.globalCompositeOperation = currentOp;

        // 🔧 跨设备适配：根据保存的Canvas尺寸进行缩放绘制
        // 如果当前Canvas尺寸与保存时不同，缩放绘制以保持相对位置
        if (drawingData.canvasWidth && drawingData.canvasHeight) {
          const savedWidth = drawingData.canvasWidth;
          const savedHeight = drawingData.canvasHeight;

          // 计算缩放比例
          const scaleX = canvas.width / savedWidth;
          const scaleY = canvas.height / savedHeight;

          console.log(`[LOAD] 🔄 Scale ratio: ${scaleX.toFixed(3)}x (X), ${scaleY.toFixed(3)}x (Y)`);

          if (Math.abs(scaleX - 1) > 0.01 || Math.abs(scaleY - 1) > 0.01) {
            // 尺寸不一致，需要缩放
            console.log(`[LOAD] ⚠️ Canvas size changed, scaling image from ${savedWidth}x${savedHeight} to ${canvas.width}x${canvas.height}`);
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          } else {
            // 尺寸一致，直接绘制
            ctx.drawImage(img, 0, 0);
          }
        } else {
          // 旧版本数据没有保存尺寸信息，直接绘制
          console.log(`[LOAD] ⚠️ No saved canvas size info, drawing directly`);
          ctx.drawImage(img, 0, 0);
        }

        // 恢复transform状态（包括DPR缩放）
        ctx.restore();

        // 验证是否绘制成功
        const testData = ctx.getImageData(0, 0, Math.min(10, canvas.width), Math.min(10, canvas.height));
        let hasPixels = false;
        for (let i = 3; i < testData.data.length; i += 4) {
          if (testData.data[i] > 0) {
            hasPixels = true;
            break;
          }
        }
        console.log(`[LOAD] 🔍 After drawImage, canvas has pixels: ${hasPixels}`);

        // ⚠️ 关键：加载成功后显示Canvas
        canvas.style.opacity = '1';

        console.log(`[LOAD] ✅ Drawing loaded and rendered for ${lessonId}/${viewType}`);
        resolve();
      };

      img.onerror = () => {
        console.error(`[LOAD] ❌ Failed to load canvas image`);
        reject(new Error('Failed to load image'));
      };

      img.src = drawingData.imageData;
    });

    return true;

  } catch (error) {
    console.error(`[LOAD] ❌ Failed to load canvas:`, error);
    return false;
  }
}

/**
 * 删除指定课程的涂鸦数据
 * @param {string} lessonId - 课程ID（可选，不传则删除当前课程）
 */
export function deleteDrawingData(lessonId = null) {
  const targetLessonId = lessonId || drawingState.lessonId;

  if (!targetLessonId) {
    console.warn('No lesson ID specified for deletion');
    return;
  }

  try {
    // 删除左右两个画布的数据
    const leftKey = `${STORAGE_KEY_PREFIX}${targetLessonId}_left`;
    const rightKey = `${STORAGE_KEY_PREFIX}${targetLessonId}_right`;

    localStorage.removeItem(leftKey);
    localStorage.removeItem(rightKey);

    console.log(`Drawing data deleted for lesson: ${targetLessonId}`);
  } catch (error) {
    console.error('Failed to delete drawing data:', error);
  }
}

/**
 * 获取所有保存的涂鸦数据的课程列表
 * @returns {Array<string>} 课程ID列表（去重）
 */
export function getSavedDrawingLessons() {
  const lessons = new Set();

  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(STORAGE_KEY_PREFIX)) {
        // 从 "drawing_data_L2-01_left" 中提取 "L2-01"
        const suffix = key.substring(STORAGE_KEY_PREFIX.length);
        // 移除 "_left" 或 "_right" 后缀
        const lessonId = suffix.replace(/_(?:left|right)$/, '');
        lessons.add(lessonId);
      }
    }
  } catch (error) {
    console.error('Failed to get saved drawing lessons:', error);
  }

  return Array.from(lessons);
}
