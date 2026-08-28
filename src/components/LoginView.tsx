import React, { useEffect, useState } from 'react';
import { useLanguage } from '../i18n/LanguageContext';
import { AlertCircle, ArrowRight, Building2, CheckCircle2, Eye, EyeOff, Hash, KeyRound, Lock, Mail, Phone, Route, ShieldCheck, Sparkles, User as UserIcon } from 'lucide-react';
import { api } from '../utils/api';

interface LoginViewProps { defaultCompanyCode?: string; onLogin: (companyCode: string, username: string, password: string) => Promise<void>; }

const currencies = [
  { symbol: 'SR', ar: 'ريال سعودي', en: 'Saudi Riyal', pos: 'masar-coin-one' },
  { symbol: '$', ar: 'دولار أمريكي', en: 'US Dollar', pos: 'masar-coin-two' },
  { symbol: 'E£', ar: 'جنيه مصري', en: 'Egyptian Pound', pos: 'masar-coin-three' },
  { symbol: '€', ar: 'يورو', en: 'Euro', pos: 'masar-coin-four' },
  { symbol: '£', ar: 'جنيه إسترليني', en: 'Pound Sterling', pos: 'masar-coin-five' },
];

const normalizeArabicNumbers = (val: string): string => {
  const digits = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
  return (val || '').replace(/[٠-٩]/g, char => String(digits.indexOf(char))).trim().toLowerCase();
};

