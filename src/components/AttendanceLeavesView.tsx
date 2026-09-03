import React, { useState, useMemo } from 'react';
import { 
  Clock, 
  Calendar, 
  Plus, 
  Search, 
  Filter, 
  CheckCircle, 
  XCircle, 
  AlertCircle, 
  Sparkles,
  Trash2,
  Edit3,
  RotateCcw
} from 'lucide-react';
import { Company, Employee, AttendanceRecord, LeaveRequest, UserRole } from '../types';
import { SearchableEmployeeSelect } from './SearchableEmployeeSelect';
import { useLanguage } from '../i18n/LanguageContext';

interface AttendanceLeavesViewProps {
  company: Company;
  employees: Employee[];
  attendance: AttendanceRecord[];
  leaves: LeaveRequest[];
  activeRole: UserRole;
  onAddAttendance: (record: AttendanceRecord) => void;
  onBulkImportAttendance: (records: AttendanceRecord[]) => Promise<boolean | void> | boolean | void;
  onDeleteAttendance: (recordId: string) => void;
  onUpdateLeaveStatus: (leaveId: string, status: 'PENDING' | 'APPROVED' | 'REJECTED') => void;
  onAddLeave: (leave: LeaveRequest) => void;
}

export const AttendanceLeavesView: React.FC<AttendanceLeavesViewProps> = ({
  company,
  employees,
  attendance,
  leaves,
  activeRole,
  onAddAttendance,
  onBulkImportAttendance,
  onDeleteAttendance,
  onUpdateLeaveStatus,
  onAddLeave,
}) => {
  const { language } = useLanguage();
  const tr = (ar: string, en: string) => language === 'ar' ? ar : en;
  const today = new Date().toISOString().slice(0, 10);
  const currentPeriod = today.slice(0, 7);
  const [selectedPeriod, setSelectedPeriod] = useState(currentPeriod);
  const [activeSubTab, setActiveSubTab] = useState<'attendance' | 'leaves'>('attendance');
  const [searchTerm, setSearchTerm] = useState('');

  // Attendance Modal
  const [isAttendanceModalOpen, setIsAttendanceModalOpen] = useState(false);
  const [editingAttendanceId, setEditingAttendanceId] = useState<string | null>(null);
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [newAttendance, setNewAttendance] = useState<Partial<AttendanceRecord>>({
    companyId: company.id,
    employeeId: employees[0]?.id || '',
    periodMonth: selectedPeriod,
    date: today,
    delayMinutes: 0,
    absence: true,
    unpaidLeave: false,
    overtimeHours: 0,
    overtimeType: 'STANDARD',
    notes: '',
  });

  const getDatesInRange = (start: string, end: string): string[] => {
    if (!start) return [];
    if (!end || end < start) return [start];
    const dates: string[] = [];
    const curr = new Date(start);
    const finish = new Date(end);
    while (curr <= finish) {
      dates.push(curr.toISOString().split('T')[0]);
      curr.setDate(curr.getDate() + 1);
    }
    return dates;
  };

  const selectedDaysCount = useMemo(() => {
    return getDatesInRange(startDate, endDate).length;
  }, [startDate, endDate]);

  const companyEmployees = useMemo(() => {
    return employees.filter(e => e.companyId === company.id);
  }, [employees, company.id]);
  const employeeName = (employee?: Employee) => employee
    ? (language === 'en' && (employee.firstNameEn || employee.lastNameEn)
      ? `${employee.firstNameEn || ''} ${employee.lastNameEn || ''}`.trim()
      : `${employee.firstNameAr} ${employee.lastNameAr}`)
    : tr('موظف', 'Employee');

  const companyAttendance = useMemo(() => {
    const monthStart = `${selectedPeriod}-01`;
    const [year, month] = selectedPeriod.split('-').map(Number);
    const monthEnd = `${selectedPeriod}-${String(new Date(Date.UTC(year, month, 0)).getUTCDate()).padStart(2, '0')}`;
    return attendance.filter(a => a.companyId === company.id && a.date <= monthEnd && (a.endDate || a.date) >= monthStart);
  }, [attendance, company.id, selectedPeriod]);

  const companyLeaves = useMemo(() => {
    return leaves.filter(l => l.companyId === company.id);
  }, [leaves, company.id]);

  // A date range is one auditable transaction; payroll expands its day count at calculation time.
  const handleSaveAttendance = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAttendance.employeeId || !startDate) return;

    const effectiveEndDate = endDate || startDate;
    const record: AttendanceRecord = {
      ...newAttendance as AttendanceRecord,
      id: editingAttendanceId || `att-${Date.now()}`,
      date: startDate,
      endDate: effectiveEndDate,
      daysCount: getDatesInRange(startDate, effectiveEndDate).length,
      periodMonth: startDate.substring(0, 7) || selectedPeriod,
      notes: newAttendance.notes || (effectiveEndDate !== startDate ? tr(`غياب فترة (${startDate} إلى ${effectiveEndDate})`, `Absence period (${startDate} to ${effectiveEndDate})`) : ''),
    };
    onAddAttendance(record);

    setIsAttendanceModalOpen(false);
    setEditingAttendanceId(null);
  };

  const openEditAttendance = (record: AttendanceRecord) => {
    setEditingAttendanceId(record.id);
    setNewAttendance(record);
    setStartDate(record.date);
    setEndDate(record.endDate || record.date);
    setIsAttendanceModalOpen(true);
  };

  return (
    <div data-no-translate className="space-y-6">
      
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Clock className="w-6 h-6 text-emerald-600" />
            <span>{tr('الحضور والانصراف والإجازات', 'Attendance & Leave')}</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            {tr('تسجيل التأخير، الغياب، العمل الإضافي، والإجازات بدون راتب لتطبيقها آلياً في مسير الرواتب', 'Record lateness, absence, overtime and unpaid leave for automatic payroll calculation')}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Period Selector */}
          <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-xl border border-slate-200 shadow-xs">
            <Calendar className="w-4 h-4 text-slate-500" />
            <select
              value={selectedPeriod}
              onChange={(e) => setSelectedPeriod(e.target.value)}
              className="bg-transparent text-xs font-bold text-slate-800 border-none focus:ring-0 cursor-pointer"
            >
              {[0, 1, 2, 3, 4, 5].map(offset => {
                const date = new Date();
                date.setMonth(date.getMonth() - offset);
                const value = date.toISOString().slice(0, 7);
                return <option key={value} value={value}>{new Intl.DateTimeFormat(language === 'ar' ? 'ar-SA' : 'en-US', { month: 'long', year: 'numeric' }).format(date)}</option>;
              })}
            </select>
          </div>

          <button
            onClick={() => setIsAttendanceModalOpen(true)}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>{tr('تسجيل حركة حضور / غياب', 'Record attendance / absence')}</span>
          </button>
        </div>
      </div>

      {/* Sub Tabs Toggle */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
        <button
          onClick={() => setActiveSubTab('attendance')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeSubTab === 'attendance'
              ? 'bg-emerald-600 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          {tr('سجل الحضور والتأخير والإضافي', 'Attendance, lateness & overtime')} ({companyAttendance.length})
        </button>

        <button
          onClick={() => setActiveSubTab('leaves')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeSubTab === 'leaves'
              ? 'bg-emerald-600 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          {tr('طلبات الإجازات والإجازة بدون راتب', 'Leave and unpaid leave requests')} ({companyLeaves.length})
        </button>
      </div>

      {/* Attendance Records Table */}
      {activeSubTab === 'attendance' ? (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden w-full">
          <table className="w-full text-right text-xs table-fixed divide-y divide-slate-100">
            <thead>
              <tr className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200 text-[11px]">
                <th className="py-3 px-3 w-[25%] text-start font-bold">{tr('الموظف والرقم', 'Employee & number')}</th>
                <th className="py-3 px-2 w-[12%] text-start font-bold">{tr('التاريخ', 'Date')}</th>
                <th className="py-3 px-2 w-[12%] text-center font-bold">{tr('التأخير', 'Lateness')}</th>
                <th className="py-3 px-2 w-[12%] text-center font-bold">{tr('الغياب', 'Absence')}</th>
                <th className="py-3 px-2 w-[13%] text-center font-bold">{tr('إجازة بدون راتب', 'Unpaid leave')}</th>
                <th className="py-3 px-2 w-[13%] text-center font-bold">{tr('العمل الإضافي', 'Overtime')}</th>
                <th className="py-3 px-3 w-[10%] text-start font-bold">{tr('ملاحظات', 'Notes')}</th>
                <th className="py-3 px-2 w-[8%] text-center font-bold">{tr('إجراء', 'Action')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {companyAttendance.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    {tr('لا توجد سجلات حضور مسجلة لشهر', 'No attendance records for')} {selectedPeriod}
                  </td>
                </tr>
              ) : (
                companyAttendance.map((rec) => {
                  const emp = companyEmployees.find(e => e.id === rec.employeeId);
                  return (
                    <tr key={rec.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-2.5 px-3 overflow-hidden">
                        <div className="font-bold text-slate-900 truncate">
                          {employeeName(emp)}
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono truncate">
                          {emp?.employeeNo} - {emp?.department}
                        </div>
                      </td>

                      <td className="py-2.5 px-2 font-semibold text-slate-700 font-mono text-[11px]">
                        {rec.endDate && rec.endDate !== rec.date ? `${rec.date} ← ${rec.endDate}` : rec.date}
                      </td>

                      <td className="py-2.5 px-2 text-center">
                        {rec.delayMinutes > 0 ? (
                          <span className="inline-block font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200 text-[10px] whitespace-nowrap">
                            {rec.delayMinutes} {tr('د', 'min')}
                          </span>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>

                      <td className="py-2.5 px-2 text-center">
                        {rec.absence ? (
                          <span className="inline-block font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-md border border-rose-200 text-[10px] whitespace-nowrap">
                            {rec.daysCount && rec.daysCount > 1 ? `${rec.daysCount} ${tr('أيام غياب', 'absence days')}` : tr('غياب كامل', 'Full absence')}
                          </span>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>

                      <td className="py-2.5 px-2 text-center">
                        {rec.unpaidLeave ? (
                          <span className="inline-block font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded-md border border-purple-200 text-[10px] whitespace-nowrap">
                            {tr('بدون راتب', 'Unpaid')}
                          </span>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>

                      <td className="py-2.5 px-2 text-center">
                        {rec.overtimeHours > 0 ? (
                          <span className="inline-block font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded-md border border-emerald-200 text-[10px] whitespace-nowrap">
                            +{rec.overtimeHours}{tr('س', 'h')} ({rec.overtimeType === 'WEEKEND' ? tr('عطلة', 'Weekend') : tr('عادي', 'Standard')})
                          </span>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>

                      <td className="py-2.5 px-3 text-slate-500 text-[11px] truncate" title={rec.notes || ''}>
                        {rec.notes || '-'}
                      </td>
                      <td className="py-2.5 px-2 text-center">
                        <div className="flex items-center justify-center gap-1">
                        <button type="button" onClick={() => openEditAttendance(rec)} className="p-1.5 rounded-lg bg-blue-50 text-blue-700 border border-blue-200" title={tr('تعديل الحركة', 'Edit record')}><Edit3 className="w-3 h-3" /></button>
                        <button
                          type="button"
                          onClick={() => { if (window.confirm(tr(`هل تريد حذف حركة ${rec.absence ? 'الغياب' : 'الحضور'} المسجلة بتاريخ ${rec.date}؟`, `Delete the ${rec.absence ? 'absence' : 'attendance'} record dated ${rec.date}?`))) onDeleteAttendance(rec.id); }}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-rose-50 text-rose-700 border border-rose-200 font-bold hover:bg-rose-100"
                          title={tr('حذف الحركة وإلغاء أثرها من المسير', 'Delete record and remove its payroll impact')}
                        >
                          <Trash2 className="w-3 h-3" /> {rec.absence ? tr('إلغاء الغياب', 'Cancel absence') : tr('حذف', 'Delete')}
                        </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      ) : (
        /* Leaves Table */
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden w-full">
          <table className="w-full text-right text-xs table-fixed divide-y divide-slate-100">
            <thead>
              <tr className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200 text-[11px]">
                <th className="py-3 px-3 w-[22%] text-start font-bold">{tr('الموظف', 'Employee')}</th>
                <th className="py-3 px-2 w-[16%] text-start font-bold">{tr('نوع الإجازة', 'Leave type')}</th>
                <th className="py-3 px-2 w-[12%] text-start font-bold">{tr('من تاريخ', 'From')}</th>
                <th className="py-3 px-2 w-[12%] text-start font-bold">{tr('إلى تاريخ', 'To')}</th>
                <th className="py-3 px-2 w-[10%] text-center font-bold">{tr('المدة', 'Duration')}</th>
                <th className="py-3 px-2 w-[12%] text-center font-bold">{tr('نوع الأجر', 'Pay type')}</th>
                <th className="py-3 px-2 w-[10%] text-center font-bold">{tr('الحالة', 'Status')}</th>
                <th className="py-3 px-2 w-[6%] text-center font-bold">{tr('الإجراء', 'Action')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {companyLeaves.map((leave) => {
                const emp = companyEmployees.find(e => e.id === leave.employeeId);
                return (
                  <tr key={leave.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-2.5 px-3 overflow-hidden">
                      <div className="font-bold text-slate-900 truncate">{employeeName(emp)}</div>
                      <div className="text-[10px] text-slate-400 truncate">{emp?.jobTitle}</div>
                    </td>

                    <td className="py-2.5 px-2 font-semibold text-slate-800 text-[11px] truncate">
                      {leave.type === 'ANNUAL' ? tr('إجازة سنوية', 'Annual leave') : leave.type === 'UNPAID' ? tr('إجازة بدون راتب', 'Unpaid leave') : leave.type === 'SICK' ? tr('إجازة مرضية', 'Sick leave') : tr('إجازة طارئة', 'Emergency leave')}
                    </td>

                    <td className="py-2.5 px-2 font-mono text-[11px] text-slate-700">{leave.startDate}</td>
                    <td className="py-2.5 px-2 font-mono text-[11px] text-slate-700">{leave.endDate}</td>
                    <td className="py-2.5 px-2 font-bold text-center text-[11px]">{leave.daysCount} {tr('يوم', 'days')}</td>

                    <td className="py-2.5 px-2 text-center">
                      {leave.isPaid ? (
                        <span className="text-emerald-700 font-bold text-[10px] whitespace-nowrap">{tr('مدفوعة', 'Paid')}</span>
                      ) : (
                        <span className="text-rose-700 font-bold text-[10px] whitespace-nowrap">{tr('غير مدفوعة', 'Unpaid')}</span>
                      )}
                    </td>

                    <td className="py-2.5 px-2 text-center">
                      {leave.status === 'APPROVED' ? (
                        <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-bold text-[10px] border border-emerald-200 whitespace-nowrap">
                          {tr('معتمدة', 'Approved')}
                        </span>
                      ) : leave.status === 'REJECTED' ? (
                        <span className="px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 font-bold text-[10px] border border-rose-200 whitespace-nowrap">
                          {tr('مرفوضة', 'Rejected')}
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 font-bold text-[10px] border border-amber-200 whitespace-nowrap">
                          {tr('مراجعة', 'Pending')}
                        </span>
                      )}
                    </td>

                    <td className="py-2.5 px-2 text-center">
                      {leave.status === 'PENDING' ? (
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => onUpdateLeaveStatus(leave.id, 'APPROVED')}
                            className="p-1 text-emerald-600 hover:bg-emerald-50 rounded cursor-pointer"
                            title={tr('اعتماد', 'Approve')}
                          >
                            <CheckCircle className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => onUpdateLeaveStatus(leave.id, 'REJECTED')}
                            className="p-1 text-rose-600 hover:bg-rose-50 rounded cursor-pointer"
                            title={tr('رفض', 'Reject')}
                          >
                            <XCircle className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <button onClick={() => onUpdateLeaveStatus(leave.id, 'PENDING')} className="inline-flex items-center gap-1 text-amber-700 font-bold text-[10px]" title={tr('التراجع وإعادة الطلب للمراجعة', 'Undo and return request to review')}><RotateCcw className="w-3 h-3" /> {tr('تراجع', 'Undo')}</button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Add Attendance Modal */}
      {isAttendanceModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div data-no-translate className="bg-white rounded-3xl max-w-lg w-full shadow-2xl border border-slate-200 p-6 space-y-4">
            <h3 className="text-sm font-bold text-slate-900">{editingAttendanceId ? tr('تعديل حركة الحضور', 'Edit Attendance Record') : tr('تسجيل حركة حضور / تأخير / إضافي', 'Record Attendance / Lateness / Overtime')}</h3>

            <form onSubmit={handleSaveAttendance} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">{tr('الموظف *', 'Employee *')}</label>
                <SearchableEmployeeSelect
                  required
                  employees={companyEmployees}
                  value={newAttendance.employeeId}
                  onChange={(employeeId) => setNewAttendance({ ...newAttendance, employeeId })}
                />
              </div>

              {/* Date Range: From / To */}
              <div className="space-y-1.5 bg-slate-50/80 p-3 rounded-2xl border border-slate-200/80">
                <div className="flex items-center justify-between">
                  <label className="block font-bold text-slate-800 text-xs">
                    {tr('تاريخ الغياب / الحركة (من وإلى)', 'Absence / record date range')}
                  </label>
                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${
                    selectedDaysCount > 1 
                      ? 'bg-rose-50 text-rose-700 border-rose-200' 
                      : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  }`}>
                    {selectedDaysCount > 1 ? `${tr('المدة', 'Duration')}: ${selectedDaysCount} ${tr('أيام غياب', 'absence days')}` : tr('يوم واحد', 'One day')}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      {tr('من تاريخ (البداية) *', 'Start date *')}
                    </label>
                    <input
                      type="date"
                      required
                      value={startDate}
                      onChange={(e) => {
                        const newStart = e.target.value;
                        setStartDate(newStart);
                        if (!endDate || endDate < newStart) {
                          setEndDate(newStart);
                        }
                      }}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl font-mono text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      {tr('إلى تاريخ (النهاية) *', 'End date *')}
                    </label>
                    <input
                      type="date"
                      required
                      min={startDate}
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl font-mono text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                    />
                  </div>
                </div>

                {selectedDaysCount > 1 && (
                  <div className="flex items-center gap-1.5 text-[11px] text-rose-600 font-medium pt-1">
                    <span>💡</span>
                    <span>
                      {tr(`سيتم تسجيل فترة الغياب كعملية واحدة، ويحتسب المسير ${selectedDaysCount} أيام تلقائياً.`, `The absence range will be stored as one transaction, and payroll will calculate ${selectedDaysCount} days automatically.`)}
                    </span>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">{tr('دقائق التأخير', 'Late minutes')}</label>
                  <input
                    type="number"
                    min="0"
                    value={newAttendance.delayMinutes}
                    onChange={(e) => setNewAttendance({ ...newAttendance, delayMinutes: parseInt(e.target.value) || 0 })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">{tr('ساعات العمل الإضافي', 'Overtime hours')}</label>
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    value={newAttendance.overtimeHours}
                    onChange={(e) => setNewAttendance({ ...newAttendance, overtimeHours: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl"
                  />
                </div>
              </div>

              <div className="flex items-center gap-4 pt-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newAttendance.absence}
                    onChange={(e) => setNewAttendance({ ...newAttendance, absence: e.target.checked })}
                    className="rounded text-emerald-600 focus:ring-emerald-500"
                  />
                  <span className="font-semibold text-slate-800">{tr('غياب غير مبرر (خصم يوم كامل)', 'Unexcused absence (full-day deduction)')}</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newAttendance.unpaidLeave}
                    onChange={(e) => setNewAttendance({ ...newAttendance, unpaidLeave: e.target.checked })}
                    className="rounded text-emerald-600 focus:ring-emerald-500"
                  />
                  <span className="font-semibold text-slate-800">{tr('إجازة بدون راتب', 'Unpaid leave')}</span>
                </label>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">{tr('ملاحظات', 'Notes')}</label>
                <input
                  type="text"
                  placeholder={tr('سبب التأخير أو العمل الإضافي...', 'Reason for lateness or overtime...')}
                  value={newAttendance.notes || ''}
                  onChange={(e) => setNewAttendance({ ...newAttendance, notes: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>

              <div className="pt-3 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => { setIsAttendanceModalOpen(false); setEditingAttendanceId(null); }}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl font-semibold"
                >
                  {tr('إلغاء', 'Cancel')}
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold"
                >
                  {tr('حفظ الحركة', 'Save record')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
