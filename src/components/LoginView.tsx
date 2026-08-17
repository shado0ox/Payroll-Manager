import React, { useState } from 'react';
import { 
  Lock, 
  User as UserIcon, 
  Eye, 
  EyeOff, 
  Building2, 
  AlertCircle,
  KeyRound,
  Hash,
  ArrowLeft
} from 'lucide-react';
import { UserAccount, Company } from '../types';

interface LoginViewProps {
  users: UserAccount[];
  companies: Company[];
  onLogin: (user: UserAccount, selectedCompanyId: string) => void;
}

// Convert Eastern Arabic numerals (٠-٩) to standard Latin digits (0-9)
const normalizeArabicNumbers = (val: string): string => {
  const arabicDigits = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
  return (val || '')
    .replace(/[٠-٩]/g, (char) => String(arabicDigits.indexOf(char)))
    .trim()
    .toLowerCase();
};

export const LoginView: React.FC<LoginViewProps> = ({ users, companies, onLogin }) => {
  const defaultCode = companies[0]?.companyCode || '101';
  const [companyInput, setCompanyInput] = useState(defaultCode);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    setTimeout(() => {
      const cleanInput = normalizeArabicNumbers(companyInput);
      
      const targetCompany = companies.find((c) => {
        const codeNorm = normalizeArabicNumbers(c.companyCode || '');
        const idNorm = (c.id || '').toLowerCase();
        const crNorm = normalizeArabicNumbers(c.crNumber || '');
        const nameAr = (c.nameAr || '').toLowerCase();
        const nameEn = (c.nameEn || '').toLowerCase();

        return (
          (codeNorm && codeNorm === cleanInput) ||
          (idNorm && idNorm === cleanInput) ||
          (crNorm && crNorm === cleanInput) ||
          (cleanInput.length >= 3 && nameAr.includes(cleanInput)) ||
          (cleanInput.length >= 3 && nameEn.includes(cleanInput))
        );
      });

      if (!targetCompany) {
        setError(`رمز المنشأة (${companyInput}) غير مسجل. يرجى التأكد من كتابة رمز المنشأة أو اختيارها من القائمة.`);
        setIsLoading(false);
        return;
      }

      const cleanUsername = username.trim().toLowerCase();
      const user = users.find(
        (u) => u.username.toLowerCase() === cleanUsername && u.password === password
      );

      if (!user) {
        setError('اسم المستخدم أو كلمة المرور غير صحيحة. يرجى التحقق وإعادة المحاولة.');
        setIsLoading(false);
        return;
      }

      if (!user.isActive) {
        setError('هذا الحساب معطل حالياً من قِبل مسؤول النظام. يرجى مراجعة الإدارة.');
        setIsLoading(false);
        return;
      }

      // Check access permission (Admins can access all companies)
      if (user.role !== 'ADMIN' && user.companyIds && user.companyIds.length > 0 && !user.companyIds.includes(targetCompany.id)) {
        setError(`المستخدم (${user.name}) ليس لديه صلاحية الدخول لشركة "${targetCompany.nameAr}". يرجى مراجعة مسؤول النظام.`);
        setIsLoading(false);
        return;
      }

      onLogin(user, targetCompany.id);
    }, 200);
  };

  return (
    <div className="min-h-screen w-full bg-slate-900 flex flex-col items-center justify-center p-4 sm:p-6 text-slate-100 relative overflow-hidden" dir="rtl">
      
      {/* Background Decorative Elements */}
      <div className="absolute -top-40 -right-40 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-md w-full relative z-10 my-auto">
        
        {/* Header Branding */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-emerald-600 shadow-xl shadow-emerald-900/30 text-white font-bold text-2xl mb-3 border border-emerald-500/40">
            <Building2 className="w-8 h-8" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
            نظام مسار <span className="text-emerald-400">للرواتب</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1 font-medium">
            منظومة إدارة مسيرات الأجور والامتثال المالي
          </p>
        </div>

        {/* Login Card */}
        <div className="bg-slate-800/90 backdrop-blur-md rounded-3xl border border-slate-700 shadow-2xl p-6 sm:p-7">
          
          <div className="flex items-center justify-between border-b border-slate-700/80 pb-3.5 mb-5">
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white">تسجيل الدخول للنظام</h2>
              <p className="text-[11px] text-slate-400">أدخل رمز المنشأة وبيانات الاعتماد للدخول المباشر</p>
            </div>
            <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-xl border border-emerald-500/20">
              <KeyRound className="w-4 h-4" />
            </div>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-rose-500/15 border border-rose-500/30 rounded-2xl flex items-start gap-2.5 text-rose-200 text-xs animate-in fade-in duration-200">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <div className="leading-relaxed">{error}</div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            
            {/* Company Code Input */}
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1.5">
                رمز المنشأة / الشركة <span className="text-emerald-400 font-mono">(Company Code)</span>
              </label>
              
              <div className="relative">
                <input
                  type="text"
                  value={companyInput}
                  onChange={(e) => setCompanyInput(e.target.value)}
                  placeholder="أدخل رمز المنشأة (مثال: 101)"
                  required
                  className="w-full pl-3 pr-10 py-2.5 bg-slate-900/80 border border-slate-700 rounded-xl text-white text-sm focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all font-mono"
                  dir="ltr"
                />
                <Hash className="w-4 h-4 text-slate-500 absolute right-3.5 top-3" />
              </div>
            </div>

            {/* Username */}
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1.5">
                اسم المستخدم
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="أدخل اسم المستخدم"
                  required
                  className="w-full pl-3 pr-10 py-2.5 bg-slate-900/80 border border-slate-700 rounded-xl text-white text-sm focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all font-mono"
                  dir="ltr"
                />
                <UserIcon className="w-4 h-4 text-slate-500 absolute right-3.5 top-3" />
              </div>
            </div>

            {/* Password */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-bold text-slate-300">
                  كلمة المرور
                </label>
              </div>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="أدخل كلمة المرور"
                  required
                  className="w-full pl-10 pr-10 py-2.5 bg-slate-900/80 border border-slate-700 rounded-xl text-white text-sm focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all font-mono"
                  dir="ltr"
                />
                <Lock className="w-4 h-4 text-slate-500 absolute right-3.5 top-3" />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute left-3.5 top-3 text-slate-500 hover:text-slate-300 transition-colors cursor-pointer"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full mt-4 py-3 px-4 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white rounded-xl font-bold text-sm shadow-lg shadow-emerald-900/40 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {isLoading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <span>تسجيل الدخول للمنشأة</span>
                  <ArrowLeft className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

        </div>

        {/* Designer Attribution & System Info Footer */}
        <div className="text-center mt-6 space-y-1.5">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-800/80 border border-slate-700 text-slate-300 text-xs font-semibold shadow-xs">
            <span>تم التصميم والتطوير بواسطة الأستاذ:</span>
            <span className="text-emerald-400 font-bold">Shadi Nassef</span>
          </div>
          <div className="text-[11px] text-slate-500">
            نظام مسار لإدارة الرواتب والأجور المتوافق مع نظام العمل السعودي ومنصة مدد
          </div>
        </div>

      </div>
    </div>
  );
};
