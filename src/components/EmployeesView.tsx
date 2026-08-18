import React, { useState, useMemo } from 'react';
import { 
  Users, 
  Search, 
  Filter, 
  Plus, 
  Download, 
  Edit, 
  Trash2, 
  FileText, 
  ShieldCheck, 
  AlertCircle, 
  Building2, 
  Sparkles,
  CheckCircle,
  X,
  CreditCard,
  Briefcase,
  UserPlus
} from 'lucide-react';
import { Company, Employee, EmploymentStatus, NationalityType, UserRole } from '../types';
import { formatSAR, roundAmount } from '../utils/payrollEngine';
import { downloadCsvFile } from '../utils/exportUtils';
import { 
  validateSaudiIBAN, 
  validateSwiftCode, 
  detectBankFromIBAN, 
  getSwiftCodeFromBankName, 
  SAUDI_BANKS 
} from '../utils/security';

interface EmployeesViewProps {
  company: Company;
  employees: Employee[];
  loans?: any[];
  activeRole: UserRole;
  onSaveEmployee?: (emp: Employee) => void;
  onViewStatement?: (emp: Employee) => void;
  onAddEmployee?: (emp: Employee) => void;
  onUpdateEmployee?: (emp: Employee) => void;
  onDeleteEmployee?: (empId: string) => void;
  onViewEmployeeStatement?: (emp: Employee) => void;
}

