import React, { useState } from 'react';
import { useDatabase } from '../context/DatabaseContext';
import { ReceiptActions } from '../components';
import { Truck, Search, Phone, MapPin, Trash2, X, Printer, History, Wallet, CreditCard, Package, ArrowUpRight, ChevronDown, ChevronUp, CheckCircle, Pencil } from 'lucide-react';
export const SuppliersPage = () => {
    const { db, t, deleteSupplier, settleSupplierPayment, settleSupplierWithProcessedStock, updateSupplier, getLocalizedName, getLocalizedTxType, getLocalizedTxDesc } = useDatabase();
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedHistorySupplier, setSelectedHistorySupplier] = useState(null);
    const [settleModalSupplier, setSettleModalSupplier] = useState(null);
    const [paymentAmount, setPaymentAmount] = useState('');
    const [paymentCurrency, setPaymentCurrency] = useState('AFN');
    const [paymentNote, setPaymentNote] = useState('');
    const [editingSupplier, setEditingSupplier] = useState(null);
    const [supplierEdit, setSupplierEdit] = useState(null);
    const [supplierEditError, setSupplierEditError] = useState('');
    const [goodsSupplier, setGoodsSupplier] = useState(null);
    const [goodsProductId, setGoodsProductId] = useState('');
    const [goodsUnit, setGoodsUnit] = useState('bag');
    const [goodsQuantity, setGoodsQuantity] = useState('');
    const [goodsPrice, setGoodsPrice] = useState('');
    const [goodsCurrency, setGoodsCurrency] = useState('AFN');
    const [goodsNotes, setGoodsNotes] = useState('');
    const [goodsError, setGoodsError] = useState('');
    const [isSavingGoods, setIsSavingGoods] = useState(false);
    // Delete supplier modal
    const [supplierToDelete, setSupplierToDelete] = useState(null);
    // Status Filter: 'all' | 'creditors' | 'settled'
    const [statusFilter, setStatusFilter] = useState('all');
    // Expanded row IDs for inline transaction histories
    const [expandedSupplierIds, setExpandedSupplierIds] = useState({});
    const toggleExpand = (supplierId) => {
        setExpandedSupplierIds(prev => ({
            ...prev,
            [supplierId]: !prev[supplierId]
        }));
    };
    const handleOpenSettleModal = (s) => {
        setSettleModalSupplier(s);
        setPaymentCurrency((s.balanceOwed || 0) > 0 ? 'AFN' : 'USD');
        setPaymentAmount((s.balanceOwed || 0) > 0 ? s.balanceOwed : (s.balanceOwedUsd || 0));
        setPaymentNote('');
    };
    const handleSettleSubmit = (e) => {
        e.preventDefault();
        if (!settleModalSupplier)
            return;
        const amount = Number(paymentAmount);
        if (isNaN(amount) || amount <= 0)
            return;
        settleSupplierPayment(settleModalSupplier.id, amount, paymentNote, paymentCurrency);
        setSettleModalSupplier(null);
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
        setGoodsError('');
    };
    const goodsProduct = db.processedStock.find(product => product.id === goodsProductId);
    const goodsQuantityNumber = Number(goodsQuantity) || 0;
    const goodsPriceNumber = Number(goodsPrice) || 0;
    const goodsWeightKg = goodsUnit === 'ton' ? goodsQuantityNumber * 1000 : goodsUnit === 'bag' ? goodsQuantityNumber * 50 : goodsQuantityNumber;
    const goodsTotal = goodsQuantityNumber * goodsPriceNumber;
    const supplierDebtForGoods = goodsSupplier ? Number(goodsCurrency === 'USD' ? goodsSupplier.balanceOwedUsd : goodsSupplier.balanceOwed) || 0 : 0;
    const goodsDebtOffset = Math.min(goodsTotal, supplierDebtForGoods);
    const goodsCustomerDebt = Math.max(0, goodsTotal - goodsDebtOffset);
    const handleGoodsSettlement = async event => {
        event.preventDefault();
        setGoodsError('');
        setIsSavingGoods(true);
        const result = await settleSupplierWithProcessedStock({
            supplierId: goodsSupplier.id,
            productId: goodsProductId,
            unitType: goodsUnit,
            unitQuantity: goodsQuantityNumber,
            salePricePerUnit: goodsPriceNumber,
            currency: goodsCurrency,
            notes: goodsNotes,
        });
        setIsSavingGoods(false);
        if (!result.success) { setGoodsError(result.error); return; }
        setGoodsSupplier(null);
    };
    // Aggregated totals
    const totalPurchasesAll = { AFN: db.suppliers.reduce((a,s)=>a+(s.totalPurchasedAmount||0),0), USD: db.suppliers.reduce((a,s)=>a+(s.totalPurchasedAmountUsd||0),0) };
    const totalPaidAll = { AFN: db.suppliers.reduce((a,s)=>a+(s.totalPaid||0),0), USD: db.suppliers.reduce((a,s)=>a+(s.totalPaidUsd||0),0) };
    const totalOwedAll = { AFN: db.suppliers.reduce((a,s)=>a+(s.balanceOwed||0),0), USD: db.suppliers.reduce((a,s)=>a+(s.balanceOwedUsd||0),0) };
    const creditorCount = db.suppliers.filter(s => (s.balanceOwed || 0) > 0 || (s.balanceOwedUsd || 0) > 0).length;
    const filteredSuppliers = db.suppliers.filter(s => {
        const matchesSearch = s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (s.phone && s.phone.includes(searchTerm)) ||
            (s.address && s.address.toLowerCase().includes(searchTerm.toLowerCase()));
        if (!matchesSearch)
            return false;
        if (statusFilter === 'creditors') {
            return (s.balanceOwed || 0) > 0 || (s.balanceOwedUsd || 0) > 0;
        }
        if (statusFilter === 'settled') {
            return (s.balanceOwed || 0) <= 0 && (s.balanceOwedUsd || 0) <= 0;
        }
        return true;
    });
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
            <span className="text-xs font-semibold text-slate-500">{t.totalPaid}</span>
            <div className="text-xl font-bold font-mono text-emerald-700 mt-1">
              {totalPaidAll.AFN.toLocaleString()} AFN · {totalPaidAll.USD.toLocaleString()} USD
            </div>
            <span className="text-xs text-emerald-600">{t.paidToSuppliers}</span>
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
          <div className="flex items-center gap-1 bg-white border border-slate-200 p-1 rounded-xl text-xs">
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
        <div className="overflow-x-auto">
          <table className="w-full text-start text-xs sm:text-sm min-w-[850px]">
            <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 font-semibold text-[11px] uppercase">
              <tr>
                <th className="py-3.5 px-4 text-start">{t.supplierAndCompany}</th>
                <th className="py-3.5 px-4 text-start">{t.contactAndAddress}</th>
                <th className="py-3.5 px-4 text-start">{t.totalPurchasesFromSupplier}</th>
                <th className="py-3.5 px-4 text-start">{t.paidAmountLabel}</th>
                <th className="py-3.5 px-4 text-start">{t.remainingOwedToSupplier}</th>
                <th className="py-3.5 px-4 text-center">{t.transactionHistory}</th>
                <th className="py-3.5 px-4 text-center">{t.financialActions}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredSuppliers.map((sup) => {
            const hasDebt = sup.balanceOwed > 0 || (sup.balanceOwedUsd || 0) > 0;
            const isExpanded = !!expandedSupplierIds[sup.id];
            const transactionsCount = sup.transactions?.length || 0;
            return (<React.Fragment key={sup.id}>
                    <tr className={`transition-colors ${hasDebt ? 'bg-rose-50/20 hover:bg-rose-50/40' : 'hover:bg-slate-50/80'}`}>
                      {/* Name & Identity */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2">
                          <button type="button" onClick={() => toggleExpand(sup.id)} className="p-1 rounded-md text-slate-400 hover:text-amber-600 hover:bg-amber-50 transition-colors cursor-pointer" title={t.toggleHistoryTooltip}>
                            {isExpanded ? <ChevronUp className="w-4 h-4 text-amber-600"/> : <ChevronDown className="w-4 h-4"/>}
                          </button>
                          <div>
                            <div className="font-bold text-slate-900 text-sm flex items-center gap-2">
                              <span>{sup.name}</span>
                              {hasDebt ? (<span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-700 border border-rose-200">
                                  {t.supplierCreditBadge}
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
                      <td className="py-3.5 px-4">
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
                      <td className="py-3.5 px-4 font-mono font-bold text-slate-900">
                        {sup.totalPurchasedAmount.toLocaleString()} AFN · {(sup.totalPurchasedAmountUsd || 0).toLocaleString()} USD
                      </td>

                      {/* Total Paid to Supplier */}
                      <td className="py-3.5 px-4 font-mono font-bold text-emerald-700">
                        {sup.totalPaid.toLocaleString()} AFN · {(sup.totalPaidUsd || 0).toLocaleString()} USD
                        {((sup.goodsSettledAmount || 0) > 0 || (sup.goodsSettledAmountUsd || 0) > 0) && <span className="block text-[10px] font-medium text-emerald-600 mt-0.5">{t.nonCashGoodsSettled}: {(sup.goodsSettledAmount || 0).toLocaleString()} AFN · {(sup.goodsSettledAmountUsd || 0).toLocaleString()} USD</span>}
                      </td>

                      {/* Remaining Debt / Balance Owed */}
                      <td className="py-3.5 px-4">
                        {hasDebt ? (<div className="inline-flex flex-col">
                            <span className="font-mono font-bold text-rose-700 text-sm">
                              {sup.balanceOwed.toLocaleString()} AFN · {(sup.balanceOwedUsd || 0).toLocaleString()} USD
                            </span>
                            <span className="text-[10px] text-rose-600 font-medium">{t.ourRemainingDebt}</span>
                          </div>) : (<span className="font-mono text-slate-500 text-xs">
                            0 AFN · 0 USD
                          </span>)}
                      </td>

                      {/* Transaction Histories Toggle / Count */}
                      <td className="py-3.5 px-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
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
                      <td className="py-3.5 px-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button type="button" onClick={() => openGoodsSettlement(sup)} className="p-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 transition-colors cursor-pointer" title={t.settleWithProcessedGoods}><Package className="w-4 h-4"/></button>
                          {hasDebt && (<button type="button" onClick={() => handleOpenSettleModal(sup)} className="px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold transition-all shadow-xs cursor-pointer active:scale-95">
                              {t.settlePayment}
                            </button>)}

                          <button type="button" onClick={() => openSupplierEdit(sup)} className="p-2 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-700 transition-colors cursor-pointer" title={t.editSupplier}><Pencil className="w-4 h-4"/></button>

                          <button type="button" onClick={() => setSelectedHistorySupplier(sup)} className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-900 transition-colors cursor-pointer" title={t.printOfficialStatement}>
                            <Printer className="w-4 h-4"/>
                          </button>

                          <button type="button" onClick={() => setSupplierToDelete(sup.id)} className="p-2 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer" title={t.delete}>
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
                                <History className="w-4 h-4 text-amber-600"/>
                                <span className="font-bold text-xs text-slate-800">
                                  {t.detailedTransactionRecordFor} {sup.name}
                                </span>
                              </div>
                              <button type="button" onClick={() => setSelectedHistorySupplier(sup)} className="text-xs font-semibold text-amber-600 hover:text-amber-800 flex items-center gap-1 cursor-pointer">
                                <Printer className="w-3.5 h-3.5"/>
                                <span>{t.printFullStatement}</span>
                              </button>
                            </div>

                            {sup.transactions && sup.transactions.length > 0 ? (<div className="overflow-x-auto">
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
                                    {sup.transactions.map((tr) => (<tr key={tr.id} className="hover:bg-slate-50/50">
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

              {filteredSuppliers.length === 0 && (<tr>
                  <td colSpan={7} className="py-12 text-center text-slate-500">
                    <Truck className="w-10 h-10 text-slate-300 mx-auto mb-2"/>
                    <p className="text-sm font-medium">{t.noSupplierFound}</p>
                  </td>
                </tr>)}
            </tbody>
          </table>
        </div>
      </div>

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
        <div className="w-full max-w-2xl max-h-[92vh] overflow-y-auto bg-white rounded-2xl shadow-2xl border border-slate-200 p-6 text-slate-900">
          <div className="flex items-start justify-between gap-3 mb-5"><div><h3 className="font-bold flex items-center gap-2"><Package className="w-5 h-5 text-emerald-600"/>{t.settleWithProcessedGoods}</h3><p className="text-xs text-slate-500 mt-1">{goodsSupplier.name} · {t.remainingDebt}: {(goodsSupplier.balanceOwed || 0).toLocaleString()} AFN · {(goodsSupplier.balanceOwedUsd || 0).toLocaleString()} USD</p></div><button type="button" onClick={()=>setGoodsSupplier(null)} aria-label={t.cancel} className="text-slate-400 hover:text-slate-700"><X className="w-5 h-5"/></button></div>
          <p className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl p-3 mb-4">{t.goodsSettlementNotice}</p>
          <form onSubmit={handleGoodsSettlement} className="space-y-4">
            <div><EditField label={t.productName}><select required value={goodsProductId} onChange={event=>setGoodsProductId(event.target.value)} className={controlClass}><option value="">{t.selectProduct}</option>{db.processedStock.map(product=><option key={product.id} value={product.id}>{getLocalizedName(product.name)} — {product.stockKg.toLocaleString()} {t.kilo}</option>)}</select></EditField></div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <EditField label={t.saleUnit}><select value={goodsUnit} onChange={event=>setGoodsUnit(event.target.value)} className={controlClass}><option value="bag">{t.unitBag50kg}</option><option value="kg">{t.unitKg}</option><option value="ton">{t.unitTon1000kg}</option></select></EditField>
              <EditField label={t.quantity}><input required type="number" min="0.001" step="any" value={goodsQuantity} onChange={event=>setGoodsQuantity(event.target.value)} className={controlClass}/></EditField>
              <EditField label={`${t.salePrice} (${goodsCurrency})`}><input required type="number" min="0.001" step="any" value={goodsPrice} onChange={event=>setGoodsPrice(event.target.value)} className={controlClass}/></EditField>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <EditField label={t.currency}><select value={goodsCurrency} onChange={event=>setGoodsCurrency(event.target.value)} className={controlClass}><option value="AFN">AFN</option><option value="USD">USD</option></select></EditField>
              <EditField label={t.goodsNotes}><input value={goodsNotes} onChange={event=>setGoodsNotes(event.target.value)} className={controlClass}/></EditField>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div><span className="text-slate-500 block">{t.stockToDeduct}</span><strong className="font-mono text-slate-900">{goodsWeightKg.toLocaleString()} {t.kilo}</strong>{goodsProduct&&<span className="block text-[10px] text-slate-500">{t.currentStockLabel}: {goodsProduct.stockKg.toLocaleString()} {t.kilo}</span>}</div>
              <div><span className="text-slate-500 block">{t.totalAmount}</span><strong className="font-mono text-slate-900">{goodsTotal.toLocaleString()} {goodsCurrency}</strong></div>
              <div><span className="text-slate-500 block">{t.supplierDebtReduction}</span><strong className="font-mono text-emerald-700">{goodsDebtOffset.toLocaleString()} {goodsCurrency}</strong></div>
              <div><span className="text-slate-500 block">{t.customerDebtCreated}</span><strong className="font-mono text-rose-700">{goodsCustomerDebt.toLocaleString()} {goodsCurrency}</strong></div>
            </div>
            {goodsError&&<p className="text-xs font-semibold text-rose-700">{goodsError}</p>}
            <div className="flex justify-end gap-3 border-t pt-4"><button type="button" onClick={()=>setGoodsSupplier(null)} className="px-4 py-2 rounded-xl bg-slate-100 text-xs font-bold">{t.cancel}</button><button type="submit" disabled={isSavingGoods||!db.processedStock.length} className="px-5 py-2 rounded-xl bg-emerald-600 disabled:opacity-50 text-white text-xs font-bold">{isSavingGoods?t.goodsSaving:t.confirmGoodsSettlement}</button></div>
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
                  <select value={paymentCurrency} onChange={(e) => { setPaymentCurrency(e.target.value); setPaymentAmount(e.target.value === 'USD' ? (settleModalSupplier.balanceOwedUsd || 0) : (settleModalSupplier.balanceOwed || 0)); }} className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-sm font-bold mb-2"><option value="AFN">AFN</option><option value="USD">USD</option></select>
                  <input type="number" required min="0.01" step="any" max={paymentCurrency === 'USD' ? (settleModalSupplier.balanceOwedUsd || 0) : settleModalSupplier.balanceOwed} value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-sm font-mono font-bold text-slate-900 focus:outline-none focus:border-amber-600 shadow-2xs"/>
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
                <button type="button" onClick={() => setSettleModalSupplier(null)} className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold cursor-pointer">
                  {t.cancel}
                </button>
                <button type="submit" className="px-5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-md shadow-amber-600/25 cursor-pointer">
                  {t.save}
                </button>
              </div>
            </form>
          </div>
        </div>)}

      {/* Supplier Transaction History / Statement Modal */}
      {selectedHistorySupplier && (<div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-white w-full max-w-xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden text-slate-900">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-amber-100 text-amber-700">
                  <History className="w-5 h-5"/>
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    {t.accountStatementAndHistory} ({selectedHistorySupplier.name})
                  </h3>
                  <span className="text-[11px] text-slate-500 font-mono">
                    {t.phone}: {selectedHistorySupplier.phone || '-'} • {t.remainingDebt}: {selectedHistorySupplier.balanceOwed.toLocaleString()} AFN · {(selectedHistorySupplier.balanceOwedUsd || 0).toLocaleString()} USD
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <ReceiptActions elementId="supplier-receipt" filename={`supplier-statement-${selectedHistorySupplier.id}`} title={`${t.accountStatementAndHistory} - ${selectedHistorySupplier.name}`} printLabel={t.printInvoice} downloadLabel="PDF"/>
                <button type="button" onClick={() => setSelectedHistorySupplier(null)} className="text-slate-400 hover:text-slate-900 cursor-pointer">
                  <X className="w-5 h-5"/>
                </button>
              </div>
            </div>

            <div id="supplier-receipt" className="receipt-document bg-white p-5">
              <div className="text-center pb-4 border-b-2 border-slate-900">
                <h1 className="text-xl font-black text-slate-900">{t.companyName}</h1>
                <p className="text-xs text-slate-500 mt-1">{t.companySubtitle} · {t.accountStatementAndHistory}</p>
              </div>
              <div className="grid grid-cols-2 gap-3 my-4 p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs">
                <div><span className="text-slate-500 block">{t.supplier}</span><strong>{selectedHistorySupplier.name}</strong></div>
                <div><span className="text-slate-500 block">{t.phone}</span><strong dir="ltr">{selectedHistorySupplier.phone || '-'}</strong></div>
                <div><span className="text-slate-500 block">{t.totalPurchasedAmount}</span><strong className="font-mono">{selectedHistorySupplier.totalPurchasedAmount.toLocaleString()} AFN · {(selectedHistorySupplier.totalPurchasedAmountUsd || 0).toLocaleString()} USD</strong></div>
                <div><span className="text-slate-500 block">{t.totalPaid}</span><strong className="font-mono text-emerald-700">{selectedHistorySupplier.totalPaid.toLocaleString()} AFN · {(selectedHistorySupplier.totalPaidUsd || 0).toLocaleString()} USD</strong></div>
                <div><span className="text-slate-500 block">{t.remainingDebt}</span><strong className="font-mono text-rose-700">{selectedHistorySupplier.balanceOwed.toLocaleString()} AFN · {(selectedHistorySupplier.balanceOwedUsd || 0).toLocaleString()} USD</strong></div>
              </div>
            <div className="space-y-2.5">
              {selectedHistorySupplier.transactions && selectedHistorySupplier.transactions.length > 0 ? (selectedHistorySupplier.transactions.map((h) => (<div key={h.id} className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex justify-between items-center text-xs shadow-2xs">
                    <div>
                      <div className="font-mono text-slate-500">{h.date}</div>
                      <div className="text-slate-800 mt-0.5 font-medium">{getLocalizedTxDesc(h.description)}</div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        {t.transactionType}: {getLocalizedTxType(h.type)}
                      </div>
                    </div>
                    <div className="text-end">
                      <div className="font-bold font-mono text-emerald-700 text-sm">
                        {t.paidAmountLabel}: {h.paidAmount.toLocaleString()} {h.currency || 'AFN'}
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
    const remaining = Math.max(0, (Number(total)||0) - (Number(paid)||0) - (Number(settled)||0));
    return <div className="rounded-xl border border-slate-200 bg-slate-50 p-4"><h5 className="font-bold text-sm text-slate-800 mb-3">{currency}</h5><div className="space-y-3"><EditField label={t.totalAmount}><input type="number" min="0" step="any" required value={total} onChange={e=>onTotal(e.target.value)} className={controlClass}/></EditField><EditField label={t.amountPaidLabel}><input type="number" min="0" step="any" required value={paid} onChange={e=>onPaid(e.target.value)} className={controlClass}/></EditField><div className="text-[10px] text-emerald-700">{t.nonCashGoodsSettled}: <strong className="font-mono">{Number(settled).toLocaleString()} {currency}</strong></div><div className="rounded-lg bg-white border border-slate-200 px-3 py-2"><span className="block text-[10px] text-slate-500">{t.remainingAutoCalculated}</span><strong className="font-mono text-rose-700">{remaining.toLocaleString()} {currency}</strong></div></div></div>;
};
