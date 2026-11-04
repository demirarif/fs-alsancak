/** Presentation only. Stored 1–10 attributes / 0–100 ratings stay untouched. */
export function attributeOnTwenty(value:number):number {
  if(!Number.isFinite(value))throw new RangeError('Özellik değeri sonlu olmalı.');
  return Math.round(Math.max(1,Math.min(20,value*2)));
}

export function roleOnTwenty(value:number):number {
  if(!Number.isFinite(value))throw new RangeError('Mevki puanı sonlu olmalı.');
  return Math.round(Math.max(0,Math.min(20,value/5)));
}

export function gradeClass(value:number):'stat-strong'|'stat-medium'|'stat-weak' {
  return value>=16?'stat-strong':value>=10?'stat-medium':'stat-weak';
}

/** Five absolute role-level stars, rounded to half stars; no squad relativity. */
export function roleStarUnits(rating:number):number {
  if(!Number.isFinite(rating))throw new RangeError('Mevki puanı sonlu olmalı.');
  return Math.round(Math.max(0,Math.min(100,rating))/10);
}
