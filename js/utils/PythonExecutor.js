/**
 * PythonExecutor - Python代码执行器（基于Pyodide）
 * 在浏览器中执行Python代码，支持Matplotlib图表输出
 */

class PythonExecutor {
  constructor() {
    this.pyodide = null;
    this.isLoading = false;
    this.isReady = false;
    this.loadPromise = null;
  }

  /**
   * 初始化Pyodide环境
   * @returns {Promise<void>}
   */
  async initialize() {
    if (this.isReady) return;
    if (this.loadPromise) return this.loadPromise;

    this.isLoading = true;
    this.loadPromise = (async () => {
      try {
        console.log('正在加载Pyodide...');
        this.pyodide = await loadPyodide({
          indexURL: "https://cdn.jsdelivr.net/pyodide/v0.24.1/full/"
        });

        // 加载常用的数学/科学计算包
        console.log('正在加载Python包...');
        await this.pyodide.loadPackage(['numpy', 'matplotlib', 'pandas', 'micropip']);

        // 使用micropip安装额外的包(Pyodide内置包中没有)
        console.log('正在安装额外的Python包...');
        await this.pyodide.runPythonAsync(`
import micropip
await micropip.install(['seaborn', 'Jinja2'])
        `);

        // 加载中文字体到Pyodide虚拟文件系统
        console.log('正在加载中文字体...');
        try {
          const fontResponse = await fetch('fonts/SimHei.ttf');
          const fontData = await fontResponse.arrayBuffer();
          const fontBytes = new Uint8Array(fontData);

          // 创建字体目录
          try {
            this.pyodide.FS.mkdir('/tmp/fonts');
          } catch (e) {
            // 目录可能已存在
          }

          // 写入字体文件
          this.pyodide.FS.writeFile('/tmp/fonts/SimHei.ttf', fontBytes);
          console.log('中文字体加载完成，大小:', fontBytes.length);
        } catch (error) {
          console.error('字体加载失败:', error);
          throw error;
        }

        // 设置Matplotlib后端为inline（输出base64图片）并配置中文字体
        await this.pyodide.runPythonAsync(`
import matplotlib
matplotlib.use('AGG')
import matplotlib.pyplot as plt
import matplotlib.font_manager as fm
from matplotlib import font_manager
import io
import base64
import warnings
import os
warnings.filterwarnings('ignore')

# 检查并注册中文字体
font_path = '/tmp/fonts/SimHei.ttf'
print(f"检查字体文件: {font_path}")
print(f"字体文件存在: {os.path.exists(font_path)}")

if os.path.exists(font_path):
    try:
        # 方法1: 使用字体文件路径直接配置
        font_prop = fm.FontProperties(fname=font_path)

        # 添加字体到系统
        font_manager.fontManager.addfont(font_path)

        # 获取字体名称
        font_name = font_prop.get_name()
        print(f"字体名称: {font_name}")

        # 配置matplotlib
        plt.rcParams['font.sans-serif'] = [font_name]
        plt.rcParams['axes.unicode_minus'] = False
        plt.rcParams['font.family'] = 'sans-serif'

        # 验证配置
        print(f"✓ 中文字体配置成功: {plt.rcParams['font.sans-serif']}")

        # 测试中文渲染
        import matplotlib.pyplot as plt
        fig, ax = plt.subplots(figsize=(1, 1))
        ax.text(0.5, 0.5, '测试', fontproperties=font_prop)
        plt.close(fig)
        print("✓ 中文渲染测试通过")

    except Exception as e:
        print(f"✗ 字体加载失败: {e}")
        plt.rcParams['font.sans-serif'] = ['DejaVu Sans']
        plt.rcParams['axes.unicode_minus'] = False
else:
    print("✗ 字体文件不存在")
    plt.rcParams['font.sans-serif'] = ['DejaVu Sans']
    plt.rcParams['axes.unicode_minus'] = False

def save_plot_as_base64():
    """将当前matplotlib图表转换为base64字符串"""
    buf = io.BytesIO()
    plt.savefig(buf, format='png', bbox_inches='tight', dpi=100)
    buf.seek(0)
    img_base64 = base64.b64encode(buf.read()).decode('utf-8')
    buf.close()
    plt.close()
    return f'data:image/png;base64,{img_base64}'
        `);

        this.isReady = true;
        this.isLoading = false;
        console.log('Pyodide加载完成');
      } catch (error) {
        this.isLoading = false;
        console.error('Pyodide加载失败:', error);
        throw error;
      }
    })();

    return this.loadPromise;
  }

