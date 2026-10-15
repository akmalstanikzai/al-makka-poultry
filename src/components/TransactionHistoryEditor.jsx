import React, { useState } from 'react';
import { AlertTriangle, Ban, Pencil, X } from 'lucide-react';
import { normalizeDecimalInput } from '../lib/numberInput';

const controlClass = 'w-full min-w-0 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none';
const decimalValue = value => value == null ? '' : String(value);
const Field = ({ label, children, className = '' }) => <label className={`block ${className}`}>
  <span className="mb-1 block text-xs font-semibold text-slate-700">{label}</span>
  {children}
</label>;

export const TransactionHistoryEditor = ({ partyName, transaction, role, rawStockOptions = [], processedStockOptions = [], t, getLocalizedTxType, onClose, onSave, accent = 'blue' }) => {
    const [form, setForm] = useState(() => ({
        date: transaction.date || '', description: transaction.description || '', itemName: transaction.itemName || '',
        linkedItemId: transaction.rawMaterialId || transaction.productId || '', unitType: transaction.unitType || 'kg',
        unitQuantity: decimalValue(transaction.unitQuantity ?? transaction.quantityKg),
        unitPricePerUnit: decimalValue(transaction.unitPricePerUnit ?? transaction.unitPrice),
        paidAmount: decimalValue(transaction.cashAmount ?? transaction.paidAmount ?? 0),
        currency: transaction.currency || 'AFN', type: transaction.type, correctionReason: '',
    }));
    const [error, setError] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const isPayment = form.type === 'payment';
    const acceptsCash = form.type === 'purchase' || form.type === 'sale' || isPayment;
    const isRawStock = form.type === 'purchase' || form.type === 'raw_goods_settlement';
    const stockOptions = isRawStock ? rawStockOptions : processedStockOptions;
    const allowedTypes = role === 'supplier' ? ['purchase', 'payment', 'goods_settlement'] : ['sale', 'payment', 'raw_goods_settlement'];
    const computedAmount = (Number(form.unitQuantity) || 0) * (Number(form.unitPricePerUnit) || 0);
    const visibleStockOptions = isRawStock ? stockOptions.filter(item => (item.currency || 'AFN') === form.currency) : stockOptions;
    const buttonColor = accent === 'amber' ? 'bg-amber-600 hover:bg-amber-700' : 'bg-blue-600 hover:bg-blue-700';
    const updateDecimal = field => event => setForm(current => ({ ...current, [field]: normalizeDecimalInput(event.target.value) }));
    const handleItemChange = event => {
        const linkedItemId = event.target.value;
        const selected = stockOptions.find(item => item.id === linkedItemId);
        setForm(current => ({ ...current, linkedItemId, itemName: selected?.name || current.itemName }));
    };
    const handleTypeChange = event => setForm(current => ({
        ...current,
        type: event.target.value,
        linkedItemId: '',
        itemName: '',
        unitQuantity: event.target.value === 'payment' ? '' : current.unitQuantity,
        unitPricePerUnit: event.target.value === 'payment' ? '' : current.unitPricePerUnit,
        paidAmount: ['purchase', 'sale', 'payment'].includes(event.target.value) ? current.paidAmount : '0',
    }));
    const handleSubmit = async event => {
        event.preventDefault();
        setError('');
        if (!form.correctionReason.trim()) return setError(t.correctionReasonRequired);
        if (!isPayment && (!form.linkedItemId || Number(form.unitQuantity) <= 0 || Number(form.unitPricePerUnit) < 0)) return setError(t.historyStockSelectionRequired);
        if (acceptsCash && !isPayment && Number(form.paidAmount || 0) > computedAmount) return setError(t.historyPaidExceedsAmount);
        setIsSaving(true);
        const result = await Promise.resolve(onSave({
            ...form, amount: isPayment ? 0 : computedAmount,
            rawMaterialId: isRawStock ? form.linkedItemId : undefined,
            productId: !isRawStock && !isPayment ? form.linkedItemId : undefined,
            paidAmount: form.paidAmount || '0',
        }));
        setIsSaving(false);
        if (!result?.success) return setError(result?.error || t.historyChangeSaveFailed);
        onClose();
    };
    return <div className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-slate-900/55 p-3 backdrop-blur-xs sm:p-4" role="dialog" aria-modal="true" aria-labelledby="history-editor-title">
      <div className="my-1 max-h-[calc(100dvh-1.5rem)] w-full max-w-3xl overflow-y-auto overscroll-contain rounded-2xl border border-slate-200 bg-white p-4 text-slate-900 shadow-2xl sm:my-0 sm:max-h-[calc(100dvh-2rem)] sm:p-6">
        <div className="mb-4 flex items-start justify-between gap-3 border-b border-slate-100 pb-4">
          <div><h3 id="history-editor-title" className="flex items-center gap-2 font-bold"><Pencil className={`h-5 w-5 ${accent === 'amber' ? 'text-amber-600' : 'text-blue-600'}`}/>{t.editHistoryEntry}</h3><p className="mt-1 text-xs text-slate-500">{partyName} · {t.historyEditNotice}</p></div>
          <button type="button" onClick={onClose} aria-label={t.cancel} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X className="h-5 w-5"/></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label={t.date}><input required type="date" value={form.date} onChange={event => setForm(current => ({ ...current, date: event.target.value }))} className={controlClass}/></Field>
            <Field label={t.transactionType}><select value={form.type} onChange={handleTypeChange} className={`${controlClass} font-semibold`}>{allowedTypes.map(type => <option key={type} value={type}>{getLocalizedTxType(type)}</option>)}</select></Field>
            <Field label={t.currency}><select value={form.currency} onChange={event => setForm(current => ({ ...current, currency: event.target.value, linkedItemId: isRawStock ? '' : current.linkedItemId }))} className={controlClass}><option value="AFN">AFN</option><option value="USD">USD</option></select></Field>
          </div>
          {!isPayment && <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label={isRawStock ? t.rawMaterialsSection : t.processedStockCard} className="sm:col-span-2 lg:col-span-1"><select required value={form.linkedItemId} onChange={handleItemChange} className={controlClass}><option value="">{isRawStock ? t.selectRawMaterial : t.selectProduct}</option>{visibleStockOptions.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
            <Field label={t.saleUnit}><select value={form.unitType} onChange={event => setForm(current => ({ ...current, unitType: event.target.value }))} className={controlClass}><option value="kg">{t.statementKilo}</option><option value="bag">{t.statementBag}</option><option value="ton">{t.statementTon}</option></select></Field>
            <Field label={t.quantity}><input required type="text" inputMode="decimal" value={form.unitQuantity} onChange={updateDecimal('unitQuantity')} className={`${controlClass} font-mono`}/></Field>
            <Field label={t.statementPricePerUnit}><input required type="text" inputMode="decimal" value={form.unitPricePerUnit} onChange={updateDecimal('unitPricePerUnit')} className={`${controlClass} font-mono`}/></Field>
          </div>}
          <Field label={t.historyDescription}><textarea rows="2" value={form.description} onChange={event => setForm(current => ({ ...current, description: event.target.value }))} className={`${controlClass} resize-y`}/></Field>
          <div className={`grid grid-cols-1 gap-3 ${acceptsCash && !isPayment ? 'sm:grid-cols-2' : ''}`}>
            {!isPayment && <Field label={t.totalAmount}><div className={`${controlClass} bg-slate-100 font-mono font-bold`}>{computedAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })} {form.currency}</div></Field>}
            {acceptsCash && <Field label={isPayment ? t.amountPaidLabel : t.cashPaid}><input required type="text" inputMode="decimal" value={form.paidAmount} onChange={updateDecimal('paidAmount')} className={`${controlClass} font-mono`}/></Field>}
          </div>
          <Field label={t.correctionReason}><textarea required rows="2" value={form.correctionReason} onChange={event => setForm(current => ({ ...current, correctionReason: event.target.value }))} placeholder={t.correctionReasonPlaceholder} className={`${controlClass} resize-y`}/></Field>
          <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">{t.historyCorrectionImpact}</p>
          {error && <p className="text-xs font-semibold text-rose-700" role="alert">{error}</p>}
          <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:justify-end"><button type="button" onClick={onClose} className="rounded-xl bg-slate-100 px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-200">{t.cancel}</button><button type="submit" disabled={isSaving} className={`rounded-xl px-5 py-2.5 text-xs font-bold text-white disabled:opacity-60 ${buttonColor}`}>{isSaving ? t.savingChanges : t.reverseAndReplace}</button></div>
        </form>
      </div>
    </div>;
};

