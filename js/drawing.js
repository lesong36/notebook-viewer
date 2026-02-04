/**
 * drawing.js - 绘图引擎
 */

import { state } from './config.js';
import { showToast } from './utils.js';

// 开始绘制
export function startDrawing(e) {
    if (!state.drawingActive) return;
    state.isDrawing = true;
    const contentWrapper = document.getElementById('content-wrapper');
    const scrollTop = contentWrapper?.scrollTop || 0;
    const r = state.canvas.getBoundingClientRect();
    const screenX = e.clientX - r.left;
    const screenY = e.clientY - r.top;
    state.lastX = screenX;
    state.lastY = screenY + scrollTop;
    state.currentStroke = {
        tool: state.currentTool,
        color: state.currentColor,
        width: state.currentLineWidth,
        points: [{ x: state.lastX, y: state.lastY }]
    };
}

// 绘制
export function draw(e) {
    if (!state.isDrawing || !state.drawingActive) return;
    const contentWrapper = document.getElementById('content-wrapper');
    const scrollTop = contentWrapper?.scrollTop || 0;
    const r = state.canvas.getBoundingClientRect();
    const screenX = e.clientX - r.left;
    const screenY = e.clientY - r.top;
    const contentX = screenX;
    const contentY = screenY + scrollTop;
    state.currentStroke.points.push({ x: contentX, y: contentY });

    const ctx = state.ctx;
    ctx.strokeStyle = state.currentTool === 'eraser' ? '#fff' : state.currentColor;
    ctx.lineWidth = state.currentTool === 'eraser' ? state.currentLineWidth * 3 : state.currentLineWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.globalCompositeOperation = state.currentTool === 'eraser' ? 'destination-out' : 'source-over';
    ctx.beginPath();
    const lastScreenY = state.lastY - scrollTop;
    ctx.moveTo(state.lastX, lastScreenY);
    ctx.lineTo(screenX, screenY);
    ctx.stroke();
    state.lastX = contentX;
    state.lastY = contentY;
}

// 停止绘制
export function stopDrawing() {
    if (!state.isDrawing) return;
    state.isDrawing = false;
    if (state.currentStroke && state.currentStroke.points.length > 1) {
        state.drawingData.push(state.currentStroke);
        saveDrawingToStorage();
    }
    state.currentStroke = null;
    state.ctx.globalCompositeOperation = 'source-over';
}

// 重绘 Canvas
export function redrawCanvas() {
    const ctx = state.ctx;
    const canvas = state.canvas;
    if (!ctx || !canvas) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const contentWrapper = document.getElementById('content-wrapper');
    const scrollTop = contentWrapper?.scrollTop || 0;

    state.drawingData.forEach(s => {
        ctx.strokeStyle = s.color;
        ctx.lineWidth = s.width;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.globalCompositeOperation = s.tool === 'eraser' ? 'destination-out' : 'source-over';
        if (s.tool === 'eraser') ctx.lineWidth = s.width * 3;
        ctx.beginPath();
        s.points.forEach((p, i) => {
            const screenY = p.y - scrollTop;
            if (i === 0) ctx.moveTo(p.x, screenY);
            else ctx.lineTo(p.x, screenY);
        });
        ctx.stroke();
    });
    ctx.globalCompositeOperation = 'source-over';
}

// 调整 Canvas 大小
export function resizeCanvas() {
    const canvas = state.canvas;
    if (!canvas) {
        console.log('[resizeCanvas] ⚠️ canvas is null');
        return;
    }

    const contentWrapper = document.getElementById('content-wrapper');
    if (!contentWrapper) {
        console.log('[resizeCanvas] ⚠️ contentWrapper is null');
        return;
    }

    const outlinePanel = document.getElementById('outline-panel');
    const isOutlineCollapsed = outlinePanel?.classList.contains('collapsed');
    const outlineWidth = isOutlineCollapsed ? 0 : (outlinePanel?.offsetWidth || 0);

    const width = contentWrapper.clientWidth;
    const height = contentWrapper.clientHeight;

    canvas.width = width;
    canvas.height = height;
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    canvas.style.position = 'fixed';
    canvas.style.top = '56px';
    canvas.style.left = outlineWidth + 'px';

    console.log(`[resizeCanvas] ✅ Canvas: ${width}x${height}, left=${outlineWidth}px, rect=`, canvas.getBoundingClientRect());

    redrawCanvas();
}

// 保存绘图数据到 Storage
export function saveDrawingToStorage() {
    if (!state.currentFileName) return;
    localStorage.setItem(`drawing_${state.currentFileName}`, JSON.stringify(state.drawingData));
}

// 加载绘图数据
export function loadDrawingData() {
    if (!state.currentFileName) return;
    const saved = localStorage.getItem(`drawing_${state.currentFileName}`);
    if (saved) {
        state.drawingData = JSON.parse(saved);
        redrawCanvas();
    } else {
        state.drawingData = [];
        state.ctx?.clearRect(0, 0, state.canvas.width, state.canvas.height);
    }
}

// 切换涂鸦模式
export function toggleDrawing() {
    state.drawingActive = !state.drawingActive;
    document.getElementById('drawing-toggle')?.classList.toggle('active', state.drawingActive);
    document.getElementById('drawing-tools')?.classList.toggle('active', state.drawingActive);
    state.canvas?.classList.toggle('active', state.drawingActive);
}

// 设置工具
export function setTool(tool) {
    state.currentTool = tool;
    document.getElementById('pen-tool')?.classList.toggle('active', tool === 'pen');
    document.getElementById('eraser-tool')?.classList.toggle('active', tool === 'eraser');
}

// 设置颜色
export function setColor(color) {
    state.currentColor = color;
    state.currentTool = 'pen';
    setTool('pen');
    document.querySelectorAll('.color-button').forEach(b => b.classList.remove('active'));
    document.querySelector(`.color-button[onclick="setColor('${color}')"]`)?.classList.add('active');
}

// 设置线宽
export function setLineWidth(width) {
    state.currentLineWidth = width;
    document.querySelectorAll('.line-width-button').forEach(b => b.classList.remove('active'));
    document.getElementById(`width-${width}`)?.classList.add('active');
}

// 清除涂鸦
export function clearDrawing() {
    state.ctx?.clearRect(0, 0, state.canvas.width, state.canvas.height);
    state.drawingData = [];
    saveDrawingToStorage();
    showToast('涂鸦已清除', 'success');
}

// 保存涂鸦
export function saveDrawing() {
    saveDrawingToStorage();
    showToast('涂鸦已保存', 'success');
}
