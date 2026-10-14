export function getCurrentPeriod(timeZone: string = 'Asia/Riyadh', now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(now);
  const year = parts.find(part => part.type === 'year')?.value;
  const month = parts.find(part => part.type === 'month')?.value;
  if (!year || !month) throw new Error('CURRENT_PERIOD_UNAVAILABLE');
  return `${year}-${month}`;
}

export function getCurrentDate(timeZone:string='Asia/Riyadh',now:Date=new Date()):string {
  const parts=new Intl.DateTimeFormat('en-US',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
  const part=(type:string)=>parts.find(part=>part.type===type)?.value;
  if(!part('year')||!part('month')||!part('day'))throw new Error('CURRENT_DATE_UNAVAILABLE');
  return `${part('year')}-${part('month')}-${part('day')}`;
}
