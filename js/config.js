/**
 * config.js - 全局配置和状态管理
 */

// 版本号
export const VERSION = '1.0.2';

// 全局状态
export const state = {
    currentNotebook: null,
    currentFileName: '',
    drawingActive: false,
    currentTool: 'pen',
    currentColor: '#ef4444',
    currentLineWidth: 4,
    isDrawing: false,
    lastX: 0,
    lastY: 0,
    drawingData: [],
    pyodideInstance: null,
    currentOutlineLevel: 5,
    canvas: null,
    ctx: null,
    currentStroke: null
};

// Hover 检测状态
export const hoverState = {
    isHovering: false,
    activationTimer: null,
    deactivationTimer: null,
    autoActivated: false,
    // ✨ 追踪活跃的手指触摸数量
    activeTouches: 0
};

// 长按切换工具状态
export const longPressState = {
    timer: null,
    startX: 0,
    startY: 0,
    isActive: false,
    hasMoved: false
};

// Apple Pencil Pro Barrel Button 状态
export const barrelButton = {
    pressed: false,
    pressStartTime: 0,
    longPressTimer: null,
    longPressTriggered: false,
    toolBeforePress: 'pen'
};

// 延迟确认机制状态
export const pendingStroke = {
    active: false,
    startX: 0,
    startY: 0,
    contentX: 0,
    contentY: 0,
    confirmed: false,
    confirmCount: 0,
    scrollTop: 0
};

// 事件处理函数引用
export const handlers = {
    mousedown: null,
    mousemove: null,
    mouseup: null,
    touchstart: null,
    touchmove: null,
    touchend: null,
    pointerdown: null,
    pointerup: null,
    pointermove: null,
    pointerleave: null
};

// 初始化 canvas
export function initCanvas() {
    state.canvas = document.getElementById('drawing-canvas');
    if (state.canvas) {
        state.ctx = state.canvas.getContext('2d');
    }
}
