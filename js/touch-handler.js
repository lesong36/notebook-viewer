/**
 * touch-handler.js - Apple Pencil 触控检测
 */

import { state, hoverState, longPressState, barrelButton, pendingStroke, handlers } from './config.js';
import { updateDebugPanel, updateDebugResult, addDebugLog } from './debug-panel.js';
import { showToast } from './utils.js';
import { startDrawing, draw, stopDrawing } from './drawing.js';

// 判断是否为 Apple Pencil（严格模式）
export function isStylus(touch) {
    updateDebugPanel(touch);

    if (touch.touchType === 'stylus') {
        updateDebugResult(true, `touchType=stylus ✅`);
        return true;
    }

    if (touch.touchType === 'direct') {
        updateDebugResult(false, `touchType=direct 🖐️`);
        return false;
    }

    const avgRadius = (touch.radiusX !== undefined && touch.radiusY !== undefined)
        ? ((touch.radiusX + touch.radiusY) / 2).toFixed(1)
        : 'N/A';
    updateDebugResult(false, `touchType=undefined, radius=${avgRadius} ❌`);
    return false;
}

// 启动长按检测
export function startLongPressDetection(x, y) {
    const lp = longPressState;
    lp.startX = x;
    lp.startY = y;
    lp.isActive = true;
    lp.hasMoved = false;

    if (lp.timer) clearTimeout(lp.timer);

    lp.timer = setTimeout(() => {
        if (lp.isActive && !lp.hasMoved) {
            const newTool = state.currentTool === 'pen' ? 'eraser' : 'pen';
            window.setTool(newTool);
            const text = newTool === 'pen' ? '✏️ 画笔' : '🧹 橡皮擦';
            showToast(`${text}（长按1秒切换）`, 'success');
            if (navigator.vibrate) navigator.vibrate(50);
        }
    }, 1000);
}

// 检查长按移动
export function checkLongPressMovement(x, y) {
    const lp = longPressState;
    if (lp.isActive && !lp.hasMoved) {
        const distance = Math.sqrt(Math.pow(x - lp.startX, 2) + Math.pow(y - lp.startY, 2));
        if (distance > 10) {
            lp.hasMoved = true;
        }
    }
}

// 取消长按检测
export function cancelLongPressDetection() {
    const lp = longPressState;
    lp.isActive = false;
    if (lp.timer) {
        clearTimeout(lp.timer);
        lp.timer = null;
    }
}

// Barrel Button 长按处理
function handleBarrelButtonLongPress() {
    if (!state.drawingActive) return;
    barrelButton.toolBeforePress = state.currentTool;
    if (state.currentTool !== 'eraser') {
        window.setTool('eraser');
        showToast('🧹 橡皮擦（长按中）', 'success');
    }
    barrelButton.longPressTriggered = true;
}

// Barrel Button 松开处理
function handleBarrelButtonRelease() {
    if (barrelButton.longPressTimer) {
        clearTimeout(barrelButton.longPressTimer);
        barrelButton.longPressTimer = null;
    }
    if (barrelButton.longPressTriggered) {
        window.setTool(barrelButton.toolBeforePress);
        showToast('✏️ 画笔', 'success');
    }
    barrelButton.pressed = false;
    barrelButton.pressStartTime = 0;
    barrelButton.longPressTriggered = false;
}

// Hover 激活
function startHoverActivation() {
    cancelHoverActivation();
    hoverState.activationTimer = setTimeout(() => {
        if (hoverState.isHovering && !state.drawingActive) {
            window.toggleDrawing();
            hoverState.autoActivated = true;
            showToast('✨ Hover 激活涂鸦', 'success');
            pendingStroke.active = false;
            pendingStroke.confirmed = false;
            pendingStroke.confirmCount = 0;
            state.isDrawing = false;
            // ✨ 清理 Canvas 路径状态，防止手掌触控时产生意外连线
            if (state.ctx) {
                state.ctx.beginPath();
            }
        }
    }, 300);
}

function cancelHoverActivation() {
    if (hoverState.activationTimer) {
        clearTimeout(hoverState.activationTimer);
        hoverState.activationTimer = null;
    }
}

// Hover 关闭
function startHoverDeactivation() {
    cancelHoverDeactivation();
    hoverState.deactivationTimer = setTimeout(() => {
        if (hoverState.autoActivated && state.drawingActive) {
            window.toggleDrawing();
            hoverState.autoActivated = false;
            showToast('💤 Hover 关闭涂鸦', 'info');
        }
    }, 3000);
}

