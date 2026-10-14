export function redactAuditValue(value,depth=0){
 if(depth>12)return '[truncated]';
 if(Array.isArray(value))return value.map(item=>redactAuditValue(item,depth+1));
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,/(password|secret|token|api.?key|cookie|authorization)/i.test(key)?'[redacted]':redactAuditValue(item,depth+1)]));
 return value;
}
