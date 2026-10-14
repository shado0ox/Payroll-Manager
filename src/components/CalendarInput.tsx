import React, {useEffect, useRef, useState} from 'react';
import {createPortal} from 'react-dom';
import {CalendarDays, ChevronLeft, ChevronRight, X} from 'lucide-react';
import {useLanguage} from '../i18n/LanguageContext';
import {getCurrentDate} from '../utils/period';

type Props=Omit<React.InputHTMLAttributes<HTMLInputElement>,'type'> & {type:'date'|'month'|'year'};
export function CalendarInput({type,value,onChange,onClick,className,...props}:Props){
 const {language}=useLanguage();const ar=language==='ar';const ui=(a:string,b:string)=>ar?a:b;
 const input=useRef<HTMLInputElement>(null),panel=useRef<HTMLDivElement>(null),button=useRef<HTMLButtonElement>(null);
 const [open,setOpen]=useState(false),[anchor,setAnchor]=useState({top:0,left:0});
 const initial=String(value||getCurrentDate());
 const [year,setYear]=useState(Number(initial.slice(0,4))),[month,setMonth]=useState(Number(initial.slice(5,7))||1);
 const openCalendar=()=>{if(props.disabled||props.readOnly)return;const current=String(value||getCurrentDate());setYear(Number(current.slice(0,4))||new Date().getFullYear());setMonth(Number(current.slice(5,7))||1);const rect=input.current!.getBoundingClientRect();setAnchor({left:Math.max(8,Math.min(rect.left,window.innerWidth-312)),top:rect.bottom+360>window.innerHeight?Math.max(8,rect.top-355):rect.bottom+6});setOpen(true);};
 useEffect(()=>{if(!open)return;const close=(e:Event)=>{if(!panel.current?.contains(e.target as Node)&&!input.current?.contains(e.target as Node)&&!button.current?.contains(e.target as Node))setOpen(false);};const key=(e:KeyboardEvent)=>{if(e.key==='Escape'){setOpen(false);button.current?.focus();}};document.addEventListener('pointerdown',close);document.addEventListener('keydown',key);return()=>{document.removeEventListener('pointerdown',close);document.removeEventListener('keydown',key);};},[open]);
 const choose=(next:string)=>{const element=input.current!;element.value=next;onChange?.({target:element,currentTarget:element} as React.ChangeEvent<HTMLInputElement>);setOpen(false);button.current?.focus();};
 const allowed=(next:string)=>{const min=props.min?String(props.min):'',max=props.max?String(props.max):'';return (!min||next>=min)&&(!max||next<=max);};
 const move=(delta:number)=>{if(type==='date'){const date=new Date(Date.UTC(year,month-1+delta,1));setYear(date.getUTCFullYear());setMonth(date.getUTCMonth()+1);}else setYear(y=>Math.max(1,Math.min(9999,y+delta*(type==='year'?12:1))));};
 const months=Array.from({length:12},(_,i)=>new Intl.DateTimeFormat(ar?'ar-SA-u-ca-gregory-nu-latn':'en-GB',{month:'long',timeZone:'UTC'}).format(new Date(Date.UTC(2026,i,1))));
 const days=new Date(Date.UTC(year,month,0)).getUTCDate(),offset=new Date(Date.UTC(year,month-1,1)).getUTCDay();
 const name=String(props['aria-label']||props.name||props.id||ui('التاريخ','Date'));
 return <span className={`relative inline-flex max-w-full items-center gap-1 ${className?.includes("w-full")?"w-full":""}`}>
  <input {...props} ref={input} type={type==='year'?'number':type} value={value} onChange={event=>{if(props.required&&!event.target.value){event.target.value=String(value||'');return;}onChange?.(event);}} onClick={event=>{event.preventDefault();onClick?.(event);openCalendar();}} onKeyDown={event=>{props.onKeyDown?.(event);if(event.key==='ArrowDown'&&event.altKey){event.preventDefault();openCalendar();}}} lang="en-CA" dir="ltr" className={`${className||''} min-w-0 [&::-webkit-calendar-picker-indicator]:hidden`}/>
  <button ref={button} type="button" disabled={props.disabled||props.readOnly} onClick={openCalendar} aria-label={`${ui('اختيار من التقويم','Choose from calendar')}: ${name}`} aria-expanded={open} className="shrink-0 rounded-lg p-2 text-emerald-700 hover:bg-emerald-50 disabled:opacity-40"><CalendarDays className="h-4 w-4"/></button>
  {open&&createPortal(<div ref={panel} role="dialog" aria-label={`${ui('تقويم','Calendar')}: ${name}`} dir={ar?'rtl':'ltr'} style={{position:'fixed',top:anchor.top,left:anchor.left,width:304}} className="z-[100] rounded-2xl border border-slate-200 bg-white p-4 text-slate-800 shadow-2xl">
   <div className="mb-3 flex items-center justify-between gap-2"><button type="button" aria-label={ui('السابق','Previous')} onClick={()=>move(-1)}><ChevronLeft className="h-5 w-5"/></button><div className="flex items-center gap-2">{type==='date'&&<span className="text-sm font-bold">{months[month-1]}</span>}<input aria-label={ui('سنة التقويم','Calendar year')} type="number" min="1" max="9999" value={year} onChange={e=>{const n=Number(e.target.value);if(n>=1&&n<=9999)setYear(n);}} className="w-20 rounded border p-1 text-center text-sm"/></div><button type="button" aria-label={ui('التالي','Next')} onClick={()=>move(1)}><ChevronRight className="h-5 w-5"/></button><button type="button" aria-label={ui('إغلاق التقويم','Close calendar')} onClick={()=>setOpen(false)}><X className="h-4 w-4"/></button></div>
   {type==='month'&&<div className="grid grid-cols-3 gap-2">{months.map((label,i)=>{const next=`${year}-${String(i+1).padStart(2,'0')}`;return <button key={next} type="button" disabled={!allowed(next)} onClick={()=>choose(next)} className={`rounded-lg p-2 text-xs hover:bg-emerald-50 disabled:opacity-30 ${value===next?'bg-emerald-100 font-bold':''}`}>{label}</button>;})}</div>}
   {type==='year'&&<div className="grid grid-cols-3 gap-2">{Array.from({length:12},(_,i)=>Math.max(1,year-5)+i).filter(y=>y<=9999).map(y=><button type="button" key={y} onClick={()=>choose(String(y))} className="rounded-lg p-2 hover:bg-emerald-50">{y}</button>)}</div>}
   {type==='date'&&<><div className="mb-1 grid grid-cols-7 text-center text-[10px] text-slate-500">{Array.from({length:7},(_,i)=>new Intl.DateTimeFormat(ar?'ar-SA-u-ca-gregory':'en-GB',{weekday:'short',timeZone:'UTC'}).format(new Date(Date.UTC(2026,9,11+i)))).map(day=><span key={day}>{day}</span>)}</div><div className="grid grid-cols-7 gap-1">{Array.from({length:offset},(_,i)=><span key={`blank-${i}`}/>)}{Array.from({length:days},(_,i)=>{const next=`${year}-${String(month).padStart(2,'0')}-${String(i+1).padStart(2,'0')}`;return <button type="button" aria-label={next} key={next} disabled={!allowed(next)} onClick={()=>choose(next)} className={`rounded-lg p-2 text-xs hover:bg-emerald-50 disabled:opacity-30 ${value===next?'bg-emerald-100 font-bold':''}`}>{i+1}</button>;})}</div></>}
   <div className="mt-3 border-t pt-2 text-center text-[10px] text-slate-500">{ui('التقويم الميلادي','Gregorian calendar')}</div>
  </div>,document.body)}
 </span>;
}
