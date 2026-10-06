import React, { useState } from 'react';
import { useDatabase } from '../context/DatabaseContext';
import { ReceiptActions } from '../components';
import { TrendingUp, Plus, Search, Printer, Receipt, Eye, EyeOff, X, AlertCircle, CheckCircle2 } from 'lucide-react';
export const SalesPage = () => {
    const { db, t, lang, recordSale, getLocalizedName } = useDatabase();
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedPaymentFilter, setSelectedPaymentFilter] = useState('all');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [showCostRate, setShowCostRate] = useState(true);
    const [selectedInvoice, setSelectedInvoice] = useState(null);
    // Form State
    const [productId, setProductId] = useState(db.processedStock[0]?.id || '');
    const [customerId, setCustomerId] = useState('');
    const [customerName, setCustomerName] = useState('');
    const [customerPhone, setCustomerPhone] = useState('');
    const [unitType, setUnitType] = useState('bag');
    const [unitQuantity, setUnitQuantity] = useState('');
    const [salePricePerUnit, setSalePricePerUnit] = useState('');
    const [paidAmount, setPaidAmount] = useState('');
    const [notes, setNotes] = useState('');
    const [saveStatus, setSaveStatus] = useState(null);
    const [isSaving, setIsSaving] = useState(false);
    // Selected Product details
    const selectedProduct = db.processedStock.find(p => p.id === productId);
    const costRatePerKg = selectedProduct ? selectedProduct.averageCostPerKg : 30;
    // Quantity in kg calculation
    const getKg = (unit, qty) => {
        if (unit === 'bag')
            return qty * 50;
        if (unit === 'ton')
            return qty * 1000;
        return qty;
    };
    const qtyNumber = Number(unitQuantity) || 0;
    const priceNumber = Number(salePricePerUnit) || 0;
    const totalQuantityKg = getKg(unitType, qtyNumber);
    const totalInvoiceAmount = qtyNumber * priceNumber;
    const paidNumber = paidAmount === '' ? totalInvoiceAmount : Number(paidAmount) || 0;
    const remainingDebt = Math.max(0, totalInvoiceAmount - paidNumber);
    const totalCostOfGoods = costRatePerKg * totalQuantityKg;
    const estimatedProfit = totalInvoiceAmount - totalCostOfGoods;
    const costPerSelectedUnit = unitType === 'bag'
        ? costRatePerKg * 50
        : unitType === 'ton' ? costRatePerKg * 1000 : costRatePerKg;
    // Handle selecting existing customer
    const handleCustomerNameChange = (name) => {
        setCustomerName(name);
        const normalizedName = name.trim().toLowerCase();
        const existing = db.customers.find(customer => customer.name.trim().toLowerCase() === normalizedName);
        setCustomerId(existing?.id || '');
        if (existing)
            setCustomerPhone(existing.phone || '');
    };
    const handleOpenNewSale = () => {
        setProductId(db.processedStock[0]?.id || '');
        setCustomerId('');
        setCustomerName('');
        setCustomerPhone('');
        setUnitType('bag');
        setUnitQuantity('');
        setSalePricePerUnit('');
        setPaidAmount('');
        setNotes('');
        setSaveStatus(null);
        setIsModalOpen(true);
    };
    const handleSubmit = async (e) => {
        e.preventDefault();
        setSaveStatus(null);
        const productName = selectedProduct ? selectedProduct.name : '';
        if (!productName) {
            setSaveStatus({ type: 'error', text: t.pleaseEnterFormulaName || 'Please specify feed name' });
            return;
        }
        if (!customerName.trim()) {
            setSaveStatus({ type: 'error', text: t.invalidCredentials || 'Please enter customer name' });
            return;
        }
        if (customerPhone.trim() && !/^\d{10}$/.test(customerPhone.trim())) {
            setSaveStatus({ type: 'error', text: t.phoneMustBe10Digits });
            return;
        }
        if (qtyNumber <= 0 || priceNumber <= 0) {
            setSaveStatus({ type: 'error', text: t.totalWeightMustBePositive || 'Quantity and price must be greater than zero' });
            return;
        }
        if (paidNumber > totalInvoiceAmount) {
            setSaveStatus({ type: 'error', text: t.paidAmountExceedsTotal });
            return;
        }
        // Check stock if product exists in processed stock
        if (selectedProduct) {
            if (selectedProduct.stockKg < totalQuantityKg) {
                setSaveStatus({ type: 'error', text: `${t.insufficientStockOfItem} "${getLocalizedName(selectedProduct.name)}"! ${t.currentStockLabel}: ${selectedProduct.stockKg.toLocaleString()} ${t.kilo}, ${t.requestedAmount} ${totalQuantityKg.toLocaleString()} ${t.kilo}.` });
                return;
            }
        }
        setIsSaving(true);
        const result = await recordSale({
            productName,
            productId,
            customerId: customerId || undefined,
            customerName: customerName.trim(),
            customerPhone: customerPhone.trim() || undefined,
            unitType,
            unitQuantity: qtyNumber,
            salePricePerUnit: priceNumber,
            paidAmount: paidNumber,
            notes: notes.trim() || undefined,
        });
        setIsSaving(false);
        if (result.success) {
            setSaveStatus({
                type: 'success',
                text: lang === 'fa' ? 'فروش با موفقیت در دیتابیس ذخیره شد.' : lang === 'ps' ? 'پلور په بریالیتوب سره ډیټابیس کې خوندي شو.' : 'Sale saved to the database successfully.',
            });
        }
        else {
            setSaveStatus({ type: 'error', text: result.error || 'The sale was not saved to the database.' });
        }
    };
    // Filter sales - search by customer name, phone number, and invoice number (id)
    const term = searchTerm.trim().toLowerCase();
    const filteredSales = db.sales.filter(s => {
        const matchesSearch = !term || (s.customerName.toLowerCase().includes(term) ||
            (s.customerPhone && s.customerPhone.toLowerCase().includes(term)) ||
            s.id.toLowerCase().includes(term));
        let matchesPayment = true;
        if (selectedPaymentFilter === 'paid')
            matchesPayment = s.remainingAmount === 0;
        if (selectedPaymentFilter === 'unpaid')
            matchesPayment = s.remainingAmount > 0;
        return matchesSearch && matchesPayment;
    });
    const totalSalesRevenue = db.sales.reduce((acc, s) => acc + s.totalAmount, 0);
    const totalSalesProfit = db.sales.reduce((acc, s) => acc + s.profit, 0);
    const totalReceivables = db.sales.reduce((acc, s) => acc + s.remainingAmount, 0);
    const totalVolumeKg = db.sales.reduce((acc, s) => acc + s.quantityKg, 0);
    return (<div className="space-y-6">
      {/* Header */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-100 text-amber-700">
              <TrendingUp className="w-5 h-5"/>
            </div>
            <span>{t.salesTitle}</span>
          </h2>
          <p className="text-xs sm:text-sm text-slate-600 mt-1">
            {t.salesDesc}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Cost rate visibility toggle */}
          <button type="button" onClick={() => setShowCostRate(!showCostRate)} className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer" title={t.costRateVisibilityToggle}>
            {showCostRate ? <EyeOff className="w-4 h-4 text-slate-500"/> : <Eye className="w-4 h-4 text-slate-500"/>}
            <span className="hidden sm:inline">{t.costRateNotice.replace(':', '')}</span>
          </button>

          <button type="button" onClick={handleOpenNewSale} className="flex items-center justify-center gap-2 px-4 py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs sm:text-sm rounded-xl shadow-md shadow-amber-600/25 transition-all cursor-pointer active:scale-95">
            <Plus className="w-4 h-4"/>
            <span>{t.recordNewSale}</span>
          </button>
        </div>
      </div>

      {/* Financial Summary Banners */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm">
          <span className="text-xs font-semibold text-slate-500">{t.totalSaleAmount}</span>
          <div className="text-xl font-bold font-mono text-slate-900 mt-1">
            {totalSalesRevenue.toLocaleString()} {t.currency}
          </div>
          <span className="text-xs text-amber-700 font-medium">
            {totalVolumeKg.toLocaleString()} {t.kilo} ({(totalVolumeKg / 50).toLocaleString(undefined, { maximumFractionDigits: 2 })} {t.bag})
          </span>
        </div>

        <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm">
          <span className="text-xs font-semibold text-slate-500">{t.netProfit}</span>
          <div className="text-xl font-bold font-mono text-emerald-700 mt-1">
            {totalSalesProfit.toLocaleString()} {t.currency}
          </div>
          <span className="text-xs text-emerald-600 font-medium">{t.operationalGrossProfit}</span>
        </div>

        <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm">
          <span className="text-xs font-semibold text-slate-500">{t.receivableCustomersCard}</span>
          <div className="text-xl font-bold font-mono text-rose-700 mt-1">
            {totalReceivables.toLocaleString()} {t.currency}
          </div>
          <span className="text-xs text-rose-600 font-medium">{t.remainingCustomerDebt}</span>
        </div>

        <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm">
          <span className="text-xs font-semibold text-slate-500">{t.records}</span>
          <div className="text-xl font-bold font-mono text-blue-700 mt-1">
            {db.sales.length} {t.invoicesCount}
          </div>
          <span className="text-xs text-slate-500">{t.activeFactory}</span>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="relative w-full md:w-96">
          <div className="absolute inset-y-0 start-0 flex items-center ps-3.5 pointer-events-none text-slate-400">
            <Search className="w-4 h-4"/>
          </div>
          <input type="text" placeholder={t.searchPlaceholderSales} value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full ps-10 pe-4 py-2.5 text-xs sm:text-sm bg-slate-50 border border-slate-300 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:border-amber-600 focus:ring-1 focus:ring-amber-600 shadow-2xs"/>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          {/* Payment Status Filter */}
          <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 p-1 rounded-xl text-xs">
            <button type="button" onClick={() => setSelectedPaymentFilter('all')} className={`px-3 py-1 rounded-lg font-semibold transition-all cursor-pointer ${selectedPaymentFilter === 'all' ? 'bg-amber-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}>
              {t.all}
            </button>
            <button type="button" onClick={() => setSelectedPaymentFilter('paid')} className={`px-3 py-1 rounded-lg font-semibold transition-all cursor-pointer ${selectedPaymentFilter === 'paid' ? 'bg-amber-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}>
              {t.statusPaid}
            </button>
            <button type="button" onClick={() => setSelectedPaymentFilter('unpaid')} className={`px-3 py-1 rounded-lg font-semibold transition-all cursor-pointer ${selectedPaymentFilter === 'unpaid' ? 'bg-amber-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}>
              {t.statusUnpaid}
            </button>
          </div>
        </div>
      </div>

      {/* Sales Invoices List */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
            <Receipt className="w-4 h-4 text-amber-600"/>
            <span>{t.salesTitle} ({filteredSales.length})</span>
          </h3>
          <span className="text-xs text-slate-500">{t.activeFactory}</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-start text-xs sm:text-sm">
            <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 font-semibold uppercase text-[11px]">
              <tr>
                <th className="py-3 px-4 text-start">{t.invoiceNumber}</th>
                <th className="py-3 px-4 text-start">{t.customerName}</th>
                <th className="py-3 px-4 text-start">{t.productName}</th>
                <th className="py-3 px-4 text-start">{t.quantity}</th>
                <th className="py-3 px-4 text-start">{t.totalAmount}</th>
                <th className="py-3 px-4 text-start">{t.paidAmount}</th>
                {showCostRate && <th className="py-3 px-4 text-start">{t.netProfit}</th>}
                <th className="py-3 px-4 text-center">{t.action}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredSales.map((sale) => {
            const isPaidInFull = sale.remainingAmount === 0;
            return (<tr key={sale.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3.5 px-4 font-mono font-bold text-amber-700">
                      #{sale.id.slice(-6).toUpperCase()}
                      <span className="block text-[10px] text-slate-400 font-normal">{sale.date}</span>
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="font-bold text-slate-900">{sale.customerName}</div>
                      {sale.customerPhone && (<div className="text-[11px] text-slate-500 font-mono" dir="ltr">{sale.customerPhone}</div>)}
                    </td>
                    <td className="py-3.5 px-4 font-medium text-slate-800">
                      {getLocalizedName(sale.productName)}
                    </td>
                    <td className="py-3.5 px-4 font-mono">
                      <strong>{sale.unitQuantity}</strong> {t[sale.unitType] || sale.unitType}
                      <span className="block text-[10px] text-slate-500">({sale.quantityKg.toLocaleString()} {t.kilo})</span>
                    </td>
                    <td className="py-3.5 px-4 font-mono font-bold text-slate-900">
                      {sale.totalAmount.toLocaleString()} {t.currency}
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="font-mono text-emerald-700 font-semibold">{sale.paidAmount.toLocaleString()} {t.currency}</div>
                      {!isPaidInFull ? (<span className="inline-block mt-0.5 text-[10px] px-2 py-0.5 rounded bg-rose-100 text-rose-700 font-bold">
                          {t.remainingDebt}: {sale.remainingAmount.toLocaleString()} {t.currency}
                        </span>) : (<span className="inline-block mt-0.5 text-[10px] px-2 py-0.5 rounded bg-emerald-100 text-emerald-700 font-bold">
                          {t.statusPaid}
                        </span>)}
                    </td>
                    {showCostRate && (<td className="py-3.5 px-4 font-mono text-emerald-700 font-bold">
                        +{sale.profit.toLocaleString()} {t.currency}
                      </td>)}
                    <td className="py-3.5 px-4 text-center">
                      <button type="button" onClick={() => setSelectedInvoice(sale)} className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold flex items-center gap-1 mx-auto transition-colors cursor-pointer">
                        <Printer className="w-3.5 h-3.5"/>
                        <span>{t.printInvoice}</span>
                      </button>
                    </td>
                  </tr>);
        })}

              {filteredSales.length === 0 && (<tr>
                  <td colSpan={8} className="py-12 text-center text-slate-500">
                    {t.showingResults} 0 {t.records}
                  </td>
                </tr>)}
            </tbody>
          </table>
        </div>
      </div>

      {/* Record New Sale Modal */}
      {isModalOpen && (<div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="w-full max-w-xl bg-white border border-slate-200 rounded-2xl shadow-2xl p-6 relative max-h-[92vh] overflow-y-auto text-slate-900">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-amber-100 text-amber-700">
                  <TrendingUp className="w-6 h-6"/>
                </div>
                <div>
                  <h3 className="font-bold text-lg text-slate-900">{t.recordNewSale}</h3>
                  <p className="text-xs text-slate-500">{t.salesDesc}</p>
                </div>
              </div>
              <button type="button" onClick={() => setIsModalOpen(false)} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-900 hover:bg-slate-100 cursor-pointer">
                <X className="w-5 h-5"/>
              </button>
            </div>

            <form onSubmit={handleSubmit} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">{t.productName} *</label>
                <select required value={productId} onChange={(e) => setProductId(e.target.value)} className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-amber-600 shadow-2xs font-medium cursor-pointer">
                  {!db.processedStock.length && <option value="">{t.noProcessedMaterials}</option>}
                  {db.processedStock.map(p => (<option key={p.id} value={p.id}>{getLocalizedName(p.name)} — {p.stockKg.toLocaleString()} {t.kilo} ({(p.stockKg / 50).toLocaleString(undefined, { maximumFractionDigits: 2 })} {t.bag})</option>))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    {t.customerName} *
                  </label>
                  <input type="text" required list="sales-customers" value={customerName} onChange={(e) => handleCustomerNameChange(e.target.value)} placeholder={t.customerNamePlaceholder} className="w-full min-w-0 bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-amber-600 shadow-2xs"/>
                  <datalist id="sales-customers">
                    {db.customers.map(customer => <option key={customer.id} value={customer.name}/>) }
                  </datalist>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    {t.customerPhoneLabel}
                  </label>
                  <input type="tel" inputMode="numeric" pattern="[0-9]{10}" minLength={10} maxLength={10} value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value.replace(/\D/g, '').slice(0, 10))} placeholder="0700000000" title={t.phoneMustBe10Digits} className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-900 font-mono focus:outline-none focus:border-amber-600 shadow-2xs"/>
                </div>

              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">{t.saleUnit}</label>
                  <select value={unitType} onChange={(e) => { setUnitType(e.target.value); setUnitQuantity(''); setSalePricePerUnit(''); }} className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-sm font-semibold"><option value="bag">{t.unitBag50kg}</option><option value="kg">{t.unitKg}</option><option value="ton">{t.unitTon1000kg}</option></select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">{t.quantity} *</label>
                  <input type="number" min="0.001" step="any" required value={unitQuantity} onChange={(e) => setUnitQuantity(e.target.value)} className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-sm font-mono focus:outline-none focus:border-amber-600"/>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">{t.unitSellingPrice} ({t.currency}) *</label>
                  <input type="number" min="0.01" step="any" required value={salePricePerUnit} onChange={(e) => setSalePricePerUnit(e.target.value)} className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-sm font-mono focus:outline-none focus:border-amber-600"/>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">{t.paidCashAmount} ({t.currency})</label>
                  <input type="number" min="0" max={totalInvoiceAmount || undefined} step="any" value={paidAmount} onChange={(e) => setPaidAmount(e.target.value)} placeholder={`${t.defaultFullPayment}: ${totalInvoiceAmount.toLocaleString()}`} className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-sm font-mono focus:outline-none focus:border-amber-600"/>
                </div>
              </div>

              <div className="p-4 rounded-xl border-2 border-amber-300 bg-amber-50 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <span className="text-xs font-bold text-amber-800 block">{t.costRateNotice}</span>
                  <strong className="text-2xl font-black font-mono text-slate-950">
                    {costRatePerKg.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {t.currency}/{t.kilo}
                  </strong>
                </div>
                <div className="sm:text-end">
                  <span className="text-[11px] font-semibold text-slate-600 block">{t.productionCostForSelectedUnit}</span>
                  <strong className="text-base font-black font-mono text-amber-900">
                    {costPerSelectedUnit.toLocaleString(undefined, { maximumFractionDigits: 2 })} {t.currency}/{t[unitType] || unitType}
                  </strong>
                </div>
              </div>

              {/* Calculation Summary Box */}
              <div className="p-4 bg-amber-50/70 rounded-xl border border-amber-200 space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-600">{t.totalSaleWeight}</span>
                  <strong className="font-mono text-slate-900">{totalQuantityKg.toLocaleString()} {t.kilo} ({qtyNumber} {t[unitType] || unitType})</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">{t.totalInvoiceAmount}</span>
                  <strong className="font-mono text-amber-800 text-sm">{totalInvoiceAmount.toLocaleString()} {t.currency}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">{t.remainingDebtAmount}</span>
                  <strong className="font-mono text-rose-700">{remainingDebt.toLocaleString()} {t.currency}</strong>
                </div>
                {showCostRate && (<div className="flex justify-between pt-2 border-t border-amber-200 text-emerald-700 font-bold">
                    <span>{t.estimatedGrossProfit}</span>
                    <span className="font-mono">+{estimatedProfit.toLocaleString()} {t.currency}</span>
                  </div>)}
              </div>

              <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t.invoiceNotesPlaceholder} className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-amber-600"/>

              <div className="pt-4 border-t border-slate-100 flex flex-col items-end gap-2">
                <div className="flex items-center justify-end gap-3">
                  <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold cursor-pointer">
                    {t.cancel}
                  </button>
                  <button type="submit" disabled={isSaving || saveStatus?.type === 'success'} className="px-5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 disabled:bg-amber-400 disabled:cursor-wait text-white text-xs font-bold shadow-md shadow-amber-600/25 cursor-pointer">
                    {isSaving ? 'Saving...' : t.saveAndIssueInvoice}
                  </button>
                </div>
                {saveStatus && (<div className={`text-xs font-semibold flex items-center gap-1.5 ${saveStatus.type === 'success' ? 'text-emerald-700' : 'text-rose-700'}`} role="status">
                    {saveStatus.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0"/> : <AlertCircle className="w-4 h-4 shrink-0"/>}
                    <span>{saveStatus.text}</span>
                  </div>)}
              </div>
            </form>
          </div>
        </div>)}

      {/* Printable Invoice Modal */}
      {selectedInvoice && (<div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs print:p-0 print:bg-white print:inset-auto">
          <div className="w-full max-w-xl bg-white border border-slate-200 rounded-2xl shadow-2xl p-6 relative max-h-[95vh] overflow-y-auto text-slate-900 print:shadow-none print:border-none print:w-full print:max-w-none print:text-black">
            {/* Close Button / Print Action */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-200 print:hidden">
              <div className="flex items-center gap-2">
                <Receipt className="w-5 h-5 text-amber-600"/>
                <span className="font-bold text-base text-slate-900">{t.officialInvoicePreview}</span>
              </div>
              <div className="flex items-center gap-2">
                <ReceiptActions elementId="sales-receipt" filename={`sales-invoice-${selectedInvoice.id}`} title={`${t.officialSaleInvoiceBadge} ${selectedInvoice.id}`} printLabel={t.printInvoice} downloadLabel="PDF"/>
                <button type="button" onClick={() => setSelectedInvoice(null)} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-900 hover:bg-slate-100 cursor-pointer">
                  <X className="w-5 h-5"/>
                </button>
              </div>
            </div>

            {/* Official Invoice Document Content */}
            <div className="receipt-document mt-4 space-y-4 bg-white p-2 print:mt-0" id="sales-receipt">
              <div className="text-center pb-4 border-b-2 border-slate-900 print:border-black">
                <h1 className="text-xl font-black tracking-tight text-slate-900 print:text-black">
                  {t.companyName}
                </h1>
                <p className="text-xs text-slate-600 font-medium mt-0.5">
                  {t.companySubtitle} • {t.activeFactory}
                </p>
                <div className="text-[11px] text-slate-500 mt-1 flex items-center justify-center gap-3">
                  <span>{t.orderPhone} <strong className="font-mono text-slate-800" dir="ltr">{t.companyPhone}</strong></span>
                  <span>•</span>
                  <span className="font-mono">{t.officialSaleInvoiceBadge}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 text-xs bg-slate-50 p-3.5 rounded-xl border border-slate-200 print:bg-stone-50 print:border-stone-300">
                <div>
                  <span className="text-slate-500 block">{t.invoiceNumber}:</span>
                  <strong className="font-mono text-amber-800 text-sm">#{selectedInvoice.id.slice(-6).toUpperCase()}</strong>
                </div>
                <div>
                  <span className="text-slate-500 block">{t.issueDate}:</span>
                  <strong className="font-mono">{selectedInvoice.date}</strong>
                </div>
                <div>
                  <span className="text-slate-500 block">{t.customerNameLabel}:</span>
                  <strong className="text-slate-900 text-sm">{selectedInvoice.customerName}</strong>
                </div>
                <div>
                  <span className="text-slate-500 block">{t.phone}:</span>
                  <strong className="font-mono">{selectedInvoice.customerPhone || '---'}</strong>
                </div>
              </div>

              {/* Items Table */}
              <div className="border border-slate-200 rounded-xl overflow-hidden print:border-stone-400">
                <table className="w-full text-start text-xs">
                  <thead className="bg-slate-100 text-slate-700 border-b border-slate-200 print:bg-stone-200 print:text-black">
                    <tr>
                      <th className="py-2 px-3 text-start">{t.itemDescription}</th>
                      <th className="py-2 px-3 text-start">{t.quantityCol}</th>
                      <th className="py-2 px-3 text-start">{t.unitPriceCol} ({t.currency})</th>
                      <th className="py-2 px-3 text-end">{t.totalCol} ({t.currency})</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 print:divide-stone-300">
                    <tr>
                      <td className="py-2.5 px-3 font-semibold text-slate-900">{getLocalizedName(selectedInvoice.productName)}</td>
                      <td className="py-2.5 px-3 font-mono">{selectedInvoice.unitQuantity} {t[selectedInvoice.unitType] || selectedInvoice.unitType} ({selectedInvoice.quantityKg.toLocaleString()} {t.kilo})</td>
                      <td className="py-2.5 px-3 font-mono">{selectedInvoice.salePricePerUnit.toLocaleString()}</td>
                      <td className="py-2.5 px-3 font-mono font-bold text-end">{selectedInvoice.totalAmount.toLocaleString()}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Totals Breakdown */}
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-1.5 text-xs print:bg-stone-50 print:border-stone-300">
                <div className="flex justify-between py-1 border-b border-slate-200">
                  <span className="text-slate-600">{t.totalInvoiceAmount}</span>
                  <strong className="font-mono text-sm text-slate-900">{selectedInvoice.totalAmount.toLocaleString()} {t.currency}</strong>
                </div>
                <div className="flex justify-between py-1 text-emerald-700 font-semibold">
                  <span>{t.receivedCashReceipt}</span>
                  <span className="font-mono">{selectedInvoice.paidAmount.toLocaleString()} {t.currency}</span>
                </div>
                <div className="flex justify-between py-1 text-rose-700 font-bold">
                  <span>{t.remainingDebtAmount}</span>
                  <span className="font-mono">{selectedInvoice.remainingAmount.toLocaleString()} {t.currency}</span>
                </div>
              </div>

              {selectedInvoice.notes && (<div className="pt-2 text-xs text-slate-600 italic">
                  {t.invoiceNoteLabel} {selectedInvoice.notes}
                </div>)}

              {/* Signatures */}
              <div className="mt-8 pt-6 border-t border-slate-200 print:border-black flex justify-between text-center text-xs text-slate-600 print:text-black">
                <div>
                  <div className="h-10"></div>
                  <span>{t.salesManagerSignature}</span>
                </div>
                <div className="text-center">
                  <div className="h-10 flex items-center justify-center">
                    <span className="text-[11px] font-mono text-slate-500" dir="ltr">{t.companyPhone}</span>
                  </div>
                  <span className="text-[11px] text-slate-500">{t.customerOrderService}</span>
                </div>
                <div>
                  <div className="h-10"></div>
                  <span>{t.recipientSignature}</span>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 text-center text-[11px] text-slate-500 flex items-center justify-center gap-2">
                <span>{t.companyName}</span>
                <span>•</span>
                <span>{t.companyPhoneLabel}</span>
                <strong className="font-mono text-amber-700 font-bold" dir="ltr">{t.companyPhone}</strong>
              </div>

              <div className="mt-2 text-center text-[10px] font-mono text-slate-400 print:text-black">
                Developed by: rayan-tech-solutions.tech
              </div>
            </div>
          </div>
        </div>)}
    </div>);
};
