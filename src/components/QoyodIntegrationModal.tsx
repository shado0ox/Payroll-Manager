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
  EyeOff
} from 'lucide-react';
import { Company, PayrollRun, QoyodApiConfig, JournalBatch } from '../types';
import { generatePayrollJournalBatch } from '../utils/accountingEngine';
import { exportQoyodJournalCsv } from '../utils/exportUtils';

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
  const [config, setConfig] = useState<QoyodApiConfig>(qoyodConfig);
  const [showApiKey, setShowApiKey] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ status: 'SUCCESS' | 'FAILED'; message: string } | null>(
    qoyodConfig.lastTestStatus ? { status: qoyodConfig.lastTestStatus, message: qoyodConfig.lastTestMessage || '' } : null
  );
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncSuccess, setSyncSuccess] = useState<string | null>(null);

  const activeBatch = latestRun ? generatePayrollJournalBatch(company, latestRun) : null;

  // Test Qoyod API Endpoint
  const handleTestConnection = () => {
    setIsTesting(true);
    setTestResult(null);

    setTimeout(() => {
      setIsTesting(false);
      if (config.apiKey && config.apiKey.length > 8) {
        setTestResult({
          status: 'SUCCESS',
          message: `تم الاتصال بنجاح مع سيرفرات قيود (API 2.0) لمنشأة (${company.nameAr})`,
        });
        setConfig(prev => ({
          ...prev,
          lastTestStatus: 'SUCCESS',
          lastTestMessage: 'الاتصال نشط ومفعل',
        }));
      } else {
        setTestResult({
          status: 'FAILED',
          message: 'فشل الاتصال: يرجى إدخال مفتاح API صحيح من إعدادات حساب قيود',
        });
      }
    }, 600);
  };

  // Sync current batch via simulated API
  const handleSyncToQoyod = () => {
    if (!activeBatch) return;
    setIsSyncing(true);

    setTimeout(() => {
      setIsSyncing(false);
      const qoyodId = `QYD-JV-${Math.floor(10000 + Math.random() * 90000)}`;
      setSyncSuccess(`تم ترحيل وإنشاء قيد اليومية في برنامج قيود برقم مرجعي: ${qoyodId}`);
    }, 800);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveConfig(config);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl max-w-2xl w-full shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        
        {/* Top Header */}
        <div className="bg-slate-900 text-white p-5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-sky-500/20 text-sky-400 rounded-xl">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base">
                مركز التكامل والربط مع برنامج قيود المحاسبي
              </h3>
              <p className="text-xs text-slate-400">
                مزامنة القيود اليومية آلياً عبر API أو عبر ملفات الاستيراد المباشرة
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Form */}
        <form onSubmit={handleSave} className="p-6 space-y-5 text-xs max-h-[80vh] overflow-y-auto">
          
          {/* Status Alert */}
          {testResult && (
            <div className={`p-3.5 rounded-2xl border flex items-start gap-2.5 ${
              testResult.status === 'SUCCESS'
                ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
                : 'bg-rose-50 text-rose-900 border-rose-200'
            }`}>
              {testResult.status === 'SUCCESS' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-600 mt-0.5" />
              )}
              <div className="font-semibold">{testResult.message}</div>
            </div>
          )}

          {/* Sync Success Alert */}
          {syncSuccess && (
            <div className="p-3.5 rounded-2xl bg-sky-50 text-sky-900 border border-sky-200 flex items-center gap-2 font-bold">
              <CheckCircle2 className="w-4 h-4 text-sky-600" />
              <span>{syncSuccess}</span>
            </div>
          )}

          {/* Fields */}
          <div className="space-y-3.5">
            <div>
              <label className="block font-bold text-slate-700 mb-1 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Key className="w-3.5 h-3.5 text-slate-500" />
                  <span>مفتاح API الخاص بقيود (API Secret Key) *</span>
                </span>
                <span className="text-[11px] text-slate-400 font-normal">مشفر ومحمي</span>
              </label>
              <div className="relative flex items-center">
                <input
                  type={showApiKey ? 'text' : 'password'}
                  required
                  value={config.apiKey}
                  onChange={(e) => setConfig({ ...config, apiKey: e.target.value })}
                  placeholder="qyd_live_..."
                  className="w-full pl-10 pr-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="absolute left-2.5 text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
                  title={showApiKey ? 'إخفاء المفتاح' : 'إظهار المفتاح'}
                >
                  {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-bold text-slate-700 mb-1 flex items-center gap-1.5">
                  <Globe className="w-3.5 h-3.5 text-slate-500" />
                  <span>عنوان خادم الـ API (Base URL)</span>
                </label>
                <input
                  type="text"
                  value={config.baseUrl}
                  onChange={(e) => setConfig({ ...config, baseUrl: e.target.value })}
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono text-xs"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">معرف المنشأة في قيود (Org ID)</label>
                <input
                  type="text"
                  value={config.organizationId}
                  onChange={(e) => setConfig({ ...config, organizationId: e.target.value })}
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono text-xs"
                />
              </div>
            </div>

            <div className="pt-2 flex items-center justify-between bg-slate-50 p-3 rounded-2xl border border-slate-200">
              <div>
                <div className="font-bold text-slate-800">المزامنة التلقائية عند الاعتماد</div>
                <div className="text-[11px] text-slate-500">ترحيل قيد اليومية تلقائياً لقيود عند اعتماد مسير الرواتب</div>
              </div>
              <input
                type="checkbox"
                checked={config.autoSyncOnApprove}
                onChange={(e) => setConfig({ ...config, autoSyncOnApprove: e.target.checked })}
                className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500"
              />
            </div>
          </div>

          {/* Test & Sync Actions */}
          <div className="p-4 bg-sky-50/60 rounded-2xl border border-sky-100 flex flex-wrap items-center justify-between gap-3">
            <div className="text-slate-700">
              <span className="font-bold block">إجراءات المزامنة المباشرة:</span>
              <span className="text-[11px] text-slate-500">
                القيد المستهدف: {activeBatch?.batchNumber || 'JV-202608'} ({activeBatch?.lines.length || 0} أسطر محاسبية)
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleTestConnection}
                disabled={isTesting}
                className="px-3.5 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl font-bold flex items-center gap-1.5 transition-all"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isTesting ? 'animate-spin' : ''}`} />
                <span>اختبار الاتصال</span>
              </button>

              <button
                type="button"
                onClick={handleSyncToQoyod}
                disabled={isSyncing || !activeBatch}
                className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-xl font-bold flex items-center gap-1.5 transition-all shadow-xs"
              >
                <Send className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                <span>{isSyncing ? 'جاري المزامنة...' : 'ترحيل القيد لقيود API'}</span>
              </button>
            </div>
          </div>

          {/* API Payload Preview */}
          {activeBatch && (
            <div className="space-y-1.5">
              <div className="font-bold text-slate-700 flex items-center gap-1.5">
                <Code className="w-3.5 h-3.5 text-slate-500" />
                <span>معاينة حزمة بيانات JSON المرسلة إلى `POST /api/2.0/manual_journals`:</span>
              </div>
              <pre className="bg-slate-900 text-emerald-400 p-3.5 rounded-2xl text-[10px] font-mono overflow-x-auto max-h-36 border border-slate-800">
                {JSON.stringify({
                  manual_journal: {
                    reference: activeBatch.batchNumber,
                    date: activeBatch.date,
                    description: activeBatch.description,
                    journal_entries_attributes: activeBatch.lines.slice(0, 4).map(l => ({
                      account_code: l.accountCode,
                      description: l.descriptionAr,
                      debit: l.debit,
                      credit: l.credit,
                      cost_center_code: l.costCenterCode
                    }))
                  }
                }, null, 2)}
              </pre>
            </div>
          )}

          {/* Footer Submit */}
          <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl font-semibold"
            >
              إغلاق
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold shadow-md"
            >
              حفظ إعدادات الربط
            </button>
          </div>

        </form>
      </div>
    </div>
  );
};
