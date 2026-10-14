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

export function getJournalPeriods(recorded:string[],currentPeriod=getCurrentPeriod()):string[] {
  const year=Number(currentPeriod.slice(0,4));
  const periods=new Set(recorded.filter(period=>/^\d{4}-(0[1-9]|1[0-2])$/.test(period)));
  for(let y=year-5;y<=year+5;y++)for(let month=1;month<=12;month++)periods.add(`${y}-${String(month).padStart(2,'0')}`);
  return [...periods].sort((a,b)=>b.localeCompare(a));
}
