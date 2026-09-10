import React from 'react';
import { AlertCircle, Download, Search, Upload, UserPlus, Users } from 'lucide-react';

interface EmployeesToolbarProps {
  language: 'ar' | 'en';
  filteredCount: number;
  companyEmployeeCount: number;
  importInputRef: React.RefObject<HTMLInputElement | null>;
  isParsingImport: boolean;
  importError: string;
  searchTerm: string;
  selectedDept: string;
  selectedNationality: string;
  selectedStatus: string;
  departments: string[];
  onImportFile: (file?: File) => void;
  onExportCsv: () => void;
  onOpenAdd: () => void;
  setSearchTerm: React.Dispatch<React.SetStateAction<string>>;
  setSelectedDept: React.Dispatch<React.SetStateAction<string>>;
  setSelectedNationality: React.Dispatch<React.SetStateAction<string>>;
  setSelectedStatus: React.Dispatch<React.SetStateAction<string>>;
}

export const EmployeesToolbar = React.memo<EmployeesToolbarProps>(({
  language,
  filteredCount,
  companyEmployeeCount,
  importInputRef,
  isParsingImport,
  importError,
  searchTerm,
  selectedDept,
  selectedNationality,
  selectedStatus,
  departments,
  onImportFile: handleImportFile,
  onExportCsv: handleExportCsv,
  onOpenAdd: handleOpenAdd,
  setSearchTerm,
  setSelectedDept,
  setSelectedNationality,
  setSelectedStatus,
}) => (
  <>
      {/* Header */}
      <div data-no-translate className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 flex items-center gap-2.5">
            <Users className="w-6 h-6 text-emerald-600" />
            <span>{language === 'ar' ? 'سجل الموظفين ومكونات الرواتب' : 'Employee Register & Salary Components'}</span>
            <span className="text-xs px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 font-bold border border-slate-200">
              {language === 'ar' ? `${filteredCount} من ${companyEmployeeCount} موظف` : `${filteredCount} of ${companyEmployeeCount} employees`}
            </span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            {language === 'ar' ? 'إدارة بيانات الموظفين، الحسابات البنكية (IBAN)، سلم الرواتب والبدلات، وحالات تعليق الرواتب' : 'Manage employee records, bank accounts (IBAN), salaries, allowances, and payroll suspension statuses'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={importInputRef}
            type="file"
            accept=".xlsx,.csv,.tsv"
            className="hidden"
            onChange={(event) => handleImportFile(event.target.files?.[0])}
          />
          <button
            onClick={() => importInputRef.current?.click()}
            disabled={isParsingImport}
            className="px-3.5 py-2 bg-white text-emerald-700 hover:bg-emerald-50 border border-emerald-200 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <Upload className="w-4 h-4" />
            <span>{isParsingImport ? (language === 'ar' ? 'جاري قراءة الملف...' : 'Reading file...') : (language === 'ar' ? 'استيراد موظفين' : 'Import Employees')}</span>
          </button>

          <button
            onClick={handleExportCsv}
            className="px-3.5 py-2 bg-white text-slate-700 hover:bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <Download className="w-4 h-4 text-slate-500" />
            <span>{language === 'ar' ? 'تصدير Excel/CSV' : 'Export Excel/CSV'}</span>
          </button>

          <button
            onClick={handleOpenAdd}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-2 cursor-pointer"
          >
            <UserPlus className="w-4 h-4" />
            <span>{language === 'ar' ? 'إضافة موظف جديد' : 'Add Employee'}</span>
          </button>
        </div>
      </div>

      {importError && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-700 flex items-center gap-2">
          <AlertCircle className="w-4 h-4" /> {importError}
        </div>
      )}

      {/* Filter and Search Bar */}
      <div data-no-translate className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        
        {/* Search */}
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute right-3 top-3" />
          <input
            type="text"
            placeholder={language === 'ar' ? 'بحث بالاسم، الرقم الوظيفي، الهوية، الآيبان...' : 'Search by name, employee number, ID, or IBAN...'}
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
            <option value="ALL">{language === 'ar' ? `جميع الأقسام (${departments.length})` : `All departments (${departments.length})`}</option>
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
            <option value="ALL">{language === 'ar' ? 'جميع الجنسيات (تأمينات GOSI)' : 'All nationalities (GOSI)'}</option>
            <option value="SAUDI">{language === 'ar' ? 'سعودي (خاضع لنسبة التأمينات 9.75%/11.75%)' : 'Saudi (GOSI 9.75% / 11.75%)'}</option>
            <option value="NON_SAUDI">{language === 'ar' ? 'غير سعودي (مخاطر مهنية 2%)' : 'Non-Saudi (2% occupational hazard)'}</option>
          </select>
        </div>

        {/* Status Filter */}
        <div>
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
          >
            <option value="ALL">{language === 'ar' ? 'جميع الحالات الوظيفية' : 'All employment statuses'}</option>
            <option value="ACTIVE">{language === 'ar' ? 'على رأس العمل (نشط)' : 'Active'}</option>
            <option value="SUSPENDED">{language === 'ar' ? 'تعليق الصرف مع استمرار الاستحقاق' : 'Payment held — entitlement continues'}</option>
            <option value="ON_LEAVE">{language === 'ar' ? 'في إجازة' : 'On leave'}</option>
            <option value="TERMINATED">{language === 'ar' ? 'منتهي الخدمة' : 'Terminated'}</option>
            <option value="ABSCONDED">{language === 'ar' ? 'العمالة الهاربة' : 'Absconded workers'}</option>
          </select>
        </div>

      </div>
  </>
));

EmployeesToolbar.displayName = 'EmployeesToolbar';

