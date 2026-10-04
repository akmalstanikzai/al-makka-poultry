import React, { useState } from 'react';
import { Search, Warehouse, Wheat, PackageCheck, Scale, DollarSign, X } from 'lucide-react';
import { useDatabase } from '../context/DatabaseContext';

export const StockOverviewPage = () => {
    const { db, t, lang, getLocalizedName, getLocalizedCat } = useDatabase();
    const [rawSearchTerm, setRawSearchTerm] = useState('');
    const [processedSearchTerm, setProcessedSearchTerm] = useState('');
    const [showAllRaw, setShowAllRaw] = useState(false);
    const [showAllProcessed, setShowAllProcessed] = useState(false);
    const rawSearch = rawSearchTerm.trim().toLowerCase();
    const processedSearch = processedSearchTerm.trim().toLowerCase();
    const rawMaterials = db.rawMaterials.filter(item => [getLocalizedName(item.name), item.name, item.supplierName, getLocalizedCat(item.category)].some(value => value?.toLowerCase().includes(rawSearch)));
    const processedMaterials = db.processedStock.filter(item => [getLocalizedName(item.name), item.name].some(value => value?.toLowerCase().includes(processedSearch)));
    const visibleRawMaterials = showAllRaw ? rawMaterials : rawMaterials.slice(0, 20);
    const visibleProcessedMaterials = showAllProcessed ? processedMaterials : processedMaterials.slice(0, 20);
    const rawKg = db.rawMaterials.reduce((sum, item) => sum + (item.stockKg || 0), 0);
    const processedKg = db.processedStock.reduce((sum, item) => sum + (item.stockKg || 0), 0);
    const rawValue = db.rawMaterials.reduce((sum, item) => sum + ((item.stockKg || 0) * (item.unitPrice || 0)), 0);
    const processedValue = db.processedStock.reduce((sum, item) => sum + ((item.stockKg || 0) * (item.averageCostPerKg || 0)), 0);
    const labels = lang === 'fa' ? { rawSearch: 'جستجوی مواد خام...', processedSearch: 'جستجوی مواد پروسس‌شده...', more: 'نمایش بیشتر' } : lang === 'ps' ? { rawSearch: 'د خامو موادو لټون...', processedSearch: 'د پروسس شوو موادو لټون...', more: 'نور ښکاره کړئ' } : { rawSearch: 'Search raw materials...', processedSearch: 'Search processed materials...', more: 'See more' };

    return (<div className="space-y-6">
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm"><h2 className="text-xl font-bold text-slate-900 flex items-center gap-2.5"><span className="p-2 rounded-xl bg-indigo-100 text-indigo-700"><Warehouse className="w-5 h-5"/></span>{t.combinedInventoryTitle}</h2><p className="text-xs sm:text-sm text-slate-600 mt-1">{t.combinedInventoryDesc}</p></div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {[
            { label: t.rawStockCard, value: `${rawKg.toLocaleString()} ${t.kilo}`, detail: `${(rawKg / 1000).toFixed(2)} ${t.tons}`, icon: Wheat, color: 'amber' },
            { label: t.processedStockCard, value: `${processedKg.toLocaleString()} ${t.kilo}`, detail: `${(processedKg / 1000).toFixed(2)} ${t.tons}`, icon: PackageCheck, color: 'emerald' },
            { label: t.rawInventoryValue, value: `${rawValue.toLocaleString()} ${t.currency}`, detail: `${db.rawMaterials.length} ${t.records}`, icon: DollarSign, color: 'amber' },
            { label: t.processedInventoryValue, value: `${processedValue.toLocaleString()} ${t.currency}`, detail: `${db.processedStock.length} ${t.records}`, icon: Scale, color: 'emerald' },
        ].map(card => { const Icon = card.icon; const colors = card.color === 'amber' ? 'bg-amber-100 text-amber-700 border-amber-200' : 'bg-emerald-100 text-emerald-700 border-emerald-200'; return (<div key={card.label} className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm flex items-center justify-between"><div><span className="text-xs font-semibold text-slate-500">{card.label}</span><div className="text-xl font-bold font-mono text-slate-900 mt-1">{card.value}</div><span className="text-xs text-slate-500">{card.detail}</span></div><span className={`p-3 rounded-xl border ${colors}`}><Icon className="w-6 h-6"/></span></div>); })}
      </div>
      <InventorySection title={t.rawMaterialsSection} description={t.rawMaterialsSectionDesc} icon={Wheat} count={rawMaterials.length} emptyText={t.noRawMaterials} accent="amber" searchTerm={rawSearchTerm} onSearchChange={(value) => { setRawSearchTerm(value); setShowAllRaw(false); }} searchPlaceholder={labels.rawSearch} showMore={rawMaterials.length > 20 && !showAllRaw} onShowMore={() => setShowAllRaw(true)} showMoreLabel={`${labels.more} (${Math.max(0, rawMaterials.length - 20)})`}>
        {visibleRawMaterials.map(item => <RawMaterialRow key={item.id} item={item} t={t} getLocalizedName={getLocalizedName} getLocalizedCat={getLocalizedCat}/>) }
      </InventorySection>
      <InventorySection title={t.processedMaterialsSection} description={t.processedStockSubtitle} icon={PackageCheck} count={processedMaterials.length} emptyText={t.noProcessedMaterials} accent="emerald" searchTerm={processedSearchTerm} onSearchChange={(value) => { setProcessedSearchTerm(value); setShowAllProcessed(false); }} searchPlaceholder={labels.processedSearch} showMore={processedMaterials.length > 20 && !showAllProcessed} onShowMore={() => setShowAllProcessed(true)} showMoreLabel={`${labels.more} (${Math.max(0, processedMaterials.length - 20)})`}>
        {visibleProcessedMaterials.map(item => <ProcessedMaterialRow key={item.id} item={item} t={t} getLocalizedName={getLocalizedName}/>) }
      </InventorySection>
    </div>);
};

const InventorySection = ({ title, description, icon: Icon, count, emptyText, accent, children, searchTerm, onSearchChange, searchPlaceholder, showMore, onShowMore, showMoreLabel }) => (<section className="space-y-3">
  <div className="flex flex-col md:flex-row md:items-end justify-between gap-3"><div><h3 className="font-bold text-slate-900 flex items-center gap-2"><Icon className={`w-5 h-5 ${accent === 'amber' ? 'text-amber-700' : 'text-emerald-700'}`}/>{title}</h3><p className="text-xs text-slate-500 mt-1">{description}</p></div><div className="flex items-center gap-2 w-full md:w-auto"><div className="relative flex-1 md:w-80"><Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"/><input value={searchTerm} onChange={event => onSearchChange(event.target.value)} placeholder={searchPlaceholder} className={`w-full ps-9 pe-9 py-2 text-xs bg-white border border-slate-300 rounded-xl focus:outline-none ${accent === 'amber' ? 'focus:border-amber-500' : 'focus:border-emerald-500'}`}/>{searchTerm && <button type="button" onClick={() => onSearchChange('')} className="absolute end-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"><X className="w-3.5 h-3.5"/></button>}</div><span className="text-xs font-semibold bg-white border border-slate-200 rounded-full px-3 py-1">{count}</span></div></div>
  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">{count > 0 ? children : <div className="p-10 text-center text-sm text-slate-500">{emptyText}</div>}{showMore && <div className="p-3 border-t border-slate-100 text-center"><button type="button" onClick={onShowMore} className={`px-5 py-2 rounded-xl text-xs font-bold border transition-colors ${accent === 'amber' ? 'bg-amber-50 border-amber-200 text-amber-800 hover:bg-amber-100' : 'bg-emerald-50 border-emerald-200 text-emerald-800 hover:bg-emerald-100'}`}>{showMoreLabel}</button></div>}</div>
</section>);

const RawMaterialRow = ({ item, t, getLocalizedName, getLocalizedCat }) => (<div className="grid grid-cols-2 lg:grid-cols-12 gap-3 items-center px-5 py-4 border-b border-slate-100 last:border-0 hover:bg-amber-50/30"><div className="col-span-2 lg:col-span-4"><h4 className="text-sm font-bold text-slate-900">{getLocalizedName(item.name)}</h4><span className="text-[10px] text-slate-500">{getLocalizedCat(item.category)} · {item.supplierName || '—'}</span></div><Metric label={t.currentStockLabel} value={`${item.stockKg.toLocaleString()} ${t.kilo}`} className="lg:col-span-2"/><Metric label={t.unitPriceKilo} value={`${item.unitPrice.toLocaleString()} ${t.currency}`} className="lg:col-span-2"/><Metric label={t.totalValue} value={`${(item.stockKg * item.unitPrice).toLocaleString()} ${t.currency}`} className="lg:col-span-2"/><Metric label={t.date} value={item.dateAdded || '—'} className="lg:col-span-2"/></div>);
const ProcessedMaterialRow = ({ item, t, getLocalizedName }) => (<div className="grid grid-cols-2 lg:grid-cols-12 gap-3 items-center px-5 py-4 border-b border-slate-100 last:border-0 hover:bg-emerald-50/30"><div className="col-span-2 lg:col-span-4"><h4 className="text-sm font-bold text-slate-900">{getLocalizedName(item.name)}</h4><span className="text-[10px] text-slate-500">{t.lastUpdatedLabel}: {item.lastUpdated || '—'}</span></div><Metric label={t.currentStockLabel} value={`${item.stockKg.toLocaleString()} ${t.kilo}`} className="lg:col-span-2"/><Metric label={t.bagsCount} value={(item.stockKg / 50).toLocaleString(undefined, { maximumFractionDigits: 2 })} className="lg:col-span-2"/><Metric label={t.costPerKiloResult} value={`${item.averageCostPerKg.toLocaleString()} ${t.currency}`} className="lg:col-span-2"/><Metric label={t.totalValue} value={`${(item.stockKg * item.averageCostPerKg).toLocaleString()} ${t.currency}`} className="lg:col-span-2"/></div>);
const Metric = ({ label, value, className }) => <div className={className}><span className="text-[10px] text-slate-400 block">{label}</span><span className="text-sm font-bold font-mono text-slate-800">{value}</span></div>;
