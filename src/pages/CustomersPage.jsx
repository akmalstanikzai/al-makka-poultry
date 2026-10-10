import React, { useState } from 'react';
import { useDatabase } from '../context/DatabaseContext';
import { ReceiptActions } from '../components';
import { Users, Search, Phone, MapPin, Trash2, X, Printer, History, Wallet, DollarSign, Receipt, ArrowDownLeft, ChevronDown, ChevronUp, CheckCircle, Wheat } from 'lucide-react';
export const CustomersPage = () => {
    const { db, t, deleteCustomer, receiveCustomerPayment, settleCustomerWithRawMaterial, getLocalizedName, getLocalizedTxType, getLocalizedTxDesc } = useDatabase();
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
    // Delete customer modal
    const [customerToDelete, setCustomerToDelete] = useState(null);
    // Status Filter: 'all' | 'debtors' | 'settled'
    const [statusFilter, setStatusFilter] = useState('all');
    // Expanded row IDs for inline transaction histories
    const [expandedCustomerIds, setExpandedCustomerIds] = useState({});
    const toggleExpand = (customerId) => {
        setExpandedCustomerIds(prev => ({
            ...prev,
            [customerId]: !prev[customerId]
        }));
    };
    const handleOpenReceiveModal = (c) => {
        setReceiveModalCustomer(c);
        setPaymentCurrency((c.balanceOwed || 0) > 0 ? 'AFN' : 'USD');
        setReceivedAmount((c.balanceOwed || 0) > 0 ? c.balanceOwed : (c.balanceOwedUsd || 0));
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
            setRawUnitPrice(existing.unitPrice || '');
            setRawCurrency(existing.currency || 'AFN');
            setRawThreshold(existing.lowStockThreshold ?? '');
        }
    };
    const rawQuantityNumber = Number(rawQuantity) || 0;
    const rawWeightKg = rawUnit === 'ton' ? rawQuantityNumber * 1000 : rawUnit === 'bag' ? rawQuantityNumber * 50 : rawQuantityNumber;
    const rawTotalValue = rawWeightKg * (Number(rawUnitPrice) || 0);
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
    const totalPaidAll = { AFN: db.customers.reduce((a,c)=>a+(c.totalPaid||0),0), USD: db.customers.reduce((a,c)=>a+(c.totalPaidUsd||0),0) };
    const totalReceivableDebtAll = { AFN: db.customers.reduce((a,c)=>a+(c.balanceOwed||0),0), USD: db.customers.reduce((a,c)=>a+(c.balanceOwedUsd||0),0) };
    const debtorCount = db.customers.filter(c => (c.balanceOwed || 0) > 0 || (c.balanceOwedUsd || 0) > 0).length;
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
            return (c.balanceOwed || 0) <= 0 && (c.balanceOwedUsd || 0) <= 0;
        }
        return true;
    });
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
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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

        <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-500">{t.cashReceived}</span>
            <div className="text-xl font-bold font-mono text-emerald-700 mt-1">
              {totalPaidAll.AFN.toLocaleString()} AFN · {totalPaidAll.USD.toLocaleString()} USD
            </div>
            <span className="text-xs text-emerald-600">{t.receivedFromCustomers}</span>
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
              {t.settled} ({db.customers.length - debtorCount})
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
                <th className="py-3.5 px-4 text-start">{t.cashPaid}</th>
                <th className="py-3.5 px-4 text-start">{t.remainingDebt}</th>
                <th className="py-3.5 px-4 text-center">{t.transactionHistory}</th>
                <th className="py-3.5 px-4 text-center">{t.financialActions}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredCustomers.map((cust) => {
            const hasDebt = cust.balanceOwed > 0 || (cust.balanceOwedUsd || 0) > 0;
            const isExpanded = !!expandedCustomerIds[cust.id];
            const transactionsCount = cust.transactions?.length || 0;
            return (<React.Fragment key={cust.id}>
                    <tr className={`transition-colors ${hasDebt ? 'bg-rose-50/20 hover:bg-rose-50/40' : 'hover:bg-slate-50/80'}`}>
                      {/* Name & Identity */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2">
                          <button type="button" onClick={() => toggleExpand(cust.id)} className="p-1 rounded-md text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors cursor-pointer" title={t.toggleHistoryTooltip}>
                            {isExpanded ? <ChevronUp className="w-4 h-4 text-blue-600"/> : <ChevronDown className="w-4 h-4"/>}
                          </button>
                          <div>
                            <div className="font-bold text-slate-900 text-sm flex items-center gap-2">
                              <span>{cust.name}</span>
                              {hasDebt ? (<span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-700 border border-rose-200">
                                  {t.customerDebtBadge}
                                </span>) : (<span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700 border border-emerald-200 inline-flex items-center gap-0.5">
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
                        {cust.totalPaid.toLocaleString()} AFN · {(cust.totalPaidUsd || 0).toLocaleString()} USD
                        {((cust.rawSettledAmount || 0) > 0 || (cust.rawSettledAmountUsd || 0) > 0) && <span className="block text-[10px] font-medium text-emerald-600 mt-0.5">{t.nonCashRawSettled}: {(cust.rawSettledAmount || 0).toLocaleString()} AFN · {(cust.rawSettledAmountUsd || 0).toLocaleString()} USD</span>}
                      </td>

                      {/* Remaining Debt */}
                      <td className="py-3.5 px-4">
                        {hasDebt ? (<div className="inline-flex flex-col">
                            <span className="font-mono font-bold text-rose-700 text-sm">
                              {cust.balanceOwed.toLocaleString()} AFN · {(cust.balanceOwedUsd || 0).toLocaleString()} USD
                            </span>
                            <span className="text-[10px] text-rose-600 font-medium">{t.customerDebtBadge}</span>
                          </div>) : (<span className="font-mono text-slate-500 text-xs">
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
                          <button type="button" onClick={() => openRawSettlement(cust)} className="p-2 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-700 transition-colors cursor-pointer" title={t.settleWithRawMaterial}><Wheat className="w-4 h-4"/></button>
                          {hasDebt && (<button type="button" onClick={() => handleOpenReceiveModal(cust)} className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-all shadow-xs cursor-pointer active:scale-95">
                              {t.receivePayment}
                            </button>)}

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
                                      <th className="py-2 px-3 text-start">{t.invoiceAmount}</th>
                                      <th className="py-2 px-3 text-start">{t.paidAmountLabel}</th>
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
                                          {getLocalizedTxDesc(tr.description)}
                                        </td>
                                        <td className="py-2.5 px-3 font-mono font-bold text-slate-900">
                                          {tr.amount ? `${tr.amount.toLocaleString()} ${tr.currency || 'AFN'}` : '-'}
                                        </td>
                                        <td className="py-2.5 px-3 font-mono font-bold text-emerald-700">
                                          {tr.paidAmount.toLocaleString()} {tr.currency || 'AFN'}
                                        </td>
                                        <td className="py-2.5 px-3 font-mono font-bold text-rose-700">
                                          {tr.remainingAmount.toLocaleString()} {tr.currency || 'AFN'}
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

      {/* Receive raw material from a customer as a non-cash settlement. */}
      {rawSettlementCustomer && (<div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
        <div className="w-full max-w-2xl max-h-[92vh] overflow-y-auto bg-white rounded-2xl shadow-2xl border border-slate-200 p-6 text-slate-900">
          <div className="flex items-start justify-between gap-3 mb-5"><div><h3 className="font-bold flex items-center gap-2"><Wheat className="w-5 h-5 text-amber-600"/>{t.settleWithRawMaterial}</h3><p className="text-xs text-slate-500 mt-1">{rawSettlementCustomer.name} · {t.remainingDebt}: {(rawSettlementCustomer.balanceOwed || 0).toLocaleString()} AFN · {(rawSettlementCustomer.balanceOwedUsd || 0).toLocaleString()} USD</p></div><button type="button" onClick={()=>setRawSettlementCustomer(null)} aria-label={t.cancel} className="text-slate-400 hover:text-slate-700"><X className="w-5 h-5"/></button></div>
          <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4">{t.rawSettlementNotice}</p>
          <form onSubmit={handleRawSettlement} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><label className="block text-xs font-semibold text-slate-700 mb-1">{t.materialName}</label><input required value={rawMaterialName} onChange={event=>handleRawMaterialName(event.target.value)} list="customer-raw-materials" className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-600"/><datalist id="customer-raw-materials">{db.rawMaterials.map(material=><option key={material.id} value={material.name}>{getLocalizedName(material.name)}</option>)}</datalist></div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div><label className="block text-xs font-semibold text-slate-700 mb-1">{t.saleUnit}</label><select value={rawUnit} onChange={event=>setRawUnit(event.target.value)} className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm"><option value="bag">{t.unitBag50kg}</option><option value="kg">{t.unitKg}</option><option value="ton">{t.unitTon1000kg}</option></select></div>
              <div><label className="block text-xs font-semibold text-slate-700 mb-1">{t.quantity}</label><input required type="number" min="0.001" step="any" value={rawQuantity} onChange={event=>setRawQuantity(event.target.value)} className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono"/></div>
              <div><label className="block text-xs font-semibold text-slate-700 mb-1">{t.unitPriceKilo} ({rawCurrency})</label><input required type="number" min="0.001" step="any" value={rawUnitPrice} onChange={event=>setRawUnitPrice(event.target.value)} className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono"/></div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div><label className="block text-xs font-semibold text-slate-700 mb-1">{t.currency}</label><select value={rawCurrency} onChange={event=>setRawCurrency(event.target.value)} className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm"><option value="AFN">AFN</option><option value="USD">USD</option></select></div>
              <div><label className="block text-xs font-semibold text-slate-700 mb-1">{t.thresholdLimitLabel}</label><input type="number" min="0" step="any" value={rawThreshold} onChange={event=>setRawThreshold(event.target.value)} className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono"/></div>
              <div><label className="block text-xs font-semibold text-slate-700 mb-1">{t.goodsNotes}</label><input value={rawNotes} onChange={event=>setRawNotes(event.target.value)} className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm"/></div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div><span className="text-slate-500 block">{t.rawStockAdded}</span><strong className="font-mono text-slate-900">{rawWeightKg.toLocaleString()} {t.kilo}</strong></div>
              <div><span className="text-slate-500 block">{t.totalAmount}</span><strong className="font-mono text-slate-900">{rawTotalValue.toLocaleString()} {rawCurrency}</strong></div>
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
                    {receiveModalCustomer.name} ({t.remainingDebt}: {receiveModalCustomer.balanceOwed.toLocaleString()} AFN · {(receiveModalCustomer.balanceOwedUsd || 0).toLocaleString()} USD)
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
                  <select value={paymentCurrency} onChange={(e) => { setPaymentCurrency(e.target.value); setReceivedAmount(e.target.value === 'USD' ? (receiveModalCustomer.balanceOwedUsd || 0) : (receiveModalCustomer.balanceOwed || 0)); }} className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-sm font-bold mb-2"><option value="AFN">AFN</option><option value="USD">USD</option></select>
                  <input type="number" required min="0.01" step="any" max={paymentCurrency === 'USD' ? (receiveModalCustomer.balanceOwedUsd || 0) : receiveModalCustomer.balanceOwed} value={receivedAmount} onChange={(e) => setReceivedAmount(e.target.value)} className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-sm font-mono font-bold text-slate-900 focus:outline-none focus:border-amber-600 shadow-2xs"/>
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
      {selectedHistoryCustomer && (<div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-white w-full max-w-xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden text-slate-900">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-blue-100 text-blue-700">
                  <History className="w-5 h-5"/>
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    {t.accountStatementAndHistory} ({selectedHistoryCustomer.name})
                  </h3>
                  <span className="text-[11px] text-slate-500 font-mono">
                    {t.phone}: {selectedHistoryCustomer.phone || '-'} • {t.remainingDebt}: {selectedHistoryCustomer.balanceOwed.toLocaleString()} AFN · {(selectedHistoryCustomer.balanceOwedUsd || 0).toLocaleString()} USD
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

            <div id="customer-receipt" className="receipt-document bg-white p-5">
              <div className="text-center pb-4 border-b-2 border-slate-900">
                <h1 className="text-xl font-black text-slate-900">{t.companyName}</h1>
                <p className="text-xs text-slate-500 mt-1">{t.companySubtitle} · {t.accountStatementAndHistory}</p>
              </div>
              <div className="grid grid-cols-2 gap-3 my-4 p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs">
                <div><span className="text-slate-500 block">{t.customerNameLabel}</span><strong>{selectedHistoryCustomer.name}</strong></div>
                <div><span className="text-slate-500 block">{t.phone}</span><strong dir="ltr">{selectedHistoryCustomer.phone || '-'}</strong></div>
                <div><span className="text-slate-500 block">{t.totalPurchasedAmount}</span><strong className="font-mono">{selectedHistoryCustomer.totalPurchasedAmount.toLocaleString()} AFN · {(selectedHistoryCustomer.totalPurchasedAmountUsd || 0).toLocaleString()} USD</strong></div>
                <div><span className="text-slate-500 block">{t.totalPaid}</span><strong className="font-mono text-emerald-700">{selectedHistoryCustomer.totalPaid.toLocaleString()} AFN · {(selectedHistoryCustomer.totalPaidUsd || 0).toLocaleString()} USD</strong></div>
                <div><span className="text-slate-500 block">{t.remainingDebt}</span><strong className="font-mono text-rose-700">{selectedHistoryCustomer.balanceOwed.toLocaleString()} AFN · {(selectedHistoryCustomer.balanceOwedUsd || 0).toLocaleString()} USD</strong></div>
              </div>
            <div className="space-y-2.5">
              {selectedHistoryCustomer.transactions && selectedHistoryCustomer.transactions.length > 0 ? (selectedHistoryCustomer.transactions.map((h) => (<div key={h.id} className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex justify-between items-center text-xs shadow-2xs">
                    <div>
                      <div className="font-mono text-slate-500">{h.date}</div>
                      <div className="text-slate-800 mt-0.5 font-medium">{getLocalizedTxDesc(h.description)}</div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        {t.transactionType}: {getLocalizedTxType(h.type)}
                      </div>
                    </div>
                    <div className="text-end">
                      <div className="font-bold font-mono text-emerald-700 text-sm">
                        {t.cashPaid}: {h.paidAmount.toLocaleString()} {h.currency || 'AFN'}
                      </div>
                      <div className="text-[11px] text-rose-700 font-mono mt-0.5">
                        {t.remainingDebt}: {h.remainingAmount.toLocaleString()} {h.currency || 'AFN'}
                      </div>
                    </div>
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
