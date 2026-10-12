import React, { useState } from 'react';
import { useDatabase } from '../context/DatabaseContext';
import { ReceiptActions } from '../components';
import { normalizeDecimalInput } from '../lib/numberInput';
import { Users, Search, Phone, MapPin, Trash2, X, Printer, History, Wallet, DollarSign, Receipt, ArrowDownLeft, ChevronDown, ChevronUp, CheckCircle, Wheat, Pencil } from 'lucide-react';
const unitMultiplierKg = unit => unit === 'ton' ? 1000 : unit === 'bag' ? 50 : 1;
const transactionTime = transaction => {
    const timestamp = String(transaction?.id || '').match(/(\d{10,})$/)?.[1];
    return timestamp ? Number(timestamp) : (Date.parse(transaction?.date || '') || 0);
};
const latestSaleTime = customer => (customer.transactions || []).reduce((latest, transaction) => transaction.type === 'sale' ? Math.max(latest, transactionTime(transaction)) : latest, 0);
export const CustomersPage = () => {
    const { db, t, deleteCustomer, updateCustomer, receiveCustomerPayment, settleCustomerWithRawMaterial, getLocalizedTxType, getLocalizedTxDesc } = useDatabase();
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedHistoryCustomer, setSelectedHistoryCustomer] = useState(null);
    const [receiveModalCustomer, setReceiveModalCustomer] = useState(null);
    const [receivedAmount, setReceivedAmount] = useState('');
    const [paymentCurrency, setPaymentCurrency] = useState('AFN');
    const [paymentNote, setPaymentNote] = useState('');
    const [paymentStatus, setPaymentStatus] = useState(null);
    const [isSavingPayment, setIsSavingPayment] = useState(false);
    const [rawSettlementCustomer, setRawSettlementCustomer] = useState(null);
    const [rawMaterialName, setRawMaterialName] = useState('');
    const [rawUnit, setRawUnit] = useState('bag');
    const [rawQuantity, setRawQuantity] = useState('');
    const [rawUnitPrice, setRawUnitPrice] = useState('');
    const [rawCurrency, setRawCurrency] = useState('AFN');
    const [rawThreshold, setRawThreshold] = useState('');
    const [rawNotes, setRawNotes] = useState('');
    const [rawSettlementError, setRawSettlementError] = useState('');
    const [isSavingRawSettlement, setIsSavingRawSettlement] = useState(false);
    const [editingCustomer, setEditingCustomer] = useState(null);
    const [customerEdit, setCustomerEdit] = useState(null);
    const [customerEditError, setCustomerEditError] = useState('');
    // Delete customer modal
    const [customerToDelete, setCustomerToDelete] = useState(null);
    // Status Filter: 'all' | 'debtors' | 'settled'
    const [statusFilter, setStatusFilter] = useState('all');
    // Expanded row IDs for inline transaction histories
    const [expandedCustomerIds, setExpandedCustomerIds] = useState({});
    const customerTransactionDescription = transaction => transaction.type === 'raw_goods_settlement' && transaction.itemName
        ? `${t.customerRawSettlement}: ${transaction.itemName}`
        : getLocalizedTxDesc(transaction.description);
    const toggleExpand = (customerId) => {
        setExpandedCustomerIds(prev => ({
            ...prev,
            [customerId]: !prev[customerId]
        }));
    };
    const openCustomerEdit = customer => {
        setEditingCustomer(customer);
        setCustomerEdit({
            name: customer.name || '', phone: customer.phone || '', address: customer.address || '',
            totalPurchasedAmount: customer.totalPurchasedAmount || 0,
            totalPaid: customer.totalPaid || 0,
            rawSettledAmount: customer.rawSettledAmount || 0,
            totalPurchasedAmountUsd: customer.totalPurchasedAmountUsd || 0,
            totalPaidUsd: customer.totalPaidUsd || 0,
            rawSettledAmountUsd: customer.rawSettledAmountUsd || 0,
        });
        setCustomerEditError('');
    };
    const handleCustomerEdit = event => {
        event.preventDefault();
        const result = updateCustomer(editingCustomer.id, customerEdit);
        if (!result.success) { setCustomerEditError(result.error); return; }
        setEditingCustomer(null);
        setCustomerEdit(null);
    };
    const handleOpenReceiveModal = (c) => {
        setReceiveModalCustomer(c);
        setPaymentCurrency((c.balanceOwed || 0) > 0 ? 'AFN' : 'USD');
        setReceivedAmount('');
        setPaymentNote('');
        setPaymentStatus(null);
    };
    const handleReceiveSubmit = async (e) => {
        e.preventDefault();
        if (!receiveModalCustomer)
            return;
        const amount = Number(receivedAmount);
        if (isNaN(amount) || amount <= 0) {
            setPaymentStatus({ type: 'error', text: 'Payment must be greater than zero.' });
            return;
        }
        setIsSavingPayment(true);
        setPaymentStatus(null);
        const result = await receiveCustomerPayment(receiveModalCustomer.id, amount, paymentNote, paymentCurrency);
        setIsSavingPayment(false);
        setPaymentStatus(result.success
            ? { type: 'success', text: 'Customer payment saved to the database.' }
            : { type: 'error', text: result.error || 'Customer payment was not saved.' });
    };
    const openRawSettlement = customer => {
        setRawSettlementCustomer(customer);
        setRawMaterialName('');
        setRawUnit('bag');
        setRawQuantity('');
        setRawUnitPrice('');
        setRawCurrency((customer.balanceOwed || 0) > 0 ? 'AFN' : 'USD');
        setRawThreshold('');
        setRawNotes('');
        setRawSettlementError('');
    };
    const handleRawMaterialName = value => {
        setRawMaterialName(value);
        const existing = db.rawMaterials.find(material => material.name.trim().toLowerCase() === value.trim().toLowerCase());
        if (existing) {
            setRawUnitPrice((Number(existing.unitPrice) || 0) * unitMultiplierKg(rawUnit));
            setRawCurrency(existing.currency || 'AFN');
            setRawThreshold(existing.lowStockThreshold ?? '');
        }
    };
    const rawQuantityNumber = Number(rawQuantity) || 0;
    const rawWeightKg = rawQuantityNumber * unitMultiplierKg(rawUnit);
    const rawEnteredUnitPrice = Number(rawUnitPrice) || 0;
    const rawTotalValue = rawQuantityNumber * rawEnteredUnitPrice;
    const rawCustomerDebt = rawSettlementCustomer ? Number(rawCurrency === 'USD' ? rawSettlementCustomer.balanceOwedUsd : rawSettlementCustomer.balanceOwed) || 0 : 0;
    const rawCustomerOffset = Math.min(rawTotalValue, rawCustomerDebt);
    const rawSupplierDebt = Math.max(0, rawTotalValue - rawCustomerOffset);
    const handleRawSettlement = async event => {
        event.preventDefault();
        setRawSettlementError('');
        setIsSavingRawSettlement(true);
        const result = await settleCustomerWithRawMaterial({
            customerId: rawSettlementCustomer.id,
            materialName: rawMaterialName,
            category: 'Uncategorized',
            unitType: rawUnit,
            unitQuantity: rawQuantityNumber,
            unitPrice: Number(rawUnitPrice),
            currency: rawCurrency,
            lowStockThreshold: rawThreshold,
            notes: rawNotes,
        });
        setIsSavingRawSettlement(false);
        if (!result.success) { setRawSettlementError(result.error); return; }
        setRawSettlementCustomer(null);
    };
    // Aggregated totals
    const totalSalesAll = { AFN: db.customers.reduce((a,c)=>a+(c.totalPurchasedAmount||0),0), USD: db.customers.reduce((a,c)=>a+(c.totalPurchasedAmountUsd||0),0) };
    const totalCashReceivedAll = { AFN: db.customers.reduce((a,c)=>a+(c.totalPaid||0),0), USD: db.customers.reduce((a,c)=>a+(c.totalPaidUsd||0),0) };
    const totalRawSettledAll = { AFN: db.customers.reduce((a,c)=>a+(c.rawSettledAmount||0),0), USD: db.customers.reduce((a,c)=>a+(c.rawSettledAmountUsd||0),0) };
    const totalSettledAll = { AFN: totalCashReceivedAll.AFN + totalRawSettledAll.AFN, USD: totalCashReceivedAll.USD + totalRawSettledAll.USD };
    const totalReceivableDebtAll = { AFN: db.customers.reduce((a,c)=>a+(c.balanceOwed||0),0), USD: db.customers.reduce((a,c)=>a+(c.balanceOwedUsd||0),0) };
    const totalCustomerCreditAll = { AFN: db.customers.reduce((a,c)=>a+(c.creditBalance||0),0), USD: db.customers.reduce((a,c)=>a+(c.creditBalanceUsd||0),0) };
    const debtorCount = db.customers.filter(c => (c.balanceOwed || 0) > 0 || (c.balanceOwedUsd || 0) > 0).length;
    const customerCreditCount = db.customers.filter(c => (c.creditBalance || 0) > 0 || (c.creditBalanceUsd || 0) > 0).length;
    const settledCustomerCount = db.customers.filter(c => (c.balanceOwed || 0) <= 0 && (c.balanceOwedUsd || 0) <= 0 && (c.creditBalance || 0) <= 0 && (c.creditBalanceUsd || 0) <= 0).length;
    const filteredCustomers = db.customers.filter(c => {
        const matchesSearch = c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (c.phone && c.phone.includes(searchTerm)) ||
            (c.address && c.address.toLowerCase().includes(searchTerm.toLowerCase()));
        if (!matchesSearch)
            return false;
        if (statusFilter === 'debtors') {
            return (c.balanceOwed || 0) > 0 || (c.balanceOwedUsd || 0) > 0;
        }
        if (statusFilter === 'settled') {
            return (c.balanceOwed || 0) <= 0 && (c.balanceOwedUsd || 0) <= 0 && (c.creditBalance || 0) <= 0 && (c.creditBalanceUsd || 0) <= 0;
        }
        if (statusFilter === 'customerCredit') {
            return (c.creditBalance || 0) > 0 || (c.creditBalanceUsd || 0) > 0;
        }
        return true;
    }).sort((first, second) => latestSaleTime(second) - latestSaleTime(first));
    return (<div className="space-y-6">
      {/* Header with Title and Search */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-blue-100 text-blue-700">
              <Users className="w-5 h-5"/>
            </div>
            <span>{t.customersTitle}</span>
          </h2>
          <p className="text-xs sm:text-sm text-slate-600 mt-1">
            {t.customersDesc}
          </p>
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-80">
          <div className="absolute inset-y-0 start-0 flex items-center ps-3.5 pointer-events-none text-slate-400">
            <Search className="w-4 h-4"/>
          </div>
          <input type="text" placeholder={t.search} value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full ps-10 pe-4 py-2.5 text-xs sm:text-sm bg-slate-50 border border-slate-300 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:border-amber-600 shadow-2xs"/>
          {searchTerm && (<button type="button" onClick={() => setSearchTerm('')} className="absolute inset-y-0 end-0 pe-3 flex items-center text-slate-400 hover:text-slate-700 cursor-pointer">
              <X className="w-4 h-4"/>
            </button>)}
        </div>
      </div>

      {/* Financial Summary Banners */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-500">{t.totalCustomerPurchases}</span>
            <div className="text-xl font-bold font-mono text-slate-900 mt-1">
              {totalSalesAll.AFN.toLocaleString()} AFN · {totalSalesAll.USD.toLocaleString()} USD
            </div>
            <span className="text-xs text-slate-500">{db.customers.length} {t.navCustomers}</span>
          </div>
          <div className="p-3 bg-blue-100 text-blue-700 rounded-xl border border-blue-200">
            <Users className="w-6 h-6"/>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white border border-amber-200 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-500">{t.weOweCustomers}</span>
            <div className="text-xl font-bold font-mono text-amber-700 mt-1">
              {totalCustomerCreditAll.AFN.toLocaleString()} AFN · {totalCustomerCreditAll.USD.toLocaleString()} USD
            </div>
            <span className="text-xs text-amber-700 font-medium">{customerCreditCount} {t.customerCreditAccounts}</span>
          </div>
          <div className="p-3 bg-amber-100 text-amber-700 rounded-xl border border-amber-200"><ArrowDownLeft className="w-6 h-6"/></div>
        </div>

        <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-500">{t.totalSettledByCustomer}</span>
            <div className="text-xl font-bold font-mono text-emerald-700 mt-1">
              {totalSettledAll.AFN.toLocaleString()} AFN · {totalSettledAll.USD.toLocaleString()} USD
            </div>
            <span className="text-[10px] text-emerald-700 block">{t.cashReceivedFromCustomer}: {totalCashReceivedAll.AFN.toLocaleString()} AFN · {totalCashReceivedAll.USD.toLocaleString()} USD</span>
            <span className="text-[10px] text-emerald-600 block">{t.nonCashRawSettled}: {totalRawSettledAll.AFN.toLocaleString()} AFN · {totalRawSettledAll.USD.toLocaleString()} USD</span>
          </div>
          <div className="p-3 bg-emerald-100 text-emerald-700 rounded-xl border border-emerald-200">
            <Wallet className="w-6 h-6"/>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-500">{t.balanceOwedToCustomer}</span>
            <div className="text-xl font-bold font-mono text-rose-700 mt-1">
              {totalReceivableDebtAll.AFN.toLocaleString()} AFN · {totalReceivableDebtAll.USD.toLocaleString()} USD
            </div>
            <span className="text-xs text-rose-600 font-medium">
              {debtorCount} {t.debtorFarmsCount}
            </span>
          </div>
          <div className="p-3 bg-rose-100 text-rose-700 rounded-xl border border-rose-200">
            <DollarSign className="w-6 h-6"/>
          </div>
        </div>
      </div>

      {/* Comprehensive Row Layout / Line Structure Container */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Table Toolbar & Filters */}
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/50">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-blue-600"/>
            <h3 className="font-bold text-sm text-slate-900">
              {t.customersListLinear}
            </h3>
            <span className="text-xs text-slate-500 font-mono">({filteredCustomers.length})</span>
          </div>

          {/* Quick Filter Buttons */}
          <div className="flex items-center gap-1 bg-white border border-slate-200 p-1 rounded-xl text-xs">
            <button type="button" onClick={() => setStatusFilter('all')} className={`px-3 py-1 rounded-lg font-semibold transition-all cursor-pointer ${statusFilter === 'all'
            ? 'bg-blue-600 text-white shadow-xs'
            : 'text-slate-600 hover:text-slate-900'}`}>
              {t.allUnits} ({db.customers.length})
            </button>
            <button type="button" onClick={() => setStatusFilter('debtors')} className={`px-3 py-1 rounded-lg font-semibold transition-all cursor-pointer ${statusFilter === 'debtors'
            ? 'bg-rose-600 text-white shadow-xs'
            : 'text-slate-600 hover:text-slate-900'}`}>
              {t.debtors} ({debtorCount})
            </button>
            <button type="button" onClick={() => setStatusFilter('settled')} className={`px-3 py-1 rounded-lg font-semibold transition-all cursor-pointer ${statusFilter === 'settled'
            ? 'bg-emerald-600 text-white shadow-xs'
            : 'text-slate-600 hover:text-slate-900'}`}>
              {t.settled} ({settledCustomerCount})
            </button>
            <button type="button" onClick={() => setStatusFilter('customerCredit')} className={`px-3 py-1 rounded-lg font-semibold transition-all cursor-pointer ${statusFilter === 'customerCredit'
            ? 'bg-amber-600 text-white shadow-xs'
            : 'text-slate-600 hover:text-slate-900'}`}>
              {t.weOweThem} ({customerCreditCount})
            </button>
          </div>
        </div>

        {/* Structured Row / Line Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-start text-xs sm:text-sm min-w-[850px]">
            <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 font-semibold text-[11px] uppercase">
              <tr>
                <th className="py-3.5 px-4 text-start">{t.nameAndFarm}</th>
                <th className="py-3.5 px-4 text-start">{t.contactAndAddress}</th>
                <th className="py-3.5 px-4 text-start">{t.totalCustomerPurchases}</th>
                <th className="py-3.5 px-4 text-start">{t.totalSettledByCustomer}</th>
                <th className="py-3.5 px-4 text-start">{t.customerAccountBalance}</th>
                <th className="py-3.5 px-4 text-center">{t.transactionHistory}</th>
                <th className="py-3.5 px-4 text-center">{t.financialActions}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredCustomers.map((cust) => {
            const hasDebt = cust.balanceOwed > 0 || (cust.balanceOwedUsd || 0) > 0;
            const hasCredit = (cust.creditBalance || 0) > 0 || (cust.creditBalanceUsd || 0) > 0;
            const isExpanded = !!expandedCustomerIds[cust.id];
            const transactionsCount = cust.transactions?.length || 0;
            return (<React.Fragment key={cust.id}>
                    <tr className={`transition-colors ${hasDebt ? 'bg-rose-50/20 hover:bg-rose-50/40' : hasCredit ? 'bg-amber-50/30 hover:bg-amber-50/50' : 'hover:bg-slate-50/80'}`}>
                      {/* Name & Identity */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2">
                          <button type="button" onClick={() => toggleExpand(cust.id)} className="p-1 rounded-md text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors cursor-pointer" title={t.toggleHistoryTooltip}>
                            {isExpanded ? <ChevronUp className="w-4 h-4 text-blue-600"/> : <ChevronDown className="w-4 h-4"/>}
                          </button>
                          <div>
                            <div className="font-bold text-slate-900 text-sm flex items-center gap-2">
                              <span>{cust.name}</span>
                              {hasDebt && (<span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-700 border border-rose-200">
                                  {t.customerDebtBadge}
                                </span>)}
                              {hasCredit && (<span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700 border border-amber-200">{t.weOweThem}</span>)}
                              {!hasDebt && !hasCredit && (<span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700 border border-emerald-200 inline-flex items-center gap-0.5">
                                  <CheckCircle className="w-3 h-3"/>
                                  <span>{t.settledBadge}</span>
                                </span>)}
                            </div>
                            <span className="text-[10px] text-slate-400 font-mono">
                              {t.idCode}: #{cust.id.slice(-6).toUpperCase()}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Contact & Address */}
                      <td className="py-3.5 px-4">
                        <div className="space-y-0.5">
                          {cust.phone ? (<a href={`tel:${cust.phone}`} className="inline-flex items-center gap-1.5 text-xs text-slate-700 hover:text-blue-600 font-mono transition-colors" dir="ltr">
                              <Phone className="w-3.5 h-3.5 text-blue-600 shrink-0"/>
                              <span>{cust.phone}</span>
                            </a>) : (<span className="text-slate-400 text-xs">-</span>)}
                          {cust.address && (<div className="text-[11px] text-slate-500 flex items-center gap-1">
                              <MapPin className="w-3 h-3 text-slate-400 shrink-0"/>
                              <span className="truncate max-w-[200px]" title={cust.address}>{cust.address}</span>
                            </div>)}
                        </div>
                      </td>

                      {/* Total Purchases */}
                      <td className="py-3.5 px-4 font-mono font-bold text-slate-900">
                        {cust.totalPurchasedAmount.toLocaleString()} AFN · {(cust.totalPurchasedAmountUsd || 0).toLocaleString()} USD
                      </td>

                      {/* Total Payments */}
                      <td className="py-3.5 px-4 font-mono font-bold text-emerald-700">
                        {((cust.totalPaid || 0) + (cust.rawSettledAmount || 0)).toLocaleString()} AFN · {((cust.totalPaidUsd || 0) + (cust.rawSettledAmountUsd || 0)).toLocaleString()} USD
                        <span className="block text-[10px] font-medium text-emerald-700 mt-0.5">{t.cashReceivedFromCustomer}: {(cust.totalPaid || 0).toLocaleString()} AFN · {(cust.totalPaidUsd || 0).toLocaleString()} USD</span>
                        <span className="block text-[10px] font-medium text-emerald-600 mt-0.5">{t.nonCashRawSettled}: {(cust.rawSettledAmount || 0).toLocaleString()} AFN · {(cust.rawSettledAmountUsd || 0).toLocaleString()} USD</span>
                      </td>

                      {/* Remaining Debt */}
                      <td className="py-3.5 px-4">
                        {hasDebt && (<div className="inline-flex flex-col">
                            <span className="font-mono font-bold text-rose-700 text-sm">
                              {cust.balanceOwed.toLocaleString()} AFN · {(cust.balanceOwedUsd || 0).toLocaleString()} USD
                            </span>
                            <span className="text-[10px] text-rose-600 font-medium">{t.customerDebtBadge}</span>
                          </div>)}
                        {hasCredit && (<div className="inline-flex flex-col mt-1"><span className="font-mono font-bold text-amber-700 text-sm">{(cust.creditBalance || 0).toLocaleString()} AFN · {(cust.creditBalanceUsd || 0).toLocaleString()} USD</span><span className="text-[10px] text-amber-700 font-medium">{t.weOweThem}</span></div>)}
                        {!hasDebt && !hasCredit && (<span className="font-mono text-slate-500 text-xs">
                            0 AFN · 0 USD
                          </span>)}
                      </td>

                      {/* Transaction Histories Toggle / Count */}
                      <td className="py-3.5 px-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button type="button" onClick={() => toggleExpand(cust.id)} className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${isExpanded
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700'}`}>
                            <History className="w-3.5 h-3.5"/>
                            <span>{t.historyCount} ({transactionsCount})</span>
                            {isExpanded ? <ChevronUp className="w-3.5 h-3.5"/> : <ChevronDown className="w-3.5 h-3.5"/>}
                          </button>
                        </div>
                      </td>

                      {/* Action Buttons */}
                      <td className="py-3.5 px-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button type="button" onClick={() => openCustomerEdit(cust)} className="p-2 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 transition-colors cursor-pointer" title={t.editCustomer}><Pencil className="w-4 h-4"/></button>
                          <button type="button" onClick={() => openRawSettlement(cust)} className="p-2 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-700 transition-colors cursor-pointer" title={t.settleWithRawMaterial}><Wheat className="w-4 h-4"/></button>
                          <button type="button" onClick={() => handleOpenReceiveModal(cust)} className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-all shadow-xs cursor-pointer active:scale-95">
                              {t.receivePayment}
                            </button>

                          <button type="button" onClick={() => setSelectedHistoryCustomer(cust)} className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-900 transition-colors cursor-pointer" title={t.printOfficialStatement}>
                            <Printer className="w-4 h-4"/>
                          </button>

                          <button type="button" onClick={() => setCustomerToDelete(cust.id)} className="p-2 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer" title={t.delete}>
                            <Trash2 className="w-4 h-4"/>
                          </button>
                        </div>
                      </td>
                    </tr>

                    {/* Inline Expandable Transaction Histories Row */}
                    {isExpanded && (<tr className="bg-slate-50/90 border-b border-slate-200">
                        <td colSpan={7} className="p-4">
                          <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
                            <div className="p-3 bg-slate-100/70 border-b border-slate-200 flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <History className="w-4 h-4 text-blue-600"/>
                                <span className="font-bold text-xs text-slate-800">
                                  {t.detailedTransactionRecordFor} {cust.name}
                                </span>
                              </div>
                              <button type="button" onClick={() => setSelectedHistoryCustomer(cust)} className="text-xs font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1 cursor-pointer">
                                <Printer className="w-3.5 h-3.5"/>
                                <span>{t.printFullStatement}</span>
                              </button>
                            </div>

                            {cust.transactions && cust.transactions.length > 0 ? (<div className="overflow-x-auto">
                                <table className="w-full text-xs text-start">
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
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100">
                                    {cust.transactions.map((tr) => (<tr key={tr.id} className="hover:bg-slate-50/50">
                                        <td className="py-2.5 px-3 font-mono text-slate-600">{tr.date}</td>
                                        <td className="py-2.5 px-3">
                                          {tr.type === 'sale' ? (<span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded">
                                              <Receipt className="w-3 h-3"/>
                                              {getLocalizedTxType(tr.type)}
                                            </span>) : (<span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                                              <ArrowDownLeft className="w-3 h-3"/>
                                              {getLocalizedTxType(tr.type)}
                                            </span>)}
                                        </td>
                                        <td className="py-2.5 px-3 text-slate-700 font-medium">
                                          {tr.itemName && <div className="font-bold text-slate-900">{tr.itemName}</div>}
                                          {customerTransactionDescription(tr)}
                                        </td>
                                        <td className="py-2.5 px-3 font-mono text-slate-700">
                                          {tr.quantityKg != null ? `${Number(tr.quantityKg).toLocaleString()} kg` : '-'}
                                        </td>
                                        <td className="py-2.5 px-3 font-mono text-slate-700">
                                          {tr.unitPrice != null ? `${Number(tr.unitPrice).toLocaleString()} ${tr.currency || 'AFN'}` : '-'}
                                        </td>
                                        <td className="py-2.5 px-3 font-mono font-bold text-slate-900">
                                          {tr.amount ? `${tr.amount.toLocaleString()} ${tr.currency || 'AFN'}` : '-'}
                                        </td>
                                        <td className="py-2.5 px-3 font-mono font-bold text-emerald-700">
                                          {Number(tr.paidAmount || 0).toLocaleString()} {tr.currency || 'AFN'}
                                        </td>
                                        <td className="py-2.5 px-3 font-mono font-bold text-rose-700">
                                          {Number(tr.accountBalanceAfter ?? tr.remainingAmount ?? 0).toLocaleString()} {tr.currency || 'AFN'}
                                        </td>
                                      </tr>))}
                                  </tbody>
                                </table>
                              </div>) : (<div className="p-6 text-center text-slate-400 text-xs">
                                {t.noTxRecorded}
                              </div>)}
                          </div>
                        </td>
                      </tr>)}
                  </React.Fragment>);
        })}

              {filteredCustomers.length === 0 && (<tr>
                  <td colSpan={7} className="py-12 text-center text-slate-500">
                    <Users className="w-10 h-10 text-slate-300 mx-auto mb-2"/>
                    <p className="text-sm font-medium">{t.noCustomerFound}</p>
                  </td>
                </tr>)}
            </tbody>
          </table>
        </div>
      </div>

      {/* Customer account editor; related inventory, sales, and history remain unchanged. */}
      {editingCustomer && customerEdit && (<div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
        <div className="w-full max-w-2xl max-h-[92vh] overflow-y-auto bg-white rounded-2xl shadow-2xl border border-slate-200 p-6 text-slate-900">
          <div className="flex items-center justify-between mb-4"><div><h3 className="font-bold flex items-center gap-2"><Pencil className="w-5 h-5 text-blue-600"/>{t.editCustomer}</h3><p className="text-xs text-slate-500 mt-1">{t.customerEditNotice}</p></div><button type="button" onClick={()=>setEditingCustomer(null)} aria-label={t.cancel} className="text-slate-400 hover:text-slate-700"><X className="w-5 h-5"/></button></div>
          <form onSubmit={handleCustomerEdit} className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <CustomerEditField label={t.customerNameLabel}><input required value={customerEdit.name} onChange={event=>setCustomerEdit({...customerEdit,name:event.target.value})} className={customerEditControlClass}/></CustomerEditField>
              <CustomerEditField label={t.phone}><input inputMode="numeric" value={customerEdit.phone} onChange={event=>setCustomerEdit({...customerEdit,phone:event.target.value.replace(/\D/g,'').slice(0,10)})} className={customerEditControlClass}/></CustomerEditField>
              <div className="sm:col-span-2"><CustomerEditField label={t.address}><textarea rows="2" value={customerEdit.address} onChange={event=>setCustomerEdit({...customerEdit,address:event.target.value})} className={`${customerEditControlClass} resize-none`}/></CustomerEditField></div>
            </div>
            <div className="border-t border-slate-200 pt-4"><h4 className="font-bold text-sm mb-3">{t.financialAmounts}</h4><div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <CurrencyCustomerEdit t={t} currency="AFN" total={customerEdit.totalPurchasedAmount} cash={customerEdit.totalPaid} raw={customerEdit.rawSettledAmount} onTotal={value=>setCustomerEdit({...customerEdit,totalPurchasedAmount:value})} onCash={value=>setCustomerEdit({...customerEdit,totalPaid:value})} onRaw={value=>setCustomerEdit({...customerEdit,rawSettledAmount:value})}/>
              <CurrencyCustomerEdit t={t} currency="USD" total={customerEdit.totalPurchasedAmountUsd} cash={customerEdit.totalPaidUsd} raw={customerEdit.rawSettledAmountUsd} onTotal={value=>setCustomerEdit({...customerEdit,totalPurchasedAmountUsd:value})} onCash={value=>setCustomerEdit({...customerEdit,totalPaidUsd:value})} onRaw={value=>setCustomerEdit({...customerEdit,rawSettledAmountUsd:value})}/>
            </div></div>
            {customerEditError&&<p className="text-xs font-semibold text-rose-700">{customerEditError}</p>}
            <div className="flex justify-end gap-3 border-t pt-4"><button type="button" onClick={()=>setEditingCustomer(null)} className="px-4 py-2 rounded-xl bg-slate-100 text-xs font-bold">{t.cancel}</button><button type="submit" className="px-5 py-2 rounded-xl bg-blue-600 text-white text-xs font-bold">{t.save}</button></div>
          </form>
        </div>
      </div>)}

      {/* Receive raw material from a customer as a non-cash settlement. */}
      {rawSettlementCustomer && (<div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
        <div className="w-full max-w-2xl max-h-[92vh] overflow-y-auto bg-white rounded-2xl shadow-2xl border border-slate-200 p-6 text-slate-900">
          <div className="flex items-start justify-between gap-3 mb-5"><div><h3 className="font-bold flex items-center gap-2"><Wheat className="w-5 h-5 text-amber-600"/>{t.settleWithRawMaterial}</h3><p className="text-xs text-slate-500 mt-1">{rawSettlementCustomer.name} · {t.remainingDebt}: {(rawSettlementCustomer.balanceOwed || 0).toLocaleString()} AFN · {(rawSettlementCustomer.balanceOwedUsd || 0).toLocaleString()} USD</p></div><button type="button" onClick={()=>setRawSettlementCustomer(null)} aria-label={t.cancel} className="text-slate-400 hover:text-slate-700"><X className="w-5 h-5"/></button></div>
          <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4">{t.rawSettlementNotice}</p>
          <form onSubmit={handleRawSettlement} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><label className="block text-xs font-semibold text-slate-700 mb-1">{t.materialName}</label><input required value={rawMaterialName} onChange={event=>handleRawMaterialName(event.target.value)} list="customer-raw-materials" className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-600"/><datalist id="customer-raw-materials">{db.rawMaterials.map(material=><option key={material.id} value={material.name}>{material.name}</option>)}</datalist></div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div><label className="block text-xs font-semibold text-slate-700 mb-1">{t.saleUnit}</label><select value={rawUnit} onChange={event=>{setRawUnit(event.target.value);setRawUnitPrice('');}} className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm"><option value="bag">{t.unitBag50kg}</option><option value="kg">{t.unitKg}</option><option value="ton">{t.unitTon1000kg}</option></select></div>
              <div><label className="block text-xs font-semibold text-slate-700 mb-1">{t.quantity}</label><input required type="number" min="0.001" step="any" value={rawQuantity} onChange={event=>setRawQuantity(event.target.value)} className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono"/></div>
              <div><label className="block text-xs font-semibold text-slate-700 mb-1">{t.purchasePricePerSelectedUnit} — {t[rawUnit] || rawUnit} ({rawCurrency})</label><input required type="number" min="0.001" step="any" value={rawUnitPrice} onChange={event=>setRawUnitPrice(event.target.value)} className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono"/></div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div><label className="block text-xs font-semibold text-slate-700 mb-1">{t.currency}</label><select value={rawCurrency} onChange={event=>setRawCurrency(event.target.value)} className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm"><option value="AFN">AFN</option><option value="USD">USD</option></select></div>
              <div><label className="block text-xs font-semibold text-slate-700 mb-1">{t.thresholdLimitLabel}</label><input type="number" min="0" step="any" value={rawThreshold} onChange={event=>setRawThreshold(event.target.value)} className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono"/></div>
              <div><label className="block text-xs font-semibold text-slate-700 mb-1">{t.goodsNotes}</label><input value={rawNotes} onChange={event=>setRawNotes(event.target.value)} className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm"/></div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div><span className="text-slate-500 block">{t.rawStockAdded}</span><strong className="font-mono text-slate-900">{rawWeightKg.toLocaleString()} {t.kilo}</strong></div>
              <div><span className="text-slate-500 block">{t.totalAmount}</span><strong className="font-mono text-slate-900">{rawTotalValue.toLocaleString()} {rawCurrency}</strong><span className="block text-[10px] text-slate-500">{rawQuantityNumber.toLocaleString()} {t[rawUnit] || rawUnit} × {rawEnteredUnitPrice.toLocaleString()} {rawCurrency}</span></div>
              <div><span className="text-slate-500 block">{t.customerDebtReduction}</span><strong className="font-mono text-emerald-700">{rawCustomerOffset.toLocaleString()} {rawCurrency}</strong></div>
              <div><span className="text-slate-500 block">{t.supplierDebtCreated}</span><strong className="font-mono text-rose-700">{rawSupplierDebt.toLocaleString()} {rawCurrency}</strong></div>
            </div>
            {rawSettlementError&&<p className="text-xs font-semibold text-rose-700">{rawSettlementError}</p>}
            <div className="flex justify-end gap-3 border-t pt-4"><button type="button" onClick={()=>setRawSettlementCustomer(null)} className="px-4 py-2 rounded-xl bg-slate-100 text-xs font-bold">{t.cancel}</button><button type="submit" disabled={isSavingRawSettlement} className="px-5 py-2 rounded-xl bg-amber-600 disabled:opacity-50 text-white text-xs font-bold">{isSavingRawSettlement?t.goodsSaving:t.confirmRawSettlement}</button></div>
          </form>
        </div>
      </div>)}
      {/* Receive Customer Payment Modal */}
      {receiveModalCustomer && (<div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl shadow-2xl p-6 relative text-slate-900">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-blue-100 text-blue-700">
                  <Wallet className="w-5 h-5"/>
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    {t.receivePayment}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {receiveModalCustomer.name} ({t.remainingDebt}: {receiveModalCustomer.balanceOwed.toLocaleString()} AFN · {(receiveModalCustomer.balanceOwedUsd || 0).toLocaleString()} USD · {t.weOweThem}: {(receiveModalCustomer.creditBalance || 0).toLocaleString()} AFN · {(receiveModalCustomer.creditBalanceUsd || 0).toLocaleString()} USD)
                  </p>
                </div>
              </div>
              <button type="button" onClick={() => setReceiveModalCustomer(null)} className="text-slate-400 hover:text-slate-700 cursor-pointer">
                <X className="w-5 h-5"/>
              </button>
            </div>

            <form onSubmit={handleReceiveSubmit} className="space-y-4 mt-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {t.cashReceived} ({paymentCurrency}) *
                </label>
                <div className="relative">
                  <select value={paymentCurrency} onChange={(e) => { setPaymentCurrency(e.target.value); setReceivedAmount(''); }} className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-sm font-bold mb-2"><option value="AFN">AFN</option><option value="USD">USD</option></select>
                  <input type="text" required inputMode="decimal" value={receivedAmount} onChange={(e) => setReceivedAmount(normalizeDecimalInput(e.target.value))} className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-sm font-mono font-bold text-slate-900 focus:outline-none focus:border-amber-600 shadow-2xs"/>
                  <span className="absolute end-3 top-2.5 text-xs text-slate-500 font-medium">
                    {t.currency}
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {t.paymentOrCheckNote}
                </label>
                <input type="text" value={paymentNote} onChange={(e) => setPaymentNote(e.target.value)} placeholder={t.paymentFromFactoryVault} className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-amber-600 shadow-2xs"/>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button type="button" onClick={() => setReceiveModalCustomer(null)} className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold cursor-pointer">
                  {t.cancel}
                </button>
                <button type="submit" disabled={isSavingPayment || paymentStatus?.type === 'success'} className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 disabled:cursor-wait text-white text-xs font-bold shadow-md shadow-blue-600/25 cursor-pointer">
                  {isSavingPayment ? 'Saving...' : t.save}
                </button>
              </div>
              {paymentStatus && <p className={`text-xs font-semibold ${paymentStatus.type === 'success' ? 'text-emerald-700' : 'text-rose-700'}`} role="status">{paymentStatus.text}</p>}
            </form>
          </div>
        </div>)}

      {/* Customer Transaction History / Statement Modal */}
      {selectedHistoryCustomer && (<div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center overflow-y-auto p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-white w-full max-w-xl max-h-[calc(100dvh-2rem)] rounded-2xl shadow-2xl border border-slate-200 overflow-hidden text-slate-900 flex flex-col">
            <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-blue-100 text-blue-700">
                  <History className="w-5 h-5"/>
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    {t.accountStatementAndHistory} ({selectedHistoryCustomer.name})
                  </h3>
                  <span className="text-[11px] text-slate-500 font-mono">
                    {t.phone}: {selectedHistoryCustomer.phone || '-'} • {t.remainingDebt}: {selectedHistoryCustomer.balanceOwed.toLocaleString()} AFN · {(selectedHistoryCustomer.balanceOwedUsd || 0).toLocaleString()} USD • {t.weOweThem}: {(selectedHistoryCustomer.creditBalance || 0).toLocaleString()} AFN · {(selectedHistoryCustomer.creditBalanceUsd || 0).toLocaleString()} USD
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <ReceiptActions elementId="customer-receipt" filename={`customer-statement-${selectedHistoryCustomer.id}`} title={`${t.accountStatementAndHistory} - ${selectedHistoryCustomer.name}`} printLabel={t.printInvoice} downloadLabel="PDF"/>
                <button type="button" onClick={() => setSelectedHistoryCustomer(null)} className="text-slate-400 hover:text-slate-900 cursor-pointer">
                  <X className="w-5 h-5"/>
                </button>
              </div>
            </div>

            <div className="min-h-0 overflow-y-auto overscroll-contain touch-pan-y">
            <div id="customer-receipt" className="receipt-document bg-white p-5">
              <div className="text-center pb-4 border-b-2 border-slate-900">
                <h1 className="text-xl font-black text-slate-900">{t.companyName}</h1>
                <p className="text-xs text-slate-500 mt-1">{t.companySubtitle} · {t.accountStatementAndHistory}</p>
              </div>
              <div className="grid grid-cols-2 gap-3 my-4 p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs">
                <div><span className="text-slate-500 block">{t.customerNameLabel}</span><strong>{selectedHistoryCustomer.name}</strong></div>
                <div><span className="text-slate-500 block">{t.phone}</span><strong dir="ltr">{selectedHistoryCustomer.phone || '-'}</strong></div>
                <div><span className="text-slate-500 block">{t.totalPurchasedAmount}</span><strong className="font-mono">{selectedHistoryCustomer.totalPurchasedAmount.toLocaleString()} AFN · {(selectedHistoryCustomer.totalPurchasedAmountUsd || 0).toLocaleString()} USD</strong></div>
                <div><span className="text-slate-500 block">{t.totalSettledByCustomer}</span><strong className="font-mono text-emerald-700">{((selectedHistoryCustomer.totalPaid || 0) + (selectedHistoryCustomer.rawSettledAmount || 0)).toLocaleString()} AFN · {((selectedHistoryCustomer.totalPaidUsd || 0) + (selectedHistoryCustomer.rawSettledAmountUsd || 0)).toLocaleString()} USD</strong><span className="block text-[10px] text-slate-500 mt-0.5">{t.cashReceivedFromCustomer}: {(selectedHistoryCustomer.totalPaid || 0).toLocaleString()} AFN · {(selectedHistoryCustomer.totalPaidUsd || 0).toLocaleString()} USD<br/>{t.nonCashRawSettled}: {(selectedHistoryCustomer.rawSettledAmount || 0).toLocaleString()} AFN · {(selectedHistoryCustomer.rawSettledAmountUsd || 0).toLocaleString()} USD</span></div>
                <div><span className="text-slate-500 block">{t.remainingDebt}</span><strong className="font-mono text-rose-700">{selectedHistoryCustomer.balanceOwed.toLocaleString()} AFN · {(selectedHistoryCustomer.balanceOwedUsd || 0).toLocaleString()} USD</strong></div>
                <div><span className="text-slate-500 block">{t.weOweThem}</span><strong className="font-mono text-amber-700">{(selectedHistoryCustomer.creditBalance || 0).toLocaleString()} AFN · {(selectedHistoryCustomer.creditBalanceUsd || 0).toLocaleString()} USD</strong></div>
              </div>
            <div className="space-y-2.5">
              {selectedHistoryCustomer.transactions && selectedHistoryCustomer.transactions.length > 0 ? (selectedHistoryCustomer.transactions.map((h) => (<div key={h.id} className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs shadow-2xs">
                    <div className="flex justify-between items-start gap-3">
                    <div>
                      <div className="font-mono text-slate-500">{h.date}</div>
                      {h.itemName && <div className="text-slate-900 mt-1 font-bold">{h.itemName}</div>}
                      <div className="text-slate-800 mt-0.5 font-medium">{customerTransactionDescription(h)}</div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        {t.transactionType}: {getLocalizedTxType(h.type)}
                      </div>
                    </div>
                    <div className="text-end">
                      <div className="font-bold font-mono text-emerald-700 text-sm">
                        {h.type === 'raw_goods_settlement' ? t.customerDebtReduction : t.cashReceived}: {Number(h.paidAmount || 0).toLocaleString()} {h.currency || 'AFN'}
                      </div>
                      <div className="text-[11px] text-rose-700 font-mono mt-0.5">
                        {t.remainingDebt}: {Number(h.accountBalanceAfter ?? h.remainingAmount ?? 0).toLocaleString()} {h.currency || 'AFN'}
                      </div>
                    </div>
                    </div>
                    {h.itemName && <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-slate-200 text-[11px]">
                      <div><span className="text-slate-500 block">{t.quantity}</span><strong className="font-mono">{Number(h.quantityKg || 0).toLocaleString()} kg</strong></div>
                      <div><span className="text-slate-500 block">{t.unitPriceKilo}</span><strong className="font-mono">{Number(h.unitPrice || 0).toLocaleString()} {h.currency || 'AFN'}</strong></div>
                    </div>}
                  </div>))) : (<div className="p-8 text-center text-slate-500 text-xs">
                  {t.noTxRecorded}
                </div>)}
            </div>

            {/* Print Statement Footer with Branding */}
            <div className="p-3 bg-slate-50 border-t border-slate-200 text-center">
              <div className="text-[10px] font-mono text-slate-500">
                {t.developedBy}
              </div>
            </div>
            </div>
            </div>
          </div>
        </div>)}

      {/* In-app Confirmation Modal for Customer Deletion */}
      {customerToDelete && (<div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-xl border border-slate-200 text-center">
            <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto mb-4">
              <Trash2 className="w-6 h-6"/>
            </div>
            <h3 className="text-base font-bold text-slate-900 mb-2">
              {t.delete}
            </h3>
            <p className="text-xs text-slate-600 mb-6">
              {t.confirmDelete}
            </p>
            <div className="flex gap-3">
              <button type="button" onClick={() => setCustomerToDelete(null)} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer">
                {t.cancel}
              </button>
              <button type="button" onClick={() => {
                deleteCustomer(customerToDelete);
                setCustomerToDelete(null);
            }} className="flex-1 py-2.5 rounded-xl bg-rose-600 text-xs font-bold text-white hover:bg-rose-700 transition-colors cursor-pointer">
                {t.delete}
              </button>
            </div>
          </div>
        </div>)}
    </div>);
};