export const TransactionVoidDialog = ({ partyName, transaction, t, onClose, onConfirm }) => {
    const [reason, setReason] = useState('');
    const [error, setError] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const handleVoid = async () => {
        setError('');
        if (!reason.trim()) return setError(t.correctionReasonRequired);
        setIsSaving(true);
        const result = await Promise.resolve(onConfirm(reason.trim()));
        setIsSaving(false);
        if (!result?.success) return setError(result?.error || t.historyVoidFailed);
        onClose();
    };
    return <div className="fixed inset-0 z-[80] flex items-center justify-center overflow-y-auto bg-slate-900/60 p-4 backdrop-blur-xs" role="alertdialog" aria-modal="true" aria-labelledby="history-void-title">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-rose-100 text-rose-600"><AlertTriangle className="h-6 w-6"/></div>
        <h3 id="history-void-title" className="text-center font-bold text-slate-900">{t.voidHistoryEntry}</h3><p className="mt-2 text-center text-xs leading-5 text-slate-600">{t.confirmVoidHistoryEntry}</p><p className="mt-2 text-center text-xs font-semibold text-slate-800">{partyName} · {transaction.date}</p>
        <Field label={t.correctionReason} className="mt-4"><textarea required rows="3" value={reason} onChange={event => setReason(event.target.value)} placeholder={t.correctionReasonPlaceholder} className={`${controlClass} resize-y`}/></Field>
        <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">{t.historyVoidImpact}</p>
        {error && <p className="mt-3 text-xs font-semibold text-rose-700" role="alert">{error}</p>}
        <div className="mt-5 flex gap-3"><button type="button" onClick={onClose} className="flex-1 rounded-xl border border-slate-200 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-100">{t.cancel}</button><button type="button" disabled={isSaving} onClick={handleVoid} className="flex-1 rounded-xl bg-rose-600 py-2.5 text-xs font-bold text-white hover:bg-rose-700 disabled:opacity-60"><Ban className="me-1 inline h-3.5 w-3.5"/>{isSaving ? t.savingChanges : t.voidTransaction}</button></div>
      </div>
    </div>;
};
