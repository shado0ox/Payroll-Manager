import React, { useState } from 'react';
import { 
  X, 
  Sparkles, 
  CheckCircle2, 
  AlertCircle, 
  Layers, 
  Key, 
  Globe, 
  RefreshCw, 
  Send, 
  FileSpreadsheet,
  Code,
  Eye,
  EyeOff,
  Copy,
  Check,
  Terminal,
  ArrowRight,
  Receipt,
  FileCode
} from 'lucide-react';
import { Company, PayrollRun, QoyodApiConfig, JournalBatch, QoyodJournalEntryResponse } from '../types';
import { generatePayrollJournalBatch } from '../utils/accountingEngine';
import { exportQoyodJournalCsv } from '../utils/exportUtils';
import { buildQoyodJournalPayload, generateQoyodCurlCommand, sendJournalEntryToQoyod } from '../utils/qoyodApi';
import { useLanguage } from '../i18n/LanguageContext';

interface QoyodIntegrationModalProps {
  company: Company;
  latestRun: PayrollRun | undefined;
  qoyodConfig: QoyodApiConfig;
  onSaveConfig: (config: QoyodApiConfig) => void;
  onClose: () => void;
}

export const QoyodIntegrationModal: React.FC<QoyodIntegrationModalProps> = ({
  company,
  latestRun,
  qoyodConfig,
  onSaveConfig,
  onClose,
}) => {
  const { language } = useLanguage();
  const tr = (ar: string, en: string) => language === 'ar' ? ar : en;
  const [config, setConfig] = useState<QoyodApiConfig>({
    ...qoyodConfig,
    baseUrl: qoyodConfig.baseUrl || 'https://api.qoyod.com/2.0',
  });
  const [showApiKey, setShowApiKey] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ status: 'SUCCESS' | 'FAILED'; message: string } | null>(
    qoyodConfig.lastTestStatus ? { status: qoyodConfig.lastTestStatus, message: qoyodConfig.lastTestMessage || '' } : null
  );
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncSuccess, setSyncSuccess] = useState<string | null>(null);
  const [lastResponse, setLastResponse] = useState<QoyodJournalEntryResponse | null>(null);
  const [copiedCurl, setCopiedCurl] = useState(false);
  const [copiedJson, setCopiedJson] = useState(false);
  const [activeViewTab, setActiveViewTab] = useState<'config' | 'curl' | 'payload' | 'response'>('config');

  const activeBatch: JournalBatch | null = latestRun ? generatePayrollJournalBatch(company, latestRun) : null;
  const currentPayload = activeBatch ? buildQoyodJournalPayload(activeBatch, company) : null;
  const currentCurl = currentPayload ? generateQoyodCurlCommand(currentPayload, config.apiKey, config.baseUrl) : '';

  // Test Qoyod API Endpoint
  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);

    // Simulate endpoint test or ping
    setTimeout(() => {
      setIsTesting(false);
      if (config.apiKey && config.apiKey.trim().length > 6) {
        setTestResult({
          status: 'SUCCESS',
          message: `${tr('تم التحقق من اكتمال إعدادات الربط لمنشأة', 'Integration settings are complete for')} (${language === 'ar' ? company.nameAr : company.nameEn || company.nameAr})`,
        });
        setConfig(prev => ({
          ...prev,
          lastTestStatus: 'SUCCESS',
          lastTestMessage: tr('الإعدادات مكتملة', 'Settings are complete'),
        }));
      } else {
        setTestResult({
          status: 'FAILED',
          message: tr('يرجى إدخال مفتاح API-KEY الصحيح من لوحة تحكم قيود (الإعدادات > مفاتيح الـ API)', 'Enter a valid API-KEY from Qoyod Dashboard > Settings > API Keys.'),
        });
      }
    }, 600);
  };

  // Sync current batch via Qoyod API 2.0
  const handleSyncToQoyod = async () => {
    if (!activeBatch) {
      alert(tr('لا يوجد مسير رواتب معتمد للترحيل', 'There is no approved payroll run to post.'));
      return;
    }

    if ((!config.apiKey || config.apiKey.trim().length < 5) && !config.apiKeyConfigured) {
      alert(tr('يرجى إدخال مفتاح الـ API-KEY الخاص بقيود أولاً', 'Enter your Qoyod API-KEY first.'));
      return;
    }

    setIsSyncing(true);
    setSyncSuccess(null);

    try {
      const res = await sendJournalEntryToQoyod(activeBatch, company, config);
      setIsSyncing(false);
      if (res.success) {
        setSyncSuccess(res.message);
        if (res.responseData) {
          setLastResponse(res.responseData);
          setActiveViewTab('response');
        }
      } else {
        alert(res.message);
      }
    } catch (e: any) {
      setIsSyncing(false);
      alert(`${tr('حدث خطأ أثناء الاتصال بخادم قيود:', 'Qoyod connection error:')} ${e.message || e}`);
    }
  };

  const handleCopyCurl = () => {
    navigator.clipboard.writeText(currentCurl);
    setCopiedCurl(true);
    setTimeout(() => setCopiedCurl(false), 2000);
  };

  const handleCopyJson = () => {
    if (currentPayload) {
      navigator.clipboard.writeText(JSON.stringify(currentPayload, null, 2));
      setCopiedJson(true);
      setTimeout(() => setCopiedJson(false), 2000);
    }
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveConfig(config);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl max-w-3xl w-full shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        
        {/* Top Header */}
        <div className="bg-slate-900 text-white p-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-sky-500/20 text-sky-400 rounded-2xl border border-sky-400/20">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-base">
                  {tr('تكامل نظام قيود المحاسبي', 'Qoyod Accounting Integration')} (API 2.0)
                </h3>
                <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-sky-400/20 text-sky-300 border border-sky-400/30">
                  v2.0 journal_entries
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                {tr('ترحيل قيود الرواتب تلقائياً وفق هيكل البيانات المعتمد لبرنامج قيود', 'Post payroll journals using the Qoyod API data structure.')}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-xl transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Tabs Inside Modal */}
        <div className="flex items-center gap-2 px-6 pt-4 border-b border-slate-100 bg-slate-50/50">
          <button
            type="button"
            onClick={() => setActiveViewTab('config')}
            className={`px-3.5 py-2 text-xs font-bold rounded-t-xl transition-all cursor-pointer ${
              activeViewTab === 'config'
                ? 'bg-white text-slate-900 border-t-2 border-emerald-600 shadow-xs'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            {tr('إعدادات الربط والـ API-KEY', 'Connection & API-KEY Settings')}
          </button>

          <button
            type="button"
            onClick={() => setActiveViewTab('payload')}
            className={`px-3.5 py-2 text-xs font-bold rounded-t-xl transition-all cursor-pointer flex items-center gap-1.5 ${
              activeViewTab === 'payload'
                ? 'bg-white text-slate-900 border-t-2 border-emerald-600 shadow-xs'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            <Code className="w-3.5 h-3.5 text-sky-600" />
            <span>{tr('حزمة البيانات (JSON Payload)', 'JSON Payload')}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveViewTab('curl')}
            className={`px-3.5 py-2 text-xs font-bold rounded-t-xl transition-all cursor-pointer flex items-center gap-1.5 ${
              activeViewTab === 'curl'
                ? 'bg-white text-slate-900 border-t-2 border-emerald-600 shadow-xs'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            <Terminal className="w-3.5 h-3.5 text-purple-600" />
            <span>{tr('كود cURL المباشر', 'Direct cURL Command')}</span>
          </button>

          {lastResponse && (
            <button
              type="button"
              onClick={() => setActiveViewTab('response')}
              className={`px-3.5 py-2 text-xs font-bold rounded-t-xl transition-all cursor-pointer flex items-center gap-1.5 ${
                activeViewTab === 'response'
                  ? 'bg-white text-emerald-700 border-t-2 border-emerald-600 shadow-xs'
                  : 'text-emerald-600 hover:text-emerald-800'
              }`}
            >
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              <span>{tr('استجابة خادم قيود', 'Qoyod Server Response')} #{lastResponse.id}</span>
            </button>
          )}
        </div>

        {/* Modal Form / Content */}
        <form onSubmit={handleSave} className="p-6 space-y-5 text-xs max-h-[75vh] overflow-y-auto">
          
          {/* Status Alert */}
          {testResult && (
            <div className={`p-3.5 rounded-2xl border flex items-start gap-2.5 ${
              testResult.status === 'SUCCESS'
                ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
                : 'bg-rose-50 text-rose-900 border-rose-200'
            }`}>
              {testResult.status === 'SUCCESS' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-600 mt-0.5 shrink-0" />
              )}
              <div className="font-semibold leading-relaxed">{testResult.message}</div>
            </div>
          )}

          {/* Sync Success Alert */}
          {syncSuccess && (
            <div className="p-3.5 rounded-2xl bg-emerald-50 text-emerald-900 border border-emerald-200 flex items-start gap-2.5 font-bold">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
              <div className="space-y-1">
                <div>{syncSuccess}</div>
                {lastResponse && (
                  <div className="text-[11px] font-mono text-emerald-700 font-normal">
                    Qoyod Entry ID: #{lastResponse.id} | Total Debit: {Number(lastResponse.total_debit || 0).toLocaleString('en-US')} SR | Total Credit: {Number(lastResponse.total_credit || 0).toLocaleString('en-US')} SR
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 1: Config Fields */}
          {activeViewTab === 'config' && (
            <div className="space-y-4">
              
              {/* Endpoint Banner */}
              <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 flex items-center justify-between">
                <div>
                  <div className="font-bold text-slate-800 flex items-center gap-1.5">
                    <Globe className="w-4 h-4 text-sky-600" />
                    <span>{tr('رابط نقطة النهاية المعتمد', 'Qoyod API 2.0 Endpoint')}</span>
                  </div>
                  <div className="font-mono text-[11px] text-slate-500 mt-0.5">
                    POST https://api.qoyod.com/2.0/journal_entries
                  </div>
                </div>
                <span className="px-2 py-1 rounded bg-sky-100 text-sky-800 font-mono text-[10px] font-bold">
                  API-KEY Header
                </span>
              </div>

              {/* API-KEY */}
              <div>
                <label className="block font-bold text-slate-700 mb-1 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Key className="w-3.5 h-3.5 text-slate-500" />
                    <span>{tr('مفتاح API الخاص بحساب قيود', 'Qoyod Account API Key')} (API-KEY) *</span>
                  </span>
                  <span className="text-[10px] text-slate-400 font-normal">{tr('يتم إرساله كـ Header: API-KEY', 'Sent as the API-KEY request header')}</span>
                </label>
                <div className="relative flex items-center">
                  <input
                    type={showApiKey ? 'text' : 'password'}
                    required
                    value={config.apiKey}
                    onChange={(e) => setConfig({ ...config, apiKey: e.target.value })}
                    placeholder={tr('مثال: 9a78f2bc904845b4b76e271...', 'Example: 9a78f2bc904845b4b76e271...')}
                    className="w-full pl-10 pr-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowApiKey(!showApiKey)}
                    className="absolute left-2.5 text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
                    title={showApiKey ? tr('إخفاء المفتاح', 'Hide Key') : tr('إظهار المفتاح', 'Show Key')}
                  >
                    {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">{tr('عنوان خادم قيود', 'Qoyod Base URL')}</label>
                  <input
                    type="text"
                    value={config.baseUrl}
                    onChange={(e) => setConfig({ ...config, baseUrl: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono text-xs focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">{tr('معرف المنشأة في قيود', 'Qoyod Organization ID')}</label>
                  <input
                    type="text"
                    value={config.organizationId}
                    onChange={(e) => setConfig({ ...config, organizationId: e.target.value })}
                    placeholder={tr('اختياري', 'Optional')}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono text-xs focus:bg-white"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between bg-slate-50 p-3.5 rounded-2xl border border-slate-200">
                <div>
                  <div className="font-bold text-slate-800">{tr('المزامنة التلقائية عند اعتماد المسير', 'Automatic Sync on Payroll Approval')}</div>
                  <div className="text-[11px] text-slate-500">{tr('ترحيل قيد اليومية تلقائياً لبرنامج قيود فور اعتماد مسير الرواتب', 'Post the journal to Qoyod automatically when the payroll run is approved.')}</div>
                </div>
                <input
                  type="checkbox"
                  checked={config.autoSyncOnApprove}
                  onChange={(e) => setConfig({ ...config, autoSyncOnApprove: e.target.checked })}
                  className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                />
              </div>

              {/* Action Bar */}
              <div className="p-4 bg-sky-50/70 rounded-2xl border border-sky-100 flex flex-wrap items-center justify-between gap-3">
                <div className="text-slate-700">
                  <span className="font-bold block">{tr('إجراءات المزامنة والترحيل المباشر:', 'Synchronization and direct posting:')}</span>
                  <span className="text-[11px] text-slate-500">
                    {tr('القيد المستهدف:', 'Target journal:')} {activeBatch?.batchNumber || tr('لا يوجد قيد', 'No journal')} ({activeBatch?.lines.length || 0} {tr('أسطر محاسبية - إجمالي:', 'lines - total:')} {(activeBatch?.totalDebit || 0).toLocaleString('en-US')} SR)
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleTestConnection}
                    disabled={isTesting}
                    className="px-3.5 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-xs"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isTesting ? 'animate-spin' : ''}`} />
                    <span>{tr('فحص اكتمال الإعدادات', 'Check Configuration')}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleSyncToQoyod}
                    disabled={isSyncing || !activeBatch}
                    className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-xl font-bold flex items-center gap-1.5 transition-all shadow-md cursor-pointer"
                  >
                    <Send className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                    <span>{isSyncing ? tr('جاري المزامنة...', 'Synchronizing...') : tr('ترحيل القيد لقيود API', 'Post Journal to Qoyod API')}</span>
                  </button>
                </div>
              </div>

            </div>
          )}

          {/* TAB 2: JSON Payload (Matching requested format) */}
          {activeViewTab === 'payload' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-slate-800 flex items-center gap-1.5">
                    <Code className="w-4 h-4 text-emerald-600" />
                    <span>{tr('هيكل حزمة البيانات الرسمية', 'Official JSON Payload Format')}</span>
                  </h4>
                  <p className="text-[11px] text-slate-500">
                    {tr('يتضمن القيد ومصفوفات المدين والدائن مع معرف الحساب والمبلغ والبيان.', 'Includes `journal_entry`, debit and credit arrays, account IDs, amounts, and comments.')}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleCopyJson}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-[11px] font-bold flex items-center gap-1.5 cursor-pointer transition-all"
                >
                  {copiedJson ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedJson ? tr('تم النسخ', 'Copied') : tr('نسخ كود JSON', 'Copy JSON')}</span>
                </button>
              </div>

              {currentPayload ? (
                <div className="relative">
                  <pre className="bg-slate-900 text-emerald-400 p-4 rounded-2xl text-[11px] font-mono overflow-x-auto max-h-72 border border-slate-800 leading-relaxed" dir="ltr">
                    {JSON.stringify(currentPayload, null, 2)}
                  </pre>
                </div>
              ) : (
                <div className="p-6 text-center text-slate-400 bg-slate-50 rounded-2xl border">
                  {tr('لا يوجد مسير رواتب نشط حالياً لتوليد حزمة البيانات', 'There is no active payroll run for generating a payload.')}
                </div>
              )}

              {/* JSON Structure Notes */}
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-[11px] text-slate-600 space-y-1">
                <div className="font-bold text-slate-800">{tr('ملاحظات التوافق المحاسبي مع قيود:', 'Qoyod accounting compatibility notes:')}</div>
                <ul className="list-disc list-inside space-y-0.5 text-slate-500">
                  <li>{tr('حقل `account_id`: يمثل المعرف الرقمي للحساب في قيود (أو رمز الحساب من شجرة الحسابات).', '`account_id`: the numeric Qoyod account ID or mapped chart-of-accounts code.')}</li>
                  <li>{tr('حقل `amount`: يمثل المبلغ المحاسبي الدقيق بالريال السعودي.', '`amount`: the exact accounting amount in Saudi riyals.')}</li>
                  <li>{tr('حقل `comment`: يوضح تفاصيل البند ومركز التكلفة واستحقاق الموظفين.', '`comment`: line, cost center, and employee accrual details.')}</li>
                </ul>
              </div>
            </div>
          )}

          {/* TAB 3: cURL Command */}
          {activeViewTab === 'curl' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-slate-800 flex items-center gap-1.5">
                    <Terminal className="w-4 h-4 text-purple-600" />
                    <span>{tr('أمر cURL الجاهز للتنفيذ المباشر', 'Ready-to-run cURL Command')} (Terminal / Postman)</span>
                  </h4>
                  <p className="text-[11px] text-slate-500">
                    {tr('يمكنك تشغيل هذا الأمر مباشرة من موجه الأوامر لاختبار الربط والترحيل', 'Run this command from a terminal to test the connection and posting.')}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleCopyCurl}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-[11px] font-bold flex items-center gap-1.5 cursor-pointer transition-all"
                >
                  {copiedCurl ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedCurl ? tr('تم النسخ', 'Copied') : tr('نسخ أمر cURL', 'Copy cURL')}</span>
                </button>
              </div>

              <div className="relative">
                <pre className="bg-slate-900 text-purple-300 p-4 rounded-2xl text-[11px] font-mono overflow-x-auto max-h-72 border border-slate-800 leading-relaxed whitespace-pre" dir="ltr">
                  {currentCurl}
                </pre>
              </div>

              <div className="p-3 bg-purple-50 border border-purple-200 text-purple-900 rounded-xl text-[11px] flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-purple-600 shrink-0" />
                <span>{tr('الأمر مجهز بنفس التنسيق والمفاتيح المطلوبة في توثيق API قيود.', 'The command uses the fields and headers required by the Qoyod API documentation.')}</span>
              </div>
            </div>
          )}

          {/* TAB 4: API Response */}
          {activeViewTab === 'response' && lastResponse && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-bold text-slate-800 flex items-center gap-1.5">
                  <Receipt className="w-4 h-4 text-emerald-600" />
                  <span>{tr('استجابة خادم قيود الرسمية', 'Qoyod Server JSON Response')}</span>
                </h4>
                <span className="px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-800 text-[10px] font-mono font-bold">
                  HTTP 201 Created
                </span>
              </div>

              <pre className="bg-slate-900 text-emerald-400 p-4 rounded-2xl text-[11px] font-mono overflow-x-auto max-h-72 border border-slate-800 leading-relaxed" dir="ltr">
                {JSON.stringify(lastResponse, null, 2)}
              </pre>

              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="p-2.5 bg-slate-50 rounded-xl border">
                  <span className="text-[10px] text-slate-400 block">{tr('رقم القيد في قيود', 'Qoyod Journal ID')}</span>
                  <span className="font-bold text-slate-800 font-mono text-sm">#{lastResponse.id}</span>
                </div>
                <div className="p-2.5 bg-emerald-50 rounded-xl border border-emerald-200">
                  <span className="text-[10px] text-emerald-600 block">{tr('إجمالي المدين', 'Total Debit')}</span>
                  <span className="font-bold text-emerald-800 font-mono text-sm">{Number(lastResponse.total_debit || 0).toLocaleString('en-US')} SR</span>
                </div>
                <div className="p-2.5 bg-emerald-50 rounded-xl border border-emerald-200">
                  <span className="text-[10px] text-emerald-600 block">{tr('إجمالي الدائن', 'Total Credit')}</span>
                  <span className="font-bold text-emerald-800 font-mono text-sm">{Number(lastResponse.total_credit || 0).toLocaleString('en-US')} SR</span>
                </div>
              </div>
            </div>
          )}

          {/* Direct CSV Option */}
          {activeBatch && (
            <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
              <div className="text-slate-500 text-[11px]">
                {tr('أو يمكنك تنزيل ملف CSV لاستيراده يدوياً في قيود:', 'Or download a CSV file for manual import into Qoyod:')}
              </div>
              <button
                type="button"
                onClick={() => exportQoyodJournalCsv(activeBatch, company)}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                <span>{tr('تصدير قيد اليومية CSV لقيود', 'Export Qoyod Journal CSV')}</span>
              </button>
            </div>
          )}

          {/* Footer Submit */}
          <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl font-semibold cursor-pointer"
            >
              {tr('إلغاء', 'Cancel')}
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold shadow-md cursor-pointer"
            >
              {tr('حفظ إعدادات الربط', 'Save Integration Settings')}
            </button>
          </div>

        </form>
      </div>
    </div>
  );
};
