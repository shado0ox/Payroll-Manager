import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Code,
  Copy,
  Eye,
  EyeOff,
  FileSpreadsheet,
  Globe,
  Key,
  RefreshCw,
  Save,
  Send,
  Sparkles,
  Terminal,
} from 'lucide-react';
import type { Company, PayrollRun, QoyodApiConfig } from '../../types';
import { generatePayrollJournalBatch } from '../../utils/accountingEngine';
import { exportQoyodJournalCsv } from '../../utils/exportUtils';
import { buildQoyodJournalPayload, generateQoyodCurlCommand, sendJournalEntryToQoyod } from '../../utils/qoyodApi';

interface CompanyQoyodTabProps {
  formData: Company;
  employeesCount: number;
  language: 'ar' | 'en';
  qoyodConfig?: QoyodApiConfig;
  onSaveQoyodConfig?: (config: QoyodApiConfig) => Promise<boolean | void> | boolean | void;
  onOpenQoyodModal?: () => void;
  onSuccess: (message: string) => void;
  tr: (ar: string, en: string) => string;
}

export const CompanyQoyodTab = React.memo<CompanyQoyodTabProps>(({
  formData,
  employeesCount,
  language,
  qoyodConfig,
  onSaveQoyodConfig,
  onOpenQoyodModal,
  onSuccess,
  tr,
}) => {
  const [qConfig, setQConfig] = useState<QoyodApiConfig>(() => qoyodConfig || {
    apiKey: '',
    baseUrl: 'https://api.qoyod.com/2.0',
    organizationId: '',
    autoSyncOnApprove: false,
  });
  const [showApiKey, setShowApiKey] = useState(false);
  const [isTestingQoyod, setIsTestingQoyod] = useState(false);
  const [qoyodTestResult, setQoyodTestResult] = useState<{ status: 'SUCCESS' | 'FAILED'; message: string } | null>(null);
  const [isSyncingQoyod, setIsSyncingQoyod] = useState(false);
  const [qoyodSyncSuccess, setQoyodSyncSuccess] = useState<string | null>(null);
  const [copiedCurl, setCopiedCurl] = useState(false);
  const [copiedJson, setCopiedJson] = useState(false);
  const [qoyodViewMode, setQoyodViewMode] = useState<'config' | 'payload' | 'curl'>('config');

  useEffect(() => {
    if (qoyodConfig) setQConfig(qoyodConfig);
  }, [qoyodConfig]);

// Generate a sample batch or current company batch for live payload preview
const dummyRun: PayrollRun = {
  id: 'run-sample',
  companyId: formData.id,
  periodMonth: new Date().toISOString().substring(0, 7),
  startDate: `${new Date().toISOString().substring(0, 7)}-01`,
  endDate: `${new Date().toISOString().substring(0, 7)}-28`,
  status: 'DRAFT',
  employeesCount: employeesCount || 12,
  totalBaseSalaries: 145000,
  totalAllowances: 60750,
  totalOvertime: 7500,
  totalGrossSalaries: 213250,
  totalAbsenceDeductions: 1500,
  totalDelayDeductions: 500,
  totalGosiEmployee: 14625,
  totalGosiEmployer: 19875,
  totalLoanDeductions: 8000,
  totalPenalties: 0,
  totalDeductions: 24625,
  totalNetSalaries: 188625,
  totalCompanyCost: 233125,
  items: [
    {
      id: 'sample-item-1',
      payrollRunId: 'run-sample',
      employeeId: 'emp-sample-1',
      employeeNo: 'EMP-001',
      employeeName: 'نموذج موظف إداري',
      department: 'الإدارة العامة',
      costCenterId: formData.costCenters?.[0]?.id || 'CC-DEFAULT',
      nationality: 'SAUDI',
      bankIban: formData.bankIban || 'SA0000000000000000000000',
      bankName: formData.bankName || 'البنك الأهلي السعودي',
      baseSalary: 145000,
      housingAllowance: 36250,
      transportAllowance: 14500,
      otherAllowances: 10000,
      overtimeAmount: 7500,
      overtimeHours: 20,
      bonuses: 0,
      totalGrossSalary: 213250,
      delayMinutes: 0,
      delayDeduction: 500,
      absenceDays: 0,
      absenceDeduction: 1500,
      unpaidLeaveDays: 0,
      unpaidLeaveDeduction: 0,
      gosiEmployeeShare: 14625,
      loanDeduction: 8000,
      penaltiesDeduction: 0,
      otherDeductions: 0,
      totalDeductions: 24625,
      netSalary: 188625,
      gosiEmployerShare: 19875,
      totalCompanyBurden: 233125,
      isSuspended: false,
      warningFlags: [],
    }
  ],
  createdAt: new Date().toISOString(),
  calculatedAt: new Date().toISOString(),
};

const sampleBatch = generatePayrollJournalBatch(formData, dummyRun);
const qoyodPayload = buildQoyodJournalPayload(sampleBatch, formData);
const qoyodCurl = generateQoyodCurlCommand(qoyodPayload, qConfig.apiKey, qConfig.baseUrl);

const handleSaveQoyodSettings = async (e?: React.FormEvent) => {
  if (e) e.preventDefault();
  if (onSaveQoyodConfig) {
    const saved = await onSaveQoyodConfig(qConfig);
    if (saved === false) return;
  }
  onSuccess(tr('تم حفظ إعدادات وتكوين الربط مع قيود (Qoyod API 2.0) بنجاح', 'Qoyod API 2.0 integration settings were saved successfully.'));
};

const handleTestQoyodConnection = () => {
  setIsTestingQoyod(true);
  setQoyodTestResult(null);
  setTimeout(() => {
    setIsTestingQoyod(false);
    if (qConfig.apiKey && qConfig.apiKey.trim().length > 6) {
      setQoyodTestResult({
        status: 'SUCCESS',
        message: tr(`صيغة مفتاح API-KEY والإعدادات مكتملة لمنشأة: ${formData.nameAr}. استخدم الترحيل التجريبي للتحقق الفعلي من الخادم.`, `The API key format and settings are complete for ${formData.nameEn || formData.nameAr}. Use the test journal action to verify the server connection.`),
      });
      const updatedConfig = { ...qConfig, lastTestStatus: 'SUCCESS' as const, lastTestMessage: tr('الإعدادات مكتملة', 'Settings complete') };
      setQConfig(updatedConfig);
      if (onSaveQoyodConfig) void onSaveQoyodConfig(updatedConfig);
    } else {
      setQoyodTestResult({
        status: 'FAILED',
        message: tr('يرجى إدخال مفتاح API-KEY الصحيح المستخرج من لوحة تحكم قيود (الإعدادات > مفاتيح الـ API)', 'Enter a valid API-KEY from Qoyod Dashboard > Settings > API Keys.'),
      });
    }
  }, 600);
};

const handleDirectSync = async () => {
  if ((!qConfig.apiKey || qConfig.apiKey.trim().length < 5) && !qConfig.apiKeyConfigured) {
    alert(tr('يرجى حفظ وإدخال مفتاح API-KEY أولاً', 'Enter and save the API-KEY first.'));
    return;
  }

  setIsSyncingQoyod(true);
  setQoyodSyncSuccess(null);
  try {
    const res = await sendJournalEntryToQoyod(sampleBatch, formData, qConfig);
    setIsSyncingQoyod(false);
    if (res.success) {
      setQoyodSyncSuccess(res.message);
    } else {
      alert(res.message);
    }
  } catch (err: any) {
    setIsSyncingQoyod(false);
    alert(`${tr('خطأ أثناء الاتصال بخادم قيود', 'Error connecting to Qoyod')}: ${err.message || err}`);
  }
};

return (
  <div data-no-translate className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-sm space-y-6">
    
    {/* Header Banner */}
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-100 pb-4">
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-2xl bg-sky-50 text-sky-600 flex items-center justify-center border border-sky-200 shrink-0">
          <Sparkles className="w-6 h-6" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-bold text-slate-900">
              {tr('تكامل نظام قيود المحاسبي (Qoyod API 2.0)', 'Qoyod Accounting Integration (API 2.0)')}
            </h3>
            <span className="px-2 py-0.5 rounded-md bg-sky-100 text-sky-800 font-mono text-[10px] font-bold">
              POST /2.0/journal_entries
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            {tr('الربط الآلي المباشر لترحيل قيود الرواتب والبدلات والاستقطاعات لشجرة حسابات قيود لمنشأة', 'Direct integration for posting payroll, allowances and deductions to Qoyod for')} {language === 'ar' ? formData.nameAr : (formData.nameEn || formData.nameAr)}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {onOpenQoyodModal && (
          <button
            type="button"
            onClick={onOpenQoyodModal}
            className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5"
          >
            <Globe className="w-3.5 h-3.5" />
            <span>{tr('نافذة الترحيل السريع', 'Quick posting')}</span>
          </button>
        )}
        <button
          type="button"
          onClick={() => exportQoyodJournalCsv(sampleBatch, formData)}
          className="px-3.5 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5"
        >
          <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
          <span>{tr('تصدير قيد CSV لقيود', 'Export Qoyod journal CSV')}</span>
        </button>
      </div>
    </div>

    {/* Test or Sync Alert */}
    {qoyodTestResult && (
      <div className={`p-4 rounded-2xl border flex items-start gap-3 ${
        qoyodTestResult.status === 'SUCCESS'
          ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
          : 'bg-rose-50 text-rose-900 border-rose-200'
      }`}>
        {qoyodTestResult.status === 'SUCCESS' ? (
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
        ) : (
          <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
        )}
        <div className="text-xs font-bold leading-relaxed">
          {qoyodTestResult.message}
        </div>
      </div>
    )}

    {qoyodSyncSuccess && (
      <div className="p-4 rounded-2xl bg-sky-50 text-sky-900 border border-sky-200 flex items-start gap-3 font-bold text-xs">
        <CheckCircle2 className="w-5 h-5 text-sky-600 shrink-0 mt-0.5" />
        <div className="leading-relaxed">{qoyodSyncSuccess}</div>
      </div>
    )}

    {/* Mode Switcher */}
    <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
      <button
        type="button"
        onClick={() => setQoyodViewMode('config')}
        className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
          qoyodViewMode === 'config'
            ? 'bg-slate-900 text-white'
            : 'text-slate-600 hover:bg-slate-100'
        }`}
      >
        {tr('إعدادات الـ API والمفتاح', 'API Settings')}
      </button>

      <button
        type="button"
        onClick={() => setQoyodViewMode('payload')}
        className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
          qoyodViewMode === 'payload'
            ? 'bg-slate-900 text-white'
            : 'text-slate-600 hover:bg-slate-100'
        }`}
      >
        <Code className="w-3.5 h-3.5 text-emerald-500" />
        <span>{tr('حزمة البيانات المعتمدة (JSON Payload)', 'Journal payload (JSON)')}</span>
      </button>

      <button
        type="button"
        onClick={() => setQoyodViewMode('curl')}
        className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
          qoyodViewMode === 'curl'
            ? 'bg-slate-900 text-white'
            : 'text-slate-600 hover:bg-slate-100'
        }`}
      >
        <Terminal className="w-3.5 h-3.5 text-purple-400" />
        <span>{tr('أمر cURL الجاهز', 'Generated cURL')}</span>
      </button>
    </div>

    {/* View 1: Configuration Form */}
    {qoyodViewMode === 'config' && (
      <form onSubmit={handleSaveQoyodSettings} className="space-y-4">
        
        {/* Endpoint Display */}
        <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <span className="text-[11px] font-bold text-slate-500 block">{tr('نقطة النهاية الرسمية لبرنامج قيود (API Endpoint):', 'Official Qoyod API endpoint:')}</span>
            <span className="font-mono text-xs font-bold text-slate-900" dir="ltr">
              POST https://api.qoyod.com/2.0/journal_entries
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px] font-mono font-bold">
              Header: API-KEY
            </span>
            <span className="px-2 py-0.5 rounded bg-sky-100 text-sky-800 text-[10px] font-mono font-bold">
              Header: Content-Type: application/json
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* API KEY */}
          <div className="md:col-span-2">
            <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Key className="w-3.5 h-3.5 text-slate-500" />
                <span>{tr('مفتاح API الخاص بحساب المنشأة في قيود (API-KEY) *', 'Company Qoyod API-KEY *')}</span>
              </span>
              <span className="text-[10px] text-slate-400 font-normal">{tr('من لوحة تحكم قيود > الإعدادات > مفاتيح API', 'Qoyod Dashboard > Settings > API Keys')}</span>
            </label>
            <div className="relative flex items-center">
              <input
                type={showApiKey ? 'text' : 'password'}
                value={qConfig.apiKey || ''}
                onChange={(e) => setQConfig({ ...qConfig, apiKey: e.target.value })}
                placeholder={tr('أدخل مفتاح API-KEY هنا', 'Enter the API-KEY here')}
                className="w-full pl-10 pr-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-bold"
              />
              <button
                type="button"
                onClick={() => setShowApiKey(!showApiKey)}
                className="absolute left-2.5 text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
                title={showApiKey ? tr('إخفاء', 'Hide') : tr('إظهار', 'Show')}
              >
                {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Base URL */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">{tr('رابط خادم قيود (Base URL)', 'Qoyod Base URL')}</label>
            <input
              type="text"
              value={qConfig.baseUrl || 'https://api.qoyod.com/2.0'}
              onChange={(e) => setQConfig({ ...qConfig, baseUrl: e.target.value })}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono text-xs focus:bg-white text-slate-800 font-bold"
              dir="ltr"
            />
          </div>

          {/* Organization ID */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">{tr('معرف المنشأة في قيود (Organization ID)', 'Qoyod Organization ID')}</label>
            <input
              type="text"
              value={qConfig.organizationId || ''}
              onChange={(e) => setQConfig({ ...qConfig, organizationId: e.target.value })}
              placeholder={tr('اختياري', 'Optional')}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono text-xs focus:bg-white text-slate-800"
            />
          </div>
        </div>

        {/* Auto Sync Toggle */}
        <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 flex items-center justify-between">
          <div>
            <div className="text-xs font-bold text-slate-900">{tr('المزامنة التلقائية عند اعتماد مسير الرواتب', 'Automatically sync approved payroll')}</div>
            <div className="text-[11px] text-slate-500 mt-0.5">{tr('ترحيل قيد اليومية آلياً إلى قيود فور اعتماد المسير الشهري من قبل المعتمدين', 'Post the payroll journal to Qoyod automatically after authorized approval')}</div>
          </div>
          <input
            type="checkbox"
            checked={qConfig.autoSyncOnApprove || false}
            onChange={(e) => setQConfig({ ...qConfig, autoSyncOnApprove: e.target.checked })}
            className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer"
          />
        </div>

        {/* Actions */}
        <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleTestQoyodConnection}
              disabled={isTestingQoyod}
              className="px-4 py-2.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-xs"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isTestingQoyod ? 'animate-spin' : ''}`} />
              <span>{isTestingQoyod ? tr('جاري الفحص...', 'Validating...') : tr('فحص اكتمال الإعدادات', 'Validate settings')}</span>
            </button>

            <button
              type="button"
              onClick={handleDirectSync}
              disabled={isSyncingQoyod}
              className="px-4 py-2.5 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-md cursor-pointer"
            >
              <Send className={`w-3.5 h-3.5 ${isSyncingQoyod ? 'animate-spin' : ''}`} />
              <span>{isSyncingQoyod ? tr('جاري الترحيل...', 'Posting...') : tr('ترحيل قيد تجريبي للتحقق الفعلي', 'Post test journal to verify connection')}</span>
            </button>
          </div>

          <button
            type="submit"
            className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md transition-all cursor-pointer flex items-center gap-2"
          >
            <Save className="w-4 h-4" />
            <span>{tr('حفظ إعدادات قيود للمنشأة', 'Save Qoyod settings')}</span>
          </button>
        </div>

      </form>
    )}

    {/* View 2: JSON Payload */}
    {qoyodViewMode === 'payload' && (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-xs text-slate-600 font-bold">
            {tr('حزمة بيانات قيد الرواتب المطابقة لتوثيق قيود 2.0 (Payload):', 'Payroll journal payload for Qoyod API 2.0:')}
          </div>
          <button
            type="button"
            onClick={() => {
              navigator.clipboard.writeText(JSON.stringify(qoyodPayload, null, 2));
              setCopiedJson(true);
              setTimeout(() => setCopiedJson(false), 2000);
            }}
            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer"
          >
            {copiedJson ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copiedJson ? tr('تم النسخ', 'Copied') : tr('نسخ كود JSON', 'Copy JSON')}</span>
          </button>
        </div>

        <pre className="bg-slate-900 text-emerald-400 p-4 rounded-2xl text-[11px] font-mono overflow-x-auto max-h-80 border border-slate-800 leading-relaxed" dir="ltr">
          {JSON.stringify(qoyodPayload, null, 2)}
        </pre>
      </div>
    )}

    {/* View 3: cURL Command */}
    {qoyodViewMode === 'curl' && (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-xs text-slate-600 font-bold">
            {tr('أمر cURL الجاهز للتشغيل في Terminal أو Postman:', 'Generated cURL command for Terminal or Postman:')}
          </div>
          <button
            type="button"
            onClick={() => {
              navigator.clipboard.writeText(qoyodCurl);
              setCopiedCurl(true);
              setTimeout(() => setCopiedCurl(false), 2000);
            }}
            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer"
          >
            {copiedCurl ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copiedCurl ? tr('تم النسخ', 'Copied') : tr('نسخ أمر cURL', 'Copy cURL')}</span>
          </button>
        </div>

        <pre className="bg-slate-900 text-purple-300 p-4 rounded-2xl text-[11px] font-mono overflow-x-auto max-h-80 border border-slate-800 leading-relaxed whitespace-pre" dir="ltr">
          {qoyodCurl}
        </pre>
      </div>
    )}

  </div>
);
});
