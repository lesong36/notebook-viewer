/**
 * utils.js - 工具函数
 */

// HTML 转义
export function escapeHtml(text) {
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return String(text).replace(/[&<>"']/g, c => map[c]);
}

// 显示 Toast 消息
export function showToast(msg, type = 'info') {
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.classList.add('show'), 10);
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 2000);
}

// 显示加载动画
export function showLoading() {
    const o = document.createElement('div');
    o.className = 'loading-overlay';
    o.id = 'loading-overlay';
    o.innerHTML = '<div class="loading-spinner"></div>';
    document.body.appendChild(o);
}

// 隐藏加载动画
export function hideLoading() {
    const o = document.getElementById('loading-overlay');
    if (o) o.remove();
}
