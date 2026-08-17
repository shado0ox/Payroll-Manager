import React, { useState, useMemo } from 'react';
import { 
  Receipt, 
  Plus, 
  DollarSign, 
  Calendar, 
  AlertCircle, 
  CheckCircle2, 
  PauseCircle, 
  Trash2,
  FileText
} from 'lucide-react';
import { Company, Employee, LoanSchedule, PenaltyRecord, UserRole } from '../types';
import { formatSAR } from '../utils/payrollEngine';

interface LoansPenaltiesViewProps {
  company: Company;
  employees: Employee[];
  loans: LoanSchedule[];
  penalties: PenaltyRecord[];
  activeRole: UserRole;
  onAddLoan: (loan: LoanSchedule) => void;
  onUpdateLoanStatus: (loanId: string, status: LoanSchedule['status']) => void;
  onAddPenalty: (penalty: PenaltyRecord) => void;
}

export const LoansPenaltiesView: React.FC<LoansPenaltiesViewProps> = ({
  company,
  employees,
  loans,
  penalties,
  activeRole,
  onAddLoan,
  onUpdateLoanStatus,
  onAddPenalty,
}) => {
  const [activeTab, setActiveTab] = useState<'loans' | 'penalties'>('loans');
  const [isLoanModalOpen, setIsLoanModalOpen] = useState(false);
  const [isPenaltyModalOpen, setIsPenaltyModalOpen] = useState(false);

  const companyEmployees = useMemo(() => {
    return employees.filter(e => e.companyId === company.id);
  }, [employees, company.id]);

  const companyLoans = useMemo(() => {
    return loans.filter(l => l.companyId === company.id);
  }, [loans, company.id]);

  const companyPenalties = useMemo(() => {
    return penalties.filter(p => p.companyId === company.id);
  }, [penalties, company.id]);

  // New Loan Form
  const [loanForm, setLoanForm] = useState({
    employeeId: companyEmployees[0]?.id || '',
    totalAmount: 10000,
    monthlyInstallment: 1000,
    totalInstallments: 10,
    startDate: '2026-08',
    reason: 'سلفة شخصية طارئة',
  });

  // New Penalty Form
  const [penaltyForm, setPenaltyForm] = useState({
    employeeId: companyEmployees[0]?.id || '',
    periodMonth: '2026-08',
    date: '2026-08-15',
    reason: 'مخالفة لائحة تنظيم العمل الداخلية',
    amount: 200,
  });

  const handleSaveLoan = (e: React.FormEvent) => {
    e.preventDefault();
    if (!loanForm.employeeId) return;

    const newLoan: LoanSchedule = {
      id: `loan-${Date.now()}`,
      companyId: company.id,
      employeeId: loanForm.employeeId,
      totalAmount: loanForm.totalAmount,
      monthlyInstallment: loanForm.monthlyInstallment,
      totalInstallments: loanForm.totalInstallments,
      remainingInstallments: loanForm.totalInstallments,
      remainingAmount: loanForm.totalAmount,
      startDate: loanForm.startDate,
      status: 'ACTIVE',
      reason: loanForm.reason,
    };

    onAddLoan(newLoan);
    setIsLoanModalOpen(false);
  };

  const handleSavePenalty = (e: React.FormEvent) => {
    e.preventDefault();
    if (!penaltyForm.employeeId) return;

    const newPenalty: PenaltyRecord = {
      id: `pen-${Date.now()}`,
      companyId: company.id,
      employeeId: penaltyForm.employeeId,
      periodMonth: penaltyForm.periodMonth,
      date: penaltyForm.date,
      reason: penaltyForm.reason,
      amount: penaltyForm.amount,
      appliedInPayroll: true,
    };

    onAddPenalty(newPenalty);
    setIsPenaltyModalOpen(false);
  };

  // Metrics
  const totalActiveLoansAmount = companyLoans
    .filter(l => l.status === 'ACTIVE')
    .reduce((sum, l) => sum + l.remainingAmount, 0);

  const totalMonthlyDeductionExpected = companyLoans
    .filter(l => l.status === 'ACTIVE')
    .reduce((sum, l) => sum + l.monthlyInstallment, 0);

  return (
    <div className="space-y-6">
      
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Receipt className="w-6 h-6 text-emerald-600" />
            <span>السلف والأقساط والجزاءات الإدارية</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            جدولة أقساط سلف الموظفين، ضبط حد الاستقطاع (33%)، وتسجيل الخصومات الإدارية
          </p>
        </div>

        <div className="flex items-center gap-2">
          {activeTab === 'loans' ? (
            <button
              onClick={() => setIsLoanModalOpen(true)}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>إضافة سلفة جديدة</span>
            </button>
          ) : (
            <button
              onClick={() => setIsPenaltyModalOpen(true)}
              className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>تسجيل جزاء / خصم إداري</span>
            </button>
          )}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <div className="text-xs text-slate-500 font-semibold">إجمالي أرصدة السلف القائمة</div>
          <div className="text-xl font-bold text-slate-900 mt-1">{formatSAR(totalActiveLoansAmount)}</div>
          <div className="text-[10px] text-slate-400">ذمم مدينة لموظفي المنشأة</div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <div className="text-xs text-slate-500 font-semibold">استقطاع الأقساط الشهري المتوقع</div>
          <div className="text-xl font-bold text-emerald-700 mt-1">{formatSAR(totalMonthlyDeductionExpected)}</div>
          <div className="text-[10px] text-slate-400">يُخصم شهرياً عبر مسير الرواتب</div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <div className="text-xs text-slate-500 font-semibold">عدد الموظفين المستفيدين من السلف</div>
          <div className="text-xl font-bold text-blue-700 mt-1">
            {companyLoans.filter(l => l.status === 'ACTIVE').length} موظف
          </div>
          <div className="text-[10px] text-slate-400">سلف سارية المفعول</div>
        </div>
      </div>

      {/* Tab Selector */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
        <button
          onClick={() => setActiveTab('loans')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'loans'
              ? 'bg-emerald-600 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          جدول سلف وأقساط الموظفين ({companyLoans.length})
        </button>

        <button
          onClick={() => setActiveTab('penalties')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'penalties'
              ? 'bg-emerald-600 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          سجل الجزاءات والخصومات ({companyPenalties.length})
        </button>
      </div>

      {/* Loans Table */}
      {activeTab === 'loans' ? (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead>
                <tr className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200">
                  <th className="py-3 px-4">الموظف</th>
                  <th className="py-3 px-4">مبلغ السلفة الإجمالي</th>
                  <th className="py-3 px-4">القسط الشهري</th>
                  <th className="py-3 px-4">الأقساط (المتبقي / الإجمالي)</th>
                  <th className="py-3 px-4">الرصيد المتبقي</th>
                  <th className="py-3 px-4">تاريخ البداية</th>
                  <th className="py-3 px-4">السبب</th>
                  <th className="py-3 px-4">الحالة</th>
                  <th className="py-3 px-4 text-center">الإجراء</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {companyLoans.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-slate-400">
                      لا توجد سلف مسجلة حالياً
                    </td>
                  </tr>
                ) : (
                  companyLoans.map((loan) => {
                    const emp = companyEmployees.find(e => e.id === loan.employeeId);
                    return (
                      <tr key={loan.id} className="hover:bg-slate-50">
                        <td className="py-3 px-4">
                          <div className="font-bold text-slate-900">{emp ? `${emp.firstNameAr} ${emp.lastNameAr}` : 'موظف'}</div>
                          <div className="text-[10px] text-slate-400">{emp?.employeeNo} - {emp?.department}</div>
                        </td>

                        <td className="py-3 px-4 font-bold text-slate-900">{formatSAR(loan.totalAmount)}</td>
                        <td className="py-3 px-4 font-semibold text-rose-700">{formatSAR(loan.monthlyInstallment)}</td>
                        <td className="py-3 px-4 font-mono font-bold text-slate-700">{loan.remainingInstallments} من {loan.totalInstallments}</td>
                        <td className="py-3 px-4 font-extrabold text-amber-800 font-mono">{formatSAR(loan.remainingAmount)}</td>
                        <td className="py-3 px-4 font-mono text-slate-600">{loan.startDate}</td>
                        <td className="py-3 px-4 text-slate-600">{loan.reason}</td>

                        <td className="py-3 px-4">
                          {loan.status === 'ACTIVE' ? (
                            <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-bold border border-emerald-200">
                              سارية الخصم
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-[10px] font-bold">
                              موقوفة / مسددة
                            </span>
                          )}
                        </td>

                        <td className="py-3 px-4 text-center">
                          {loan.status === 'ACTIVE' ? (
                            <button
                              onClick={() => onUpdateLoanStatus(loan.id, 'PAUSED')}
                              className="text-[11px] font-semibold text-amber-700 hover:text-amber-800"
                            >
                              إيقاف مؤقت
                            </button>
                          ) : (
                            <button
                              onClick={() => onUpdateLoanStatus(loan.id, 'ACTIVE')}
                              className="text-[11px] font-semibold text-emerald-700 hover:text-emerald-800"
                            >
                              تفعيل الخصم
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* Penalties Table */
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead>
                <tr className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200">
                  <th className="py-3 px-4">الموظف</th>
                  <th className="py-3 px-4">فترة الراتب</th>
                  <th className="py-3 px-4">تاريخ الواقعة</th>
                  <th className="py-3 px-4">سبب الجزاء / المخالفة</th>
                  <th className="py-3 px-4">مبلغ الخصم</th>
                  <th className="py-3 px-4">التطبيق في المسير</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {companyPenalties.map((pen) => {
                  const emp = companyEmployees.find(e => e.id === pen.employeeId);
                  return (
                    <tr key={pen.id} className="hover:bg-slate-50">
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-900">{emp ? `${emp.firstNameAr} ${emp.lastNameAr}` : 'موظف'}</div>
                        <div className="text-[10px] text-slate-400">{emp?.jobTitle}</div>
                      </td>
                      <td className="py-3 px-4 font-mono font-bold">{pen.periodMonth}</td>
                      <td className="py-3 px-4 font-mono text-slate-600">{pen.date}</td>
                      <td className="py-3 px-4 text-slate-700">{pen.reason}</td>
                      <td className="py-3 px-4 font-bold text-rose-700">{formatSAR(pen.amount)}</td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 font-bold text-[10px] border border-emerald-200">
                          مطبق بالمسير
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add Loan Modal */}
      {isLoanModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full shadow-2xl border border-slate-200 p-6 space-y-4">
            <h3 className="text-sm font-bold text-slate-900">إضافة سلفة جديدة لموظف</h3>

            <form onSubmit={handleSaveLoan} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">الموظف المستفيد *</label>
                <select
                  required
                  value={loanForm.employeeId}
                  onChange={(e) => setLoanForm({ ...loanForm, employeeId: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl"
                >
                  {companyEmployees.map(e => (
                    <option key={e.id} value={e.id}>{e.employeeNo} - {e.firstNameAr} {e.lastNameAr} ({e.department})</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">إجمالي مبلغ السلفة (SAR) *</label>
                  <input
                    type="number"
                    required
                    min="100"
                    value={loanForm.totalAmount}
                    onChange={(e) => {
                      const total = parseFloat(e.target.value) || 0;
                      setLoanForm({ 
                        ...loanForm, 
                        totalAmount: total,
                        monthlyInstallment: Math.round(total / (loanForm.totalInstallments || 1))
                      });
                    }}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">عدد أشهر السداد *</label>
                  <input
                    type="number"
                    required
                    min="1"
                    max="60"
                    value={loanForm.totalInstallments}
                    onChange={(e) => {
                      const inst = parseInt(e.target.value) || 1;
                      setLoanForm({ 
                        ...loanForm, 
                        totalInstallments: inst,
                        monthlyInstallment: Math.round(loanForm.totalAmount / inst)
                      });
                    }}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl"
                  />
                </div>
              </div>

              <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 flex items-center justify-between">
                <span className="font-semibold text-emerald-900">القسط الشهري المحسوب:</span>
                <span className="font-bold text-emerald-800 text-sm">{formatSAR(loanForm.monthlyInstallment)}</span>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">سبب السلفة</label>
                <input
                  type="text"
                  required
                  value={loanForm.reason}
                  onChange={(e) => setLoanForm({ ...loanForm, reason: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>

              <div className="pt-3 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsLoanModalOpen(false)}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold"
                >
                  اعتماد وجدولة السلفة
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Penalty Modal */}
      {isPenaltyModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full shadow-2xl border border-slate-200 p-6 space-y-4">
            <h3 className="text-sm font-bold text-slate-900">تسجيل جزاء إداري على موظف</h3>

            <form onSubmit={handleSavePenalty} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">الموظف *</label>
                <select
                  required
                  value={penaltyForm.employeeId}
                  onChange={(e) => setPenaltyForm({ ...penaltyForm, employeeId: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl"
                >
                  {companyEmployees.map(e => (
                    <option key={e.id} value={e.id}>{e.employeeNo} - {e.firstNameAr} {e.lastNameAr}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">مبلغ الخصم (SAR) *</label>
                  <input
                    type="number"
                    required
                    min="10"
                    value={penaltyForm.amount}
                    onChange={(e) => setPenaltyForm({ ...penaltyForm, amount: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-rose-700"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">تاريخ المخالفة</label>
                  <input
                    type="date"
                    value={penaltyForm.date}
                    onChange={(e) => setPenaltyForm({ ...penaltyForm, date: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">سبب الجزاء الإداري *</label>
                <input
                  type="text"
                  required
                  placeholder="مخالفة لائحة الدوام / تلف ممتلكات..."
                  value={penaltyForm.reason}
                  onChange={(e) => setPenaltyForm({ ...penaltyForm, reason: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>

              <div className="pt-3 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsPenaltyModalOpen(false)}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold"
                >
                  تطبيق الجزاء في المسير
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