function cancelHoverDeactivation() {
    if (hoverState.deactivationTimer) {
        clearTimeout(hoverState.deactivationTimer);
        hoverState.deactivationTimer = null;
    }
}

// 初始化触控事件处理
export function initTouchHandlers() {
    const canvas = state.canvas;

    // 鼠标事件
    handlers.mousedown = (e) => {
        if (!state.drawingActive) return;
        const contentWrapper = document.getElementById('content-wrapper');
        if (!contentWrapper.contains(e.target) && e.target !== canvas) return;
        startDrawing(e);
    };
    handlers.mousemove = draw;
    handlers.mouseup = stopDrawing;

    // 触摸事件
    handlers.touchstart = (e) => {
        if (!state.drawingActive) return;
        if (e.touches.length !== 1) return;

        const touch = e.touches[0];
        const isApplePencil = isStylus(touch);

        if (isApplePencil) {
            startLongPressDetection(touch.clientX, touch.clientY);

            const contentWrapper = document.getElementById('content-wrapper');
            const rect = contentWrapper.getBoundingClientRect();
            if (touch.clientX < rect.left || touch.clientX > rect.right ||
                touch.clientY < rect.top || touch.clientY > rect.bottom) {
                return;
            }

            e.preventDefault();
            e.stopPropagation();

            const scrollTop = contentWrapper?.scrollTop || 0;
            const canvasRect = canvas.getBoundingClientRect();
            const screenX = touch.clientX - canvasRect.left;
            const screenY = touch.clientY - canvasRect.top;

            pendingStroke.active = true;
            pendingStroke.startX = screenX;
            pendingStroke.startY = screenY;
            pendingStroke.contentX = screenX;
            pendingStroke.contentY = screenY + scrollTop;
            pendingStroke.confirmed = false;
            pendingStroke.confirmCount = 1;
            pendingStroke.scrollTop = scrollTop;

            addDebugLog(`触摸开始：待确认 (count=1)`);
        } else {
            // 🖐️ 手指触摸：清理状态并断开 Canvas 路径
            pendingStroke.active = false;
            pendingStroke.confirmed = false;
            pendingStroke.confirmCount = 0;
            // ✨ 重要：beginPath() 断开任何未完成的路径，防止误触连线
            if (state.ctx) {
                state.ctx.beginPath();
            }
            return;
        }
    };

    handlers.touchmove = (e) => {
        if (!state.drawingActive) return;

        if (e.touches.length !== 1) {
            pendingStroke.active = false;
            pendingStroke.confirmed = false;
            pendingStroke.confirmCount = 0;
            stopDrawing();
            return;
        }

        if (!pendingStroke.active && !state.isDrawing) return;

        const touch = e.touches[0];
        const isApplePencil = isStylus(touch);

        if (pendingStroke.active && !pendingStroke.confirmed) {
            if (!isApplePencil) {
                pendingStroke.active = false;
                pendingStroke.confirmed = false;
                pendingStroke.confirmCount = 0;
                addDebugLog(`二次验证失败：非 Apple Pencil`);
                return;
            }

            pendingStroke.confirmCount++;
            addDebugLog(`二次验证通过 (count=${pendingStroke.confirmCount})`);

            if (pendingStroke.confirmCount >= 3) {
                pendingStroke.confirmed = true;
                state.isDrawing = true;
                state.lastX = pendingStroke.contentX;
                state.lastY = pendingStroke.contentY;
                state.currentStroke = {
                    tool: state.currentTool,
                    color: state.currentColor,
                    width: state.currentLineWidth,
                    points: [{ x: state.lastX, y: state.lastY }]
                };

                const ctx = state.ctx;
                ctx.strokeStyle = state.currentTool === 'eraser' ? '#fff' : state.currentColor;
                ctx.lineWidth = state.currentTool === 'eraser' ? state.currentLineWidth * 3 : state.currentLineWidth;
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
                ctx.globalCompositeOperation = state.currentTool === 'eraser' ? 'destination-out' : 'source-over';
                ctx.beginPath();
                ctx.moveTo(pendingStroke.startX, pendingStroke.startY);

                addDebugLog(`✅ 确认为 Apple Pencil，开始绘制`);
            }
        }

        if (!state.isDrawing) return;

        if (!isApplePencil) {
            // ✨ 非 Apple Pencil：停止绘制并断开路径
            stopDrawing();
            if (state.ctx) {
                state.ctx.beginPath();
            }
            return;
        }

        checkLongPressMovement(touch.clientX, touch.clientY);

        e.preventDefault();
        e.stopPropagation();

        const contentWrapper = document.getElementById('content-wrapper');
        const scrollTop = contentWrapper?.scrollTop || 0;
        const canvasRect = canvas.getBoundingClientRect();
        const screenX = touch.clientX - canvasRect.left;
        const screenY = touch.clientY - canvasRect.top;
        const contentX = screenX;
        const contentY = screenY + scrollTop;

        state.ctx.lineTo(screenX, screenY);
        state.ctx.stroke();

        if (state.currentStroke) {
            state.currentStroke.points.push({ x: contentX, y: contentY });
        }

        state.lastX = contentX;
        state.lastY = contentY;
    };

    handlers.touchend = (e) => {
        if (pendingStroke.active) {
            pendingStroke.active = false;
            pendingStroke.confirmed = false;
            pendingStroke.confirmCount = 0;
        }

        if (state.isDrawing) {
            const touch = e.changedTouches?.[0];
            if (touch && isStylus(touch)) {
                e.preventDefault();
            }
            cancelLongPressDetection();
            stopDrawing();
        }
    };

    // Pointer 事件（Hover 检测和 Barrel Button）
    handlers.pointerdown = (e) => {
        const tangential = e.tangentialPressure !== undefined ? e.tangentialPressure.toFixed(2) : 'N/A';
        const twist = e.twist !== undefined ? e.twist : 'N/A';
        addDebugLog(`ptrdn: t=${e.pointerType} btn=${e.button} btns=${e.buttons} tang=${tangential} twist=${twist}`);

        if (e.pointerType !== 'pen') return;
        if (!state.drawingActive) return;

        startLongPressDetection(e.clientX, e.clientY);

        const hasBarrelButton = (e.buttons & 32) !== 0 || e.button === 5 ||
            (e.tangentialPressure !== undefined && e.tangentialPressure > 0);

        if (hasBarrelButton && !barrelButton.pressed) {
            barrelButton.pressed = true;
            barrelButton.pressStartTime = Date.now();
            barrelButton.longPressTriggered = false;
            barrelButton.longPressTimer = setTimeout(() => handleBarrelButtonLongPress(), 500);
            addDebugLog('✋ Barrel Button 按下');
        }
    };

    handlers.pointerup = (e) => {
        if (e.pointerType !== 'pen') return;
        cancelLongPressDetection();
        const hasBarrelButton = (e.buttons & 32) !== 0;
        if (!hasBarrelButton && barrelButton.pressed) {
            addDebugLog('🖐️ Barrel Button 松开');
            handleBarrelButtonRelease();
        }
    };

    handlers.pointermove = (e) => {
        if (e.pointerType !== 'pen') return;

        const lp = longPressState;
        if (lp.isActive && !lp.hasMoved) {
            const distance = Math.sqrt(Math.pow(e.clientX - lp.startX, 2) + Math.pow(e.clientY - lp.startY, 2));
            if (distance > 10) lp.hasMoved = true;
        }

        const hovering = e.pressure === 0;
        const wasHovering = hoverState.isHovering;

        if (hovering && !wasHovering) {
            hoverState.isHovering = true;
            cancelHoverDeactivation();
            startHoverActivation();
        } else if (!hovering && wasHovering) {
            hoverState.isHovering = false;
            cancelHoverActivation();
        }
    };

    handlers.pointerleave = (e) => {
        if (e.pointerType !== 'pen') return;
        const wasHovering = hoverState.isHovering;
        if (wasHovering) {
            hoverState.isHovering = false;
            cancelHoverActivation();
            if (hoverState.autoActivated && state.drawingActive) {
                startHoverDeactivation();
            }
        }
    };

    // 绑定事件
    document.addEventListener('mousedown', handlers.mousedown, true);
    document.addEventListener('mousemove', handlers.mousemove);
    document.addEventListener('mouseup', handlers.mouseup);
    document.addEventListener('touchstart', handlers.touchstart, { passive: false, capture: true });
    document.addEventListener('touchmove', handlers.touchmove, { passive: false });
    document.addEventListener('touchend', handlers.touchend);
    document.addEventListener('pointermove', handlers.pointermove, { passive: true });
    document.addEventListener('pointerleave', handlers.pointerleave, true);
    document.addEventListener('pointerdown', handlers.pointerdown);
    document.addEventListener('pointerup', handlers.pointerup);
}
