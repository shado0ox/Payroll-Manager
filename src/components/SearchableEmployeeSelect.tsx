import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Search, UserRound, X } from 'lucide-react';
import { Employee } from '../types';

interface SearchableEmployeeSelectProps {
  employees: Employee[];
  value: string;
  onChange: (employeeId: string) => void;
  required?: boolean;
  allowEmpty?: boolean;
  emptyLabel?: string;
  placeholder?: string;
  className?: string;
}

export const SearchableEmployeeSelect: React.FC<SearchableEmployeeSelectProps> = ({
  employees,
  value,
  onChange,
  required = false,
  allowEmpty = false,
  emptyLabel = 'بدون اختيار',
  placeholder = 'ابحث بالاسم أو الرقم الوظيفي أو الإقامة...',
  className = '',
}) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const selected = employees.find(employee => employee.id === value);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('ar');
    if (!normalized) return employees;
    return employees.filter(employee => [
      employee.employeeNo,
      employee.firstNameAr,
      employee.lastNameAr,
      employee.firstNameEn,
      employee.lastNameEn,
      employee.nationalIdOrIqama,
      employee.department,
      employee.jobTitle,
    ].join(' ').toLocaleLowerCase('ar').includes(normalized));
  }, [employees, query]);

  useEffect(() => {
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', closeOnOutsideClick);
    return () => document.removeEventListener('mousedown', closeOnOutsideClick);
  }, []);

  useEffect(() => {
    if (open) requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  const choose = (employeeId: string) => {
    onChange(employeeId);
    setOpen(false);
    setQuery('');
  };

  const emptyVisible = allowEmpty && !query;
  const options = emptyVisible ? [null, ...filtered] : filtered;

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <input type="hidden" required={required} value={value} readOnly />
      <button
        type="button"
        onClick={() => { setOpen(current => !current); setActiveIndex(0); }}
        className="w-full min-h-10 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 cursor-pointer flex items-center gap-2 text-start"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <UserRound className="w-4 h-4 text-slate-400 shrink-0" />
        <span className={`grow truncate ${selected ? 'font-semibold' : 'text-slate-400'}`}>
          {selected
            ? `${selected.employeeNo} - ${selected.firstNameAr} ${selected.lastNameAr} (${selected.department})`
            : allowEmpty ? emptyLabel : 'اختر موظفًا'}
        </span>
        <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute z-[80] mt-1.5 w-full min-w-[320px] bg-white border border-slate-200 rounded-xl shadow-2xl overflow-hidden" role="listbox">
          <div className="p-2 border-b border-slate-100 bg-slate-50 sticky top-0">
            <div className="relative">
              <Search className="absolute right-3 top-2.5 w-4 h-4 text-slate-400" />
              <input
                ref={inputRef}
                value={query}
                onChange={event => { setQuery(event.target.value); setActiveIndex(0); }}
                onKeyDown={event => {
                  if (event.key === 'Escape') setOpen(false);
                  if (event.key === 'ArrowDown') { event.preventDefault(); setActiveIndex(index => Math.min(index + 1, options.length - 1)); }
                  if (event.key === 'ArrowUp') { event.preventDefault(); setActiveIndex(index => Math.max(index - 1, 0)); }
                  if (event.key === 'Enter' && options[activeIndex] !== undefined) {
                    event.preventDefault();
                    choose(options[activeIndex]?.id || '');
                  }
                }}
                placeholder={placeholder}
                className="w-full pr-9 pl-9 py-2 bg-white border border-slate-200 rounded-lg text-xs outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10"
              />
              {query && <button type="button" onClick={() => setQuery('')} className="absolute left-2.5 top-2.5 text-slate-400 hover:text-slate-700"><X className="w-4 h-4" /></button>}
            </div>
          </div>

          <div className="max-h-64 overflow-y-auto py-1">
            {emptyVisible && (
              <button type="button" onClick={() => choose('')} className={`w-full px-3 py-2.5 text-start text-xs hover:bg-slate-50 flex items-center gap-2 ${!value ? 'bg-emerald-50 text-emerald-700 font-bold' : ''}`}>
                <span className="grow">{emptyLabel}</span>{!value && <Check className="w-4 h-4" />}
              </button>
            )}
            {filtered.map((employee, index) => (
              <button
                type="button"
                key={employee.id}
                onMouseEnter={() => setActiveIndex(index + (emptyVisible ? 1 : 0))}
                onClick={() => choose(employee.id)}
                className={`w-full px-3 py-2.5 text-start hover:bg-slate-50 flex items-center gap-3 ${employee.id === value ? 'bg-emerald-50' : ''} ${activeIndex === index + (emptyVisible ? 1 : 0) ? 'ring-1 ring-inset ring-emerald-200' : ''}`}
              >
                <div className="grow min-w-0">
                  <div className="text-xs font-bold text-slate-800 truncate">{employee.employeeNo} - {employee.firstNameAr} {employee.lastNameAr}</div>
                  <div className="text-[10px] text-slate-500 truncate">{employee.nationalIdOrIqama} • {employee.department} • {employee.jobTitle}</div>
                </div>
                {employee.id === value && <Check className="w-4 h-4 text-emerald-600 shrink-0" />}
              </button>
            ))}
            {!filtered.length && <div className="px-4 py-8 text-center text-xs text-slate-400">لا يوجد موظف مطابق للبحث</div>}
          </div>
        </div>
      )}
    </div>
  );
};
