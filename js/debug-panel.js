/**
 * debug-panel.js - 调试面板功能
 */

import { state, pendingStroke } from './config.js';
import { showToast } from './utils.js';

// 更新调试面板
export function updateDebugPanel(touch) {
    const panel = document.getElementById('ipad-debug-panel');
    if (!panel) return;

    document.getElementById('debug-touch-type').textContent =
        `touchType: ${touch.touchType !== undefined ? touch.touchType : 'undefined'}`;
    document.getElementById('debug-radius').textContent =
        `radius: X=${touch.radiusX?.toFixed(1) || '-'} Y=${touch.radiusY?.toFixed(1) || '-'} avg=${((touch.radiusX + touch.radiusY) / 2).toFixed(1) || '-'}`;
    document.getElementById('debug-force').textContent =
        `force: ${touch.force !== undefined ? touch.force.toFixed(2) : 'undefined'}`;
    document.getElementById('debug-drawing-active').textContent =
        `drawingActive: ${state.drawingActive}, isDrawing: ${state.isDrawing}`;
    document.getElementById('debug-pending').textContent =
        `pending: active=${pendingStroke.active}, confirmed=${pendingStroke.confirmed}, count=${pendingStroke.confirmCount}`;
}

// 更新调试结果
export function updateDebugResult(result, reason) {
    const el = document.getElementById('debug-is-stylus');
    if (el) {
        el.textContent = `isStylus: ${result} (${reason})`;
        el.style.color = result ? '#0f0' : '#f00';
    }
    addDebugLog(`isStylus=${result}: ${reason}`);
}

// 添加调试日志
export function addDebugLog(msg) {
    const log = document.getElementById('debug-log');
    if (log) {
        const time = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
        log.innerHTML = `<div>${time} ${msg}</div>` + log.innerHTML;
        while (log.children.length > 20) {
            log.removeChild(log.lastChild);
        }
    }
}

// 复制调试日志到剪贴板
export function copyDebugLog() {
    const panel = document.getElementById('ipad-debug-panel');
    if (!panel) return;

    const touchType = document.getElementById('debug-touch-type')?.textContent || '';
    const radius = document.getElementById('debug-radius')?.textContent || '';
    const force = document.getElementById('debug-force')?.textContent || '';
    const isStylus = document.getElementById('debug-is-stylus')?.textContent || '';
    const drawingActive = document.getElementById('debug-drawing-active')?.textContent || '';
    const pending = document.getElementById('debug-pending')?.textContent || '';
    const logEl = document.getElementById('debug-log');
    const logLines = logEl ? Array.from(logEl.children).map(div => div.textContent).join('\n') : '';

    const fullLog = `=== iPad 调试日志 ===
时间: ${new Date().toISOString()}
${touchType}
${radius}
${force}
${isStylus}
${drawingActive}
${pending}

=== 事件日志 ===
${logLines}`;

    navigator.clipboard.writeText(fullLog).then(() => {
        showToast('📋 日志已复制', 'success');
    }).catch(err => {
        console.error('复制失败:', err);
        showToast('❌ 复制失败', 'error');
    });
}

// 初始化调试面板
export function initDebugPanel() {
    // 绑定复制按钮
    setTimeout(() => {
        const copyBtn = document.getElementById('debug-copy-btn');
        if (copyBtn) {
            copyBtn.addEventListener('click', copyDebugLog);
        }
    }, 100);

    // 三击显示调试面板
    let tapCount = 0;
    let tapTimer = null;
    document.addEventListener('touchend', e => {
        if (e.touches.length === 0 && e.changedTouches.length === 1) {
            tapCount++;
            clearTimeout(tapTimer);
            tapTimer = setTimeout(() => {
                if (tapCount >= 3) {
                    const panel = document.getElementById('ipad-debug-panel');
                    if (panel) {
                        panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
                        showToast('🔧 调试面板已' + (panel.style.display === 'none' ? '关闭' : '打开'), 'info');
                    }
                }
                tapCount = 0;
            }, 400);
        }
    }, { passive: true });
}