export const EmployeesView: React.FC<EmployeesViewProps> = ({
  company,
  employees,
  loans = [],
  activeRole,
  onSaveEmployee,
  onViewStatement,
  onAddEmployee,
  onUpdateEmployee,
  onDeleteEmployee,
  onViewEmployeeStatement,
}) => {
  const handleSave = (emp: Employee) => {
    if (onSaveEmployee) onSaveEmployee(emp);
    if (onUpdateEmployee && employees.some(e => e.id === emp.id)) onUpdateEmployee(emp);
    else if (onAddEmployee) onAddEmployee(emp);
  };

  const handleStatement = (emp: Employee) => {
    if (onViewStatement) onViewStatement(emp);
    else if (onViewEmployeeStatement) onViewEmployeeStatement(emp);
  };
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDept, setSelectedDept] = useState('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [selectedNationality, setSelectedNationality] = useState<string>('ALL');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);

  // Form Fields
  const [formData, setFormData] = useState<Partial<Employee>>({
    companyId: company.id,
    employeeNo: '',
    firstNameAr: '',
    lastNameAr: '',
    firstNameEn: '',
    lastNameEn: '',
    nationalIdOrIqama: '',
    nationality: 'SAUDI',
    country: 'المملكة العربية السعودية',
    email: '',
    phone: '',
    department: 'تقنية المعلومات',
    jobTitle: '',
    costCenterId: company.costCenters[0]?.id || '',
    hireDate: '2026-01-01',
    salaryStartDate: '2026-01-01',
    status: 'ACTIVE',
    bankName: 'مصرف الراجحي',
    bankIban: 'SA',
    bankSwiftCode: 'RJHISARI',
    salaryPackage: {
      baseSalary: 6000,
      housingAllowance: 1500,
      transportAllowance: 600,
      otherFixedAllowances: 0,
      customAllowances: [],
      customDeductions: [],
    }
  });

  // Filtered List
  const companyEmployees = useMemo(() => {
    return employees.filter(e => e.companyId === company.id);
  }, [employees, company.id]);

  const filteredEmployees = useMemo(() => {
    return companyEmployees.filter(emp => {
      const matchesSearch = 
        emp.employeeNo.toLowerCase().includes(searchTerm.toLowerCase()) ||
        `${emp.firstNameAr} ${emp.lastNameAr}`.includes(searchTerm) ||
        emp.nationalIdOrIqama.includes(searchTerm) ||
        emp.bankIban.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (emp.bankSwiftCode && emp.bankSwiftCode.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (emp.bankName && emp.bankName.toLowerCase().includes(searchTerm.toLowerCase())) ||
        emp.jobTitle.includes(searchTerm);

      const matchesDept = selectedDept === 'ALL' || emp.department === selectedDept;
      const matchesStatus = selectedStatus === 'ALL' || emp.status === selectedStatus;
      const matchesNat = selectedNationality === 'ALL' || emp.nationality === selectedNationality;

      return matchesSearch && matchesDept && matchesStatus && matchesNat;
    });
  }, [companyEmployees, searchTerm, selectedDept, selectedStatus, selectedNationality]);

  // Departments list for filter
  const departments = useMemo(() => {
    return Array.from(new Set(companyEmployees.map(e => e.department)));
  }, [companyEmployees]);

  const handleOpenAdd = () => {
    const nextNum = companyEmployees.length + 1;
    const isComp1 = company.id === 'comp-1';
    setEditingEmployee(null);
    setFormData({
      companyId: company.id,
      employeeNo: `${isComp1 ? 'EMP' : 'LOG'}-${1000 + nextNum}`,
      firstNameAr: '',
      lastNameAr: '',
      firstNameEn: '',
      lastNameEn: '',
      nationalIdOrIqama: '10' + Math.floor(10000000 + Math.random() * 90000000),
      nationality: 'SAUDI',
      country: 'المملكة العربية السعودية',
      email: `emp${nextNum}@advtech.sa`,
      phone: '05' + Math.floor(10000000 + Math.random() * 90000000),
      department: departments[0] || 'الموارد البشرية',
      jobTitle: 'أخصائي شؤون إدارية',
      costCenterId: company.costCenters[0]?.id || '',
      hireDate: '2026-01-01',
      salaryStartDate: '2026-01-01',
      status: 'ACTIVE',
      bankName: 'مصرف الراجحي',
      bankIban: 'SA4480000' + Math.floor(100000000000 + Math.random() * 900000000000),
      bankSwiftCode: 'RJHISARI',
      salaryPackage: {
        baseSalary: 7000,
        housingAllowance: 1750,
        transportAllowance: 700,
        otherFixedAllowances: 0,
        customAllowances: [],
        customDeductions: [],
      }
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (emp: Employee) => {
    setEditingEmployee(emp);
    const empCopy = JSON.parse(JSON.stringify(emp));
    // Auto-detect swift code if not present
    if (!empCopy.bankSwiftCode && empCopy.bankIban) {
      const detected = detectBankFromIBAN(empCopy.bankIban);
      if (detected) {
        empCopy.bankSwiftCode = detected.swiftCode;
      } else if (empCopy.bankName) {
        empCopy.bankSwiftCode = getSwiftCodeFromBankName(empCopy.bankName);
      }
    }
    setFormData(empCopy);
    setIsModalOpen(true);
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.firstNameAr || !formData.lastNameAr || !formData.employeeNo) {
      alert('يرجى تعبئة الحقول الإلزامية');
      return;
    }

    // Standardize SWIFT code uppercase
    const processedForm = {
      ...formData,
      bankSwiftCode: formData.bankSwiftCode ? formData.bankSwiftCode.trim().toUpperCase() : ''
    };

    if (editingEmployee) {
      const updated = processedForm as Employee;
      if (onSaveEmployee) onSaveEmployee(updated);
      else if (onUpdateEmployee) onUpdateEmployee(updated);
    } else {
      const newEmp: Employee = {
        ...processedForm as Employee,
        id: `emp-${company.id}-${Date.now()}`,
      };
      if (onSaveEmployee) onSaveEmployee(newEmp);
      else if (onAddEmployee) onAddEmployee(newEmp);
    }
    setIsModalOpen(false);
  };

  // Export to CSV
  const handleExportCsv = () => {
    const headers = ['الرقم الوظيفي', 'الاسم بالعربي', 'الهوية/الإقامة', 'الجنسية', 'القسم', 'المسمى الوظيفي', 'تاريخ التعيين', 'الحالة', 'البنك', 'الآيبان IBAN', 'رمز السويفت SWIFT/BIC', 'الراتب الأساسي', 'بدل سكن', 'بدل نقل', 'إجمالي الراتب'];
    const rows = filteredEmployees.map(e => [
      `"${e.employeeNo}"`,
      `"${e.firstNameAr} ${e.lastNameAr}"`,
      `"${e.nationalIdOrIqama}"`,
      e.nationality === 'SAUDI' ? 'سعودي' : 'غير سعودي',
      `"${e.department}"`,
      `"${e.jobTitle}"`,
      `"${e.hireDate}"`,
      `"${e.status}"`,
      `"${e.bankName}"`,
      `"${e.bankIban}"`,
      `"${e.bankSwiftCode || ''}"`,
      e.salaryPackage.baseSalary.toFixed(2),
      e.salaryPackage.housingAllowance.toFixed(2),
      e.salaryPackage.transportAllowance.toFixed(2),
      (e.salaryPackage.baseSalary + e.salaryPackage.housingAllowance + e.salaryPackage.transportAllowance).toFixed(2),
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
    downloadCsvFile(`Employees_List_${company.nameEn || 'Company'}.csv`, csvContent);
  };

  return (
    <div className="space-y-6">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 flex items-center gap-2.5">
            <Users className="w-6 h-6 text-emerald-600" />
            <span>سجل الموظفين ومكونات الرواتب</span>
            <span className="text-xs px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 font-bold border border-slate-200">
              {filteredEmployees.length} من {companyEmployees.length} موظف
            </span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            إدارة بيانات الموظفين، الحسابات البنكية (IBAN)، سلم الرواتب والبدلات، وحالات تعليق الرواتب
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleExportCsv}
            className="px-3.5 py-2 bg-white text-slate-700 hover:bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <Download className="w-4 h-4 text-slate-500" />
            <span>تصدير Excel/CSV</span>
          </button>

          <button
            onClick={handleOpenAdd}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-2 cursor-pointer"
          >
            <UserPlus className="w-4 h-4" />
            <span>إضافة موظف جديد</span>
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        
        {/* Search */}
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute right-3 top-3" />
          <input
            type="text"
            placeholder="بحث بالاسم، الرقم الوظيفي، الهوية، الآيبان..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pr-9 pl-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
          />
        </div>

        {/* Dept Filter */}
        <div>
          <select
            value={selectedDept}
            onChange={(e) => setSelectedDept(e.target.value)}
            className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
          >
            <option value="ALL">جميع الأقسام ({departments.length})</option>
            {departments.map(d => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </div>

        {/* Nationality Filter */}
        <div>
          <select
            value={selectedNationality}
            onChange={(e) => setSelectedNationality(e.target.value)}
            className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
          >
            <option value="ALL">جميع الجنسيات (تأمينات GOSI)</option>
            <option value="SAUDI">سعودي (خاضع لنسبة التأمينات 9.75%/11.75%)</option>
            <option value="NON_SAUDI">غير سعودي (مخاطر مهنية 2%)</option>
          </select>
        </div>

        {/* Status Filter */}
        <div>
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
          >
            <option value="ALL">جميع الحالات الوظيفية</option>
            <option value="ACTIVE">على رأس العمل (نشط)</option>
            <option value="SUSPENDED">معلق الراتب (موقوف)</option>
            <option value="ON_LEAVE">في إجازة</option>
            <option value="TERMINATED">منتهي الخدمة</option>
          </select>
        </div>

      </div>

      {/* Employees Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden w-full">
        <table className="w-full text-right text-xs table-fixed divide-y divide-slate-100">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold text-[11px]">
              <th className="py-3 px-2.5 w-[16%] font-bold">الرقم والموظف</th>
              <th className="py-3 px-2 w-[11%] font-bold">الهوية / الإقامة</th>
              <th className="py-3 px-2 w-[13%] font-bold">القسم والمسمى</th>
              <th className="py-3 px-2 w-[10%] font-bold">الجنسية والتأمينات</th>
              <th className="py-3 px-2 w-[12%] font-bold">الحساب (IBAN)</th>
              <th className="py-3 px-2 w-[13%] font-bold">الأساسي والبدلات</th>
              <th className="py-3 px-2 w-[8%] font-bold">إجمالي الراتب</th>
              <th className="py-3 px-1.5 w-[7%] text-center font-bold">الحالة</th>
              <th className="py-3 px-2 w-[10%] text-center font-bold">الإجراءات</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {filteredEmployees.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-12 text-center text-slate-400">
                  لا توجد بيانات موظفين مطابقة لمعايير البحث
                </td>
              </tr>
            ) : (
              filteredEmployees.map((emp) => {
                const gross = 
                  emp.salaryPackage.baseSalary + 
                  emp.salaryPackage.housingAllowance + 
                  emp.salaryPackage.transportAllowance + 
                  (emp.salaryPackage.otherFixedAllowances || 0);

                const isSuspended = emp.status === 'SUSPENDED';

                return (
                  <tr key={emp.id} className="hover:bg-slate-50/80 transition-colors text-[11px]">
                    
                    {/* Name & Emp No */}
                    <td className="py-3 px-2.5 truncate">
                      <div className="font-bold text-slate-900 truncate">
                        {emp.firstNameAr} {emp.lastNameAr}
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono">
                        {emp.employeeNo}
                      </div>
                    </td>

                    {/* National ID / Iqama */}
                    <td className="py-3 px-2 font-mono text-slate-600 truncate">
                      {emp.nationalIdOrIqama}
                    </td>

                    {/* Dept & Job */}
                    <td className="py-3 px-2 truncate">
                      <div className="font-semibold text-slate-800 truncate">{emp.department}</div>
                      <div className="text-[10px] text-slate-500 truncate">{emp.jobTitle}</div>
                    </td>

                    {/* Nationality & GOSI */}
                    <td className="py-3 px-2 truncate">
                      {emp.nationality === 'SAUDI' ? (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-emerald-50 text-emerald-700 font-bold border border-emerald-200 text-[10px]">
                          <span>سعودي (GOSI)</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-700 font-medium text-[10px]">
                          <span>{emp.country}</span>
                        </span>
                      )}
                    </td>

                    {/* Bank & IBAN & SWIFT */}
                    <td className="py-3 px-2 truncate">
                      <div className="text-slate-800 font-medium truncate">{emp.bankName}</div>
                      <div className="text-[10px] text-slate-500 font-mono truncate" title={emp.bankIban}>
                        {emp.bankIban.slice(0, 6)}...{emp.bankIban.slice(-4)}
                      </div>
                      {emp.bankSwiftCode ? (
                        <div className="text-[9px] text-emerald-700 font-mono font-semibold truncate" title={`رمز السويفت: ${emp.bankSwiftCode}`}>
                          SWIFT: {emp.bankSwiftCode}
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
                        أساسي: {formatSAR(emp.salaryPackage.baseSalary)}
                      </div>
                      <div className="text-[9px] text-slate-500 whitespace-nowrap">
                        سكن: {formatSAR(emp.salaryPackage.housingAllowance)} | نقل: {formatSAR(emp.salaryPackage.transportAllowance)}
                      </div>
                    </td>

                    {/* Gross */}
                    <td className="py-3 px-2 font-black text-slate-900 whitespace-nowrap">
                      {formatSAR(gross)}
                    </td>

                    {/* Status */}
                    <td className="py-3 px-1.5 text-center">
                      {isSuspended ? (
                        <span className="px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[9px] font-bold border border-amber-200 block text-center" title={emp.suspensionReason}>
                          موقوف
                        </span>
                      ) : emp.status === 'ACTIVE' ? (
                        <span className="px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[9px] font-bold border border-emerald-200 block text-center">
                          نشط
                        </span>
                      ) : (
                        <span className="px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[9px] font-semibold block text-center">
                          {emp.status}
                        </span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="py-3 px-1.5 text-center">
                      <div className="flex items-center justify-center gap-1.5 whitespace-nowrap">
                        
                        {/* Payslip & Statement button */}
                        <button
                          onClick={() => handleStatement(emp)}
                          title="كشف حساب الموظف وقسيمة الراتب"
                          className="p-1 text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700 rounded-lg transition-colors cursor-pointer shrink-0"
                        >
                          <FileText className="w-3.5 h-3.5" />
                        </button>

                        {/* Edit */}
                        <button
                          onClick={() => handleOpenEdit(emp)}
                          title="تعديل بيانات الموظف والراتب"
                          className="p-1 text-slate-600 hover:bg-slate-100 hover:text-slate-900 rounded-lg transition-colors cursor-pointer shrink-0"
                        >
                          <Edit className="w-3.5 h-3.5" />
                        </button>

                        {/* Delete */}
                        <button
                          onClick={() => {
                            if (onDeleteEmployee) onDeleteEmployee(emp.id);
                          }}
                          title="حذف الموظف"
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


      {/* Add / Edit Employee Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-2xl w-full shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            
            {/* Modal Header */}
            <div className="bg-slate-900 text-white p-5 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-emerald-500/20 text-emerald-400 rounded-xl">
                  <UserPlus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base">
                    {editingEmployee ? 'تعديل بيانات الموظف وسلم الراتب' : 'إضافة موظف جديد للمنشأة'}
                  </h3>
                  <p className="text-xs text-slate-400">
                    المنشأة: {company.nameAr}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleFormSubmit} className="p-6 space-y-5 max-h-[80vh] overflow-y-auto">
              
              {/* Section 1: Basic Identity */}
              <div>
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span>البيانات الشخصية والهوية</span>
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">الرقم الوظيفي *</label>
                    <input
                      type="text"
                      required
                      value={formData.employeeNo || ''}
                      onChange={(e) => setFormData({ ...formData, employeeNo: e.target.value })}
                      className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-emerald-500/20"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">رقم الهوية الوطنية / الإقامة *</label>
                    <input
                      type="text"
                      required
                      value={formData.nationalIdOrIqama || ''}
                      onChange={(e) => setFormData({ ...formData, nationalIdOrIqama: e.target.value })}
                      className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-emerald-500/20"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">الاسم الأول (بالعربي) *</label>
                    <input
                      type="text"
                      required
                      value={formData.firstNameAr || ''}
                      onChange={(e) => setFormData({ ...formData, firstNameAr: e.target.value })}
                      className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-emerald-500/20"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">اسم العائلة (بالعربي) *</label>
                    <input
                      type="text"
                      required
                      value={formData.lastNameAr || ''}
                      onChange={(e) => setFormData({ ...formData, lastNameAr: e.target.value })}
                      className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-emerald-500/20"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">الجنسية *</label>
                    <select
                      value={formData.nationality || 'SAUDI'}
                      onChange={(e) => {
                        const isSa = e.target.value === 'SAUDI';
                        setFormData({ 
                          ...formData, 
                          nationality: e.target.value as NationalityType,
                          country: isSa ? 'المملكة العربية السعودية' : (formData.country === 'المملكة العربية السعودية' ? 'مصر' : formData.country)
                        });
                      }}
                      className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-emerald-500/20"
                    >
                      <option value="SAUDI">سعودي (خاضع لاشتراك التأمينات GOSI)</option>
                      <option value="NON_SAUDI">غير سعودي (مخاطر مهنية فقط)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">الدولة</label>
                    <input
                      type="text"
                      value={formData.country || ''}
                      onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                      className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-emerald-500/20"
                    />
                  </div>
                </div>
              </div>

              {/* Section 2: Job & Department */}
              <div className="pt-3 border-t border-slate-100">
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-blue-500" />
                  <span>بيانات الوظيفة والتعيين</span>
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">القسم *</label>
                    <input
                      type="text"
                      required
                      value={formData.department || ''}
                      onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                      className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">المسمى الوظيفي *</label>
                    <input
                      type="text"
                      required
                      value={formData.jobTitle || ''}
                      onChange={(e) => setFormData({ ...formData, jobTitle: e.target.value })}
                      className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">مركز التكلفة *</label>
                    <select
                      value={formData.costCenterId || ''}
                      onChange={(e) => setFormData({ ...formData, costCenterId: e.target.value })}
                      className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white"
                    >
                      {company.costCenters.map(cc => (
                        <option key={cc.id} value={cc.id}>{cc.code} - {cc.nameAr}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">تاريخ التعيين</label>
                    <input
                      type="date"
                      value={formData.hireDate || ''}
                      onChange={(e) => setFormData({ ...formData, hireDate: e.target.value })}
                      className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">بداية استحقاق الراتب</label>
                    <input
                      type="date"
                      value={formData.salaryStartDate || ''}
                      onChange={(e) => setFormData({ ...formData, salaryStartDate: e.target.value })}
                      className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">الحالة الوظيفية</label>
                    <select
                      value={formData.status || 'ACTIVE'}
                      onChange={(e) => setFormData({ ...formData, status: e.target.value as EmploymentStatus })}
                      className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white"
                    >
                      <option value="ACTIVE">على رأس العمل (Active)</option>
                      <option value="SUSPENDED">تعليق الراتب (Suspended)</option>
                      <option value="ON_LEAVE">إجازة (On Leave)</option>
                      <option value="TERMINATED">منتهي الخدمة (Terminated)</option>
                    </select>
                  </div>
                </div>

                {/* Suspension Details if Suspended */}
                {formData.status === 'SUSPENDED' && (
                  <div className="mt-3 p-3 bg-amber-50 rounded-xl border border-amber-200 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-bold text-amber-900 mb-1">سبب تعليق الراتب</label>
                      <input
                        type="text"
                        value={formData.suspensionReason || ''}
                        onChange={(e) => setFormData({ ...formData, suspensionReason: e.target.value })}
                        placeholder="مثال: إجازة استثنائية بدون راتب، تحقيق إداري..."
                        className="w-full px-3 py-1.5 text-xs bg-white border border-amber-300 rounded-lg"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Section 3: Bank, IBAN & SWIFT Code */}
              <div className="pt-3 border-t border-slate-100">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    <span>الحساب البنكي وحماية الأجور (WPS) وبيانات السويفت (SWIFT/BIC)</span>
                  </h4>
                  <span className="text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md font-semibold">
                    مطابق لمعايير البنك المركزي السعودي (SAMA)
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                  
                  {/* Bank Name */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs font-semibold text-slate-700">اسم البنك *</label>
                      <span className="text-[10px] text-slate-400">البنوك المعتمدة</span>
                    </div>
                    <select
                      value={formData.bankName || ''}
                      onChange={(e) => {
                        const newBank = e.target.value;
                        const detectedSwift = getSwiftCodeFromBankName(newBank);
                        setFormData({ 
                          ...formData, 
                          bankName: newBank,
                          bankSwiftCode: detectedSwift || formData.bankSwiftCode || ''
                        });
                      }}
                      className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-medium"
                    >
                      <option value="">-- اختر البنك --</option>
                      {Object.values(SAUDI_BANKS).map(b => (
                        <option key={b.code} value={b.nameAr}>
                          {b.nameAr} ({b.swiftCode})
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* IBAN */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs font-semibold text-slate-700">رقم الآيبان (IBAN) *</label>
                      {formData.bankIban && (
                        validateSaudiIBAN(formData.bankIban) ? (
                          <span className="text-[10px] text-emerald-600 font-bold flex items-center gap-0.5">
                            <CheckCircle className="w-3 h-3" /> آيبان صحيح
                          </span>
                        ) : (
                          <span className="text-[10px] text-amber-600 font-semibold flex items-center gap-0.5">
                            <AlertCircle className="w-3 h-3" /> آيبان غير مكتمل
                          </span>
                        )
                      )}
                    </div>
                    <input
                      type="text"
                      required
                      placeholder="SAXXXXXXXXXXXXXXXXXXXXXXXX"
                      value={formData.bankIban || ''}
                      onChange={(e) => {
                        const cleanIban = e.target.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
                        const detected = detectBankFromIBAN(cleanIban);
                        setFormData({ 
                          ...formData, 
                          bankIban: cleanIban,
                          bankName: detected ? detected.nameAr : formData.bankName,
                          bankSwiftCode: detected ? detected.swiftCode : formData.bankSwiftCode
                        });
                      }}
                      className={`w-full px-3 py-2 text-xs bg-slate-50 border rounded-xl focus:bg-white font-mono tracking-wider transition-all ${
                        formData.bankIban && validateSaudiIBAN(formData.bankIban)
                          ? 'border-emerald-300 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20'
                          : 'border-slate-200 focus:border-blue-500'
                      }`}
                      dir="ltr"
                    />
                  </div>

                  {/* SWIFT / BIC Code */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs font-semibold text-slate-700">رمز السويفت (SWIFT / BIC)</label>
                      <button
                        type="button"
                        onClick={() => {
                          let code = '';
                          if (formData.bankIban) {
                            const det = detectBankFromIBAN(formData.bankIban);
                            if (det) code = det.swiftCode;
                          }
                          if (!code && formData.bankName) {
                            code = getSwiftCodeFromBankName(formData.bankName);
                          }
                          if (code) {
                            setFormData({ ...formData, bankSwiftCode: code });
                          } else {
                            alert('يرجى تحديد اسم البنك أو إدخال رقم آيبان سعودي صالح ليتم التوليد التلقائي لرمز السويفت');
                          }
                        }}
                        className="text-[10px] text-emerald-700 hover:text-emerald-800 font-bold flex items-center gap-0.5 cursor-pointer"
                        title="توليد وتحديث رمز السويفت تلقائياً بناءً على البنك أو الآيبان"
                      >
                        <Sparkles className="w-2.5 h-2.5" />
                        <span>توليد تلقائي</span>
                      </button>
                    </div>

                    <div className="relative">
                      <input
                        type="text"
                        placeholder="مثال: RJHISARI أو NCBKSARI"
                        value={formData.bankSwiftCode || ''}
                        onChange={(e) => {
                          const swiftVal = e.target.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
                          setFormData({ ...formData, bankSwiftCode: swiftVal });
                        }}
                        className={`w-full px-3 py-2 text-xs bg-slate-50 border rounded-xl focus:bg-white font-mono tracking-wider transition-all uppercase ${
                          formData.bankSwiftCode && validateSwiftCode(formData.bankSwiftCode)
                            ? 'border-emerald-400 bg-emerald-50/20 text-emerald-900 focus:ring-2 focus:ring-emerald-500/20'
                            : formData.bankSwiftCode
                            ? 'border-amber-300 bg-amber-50/20 text-amber-900 focus:ring-2 focus:ring-amber-500/20'
                            : 'border-slate-200 focus:border-emerald-500'
                        }`}
                        dir="ltr"
                        maxLength={11}
                      />
                    </div>

                    {/* SWIFT Validation Badge / Help text */}
                    <div className="mt-1 flex items-center justify-between text-[10px]">
                      {formData.bankSwiftCode ? (
                        validateSwiftCode(formData.bankSwiftCode) ? (
                          <span className="text-emerald-700 font-semibold flex items-center gap-1">
                            <CheckCircle className="w-2.5 h-2.5" /> رمز سويفت قياسي معتمد (ISO 9362)
                          </span>
                        ) : (
                          <span className="text-amber-600 font-semibold flex items-center gap-1">
                            <AlertCircle className="w-2.5 h-2.5" /> الصيغة القياسية: 8 أو 11 حرفاً ورقم
                          </span>
                        )
                      ) : (
                        <span className="text-slate-400">
                          يتولد تلقائياً من رقم الآيبان والبنك
                        </span>
                      )}
                      <span className="text-slate-400 font-mono">
                        {(formData.bankSwiftCode || '').length}/11
                      </span>
                    </div>
                  </div>

                </div>
              </div>

              {/* Section 4: Salary Package */}
              <div className="pt-3 border-t border-slate-100">
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-indigo-500" />
                  <span>سلم الرواتب والبدلات الثابتة (بالريال السعودي)</span>
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3.5">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">الراتب الأساسي *</label>
                    <input
                      type="number"
                      required
                      min="0"
                      step="50"
                      value={formData.salaryPackage?.baseSalary ?? 0}
                      onChange={(e) => setFormData({
                        ...formData,
                        salaryPackage: {
                          ...formData.salaryPackage!,
                          baseSalary: parseFloat(e.target.value) || 0
                        }
                      })}
                      className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white font-bold text-slate-900"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">بدل السكن</label>
                    <input
                      type="number"
                      min="0"
                      step="50"
                      value={formData.salaryPackage?.housingAllowance ?? 0}
                      onChange={(e) => setFormData({
                        ...formData,
                        salaryPackage: {
                          ...formData.salaryPackage!,
                          housingAllowance: parseFloat(e.target.value) || 0
                        }
                      })}
                      className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">بدل النقل</label>
                    <input
                      type="number"
                      min="0"
                      step="50"
                      value={formData.salaryPackage?.transportAllowance ?? 0}
                      onChange={(e) => setFormData({
                        ...formData,
                        salaryPackage: {
                          ...formData.salaryPackage!,
                          transportAllowance: parseFloat(e.target.value) || 0
                        }
                      })}
                      className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">بدلات أخرى ثابتة</label>
                    <input
                      type="number"
                      min="0"
                      step="50"
                      value={formData.salaryPackage?.otherFixedAllowances ?? 0}
                      onChange={(e) => setFormData({
                        ...formData,
                        salaryPackage: {
                          ...formData.salaryPackage!,
                          otherFixedAllowances: parseFloat(e.target.value) || 0
                        }
                      })}
                      className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white"
                    />
                  </div>
                </div>

                {/* Total Gross Display */}
                <div className="mt-3 p-3 bg-emerald-50 rounded-xl border border-emerald-200 flex items-center justify-between">
                  <span className="text-xs font-bold text-emerald-900">إجمالي الراتب الشهري الثابت:</span>
                  <span className="text-sm font-extrabold text-emerald-800 font-mono">
                    {formatSAR(
                      (formData.salaryPackage?.baseSalary || 0) +
                      (formData.salaryPackage?.housingAllowance || 0) +
                      (formData.salaryPackage?.transportAllowance || 0) +
                      (formData.salaryPackage?.otherFixedAllowances || 0)
                    )}
                  </span>
                </div>
              </div>

              {/* Submit Buttons */}
              <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-md transition-all cursor-pointer"
                >
                  {editingEmployee ? 'حفظ التعديلات' : 'إضافة الموظف الآن'}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

    </div>
  );
};
