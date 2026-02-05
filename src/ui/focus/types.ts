/**
 * 焦点管理类型定义
 */

/**
 * 焦点 ID 枚举
 * 标识 UI 中可以获得焦点的组件
 */
export enum FocusId {
  /** 主输入框 */
  MAIN_INPUT = 'main-input',
  /** 确认对话框 */
  CONFIRMATION_PROMPT = 'confirmation-prompt',
  /** 主题选择器 */
  THEME_SELECTOR = 'theme-selector',
  /** 模型选择器 */
  MODEL_SELECTOR = 'model-selector',
  /** 会话选择器 */
  SESSION_SELECTOR = 'session-selector',
  /** 文件选择器 */
  FILE_SELECTOR = 'file-selector',
  /** 帮助面板 */
  HELP_PANEL = 'help-panel',
  /** 通用选择器 */
  SELECTOR = 'selector',
  /** 无焦点 */
  NONE = 'none',
}

/**
 * 焦点状态
 */
export interface FocusState {
  /** 当前焦点 ID */
  currentFocus: FocusId;
  /** 上一个焦点 ID（用于返回） */
  previousFocus: FocusId | null;
  /** 焦点历史栈 */
  focusStack: FocusId[];
}

/**
 * 焦点操作
 */
export interface FocusActions {
  /** 设置焦点 */
  setFocus: (id: FocusId) => void;
  /** 返回上一个焦点 */
  popFocus: () => void;
  /** 重置焦点到默认 */
  resetFocus: () => void;
  /** 推入焦点栈 */
  pushFocus: (id: FocusId) => void;
}