export const LoginView: React.FC<LoginViewProps> = ({ defaultCompanyCode = '101', onLogin }) => {
  const { language, toggleLanguage, t } = useLanguage();
  const isArabic = language === 'ar';
  const [companyInput, setCompanyInput] = useState(defaultCompanyCode);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [mode, setMode] = useState<'LOGIN'|'REGISTER'|'VERIFY'|'CREATED'>('LOGIN');
  const [registrationEnabled, setRegistrationEnabled] = useState(false);
  const [trialDays, setTrialDays] = useState(14);
  const [requestId, setRequestId] = useState('');
  const [maskedEmail, setMaskedEmail] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [createdCompanyCode, setCreatedCompanyCode] = useState('');
  const [registration, setRegistration] = useState({
    companyNameAr:'', companyNameEn:'', crNumber:'', taxNumber:'', phone:'',
    adminName:'', username:'', email:'', password:'',
  });

  useEffect(() => {
    api.publicConfig().then(config => {
      setRegistrationEnabled(config.registrationEnabled);
      setTrialDays(config.trialDays);
    }).catch(() => undefined);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setError(null); setIsLoading(true);
    try { await onLogin(normalizeArabicNumbers(companyInput), username.trim().toLowerCase(), password); }
    catch { setError(t('invalidLogin')); }
    finally { setIsLoading(false); }
  };
  const registrationError = (value: unknown) => {
    const code = value instanceof Error ? value.message : '';
    const messages: Record<string,string> = {
      INVALID_REGISTRATION:isArabic ? 'راجع البيانات. كلمة المرور يجب أن تكون 8 أحرف على الأقل وتضم حرفًا كبيرًا وصغيرًا ورقمًا ورمزًا.' : 'Check the fields. Password must be at least 8 characters with upper/lowercase, number, and symbol.',
      ACCOUNT_ALREADY_EXISTS:isArabic ? 'اسم المستخدم أو البريد مسجل بالفعل.' : 'Username or email is already registered.',
      EMAIL_SEND_FAILED:isArabic ? 'تعذر إرسال رسالة التحقق. حاول لاحقًا.' : 'Could not send the verification email. Try again later.',
      EMAIL_SERVICE_NOT_CONFIGURED:isArabic ? 'خدمة البريد غير مهيأة بعد.' : 'Email service is not configured yet.',
      INVALID_VERIFICATION_CODE:isArabic ? 'رمز التحقق غير صحيح.' : 'Incorrect verification code.',
      VERIFICATION_EXPIRED:isArabic ? 'انتهت صلاحية الرمز. ابدأ التسجيل مرة أخرى.' : 'The code expired. Start registration again.',
    };
    return messages[code] || (isArabic ? 'تعذر إكمال العملية. حاول مرة أخرى.' : 'Could not complete the request. Try again.');
  };
  const handleRegistration = async (e: React.FormEvent) => {
    e.preventDefault(); setError(null); setIsLoading(true);
    try {
      const result = await api.startRegistration({ ...registration, language });
      setRequestId(result.requestId); setMaskedEmail(result.maskedEmail); setMode('VERIFY');
    } catch (value) { setError(registrationError(value)); }
    finally { setIsLoading(false); }
  };
  const handleVerification = async (e: React.FormEvent) => {
    e.preventDefault(); setError(null); setIsLoading(true);
    try {
      const result = await api.verifyRegistration(requestId,normalizeArabicNumbers(verificationCode));
      setCreatedCompanyCode(result.companyCode); setCompanyInput(result.companyCode);
      setUsername(result.username); setPassword(registration.password); setMode('CREATED');
    } catch (value) { setError(registrationError(value)); }
    finally { setIsLoading(false); }
  };
  const updateRegistration = (key: keyof typeof registration, value: string) => setRegistration(prev => ({ ...prev,[key]:value }));
  const inputClass = 'w-full h-12 ps-11 pe-4 bg-slate-950/45 border border-white/10 rounded-2xl text-white placeholder:text-slate-500 text-sm focus:outline-none focus:border-emerald-400/70 focus:ring-4 focus:ring-emerald-400/10 transition-all font-mono';

  return (
    <main className="masar-login min-h-screen w-full text-slate-100 relative overflow-hidden" dir={isArabic ? 'rtl' : 'ltr'}>
      <div className="masar-grid absolute inset-0 pointer-events-none" />
      <div className="absolute -top-48 -start-40 h-[32rem] w-[32rem] rounded-full bg-emerald-500/15 blur-[110px] pointer-events-none" />
      <div className="absolute -bottom-56 -end-32 h-[34rem] w-[34rem] rounded-full bg-cyan-500/10 blur-[120px] pointer-events-none" />
      <div className="relative z-10 mx-auto grid min-h-screen max-w-[1440px] lg:grid-cols-[1.08fr_.92fr]">
        <section className="relative hidden overflow-hidden border-e border-white/5 px-10 py-12 lg:flex xl:px-20 xl:py-16">
          <div className="relative z-10 flex w-full flex-col">
            <MasarLogo />
            <div className="my-auto max-w-xl py-16">
              <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-400/10 px-3.5 py-2 text-xs font-bold text-emerald-200 backdrop-blur-sm">
                <Sparkles className="h-3.5 w-3.5" />{isArabic ? 'رحلة مالية أكثر وضوحًا' : 'A clearer financial journey'}
              </div>
              <h1 className="text-5xl font-black leading-[1.15] tracking-tight text-white xl:text-6xl">
                {isArabic ? 'رواتبك على' : 'Your payroll,'}
                <span className="block bg-gradient-to-l from-emerald-300 via-teal-200 to-cyan-300 bg-clip-text text-transparent">{isArabic ? 'المسار الصحيح.' : 'on the right path.'}</span>
              </h1>
              <p className="mt-6 max-w-lg text-base leading-8 text-slate-400 xl:text-lg">{isArabic ? 'منصة موحدة لإدارة الرواتب والموظفين والالتزامات المالية بدقة وأمان.' : 'One secure workspace for payroll, people, and financial compliance.'}</p>
              <div className="mt-9 flex flex-wrap gap-x-6 gap-y-3 text-sm text-slate-300">
                {[isArabic ? 'حسابات دقيقة' : 'Accurate calculations', isArabic ? 'بيانات آمنة' : 'Secure data', isArabic ? 'تقارير فورية' : 'Instant reports'].map(feature => (
                  <span key={feature} className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-400" />{feature}</span>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-3 text-xs text-slate-500"><ShieldCheck className="h-4 w-4 text-emerald-500" />{isArabic ? 'حماية وخصوصية على مستوى المؤسسات' : 'Enterprise-grade security and privacy'}</div>
          </div>
          <div className="masar-currency-stage absolute inset-0 pointer-events-none" aria-hidden="true">
            <div className="masar-orbit masar-orbit-outer" /><div className="masar-orbit masar-orbit-inner" />
            {currencies.map(currency => <div key={currency.symbol} className={`masar-coin ${currency.pos}`}><span>{currency.symbol}</span><small>{isArabic ? currency.ar : currency.en}</small></div>)}
          </div>
        </section>

        <section className="flex min-h-screen items-center justify-center px-4 py-8 sm:px-8 lg:px-12 xl:px-20">
          <div className="w-full max-w-[460px]">
            <div className="mb-8 flex items-center justify-between lg:justify-end">
              <div className="lg:hidden"><MasarLogo compact /></div>
              <button type="button" data-no-translate onClick={toggleLanguage} className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-bold text-slate-300 backdrop-blur-md transition hover:border-emerald-400/30 hover:bg-white/10 hover:text-white">{isArabic ? 'English' : 'العربية'}</button>
            </div>
            <div className="masar-login-card rounded-[2rem] border border-white/10 bg-slate-900/60 p-6 shadow-2xl shadow-black/30 backdrop-blur-2xl sm:p-9">
              <div className="mb-8">
                <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl border border-emerald-300/20 bg-emerald-400/10 text-emerald-300"><KeyRound className="h-5 w-5" /></div>
                <h2 className="text-2xl font-black tracking-tight text-white">{mode === 'LOGIN' ? t('loginTitle') : mode === 'VERIFY' ? (isArabic ? 'تحقق من بريدك' : 'Verify your email') : mode === 'CREATED' ? (isArabic ? 'تم إنشاء شركتك' : 'Company created') : (isArabic ? 'ابدأ تجربتك المجانية' : 'Start your free trial')}</h2>
                <p className="mt-2 text-sm leading-6 text-slate-400">{mode === 'LOGIN' ? t('loginHint') : mode === 'REGISTER' ? (isArabic ? `سجّل بيانات شركتك واحصل على ${trialDays} يومًا مجانًا.` : `Register your company and get a ${trialDays}-day free trial.`) : mode === 'VERIFY' ? (isArabic ? `أرسلنا رمزًا من 6 أرقام إلى ${maskedEmail}` : `We sent a 6-digit code to ${maskedEmail}`) : (isArabic ? 'احتفظ بكود الشركة؛ ستحتاج إليه عند كل تسجيل دخول.' : 'Keep your company code; you need it whenever you sign in.')}</p>
              </div>
              {error && <div className="mb-5 flex items-start gap-2.5 rounded-2xl border border-rose-500/25 bg-rose-500/10 p-3.5 text-xs leading-relaxed text-rose-200"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />{error}</div>}
              {mode === 'LOGIN' && <form onSubmit={handleSubmit} className="space-y-5">
                <LoginField label={t('companyCodeLabel')} icon={<Hash className="h-4 w-4" />}><input type="text" value={companyInput} onChange={e => setCompanyInput(e.target.value)} placeholder={t('companyCodePlaceholder')} required className={inputClass} dir="ltr" autoComplete="organization" /></LoginField>
                <LoginField label={t('username')} icon={<UserIcon className="h-4 w-4" />}><input type="text" value={username} onChange={e => setUsername(e.target.value)} placeholder={t('username')} required className={inputClass} dir="ltr" autoComplete="username" /></LoginField>
                <LoginField label={t('password')} icon={<Lock className="h-4 w-4" />}>
                  <input type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder={t('password')} required className={`${inputClass} pe-11`} dir="ltr" autoComplete="current-password" />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute end-4 top-1/2 -translate-y-1/2 text-slate-500 transition hover:text-slate-200" tabIndex={-1} aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
                </LoginField>
                <button type="submit" disabled={isLoading} className="group mt-2 flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-l from-emerald-500 to-teal-500 text-sm font-black text-slate-950 shadow-lg shadow-emerald-950/40 transition hover:brightness-110 active:scale-[.99] disabled:cursor-not-allowed disabled:opacity-50">
                  {isLoading ? <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-900/25 border-t-slate-900" /> : <><span>{t('signIn')}</span><ArrowRight className={`h-4 w-4 transition-transform ${isArabic ? 'rotate-180' : ''}`} /></>}
                </button>
                {registrationEnabled && <button type="button" onClick={() => { setError(null); setMode('REGISTER'); }} className="w-full text-center text-xs font-bold text-emerald-300 hover:text-emerald-200">{isArabic ? `شركة جديدة؟ ابدأ تجربة ${trialDays} يومًا` : `New company? Start a ${trialDays}-day trial`}</button>}
              </form>}
              {mode === 'REGISTER' && <form onSubmit={handleRegistration} className="grid grid-cols-2 gap-3">
                <RegisterInput icon={<Building2 className="h-4 w-4" />} placeholder={isArabic ? 'اسم الشركة بالعربية' : 'Company Arabic name'} value={registration.companyNameAr} onChange={v => updateRegistration('companyNameAr',v)} required wide />
                <RegisterInput icon={<Building2 className="h-4 w-4" />} placeholder={isArabic ? 'اسم الشركة بالإنجليزية (اختياري)' : 'English company name (optional)'} value={registration.companyNameEn} onChange={v => updateRegistration('companyNameEn',v)} wide />
                <RegisterInput icon={<Hash className="h-4 w-4" />} placeholder={isArabic ? 'السجل التجاري' : 'Commercial registration'} value={registration.crNumber} onChange={v => updateRegistration('crNumber',v)} />
                <RegisterInput icon={<Hash className="h-4 w-4" />} placeholder={isArabic ? 'الرقم الضريبي' : 'VAT number'} value={registration.taxNumber} onChange={v => updateRegistration('taxNumber',v)} />
                <RegisterInput icon={<UserIcon className="h-4 w-4" />} placeholder={isArabic ? 'اسم المسؤول' : 'Administrator name'} value={registration.adminName} onChange={v => updateRegistration('adminName',v)} required wide />
                <RegisterInput icon={<Phone className="h-4 w-4" />} placeholder={isArabic ? 'رقم الجوال' : 'Mobile number'} value={registration.phone} onChange={v => updateRegistration('phone',v)} required />
                <RegisterInput icon={<UserIcon className="h-4 w-4" />} placeholder={isArabic ? 'اسم المستخدم بالإنجليزية' : 'Username'} value={registration.username} onChange={v => updateRegistration('username',v.toLowerCase())} required />
                <RegisterInput icon={<Mail className="h-4 w-4" />} placeholder={isArabic ? 'البريد الإلكتروني الفعلي' : 'Real email address'} type="email" value={registration.email} onChange={v => updateRegistration('email',v.toLowerCase())} required wide />
                <RegisterInput icon={<Lock className="h-4 w-4" />} placeholder={isArabic ? 'كلمة مرور قوية' : 'Strong password'} type="password" value={registration.password} onChange={v => updateRegistration('password',v)} required wide />
                <button type="submit" disabled={isLoading} className="col-span-2 flex h-12 items-center justify-center rounded-2xl bg-emerald-500 text-sm font-black text-slate-950 disabled:opacity-50">{isLoading ? '...' : (isArabic ? 'إرسال رمز التحقق' : 'Send verification code')}</button>
                <button type="button" onClick={() => { setError(null); setMode('LOGIN'); }} className="col-span-2 text-xs font-bold text-slate-400">{isArabic ? 'العودة لتسجيل الدخول' : 'Back to sign in'}</button>
              </form>}
              {mode === 'VERIFY' && <form onSubmit={handleVerification} className="space-y-4">
                <input value={verificationCode} onChange={e => setVerificationCode(e.target.value)} inputMode="numeric" maxLength={6} required autoFocus dir="ltr" className="h-16 w-full rounded-2xl border border-white/10 bg-slate-950/50 text-center font-mono text-3xl font-black tracking-[.5em] text-white focus:border-emerald-400 focus:outline-none" placeholder="000000" />
                <button type="submit" disabled={isLoading} className="flex h-12 w-full items-center justify-center rounded-2xl bg-emerald-500 text-sm font-black text-slate-950 disabled:opacity-50">{isLoading ? '...' : (isArabic ? 'تأكيد وإنشاء الشركة' : 'Verify and create company')}</button>
                <button type="button" onClick={() => { setError(null); setMode('REGISTER'); }} className="w-full text-xs font-bold text-slate-400">{isArabic ? 'تعديل بيانات التسجيل' : 'Edit registration details'}</button>
              </form>}
              {mode === 'CREATED' && <div className="space-y-5">
                <div className="rounded-2xl border border-emerald-400/25 bg-emerald-400/10 p-5 text-center"><div className="text-xs text-emerald-200">{isArabic ? 'كود الشركة' : 'Company code'}</div><div className="mt-2 font-mono text-3xl font-black tracking-[.25em] text-white">{createdCompanyCode}</div></div>
                <button type="button" onClick={() => setMode('LOGIN')} className="flex h-12 w-full items-center justify-center rounded-2xl bg-emerald-500 text-sm font-black text-slate-950">{isArabic ? 'الدخول الآن' : 'Sign in now'}</button>
              </div>}
            </div>
            <div className="mt-7 text-center text-[11px] leading-5 text-slate-600"><p>{t('loginFooter')}</p><p className="mt-1">{t('designedBy')} <span className="font-bold text-slate-500">Shadi Nassef</span></p></div>
          </div>
        </section>
      </div>
    </main>
  );
};

const MasarLogo: React.FC<{ compact?: boolean }> = ({ compact }) => (
  <div className="flex items-center gap-3" aria-label="Masar">
    <div className={`${compact ? 'h-11 w-11 rounded-2xl' : 'h-13 w-13 rounded-[1.15rem]'} relative flex items-center justify-center overflow-hidden border border-emerald-300/25 bg-gradient-to-br from-emerald-400 to-teal-600 text-slate-950 shadow-lg shadow-emerald-950/30`}><Route className={compact ? 'h-6 w-6' : 'h-7 w-7'} strokeWidth={2.6} /><span className="absolute end-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-white/80" /></div>
    <div className="leading-none"><div className={`${compact ? 'text-xl' : 'text-2xl'} font-black tracking-tight text-white`}>مسار <span className="font-semibold text-emerald-300">Masar</span></div>{!compact && <div className="mt-1.5 text-[10px] font-bold tracking-[.22em] text-slate-500">PAYROLL & PEOPLE</div>}</div>
  </div>
);

const LoginField: React.FC<{ label: string; icon: React.ReactNode; children: React.ReactNode }> = ({ label, icon, children }) => (
  <label className="block"><span className="mb-2 block text-xs font-bold text-slate-300">{label}</span><span className="relative block"><span className="absolute start-4 top-1/2 z-10 -translate-y-1/2 text-slate-500">{icon}</span>{children}</span></label>
);

const RegisterInput: React.FC<{icon:React.ReactNode; placeholder:string; value:string; onChange:(value:string)=>void; type?:string; required?:boolean; wide?:boolean}> = ({icon,placeholder,value,onChange,type='text',required,wide}) => (
  <label className={wide ? 'col-span-2' : ''}><span className="relative block"><span className="absolute start-3.5 top-1/2 -translate-y-1/2 text-slate-500">{icon}</span><input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} required={required} dir={type === 'email' || type === 'password' ? 'ltr' : undefined} className="h-11 w-full rounded-xl border border-white/10 bg-slate-950/45 ps-10 pe-3 text-xs text-white placeholder:text-slate-500 focus:border-emerald-400/70 focus:outline-none" /></span></label>
);
