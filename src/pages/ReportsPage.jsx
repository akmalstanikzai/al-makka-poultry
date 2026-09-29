import React, { useState } from 'react';
import { useDatabase } from '../context/DatabaseContext';
import { FileSpreadsheet, Printer, Download, Upload, RotateCcw, PackageCheck, Scale, Wheat, CheckCircle2, FileText } from 'lucide-react';
export const ReportsPage = () => {
    const { db, t, exportDatabase, importDatabase, resetToDefaultData } = useDatabase();
    const [period, setPeriod] = useState('daily');
    const [importStatus, setImportStatus] = useState(null);
    const [showResetConfirm, setShowResetConfirm] = useState(false);
    // Helper date filtering
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const getStartDate = () => {
        const d = new Date();
        if (period === 'daily')
            return todayStr;
        if (period === 'weekly') {
            d.setDate(d.getDate() - 7);
            return d.toISOString().split('T')[0];
        }
        if (period === 'monthly') {
            d.setDate(d.getDate() - 30);
            return d.toISOString().split('T')[0];
        }
        return '1970-01-01';
    };
    const startDate = getStartDate();
    // Filter items in period
    const filteredSales = db.sales.filter(s => period === 'all' || (s.date >= startDate && s.date <= todayStr));
    const filteredBatches = db.productionBatches.filter(b => period === 'all' || (b.date >= startDate && b.date <= todayStr));
    const filteredExpenses = db.expenses.filter(e => period === 'all' || (e.date >= startDate && e.date <= todayStr));
    // Financial aggregates
    const totalSalesRevenue = filteredSales.reduce((acc, s) => acc + s.totalAmount, 0);
    const totalSalesCogs = filteredSales.reduce((acc, s) => acc + s.totalCostOfGoods, 0);
    const totalExpensesSum = filteredExpenses.reduce((acc, e) => acc + e.amount, 0);
    const totalGrossProfit = totalSalesRevenue - totalSalesCogs;
    const netProfit = totalGrossProfit - totalExpensesSum;
    const totalProducedKg = filteredBatches.reduce((acc, b) => acc + b.totalWeightKg, 0);
    const totalProducedBags = Math.round((totalProducedKg / 50) * 100) / 100;
    const handleFileUpload = (e) => {
        const file = e.target.files?.[0];
        if (!file)
            return;
        const reader = new FileReader();
        reader.onload = (event) => {
            const content = event.target?.result;
            if (content) {
                const success = importDatabase(content);
                if (success) {
                    setImportStatus(t.dbRestoreSuccess);
                    setTimeout(() => setImportStatus(null), 4000);
                }
                else {
                    setImportStatus(t.dbRestoreError);
                    setTimeout(() => setImportStatus(null), 4000);
                }
            }
        };
        reader.readAsText(file);
    };
    const getPeriodLabel = (p) => {
        switch (p) {
            case 'daily': return t.todayFilter;
            case 'weekly': return t.lastWeekFilter;
            case 'monthly': return t.lastMonthFilter;
            case 'all': return t.all;
        }
    };
    return (<div className="space-y-6">
      {/* Header with period toggle and print */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4 print:hidden">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-100 text-amber-700">
              <FileSpreadsheet className="w-5 h-5"/>
            </div>
            <span>{t.reportsTitle}</span>
          </h2>
          <p className="text-xs sm:text-sm text-slate-600 mt-1">
            {t.reportsDesc}
          </p>
        </div>

        {/* Period Selector & Print CTA */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200">
            {['daily', 'weekly', 'monthly', 'all'].map((p) => (<button key={p} type="button" onClick={() => setPeriod(p)} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${period === p
                ? 'bg-amber-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'}`}>
                {getPeriodLabel(p)}
              </button>))}
          </div>

          <button type="button" onClick={() => window.print()} className="flex items-center gap-1.5 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold shadow-md shadow-amber-600/25 transition-all cursor-pointer">
            <Printer className="w-4 h-4"/>
            <span>{t.printReport}</span>
          </button>
        </div>
      </div>

      {importStatus && (<div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4"/>
          <span>{importStatus}</span>
        </div>)}

      {/* Printable Report Section */}
      <div className="space-y-6 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm print:shadow-none print:border-none print:p-0">
        {/* Report Header for Print */}
        <div className="hidden print:block text-center pb-6 border-b-2 border-black">
          <h1 className="text-2xl font-black">{t.companyName}</h1>
          <p className="text-sm font-medium mt-1">{t.companySubtitle}</p>
          <p className="text-xs text-slate-600 mt-1">
            {t.factoryBalanceReportSubtitle} ({getPeriodLabel(period)}) • {t.date}: {todayStr}
          </p>
        </div>

        {/* Financial & Production KPI Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm">
            <span className="text-xs font-semibold text-slate-500">{t.periodSalesTotal}</span>
            <div className="text-xl font-bold font-mono text-slate-900 mt-1">
              {totalSalesRevenue.toLocaleString()} {t.currency}
            </div>
            <span className="text-xs text-amber-700 font-medium">
              {filteredSales.length} {t.recordedInvoicesCount}
            </span>
          </div>

          <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm">
            <span className="text-xs font-semibold text-slate-500">{t.factoryExpensesTotal}</span>
            <div className="text-xl font-bold font-mono text-rose-700 mt-1">
              {totalExpensesSum.toLocaleString()} {t.currency}
            </div>
            <span className="text-xs text-rose-600 font-medium">
              {filteredExpenses.length} {t.expensesCountLabel}
            </span>
          </div>

          <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm">
            <span className="text-xs font-semibold text-slate-500">{t.operationalGrossProfit}</span>
            <div className="text-xl font-bold font-mono text-emerald-700 mt-1">
              {totalGrossProfit.toLocaleString()} {t.currency}
            </div>
            <span className="text-xs text-emerald-600 font-medium">{t.cogsDeductedLabel}</span>
          </div>

          <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm">
            <span className="text-xs font-semibold text-slate-500">{t.netProfit}</span>
            <div className={`text-xl font-bold font-mono mt-1 ${netProfit >= 0 ? 'text-emerald-800' : 'text-rose-700'}`}>
              {netProfit.toLocaleString()} {t.currency}
            </div>
            <span className="text-xs text-slate-500">{t.afterAllExpenses}</span>
          </div>
        </div>

        {/* Production Output Summary */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-between">
            <div>
              <span className="text-xs font-semibold text-slate-500">{t.feedProducedInPeriod}</span>
              <div className="text-xl font-bold font-mono text-slate-900 mt-1">
                {totalProducedKg.toLocaleString()} {t.kilo}
              </div>
              <span className="text-xs text-amber-700 font-medium">
                {t.equivalentTonRate} {totalProducedBags.toLocaleString()} {t.bag}
              </span>
            </div>
            <div className="p-3 bg-amber-100 text-amber-700 rounded-xl">
              <PackageCheck className="w-6 h-6"/>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-between">
            <div>
              <span className="text-xs font-semibold text-slate-500">{t.prodBatchesLine}</span>
              <div className="text-xl font-bold font-mono text-slate-900 mt-1">
                {filteredBatches.length} {t.records}
              </div>
              <span className="text-xs text-slate-500">{t.autoProcessLine}</span>
            </div>
            <div className="p-3 bg-blue-100 text-blue-700 rounded-xl">
              <Scale className="w-6 h-6"/>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-between">
            <div>
              <span className="text-xs font-semibold text-slate-500">{t.rawMaterialsConsumed}</span>
              <div className="text-xl font-bold font-mono text-slate-900 mt-1">
                {db.rawMaterials.reduce((acc, r) => acc + r.stockKg, 0).toLocaleString()} {t.kilo}
              </div>
              <span className="text-xs text-slate-500">{t.currentSiloStock}</span>
            </div>
            <div className="p-3 bg-emerald-100 text-emerald-700 rounded-xl">
              <Wheat className="w-6 h-6"/>
            </div>
          </div>
        </div>
      </div>

      {/* Database Backup & Restore / Reset Section (Print Hidden) */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm print:hidden">
        <h3 className="text-base font-bold text-slate-900 flex items-center gap-2 mb-2">
          <FileText className="w-4 h-4 text-amber-600"/>
          <span>{t.backupManagementTitle}</span>
        </h3>
        <p className="text-xs text-slate-600 mb-6">
          {t.backupManagementDesc}
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Export JSON */}
          <button type="button" onClick={exportDatabase} className="p-4 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-900 flex items-center gap-3 transition-colors text-start group cursor-pointer">
            <div className="p-3 rounded-lg bg-amber-100 text-amber-700 group-hover:bg-amber-200 transition-colors">
              <Download className="w-5 h-5"/>
            </div>
            <div>
              <span className="font-bold block text-sm">{t.downloadBackupJson}</span>
              <span className="text-xs text-slate-500">{t.saveDataLocally}</span>
            </div>
          </button>

          {/* Import JSON */}
          <label className="p-4 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-900 flex items-center gap-3 transition-colors text-start cursor-pointer group">
            <div className="p-3 rounded-lg bg-blue-100 text-blue-700 group-hover:bg-blue-200 transition-colors">
              <Upload className="w-5 h-5"/>
            </div>
            <div>
              <span className="font-bold block text-sm">{t.restoreDataUpload}</span>
              <span className="text-xs text-slate-500">{t.uploadPreviousBackup}</span>
            </div>
            <input type="file" accept=".json" onChange={handleFileUpload} className="hidden"/>
          </label>

          {/* Reset to Factory Defaults */}
          <button type="button" onClick={() => setShowResetConfirm(true)} className="p-4 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-rose-700 flex items-center gap-3 transition-colors text-start group cursor-pointer">
            <div className="p-3 rounded-lg bg-rose-100 text-rose-700 group-hover:bg-rose-200 transition-colors">
              <RotateCcw className="w-5 h-5"/>
            </div>
            <div>
              <span className="font-bold block text-sm">{t.resetFactoryTitle}</span>
              <span className="text-xs text-rose-600">{t.cleanAndLoadSampleData}</span>
            </div>
          </button>
        </div>
      </div>

      {/* Developed By Footer (Visible on Screen and Print) */}
      <div className="text-center pt-4 border-t border-slate-200 text-xs font-mono text-slate-500 print:text-black">
        {t.developedBy}
      </div>

      {/* Reset Confirmation Modal */}
      {showResetConfirm && (<div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-xl border border-slate-200 text-center">
            <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto mb-4">
              <RotateCcw className="w-6 h-6"/>
            </div>
            <h3 className="text-base font-bold text-slate-900 mb-2">
              {t.resetDatabase}
            </h3>
            <p className="text-xs text-slate-600 mb-6">
              {t.confirmResetDatabase}
            </p>
            <div className="flex gap-3">
              <button type="button" onClick={() => setShowResetConfirm(false)} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer">
                {t.cancel}
              </button>
              <button type="button" onClick={() => {
                resetToDefaultData();
                setShowResetConfirm(false);
            }} className="flex-1 py-2.5 rounded-xl bg-rose-600 text-xs font-bold text-white hover:bg-rose-700 transition-colors cursor-pointer">
                {t.resetDatabase}
              </button>
            </div>
          </div>
        </div>)}
    </div>);
};
