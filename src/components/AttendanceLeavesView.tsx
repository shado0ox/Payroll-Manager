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

interface AttendanceLeavesViewProps {
  company: Company;
  employees: Employee[];
  attendance: AttendanceRecord[];
  leaves: LeaveRequest[];
  activeRole: UserRole;
  onAddAttendance: (record: AttendanceRecord) => void;
  onBulkImportAttendance: (records: AttendanceRecord[]) => void;
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
  const [selectedPeriod, setSelectedPeriod] = useState('2026-08');
  const [activeSubTab, setActiveSubTab] = useState<'attendance' | 'leaves'>('attendance');
  const [searchTerm, setSearchTerm] = useState('');

  // Attendance Modal
  const [isAttendanceModalOpen, setIsAttendanceModalOpen] = useState(false);
  const [editingAttendanceId, setEditingAttendanceId] = useState<string | null>(null);
  const [startDate, setStartDate] = useState('2026-08-15');
  const [endDate, setEndDate] = useState('2026-08-15');
  const [newAttendance, setNewAttendance] = useState<Partial<AttendanceRecord>>({
    companyId: company.id,
    employeeId: employees[0]?.id || '',
    periodMonth: selectedPeriod,
    date: '2026-08-15',
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
      notes: newAttendance.notes || (effectiveEndDate !== startDate ? `غياب فترة (${startDate} إلى ${effectiveEndDate})` : ''),
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
    <div className="space-y-6">
      
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Clock className="w-6 h-6 text-emerald-600" />
            <span>الحضور والانصراف والإجازات</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            تسجيل التأخير، الغياب، العمل الإضافي، والإجازات بدون راتب لتطبيقها آلياً في مسير الرواتب
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
              <option value="2026-08">أغسطس 2026</option>
              <option value="2026-07">يوليو 2026</option>
            </select>
          </div>

          <button
            onClick={() => setIsAttendanceModalOpen(true)}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>تسجيل حركة حضور / غياب</span>
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
          سجل الحضور والتأخير والإضافي ({companyAttendance.length})
        </button>

        <button
          onClick={() => setActiveSubTab('leaves')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeSubTab === 'leaves'
              ? 'bg-emerald-600 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          طلبات الإجازات والإجازة بدون راتب ({companyLeaves.length})
        </button>
      </div>

      {/* Attendance Records Table */}
      {activeSubTab === 'attendance' ? (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden w-full">
          <table className="w-full text-right text-xs table-fixed divide-y divide-slate-100">
            <thead>
              <tr className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200 text-[11px]">
                <th className="py-3 px-3 w-[25%] text-right font-bold">الموظف والرقم</th>
                <th className="py-3 px-2 w-[12%] text-right font-bold">التاريخ</th>
                <th className="py-3 px-2 w-[12%] text-center font-bold">التأخير</th>
                <th className="py-3 px-2 w-[12%] text-center font-bold">الغياب</th>
                <th className="py-3 px-2 w-[13%] text-center font-bold">إجازة بدون راتب</th>
                <th className="py-3 px-2 w-[13%] text-center font-bold">العمل الإضافي</th>
                <th className="py-3 px-3 w-[10%] text-right font-bold">ملاحظات</th>
                <th className="py-3 px-2 w-[8%] text-center font-bold">إجراء</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {companyAttendance.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    لا توجد سجلات حضور مسجلة لشهر {selectedPeriod}
                  </td>
                </tr>
              ) : (
                companyAttendance.map((rec) => {
                  const emp = companyEmployees.find(e => e.id === rec.employeeId);
                  return (
                    <tr key={rec.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-2.5 px-3 overflow-hidden">
                        <div className="font-bold text-slate-900 truncate">
                          {emp ? `${emp.firstNameAr} ${emp.lastNameAr}` : 'موظف'}
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
                            {rec.delayMinutes} د
                          </span>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>

                      <td className="py-2.5 px-2 text-center">
                        {rec.absence ? (
                          <span className="inline-block font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-md border border-rose-200 text-[10px] whitespace-nowrap">
                            {rec.daysCount && rec.daysCount > 1 ? `${rec.daysCount} أيام غياب` : 'غياب كامل'}
                          </span>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>

                      <td className="py-2.5 px-2 text-center">
                        {rec.unpaidLeave ? (
                          <span className="inline-block font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded-md border border-purple-200 text-[10px] whitespace-nowrap">
                            بدون راتب
                          </span>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>

                      <td className="py-2.5 px-2 text-center">
                        {rec.overtimeHours > 0 ? (
                          <span className="inline-block font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded-md border border-emerald-200 text-[10px] whitespace-nowrap">
                            +{rec.overtimeHours}س ({rec.overtimeType === 'WEEKEND' ? 'عطلة' : 'عادي'})
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
                        <button type="button" onClick={() => openEditAttendance(rec)} className="p-1.5 rounded-lg bg-blue-50 text-blue-700 border border-blue-200" title="تعديل الحركة"><Edit3 className="w-3 h-3" /></button>
                        <button
                          type="button"
                          onClick={() => { if (window.confirm(`هل تريد حذف حركة ${rec.absence ? 'الغياب' : 'الحضور'} المسجلة بتاريخ ${rec.date}؟`)) onDeleteAttendance(rec.id); }}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-rose-50 text-rose-700 border border-rose-200 font-bold hover:bg-rose-100"
                          title="حذف الحركة وإلغاء أثرها من المسير"
                        >
                          <Trash2 className="w-3 h-3" /> {rec.absence ? 'إلغاء الغياب' : 'حذف'}
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
                <th className="py-3 px-3 w-[22%] text-right font-bold">الموظف</th>
                <th className="py-3 px-2 w-[16%] text-right font-bold">نوع الإجازة</th>
                <th className="py-3 px-2 w-[12%] text-right font-bold">من تاريخ</th>
                <th className="py-3 px-2 w-[12%] text-right font-bold">إلى تاريخ</th>
                <th className="py-3 px-2 w-[10%] text-center font-bold">المدة</th>
                <th className="py-3 px-2 w-[12%] text-center font-bold">نوع الأجر</th>
                <th className="py-3 px-2 w-[10%] text-center font-bold">الحالة</th>
                <th className="py-3 px-2 w-[6%] text-center font-bold">الإجراء</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {companyLeaves.map((leave) => {
                const emp = companyEmployees.find(e => e.id === leave.employeeId);
                return (
                  <tr key={leave.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-2.5 px-3 overflow-hidden">
                      <div className="font-bold text-slate-900 truncate">{emp ? `${emp.firstNameAr} ${emp.lastNameAr}` : 'موظف'}</div>
                      <div className="text-[10px] text-slate-400 truncate">{emp?.jobTitle}</div>
                    </td>

                    <td className="py-2.5 px-2 font-semibold text-slate-800 text-[11px] truncate">
                      {leave.type === 'ANNUAL' ? 'إجازة سنوية' : leave.type === 'UNPAID' ? 'إجازة بدون راتب' : leave.type === 'SICK' ? 'إجازة مرضية' : 'إجازة طارئة'}
                    </td>

                    <td className="py-2.5 px-2 font-mono text-[11px] text-slate-700">{leave.startDate}</td>
                    <td className="py-2.5 px-2 font-mono text-[11px] text-slate-700">{leave.endDate}</td>
                    <td className="py-2.5 px-2 font-bold text-center text-[11px]">{leave.daysCount} يوم</td>

                    <td className="py-2.5 px-2 text-center">
                      {leave.isPaid ? (
                        <span className="text-emerald-700 font-bold text-[10px] whitespace-nowrap">مدفوعة</span>
                      ) : (
                        <span className="text-rose-700 font-bold text-[10px] whitespace-nowrap">غير مدفوعة</span>
                      )}
                    </td>

                    <td className="py-2.5 px-2 text-center">
                      {leave.status === 'APPROVED' ? (
                        <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-bold text-[10px] border border-emerald-200 whitespace-nowrap">
                          معتمدة
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 font-bold text-[10px] border border-amber-200 whitespace-nowrap">
                          مراجعة
                        </span>
                      )}
                    </td>

                    <td className="py-2.5 px-2 text-center">
                      {leave.status === 'PENDING' ? (
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => onUpdateLeaveStatus(leave.id, 'APPROVED')}
                            className="p-1 text-emerald-600 hover:bg-emerald-50 rounded cursor-pointer"
                            title="اعتماد"
                          >
                            <CheckCircle className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => onUpdateLeaveStatus(leave.id, 'REJECTED')}
                            className="p-1 text-rose-600 hover:bg-rose-50 rounded cursor-pointer"
                            title="رفض"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <button onClick={() => onUpdateLeaveStatus(leave.id, 'PENDING')} className="inline-flex items-center gap-1 text-amber-700 font-bold text-[10px]" title="التراجع وإعادة الطلب للمراجعة"><RotateCcw className="w-3 h-3" /> تراجع</button>
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
          <div className="bg-white rounded-3xl max-w-lg w-full shadow-2xl border border-slate-200 p-6 space-y-4">
            <h3 className="text-sm font-bold text-slate-900">{editingAttendanceId ? 'تعديل حركة الحضور' : 'تسجيل حركة حضور / تأخير / إضافي'}</h3>

            <form onSubmit={handleSaveAttendance} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">الموظف *</label>
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
                    تاريخ الغياب / الحركة (من وإلى)
                  </label>
                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${
                    selectedDaysCount > 1 
                      ? 'bg-rose-50 text-rose-700 border-rose-200' 
                      : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  }`}>
                    {selectedDaysCount > 1 ? `المدة: ${selectedDaysCount} أيام غياب` : 'يوم واحد'}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      من تاريخ (البداية) *
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
                      إلى تاريخ (النهاية) *
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
                      سيتم تسجيل فترة الغياب كعملية واحدة، ويحتسب المسير {selectedDaysCount} أيام تلقائياً.
                    </span>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">دقائق التأخير</label>
                  <input
                    type="number"
                    min="0"
                    value={newAttendance.delayMinutes}
                    onChange={(e) => setNewAttendance({ ...newAttendance, delayMinutes: parseInt(e.target.value) || 0 })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">ساعات العمل الإضافي</label>
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
                  <span className="font-semibold text-slate-800">غياب غير مبرر (خصم يوم كامل)</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newAttendance.unpaidLeave}
                    onChange={(e) => setNewAttendance({ ...newAttendance, unpaidLeave: e.target.checked })}
                    className="rounded text-emerald-600 focus:ring-emerald-500"
                  />
                  <span className="font-semibold text-slate-800">إجازة بدون راتب</span>
                </label>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">ملاحظات</label>
                <input
                  type="text"
                  placeholder="سبب التأخير أو العمل الإضافي..."
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
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold"
                >
                  حفظ الحركة
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
