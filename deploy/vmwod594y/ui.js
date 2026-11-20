export const esc=value => String(value).replace(/[&<>"']/g,c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const btn=(text,action,cls='',attrs='') => `<button class="btn ${cls}" data-action="${action}" ${attrs}>${text}</button>`;
