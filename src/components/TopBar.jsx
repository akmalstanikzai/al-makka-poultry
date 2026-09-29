import React, { useState } from 'react';
import { useDatabase } from '../context/DatabaseContext';
import { Menu, Bell, Wallet, AlertTriangle, SlidersHorizontal, CheckCircle2, Globe2, X } from 'lucide-react';
export const TopBar = ({ activeTab, setActiveTab, onOpenMobileMenu, onOpenRestockModal, }) => {
    const { lang, setLang, t, db, lowStockThreshold, setLowStockThreshold, lowStockMaterials, getLocalizedName } = useDatabase();
    const [showNotificationModal, setShowNotificationModal] = useState(false);
    const [editingThreshold, setEditingThreshold] = useState(false);
    const [thresholdInput, setThresholdInput] = useState(lowStockThreshold.toString());
    const isRtl = lang === 'fa' || lang === 'ps';
    const getTabTitle = () => {
        switch (activeTab) {
            case 'dashboard': return t.navDashboard;
            case 'inventory': return t.navInventory;
            case 'stock-overview': return t.navStockOverview;
            case 'formula': return t.navFormula;
            case 'sales': return t.navSales;
            case 'suppliers': return t.navSuppliers;
            case 'customers': return t.navCustomers;
            case 'expenses': return t.navExpenses;
            case 'reports': return t.navReports;
            default: return t.companyName;
        }
    };
    const handleSaveThreshold = (e) => {
        e.preventDefault();
        const val = Number(thresholdInput);
        if (!isNaN(val) && val > 0) {
            setLowStockThreshold(val);
            setEditingThreshold(false);
        }
    };
    const handleGoToInventory = () => {
        setActiveTab('inventory');
        setShowNotificationModal(false);
        if (onOpenRestockModal) {
            onOpenRestockModal();
        }
    };
    return (<>
      <header className="sticky top-0 z-20 bg-white/90 backdrop-blur-md border-b border-slate-200 px-4 sm:px-6 py-3 flex items-center justify-between gap-3 shadow-xs">
        {/* Left / Start: Mobile Menu Toggle & Title */}
        <div className="flex items-center gap-3 min-w-0">
          <button type="button" onClick={onOpenMobileMenu} className="lg:hidden p-2 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors">
            <Menu className="w-5 h-5"/>
          </button>

          <div>
            <h1 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight truncate flex items-center gap-2">
              <span>{getTabTitle()}</span>
            </h1>
            <span className="text-[11px] text-slate-500 hidden md:inline-flex items-center gap-1.5 font-medium">
              <span>{t.companyName}</span>
              <span className="text-slate-300">•</span>
              <span className="text-amber-700 font-mono" dir="ltr">0780 001 923</span>
            </span>
          </div>
        </div>

        {/* Right / End: Notification Bell, Cash Balance, Language & Profile */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Cash in Hand Quick Badge */}
          <div onClick={() => setActiveTab('expenses')} className="cursor-pointer hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 hover:border-amber-400 transition-all text-xs shadow-2xs" title={t.moneyInHandCard}>
            <Wallet className="w-4 h-4 text-emerald-600"/>
            <div className="flex flex-col text-start">
              <span className="text-[10px] text-slate-500 leading-none">{t.moneyInHandCard}</span>
              <span className="font-bold text-emerald-700 font-mono">
                {db.cashInHand.toLocaleString()} {t.currency}
              </span>
            </div>
          </div>

          {/* Low Stock Notification Bell */}
          <button type="button" onClick={() => setShowNotificationModal(true)} className={`relative p-2 rounded-xl border transition-all ${lowStockMaterials.length > 0
            ? 'bg-rose-50 border-rose-200 text-rose-600 hover:bg-rose-100 animate-pulse'
            : 'bg-slate-50 border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-100'}`} title={t.notifications}>
            <Bell className="w-5 h-5"/>
            {lowStockMaterials.length > 0 && (<span className="absolute -top-1 -end-1 w-5 h-5 rounded-full bg-rose-600 text-white text-[10px] font-bold flex items-center justify-center shadow-md">
                {lowStockMaterials.length}
              </span>)}
          </button>

          {/* Language Switcher in Top Bar */}
          <div className="flex items-center gap-0.5 bg-slate-50 border border-slate-200 p-1 rounded-xl text-xs">
            <Globe2 className="w-3.5 h-3.5 text-slate-500 mx-1 hidden sm:block"/>
            {['fa', 'ps', 'en'].map((l) => (<button key={l} type="button" onClick={() => setLang(l)} className={`px-2 py-0.5 text-[11px] font-bold rounded-lg transition-all ${lang === l
                ? 'bg-amber-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'}`}>
                {l === 'fa' ? 'دری' : l === 'ps' ? 'پښتو' : 'EN'}
              </button>))}
          </div>

        </div>
      </header>

      {/* Visual Notification System Modal */}
      {showNotificationModal && (<div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="w-full max-w-xl bg-white border border-slate-200 rounded-2xl shadow-2xl p-6 relative max-h-[90vh] overflow-y-auto text-slate-900" dir={isRtl ? 'rtl' : 'ltr'}>
            {/* Header */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className={`p-2.5 rounded-xl ${lowStockMaterials.length > 0 ? 'bg-rose-100 text-rose-600' : 'bg-emerald-100 text-emerald-600'}`}>
                  <AlertTriangle className="w-6 h-6"/>
                </div>
                <div>
                  <h3 className="font-bold text-lg text-slate-900">{t.lowStockNotificationTitle}</h3>
                  <p className="text-xs text-slate-500">{t.notifications}</p>
                </div>
              </div>
              <button type="button" onClick={() => setShowNotificationModal(false)} className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100">
                <X className="w-5 h-5"/>
              </button>
            </div>

            {/* Threshold Configuration Banner */}
            <div className="mt-4 p-4 rounded-xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <span className="text-xs text-slate-500 block">{t.lowStockThresholdLabel}</span>
                <span className="text-base font-bold text-amber-700 font-mono">
                  {lowStockThreshold.toLocaleString()} {t.kilo}
                </span>
              </div>
              
              {!editingThreshold ? (<button type="button" onClick={() => {
                    setThresholdInput(lowStockThreshold.toString());
                    setEditingThreshold(true);
                }} className="px-3 py-1.5 rounded-lg bg-white border border-slate-300 hover:bg-slate-100 text-xs font-semibold text-slate-700 flex items-center gap-1.5 transition-colors self-start sm:self-auto shadow-2xs">
                  <SlidersHorizontal className="w-3.5 h-3.5"/>
                  <span>{t.configureThreshold}</span>
                </button>) : (<form onSubmit={handleSaveThreshold} className="flex items-center gap-2">
                  <input type="number" min="100" step="100" value={thresholdInput} onChange={(e) => setThresholdInput(e.target.value)} className="w-28 bg-white border border-slate-300 rounded-lg px-2.5 py-1 text-xs font-mono text-slate-900 focus:outline-none focus:border-amber-500 shadow-2xs"/>
                  <button type="submit" className="px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-xs">
                    {t.saveThreshold}
                  </button>
                  <button type="button" onClick={() => setEditingThreshold(false)} className="px-2 py-1 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs">
                    {t.cancel}
                  </button>
                </form>)}
            </div>

            {/* Low Stock Items List */}
            <div className="mt-5 space-y-3">
              <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                {lowStockMaterials.length > 0 ? t.itemsNeedRestock : t.statusNormal}
              </h4>

              {lowStockMaterials.length === 0 ? (<div className="p-6 rounded-xl bg-emerald-50 border border-emerald-200 text-center">
                  <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto mb-2"/>
                  <p className="text-sm font-semibold text-emerald-800">
                    {t.allStockHealthy}
                  </p>
                  <p className="text-xs text-emerald-600 mt-1">
                    {t.lowStockThresholdLabel} {lowStockThreshold.toLocaleString()} {t.kilo}
                  </p>
                </div>) : (<div className="space-y-2.5 max-h-64 overflow-y-auto pe-1">
                  {lowStockMaterials.map((item) => {
                    const percent = Math.min(100, Math.round((item.stockKg / lowStockThreshold) * 100));
                    return (<div key={item.id} className="p-3.5 rounded-xl bg-rose-50/60 border border-rose-200 flex items-center justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-sm text-slate-900 truncate">
                              {getLocalizedName(item.name)}
                            </span>
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-100 text-rose-700 border border-rose-200">
                              {t.statusLow}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 text-xs text-slate-600 mt-1">
                            <span>
                              {t.currentStockLabel}: <strong className="text-rose-700 font-mono">{item.stockKg.toLocaleString()} {t.kilo}</strong>
                            </span>
                            <span>•</span>
                            <span>
                              {t.thresholdLimitLabel}: <span className="font-mono">{lowStockThreshold.toLocaleString()} {t.kilo}</span>
                            </span>
                          </div>
                          {/* Progress bar */}
                          <div className="w-full bg-slate-200 rounded-full h-1.5 mt-2 overflow-hidden">
                            <div className="bg-rose-600 h-1.5 rounded-full transition-all" style={{ width: `${percent}%` }}/>
                          </div>
                        </div>

                        <button type="button" onClick={handleGoToInventory} className="px-3 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shrink-0 transition-colors shadow-xs">
                          {t.restockNow}
                        </button>
                      </div>);
                })}
                </div>)}
            </div>

            {/* Modal Actions */}
            <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between">
              <span className="text-xs text-slate-500">
                {t.companyName} • {t.activeFactory}
              </span>
              <button type="button" onClick={() => setShowNotificationModal(false)} className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold">
                {t.cancel}
              </button>
            </div>
          </div>
        </div>)}
    </>);
};
