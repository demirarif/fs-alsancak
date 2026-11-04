const steps=[['squads','Kadrolar'],['lineup','Diziliş'],['match','Maç']] as const;

/** Progress, rather than navigation: later stages can require valid teams. */
export function prepSteps(current:typeof steps[number][0]):string {
  return `<nav class="prep-stage-nav" aria-label="Maç hazırlık aşamaları"><ol>${steps.map(([id,label],index)=>`<li ${id===current?'aria-current="step"':''}><b>${String(index+1).padStart(2,'0')}</b><span>${label}</span></li>`).join('')}</ol></nav>`;
}
