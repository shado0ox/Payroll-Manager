import React, { useState } from 'react';
import { 
  Database, 
  CheckCircle2, 
  AlertTriangle, 
  X, 
  RefreshCw, 
  Download, 
  Upload, 
  Server, 
  ShieldCheck, 
  WifiOff, 
  Layers,
  Activity
} from 'lucide-react';
import { AppState } from '../utils/storage';
import { DatabaseStatus, pingDatabase, exportDatabaseBackup } from '../utils/databaseService';

interface DatabaseStatusModalProps {
  isOpen: boolean;
  onClose: () => void;
  state: AppState;
  dbStatus: DatabaseStatus;
  onRestoreState: (restoredState: AppState) => void;
}

export const DatabaseStatusModal: React.FC<DatabaseStatusModalProps> = ({
  isOpen,
  onClose,
  state,
  dbStatus,
  onRestoreState,
}) => {
  const [isPinging, setIsPinging] = useState(false);
  const [pingResult, setPingResult] = useState<{ status: 'HEALTHY' | 'ERROR'; latencyMs: number; message: string } | null>(null);
  
  if (!isOpen) return null;

  const handlePing = async () => {
    setIsPinging(true);
    setPingResult(null);
    try {
      const res = await pingDatabase();
      setPingResult(res);
    } finally {
      setIsPinging(false);
    }
  };

  const handleExportBackup = () => {
    exportDatabaseBackup(state);
  };

  const handleImportBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        const parsed = JSON.parse(content);
        if (parsed.state && parsed.state.companies && parsed.state.employees) {
          onRestoreState(parsed.state);
          alert('تم استعادة نسخة قاعدة البيانات بنجاح!');
          onClose();
        } else {
          alert('ملف النسخة الاحتياطية غير متوافق أو تالف.');
        }
      } catch (err: any) {
        alert(`فشل استيراد النسخة الاحتياطية: ${err?.message || 'خطأ في قراءة الملف'}`);
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fadeIn">
      <div className="bg-white rounded-3xl max-w-2xl w-full p-6 sm:p-8 shadow-2xl border border-slate-100 animate-scaleUp overflow-y-auto max-h-[90vh]">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-5">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center border border-emerald-200 shadow-xs">
              <Database className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                <span>حالة قاعدة بيانات PostgreSQL</span>
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold">
                  v2.0 Active
                </span>
              </h3>
              <p className="text-xs text-slate-500 font-medium">
                فحص مباشر للخادم وحالة آخر مزامنة ونسخ البيانات الاحتياطي
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 text-slate-400 hover:text-slate-600 flex items-center justify-center cursor-pointer transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Database Status Warning / Alert Banner */}
        {!dbStatus.isChecking && !dbStatus.isCloudConnected && (
          <div className="mb-5 p-4 bg-amber-50/90 border border-amber-200 rounded-2xl flex items-start gap-3 text-amber-900 shadow-xs">
            <div className="p-2 rounded-xl bg-amber-100 text-amber-700 shrink-0 mt-0.5">
              <WifiOff className="w-5 h-5" />
            </div>
            <div className="text-xs space-y-1">
              <div className="font-bold flex items-center gap-2">
                <span>تعذر الوصول إلى قاعدة بيانات PostgreSQL</span>
                <span className="px-2 py-0.5 bg-amber-200 text-amber-900 rounded-md font-mono text-[10px]">غير متصل</span>
              </div>
              <p className="text-amber-800 leading-relaxed font-medium">
                لن تُحفظ التعديلات الجديدة حتى عودة الاتصال. لا توجد نسخة محلية من بيانات الرواتب، والبيانات الموجودة على الخادم لم تُحذف.
              </p>
            </div>
          </div>
        )}

        {/* Real-time Connection Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 mb-5">
          
          {/* PostgreSQL connection */}
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 flex flex-col justify-between">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Server className="w-4 h-4 text-emerald-600" />
                <span className="text-xs font-bold text-slate-800">PostgreSQL</span>
              </div>
              <span className={`flex items-center gap-1.5 text-[11px] font-bold px-2 py-0.5 rounded-md ${dbStatus.isChecking ? 'text-slate-600 bg-slate-200' : dbStatus.isCloudConnected ? 'text-emerald-700 bg-emerald-100/80' : 'text-rose-700 bg-rose-100'}`}>
                <span className={`w-2 h-2 rounded-full ${dbStatus.isChecking ? 'bg-slate-400 animate-pulse' : dbStatus.isCloudConnected ? 'bg-emerald-500' : 'bg-rose-500'}`}></span>
                <span>{dbStatus.isChecking ? 'جاري الفحص' : dbStatus.isCloudConnected ? 'متصلة ونشطة' : 'غير متصلة'}</span>
              </span>
            </div>
            <div className="space-y-1 text-[11px] text-slate-600 font-medium">
              <div>المحرك: <strong className="text-slate-900 font-mono">{dbStatus.engine}</strong></div>
              <div>واجهة الاتصال: <strong className="text-slate-900 font-mono">{dbStatus.cloudEndpoint || '/api/state'}</strong></div>
              <div>آخر حفظ ناجح: <strong className="text-slate-900 font-mono">{dbStatus.lastSavedAt || 'لم يُسجل بعد'}</strong></div>
            </div>
          </div>

          {/* Persistence details */}
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 flex flex-col justify-between">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                <span className="text-xs font-bold text-slate-800">سياسة حفظ البيانات</span>
              </div>
              <span className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-700 bg-emerald-100/80 px-2 py-0.5 rounded-md">
                <span>مركزي وآمن</span>
              </span>
            </div>
            <div className="space-y-1 text-[11px] text-slate-600 font-medium">
              <div>المصدر الأساسي: <strong className="text-slate-900">قاعدة بيانات الخادم</strong></div>
              <div>التخزين داخل المتصفح: <strong className="text-emerald-700">معطل للبيانات الحساسة</strong></div>
              <div>آخر خطأ: <strong className={dbStatus.lastError ? 'text-rose-700' : 'text-emerald-700'}>{dbStatus.lastError || 'لا يوجد'}</strong></div>
            </div>
          </div>

        </div>

        {/* Database Records Summary */}
        <div className="mb-5 p-4 rounded-2xl bg-slate-50 border border-slate-200">
          <h4 className="text-xs font-bold text-slate-800 mb-3 flex items-center gap-2">
            <Layers className="w-4 h-4 text-emerald-600" />
            <span>إحصائيات السجلات المحفوظة في قاعدة البيانات</span>
          </h4>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-center">
            <div className="p-2 bg-white rounded-xl border border-slate-200 shadow-2xs">
              <div className="text-base font-black text-slate-900 font-mono">{state.companies.length}</div>
              <div className="text-[10px] font-bold text-slate-500">شركات مسجلة</div>
            </div>
            <div className="p-2 bg-white rounded-xl border border-slate-200 shadow-2xs">
              <div className="text-base font-black text-slate-900 font-mono">{state.employees.length}</div>
              <div className="text-[10px] font-bold text-slate-500">سجلات موظفين</div>
            </div>
            <div className="p-2 bg-white rounded-xl border border-slate-200 shadow-2xs">
              <div className="text-base font-black text-slate-900 font-mono">{state.payrollRuns.length}</div>
              <div className="text-[10px] font-bold text-slate-500">مسيرات رواتب</div>
            </div>
            <div className="p-2 bg-white rounded-xl border border-slate-200 shadow-2xs">
              <div className="text-base font-black text-slate-900 font-mono">{state.attendance.length}</div>
              <div className="text-[10px] font-bold text-slate-500">حركات حضور</div>
            </div>
          </div>
        </div>

        {/* Action Buttons: Ping & Backup */}
        <div className="flex flex-wrap items-center gap-3 mb-5">
          <button
            type="button"
            onClick={handlePing}
            disabled={isPinging}
            className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all cursor-pointer shadow-xs"
          >
            <Activity className={`w-4 h-4 ${isPinging ? 'animate-spin' : 'text-emerald-400'}`} />
            <span>{isPinging ? 'جاري فحص الاستجابة...' : 'فحص استجابة قاعدة البيانات (Ping)'}</span>
          </button>

          <button
            type="button"
            onClick={handleExportBackup}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all cursor-pointer shadow-xs"
          >
            <Download className="w-4 h-4" />
            <span>تصدير نسخة احتياطية (JSON)</span>
          </button>

          <label className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold transition-all cursor-pointer border border-slate-200">
            <Upload className="w-4 h-4" />
            <span>استعادة نسخة</span>
            <input type="file" accept=".json" onChange={handleImportBackup} className="hidden" />
          </label>
        </div>

        {/* Ping Result Display */}
        {pingResult && (
          <div className={`mb-5 p-3 rounded-xl border text-xs font-bold flex items-center gap-2 ${
            pingResult.status === 'HEALTHY' 
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800' 
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}>
            {pingResult.status === 'HEALTHY' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span>{pingResult.message}</span>
          </div>
        )}

      </div>
    </div>
  );
};
