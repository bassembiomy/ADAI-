/**
 * Helper utility to determine if an event target is an active text input or editable element.
 * Prevents canvas keyboard shortcuts (such as Delete, Backspace, Copy, Paste) from triggering
 * while the user is typing in form controls or properties panels.
 */
export function isInputFocused(target: EventTarget | null): boolean {
  if (!target) return false;
  
  const el = target as any;
  if (typeof el.tagName === 'string') {
    const tagName = el.tagName.toUpperCase();
    if (tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT') {
      return true;
    }
  }
  
  if (el.isContentEditable === true || el.contentEditable === 'true') {
    return true;
  }
  
  if (typeof el.getAttribute === 'function') {
    const role = el.getAttribute('role');
    if (role === 'textbox' || role === 'combobox' || role === 'searchbox' || role === 'spinbutton') {
      return true;
    }
  }
  
  if (typeof el.closest === 'function') {
    if (el.closest('input, textarea, select, [contenteditable="true"], [role="textbox"], [role="combobox"], .nodrag, .interactive-input')) {
      return true;
    }
  }
  
  return false;
}
