export function deepFreeze<T>(value:T):T {
  if(value&&typeof value==='object'&&!Object.isFrozen(value)){
    Object.values(value).forEach(child=>deepFreeze(child));Object.freeze(value);
  }
  return value;
}
