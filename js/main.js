/**
 * main.js - 主入口
 */

import { state, initCanvas } from './config.js';
import { initDebugPanel } from './debug-panel.js';
import { initTouchHandlers } from './touch-handler.js';
import {
    resizeCanvas, toggleDrawing, setTool, setColor, setLineWidth,
    clearDrawing, saveDrawing, redrawCanvas
} from './drawing.js';
import { toggleOutline, setOutlineLevel } from './outline.js';
import { handleFileSelect, toggleCode } from './notebook-renderer.js';
import { runCode } from './python-executor.js';

// 初始化应用
function initApp() {
    // 初始化 canvas
    initCanvas();

    // 初始化调试面板
    initDebugPanel();

    // 初始化触控处理
    initTouchHandlers();

    // 绑定窗口事件
    window.addEventListener('resize', resizeCanvas);

    // 延迟初始化
    setTimeout(() => {
        resizeCanvas();
        const contentWrapper = document.getElementById('content-wrapper');
        if (contentWrapper) {
            contentWrapper.addEventListener('scroll', redrawCanvas);
        }
    }, 100);
}

// 暴露全局函数（供 HTML onclick 调用）
window.handleFileSelect = handleFileSelect;
window.toggleDrawing = toggleDrawing;
window.setTool = setTool;
window.setColor = setColor;
window.setLineWidth = setLineWidth;
window.clearDrawing = clearDrawing;
window.saveDrawing = saveDrawing;
window.toggleOutline = toggleOutline;
window.setOutlineLevel = setOutlineLevel;
window.toggleCode = toggleCode;
window.runCode = runCode;

// DOM Ready 时初始化
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}
