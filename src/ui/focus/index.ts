/**
 * 焦点管理系统导出
 */

export { FocusId, type FocusState, type FocusActions } from './types.js';
export { focusManager, focusActions } from './FocusManager.js';
export {
  useCurrentFocus,
  useFocusState,
  useFocusActions,
  useIsFocused,
  useFocus,
} from './useFocus.js';