const customerEditControlClass = 'w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-600';
const CustomerEditField = ({label,children}) => <label className="block"><span className="block text-xs font-semibold text-slate-700 mb-1">{label}</span>{children}</label>;
const CurrencyCustomerEdit = ({t,currency,total,cash,raw,onTotal,onCash,onRaw}) => {
    const update = setter => event => setter(normalizeDecimalInput(event.target.value));
    const net = (Number(total) || 0) - (Number(cash) || 0) - (Number(raw) || 0);
    const debt = Math.max(0, net);
    const credit = Math.max(0, -net);
    return <div className="rounded-xl border border-slate-200 bg-slate-50 p-4"><h5 className="font-bold text-sm text-slate-800 mb-3">{currency}</h5><div className="space-y-3"><CustomerEditField label={t.totalPurchasedAmount}><input type="text" inputMode="decimal" required value={total} onChange={update(onTotal)} className={customerEditControlClass}/></CustomerEditField><CustomerEditField label={t.cashReceivedFromCustomer}><input type="text" inputMode="decimal" required value={cash} onChange={update(onCash)} className={customerEditControlClass}/></CustomerEditField><CustomerEditField label={t.nonCashRawSettled}><input type="text" inputMode="decimal" required value={raw} onChange={update(onRaw)} className={customerEditControlClass}/></CustomerEditField><div className="grid grid-cols-2 gap-2"><div className="rounded-lg bg-white border border-slate-200 px-3 py-2"><span className="block text-[10px] text-slate-500">{t.remainingDebt}</span><strong className="font-mono text-rose-700">{debt.toLocaleString()} {currency}</strong></div><div className="rounded-lg bg-white border border-amber-200 px-3 py-2"><span className="block text-[10px] text-slate-500">{t.weOweThem}</span><strong className="font-mono text-amber-700">{credit.toLocaleString()} {currency}</strong></div></div></div></div>;
};
