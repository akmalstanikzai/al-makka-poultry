import { localDateValue, reportDateRange, formatReportDate } from '../lib/recordDate';
import { buildReport } from '../lib/reportData';
import { ReportDocument } from '../components/ReportDocument';
import React, { useState } from 'react';
import { useDatabase } from '../context/DatabaseContext';
import { FileSpreadsheet, Printer, Download, Upload, RotateCcw, CheckCircle2, FileText } from 'lucide-react';
export const ReportsPage = () => {
    const { db, t, lang, exportDatabase, importDatabase, resetToDefaultData } = useDatabase();
    const [period, setPeriod] = useState('daily');
    const [importStatus, setImportStatus] = useState(null);
    const [showResetConfirm, setShowResetConfirm] = useState(false);
    const [selectedDate, setSelectedDate] = useState(() => localDateValue());
    const [selectedMonth, setSelectedMonth] = useState(() => localDateValue().slice(0, 7));
    const [customStart, setCustomStart] = useState(() => localDateValue());
    const [customEnd, setCustomEnd] = useState(() => localDateValue());
    const range = reportDateRange(period, selectedDate, selectedMonth, customStart, customEnd);
    const report = buildReport(db, range);
    const labels = t.reporting;
    const formatDate = value => formatReportDate(value, lang, t);
    const rangeLabel = period === 'all' ? labels.allDates : range.valid ? (range.start === range.end ? formatDate(range.start) : `${formatDate(range.start)} — ${formatDate(range.end)}`) : labels.invalidRange;
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
    const getPeriodLabel = p => ({ daily: labels.day, weekly: labels.week, monthly: labels.month, custom: labels.custom, all: t.all }[p]);
    return (<div className="space-y-4">
      {/* Header with period toggle and print */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4 print:hidden">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-100 text-amber-700">
              <FileSpreadsheet className="w-5 h-5"/>
            </div>
            <span>{t.navReports}</span>
          </h2>

        </div>

        {/* Period Selector & Print CTA */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex flex-wrap items-center bg-slate-100 p-1 rounded-xl border border-slate-200">
            {['daily', 'weekly', 'monthly', 'custom', 'all'].map((p) => (<button key={p} type="button" aria-pressed={period === p} onClick={() => setPeriod(p)} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${period === p
                ? 'bg-amber-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'}`}>
                {getPeriodLabel(p)}
              </button>))}
          </div>

          <button type="button" disabled={!range.valid} onClick={async () => { await document.fonts.ready; window.print(); }} className="flex items-center gap-1.5 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold shadow-md shadow-amber-600/25 transition-all cursor-pointer">
            <Printer className="w-4 h-4"/>
            <span>{t.printReport}</span>
          </button>
        </div>
      </div>

      {importStatus && (<div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4"/>
          <span>{importStatus}</span>
        </div>)}

      <div className="rounded-2xl border border-slate-200 bg-white p-3 print:hidden">
        <div className="flex flex-wrap items-end gap-4">
          {(period === 'daily' || period === 'weekly') && <label className="block text-xs font-semibold text-slate-700"><span className="mb-1 block">{period === 'weekly' ? labels.weekEnding : t.date}</span><input required type="date" value={selectedDate} onChange={event => setSelectedDate(event.target.value)} className="rounded-xl border border-slate-300 px-3 py-2 text-sm"/></label>}
          {period === 'monthly' && <label className="block text-xs font-semibold text-slate-700"><span className="mb-1 block">{labels.month}</span><input required type="month" value={selectedMonth} onChange={event => setSelectedMonth(event.target.value)} className="rounded-xl border border-slate-300 px-3 py-2 text-sm"/></label>}
          {period === 'custom' && <>
            <label className="block text-xs font-semibold text-slate-700"><span className="mb-1 block">{labels.from}</span><input required type="date" value={customStart} max={customEnd || undefined} onChange={event => setCustomStart(event.target.value)} className="rounded-xl border border-slate-300 px-3 py-2 text-sm"/></label>
            <label className="block text-xs font-semibold text-slate-700"><span className="mb-1 block">{labels.to}</span><input required type="date" value={customEnd} min={customStart || undefined} onChange={event => setCustomEnd(event.target.value)} className="rounded-xl border border-slate-300 px-3 py-2 text-sm"/></label>
          </>}
          <p className="py-2 text-sm font-semibold text-slate-700" aria-live="polite">{rangeLabel}</p>
        </div>
        {period === 'weekly' && <p className="mt-2 text-xs text-slate-500">{labels.weekNote}</p>}
        {!range.valid && <p role="alert" className="mt-2 text-sm text-rose-700">{labels.invalidRange}</p>}
      </div>
      {db.purchaseHistoryAvailable === false && <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 print:hidden">{labels.purchaseHistoryPending}</p>}
      {range.valid && <ReportDocument report={report} rangeLabel={rangeLabel} periodLabel={getPeriodLabel(period)} lang={lang} t={t}/>}

      {/* Database Backup & Restore / Reset Section (Print Hidden) */}
      <details className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm print:hidden">
        <summary className="text-sm font-bold text-slate-700 flex items-center gap-2 cursor-pointer">
          <FileText className="w-4 h-4 text-amber-600"/>
          <span>{t.backupManagementTitle}</span>
        </summary>
        <p className="text-xs text-slate-600 mt-3 mb-4">
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
      </details>

      {/* Developed By Footer */}
      <div className="text-center pt-4 border-t border-slate-200 text-xs font-mono text-slate-500 print:hidden">
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
