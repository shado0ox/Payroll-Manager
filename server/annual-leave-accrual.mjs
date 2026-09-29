const addYears=(iso,years)=>{const date=new Date(`${iso}T00:00:00Z`);date.setUTCFullYear(date.getUTCFullYear()+years);return date.toISOString().slice(0,10);};
const previousDay=iso=>new Date(Date.parse(`${iso}T00:00:00Z`)-86400000).toISOString().slice(0,10);
const completedYears=(start,reference)=>{let years=Number(reference.slice(0,4))-Number(start.slice(0,4));if(reference.slice(5)<start.slice(5))years-=1;return Math.max(0,years);};

export function resolveAnnualLeaveAccrual(employee,year,referenceDate=`${year}-12-31`){
  const payload=employee?.payload||employee||{};
  const policy=['LABOR_LAW','FIXED_30','DOMESTIC_BIENNIAL_30','CUSTOM'].includes(payload.annualLeavePolicy)?payload.annualLeavePolicy:'LABOR_LAW';
  const hireDate=String(employee?.hire_date||payload.hireDate||payload.salaryStartDate||'');
  const validHire=/^\d{4}-\d{2}-\d{2}$/.test(hireDate)&&hireDate<=referenceDate;
  const serviceYears=validHire?completedYears(hireDate,referenceDate):0;
  const customDays=Math.max(0,Math.min(60,Number(payload.annualLeaveEntitlementDays??21)));
  const completedCycles=policy==='DOMESTIC_BIENNIAL_30'?Math.floor(serviceYears/2):serviceYears;
  let currentCycleDays=customDays;
  let accruedEntitlementDays=customDays;
  let currentCycleStart=validHire?addYears(hireDate,serviceYears):`${year}-01-01`;
  let nextEligibilityDate=validHire?addYears(hireDate,serviceYears+1):null;
  if(policy==='LABOR_LAW'){
    currentCycleDays=serviceYears>=5?30:21;
    const earlier21DayCycles=Math.min(serviceYears,5);
    const earlier30DayCycles=Math.max(0,serviceYears-5);
    accruedEntitlementDays=earlier21DayCycles*21+earlier30DayCycles*30+currentCycleDays;
  }else if(policy==='FIXED_30'){
    currentCycleDays=30;
    accruedEntitlementDays=(serviceYears+1)*30;
  }else if(policy==='DOMESTIC_BIENNIAL_30'){
    currentCycleDays=completedCycles>0?30:0;
    accruedEntitlementDays=completedCycles*30;
    currentCycleStart=validHire?addYears(hireDate,completedCycles*2):`${year}-01-01`;
    nextEligibilityDate=validHire?addYears(hireDate,(completedCycles+1)*2):null;
  }else{
    accruedEntitlementDays=(serviceYears+1)*customDays;
  }
  return {policy,hireDate:validHire?hireDate:null,serviceYears,currentCycleDays,accruedEntitlementDays,
    currentCycleStart,currentCycleEnd:nextEligibilityDate?previousDay(nextEligibilityDate):`${year}-12-31`,nextEligibilityDate};
}
