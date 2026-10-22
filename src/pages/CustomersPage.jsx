import React, { useRef, useState } from 'react';
import { useDatabase } from '../context/DatabaseContext';
import { AccountStatement } from '../components/AccountStatement';
import { ReceiptActions } from '../components/ReceiptActions';
import { TransactionHistoryEditor, TransactionVoidDialog } from '../components/TransactionHistoryEditor';
import { normalizeDecimalInput } from '../lib/numberInput';
import { isCanonicalSupplierName } from '../lib/partyRoles';
import { getTransactionActivityTime, sortTransactionsNewestFirst } from '../lib/transactionSort';
import { getTransactionEntryDetails } from '../lib/transactionDetails';
import { getSaleLineItems, saleUnitLabel } from '../lib/saleLineItems';
import { Users, Search, Phone, MapPin, Trash2, X, Printer, History, Wallet, DollarSign, Receipt, ArrowDownLeft, ChevronDown, ChevronUp, CheckCircle, Wheat, Pencil, HandCoins, Truck } from 'lucide-react';
const unitMultiplierKg = unit => unit === 'ton' ? 1000 : unit === 'bag' ? 50 : 1;
const localDateValue = () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};
const latestSaleTime = customer => (customer.transactions || []).reduce((latest, transaction) => transaction.type === 'sale' && (transaction.status || 'active') === 'active' ? Math.max(latest, getTransactionActivityTime(transaction)) : latest, 0);
export const CustomersPage = () => {
    const { db, t, lang, deleteCustomer, updateCustomer, updateCustomerTransaction, voidCustomerTransaction, receiveCustomerPayment, addCustomerAccountEntry, settleCustomerWithRawMaterial, getLocalizedTxType, getLocalizedTxDesc } = useDatabase();
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedHistoryCustomer, setSelectedHistoryCustomer] = useState(null);
    const [statementMode, setStatementMode] = useState('current');
    const [receiveModalCustomer, setReceiveModalCustomer] = useState(null);
    const [receivedAmount, setReceivedAmount] = useState('');
    const [paymentCurrency, setPaymentCurrency] = useState('AFN');
    const [paymentNote, setPaymentNote] = useState('');
    const [paymentStatus, setPaymentStatus] = useState(null);
    const [isSavingPayment, setIsSavingPayment] = useState(false);
    const paymentSaveLock = useRef(false);
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
    const rawSettlementSaveLock = useRef(false);
    const [editingCustomer, setEditingCustomer] = useState(null);
    const [customerEdit, setCustomerEdit] = useState(null);
    const [customerEditError, setCustomerEditError] = useState('');
    const [editingHistoryEntry, setEditingHistoryEntry] = useState(null);
    const [deletingHistoryEntry, setDeletingHistoryEntry] = useState(null);
    const [accountEntryCustomer, setAccountEntryCustomer] = useState(null);
    const [accountEntryType, setAccountEntryType] = useState('cash_given');
    const [accountEntryCurrency, setAccountEntryCurrency] = useState('AFN');
    const [accountEntryAmount, setAccountEntryAmount] = useState('');
    const [accountEntryDate, setAccountEntryDate] = useState(localDateValue());
    const [accountEntryNote, setAccountEntryNote] = useState('');
    const [accountEntryError, setAccountEntryError] = useState('');
    const [isSavingAccountEntry, setIsSavingAccountEntry] = useState(false);
    const accountEntrySaveLock = useRef(false);
    // Delete customer modal
    const [customerToDelete, setCustomerToDelete] = useState(null);
    // Status Filter: 'all' | 'debtors' | 'settled'
    const [statusFilter, setStatusFilter] = useState('all');
    // Expanded row IDs for inline transaction histories
    const [expandedCustomerIds, setExpandedCustomerIds] = useState({});
    // Never show a confirmed supplier as a customer while a server-side role
    // cleanup is pending or an older browser still has stale data.
    const customers = db.customers.filter(customer => !isCanonicalSupplierName(customer.name));
    const customerTransactionDescription = transaction => ['sale', 'raw_goods_settlement'].includes(transaction.type)
        ? ''
        : getLocalizedTxDesc(transaction.description);
    const customerTransactionDetails = (transaction, customer) =>
        getTransactionEntryDetails(transaction, customer, 'customer', db.sales, t);
    const renderCustomerTransactionText = (transaction, customer) => {
        const description = customerTransactionDescription(transaction);
        const details = customerTransactionDetails(transaction, customer);
        return <>
          {(!details || details !== description) && description}
          {details && <div className="mt-1 rounded-md bg-slate-50 px-2 py-1 text-[10px] leading-4 text-slate-600"><span className="font-bold text-slate-700">{t.historyDescription}: </span>{details}</div>}
        </>;
    };
    const renderSaleItems = transaction => {
        if (transaction.type !== 'sale') return transaction.itemName && <div className="font-bold text-slate-900">{transaction.itemName}</div>;
        const relatedSale = db.sales.find(sale => sale.id === transaction.sourceSaleId);
        const items = getSaleLineItems(transaction.lineItems?.length ? transaction : relatedSale || transaction);
        const transactionBillNumber = transaction.billNumber || relatedSale?.billNumber;
        return <div className="space-y-1.5">
          {items.map((item, index) => <div key={`${transaction.id}-item-${index}`} className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5">
            <strong className="block text-slate-900">{item.productName}</strong>
            <span className="block font-mono text-[10px] text-slate-600">{item.unitQuantity.toLocaleString()} {saleUnitLabel(item.unitType, t)} × {item.salePricePerUnit.toLocaleString()} {transaction.currency || 'AFN'} = {item.totalAmount.toLocaleString()} {transaction.currency || 'AFN'}</span>
          </div>)}
          {transactionBillNumber && <span className="block font-mono text-[10px] text-blue-700">{t.invoiceNumber}: #{transactionBillNumber}</span>}
        </div>;
    };
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
            accountCharges: customer.accountCharges || 0,
            totalPurchasedAmountUsd: customer.totalPurchasedAmountUsd || 0,
            totalPaidUsd: customer.totalPaidUsd || 0,
            rawSettledAmountUsd: customer.rawSettledAmountUsd || 0,
            accountChargesUsd: customer.accountChargesUsd || 0,
        });
        setCustomerEditError('');
    };
    const openAccountEntry = customer => {
        setAccountEntryCustomer(customer);
        setAccountEntryType('cash_given');
        setAccountEntryCurrency((customer.balanceOwed || customer.creditBalance) ? 'AFN' : 'USD');
        setAccountEntryAmount('');
        setAccountEntryDate(localDateValue());
        setAccountEntryNote('');
        setAccountEntryError('');
    };
    const accountEntryNumber = Number(accountEntryAmount) || 0;
    const currentAccountNet = accountEntryCustomer
        ? (Number(accountEntryCurrency === 'USD' ? accountEntryCustomer.balanceOwedUsd : accountEntryCustomer.balanceOwed) || 0)
          - (Number(accountEntryCurrency === 'USD' ? accountEntryCustomer.creditBalanceUsd : accountEntryCustomer.creditBalance) || 0)
        : 0;
    const accountNetAfterEntry = currentAccountNet + accountEntryNumber;
    const accountDebtAfterEntry = Math.max(0, accountNetAfterEntry);
    const accountCreditAfterEntry = Math.max(0, -accountNetAfterEntry);
    const cashAfterAccountEntry = (Number(accountEntryCurrency === 'USD' ? db.cashInHandUsd : db.cashInHand) || 0) - accountEntryNumber;
    const handleAccountEntrySubmit = async event => {
        event.preventDefault();
        if (!accountEntryCustomer || accountEntrySaveLock.current) return;
        if (accountEntryNumber <= 0) return setAccountEntryError(t.accountEntryAmountRequired);
        accountEntrySaveLock.current = true;
        setIsSavingAccountEntry(true);
        setAccountEntryError('');
        try {
            const result = await addCustomerAccountEntry({
                customerId: accountEntryCustomer.id,
                type: accountEntryType,
                amount: accountEntryNumber,
                currency: accountEntryCurrency,
                date: accountEntryDate,
                note: accountEntryNote || (accountEntryType === 'cash_given' ? t.cashGivenToCustomer : t.transportFeeEntry),
            });
            if (!result.success) return setAccountEntryError(result.error || t.accountEntrySaveFailed);
            setAccountEntryCustomer(null);
        }
        finally {
            accountEntrySaveLock.current = false;
            setIsSavingAccountEntry(false);
        }
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
        if (!receiveModalCustomer || paymentSaveLock.current)
            return;
        const amount = Number(receivedAmount);
        if (isNaN(amount) || amount <= 0) {
            setPaymentStatus({ type: 'error', text: 'Payment must be greater than zero.' });
            return;
        }
        paymentSaveLock.current = true;
        setIsSavingPayment(true);
        setPaymentStatus(null);
        try {
            const result = await receiveCustomerPayment(receiveModalCustomer.id, amount, paymentNote, paymentCurrency);
            if (result.success) {
                setReceiveModalCustomer(null);
                return;
            }
            setPaymentStatus({ type: 'error', text: result.error || 'Customer payment was not saved.' });
        }
        finally {
            paymentSaveLock.current = false;
            setIsSavingPayment(false);
        }
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
    const paymentAmountNumber = Number(receivedAmount) || 0;
    const paymentDebt = receiveModalCustomer
        ? Number(paymentCurrency === 'USD' ? receiveModalCustomer.balanceOwedUsd : receiveModalCustomer.balanceOwed) || 0
        : 0;
    const existingCustomerCredit = receiveModalCustomer
        ? Number(paymentCurrency === 'USD' ? receiveModalCustomer.creditBalanceUsd : receiveModalCustomer.creditBalance) || 0
        : 0;
    const paymentAppliedToDebt = Math.min(paymentAmountNumber, paymentDebt);
    const customerCreditAfterPayment = existingCustomerCredit + Math.max(0, paymentAmountNumber - paymentDebt);
    const handleRawSettlement = async event => {
        event.preventDefault();
        if (!rawSettlementCustomer || rawSettlementSaveLock.current) return;
        rawSettlementSaveLock.current = true;
        setRawSettlementError('');
        setIsSavingRawSettlement(true);
        try {
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
            if (!result.success) { setRawSettlementError(result.error); return; }
            setRawSettlementCustomer(null);
        }
        finally {
            rawSettlementSaveLock.current = false;
            setIsSavingRawSettlement(false);
        }
    };
    // Aggregated totals
    const totalSalesAll = { AFN: customers.reduce((a,c)=>a+(c.totalPurchasedAmount||0),0), USD: customers.reduce((a,c)=>a+(c.totalPurchasedAmountUsd||0),0) };
    const totalCashReceivedAll = { AFN: customers.reduce((a,c)=>a+(c.totalPaid||0),0), USD: customers.reduce((a,c)=>a+(c.totalPaidUsd||0),0) };
    const totalRawSettledAll = { AFN: customers.reduce((a,c)=>a+(c.rawSettledAmount||0),0), USD: customers.reduce((a,c)=>a+(c.rawSettledAmountUsd||0),0) };
    const totalAccountChargesAll = { AFN: customers.reduce((a,c)=>a+(c.accountCharges||0),0), USD: customers.reduce((a,c)=>a+(c.accountChargesUsd||0),0) };
    const totalSettledAll = { AFN: totalCashReceivedAll.AFN + totalRawSettledAll.AFN, USD: totalCashReceivedAll.USD + totalRawSettledAll.USD };
    const totalReceivableDebtAll = { AFN: customers.reduce((a,c)=>a+(c.balanceOwed||0),0), USD: customers.reduce((a,c)=>a+(c.balanceOwedUsd||0),0) };
    const totalCustomerCreditAll = { AFN: customers.reduce((a,c)=>a+(c.creditBalance||0),0), USD: customers.reduce((a,c)=>a+(c.creditBalanceUsd||0),0) };
    const debtorCount = customers.filter(c => (c.balanceOwed || 0) > 0 || (c.balanceOwedUsd || 0) > 0).length;
    const customerCreditCount = customers.filter(c => (c.creditBalance || 0) > 0 || (c.creditBalanceUsd || 0) > 0).length;
    const settledCustomerCount = customers.filter(c => (c.balanceOwed || 0) <= 0 && (c.balanceOwedUsd || 0) <= 0 && (c.creditBalance || 0) <= 0 && (c.creditBalanceUsd || 0) <= 0).length;
    const normalizedSearch = searchTerm.trim().toLowerCase();
    const filteredCustomers = customers.filter(c => {
        const hasMatchingBill = normalizedSearch && (
            (c.transactions || []).some(transaction => String(transaction.billNumber || '').toLowerCase().includes(normalizedSearch))
            || db.sales.some(sale => String(sale.billNumber || '').toLowerCase().includes(normalizedSearch)
                && (sale.customerId === c.id || (!sale.customerId && sale.customerName?.trim().toLowerCase() === c.name.trim().toLowerCase())))
        );
        const matchesSearch = !normalizedSearch || c.name.toLowerCase().includes(normalizedSearch) ||
            (c.phone && c.phone.includes(normalizedSearch)) ||
            (c.address && c.address.toLowerCase().includes(normalizedSearch)) || hasMatchingBill;
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
          <input type="text" placeholder={t.searchByNamePhoneBill || t.search} value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full ps-10 pe-4 py-2.5 text-xs sm:text-sm bg-slate-50 border border-slate-300 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:border-amber-600 shadow-2xs"/>
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
            <span className="block text-[10px] text-blue-700">{t.customerAccountCharges}: {totalAccountChargesAll.AFN.toLocaleString()} AFN · {totalAccountChargesAll.USD.toLocaleString()} USD</span>
            <span className="text-xs text-slate-500">{customers.length} {t.navCustomers}</span>
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
          <div className="flex w-full flex-wrap items-center gap-1 rounded-xl border border-slate-200 bg-white p-1 text-xs sm:w-auto">
            <button type="button" onClick={() => setStatusFilter('all')} className={`px-3 py-1 rounded-lg font-semibold transition-all cursor-pointer ${statusFilter === 'all'
            ? 'bg-blue-600 text-white shadow-xs'
            : 'text-slate-600 hover:text-slate-900'}`}>
              {t.allUnits} ({customers.length})
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
        <div className="min-w-0 2xl:overflow-x-auto">
          <table className="block w-full min-w-0 text-start text-xs sm:text-sm 2xl:table 2xl:min-w-[1120px]">
            <thead className="hidden bg-slate-50 text-slate-600 border-b border-slate-200 font-semibold text-[11px] uppercase 2xl:table-header-group">
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
            <tbody className="grid gap-3 p-3 2xl:table-row-group 2xl:divide-y 2xl:divide-slate-100 2xl:p-0">
              {filteredCustomers.map((cust) => {
            const hasDebt = cust.balanceOwed > 0 || (cust.balanceOwedUsd || 0) > 0;
            const hasCredit = (cust.creditBalance || 0) > 0 || (cust.creditBalanceUsd || 0) > 0;
            const isExpanded = !!expandedCustomerIds[cust.id];
            const transactionsCount = cust.transactions?.length || 0;
            return (<React.Fragment key={cust.id}>
                    <tr className={`grid min-w-0 grid-cols-1 overflow-hidden rounded-xl border border-slate-200 transition-colors sm:grid-cols-2 lg:grid-cols-3 2xl:table-row 2xl:rounded-none 2xl:border-0 ${hasDebt ? 'bg-rose-50/20 hover:bg-rose-50/40' : hasCredit ? 'bg-amber-50/30 hover:bg-amber-50/50' : 'bg-white hover:bg-slate-50/80'}`}>
                      {/* Name & Identity */}
                      <td className="min-w-0 px-3 py-3 2xl:px-4 2xl:py-3.5">
                        <span className="mb-1 block text-[10px] font-semibold text-slate-500 2xl:hidden">{t.nameAndFarm}</span>
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
                      <td className="min-w-0 px-3 py-3 2xl:px-4 2xl:py-3.5">
                        <span className="mb-1 block text-[10px] font-semibold text-slate-500 2xl:hidden">{t.contactAndAddress}</span>
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
                      <td className="min-w-0 break-words px-3 py-3 font-mono font-bold text-slate-900 2xl:px-4 2xl:py-3.5">
                        <span className="mb-1 block font-sans text-[10px] font-semibold text-slate-500 2xl:hidden">{t.totalCustomerPurchases}</span>
                        {cust.totalPurchasedAmount.toLocaleString()} AFN · {(cust.totalPurchasedAmountUsd || 0).toLocaleString()} USD
                        <span className="mt-0.5 block text-[10px] font-medium text-blue-700">{t.customerAccountCharges}: {(cust.accountCharges || 0).toLocaleString()} AFN · {(cust.accountChargesUsd || 0).toLocaleString()} USD</span>
                      </td>

                      {/* Total Payments */}
                      <td className="min-w-0 break-words px-3 py-3 font-mono font-bold text-emerald-700 2xl:px-4 2xl:py-3.5">
                        <span className="mb-1 block font-sans text-[10px] font-semibold text-slate-500 2xl:hidden">{t.totalSettledByCustomer}</span>
                        {((cust.totalPaid || 0) + (cust.rawSettledAmount || 0)).toLocaleString()} AFN · {((cust.totalPaidUsd || 0) + (cust.rawSettledAmountUsd || 0)).toLocaleString()} USD
                        <span className="block text-[10px] font-medium text-emerald-700 mt-0.5">{t.cashReceivedFromCustomer}: {(cust.totalPaid || 0).toLocaleString()} AFN · {(cust.totalPaidUsd || 0).toLocaleString()} USD</span>
                        <span className="block text-[10px] font-medium text-emerald-600 mt-0.5">{t.nonCashRawSettled}: {(cust.rawSettledAmount || 0).toLocaleString()} AFN · {(cust.rawSettledAmountUsd || 0).toLocaleString()} USD</span>
                      </td>

                      {/* Remaining Debt */}
                      <td className="min-w-0 break-words px-3 py-3 2xl:px-4 2xl:py-3.5">
                        <span className="mb-1 block text-[10px] font-semibold text-slate-500 2xl:hidden">{t.customerAccountBalance}</span>
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
                      <td className="min-w-0 px-3 py-3 2xl:px-4 2xl:py-3.5 2xl:text-center">
                        <span className="mb-1 block text-[10px] font-semibold text-slate-500 2xl:hidden">{t.transactionHistory}</span>
                        <div className="flex flex-wrap items-center gap-1.5 2xl:justify-center">
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
                      <td className="min-w-0 px-3 py-3 sm:col-span-2 lg:col-span-3 2xl:table-cell 2xl:px-4 2xl:py-3.5 2xl:text-center">
                        <span className="mb-1 block text-[10px] font-semibold text-slate-500 2xl:hidden">{t.financialActions}</span>
                        <div className="flex flex-wrap items-center gap-1.5 2xl:justify-center">
                          <button type="button" onClick={() => openCustomerEdit(cust)} className="p-2 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 transition-colors cursor-pointer" title={t.editCustomer}><Pencil className="w-4 h-4"/></button>
                          <button type="button" onClick={() => openRawSettlement(cust)} className="p-2 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-700 transition-colors cursor-pointer" title={t.settleWithRawMaterial}><Wheat className="w-4 h-4"/></button>
                          <button type="button" onClick={() => openAccountEntry(cust)} className="inline-flex items-center gap-1 rounded-xl bg-violet-600 px-2.5 py-1.5 text-[10px] font-bold text-white shadow-xs transition-colors hover:bg-violet-700" title={t.addAccountEntry}><HandCoins className="h-3.5 w-3.5"/><span>{t.addAccountEntry}</span></button>
                          <button type="button" onClick={() => handleOpenReceiveModal(cust)} className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-all shadow-xs cursor-pointer active:scale-95">
                              {t.receivePayment}
                            </button>

                          <button type="button" onClick={() => { setStatementMode('current'); setSelectedHistoryCustomer(cust); }} className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-900 transition-colors cursor-pointer" title={t.printOfficialStatement}>
                            <Printer className="w-4 h-4"/>
                          </button>

                          <button type="button" onClick={() => setCustomerToDelete(cust.id)} className="p-2 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer" title={t.delete}>
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
                                <History className="w-4 h-4 text-blue-600"/>
                                <span className="min-w-0 break-words font-bold text-xs text-slate-800">
                                  {t.detailedTransactionRecordFor} {cust.name}
                                </span>
                              </div>
                              <button type="button" onClick={() => { setStatementMode('current'); setSelectedHistoryCustomer(cust); }} className="text-xs font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1 cursor-pointer">
                                <Printer className="w-3.5 h-3.5"/>
                                <span>{t.printFullStatement}</span>
                              </button>
                            </div>

                            {cust.transactions && cust.transactions.length > 0 ? (<>
                              <div className="grid gap-3 p-3 2xl:hidden">
                                {sortTransactionsNewestFirst(cust.transactions).map((tr) => (<article key={tr.id} className={`min-w-0 rounded-xl border border-slate-200 p-3 ${(tr.status || 'active') !== 'active' ? 'bg-slate-50 opacity-70' : 'bg-white'}`}>
                                  <div className="flex flex-wrap items-start justify-between gap-2">
                                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                                      <span className="font-mono text-xs text-slate-600">{tr.date}</span>
                                      {tr.type === 'sale' ? (<span className="inline-flex items-center gap-1 rounded bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700"><Receipt className="h-3 w-3"/>{getLocalizedTxType(tr.type)}</span>) : ['cash_given', 'transport_fee'].includes(tr.type) ? (<span className="inline-flex items-center gap-1 rounded bg-violet-50 px-2 py-0.5 text-[10px] font-bold text-violet-700"><HandCoins className="h-3 w-3"/>{getLocalizedTxType(tr.type)}</span>) : (<span className="inline-flex items-center gap-1 rounded bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700"><ArrowDownLeft className="h-3 w-3"/>{getLocalizedTxType(tr.type)}</span>)}
                                    </div>
                                    <div className="flex shrink-0 items-center gap-1 print:hidden">
                                      <button type="button" disabled={(tr.status || 'active') !== 'active'} onClick={() => setEditingHistoryEntry({ partyId: cust.id, partyName: cust.name, transaction: tr })} className="rounded-lg bg-blue-50 p-2 text-blue-700 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-40" title={t.editHistoryEntry} aria-label={t.editHistoryEntry}><Pencil className="h-4 w-4"/></button>
                                      <button type="button" disabled={(tr.status || 'active') !== 'active'} onClick={() => setDeletingHistoryEntry({ partyId: cust.id, partyName: cust.name, transaction: tr })} className="rounded-lg bg-rose-50 p-2 text-rose-700 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-40" title={t.voidHistoryEntry} aria-label={t.voidHistoryEntry}><Trash2 className="h-4 w-4"/></button>
                                    </div>
                                  </div>
                                  <div className="mt-3 min-w-0 break-words rounded-lg bg-slate-50 p-2 text-xs font-medium text-slate-700">
                                    <span className="mb-1 block text-[10px] font-semibold text-slate-500">{t.descOrGoods}</span>
                                    {renderSaleItems(tr)}
                                    {renderCustomerTransactionText(tr, cust)}
                                    {((tr.status || 'active') !== 'active' || tr.reversalOf) && <div className="mt-1"><span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-700">{tr.reversalOf ? t.replacementEntry : (tr.status === 'voided' ? t.voided : t.corrected)}</span>{tr.correctionReason && <span className="ms-2 text-[10px] text-slate-500">{tr.correctionReason}</span>}</div>}
                                  </div>
                                  <dl className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-3 lg:grid-cols-5">
                                    <div className="min-w-0 rounded-lg border border-slate-100 p-2"><dt className="text-[10px] text-slate-500">{t.quantity}</dt><dd className="mt-1 break-words font-mono text-slate-700">{tr.quantityKg != null ? `${Number(tr.quantityKg).toLocaleString()} kg` : '-'}</dd></div>
                                    <div className="min-w-0 rounded-lg border border-slate-100 p-2"><dt className="text-[10px] text-slate-500">{t.unitPriceKilo}</dt><dd className="mt-1 break-words font-mono text-slate-700">{tr.unitPrice != null ? `${Number(tr.unitPrice).toLocaleString()} ${tr.currency || 'AFN'}` : '-'}</dd></div>
                                    <div className="min-w-0 rounded-lg border border-slate-100 p-2"><dt className="text-[10px] text-slate-500">{t.invoiceAmount}</dt><dd className="mt-1 break-words font-mono font-bold text-slate-900">{tr.amount ? `${tr.amount.toLocaleString()} ${tr.currency || 'AFN'}` : '-'}</dd></div>
                                    <div className="min-w-0 rounded-lg border border-slate-100 p-2"><dt className="text-[10px] text-slate-500">{t.paymentOrDebtReduction}</dt><dd className="mt-1 break-words font-mono font-bold text-emerald-700">{['cash_given', 'transport_fee'].includes(tr.type) ? '-' : `${Number(tr.paidAmount || 0).toLocaleString()} ${tr.currency || 'AFN'}`}</dd></div>
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
                                    {sortTransactionsNewestFirst(cust.transactions).map((tr) => (<tr key={tr.id} className={`hover:bg-slate-50/50 ${(tr.status || 'active') !== 'active' ? 'bg-slate-50 opacity-70' : ''}`}>
                                        <td className="py-2.5 px-3 font-mono text-slate-600">{tr.date}</td>
                                        <td className="py-2.5 px-3">
                                          {tr.type === 'sale' ? (<span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded">
                                              <Receipt className="w-3 h-3"/>
                                              {getLocalizedTxType(tr.type)}
                                            </span>) : ['cash_given', 'transport_fee'].includes(tr.type) ? (<span className="inline-flex items-center gap-1 rounded bg-violet-50 px-2 py-0.5 text-[10px] font-bold text-violet-700"><HandCoins className="h-3 w-3"/>{getLocalizedTxType(tr.type)}</span>) : (<span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                                              <ArrowDownLeft className="w-3 h-3"/>
                                              {getLocalizedTxType(tr.type)}
                                            </span>)}
                                        </td>
                                        <td className="min-w-[280px] max-w-[380px] whitespace-normal break-words py-2.5 px-3 text-slate-700 font-medium">
                                          {renderSaleItems(tr)}
                                          {renderCustomerTransactionText(tr, cust)}
                                          {((tr.status || 'active') !== 'active' || tr.reversalOf) && <div className="mt-1"><span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-700">{tr.reversalOf ? t.replacementEntry : (tr.status === 'voided' ? t.voided : t.corrected)}</span>{tr.correctionReason && <span className="ms-2 text-[10px] text-slate-500">{tr.correctionReason}</span>}</div>}
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
                                          {['cash_given', 'transport_fee'].includes(tr.type) ? '-' : `${Number(tr.paidAmount || 0).toLocaleString()} ${tr.currency || 'AFN'}`}
                                        </td>
                                        <td className="py-2.5 px-3 font-mono font-bold text-rose-700">
                                          {Number(tr.accountBalanceAfter ?? tr.remainingAmount ?? 0).toLocaleString()} {tr.currency || 'AFN'}
                                        </td>
                                        <td className="py-2.5 px-3 print:hidden">
                                          <div className="flex items-center justify-center gap-1">
                                            <button type="button" disabled={(tr.status || 'active') !== 'active'} onClick={() => setEditingHistoryEntry({ partyId: cust.id, partyName: cust.name, transaction: tr })} className="rounded-lg bg-blue-50 p-1.5 text-blue-700 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-40" title={t.editHistoryEntry} aria-label={t.editHistoryEntry}><Pencil className="h-3.5 w-3.5"/></button>
                                            <button type="button" disabled={(tr.status || 'active') !== 'active'} onClick={() => setDeletingHistoryEntry({ partyId: cust.id, partyName: cust.name, transaction: tr })} className="rounded-lg bg-rose-50 p-1.5 text-rose-700 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-40" title={t.voidHistoryEntry} aria-label={t.voidHistoryEntry}><Trash2 className="h-3.5 w-3.5"/></button>
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

              {filteredCustomers.length === 0 && (<tr className="block 2xl:table-row">
                  <td colSpan={7} className="block py-12 text-center text-slate-500 2xl:table-cell">
                    <Users className="w-10 h-10 text-slate-300 mx-auto mb-2"/>
                    <p className="text-sm font-medium">{t.noCustomerFound}</p>
                  </td>
                </tr>)}
            </tbody>
          </table>
        </div>
      </div>

      {editingHistoryEntry && <TransactionHistoryEditor
        partyName={editingHistoryEntry.partyName}
        transaction={editingHistoryEntry.transaction}
        role="customer"
        rawStockOptions={db.rawMaterials}
        processedStockOptions={db.processedStock}
        t={t}
        getLocalizedTxType={getLocalizedTxType}
        onClose={() => setEditingHistoryEntry(null)}
        onSave={updates => updateCustomerTransaction(editingHistoryEntry.partyId, editingHistoryEntry.transaction.id, updates)}
      />}
      {deletingHistoryEntry && <TransactionVoidDialog
        partyName={deletingHistoryEntry.partyName}
        transaction={deletingHistoryEntry.transaction}
        t={t}
        onClose={() => setDeletingHistoryEntry(null)}
        onConfirm={reason => voidCustomerTransaction(deletingHistoryEntry.partyId, deletingHistoryEntry.transaction.id, reason)}
      />}

      {accountEntryCustomer && <div className="fixed inset-0 z-[65] flex items-start justify-center overflow-y-auto bg-slate-900/55 p-3 backdrop-blur-xs sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="customer-account-entry-title">
        <div className="my-2 max-h-[calc(100dvh-1.5rem)] w-full max-w-xl overflow-y-auto overscroll-contain rounded-2xl border border-slate-200 bg-white p-4 text-slate-900 shadow-2xl sm:p-6">
          <div className="mb-4 flex items-start justify-between gap-3 border-b border-slate-100 pb-4">
            <div><h3 id="customer-account-entry-title" className="flex items-center gap-2 font-bold"><HandCoins className="h-5 w-5 text-violet-600"/>{t.customerAccountEntry}</h3><p className="mt-1 text-xs text-slate-500">{accountEntryCustomer.name}</p></div>
            <button type="button" onClick={()=>setAccountEntryCustomer(null)} aria-label={t.cancel} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X className="h-5 w-5"/></button>
          </div>
          <p className="mb-4 rounded-xl border border-violet-200 bg-violet-50 p-3 text-xs leading-5 text-violet-900">{t.accountEntryHelp}</p>
          <form onSubmit={handleAccountEntrySubmit} className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <button type="button" onClick={()=>setAccountEntryType('cash_given')} className={`rounded-xl border p-3 text-start transition-colors ${accountEntryType==='cash_given'?'border-violet-500 bg-violet-50 text-violet-800':'border-slate-200 hover:bg-slate-50'}`}><HandCoins className="mb-2 h-5 w-5"/><strong className="block text-xs">{t.cashGivenToCustomer}</strong></button>
              <button type="button" onClick={()=>setAccountEntryType('transport_fee')} className={`rounded-xl border p-3 text-start transition-colors ${accountEntryType==='transport_fee'?'border-violet-500 bg-violet-50 text-violet-800':'border-slate-200 hover:bg-slate-50'}`}><Truck className="mb-2 h-5 w-5"/><strong className="block text-xs">{t.transportFeeEntry}</strong></button>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <CustomerEditField label={t.currency}><select value={accountEntryCurrency} onChange={event=>{setAccountEntryCurrency(event.target.value);setAccountEntryAmount('');}} className={customerEditControlClass}><option value="AFN">AFN</option><option value="USD">USD</option></select></CustomerEditField>
              <CustomerEditField label={t.accountEntryAmount}><input required type="text" inputMode="decimal" value={accountEntryAmount} onChange={event=>setAccountEntryAmount(normalizeDecimalInput(event.target.value))} className={`${customerEditControlClass} font-mono`}/></CustomerEditField>
              <CustomerEditField label={t.accountEntryDate}><input required type="date" value={accountEntryDate} onChange={event=>setAccountEntryDate(event.target.value)} className={customerEditControlClass}/></CustomerEditField>
            </div>
            <CustomerEditField label={t.accountEntryNote}><textarea rows="2" value={accountEntryNote} onChange={event=>setAccountEntryNote(event.target.value)} className={`${customerEditControlClass} resize-y`}/></CustomerEditField>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <strong className="mb-2 block text-xs text-slate-700">{t.accountEntryPreview}</strong>
              <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-3">
                <div className="rounded-lg bg-white p-2"><span className="block text-slate-500">{t.remainingDebt}</span><b className="font-mono text-rose-700">{accountDebtAfterEntry.toLocaleString()} {accountEntryCurrency}</b></div>
                <div className="rounded-lg bg-white p-2"><span className="block text-slate-500">{t.weOweThem}</span><b className="font-mono text-amber-700">{accountCreditAfterEntry.toLocaleString()} {accountEntryCurrency}</b></div>
                <div className="rounded-lg bg-white p-2"><span className="block text-slate-500">{t.cashInHandReduction}</span><b className="font-mono text-violet-700">{accountEntryNumber.toLocaleString()} {accountEntryCurrency}</b><span className="block text-[10px] text-slate-500">→ {cashAfterAccountEntry.toLocaleString()} {accountEntryCurrency}</span></div>
              </div>
            </div>
            {accountEntryError&&<p className="text-xs font-semibold text-rose-700" role="alert">{accountEntryError}</p>}
            <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:justify-end"><button type="button" onClick={()=>setAccountEntryCustomer(null)} className="rounded-xl bg-slate-100 px-4 py-2.5 text-xs font-bold text-slate-700">{t.cancel}</button><button type="submit" disabled={isSavingAccountEntry} className="rounded-xl bg-violet-600 px-5 py-2.5 text-xs font-bold text-white hover:bg-violet-700 disabled:opacity-60">{isSavingAccountEntry?t.savingChanges:t.saveAccountEntry}</button></div>
          </form>
        </div>
      </div>}

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
              <CurrencyCustomerEdit t={t} currency="AFN" total={customerEdit.totalPurchasedAmount} cash={customerEdit.totalPaid} raw={customerEdit.rawSettledAmount} charges={customerEdit.accountCharges} onTotal={value=>setCustomerEdit({...customerEdit,totalPurchasedAmount:value})} onCash={value=>setCustomerEdit({...customerEdit,totalPaid:value})} onRaw={value=>setCustomerEdit({...customerEdit,rawSettledAmount:value})}/>
              <CurrencyCustomerEdit t={t} currency="USD" total={customerEdit.totalPurchasedAmountUsd} cash={customerEdit.totalPaidUsd} raw={customerEdit.rawSettledAmountUsd} charges={customerEdit.accountChargesUsd} onTotal={value=>setCustomerEdit({...customerEdit,totalPurchasedAmountUsd:value})} onCash={value=>setCustomerEdit({...customerEdit,totalPaidUsd:value})} onRaw={value=>setCustomerEdit({...customerEdit,rawSettledAmountUsd:value})}/>
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

              <div className="grid grid-cols-2 gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs">
                <div><span className="block text-slate-500">{t.appliedToCustomerDebt}</span><strong className="font-mono text-emerald-700">{paymentAppliedToDebt.toLocaleString()} {paymentCurrency}</strong></div>
                <div><span className="block text-slate-500">{t.weOweCustomerAfterPayment}</span><strong className="font-mono text-amber-700">{customerCreditAfterPayment.toLocaleString()} {paymentCurrency}</strong></div>
                {paymentAmountNumber > paymentDebt && <p className="col-span-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-[10px] leading-4 text-amber-800">{t.customerOverpaymentNotice}</p>}
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
          <div className="bg-white w-full max-w-6xl max-h-[calc(100dvh-2rem)] rounded-2xl shadow-2xl border border-slate-200 overflow-hidden text-slate-900 flex flex-col">
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
                <div className="flex items-center rounded-lg border border-slate-200 bg-white p-0.5 text-[10px] font-bold"><button type="button" onClick={()=>setStatementMode('current')} className={`rounded-md px-2 py-1 ${statementMode==='current'?'bg-blue-600 text-white':'text-slate-600'}`}>{t.currentStatement}</button><button type="button" onClick={()=>setStatementMode('audit')} className={`rounded-md px-2 py-1 ${statementMode==='audit'?'bg-slate-700 text-white':'text-slate-600'}`}>{t.auditStatement}</button></div>
                <ReceiptActions elementId="customer-receipt" filename={`customer-${statementMode}-statement-${selectedHistoryCustomer.id}`} title={`${statementMode === 'audit' ? t.auditStatement : t.currentAccountStatement} - ${selectedHistoryCustomer.name}`} printLabel={t.printInvoice} downloadLabel="PDF" creatingLabel={t.pdfCreating} downloadErrorLabel={t.pdfDownloadFailed}/>
                <button type="button" onClick={() => setSelectedHistoryCustomer(null)} className="text-slate-400 hover:text-slate-900 cursor-pointer">
                  <X className="w-5 h-5"/>
                </button>
              </div>
            </div>

            <div className="min-h-0 overflow-y-auto overscroll-contain touch-pan-y">
              <AccountStatement id="customer-receipt" party={selectedHistoryCustomer} role="customer" sales={db.sales} t={t} lang={lang} audit={statementMode === 'audit'}/>
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
const CurrencyCustomerEdit = ({t,currency,total,cash,raw,charges,onTotal,onCash,onRaw}) => {
    const update = setter => event => setter(normalizeDecimalInput(event.target.value));
    const net = (Number(total) || 0) + (Number(charges) || 0) - (Number(cash) || 0) - (Number(raw) || 0);
    const debt = Math.max(0, net);
    const credit = Math.max(0, -net);
    return <div className="rounded-xl border border-slate-200 bg-slate-50 p-4"><h5 className="font-bold text-sm text-slate-800 mb-3">{currency}</h5><div className="space-y-3"><CustomerEditField label={t.totalPurchasedAmount}><input type="text" inputMode="decimal" required value={total} onChange={update(onTotal)} className={customerEditControlClass}/></CustomerEditField><CustomerEditField label={t.customerAccountCharges}><div className={`${customerEditControlClass} bg-slate-100 font-mono`}>{Number(charges || 0).toLocaleString()} {currency}</div></CustomerEditField><CustomerEditField label={t.cashReceivedFromCustomer}><input type="text" inputMode="decimal" required value={cash} onChange={update(onCash)} className={customerEditControlClass}/></CustomerEditField><CustomerEditField label={t.nonCashRawSettled}><input type="text" inputMode="decimal" required value={raw} onChange={update(onRaw)} className={customerEditControlClass}/></CustomerEditField><div className="grid grid-cols-2 gap-2"><div className="rounded-lg bg-white border border-slate-200 px-3 py-2"><span className="block text-[10px] text-slate-500">{t.remainingDebt}</span><strong className="font-mono text-rose-700">{debt.toLocaleString()} {currency}</strong></div><div className="rounded-lg bg-white border border-amber-200 px-3 py-2"><span className="block text-[10px] text-slate-500">{t.weOweThem}</span><strong className="font-mono text-amber-700">{credit.toLocaleString()} {currency}</strong></div></div></div></div>;
};
