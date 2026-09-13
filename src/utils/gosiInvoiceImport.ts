export interface GosiInvoiceRow {
  id:string; identity:string; subscriberName:string; nationality:string;
  subjectWage:number; employerShare:number; employeeShare:number; total:number;
}

const arabicMonths:Record<string,string>={
  يناير:'01',فبراير:'02',مارس:'03',ابريل:'04',أبريل:'04',مايو:'05',يونيو:'06',يوليو:'07',اغسطس:'08',أغسطس:'08',سبتمبر:'09',اكتوبر:'10',أكتوبر:'10',نوفمبر:'11',ديسمبر:'12',
};
const amount=(value:unknown)=>{ const parsed=Number(String(value??'').replace(/,/g,'').trim()); return Number.isFinite(parsed)?Math.round(parsed*100)/100:0; };
const normalizedText=(value:unknown)=>String(value??'').trim();
const identityText=(value:unknown)=>normalizedText(value).replace(/[٠-٩]/g,digit=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit))).replace(/[۰-۹]/g,digit=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit))).replace(/[^0-9A-Za-z]/g,'').toUpperCase();

export function parseGosiRows(raw:unknown[][]):{detectedMonth:string|null;rows:GosiInvoiceRow[]} {
  if(raw.length>10000) throw new Error('TOO_MANY_ROWS');
  let detectedMonth:string|null=null;
  for(const row of raw.slice(0,30)) for(const cell of row){
    const value=normalizedText(cell); const year=value.match(/20\d{2}/)?.[0];
    const month=Object.entries(arabicMonths).find(([name])=>value.includes(name))?.[1];
    if(year&&month){ detectedMonth=`${year}-${month}`; break; }
  }
  const rows:GosiInvoiceRow[]=[];
  for(let index=0;index<raw.length;index+=1){
    const row=raw[index]; const identity=identityText(row[23]);
    const subscriberName=normalizedText(row[25]);
    if(!identity||!subscriberName||identity==='رقمالهوية') continue;
    const employerShare=amount(row[1])+amount(row[2])+amount(row[4])+amount(row[5])+amount(row[7])+amount(row[9]);
    const employeeShare=amount(row[10])+amount(row[12])+amount(row[13])+amount(row[14]);
    rows.push({id:`gosi-row-${index+1}`,identity,subscriberName,nationality:normalizedText(row[21]),subjectWage:amount(row[16]),
      employerShare:Math.round(employerShare*100)/100,employeeShare:Math.round(employeeShare*100)/100,total:amount(row[0])});
  }
  if(!rows.length) throw new Error('GOSI_ROWS_NOT_FOUND');
  if(new Set(rows.map(row=>row.identity)).size!==rows.length) throw new Error('DUPLICATE_GOSI_IDENTITIES');
  return {detectedMonth,rows};
}

export async function parseGosiInvoice(file:File):Promise<{detectedMonth:string|null;rows:GosiInvoiceRow[]}> {
  if(file.size>8*1024*1024) throw new Error('FILE_TOO_LARGE');
  if(file.name.split('.').pop()?.toLowerCase()!=='xlsx') throw new Error('UNSUPPORTED_FILE');
  const {default:readXlsxFile}=await import('read-excel-file');
  return parseGosiRows(await readXlsxFile(file));
}
