/** Shared icon geometry: one grid, weight and set of rounded terminals. */
const symbols={
  plus:'<path d="M10 4v12M4 10h12"/>',
  check:'<path d="m4.5 10 3.5 3.5L15.5 6"/>',
  arrowRight:'<path d="M4 10h12m-5-5 5 5-5 5"/>',
  arrowUpRight:'<path d="M6 14 14 6M6 6h8v8"/>',
  search:'<circle cx="8.5" cy="8.5" r="5.25"/><path d="m12.5 12.5 4.25 4.25"/>',
  info:'<circle cx="10" cy="10" r="7"/><path d="M10 9v4.5M10 6.5v.1"/>',
  trash:'<path d="M3.5 5.5h13M7.5 5.5v-2h5v2M5 5.5l.7 11h8.6l.7-11M8 8.5v5M12 8.5v5"/>',
  close:'<path d="m5 5 10 10M15 5 5 15"/>',
  arrowLeft:'<path d="M16 10H4m5-5-5 5 5 5"/>',
  reset:'<path d="M4 7a6.5 6.5 0 1 1-.3 5M4 3v4h4"/>',
  download:'<path d="M10 3v9m-3.5-3.5L10 12l3.5-3.5M4 13v4h12v-4"/>',
  play:'<path d="m7 4.5 8 5.5-8 5.5Z" fill="currentColor" stroke="none"/>',
  pause:'<path d="M7 5v10M13 5v10" stroke-width="2.4"/>',
  skipForward:'<path d="m4 5 7 5-7 5ZM15 5v10"/>',
  camera:'<rect x="3" y="5" width="14" height="10" rx="2"/><path d="m7 18 3-3 3 3M7 2l3 3 3-3"/>',
} as const;
export function uiIcon(name:keyof typeof symbols):string {
  return `<svg class="ui-icon" viewBox="0 0 20 20" aria-hidden="true">${symbols[name]}</svg>`;
}
