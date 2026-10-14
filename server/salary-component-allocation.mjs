// Attribute an already recorded gross to its components in integer halalas.
// The total entitlement is never changed; sub-halala fractions use largest remainder.
export function allocateSalaryComponents(values,gross) {
 const amounts=values.map(value=>Number(value||0)),target=Math.round(Number(gross||0)*100);
 const rawTotal=amounts.reduce((sum,value)=>sum+value,0);
 if(amounts.some(value=>!Number.isFinite(value)||value<0)||Math.round((rawTotal+Number.EPSILON)*100)!==target) {
  return amounts.map(value=>Math.round((value+Number.EPSILON)*100)/100);
 }
 const cents=amounts.map(value=>Math.floor(value*100+1e-8));
 const remaining=target-cents.reduce((sum,value)=>sum+value,0);
 const order=amounts.map((value,index)=>({index,remainder:value*100-cents[index]})).sort((a,b)=>b.remainder-a.remainder||a.index-b.index);
 for(let i=0;i<remaining;i++)cents[order[i%order.length].index]++;
 return cents.map(value=>value/100);
}
