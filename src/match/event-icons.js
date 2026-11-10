/* Line icons for the commentary feed (2026-11-09), drawn like ui/icons.ts (20×20, stroke currentColor) — no emoji (design rule). */
const PATHS={
  goal:'<circle cx="10" cy="10" r="6.6"/><path d="m10 6.7 3.1 2.3-1.2 3.7H8.1L6.9 9Z"/>',
  shot:'<circle cx="13.2" cy="10" r="3.6"/><path d="M2.5 7.4h5M2 10h5.5M2.5 12.6h5"/>',
  saved:'<path d="M6 16.5V9.2a1.4 1.4 0 0 1 2.8 0V5.4a1.4 1.4 0 0 1 2.8 0V9V6.6a1.4 1.4 0 0 1 2.8 0v5.6a4.3 4.3 0 0 1-4.3 4.3Z"/><path d="M6 12 4.3 10.4a1.3 1.3 0 0 0-1.9 1.8L6 16"/>',
  wide:'<circle cx="6.5" cy="13" r="3"/><path d="m9.6 10.2 6-5.7M12.3 4.3h3.5v3.5"/>',
  post:'<path d="M3.5 17V4h13v13"/><circle cx="12.6" cy="9.2" r="2.4"/>',
  block:'<path d="M10 3.2 16 5.8v4.6c0 3.2-2.5 5.5-6 6.5-3.5-1-6-3.3-6-6.5V5.8Z"/>',
  corner:'<path d="M5.5 17.5V2.8l8.8 3.6-8.8 3.7"/><path d="M3 17.5h14"/>',
  whistle:'<circle cx="7.6" cy="12.2" r="4.1"/><path d="M11.2 9.8 17.2 6.6M10.6 8.6V6.3h3.4"/>',
  dribble:'<path d="M3 14.5 6.8 8l3.4 5.6L13.5 6l3.5 5"/><path d="M14 11.2h3V8.3"/>',
  through:'<circle cx="4.8" cy="15" r="1.8"/><path d="m7 12.8 8.5-8.5M10.8 4.3h4.7V9"/>',
  cross:'<path d="M3.5 16C5.5 8 12 5.5 16.5 6.3"/><path d="m13.6 3.6 2.9 2.7-2.8 2.9"/>',
  claim:'<path d="M10 2.8v8.4M6.6 6.2 10 2.8l3.4 3.4"/><circle cx="10" cy="14.6" r="2.6"/>',
  mood:'<path d="M11.3 2.5 5 11h5l-1.2 6.5 6.3-8.6h-5Z"/>',
  dot:'<circle cx="10" cy="10" r="2.6"/>',
};
/** Which icon a commentary line gets: the outcome decides for shots (in, saved, wide, post, blocked). */
export function eventIconName(e){
  const o=e.outcome;
  switch(e.kind){
    case 'goal':return 'goal';
    case 'shot':case 'header':case 'penalty':return o==='goal'?'goal':o==='save'||o==='parry'?'saved':o==='post'?'post':o==='block'?'block':o?'wide':e.kind==='penalty'?'whistle':'shot';
    case 'save':return 'saved';
    case 'corner':return 'corner';
    case 'free-kick':case 'foul':return 'whistle';
    case 'beat':return 'dribble';
    case 'pass':case 'through-pass':case 'diagonal-pass':return 'through';
    case 'cross':return 'cross';
    case 'keeper-claim':return 'claim';
    case 'clearance':case 'tackle':case 'interception':return 'block';
    case 'mood':return 'mood';
    default:return 'dot';
  }
}
export const eventIcon=e=>`<svg class="ev-icon" viewBox="0 0 20 20" aria-hidden="true">${PATHS[eventIconName(e)]}</svg>`;
