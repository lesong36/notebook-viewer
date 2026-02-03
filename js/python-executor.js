/**
 * python-executor.js - Python 代码执行器
 */

import { state } from './config.js';
import { escapeHtml } from './utils.js';

// 运行 Python 代码
export async function runCode(codeId) {
    const codeEl = document.querySelector(`code[data-code="${codeId}"]`);
    const outputEl = document.getElementById(`output-${codeId}`);
    const btn = document.querySelector(`[data-code-id="${codeId}"] .run-code-btn`);
    if (!codeEl || !outputEl) return;

    const code = codeEl.textContent;
    btn.disabled = true;
    btn.textContent = '执行中...';
    outputEl.style.display = 'block';
    outputEl.innerHTML = '<div class="output-text"><pre>正在初始化 Python 环境（首次运行需下载 IPython，约 10-20 秒）...</pre></div>';

    try {
        if (!state.pyodideInstance) {
            state.pyodideInstance = await loadPyodide({ indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.24.1/full/' });
            await state.pyodideInstance.loadPackage(['micropip', 'numpy', 'matplotlib']);
            await state.pyodideInstance.runPythonAsync(`
import micropip
await micropip.install('ipython')
            `);
            state.pyodideInstance.runPython(`
import sys
from io import StringIO
sys.stdout = StringIO()
_display_outputs = []

def _capture_display(*args, **kwargs):
    for arg in args:
        if hasattr(arg, '_repr_html_'):
            _display_outputs.append(('html', arg._repr_html_()))
        elif hasattr(arg, 'data'):
            _display_outputs.append(('html', str(arg.data)))
        else:
            _display_outputs.append(('text', str(arg)))

from IPython import display as ipython_display
ipython_display.display = _capture_display

def get_display_outputs():
    global _display_outputs
    outputs = _display_outputs.copy()
    _display_outputs = []
    return outputs
            `);
        }

        state.pyodideInstance.runPython(`
import sys
from io import StringIO
sys.stdout = StringIO()
_display_outputs = []
        `);

        let result;
        try { result = await state.pyodideInstance.runPythonAsync(code); } catch (e) { throw e; }

        const output = state.pyodideInstance.runPython(`sys.stdout.getvalue()`);
        const displayOutputs = state.pyodideInstance.runPython(`get_display_outputs()`);

        let html = '';
        if (output && output.trim()) html += `<div class="output-text"><pre>${escapeHtml(output)}</pre></div>`;

        if (displayOutputs && displayOutputs.length > 0) {
            for (let i = 0; i < displayOutputs.length; i++) {
                const item = displayOutputs.get(i);
                const type = item.get(0);
                const content = item.get(1);
                if (type === 'html') html += `<div class="output-html">${content}</div>`;
                else html += `<div class="output-text"><pre>${escapeHtml(content)}</pre></div>`;
            }
        }

        if (result !== undefined && result !== null) {
            const rs = String(result);
            if (rs.includes('__HTML_CONTENT__:')) {
                const htmlContent = rs.replace('__HTML_CONTENT__:', '').replace(':__HTML_END__', '');
                html += `<div class="output-html">${htmlContent}</div>`;
            } else if (!rs.includes('IPython') && !rs.includes('MockIPython') && !rs.includes('_HTML') && !rs.includes('[object') && rs !== 'undefined' && rs !== 'None') {
                html += `<div class="output-text"><pre>${escapeHtml(rs)}</pre></div>`;
            }
        }

        outputEl.innerHTML = html || '<div class="output-text"><pre>(执行成功，无输出)</pre></div>';
        outputEl.className = 'code-output-dynamic';
    } catch (error) {
        outputEl.innerHTML = `<div class="output-error"><div class="error-title">执行错误:</div><pre>${escapeHtml(error.message)}</pre></div>`;
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>运行';
    }
}
