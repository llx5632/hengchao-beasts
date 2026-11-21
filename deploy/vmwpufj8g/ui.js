export const esc=value => String(value).replace(/[&<>"']/g,c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const btn=(text,action,cls='',attrs='') => `<button class="btn ${cls}" data-action="${action}" ${attrs}>${text}</button>`;

export function pointResultBanner(text=''){
  return `<h3 class="point-result" data-point-result ${text?'role="status"':'aria-hidden="true"'}>${esc(text)}</h3>`;
}

export const RPS_CHOICES=Object.freeze({
  rock:{label:'石头',symbol:'◉'},
  scissors:{label:'剪刀',symbol:'✂'},
  paper:{label:'布',symbol:'▤'},
});

export function rpsFace(value){
  const {label,symbol}=RPS_CHOICES[value];
  return `<div class="rps-face"><span class="rps-face-icon" aria-hidden="true">${symbol}</span><span>${label}</span></div>`;
}
