import { RecordAvatar } from '../components/RecordAvatar';
import { recordTone } from '../lib/recordAppearance';
import React, { useState } from 'react';
import { Search, Warehouse, Wheat, PackageCheck, Scale, DollarSign, X, Pencil } from 'lucide-react';
import { useDatabase } from '../context/DatabaseContext';
import { rawAverageCostPerKg, rawStockValue } from '../lib/rawMaterialCost';

export const StockOverviewPage = () => {
    const { db, t, lang, updateRawMaterial } = useDatabase();
    const [rawSearchTerm, setRawSearchTerm] = useState('');
    const [processedSearchTerm, setProcessedSearchTerm] = useState('');
    const [showAllRaw, setShowAllRaw] = useState(false);
    const [showAllProcessed, setShowAllProcessed] = useState(false);
    const [editingItem, setEditingItem] = useState(null);
    const [editForm, setEditForm] = useState(null);
    const [editError, setEditError] = useState('');
    const rawSearch = rawSearchTerm.trim().toLowerCase();
    const processedSearch = processedSearchTerm.trim().toLowerCase();
    const rawMaterials = db.rawMaterials.filter(item => [item.name, item.supplierName].some(value => value?.toLowerCase().includes(rawSearch)));
    const processedMaterials = db.processedStock.filter(item => item.name?.toLowerCase().includes(processedSearch));
    const visibleRawMaterials = showAllRaw ? rawMaterials : rawMaterials.slice(0, 20);
    const visibleProcessedMaterials = showAllProcessed ? processedMaterials : processedMaterials.slice(0, 20);
    const rawKg = db.rawMaterials.reduce((sum, item) => sum + (item.stockKg || 0), 0);
    const processedKg = db.processedStock.reduce((sum, item) => sum + (item.stockKg || 0), 0);
    const rawValue = db.rawMaterials.reduce((totals, item) => { const value = rawStockValue(item); totals.AFN += value.AFN; totals.USD += value.USD; return totals; }, { AFN: 0, USD: 0 });
    const processedValue = db.processedStock.reduce((a,item)=>{a.AFN+=(item.stockKg||0)*(item.averageCostPerKg||0);a.USD+=(item.stockKg||0)*(item.averageCostPerKgUsd||0);return a;},{AFN:0,USD:0});
    const labels = lang === 'fa'
        ? { rawSearch: 'جستجوی مواد خام...', processedSearch: 'جستجوی مواد پروسس‌شده...', more: 'نمایش بیشتر', edit: 'ویرایش', editTitle: 'ویرایش مواد خام', name: 'نام جنس', stock: 'موجودی (کیلوگرام)', priceAfn: 'قیمت اوسط فی کیلو (AFN)', priceUsd: 'قیمت اوسط فی کیلو (USD)', supplier: 'نام عرضه‌کننده', threshold: 'حداقل موجودی', notes: 'یادداشت', independent: 'این تغییر فقط موجودی را ویرایش می‌کند و حساب عرضه‌کننده را تغییر نمی‌دهد.' }
        : lang === 'ps'
            ? { rawSearch: 'د خامو موادو لټون...', processedSearch: 'د پروسس شوو موادو لټون...', more: 'نور ښکاره کړئ', edit: 'سمول', editTitle: 'د خامو موادو سمون', name: 'د توکي نوم', stock: 'موجودي (کیلوګرام)', priceAfn: 'د هر کیلو منځنی لګښت (AFN)', priceUsd: 'د هر کیلو منځنی لګښت (USD)', supplier: 'د عرضه کوونکي نوم', threshold: 'د کمې زیرمې حد', notes: 'یادښت', independent: 'دا بدلون یوازې موجودي سموي او د عرضه کوونکي حساب نه بدلوي.' }
            : { rawSearch: 'Search raw materials...', processedSearch: 'Search processed materials...', more: 'See more', edit: 'Edit', editTitle: 'Edit raw stock', name: 'Item name', stock: 'Stock (kg)', priceAfn: 'Average cost per kg (AFN)', priceUsd: 'Average cost per kg (USD)', supplier: 'Supplier name', threshold: 'Low-stock threshold', notes: 'Notes', independent: 'This changes only the inventory record. Supplier balances and transactions will not change.' };
    const openEdit = item => {
        setEditingItem(item);
        setEditForm({ name: item.name || '', stockKg: item.stockKg ?? 0, averageCostPerKg: rawAverageCostPerKg(item, 'AFN'), averageCostPerKgUsd: rawAverageCostPerKg(item, 'USD'), supplierName: item.supplierName || '', lowStockThreshold: item.lowStockThreshold ?? '', notes: item.notes || '' });
        setEditError('');
    };
    const saveEdit = event => {
        event.preventDefault();
        const result = updateRawMaterial(editingItem.id, editForm);
        if (!result.success) { setEditError(result.error); return; }
        setEditingItem(null); setEditForm(null);
    };
    return (<div className="workspace-page space-y-5">
      <div className="page-hero bg-white p-5 rounded-2xl border border-slate-200 shadow-sm"><h2 className="text-xl font-bold text-slate-900 flex items-center gap-2.5"><span className="p-2 rounded-xl bg-indigo-100 text-indigo-700"><Warehouse className="w-5 h-5"/></span>{t.combinedInventoryTitle}</h2><p className="text-xs sm:text-sm text-slate-600 mt-1">{t.combinedInventoryDesc}</p></div>
      <div className="stats-grid grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">{[
        { label: t.rawStockCard, value: `${rawKg.toLocaleString()} ${t.kilo}`, detail: `${(rawKg / 1000).toFixed(2)} ${t.tons}`, icon: Wheat, color: 'amber' },
        { label: t.processedStockCard, value: `${processedKg.toLocaleString()} ${t.kilo}`, detail: `${(processedKg / 1000).toFixed(2)} ${t.tons}`, icon: PackageCheck, color: 'emerald' },
        { label: t.rawInventoryValue, value: `${rawValue.AFN.toLocaleString()} AFN · ${rawValue.USD.toLocaleString()} USD`, detail: `${db.rawMaterials.length} ${t.records}`, icon: DollarSign, color: 'amber' },
        { label: t.processedInventoryValue, value: `${processedValue.AFN.toLocaleString()} AFN · ${processedValue.USD.toLocaleString()} USD`, detail: `${db.processedStock.length} ${t.records}`, icon: Scale, color: 'emerald' },
      ].map(card => { const Icon = card.icon; const colors = card.color === 'amber' ? 'bg-amber-100 text-amber-700 border-amber-200' : 'bg-emerald-100 text-emerald-700 border-emerald-200'; return <div key={card.label} className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm flex items-center justify-between"><div><span className="text-xs font-semibold text-slate-500">{card.label}</span><div className="text-xl font-bold font-mono text-slate-900 mt-1">{card.value}</div><span className="text-xs text-slate-500">{card.detail}</span></div><span className={`p-3 rounded-xl border ${colors}`}><Icon className="w-6 h-6"/></span></div>; })}</div>
      <InventorySection title={t.rawMaterialsSection} description={t.rawMaterialsSectionDesc} icon={Wheat} count={rawMaterials.length} emptyText={t.noRawMaterials} accent="amber" searchTerm={rawSearchTerm} onSearchChange={(value) => { setRawSearchTerm(value); setShowAllRaw(false); }} searchPlaceholder={labels.rawSearch} showMore={rawMaterials.length > 20 && !showAllRaw} onShowMore={() => setShowAllRaw(true)} showMoreLabel={`${labels.more} (${Math.max(0, rawMaterials.length - 20)})`}>
        {visibleRawMaterials.map(item => <RawMaterialRow key={item.id} item={item} t={t} onEdit={openEdit} editLabel={labels.edit}/>) }
      </InventorySection>
      <InventorySection title={t.processedMaterialsSection} description={t.processedStockSubtitle} icon={PackageCheck} count={processedMaterials.length} emptyText={t.noProcessedMaterials} accent="emerald" searchTerm={processedSearchTerm} onSearchChange={(value) => { setProcessedSearchTerm(value); setShowAllProcessed(false); }} searchPlaceholder={labels.processedSearch} showMore={processedMaterials.length > 20 && !showAllProcessed} onShowMore={() => setShowAllProcessed(true)} showMoreLabel={`${labels.more} (${Math.max(0, processedMaterials.length - 20)})`}>
        {visibleProcessedMaterials.map(item => <ProcessedMaterialRow key={item.id} item={item} t={t}/>) }
      </InventorySection>
      {editingItem && editForm && <div className="ui-overlay fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs"><div className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-200 p-6"><div className="flex items-center justify-between mb-4"><h3 className="font-bold text-slate-900 flex items-center gap-2"><Pencil className="w-5 h-5 text-amber-600"/>{labels.editTitle}</h3><button type="button" onClick={() => setEditingItem(null)} className="text-slate-400 hover:text-slate-700"><X className="w-5 h-5"/></button></div><p className="text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded-xl p-3 mb-4">{labels.independent}</p><form onSubmit={saveEdit} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label={labels.name}><input required value={editForm.name} onChange={e=>setEditForm({...editForm,name:e.target.value})} className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-amber-600"/></Field>
        <Field label={labels.stock}><input required type="number" min="0" step="any" value={editForm.stockKg} onChange={e=>setEditForm({...editForm,stockKg:e.target.value})} className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-amber-600"/></Field>
        <Field label={labels.priceAfn}><input required type="number" min="0" step="any" value={editForm.averageCostPerKg} onChange={e=>setEditForm({...editForm,averageCostPerKg:e.target.value})} className="min-w-0 w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-amber-600"/></Field>
        <Field label={labels.priceUsd}><input required type="number" min="0" step="any" value={editForm.averageCostPerKgUsd} onChange={e=>setEditForm({...editForm,averageCostPerKgUsd:e.target.value})} className="min-w-0 w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-amber-600"/></Field>
        <Field label={labels.supplier}><input value={editForm.supplierName} onChange={e=>setEditForm({...editForm,supplierName:e.target.value})} className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-amber-600"/></Field>
        <Field label={labels.threshold}><input type="number" min="0" step="any" value={editForm.lowStockThreshold} onChange={e=>setEditForm({...editForm,lowStockThreshold:e.target.value})} className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-amber-600"/></Field>
        <div className="sm:col-span-2"><Field label={labels.notes}><textarea rows="3" value={editForm.notes} onChange={e=>setEditForm({...editForm,notes:e.target.value})} className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-amber-600 resize-none"/></Field></div>
        {editError && <p className="sm:col-span-2 text-xs font-semibold text-rose-700">{editError}</p>}
        <div className="sm:col-span-2 flex justify-end gap-3"><button type="button" onClick={()=>setEditingItem(null)} className="px-4 py-2 rounded-xl bg-slate-100 text-xs font-bold">{t.cancel}</button><button type="submit" className="px-5 py-2 rounded-xl bg-amber-600 text-white text-xs font-bold">{t.save}</button></div>
      </form></div></div>}
    </div>);
};
const Field=({label,children})=><label className="block"><span className="block text-xs font-semibold text-slate-700 mb-1">{label}</span>{children}</label>;
const InventorySection=({title,description,icon:Icon,count,emptyText,accent,children,searchTerm,onSearchChange,searchPlaceholder,showMore,onShowMore,showMoreLabel})=><section data-stock-section={accent} className="inventory-section space-y-3"><div className="flex flex-col md:flex-row md:items-end justify-between gap-3"><div><h3 className="font-bold text-slate-900 flex items-center gap-2"><Icon className={`w-5 h-5 ${accent==='amber'?'text-amber-700':'text-emerald-700'}`}/>{title}</h3><p className="text-xs text-slate-500 mt-1">{description}</p></div><div className="flex items-center gap-2 w-full md:w-auto"><div className="relative flex-1 md:w-80"><Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"/><input value={searchTerm} onChange={e=>onSearchChange(e.target.value)} placeholder={searchPlaceholder} className="w-full ps-9 pe-9 py-2 text-xs bg-white border border-slate-300 rounded-xl"/>{searchTerm&&<button type="button" onClick={()=>onSearchChange('')} className="absolute end-3 top-1/2 -translate-y-1/2 text-slate-400"><X className="w-3.5 h-3.5"/></button>}</div><span className="text-xs font-semibold bg-white border border-slate-200 rounded-full px-3 py-1">{count}</span></div></div><div className="content-panel bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">{count>0?children:<div className="p-10 text-center text-sm text-slate-500">{emptyText}</div>}{showMore&&<div className="p-3 border-t text-center"><button type="button" onClick={onShowMore} className="px-5 py-2 rounded-xl text-xs font-bold bg-slate-50 border">{showMoreLabel}</button></div>}</div></section>;
const RawMaterialRow = ({ item, t, onEdit, editLabel }) => {
    const value = rawStockValue(item);
    return <div className="inventory-record" data-stock-kind="raw" data-record-tone={recordTone(item.id || item.name)}>
      <div className="inventory-name"><RecordAvatar id={item.id} name={item.name} icon={Wheat}/><div><h4>{item.name}</h4><span>{item.supplierName || '—'}</span></div></div>
      <Metric label={t.currentStockLabel} value={`${item.stockKg.toLocaleString()} ${t.kilo}`}/>
      <Metric label={t.averageCostKilo} value={<><bdi dir="ltr">{rawAverageCostPerKg(item, 'AFN').toLocaleString(undefined, { maximumFractionDigits: 4 })} AFN</bdi><bdi dir="ltr">{rawAverageCostPerKg(item, 'USD').toLocaleString(undefined, { maximumFractionDigits: 6 })} USD</bdi></>}/>
      <Metric label={t.totalValue} value={<><bdi dir="ltr">{value.AFN.toLocaleString(undefined, { maximumFractionDigits: 2 })} AFN</bdi><bdi dir="ltr">{value.USD.toLocaleString(undefined, { maximumFractionDigits: 4 })} USD</bdi></>}/>
      <Metric label={t.date} value={item.dateAdded || '—'}/>
      <button type="button" onClick={() => onEdit(item)} className="inventory-edit inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-amber-50 text-amber-800 hover:bg-amber-100 text-xs font-bold"><Pencil className="w-3.5 h-3.5"/>{editLabel}</button>
    </div>;
};
const ProcessedMaterialRow = ({ item, t }) => <div className="inventory-record" data-stock-kind="processed" data-record-tone={recordTone(item.id || item.name)}>
  <div className="inventory-name"><RecordAvatar id={item.id} name={item.name} icon={PackageCheck}/><div><h4>{item.name}</h4><span>{t.processingDateLabel}: {item.lastUpdated || '—'}</span></div></div>
  <Metric label={t.currentStockLabel} value={`${item.stockKg.toLocaleString()} ${t.kilo}`}/>
  <Metric label={t.bagsCount} value={(item.stockKg / 50).toLocaleString(undefined, { maximumFractionDigits: 2 })}/>
  <Metric label={t.costPerKiloResult} value={<><bdi dir="ltr">{(item.averageCostPerKg || 0).toLocaleString()} AFN</bdi><bdi dir="ltr">{(item.averageCostPerKgUsd || 0).toLocaleString()} USD</bdi></>}/>
  <Metric label={t.totalValue} value={<><bdi dir="ltr">{(item.stockKg * (item.averageCostPerKg || 0)).toLocaleString()} AFN</bdi><bdi dir="ltr">{(item.stockKg * (item.averageCostPerKgUsd || 0)).toLocaleString()} USD</bdi></>}/>
</div>;
const Metric = ({ label, value }) => <div className="inventory-metric"><span>{label}</span><strong>{value}</strong></div>;
