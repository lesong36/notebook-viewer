/**
 * DrawingAPI - 涂鸦数据服务器同步客户端
 *
 * 功能：
 * - 与服务器通信（优先）
 * - 降级到 localStorage（服务器不可用时）
 * - 自动检测服务器可用性
 */

class DrawingAPI {
  constructor(baseURL = '') {
    this.baseURL = baseURL;
    this.isServerAvailable = null; // null=未检测, true=可用, false=不可用
    this.timeout = 5000; // 5秒超时
  }

  /**
   * 检测服务器可用性
   */
  async checkServer() {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000); // 2秒超时

      const response = await fetch(`${this.baseURL}/api/drawings`, {
        method: 'GET',
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      this.isServerAvailable = response.ok;
      console.log(`[DrawingAPI] Server ${this.isServerAvailable ? '✅ available' : '❌ unavailable'}`);
      return this.isServerAvailable;
    } catch (error) {
      this.isServerAvailable = false;
      console.log('[DrawingAPI] Server unavailable:', error.message);
      return false;
    }
  }

  /**
   * 通用请求方法
   */
  async request(url, options = {}) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(`${this.baseURL}${url}`, {
        ...options,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers
        }
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  /**
   * 获取所有涂鸦元数据
   */
  async getAllDrawings() {
    try {
      const result = await this.request('/api/drawings');
      return result.drawings || [];
    } catch (error) {
      console.warn('[DrawingAPI] Failed to get all drawings:', error);
      throw error;
    }
  }

  /**
   * 获取特定涂鸦
   */
  async getDrawing(lessonId, viewType) {
    try {
      const data = await this.request(`/api/drawings/${lessonId}/${viewType}`);
      return data;
    } catch (error) {
      if (error.message.includes('404')) {
        console.log(`[DrawingAPI] Drawing not found: ${lessonId}/${viewType}`);
        return null;
      }
      console.warn('[DrawingAPI] Failed to get drawing:', error);
      throw error;
    }
  }

  /**
   * 保存涂鸦
   */
  async saveDrawing(lessonId, viewType, drawingData) {
    try {
      const result = await this.request('/api/drawings', {
        method: 'POST',
        body: JSON.stringify({
          lessonId,
          viewType,
          ...drawingData
        })
      });
      return result;
    } catch (error) {
      console.warn('[DrawingAPI] Failed to save drawing:', error);
      throw error;
    }
  }

  /**
   * 删除特定涂鸦
   */
  async deleteDrawing(lessonId, viewType) {
    try {
      const result = await this.request(`/api/drawings/${lessonId}/${viewType}`, {
        method: 'DELETE'
      });
      return result;
    } catch (error) {
      console.warn('[DrawingAPI] Failed to delete drawing:', error);
      throw error;
    }
  }

  /**
   * 删除课程所有涂鸦
   */
  async deleteCourse(lessonId) {
    try {
      const result = await this.request(`/api/drawings/course/${lessonId}`, {
        method: 'DELETE'
      });
      return result;
    } catch (error) {
      console.warn('[DrawingAPI] Failed to delete course drawings:', error);
      throw error;
    }
  }

  /**
   * 删除所有涂鸦
   */
  async deleteAll() {
    try {
      const result = await this.request('/api/drawings', {
        method: 'DELETE'
      });
      return result;
    } catch (error) {
      console.warn('[DrawingAPI] Failed to delete all drawings:', error);
      throw error;
    }
  }

  /**
   * 批量迁移 localStorage 数据到服务器
   */
  async migrateFromLocalStorage(drawings) {
    try {
      const result = await this.request('/api/migrate', {
        method: 'POST',
        body: JSON.stringify({ drawings })
      });
      return result;
    } catch (error) {
      console.warn('[DrawingAPI] Failed to migrate drawings:', error);
      throw error;
    }
  }
}

// 全局单例
export const drawingAPI = new DrawingAPI();

// 初始化时检测服务器（后台静默检测）
drawingAPI.checkServer().catch(() => {
  // 静默失败，不影响页面加载
});
