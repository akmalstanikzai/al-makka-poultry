import React, { useRef, useState } from 'react';
import { useDatabase } from '../context/DatabaseContext';
import { AccountStatement } from '../components/AccountStatement';
import { ReceiptActions } from '../components/ReceiptActions';
import { TransactionHistoryEditor, TransactionVoidDialog } from '../components/TransactionHistoryEditor';
import { normalizeDecimalInput } from '../lib/numberInput';
import { getTransactionActivityTime, sortTransactionsNewestFirst } from '../lib/transactionSort';
import { billNumberExists, cleanBillNumber } from '../lib/billNumber';
import { getTransactionEntryDetails } from '../lib/transactionDetails';
import { getSaleLineItems, saleUnitLabel } from '../lib/saleLineItems';
import { Truck, Search, Phone, MapPin, Trash2, X, Printer, History, Wallet, CreditCard, Package, ArrowUpRight, ChevronDown, ChevronUp, CheckCircle, Pencil } from 'lucide-react';
const latestRawPurchaseTime = supplier => (supplier.transactions || []).reduce((latest, transaction) => transaction.type === 'purchase' && (transaction.status || 'active') === 'active' ? Math.max(latest, getTransactionActivityTime(transaction)) : latest, 0);
export const SuppliersPage = () => {
    const { db, t, lang, deleteSupplier, settleSupplierPayment, settleSupplierWithProcessedStock, updateSupplier, updateSupplierTransaction, voidSupplierTransaction, getLocalizedTxType, getLocalizedTxDesc } = useDatabase();
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedHistorySupplier, setSelectedHistorySupplier] = useState(null);
    const [statementMode, setStatementMode] = useState('current');
    const [settleModalSupplier, setSettleModalSupplier] = useState(null);
    const [paymentAmount, setPaymentAmount] = useState('');
    const [paymentCurrency, setPaymentCurrency] = useState('AFN');
    const [paymentNote, setPaymentNote] = useState('');
    const [paymentError, setPaymentError] = useState('');
    const [isSavingPayment, setIsSavingPayment] = useState(false);
    const paymentSaveLock = useRef(false);
    const [editingSupplier, setEditingSupplier] = useState(null);
    const [supplierEdit, setSupplierEdit] = useState(null);
    const [supplierEditError, setSupplierEditError] = useState('');
    const [editingHistoryEntry, setEditingHistoryEntry] = useState(null);
    const [deletingHistoryEntry, setDeletingHistoryEntry] = useState(null);
    const [goodsSupplier, setGoodsSupplier] = useState(null);
    const [goodsProductId, setGoodsProductId] = useState('');
    const [goodsUnit, setGoodsUnit] = useState('bag');
    const [goodsQuantity, setGoodsQuantity] = useState('');
    const [goodsPrice, setGoodsPrice] = useState('');
    const [goodsCurrency, setGoodsCurrency] = useState('AFN');
    const [goodsNotes, setGoodsNotes] = useState('');
    const [goodsBillNumber, setGoodsBillNumber] = useState('');
    const [goodsError, setGoodsError] = useState('');
    const [isSavingGoods, setIsSavingGoods] = useState(false);
    const goodsSaveLock = useRef(false);
    // Delete supplier modal
    const [supplierToDelete, setSupplierToDelete] = useState(null);
    // Status Filter: 'all' | 'creditors' | 'settled'
    const [statusFilter, setStatusFilter] = useState('all');
    // Expanded row IDs for inline transaction histories
    const [expandedSupplierIds, setExpandedSupplierIds] = useState({});
    const supplierTransactionDescription = transaction => ['purchase', 'goods_settlement'].includes(transaction.type)
        ? ''
        : getLocalizedTxDesc(transaction.description);
    const supplierTransactionDetails = (transaction, supplier) =>
        getTransactionEntryDetails(transaction, supplier, 'supplier', db.sales, t);
    const renderSupplierTransactionText = (transaction, supplier) => {
        const description = supplierTransactionDescription(transaction);
        const details = supplierTransactionDetails(transaction, supplier);
        return <>
          {(!details || details !== description) && description}
          {details && <div className="mt-1 rounded-md bg-slate-50 px-2 py-1 text-[10px] leading-4 text-slate-600"><span className="font-bold text-slate-700">{t.historyDescription}: </span>{details}</div>}
        </>;
    };
    const renderGoodsItems = transaction => {
        if (transaction.type !== 'goods_settlement') return transaction.itemName && <div className="font-bold text-slate-900">{transaction.itemName}</div>;
        const relatedSale = db.sales.find(sale => sale.id === transaction.sourceSaleId);
        const items = getSaleLineItems(transaction.lineItems?.length ? transaction : relatedSale || transaction);
        const transactionBillNumber = transaction.billNumber || relatedSale?.billNumber;
        return <div className="space-y-1.5">
          {items.map((item, index) => <div key={`${transaction.id}-item-${index}`} className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5">
            <strong className="block text-slate-900">{item.productName}</strong>
            <span className="block font-mono text-[10px] text-slate-600">{item.unitQuantity.toLocaleString()} {saleUnitLabel(item.unitType, t)} × {item.salePricePerUnit.toLocaleString()} {transaction.currency || 'AFN'} = {item.totalAmount.toLocaleString()} {transaction.currency || 'AFN'}</span>
          </div>)}
          {transactionBillNumber && <span className="block font-mono text-[10px] text-amber-700">{t.invoiceNumber}: #{transactionBillNumber}</span>}
        </div>;
    };
    const toggleExpand = (supplierId) => {
        setExpandedSupplierIds(prev => ({
            ...prev,
            [supplierId]: !prev[supplierId]
        }));
    };
    const handleOpenSettleModal = (s) => {
        setSettleModalSupplier(s);
        setPaymentCurrency((s.balanceOwed || 0) > 0 ? 'AFN' : 'USD');
        setPaymentAmount('');
        setPaymentNote('');
        setPaymentError('');
    };
    const handleSettleSubmit = async (e) => {
        e.preventDefault();
        if (!settleModalSupplier || paymentSaveLock.current)
            return;
        const amount = Number(paymentAmount);
        const availableBalance = Number(paymentCurrency === 'USD' ? settleModalSupplier.balanceOwedUsd : settleModalSupplier.balanceOwed) || 0;
        if (!Number.isFinite(amount) || amount <= 0) {
            setPaymentError(t.paymentAmountRequired);
            return;
        }
        if (amount > availableBalance) {
            setPaymentError(t.paymentExceedsBalance);
            return;
        }
        setPaymentError('');
        paymentSaveLock.current = true;
        setIsSavingPayment(true);
        try {
            const result = await settleSupplierPayment(settleModalSupplier.id, amount, paymentNote, paymentCurrency);
            if (!result?.success) { setPaymentError(result?.error || t.historyChangeSaveFailed); return; }
            setSettleModalSupplier(null);
        }
        finally {
            paymentSaveLock.current = false;
            setIsSavingPayment(false);
        }
    };
    const openSupplierEdit = supplier => {
        setEditingSupplier(supplier);
        setSupplierEdit({
            name: supplier.name || '', phone: supplier.phone || '', address: supplier.address || '',
            totalPurchasedAmount: supplier.totalPurchasedAmount || 0,
            totalPaid: supplier.totalPaid || 0,
            totalPurchasedAmountUsd: supplier.totalPurchasedAmountUsd || 0,
            totalPaidUsd: supplier.totalPaidUsd || 0,
            goodsSettledAmount: supplier.goodsSettledAmount || 0,
            goodsSettledAmountUsd: supplier.goodsSettledAmountUsd || 0,
        });
        setSupplierEditError('');
    };
    const handleSupplierEdit = event => {
        event.preventDefault();
        const result = updateSupplier(editingSupplier.id, supplierEdit);
        if (!result.success) { setSupplierEditError(result.error); return; }
        setEditingSupplier(null); setSupplierEdit(null);
    };
    const openGoodsSettlement = supplier => {
        setGoodsSupplier(supplier);
        setGoodsProductId(db.processedStock[0]?.id || '');
        setGoodsUnit('bag');
        setGoodsQuantity('');
        setGoodsPrice('');
        setGoodsCurrency((supplier.balanceOwed || 0) > 0 ? 'AFN' : 'USD');
        setGoodsNotes('');
        setGoodsBillNumber('');
        setGoodsError('');
    };
    const goodsProduct = db.processedStock.find(product => product.id === goodsProductId);
    const goodsQuantityNumber = Number(goodsQuantity) || 0;
    const goodsPriceNumber = Number(goodsPrice) || 0;
    const goodsWeightKg = goodsUnit === 'ton' ? goodsQuantityNumber * 1000 : goodsUnit === 'bag' ? goodsQuantityNumber * 50 : goodsQuantityNumber;
    const goodsTotal = goodsQuantityNumber * goodsPriceNumber;
    const isDuplicateGoodsBillNumber = billNumberExists(db.sales, goodsBillNumber);
    const supplierDebtForGoods = goodsSupplier ? Number(goodsCurrency === 'USD' ? goodsSupplier.balanceOwedUsd : goodsSupplier.balanceOwed) || 0 : 0;
    const goodsDebtOffset = Math.min(goodsTotal, supplierDebtForGoods);
    const goodsCustomerDebt = Math.max(0, goodsTotal - goodsDebtOffset);
    const handleGoodsSettlement = async event => {
        event.preventDefault();
        if (!goodsSupplier || goodsSaveLock.current) return;
        if (!cleanBillNumber(goodsBillNumber)) { setGoodsError(t.billNumberRequired); return; }
        if (isDuplicateGoodsBillNumber) { setGoodsError(t.duplicateBillNumber); return; }
        goodsSaveLock.current = true;
        setGoodsError('');
        setIsSavingGoods(true);
        try {
            const result = await settleSupplierWithProcessedStock({
                billNumber: cleanBillNumber(goodsBillNumber),
                supplierId: goodsSupplier.id,
                productId: goodsProductId,
                unitType: goodsUnit,
                unitQuantity: goodsQuantityNumber,
                salePricePerUnit: goodsPriceNumber,
                currency: goodsCurrency,
                notes: goodsNotes,
            });
            if (!result.success) { setGoodsError(result.error); return; }
            setGoodsSupplier(null);
        }
        finally {
            goodsSaveLock.current = false;
            setIsSavingGoods(false);
        }
    };
    // Aggregated totals
    const totalPurchasesAll = { AFN: db.suppliers.reduce((a,s)=>a+(s.totalPurchasedAmount||0),0), USD: db.suppliers.reduce((a,s)=>a+(s.totalPurchasedAmountUsd||0),0) };
    const totalCashPaidAll = { AFN: db.suppliers.reduce((a,s)=>a+(s.totalPaid||0),0), USD: db.suppliers.reduce((a,s)=>a+(s.totalPaidUsd||0),0) };
    const totalGoodsSettledAll = { AFN: db.suppliers.reduce((a,s)=>a+(s.goodsSettledAmount||0),0), USD: db.suppliers.reduce((a,s)=>a+(s.goodsSettledAmountUsd||0),0) };
    const totalSettledAll = { AFN: totalCashPaidAll.AFN + totalGoodsSettledAll.AFN, USD: totalCashPaidAll.USD + totalGoodsSettledAll.USD };
    const totalOwedAll = { AFN: db.suppliers.reduce((a,s)=>a+(s.balanceOwed||0),0), USD: db.suppliers.reduce((a,s)=>a+(s.balanceOwedUsd||0),0) };
    const creditorCount = db.suppliers.filter(s => (s.balanceOwed || 0) > 0 || (s.balanceOwedUsd || 0) > 0).length;
    const normalizedSearch = searchTerm.trim().toLowerCase();
    const filteredSuppliers = db.suppliers.filter(s => {
        const hasMatchingBill = normalizedSearch && (
            (s.transactions || []).some(transaction => String(transaction.billNumber || '').toLowerCase().includes(normalizedSearch))
            || db.sales.some(sale => String(sale.billNumber || '').toLowerCase().includes(normalizedSearch)
                && (sale.supplierId === s.id || (!sale.supplierId && sale.customerName?.trim().toLowerCase() === s.name.trim().toLowerCase())))
        );
        const matchesSearch = !normalizedSearch || s.name.toLowerCase().includes(normalizedSearch) ||
            (s.phone && s.phone.includes(normalizedSearch)) ||
            (s.address && s.address.toLowerCase().includes(normalizedSearch)) || hasMatchingBill;
        if (!matchesSearch)
            return false;
        if (statusFilter === 'creditors') {
            return (s.balanceOwed || 0) > 0 || (s.balanceOwedUsd || 0) > 0;
        }
        if (statusFilter === 'settled') {
            return (s.balanceOwed || 0) <= 0 && (s.balanceOwedUsd || 0) <= 0;
        }
        return true;
    }).sort((first, second) => latestRawPurchaseTime(second) - latestRawPurchaseTime(first));
    return (<div className="space-y-6">
      {/* Header with Title and Search */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-100 text-amber-700">
              <Truck className="w-5 h-5"/>
            </div>
            <span>{t.suppliersTitle}</span>
          </h2>
          <p className="text-xs sm:text-sm text-slate-600 mt-1">
            {t.suppliersDesc}
          </p>
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-80">
          <div className="absolute inset-y-0 start-0 flex items-center ps-3.5 pointer-events-none text-slate-400">
            <Search className="w-4 h-4"/>
          </div>
          <input type="text" placeholder={t.searchByNamePhoneBill || t.search} value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full ps-10 pe-4 py-2.5 text-xs sm:text-sm bg-slate-50 border border-slate-300 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:border-amber-600 shadow-2xs"/>
          {searchTerm && (<button type="button" onClick={() => setSearchTerm('')} className="absolute inset-y-0 end-0 pe-3 flex items-center text-slate-400 hover:text-slate-700 cursor-pointer">
              <X className="w-4 h-4"/>
            </button>)}
        </div>
      </div>

      {/* Financial Summary Banners */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-500">{t.totalPurchasedAmount}</span>
            <div className="text-xl font-bold font-mono text-slate-900 mt-1">
              {totalPurchasesAll.AFN.toLocaleString()} AFN · {totalPurchasesAll.USD.toLocaleString()} USD
            </div>
            <span className="text-xs text-slate-500">{db.suppliers.length} {t.navSuppliers}</span>
          </div>
          <div className="p-3 bg-amber-100 text-amber-700 rounded-xl border border-amber-200">
            <Truck className="w-6 h-6"/>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-500">{t.totalSettledWithSupplier}</span>
            <div className="text-xl font-bold font-mono text-emerald-700 mt-1">
              {totalSettledAll.AFN.toLocaleString()} AFN · {totalSettledAll.USD.toLocaleString()} USD
            </div>
            <span className="text-[10px] text-emerald-700 block">{t.cashPaidToSupplier}: {totalCashPaidAll.AFN.toLocaleString()} AFN · {totalCashPaidAll.USD.toLocaleString()} USD</span>
            <span className="text-[10px] text-emerald-600 block">{t.nonCashGoodsSettled}: {totalGoodsSettledAll.AFN.toLocaleString()} AFN · {totalGoodsSettledAll.USD.toLocaleString()} USD</span>
          </div>
          <div className="p-3 bg-emerald-100 text-emerald-700 rounded-xl border border-emerald-200">
            <Wallet className="w-6 h-6"/>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-500">{t.balanceOwedToSupplier}</span>
            <div className="text-xl font-bold font-mono text-rose-700 mt-1">
              {totalOwedAll.AFN.toLocaleString()} AFN · {totalOwedAll.USD.toLocaleString()} USD
            </div>
            <span className="text-xs text-rose-600 font-medium">
              {creditorCount} {t.creditorSuppliersCount}
            </span>
          </div>
          <div className="p-3 bg-rose-100 text-rose-700 rounded-xl border border-rose-200">
            <CreditCard className="w-6 h-6"/>
          </div>
        </div>
      </div>

      {/* Comprehensive Row Layout / Line Structure Container */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Table Toolbar & Filters */}
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/50">
          <div className="flex items-center gap-2">
            <Truck className="w-4 h-4 text-amber-600"/>
            <h3 className="font-bold text-sm text-slate-900">
              {t.suppliersListLinear}
            </h3>
            <span className="text-xs text-slate-500 font-mono">({filteredSuppliers.length})</span>
          </div>

          {/* Quick Filter Buttons */}
          <div className="flex w-full flex-wrap items-center gap-1 rounded-xl border border-slate-200 bg-white p-1 text-xs sm:w-auto">
            <button type="button" onClick={() => setStatusFilter('all')} className={`px-3 py-1 rounded-lg font-semibold transition-all cursor-pointer ${statusFilter === 'all'
            ? 'bg-amber-600 text-white shadow-xs'
            : 'text-slate-600 hover:text-slate-900'}`}>
              {t.allUnits} ({db.suppliers.length})
            </button>
            <button type="button" onClick={() => setStatusFilter('creditors')} className={`px-3 py-1 rounded-lg font-semibold transition-all cursor-pointer ${statusFilter === 'creditors'
            ? 'bg-rose-600 text-white shadow-xs'
            : 'text-slate-600 hover:text-slate-900'}`}>
              {t.creditors} ({creditorCount})
            </button>
            <button type="button" onClick={() => setStatusFilter('settled')} className={`px-3 py-1 rounded-lg font-semibold transition-all cursor-pointer ${statusFilter === 'settled'
            ? 'bg-emerald-600 text-white shadow-xs'
            : 'text-slate-600 hover:text-slate-900'}`}>
              {t.settled} ({db.suppliers.length - creditorCount})
            </button>
          </div>
        </div>

        {/* Structured Row / Line Table */}
        <div className="min-w-0 2xl:overflow-x-auto">
          <table className="block w-full min-w-0 text-start text-xs sm:text-sm 2xl:table 2xl:min-w-[1120px]">
            <thead className="hidden bg-slate-50 text-slate-600 border-b border-slate-200 font-semibold text-[11px] uppercase 2xl:table-header-group">
              <tr>
                <th className="py-3.5 px-4 text-start">{t.supplierAndCompany}</th>
                <th className="py-3.5 px-4 text-start">{t.contactAndAddress}</th>
                <th className="py-3.5 px-4 text-start">{t.totalPurchasesFromSupplier}</th>
                <th className="py-3.5 px-4 text-start">{t.totalSettledWithSupplier}</th>
                <th className="py-3.5 px-4 text-start">{t.remainingOwedToSupplier}</th>
                <th className="py-3.5 px-4 text-center">{t.transactionHistory}</th>
                <th className="py-3.5 px-4 text-center">{t.financialActions}</th>
              </tr>
            </thead>
            <tbody className="grid gap-3 p-3 2xl:table-row-group 2xl:divide-y 2xl:divide-slate-100 2xl:p-0">
              {filteredSuppliers.map((sup) => {
            const hasDebt = sup.balanceOwed > 0 || (sup.balanceOwedUsd || 0) > 0;
            const hasReceivable = (sup.receivableBalance || 0) > 0 || (sup.receivableBalanceUsd || 0) > 0;
            const isExpanded = !!expandedSupplierIds[sup.id];
            const transactionsCount = sup.transactions?.length || 0;
            return (<React.Fragment key={sup.id}>
                    <tr className={`grid min-w-0 grid-cols-1 overflow-hidden rounded-xl border border-slate-200 transition-colors sm:grid-cols-2 lg:grid-cols-3 2xl:table-row 2xl:rounded-none 2xl:border-0 ${hasDebt ? 'bg-rose-50/20 hover:bg-rose-50/40' : hasReceivable ? 'bg-sky-50/30 hover:bg-sky-50/50' : 'bg-white hover:bg-slate-50/80'}`}>
                      {/* Name & Identity */}
                      <td className="min-w-0 px-3 py-3 2xl:px-4 2xl:py-3.5">
                        <span className="mb-1 block text-[10px] font-semibold text-slate-500 2xl:hidden">{t.supplierAndCompany}</span>
                        <div className="flex items-center gap-2">
                          <button type="button" onClick={() => toggleExpand(sup.id)} className="p-1 rounded-md text-slate-400 hover:text-amber-600 hover:bg-amber-50 transition-colors cursor-pointer" title={t.toggleHistoryTooltip}>
                            {isExpanded ? <ChevronUp className="w-4 h-4 text-amber-600"/> : <ChevronDown className="w-4 h-4"/>}
                          </button>
                          <div>
                            <div className="font-bold text-slate-900 text-sm flex items-center gap-2">
                              <span>{sup.name}</span>
                              {hasDebt ? (<span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-700 border border-rose-200">
                                  {t.supplierCreditBadge}
                                </span>) : hasReceivable ? (<span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-100 text-sky-700 border border-sky-200">
                                  {t.theyOweUs}
                                </span>) : (<span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700 border border-emerald-200 inline-flex items-center gap-0.5">
                                  <CheckCircle className="w-3 h-3"/>
                                  <span>{t.settledBadge}</span>
                                </span>)}
                            </div>
                            <span className="text-[10px] text-slate-400 font-mono">
                              {t.idCode}: #{sup.id.slice(-6).toUpperCase()}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Contact & Address */}
                      <td className="min-w-0 px-3 py-3 2xl:px-4 2xl:py-3.5">
                        <span className="mb-1 block text-[10px] font-semibold text-slate-500 2xl:hidden">{t.contactAndAddress}</span>
                        <div className="space-y-0.5">
                          {sup.phone ? (<a href={`tel:${sup.phone}`} className="inline-flex items-center gap-1.5 text-xs text-slate-700 hover:text-amber-600 font-mono transition-colors" dir="ltr">
                              <Phone className="w-3.5 h-3.5 text-amber-600 shrink-0"/>
                              <span>{sup.phone}</span>
                            </a>) : (<span className="text-slate-400 text-xs">-</span>)}
                          {sup.address && (<div className="text-[11px] text-slate-500 flex items-center gap-1">
                              <MapPin className="w-3 h-3 text-slate-400 shrink-0"/>
                              <span className="truncate max-w-[200px]" title={sup.address}>{sup.address}</span>
                            </div>)}
                        </div>
                      </td>

                      {/* Total Purchases from Supplier */}
                      <td className="min-w-0 break-words px-3 py-3 font-mono font-bold text-slate-900 2xl:px-4 2xl:py-3.5">
                        <span className="mb-1 block font-sans text-[10px] font-semibold text-slate-500 2xl:hidden">{t.totalPurchasesFromSupplier}</span>
                        {sup.totalPurchasedAmount.toLocaleString()} AFN · {(sup.totalPurchasedAmountUsd || 0).toLocaleString()} USD
                      </td>

                      {/* Total Paid to Supplier */}
                      <td className="min-w-0 break-words px-3 py-3 font-mono font-bold text-emerald-700 2xl:px-4 2xl:py-3.5">
                        <span className="mb-1 block font-sans text-[10px] font-semibold text-slate-500 2xl:hidden">{t.totalSettledWithSupplier}</span>
                        {((sup.totalPaid || 0) + (sup.goodsSettledAmount || 0)).toLocaleString()} AFN · {((sup.totalPaidUsd || 0) + (sup.goodsSettledAmountUsd || 0)).toLocaleString()} USD
                        <span className="block text-[10px] font-medium text-emerald-700 mt-0.5">{t.cashPaidToSupplier}: {(sup.totalPaid || 0).toLocaleString()} AFN · {(sup.totalPaidUsd || 0).toLocaleString()} USD</span>
                        <span className="block text-[10px] font-medium text-emerald-600 mt-0.5">{t.nonCashGoodsSettled}: {(sup.goodsSettledAmount || 0).toLocaleString()} AFN · {(sup.goodsSettledAmountUsd || 0).toLocaleString()} USD</span>
                      </td>

                      {/* Remaining Debt / Balance Owed */}
                      <td className="min-w-0 break-words px-3 py-3 2xl:px-4 2xl:py-3.5">
                        <span className="mb-1 block text-[10px] font-semibold text-slate-500 2xl:hidden">{t.remainingOwedToSupplier}</span>
                        {hasDebt ? (<div className="inline-flex flex-col">
                            <span className="font-mono font-bold text-rose-700 text-sm">
                              {sup.balanceOwed.toLocaleString()} AFN · {(sup.balanceOwedUsd || 0).toLocaleString()} USD
                            </span>
                            <span className="text-[10px] text-rose-600 font-medium">{t.ourRemainingDebt}</span>
                          </div>) : hasReceivable ? (<div className="inline-flex flex-col">
                            <span className="font-mono font-bold text-sky-700 text-sm">{(sup.receivableBalance || 0).toLocaleString()} AFN · {(sup.receivableBalanceUsd || 0).toLocaleString()} USD</span>
                            <span className="text-[10px] text-sky-600 font-medium">{t.theyOweUs}</span>
                          </div>) : (<span className="font-mono text-slate-500 text-xs">
                            0 AFN · 0 USD
                          </span>)}
                      </td>

                      {/* Transaction Histories Toggle / Count */}
                      <td className="min-w-0 px-3 py-3 2xl:px-4 2xl:py-3.5 2xl:text-center">
                        <span className="mb-1 block text-[10px] font-semibold text-slate-500 2xl:hidden">{t.transactionHistory}</span>
                        <div className="flex flex-wrap items-center gap-1.5 2xl:justify-center">
                          <button type="button" onClick={() => toggleExpand(sup.id)} className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${isExpanded
                    ? 'bg-amber-600 text-white'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700'}`}>
                            <History className="w-3.5 h-3.5"/>
                            <span>{t.historyCount} ({transactionsCount})</span>
                            {isExpanded ? <ChevronUp className="w-3.5 h-3.5"/> : <ChevronDown className="w-3.5 h-3.5"/>}
                          </button>
                        </div>
                      </td>

                      {/* Action Buttons */}
                      <td className="min-w-0 px-3 py-3 sm:col-span-2 lg:col-span-3 2xl:table-cell 2xl:px-4 2xl:py-3.5 2xl:text-center">
                        <span className="mb-1 block text-[10px] font-semibold text-slate-500 2xl:hidden">{t.financialActions}</span>
                        <div className="flex flex-wrap items-center gap-1.5 2xl:justify-center">
                          <button type="button" onClick={() => openGoodsSettlement(sup)} className="p-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 transition-colors cursor-pointer" title={t.settleWithProcessedGoods}><Package className="w-4 h-4"/></button>
                          {hasDebt && (<button type="button" onClick={() => handleOpenSettleModal(sup)} className="px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold transition-all shadow-xs cursor-pointer active:scale-95">
                              {t.settlePayment}
                            </button>)}

                          <button type="button" onClick={() => openSupplierEdit(sup)} className="p-2 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-700 transition-colors cursor-pointer" title={t.editSupplier}><Pencil className="w-4 h-4"/></button>

                          <button type="button" onClick={() => { setStatementMode('current'); setSelectedHistorySupplier(sup); }} className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-900 transition-colors cursor-pointer" title={t.printOfficialStatement}>
                            <Printer className="w-4 h-4"/>
                          </button>

                          <button type="button" onClick={() => setSupplierToDelete(sup.id)} className="p-2 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer" title={t.delete}>
                            <Trash2 className="w-4 h-4"/>
                          </button>
                        </div>
                      </td>
                    </tr>

                    {/* Inline Expandable Transaction Histories Row */}
                    {isExpanded && (<tr className="block min-w-0 rounded-xl border border-slate-200 bg-slate-50/90 2xl:table-row 2xl:rounded-none 2xl:border-x-0 2xl:border-t-0">
                        <td colSpan={7} className="block min-w-0 p-2 sm:p-4 2xl:table-cell">
                          <div className="min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xs">
                            <div className="flex flex-col gap-2 border-b border-slate-200 bg-slate-100/70 p-3 sm:flex-row sm:items-center sm:justify-between">
                              <div className="flex min-w-0 items-center gap-2">
                                <History className="w-4 h-4 text-amber-600"/>
                                <span className="min-w-0 break-words font-bold text-xs text-slate-800">
                                  {t.detailedTransactionRecordFor} {sup.name}
                                </span>
                              </div>
                              <button type="button" onClick={() => { setStatementMode('current'); setSelectedHistorySupplier(sup); }} className="text-xs font-semibold text-amber-600 hover:text-amber-800 flex items-center gap-1 cursor-pointer">
                                <Printer className="w-3.5 h-3.5"/>
                                <span>{t.printFullStatement}</span>
                              </button>
                            </div>

                            {sup.transactions && sup.transactions.length > 0 ? (<>
                              <div className="grid gap-3 p-3 2xl:hidden">
                                {sortTransactionsNewestFirst(sup.transactions).map((tr) => (<article key={tr.id} className={`min-w-0 rounded-xl border border-slate-200 p-3 ${(tr.status || 'active') !== 'active' ? 'bg-slate-50 opacity-70' : 'bg-white'}`}>
                                  <div className="flex flex-wrap items-start justify-between gap-2">
                                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                                      <span className="font-mono text-xs text-slate-600">{tr.date}</span>
                                      {tr.type === 'purchase' ? (<span className="inline-flex items-center gap-1 rounded bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-700"><Package className="h-3 w-3"/>{getLocalizedTxType(tr.type)}</span>) : (<span className="inline-flex items-center gap-1 rounded bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700"><ArrowUpRight className="h-3 w-3"/>{getLocalizedTxType(tr.type)}</span>)}
                                    </div>
                                    <div className="flex shrink-0 items-center gap-1 print:hidden">
                                      <button type="button" disabled={(tr.status || 'active') !== 'active'} onClick={() => setEditingHistoryEntry({ partyId: sup.id, partyName: sup.name, transaction: tr })} className="rounded-lg bg-amber-50 p-2 text-amber-700 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-40" title={t.editHistoryEntry} aria-label={t.editHistoryEntry}><Pencil className="h-4 w-4"/></button>
                                      <button type="button" disabled={(tr.status || 'active') !== 'active'} onClick={() => setDeletingHistoryEntry({ partyId: sup.id, partyName: sup.name, transaction: tr })} className="rounded-lg bg-rose-50 p-2 text-rose-700 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-40" title={t.voidHistoryEntry} aria-label={t.voidHistoryEntry}><Trash2 className="h-4 w-4"/></button>
                                    </div>
                                  </div>
                                  <div className="mt-3 min-w-0 break-words rounded-lg bg-slate-50 p-2 text-xs font-medium text-slate-700">
                                    <span className="mb-1 block text-[10px] font-semibold text-slate-500">{t.descOrGoods}</span>
                                    {renderGoodsItems(tr)}
                                    {renderSupplierTransactionText(tr, sup)}
                                    {((tr.status || 'active') !== 'active' || tr.reversalOf) && <div className="mt-1"><span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-700">{tr.reversalOf ? t.replacementEntry : (tr.status === 'voided' ? t.voided : t.corrected)}</span>{tr.correctionReason && <span className="ms-2 text-[10px] text-slate-500">{tr.correctionReason}</span>}</div>}
                                  </div>
                                  <dl className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-3 lg:grid-cols-5">
                                    <div className="min-w-0 rounded-lg border border-slate-100 p-2"><dt className="text-[10px] text-slate-500">{t.quantity}</dt><dd className="mt-1 break-words font-mono text-slate-700">{tr.quantityKg != null ? `${Number(tr.quantityKg).toLocaleString()} kg` : '-'}</dd></div>
                                    <div className="min-w-0 rounded-lg border border-slate-100 p-2"><dt className="text-[10px] text-slate-500">{t.unitPriceKilo}</dt><dd className="mt-1 break-words font-mono text-slate-700">{tr.unitPrice != null ? `${Number(tr.unitPrice).toLocaleString()} ${tr.currency || 'AFN'}` : '-'}</dd></div>
                                    <div className="min-w-0 rounded-lg border border-slate-100 p-2"><dt className="text-[10px] text-slate-500">{t.invoiceAmount}</dt><dd className="mt-1 break-words font-mono font-bold text-slate-900">{Number(tr.amount) ? `${Number(tr.amount).toLocaleString()} ${tr.currency || 'AFN'}` : '-'}</dd></div>
                                    <div className="min-w-0 rounded-lg border border-slate-100 p-2"><dt className="text-[10px] text-slate-500">{t.paymentOrDebtReduction}</dt><dd className="mt-1 break-words font-mono font-bold text-emerald-700">{Number(tr.paidAmount || 0).toLocaleString()} {tr.currency || 'AFN'}</dd></div>
                                    <div className="col-span-2 min-w-0 rounded-lg border border-slate-100 p-2 sm:col-span-1"><dt className="text-[10px] text-slate-500">{t.remainingDebtBalance}</dt><dd className="mt-1 break-words font-mono font-bold text-rose-700">{Number(tr.accountBalanceAfter ?? tr.remainingAmount ?? 0).toLocaleString()} {tr.currency || 'AFN'}</dd></div>
                                  </dl>
                                </article>))}
                              </div>
                              <div className="hidden overflow-x-auto overscroll-x-contain touch-pan-x 2xl:block">
                                <table className="w-full min-w-[1120px] table-auto text-xs text-start">
                                  <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200 text-[10px]">
                                    <tr>
                                      <th className="py-2 px-3 text-start">{t.dateCol}</th>
                                      <th className="py-2 px-3 text-start">{t.transactionType}</th>
                                      <th className="py-2 px-3 text-start">{t.descOrGoods}</th>
                                      <th className="py-2 px-3 text-start">{t.quantity}</th>
                                      <th className="py-2 px-3 text-start">{t.unitPriceKilo}</th>
                                      <th className="py-2 px-3 text-start">{t.invoiceAmount}</th>
                                      <th className="py-2 px-3 text-start">{t.paymentOrDebtReduction}</th>
                                      <th className="py-2 px-3 text-start">{t.remainingDebtBalance}</th>
                                      <th className="py-2 px-3 text-center print:hidden">{t.actions}</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100">
                                    {sortTransactionsNewestFirst(sup.transactions).map((tr) => (<tr key={tr.id} className={`hover:bg-slate-50/50 ${(tr.status || 'active') !== 'active' ? 'bg-slate-50 opacity-70' : ''}`}>
                                        <td className="py-2.5 px-3 font-mono text-slate-600">{tr.date}</td>
                                        <td className="py-2.5 px-3">
                                          {tr.type === 'purchase' ? (<span className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded">
                                              <Package className="w-3 h-3"/>
                                              {getLocalizedTxType(tr.type)}
                                            </span>) : (<span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                                              <ArrowUpRight className="w-3 h-3"/>
                                              {getLocalizedTxType(tr.type)}
                                            </span>)}
                                        </td>
                                        <td className="min-w-[280px] max-w-[380px] whitespace-normal break-words py-2.5 px-3 text-slate-700 font-medium">
                                          {renderGoodsItems(tr)}
                                          {renderSupplierTransactionText(tr, sup)}
                                          {((tr.status || 'active') !== 'active' || tr.reversalOf) && <div className="mt-1"><span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-700">{tr.reversalOf ? t.replacementEntry : (tr.status === 'voided' ? t.voided : t.corrected)}</span>{tr.correctionReason && <span className="ms-2 text-[10px] text-slate-500">{tr.correctionReason}</span>}</div>}
                                        </td>
                                        <td className="py-2.5 px-3 font-mono text-slate-700">
                                          {tr.quantityKg != null ? `${Number(tr.quantityKg).toLocaleString()} kg` : '-'}
                                        </td>
                                        <td className="py-2.5 px-3 font-mono text-slate-700">
                                          {tr.unitPrice != null ? `${Number(tr.unitPrice).toLocaleString()} ${tr.currency || 'AFN'}` : '-'}
                                        </td>
                                        <td className="py-2.5 px-3 font-mono font-bold text-slate-900">
                                          {Number(tr.amount) ? `${Number(tr.amount).toLocaleString()} ${tr.currency || 'AFN'}` : '-'}
                                        </td>
                                        <td className="py-2.5 px-3 font-mono font-bold text-emerald-700">
                                          {Number(tr.paidAmount || 0).toLocaleString()} {tr.currency || 'AFN'}
                                        </td>
                                        <td className="py-2.5 px-3 font-mono font-bold text-rose-700">
                                          {Number(tr.accountBalanceAfter ?? tr.remainingAmount ?? 0).toLocaleString()} {tr.currency || 'AFN'}
                                        </td>
                                        <td className="py-2.5 px-3 print:hidden">
                                          <div className="flex items-center justify-center gap-1">
                                            <button type="button" disabled={(tr.status || 'active') !== 'active'} onClick={() => setEditingHistoryEntry({ partyId: sup.id, partyName: sup.name, transaction: tr })} className="rounded-lg bg-amber-50 p-1.5 text-amber-700 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-40" title={t.editHistoryEntry} aria-label={t.editHistoryEntry}><Pencil className="h-3.5 w-3.5"/></button>
                                            <button type="button" disabled={(tr.status || 'active') !== 'active'} onClick={() => setDeletingHistoryEntry({ partyId: sup.id, partyName: sup.name, transaction: tr })} className="rounded-lg bg-rose-50 p-1.5 text-rose-700 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-40" title={t.voidHistoryEntry} aria-label={t.voidHistoryEntry}><Trash2 className="h-3.5 w-3.5"/></button>
                                          </div>
                                        </td>
                                      </tr>))}
                                  </tbody>
                                </table>
                              </div>
                            </>) : (<div className="p-6 text-center text-slate-400 text-xs">
                                {t.noTxRecorded}
                              </div>)}
                          </div>
                        </td>
                      </tr>)}
                  </React.Fragment>);
        })}

              {filteredSuppliers.length === 0 && (<tr className="block 2xl:table-row">
                  <td colSpan={7} className="block py-12 text-center text-slate-500 2xl:table-cell">
                    <Truck className="w-10 h-10 text-slate-300 mx-auto mb-2"/>
                    <p className="text-sm font-medium">{t.noSupplierFound}</p>
                  </td>
                </tr>)}
            </tbody>
          </table>
        </div>
      </div>

      {editingHistoryEntry && <TransactionHistoryEditor
        partyName={editingHistoryEntry.partyName}
        transaction={editingHistoryEntry.transaction}
        role="supplier"
        rawStockOptions={db.rawMaterials}
        processedStockOptions={db.processedStock}
        t={t}
        getLocalizedTxType={getLocalizedTxType}
        accent="amber"
        onClose={() => setEditingHistoryEntry(null)}
        onSave={updates => updateSupplierTransaction(editingHistoryEntry.partyId, editingHistoryEntry.transaction.id, updates)}
      />}
      {deletingHistoryEntry && <TransactionVoidDialog
        partyName={deletingHistoryEntry.partyName}
        transaction={deletingHistoryEntry.transaction}
        t={t}
        onClose={() => setDeletingHistoryEntry(null)}
        onConfirm={reason => voidSupplierTransaction(deletingHistoryEntry.partyId, deletingHistoryEntry.transaction.id, reason)}
      />}

      {/* Supplier editor leaves inventory, stock, and transactions unchanged; paid differences adjust cash. */}
      {editingSupplier && supplierEdit && (<div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
        <div className="w-full max-w-2xl max-h-[92vh] overflow-y-auto bg-white rounded-2xl shadow-2xl border border-slate-200 p-6 text-slate-900">
          <div className="flex items-center justify-between mb-4"><div><h3 className="font-bold flex items-center gap-2"><Pencil className="w-5 h-5 text-amber-600"/>{t.editSupplier}</h3><p className="text-xs text-slate-500 mt-1">{t.supplierEditNotice}</p></div><button type="button" onClick={()=>setEditingSupplier(null)} aria-label={t.cancel} className="text-slate-400 hover:text-slate-700"><X className="w-5 h-5"/></button></div>
          <form onSubmit={handleSupplierEdit} className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <EditField label={t.supplierName}><input required value={supplierEdit.name} onChange={e=>setSupplierEdit({...supplierEdit,name:e.target.value})} className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-600"/></EditField>
              <EditField label={t.phone}><input inputMode="numeric" value={supplierEdit.phone} onChange={e=>setSupplierEdit({...supplierEdit,phone:e.target.value.replace(/\D/g,'').slice(0,10)})} className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-600"/></EditField>
              <div className="sm:col-span-2"><EditField label={t.address}><textarea rows="2" value={supplierEdit.address} onChange={e=>setSupplierEdit({...supplierEdit,address:e.target.value})} className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-600 resize-none"/></EditField></div>
            </div>
            <div className="border-t border-slate-200 pt-4"><h4 className="font-bold text-sm mb-3">{t.financialAmounts}</h4><div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <CurrencySupplierEdit t={t} currency="AFN" total={supplierEdit.totalPurchasedAmount} paid={supplierEdit.totalPaid} settled={supplierEdit.goodsSettledAmount} onTotal={value=>setSupplierEdit({...supplierEdit,totalPurchasedAmount:value})} onPaid={value=>setSupplierEdit({...supplierEdit,totalPaid:value})}/>
              <CurrencySupplierEdit t={t} currency="USD" total={supplierEdit.totalPurchasedAmountUsd} paid={supplierEdit.totalPaidUsd} settled={supplierEdit.goodsSettledAmountUsd} onTotal={value=>setSupplierEdit({...supplierEdit,totalPurchasedAmountUsd:value})} onPaid={value=>setSupplierEdit({...supplierEdit,totalPaidUsd:value})}/>
            </div></div>
            {supplierEditError&&<p className="text-xs font-semibold text-rose-700">{supplierEditError}</p>}
            <div className="flex justify-end gap-3 border-t pt-4"><button type="button" onClick={()=>setEditingSupplier(null)} className="px-4 py-2 rounded-xl bg-slate-100 text-xs font-bold">{t.cancel}</button><button type="submit" className="px-5 py-2 rounded-xl bg-amber-600 text-white text-xs font-bold">{t.save}</button></div>
          </form>
        </div>
      </div>)}

      {/* Settle supplier debt by transferring processed stock. */}
      {goodsSupplier && (<div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
        <div className="w-full max-w-3xl bg-white rounded-2xl shadow-2xl border border-slate-200 p-4 text-slate-900">
          <div className="flex items-start justify-between gap-3 mb-3"><div><h3 className="font-bold flex items-center gap-2"><Package className="w-5 h-5 text-emerald-600"/>{t.settleWithProcessedGoods}</h3><p className="text-xs text-slate-500 mt-1">{goodsSupplier.name} · {t.remainingDebt}: {(goodsSupplier.balanceOwed || 0).toLocaleString()} AFN · {(goodsSupplier.balanceOwedUsd || 0).toLocaleString()} USD</p></div><button type="button" onClick={()=>setGoodsSupplier(null)} aria-label={t.cancel} className="text-slate-400 hover:text-slate-700"><X className="w-5 h-5"/></button></div>
          <p className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2 mb-3">{t.goodsSettlementNotice}</p>
          <form onSubmit={handleGoodsSettlement} className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <EditField label={t.productName}><select required value={goodsProductId} onChange={event=>setGoodsProductId(event.target.value)} className={controlClass}><option value="">{t.selectProduct}</option>{db.processedStock.map(product=><option key={product.id} value={product.id}>{product.name}</option>)}</select></EditField>
              <EditField label={`${t.invoiceNumber} *`}><input required type="text" value={goodsBillNumber} onChange={event=>{setGoodsBillNumber(event.target.value);setGoodsError('');}} placeholder={t.billNumberPlaceholder} className={`${controlClass} font-mono ${isDuplicateGoodsBillNumber?'border-rose-500 focus:border-rose-600':''}`}/>{isDuplicateGoodsBillNumber&&<span className="mt-1 block text-xs font-semibold text-rose-700" role="alert">{t.duplicateBillNumber}</span>}</EditField>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <EditField label={t.saleUnit}><select value={goodsUnit} onChange={event=>{setGoodsUnit(event.target.value);setGoodsPrice('');}} className={controlClass}><option value="bag">{t.statementBag || t.bag}</option><option value="kg">{t.statementKilo || t.kilo}</option><option value="ton">{t.statementTon || t.ton}</option></select></EditField>
              <EditField label={t.quantity}><input required type="number" min="0.001" step="any" value={goodsQuantity} onChange={event=>setGoodsQuantity(event.target.value)} onWheel={event=>event.currentTarget.blur()} inputMode="decimal" className={controlClass}/></EditField>
              <EditField label={`${t.salePrice} — ${t[goodsUnit] || goodsUnit} (${goodsCurrency})`}><input required type="number" min="0.001" step="any" value={goodsPrice} onChange={event=>setGoodsPrice(event.target.value)} onWheel={event=>event.currentTarget.blur()} inputMode="decimal" className={controlClass}/></EditField>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <EditField label={t.currency}><select value={goodsCurrency} onChange={event=>setGoodsCurrency(event.target.value)} className={controlClass}><option value="AFN">AFN</option><option value="USD">USD</option></select></EditField>
              <EditField label={t.goodsNotes}><input value={goodsNotes} onChange={event=>setGoodsNotes(event.target.value)} className={controlClass}/></EditField>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 grid grid-cols-2 lg:grid-cols-4 gap-2 text-xs">
              <div><span className="text-slate-500 block">{t.stockToDeduct}</span><strong className="font-mono text-slate-900">{goodsWeightKg.toLocaleString()} {t.kilo}</strong>{goodsProduct&&<span className="block text-[10px] text-slate-500">{t.currentStockLabel}: {goodsProduct.stockKg.toLocaleString()} {t.kilo}</span>}</div>
              <div><span className="text-slate-500 block">{t.totalAmount}</span><strong className="font-mono text-slate-900">{goodsTotal.toLocaleString()} {goodsCurrency}</strong><span className="block text-[10px] text-slate-500">{goodsQuantityNumber.toLocaleString()} {t[goodsUnit] || goodsUnit} × {goodsPriceNumber.toLocaleString()} {goodsCurrency}</span></div>
              <div><span className="text-slate-500 block">{t.supplierDebtReduction}</span><strong className="font-mono text-emerald-700">{goodsDebtOffset.toLocaleString()} {goodsCurrency}</strong></div>
              <div><span className="text-slate-500 block">{t.customerDebtCreated}</span><strong className="font-mono text-rose-700">{goodsCustomerDebt.toLocaleString()} {goodsCurrency}</strong></div>
            </div>
            {goodsError&&<p className="text-xs font-semibold text-rose-700">{goodsError}</p>}
            <div className="flex justify-end gap-3 border-t pt-3"><button type="button" onClick={()=>setGoodsSupplier(null)} className="px-4 py-2 rounded-xl bg-slate-100 text-xs font-bold">{t.cancel}</button><button type="submit" disabled={isSavingGoods||!db.processedStock.length} className="px-5 py-2 rounded-xl bg-emerald-600 disabled:opacity-50 text-white text-xs font-bold">{isSavingGoods?t.goodsSaving:t.confirmGoodsSettlement}</button></div>
          </form>
        </div>
      </div>)}
      {/* Settle Supplier Payment Modal */}
      {settleModalSupplier && (<div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl shadow-2xl p-6 relative text-slate-900">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-amber-100 text-amber-700">
                  <CreditCard className="w-5 h-5"/>
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    {t.settlePayment}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {settleModalSupplier.name} ({t.remainingDebt}: {settleModalSupplier.balanceOwed.toLocaleString()} AFN · {(settleModalSupplier.balanceOwedUsd || 0).toLocaleString()} USD)
                  </p>
                </div>
              </div>
              <button type="button" onClick={() => setSettleModalSupplier(null)} className="text-slate-400 hover:text-slate-700 cursor-pointer">
                <X className="w-5 h-5"/>
              </button>
            </div>

            <form onSubmit={handleSettleSubmit} className="space-y-4 mt-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {t.paidAmountLabel} ({paymentCurrency}) *
                </label>
                <div className="relative">
                  <select value={paymentCurrency} onChange={(e) => { setPaymentCurrency(e.target.value); setPaymentAmount(''); setPaymentError(''); }} className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-sm font-bold mb-2"><option value="AFN">AFN</option><option value="USD">USD</option></select>
                  <input type="text" required inputMode="decimal" autoFocus value={paymentAmount} onChange={(e) => { setPaymentAmount(normalizeDecimalInput(e.target.value)); setPaymentError(''); }} className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-sm font-mono font-bold text-slate-900 focus:outline-none focus:border-amber-600 shadow-2xs"/>
                </div>
                {paymentError && <p className="text-xs font-semibold text-rose-700 mt-1" role="alert">{paymentError}</p>}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {t.paymentOrCheckNote}
                </label>
                <input type="text" value={paymentNote} onChange={(e) => setPaymentNote(e.target.value)} placeholder={t.paymentFromFactoryVault} className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-amber-600 shadow-2xs"/>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button type="button" onClick={() => setSettleModalSupplier(null)} className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold cursor-pointer">
                  {t.cancel}
                </button>
                <button type="submit" disabled={isSavingPayment} className="px-5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-xs font-bold shadow-md shadow-amber-600/25 cursor-pointer">
                  {isSavingPayment ? t.goodsSaving : t.save}
                </button>
              </div>
            </form>
          </div>
        </div>)}

      {/* Supplier Transaction History / Statement Modal */}
      {selectedHistorySupplier && (<div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center overflow-y-auto p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-white w-full max-w-6xl max-h-[calc(100dvh-2rem)] rounded-2xl shadow-2xl border border-slate-200 overflow-hidden text-slate-900 flex flex-col">
            <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-amber-100 text-amber-700">
                  <History className="w-5 h-5"/>
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    {t.accountStatementAndHistory} ({selectedHistorySupplier.name})
                  </h3>
                  <span className="text-[11px] text-slate-500 font-mono">
                    {t.phone}: {selectedHistorySupplier.phone || '-'} • {t.remainingDebt}: {selectedHistorySupplier.balanceOwed.toLocaleString()} AFN · {(selectedHistorySupplier.balanceOwedUsd || 0).toLocaleString()} USD • {t.theyOweUs}: {(selectedHistorySupplier.receivableBalance || 0).toLocaleString()} AFN · {(selectedHistorySupplier.receivableBalanceUsd || 0).toLocaleString()} USD
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center rounded-lg border border-slate-200 bg-white p-0.5 text-[10px] font-bold"><button type="button" onClick={()=>setStatementMode('current')} className={`rounded-md px-2 py-1 ${statementMode==='current'?'bg-amber-600 text-white':'text-slate-600'}`}>{t.currentStatement}</button><button type="button" onClick={()=>setStatementMode('audit')} className={`rounded-md px-2 py-1 ${statementMode==='audit'?'bg-slate-700 text-white':'text-slate-600'}`}>{t.auditStatement}</button></div>
                <ReceiptActions elementId="supplier-receipt" filename={`supplier-${statementMode}-statement-${selectedHistorySupplier.id}`} title={`${statementMode === 'audit' ? t.auditStatement : t.currentAccountStatement} - ${selectedHistorySupplier.name}`} printLabel={t.printInvoice} downloadLabel="PDF" creatingLabel={t.pdfCreating} downloadErrorLabel={t.pdfDownloadFailed}/>
                <button type="button" onClick={() => setSelectedHistorySupplier(null)} className="text-slate-400 hover:text-slate-900 cursor-pointer">
                  <X className="w-5 h-5"/>
                </button>
              </div>
            </div>

            <div className="min-h-0 overflow-y-auto overscroll-contain touch-pan-y">
              <AccountStatement id="supplier-receipt" party={selectedHistorySupplier} role="supplier" sales={db.sales} t={t} lang={lang} audit={statementMode === 'audit'}/>
            </div>
          </div>
        </div>)}

      {/* In-app Confirmation Modal for Supplier Deletion */}
      {supplierToDelete && (<div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-xl border border-slate-200 text-center">
            <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto mb-4">
              <Trash2 className="w-6 h-6"/>
            </div>
            <h3 className="text-base font-bold text-slate-900 mb-2">
              {t.delete}
            </h3>
            <p className="text-xs text-slate-600 mb-6">
              {t.confirmDeleteSupplierImpact}
            </p>
            <div className="flex gap-3">
              <button type="button" onClick={() => setSupplierToDelete(null)} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer">
                {t.cancel}
              </button>
              <button type="button" onClick={() => {
                deleteSupplier(supplierToDelete);
                setSupplierToDelete(null);
            }} className="flex-1 py-2.5 rounded-xl bg-rose-600 text-xs font-bold text-white hover:bg-rose-700 transition-colors cursor-pointer">
                {t.delete}
              </button>
            </div>
          </div>
        </div>)}
    </div>);
};

const controlClass = 'w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-600';
const EditField = ({label,children}) => <label className="block"><span className="block text-xs font-semibold text-slate-700 mb-1">{label}</span>{children}</label>;
const CurrencySupplierEdit = ({t,currency,total,paid,settled=0,onTotal,onPaid}) => {
    const net = (Number(total)||0) - (Number(paid)||0) - (Number(settled)||0);
    const remaining = Math.max(0, net);
    const receivable = Math.max(0, -net);
    return <div className="rounded-xl border border-slate-200 bg-slate-50 p-4"><h5 className="font-bold text-sm text-slate-800 mb-3">{currency}</h5><div className="space-y-3"><EditField label={t.totalAmount}><input type="number" min="0" step="any" required value={total} onChange={e=>onTotal(e.target.value)} className={controlClass}/></EditField><EditField label={t.amountPaidLabel}><input type="number" min="0" step="any" required value={paid} onChange={e=>onPaid(e.target.value)} className={controlClass}/></EditField><div className="text-[10px] text-emerald-700">{t.nonCashGoodsSettled}: <strong className="font-mono">{Number(settled).toLocaleString()} {currency}</strong></div><div className="rounded-lg bg-white border border-slate-200 px-3 py-2"><span className="block text-[10px] text-slate-500">{remaining > 0 ? t.remainingAutoCalculated : t.theyOweUs}</span><strong className={`font-mono ${remaining > 0 ? 'text-rose-700' : 'text-sky-700'}`}>{(remaining || receivable).toLocaleString()} {currency}</strong></div></div></div>;
};
