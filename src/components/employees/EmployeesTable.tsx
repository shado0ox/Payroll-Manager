import React from 'react';
import { AlertCircle, Edit, FileText, Trash2, UserCheck } from 'lucide-react';
import { Company, Employee } from '../../types';
import { formatSAR } from '../../utils/payrollEngine';
import { detectBankFromIBAN } from '../../utils/security';

interface EmployeesTableProps {
  language: 'ar' | 'en';
  company: Company;
  companyEmployees: Employee[];
  filteredEmployees: Employee[];
  selectedStatus: string;
  setSelectedStatus: React.Dispatch<React.SetStateAction<string>>;
  handleStatement: (employee: Employee) => void;
  handleCompleteOnboarding: (employee: Employee) => void;
  handleOpenEdit: (employee: Employee) => void;
  onDeleteEmployee?: (employeeId: string) => void;
}

export const EmployeesTable = React.memo<EmployeesTableProps>(({
  language,
  company,
  companyEmployees,
  filteredEmployees,
  selectedStatus,
  setSelectedStatus,
  handleStatement,
  handleCompleteOnboarding,
  handleOpenEdit,
  onDeleteEmployee,
}) => (
  <>
      {/* Employees Table */}
      {companyEmployees.some(emp => emp.status === 'ABSCONDED') && (
        <button
          data-no-translate
          type="button"
          onClick={() => setSelectedStatus(selectedStatus === 'ABSCONDED' ? 'ALL' : 'ABSCONDED')}
          className={`w-full rounded-2xl border px-4 py-3 flex items-center justify-between text-xs font-bold transition-colors ${selectedStatus === 'ABSCONDED' ? 'bg-rose-100 border-rose-300 text-rose-900' : 'bg-rose-50 border-rose-200 text-rose-800 hover:bg-rose-100'}`}
        >
          <span>{language === 'ar' ? 'قائمة العمالة الهاربة — الرواتب معلقة ومستبعدة من المسير' : 'Absconded Workers — Salaries Suspended and Excluded from Payroll'}</span>
          <span className="px-2 py-1 rounded-full bg-white border border-rose-200 font-mono">{companyEmployees.filter(emp => emp.status === 'ABSCONDED').length}</span>
        </button>
      )}
      <div data-no-translate className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden w-full">
        <table className="w-full text-right text-xs table-fixed divide-y divide-slate-100">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold text-[11px]">
              <th className="py-3 px-2.5 w-[16%] font-bold">{language === 'ar' ? 'الرقم والموظف' : 'Employee & Number'}</th>
              <th className="py-3 px-2 w-[11%] font-bold">{language === 'ar' ? 'الهوية / الإقامة' : 'ID / Iqama'}</th>
              <th className="py-3 px-2 w-[13%] font-bold">{language === 'ar' ? 'القسم والمسمى' : 'Department & Job'}</th>
              <th className="py-3 px-2 w-[10%] font-bold">{language === 'ar' ? 'الجنسية والتأمينات' : 'Nationality & GOSI'}</th>
              <th className="py-3 px-2 w-[12%] font-bold">{language === 'ar' ? 'الحساب (IBAN)' : 'Bank Account (IBAN)'}</th>
              <th className="py-3 px-2 w-[13%] font-bold">{language === 'ar' ? 'الأساسي والبدلات' : 'Salary & Allowances'}</th>
              <th className="py-3 px-2 w-[8%] font-bold">{language === 'ar' ? 'إجمالي الراتب' : 'Gross Salary'}</th>
              <th className="py-3 px-1.5 w-[7%] text-center font-bold">{language === 'ar' ? 'الحالة' : 'Status'}</th>
              <th className="py-3 px-2 w-[10%] text-center font-bold">{language === 'ar' ? 'الإجراءات' : 'Actions'}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {filteredEmployees.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-12 text-center text-slate-400">
                  {language === 'ar' ? 'لا توجد بيانات موظفين مطابقة لمعايير البحث' : 'No employees match the selected filters'}
                </td>
              </tr>
            ) : (
              filteredEmployees.map((emp, idx) => {
                const gross = 
                  emp.salaryPackage.baseSalary + 
                  emp.salaryPackage.housingAllowance + 
                  emp.salaryPackage.transportAllowance + 
                  (emp.salaryPackage.otherFixedAllowances || 0);

                const isSuspended = emp.status === 'SUSPENDED';
                const isAbsconded = emp.status === 'ABSCONDED';
                const resolvedBank = detectBankFromIBAN(emp.bankIban, company.bankDefinitions);
                const displayBankName = resolvedBank ? (language === 'en' ? resolvedBank.nameEn || resolvedBank.nameAr : resolvedBank.nameAr) : emp.bankName;
                const displaySwift = resolvedBank?.swiftCode || emp.bankSwiftCode;

                return (
                  <tr key={`${emp.id || 'emp'}-${idx}`} className="hover:bg-slate-50/80 transition-colors text-[11px]">
                    
                    {/* Name & Emp No */}
                    <td className="py-3 px-2.5 truncate">
                      <div className="font-bold text-slate-900 truncate">
                        {emp.firstNameAr} {emp.lastNameAr}
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono">
                        {emp.employeeNo}
                      </div>
                      {!!emp.dataWarnings?.length && (
                        <div className="text-[9px] text-amber-700 font-semibold flex items-center gap-1 mt-0.5" title={emp.dataWarnings.join(' • ')}>
                          <AlertCircle className="w-3 h-3" /> {language === 'ar' ? 'بيانات تحتاج استكمال' : 'Incomplete data'}
                        </div>
                      )}
                    </td>

                    {/* National ID / Iqama */}
                    <td className="py-3 px-2 font-mono text-slate-600 truncate">
                      {emp.nationalIdOrIqama || <span className="text-amber-600 font-sans">{language === 'ar' ? 'غير مكتملة' : 'Incomplete'}</span>}
                    </td>

                    {/* Dept & Job */}
                    <td className="py-3 px-2 truncate">
                      <div className="font-semibold text-slate-800 truncate">{emp.department}</div>
                      <div className="text-[10px] text-slate-500 truncate">{emp.jobTitle}</div>
                    </td>

                    {/* Nationality & GOSI */}
                    <td className="py-3 px-2 truncate">
                      {emp.nationality === 'SAUDI' ? (
                        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md font-bold border text-[10px] ${emp.gosiEnabled === false ? 'bg-slate-100 text-slate-600 border-slate-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
                          <span>{emp.gosiEnabled === false ? 'سعودي — غير خاضع' : `GOSI ${((emp.gosiEmployeeRate ?? company.calculationRules?.saudiGosiEmployeeRate ?? 0.0975) * 100).toFixed(2)}%`}</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-700 font-medium text-[10px]">
                          <span>{emp.country}</span>
                        </span>
                      )}
                    </td>

                    {/* Bank & IBAN & SWIFT */}
                    <td className="py-3 px-2 truncate">
                      <div className="text-slate-800 font-medium truncate">{displayBankName}</div>
                      {emp.bankIban ? (
                        <div className="text-[10px] text-slate-500 font-mono truncate" title={emp.bankIban}>
                          {emp.bankIban.slice(0, 6)}...{emp.bankIban.slice(-4)}
                        </div>
                      ) : <div className="text-[9px] text-amber-600 font-semibold">{language === 'ar' ? 'IBAN غير مكتمل' : 'Incomplete IBAN'}</div>}
                      {displaySwift ? (
                        <div className="text-[9px] text-emerald-700 font-mono font-semibold truncate" title={`رمز السويفت: ${displaySwift}`}>
                          SWIFT: {displaySwift}
                        </div>
                      ) : (
                        <div className="text-[9px] text-slate-400 font-mono">
                          SWIFT: —
                        </div>
                      )}
                    </td>

                    {/* Salary Breakdown */}
                    <td className="py-3 px-2">
                      <div className="font-bold text-slate-800 whitespace-nowrap">
                        {language === 'ar' ? 'أساسي:' : 'Basic:'} {formatSAR(emp.salaryPackage.baseSalary)}
                      </div>
                      <div className="text-[9px] text-slate-500 whitespace-nowrap">
                        {language === 'ar' ? 'سكن:' : 'Housing:'} {formatSAR(emp.salaryPackage.housingAllowance)} | {language === 'ar' ? 'نقل:' : 'Transport:'} {formatSAR(emp.salaryPackage.transportAllowance)}
                      </div>
                    </td>

                    {/* Gross */}
                    <td className="py-3 px-2 font-black text-slate-900 whitespace-nowrap">
                      {formatSAR(gross)}
                    </td>

                    {/* Status */}
                    <td className="py-3 px-1.5 text-center">
                      {isAbsconded ? (
                        <span className="px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-800 text-[9px] font-bold border border-rose-200 block text-center" title={emp.suspensionReason}>
                          {language === 'ar' ? 'هارب' : 'Absconded'}
                        </span>
                      ) : isSuspended ? (
                        <span className="px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[9px] font-bold border border-amber-200 block text-center" title={emp.suspensionReason}>
                          {language === 'ar' ? 'موقوف' : 'Suspended'}
                        </span>
                      ) : emp.status === 'ACTIVE' ? (
                        <span className="px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[9px] font-bold border border-emerald-200 block text-center">
                          {language === 'ar' ? 'نشط' : 'Active'}
                        </span>
                      ) : (
                        <span className="px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[9px] font-semibold block text-center">
                          {emp.status === 'ON_LEAVE' ? (language === 'ar' ? 'في إجازة' : 'On leave') : emp.status === 'TERMINATED' ? (language === 'ar' ? 'منتهي' : 'Terminated') : emp.status}
                        </span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="py-3 px-1.5 text-center">
                      <div className="flex items-center justify-center gap-1.5 whitespace-nowrap">
                        
                        {/* Payslip & Statement button */}
                        <button
                          onClick={() => handleStatement(emp)}
                          title={language === 'ar' ? 'كشف حساب الموظف وقسيمة الراتب' : 'Employee statement and payslip'}
                          className="p-1 text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700 rounded-lg transition-colors cursor-pointer shrink-0"
                        >
                          <FileText className="w-3.5 h-3.5" />
                        </button>

                        {emp.status === 'ONBOARDING' && (
                          <button
                            type="button"
                            onClick={() => handleCompleteOnboarding(emp)}
                            title={language === 'ar' ? 'إدخال رقم الإقامة والآيبان وتحويل الموظف إلى نشط' : 'Enter Iqama and IBAN, then activate'}
                            className="shrink-0 rounded-lg border border-emerald-200 bg-emerald-50 p-1 text-emerald-700 hover:bg-emerald-100"
                          >
                            <UserCheck className="h-3.5 w-3.5" />
                          </button>
                        )}

                        {/* Edit */}
                        <button
                          onClick={() => handleOpenEdit(emp)}
                          title={language === 'ar' ? 'تعديل بيانات الموظف والراتب' : 'Edit employee and salary'}
                          className="p-1 text-slate-600 hover:bg-slate-100 hover:text-slate-900 rounded-lg transition-colors cursor-pointer shrink-0"
                        >
                          <Edit className="w-3.5 h-3.5" />
                        </button>

                        {/* Delete */}
                        <button
                          onClick={() => {
                            const name = language === 'ar' ? `${emp.firstNameAr} ${emp.lastNameAr}` : (`${emp.firstNameEn} ${emp.lastNameEn}`.trim() || `${emp.firstNameAr} ${emp.lastNameAr}`);
                            if (window.confirm(language === 'ar' ? `هل تريد حذف الموظف «${name}»؟ إذا كان مرتبطًا بحركات سابقة فسيتم أرشفته مع حفظ السجلات.` : `Delete “${name}”? If historical records exist, the employee will be archived and history retained.`)) {
                              if (onDeleteEmployee) {
                                onDeleteEmployee(emp.id);
                              } else {
                                alert(language === 'ar' ? 'تعذر بدء الحذف: وظيفة الحذف غير مرتبطة بهذه الشاشة.' : 'Could not start deletion: the delete action is not connected to this view.');
                              }
                            }
                          }}
                          title={language === 'ar' ? 'حذف الموظف' : 'Delete employee'}
                          className="p-1 text-rose-500 hover:bg-rose-50 hover:text-rose-700 rounded-lg transition-colors cursor-pointer shrink-0"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
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
  </>
));

EmployeesTable.displayName = 'EmployeesTable';