  /**
   * 预处理Python代码，过滤IPython magic命令和不兼容语法
   * @param {string} code - 原始Python代码
   * @returns {string} - 处理后的代码
   */
  preprocessCode(code) {
    const lines = code.split('\n');
    const processedLines = [];

    // 避免误伤三引号字符串里的内容（如 HTML/CSS/JS 中的 !important / % 等）
    let inTripleString = false;
    let tripleDelimiter = null; // '"""' or "'''"

    const countOccurrences = (haystack, needle) => {
      if (!haystack || !needle) return 0;
      return (haystack.match(new RegExp(needle.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&'), 'g')) || []).length;
    };

    for (let line of lines) {
      const trimmed = line.trim();

      // 三引号字符串内部：原样保留，不做任何过滤
      if (inTripleString) {
        processedLines.push(line);
        const count = countOccurrences(line, tripleDelimiter);
        if (count % 2 === 1) {
          inTripleString = false;
          tripleDelimiter = null;
        }
        continue;
      }

      // 检测并跳过IPython特定的导入
      if (trimmed.includes('from IPython.display import') ||
          trimmed.includes('import IPython')) {
        processedLines.push(`# [已过滤IPython导入] ${line}`);
        continue;
      }

      // 过滤IPython magic命令
      if (trimmed.startsWith('%') || trimmed.startsWith('!')) {
        processedLines.push(`# [已过滤magic命令] ${line}`);
        continue;
      }

      // 过滤IPython帮助语法
      if (trimmed.startsWith('??') || (trimmed.startsWith('?') && trimmed.length > 1)) {
        processedLines.push(`# [已过滤帮助命令] ${line}`);
        continue;
      }

      // 保留普通代码（包括所有matplotlib代码和普通字符串）
      processedLines.push(line);

      // 检测是否进入三引号字符串（单行成对则不会进入）
      if (!inTripleString) {
        const doubleQuotesCount = countOccurrences(line, '"""');
        const singleQuotesCount = countOccurrences(line, "'''");

        // 简化规则：优先使用出现且“奇数次”的分隔符作为进入标记
        if (doubleQuotesCount % 2 === 1) {
          inTripleString = true;
          tripleDelimiter = '"""';
        } else if (singleQuotesCount % 2 === 1) {
          inTripleString = true;
          tripleDelimiter = "'''";
        }
      }
    }

    return processedLines.join('\n');
  }

  /**
   * 执行Python代码
   * @param {string} code - Python代码
   * @returns {Promise<{success: boolean, output?: string, error?: string, plots?: string[]}>}
   */
  async execute(code) {
    if (!this.isReady) {
      await this.initialize();
    }

    try {
      // 【调试】显示原始代码
      console.log('[PythonExecutor] ==================== 开始执行 ====================');
      console.log('[PythonExecutor] 原始代码长度:', code.length);
      console.log('[PythonExecutor] 原始代码前5行:');
      const originalLines = code.split('\n');
      originalLines.slice(0, 5).forEach((line, i) => {
        console.log(`  ${i+1}: ${JSON.stringify(line)}`);
      });

      // 预处理代码
      const processedCode = this.preprocessCode(code);

      // 【调试】显示处理后代码
      console.log('[PythonExecutor] 预处理后代码长度:', processedCode.length);
      console.log('[PythonExecutor] 预处理后代码前5行:');
      const processedLines = processedCode.split('\n');
      processedLines.slice(0, 5).forEach((line, i) => {
        console.log(`  ${i+1}: ${JSON.stringify(line)}`);
      });

      // 调试输出
      const filteredLines = processedCode.split('\n').filter(line => line.trim().startsWith('#'));
      const nonCommentLines = processedCode.split('\n').filter(line => !line.trim().startsWith('#') && line.trim() !== '');

      console.log(`[PythonExecutor] 📝 统计: 过滤了 ${filteredLines.length} 行, 保留了 ${nonCommentLines.length} 行`);

      if (filteredLines.length > 0) {
        console.log('[PythonExecutor] 过滤的行:', filteredLines);
      }

      // 如果所有行都被过滤了，返回提示信息
      if (nonCommentLines.length === 0) {
        return {
          success: true,
          output: '⚠️ 此代码单元格包含IPython特定语法（如magic命令、display函数、HTML内容），暂不支持在浏览器环境中执行。\n\n这些内容通常用于Jupyter Notebook的交互式功能，在教学HTML页面中已有对应的可视化内容。'
        };
      }

      // 【调试】输出即将执行的完整代码
      console.log('[PythonExecutor] ========== 即将执行的完整代码 ==========');
      console.log(processedCode);
      console.log('[PythonExecutor] ========== 代码结束 ==========');

      // 捕获标准输出
      await this.pyodide.runPythonAsync(`
import sys
from io import StringIO
_stdout_backup = sys.stdout
sys.stdout = StringIO()
      `);

      // 兼容 IPython.display 的最小实现：支持 display(HTML(...)) 输出 HTML
      await this.pyodide.runPythonAsync(`
__hxq_display_html_outputs = []

class HTML:
    def __init__(self, data):
        self.data = data
    def __repr__(self):
        return str(self.data)
    def __str__(self):
        return str(self.data)

def display(obj):
    global __hxq_display_html_outputs
    if isinstance(obj, HTML):
        __hxq_display_html_outputs.append(str(obj.data))
    else:
        print(obj)
      `);

      // 执行用户代码
      console.log('[PythonExecutor] 🚀 开始执行 runPythonAsync...');
      let result = await this.pyodide.runPythonAsync(processedCode);
      console.log('[PythonExecutor] ✅ runPythonAsync 执行成功');

      // 获取标准输出
      const stdout = await this.pyodide.runPythonAsync(`
_output = sys.stdout.getvalue()
sys.stdout = _stdout_backup
_output
      `);

      // 获取 display(HTML(...)) 的 HTML 输出
      const htmlOutputsJson = await this.pyodide.runPythonAsync(`
import json
json.dumps(__hxq_display_html_outputs if '__hxq_display_html_outputs' in globals() else [])
      `);
      let htmlOutputs = [];
      try {
        htmlOutputs = JSON.parse(htmlOutputsJson || '[]');
      } catch {
        htmlOutputs = [];
      }

      // 检查是否有matplotlib图表
      const plots = [];
      const hasFigures = await this.pyodide.runPythonAsync(`
len(plt.get_fignums()) > 0
      `);

      if (hasFigures) {
        // 获取所有图表ID列表(一次性获取,避免重复调用)
        const figNumsJson = await this.pyodide.runPythonAsync('list(plt.get_fignums())');
        const figNums = JSON.parse(figNumsJson);
        console.log('[PythonExecutor] 📊 发现图表:', figNums);

        // 遍历每个图表ID进行保存
        for (const figNum of figNums) {
          console.log(`[PythonExecutor] 💾 正在保存图表 ${figNum}...`);
          const plotBase64 = await this.pyodide.runPythonAsync(`
plt.figure(${figNum})
save_plot_as_base64()
          `);
          plots.push(plotBase64);
          console.log(`[PythonExecutor] ✅ 图表 ${figNum} 保存成功`);
        }

        // 清理所有图表
        await this.pyodide.runPythonAsync('plt.close("all")');
      }

      // 构建输出
      let output = '';
      if (stdout) {
        output += stdout;
      }
      if (result !== undefined && result !== null && String(result) !== 'None') {
        if (output) output += '\n';
        output += String(result);
      }

      return {
        success: true,
        output: output || '(执行成功，无输出)',
        plots: plots,
        htmlOutputs: htmlOutputs
      };

    } catch (error) {
      // 恢复stdout
      await this.pyodide.runPythonAsync(`
sys.stdout = _stdout_backup
      `).catch(() => {});

      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 获取Pyodide加载状态
   * @returns {{isReady: boolean, isLoading: boolean}}
   */
  getStatus() {
    return {
      isReady: this.isReady,
      isLoading: this.isLoading
    };
  }
}

// 创建全局单例（如果还不存在）
if (!window.pythonExecutor || !(window.pythonExecutor instanceof PythonExecutor)) {
  window.pythonExecutor = new PythonExecutor();
}

export default window.pythonExecutor;
