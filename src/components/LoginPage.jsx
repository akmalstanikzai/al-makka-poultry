import React, { useState } from 'react';
import { useDatabase } from '../context/DatabaseContext';
import { Lock, Mail, ArrowRight, ArrowLeft, ShieldCheck, Wheat, AlertCircle, Globe2 } from 'lucide-react';
export const LoginPage = () => {
    const { lang, setLang, t, login } = useDatabase();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState(null);
    const [showPassword, setShowPassword] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const handleSubmit = async (e) => {
        e.preventDefault();
        setError(null);
        if (!email || !password) {
            setError(t.invalidCredentials);
            return;
        }
        setIsSubmitting(true);
        const result = await login(email, password);
        setIsSubmitting(false);
        if (!result.success) {
            setError(result.error || t.invalidCredentials);
        }
    };
    const isRtl = lang === 'fa' || lang === 'ps';
    const ArrowIcon = isRtl ? ArrowLeft : ArrowRight;
    return (<div className="min-h-screen w-full bg-slate-100 text-slate-900 flex flex-col justify-between relative overflow-hidden" dir={isRtl ? 'rtl' : 'ltr'}>
      {/* Ambient background glows */}
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-amber-200/50 rounded-full blur-3xl pointer-events-none"/>
      <div className="absolute top-1/3 -right-40 w-96 h-96 bg-emerald-200/40 rounded-full blur-3xl pointer-events-none"/>
      <div className="absolute -bottom-40 left-1/3 w-96 h-96 bg-amber-300/30 rounded-full blur-3xl pointer-events-none"/>

      {/* Top Bar with Language Selector */}
      <header className="relative z-10 max-w-7xl w-full mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-600 to-amber-500 flex items-center justify-center shadow-md shadow-amber-500/20 text-white font-bold">
            <Wheat className="w-6 h-6"/>
          </div>
          <div>
            <span className="font-bold text-base sm:text-lg tracking-tight text-slate-900 block">
              {t.companyName}
            </span>
            <span className="text-xs text-amber-700 font-medium">
              {t.activeFactory} • ERP System
            </span>
          </div>
        </div>

        {/* Language switcher */}
        <div className="flex items-center gap-1 bg-white border border-slate-200 p-1 rounded-xl shadow-xs">
          <Globe2 className="w-4 h-4 text-slate-500 mx-1.5"/>
          {['fa', 'ps', 'en'].map((l) => (<button key={l} type="button" onClick={() => setLang(l)} className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all ${lang === l
                ? 'bg-amber-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'}`}>
              {l === 'fa' ? 'دری' : l === 'ps' ? 'پښتو' : 'EN'}
            </button>))}
        </div>
      </header>

      {/* Main Login Card */}
      <main className="relative z-10 flex-1 flex items-center justify-center px-4 py-8 sm:py-12">
        <div className="w-full max-w-md">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 shadow-xl shadow-slate-200/50 relative">
            {/* Top decorative accent bar */}
            <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-amber-500 via-amber-600 to-emerald-600 rounded-t-2xl"/>

            {/* Header */}
            <div className="text-center mb-6">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-amber-100 border border-amber-200 text-amber-700 mb-3 shadow-inner">
                <ShieldCheck className="w-7 h-7"/>
              </div>
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
                {t.loginTitle}
              </h1>
              <p className="text-xs sm:text-sm text-slate-600 mt-1.5 leading-relaxed">
                {t.loginSubtitle}
              </p>
            </div>

            {/* Error Message */}
            {error && (<div className="mb-5 p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2.5">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-600"/>
                <span>{error}</span>
              </div>)}

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  {t.emailLabel}
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 start-0 flex items-center ps-3.5 pointer-events-none text-slate-400">
                    <Mail className="w-4 h-4"/>
                  </div>
                  <input type="text" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Rayan@poletry.af" className="w-full bg-slate-50 border border-slate-300 rounded-xl py-2.5 ps-10 pe-4 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-amber-600 focus:ring-1 focus:ring-amber-600 transition-colors shadow-2xs"/>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-semibold text-slate-700">
                    {t.passwordLabel}
                  </label>
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="text-[11px] text-slate-500 hover:text-amber-700 transition-colors font-medium cursor-pointer">
                    {showPassword ? (lang === 'fa' ? 'مخفی' : lang === 'ps' ? 'پټول' : 'Hide') : (lang === 'fa' ? 'نمایش' : lang === 'ps' ? 'ښودل' : 'Show')}
                  </button>
                </div>
                <div className="relative">
                  <div className="absolute inset-y-0 start-0 flex items-center ps-3.5 pointer-events-none text-slate-400">
                    <Lock className="w-4 h-4"/>
                  </div>
                  <input type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" className="w-full bg-slate-50 border border-slate-300 rounded-xl py-2.5 ps-10 pe-4 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-amber-600 focus:ring-1 focus:ring-amber-600 transition-colors shadow-2xs"/>
                </div>
              </div>

              <button type="submit" disabled={isSubmitting} className="w-full mt-2 py-3 px-4 rounded-xl bg-amber-600 hover:bg-amber-700 disabled:bg-amber-400 disabled:cursor-wait text-white font-bold text-sm shadow-md shadow-amber-600/20 transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-[0.99]">
                <span>{isSubmitting ? 'Signing in…' : t.loginBtn}</span>
                <ArrowIcon className="w-4 h-4"/>
              </button>
            </form>

            <button type="button" onClick={() => {
            setEmail('Rayan@poletry.af');
            setPassword('Rayan6789');
            setError(null);
        }} className="w-full mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-800 hover:bg-amber-100 transition-colors">
              {t.fillDemoBtn}
            </button>
            <p className="mt-2 text-center text-[11px] leading-5 text-slate-500" dir="ltr">
              {t.demoCredentialsNotice}
            </p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 py-4 text-center text-xs text-slate-500 border-t border-slate-200 bg-white/60 flex flex-col sm:flex-row items-center justify-center gap-2">
        <span>{t.companyName} • {t.securityVerified}</span>
        <span className="hidden sm:inline">•</span>
        <span className="text-slate-700 font-mono" dir="ltr">📞 0780 001 923</span>
      </footer>
    </div>);
};
