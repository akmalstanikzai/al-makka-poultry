import React, { useMemo, useRef, useState } from 'react';
import { Banknote, History, Plus, Receipt, Search, ShoppingBasket, Trash2, Users, Wallet, X } from 'lucide-react';
import { useDatabase } from '../context/DatabaseContext';
import { ReceiptActions } from '../components';
import { cleanBillNumber, billNumberExists } from '../lib/billNumber';
import { normalizeDecimalInput } from '../lib/numberInput';

let counterLineSequence = 0;
const createLine = (db, stockType = 'processed') => ({
    key: `counter-line-${Date.now()}-${++counterLineSequence}`,
    stockType: stockType === 'processed' && !db.processedStock.length && db.rawMaterials.length ? 'raw' : stockType,
    stockId: (stockType === 'processed' && !db.processedStock.length && db.rawMaterials.length ? db.rawMaterials : stockType === 'raw' ? db.rawMaterials : db.processedStock)[0]?.id || '',
    unitType: 'bag',
    unitQuantity: '',
    salePricePerUnit: '',
});
const unitKg = unit => unit === 'ton' ? 1000 : unit === 'bag' ? 50 : 1;
const moneyPair = (afn, usd) => `${Number(afn || 0).toLocaleString()} AFN · ${Number(usd || 0).toLocaleString()} USD`;

export const CounterSalesPage = () => {
    const { db, lang, t, recordCounterSale, receiveCounterCustomerPayment } = useDatabase();
    const labels = lang === 'fa' ? {
        title: 'فروش نقدی و مشتریان موقت', description: 'فروش مواد خام و پروسس‌شده در یک بل، جدا از حساب مشتریان و عرضه‌کنندگان.', newSale: 'فروش جدید', history: 'تاریخچه بل‌ها', accounts: 'مشتریان فروش نقدی', bill: 'شماره بل', name: 'نام مشتری', phone: 'شماره تماس', currency: 'واحد پول', stockType: 'نوع موجودی', raw: 'مواد خام', processed: 'مواد پروسس‌شده', item: 'نام جنس', unit: 'واحد فروش', quantity: 'تعداد/مقدار', unitPrice: 'قیمت فی واحد', lineTotal: 'مجموع', addItem: 'افزودن جنس دیگر', total: 'مجموع بل', paid: 'پرداخت نقدی', remaining: 'باقی بدهی', notes: 'جزئیات', save: 'ثبت فروش', search: 'جستجو با نام، تلفن یا شماره بل...', noSales: 'هنوز فروش نقدی ثبت نشده است.', noCustomers: 'هنوز مشتری فروش نقدی وجود ندارد.', purchases: 'مجموع خرید', payments: 'مجموع پرداخت', debt: 'باقی بدهی', payDebt: 'پرداخت بدهی', paymentTitle: 'دریافت پرداخت نقدی', amount: 'مبلغ پرداخت', paymentNote: 'جزئیات پرداخت', kg: 'کیلو', bag: 'بوجی', ton: 'تن', select: 'انتخاب جنس', invoice: 'جزئیات بل', close: 'بستن', paymentHistory: 'تاریخچه حساب', cashOnly: 'این بدهی فقط با پرداخت نقدی تصفیه می‌شود.', saving: 'در حال ثبت…', pay: 'ثبت پرداخت', invalid: 'تمام معلومات ضروری را درست وارد کنید.', duplicate: 'این شماره بل قبلاً استفاده شده است.'
    } : lang === 'ps' ? {
        title: 'نغدي خرڅلاو او لنډمهاله پېرودونکي', description: 'خام او پروسس شوي توکي په یوه بل کې، د اصلي پېرودونکو او عرضه کوونکو له حسابونو څخه جلا.', newSale: 'نوی خرڅلاو', history: 'د بلونو تاریخچه', accounts: 'د نغدي خرڅلاو پېرودونکي', bill: 'د بل شمېره', name: 'د پېرودونکي نوم', phone: 'د اړیکې شمېره', currency: 'پولي واحد', stockType: 'د زیرمې ډول', raw: 'خام مواد', processed: 'پروسس شوي توکي', item: 'د توکي نوم', unit: 'د خرڅلاو واحد', quantity: 'مقدار', unitPrice: 'د یوه واحد بیه', lineTotal: 'ټول', addItem: 'بل توکی ورزیات کړئ', total: 'د بل ټوله بیه', paid: 'ورکړل شوې نغدې', remaining: 'پاتې پور', notes: 'تفصیلات', save: 'خرڅلاو ثبت کړئ', search: 'د نوم، ټیلیفون یا بل شمېرې له مخې لټون...', noSales: 'تر اوسه نغدي خرڅلاو نشته.', noCustomers: 'تر اوسه د نغدي خرڅلاو پېرودونکی نشته.', purchases: 'ټول پېرود', payments: 'ټولې ورکړې', debt: 'پاتې پور', payDebt: 'پور ورکړه', paymentTitle: 'نغدي ورکړه ترلاسه کړئ', amount: 'د ورکړې اندازه', paymentNote: 'د ورکړې تفصیلات', kg: 'کیلو', bag: 'بوجۍ', ton: 'ټن', select: 'توکی وټاکئ', invoice: 'د بل تفصیلات', close: 'بندول', paymentHistory: 'د حساب تاریخچه', cashOnly: 'دا پور یوازې په نغدي پیسو تصفیه کېږي.', saving: 'ثبتېږي…', pay: 'ورکړه ثبت کړئ', invalid: 'ټول اړین معلومات سم داخل کړئ.', duplicate: 'د بل دا شمېره مخکې کارول شوې ده.'
    } : {
        title: 'Quick Cash Sale', description: 'Sell raw and processed stock on one bill, separately from regular customer and supplier accounts.', newSale: 'New counter sale', history: 'Bill history', accounts: 'Counter customers', bill: 'Bill number', name: 'Customer name', phone: 'Phone number', currency: 'Currency', stockType: 'Stock type', raw: 'Raw stock', processed: 'Processed stock', item: 'Stock item', unit: 'Selling unit', quantity: 'Quantity', unitPrice: 'Price per unit', lineTotal: 'Line total', addItem: 'Add another item', total: 'Bill total', paid: 'Cash paid', remaining: 'Remaining debt', notes: 'Entry details', save: 'Save sale', search: 'Search by name, phone, or bill number...', noSales: 'No counter sales have been recorded.', noCustomers: 'No counter customers have been recorded.', purchases: 'Total purchases', payments: 'Total paid', debt: 'Remaining debt', payDebt: 'Pay debt', paymentTitle: 'Receive cash payment', amount: 'Payment amount', paymentNote: 'Payment details', kg: 'Kg', bag: 'Bag', ton: 'Ton', select: 'Select stock', invoice: 'Bill details', close: 'Close', paymentHistory: 'Account history', cashOnly: 'This debt can only be settled with cash.', saving: 'Saving…', pay: 'Save payment', invalid: 'Enter all required values correctly.', duplicate: 'This bill number has already been used.'
    };
    const [showSale, setShowSale] = useState(false);
    const [lines, setLines] = useState(() => [createLine(db)]);
    const [billNumber, setBillNumber] = useState('');
    const [counterCustomerId, setCounterCustomerId] = useState('');
    const [customerName, setCustomerName] = useState('');
    const [customerPhone, setCustomerPhone] = useState('');
    const [currency, setCurrency] = useState('AFN');
    const [paidAmount, setPaidAmount] = useState('');
    const [notes, setNotes] = useState('');
    const [error, setError] = useState('');
    const [saving, setSaving] = useState(false);
    const [search, setSearch] = useState('');
    const [selectedSale, setSelectedSale] = useState(null);
    const [selectedCustomer, setSelectedCustomer] = useState(null);
    const [paymentCustomer, setPaymentCustomer] = useState(null);
    const [paymentCurrency, setPaymentCurrency] = useState('AFN');
    const [paymentAmount, setPaymentAmount] = useState('');
    const [paymentNotes, setPaymentNotes] = useState('');
    const [paymentError, setPaymentError] = useState('');
    const saveLock = useRef(false);

    const calculatedLines = lines.map(line => {
        const stock = (line.stockType === 'raw' ? db.rawMaterials : db.processedStock).find(item => item.id === line.stockId);
        const unitQuantity = Number(line.unitQuantity) || 0;
        const salePricePerUnit = Number(line.salePricePerUnit) || 0;
        return { ...line, stock, unitQuantity, salePricePerUnit, quantityKg: unitQuantity * unitKg(line.unitType), totalAmount: unitQuantity * salePricePerUnit };
    });
    const totalAmount = calculatedLines.reduce((sum, line) => sum + line.totalAmount, 0);
    const paid = paidAmount === '' ? 0 : Number(paidAmount) || 0;
    const remaining = Math.max(0, totalAmount - paid);
    const duplicateBill = billNumberExists([...(db.sales || []), ...(db.counterSales || [])], billNumber);

    const updateLine = (key, values) => setLines(current => current.map(line => line.key === key ? { ...line, ...values } : line));
    const changeStockType = (line, stockType) => {
        const source = stockType === 'raw' ? db.rawMaterials : db.processedStock;
        updateLine(line.key, { stockType, stockId: source[0]?.id || '', unitQuantity: '', salePricePerUnit: '' });
    };
    const openSale = () => {
        setLines([createLine(db)]); setBillNumber(''); setCounterCustomerId(''); setCustomerName(''); setCustomerPhone(''); setCurrency('AFN'); setPaidAmount(''); setNotes(''); setError(''); setShowSale(true);
    };
    const chooseCustomer = name => {
        setCustomerName(name);
        const normalized = name.trim().toLocaleLowerCase();
        const existing = (db.counterCustomers || []).find(customer => customer.name.trim().toLocaleLowerCase() === normalized);
        setCounterCustomerId(existing?.id || '');
        if (existing) setCustomerPhone(existing.phone || '');
    };
    const submitSale = async event => {
        event.preventDefault();
        if (saveLock.current) return;
        setError('');
        if (!cleanBillNumber(billNumber) || !customerName.trim() || duplicateBill || paid < 0 || paid > totalAmount || calculatedLines.some(line => !line.stock || line.unitQuantity <= 0 || line.salePricePerUnit <= 0)) {
            setError(duplicateBill ? labels.duplicate : labels.invalid); return;
        }
        saveLock.current = true; setSaving(true);
        try {
            const result = await recordCounterSale({ billNumber, counterCustomerId: counterCustomerId || undefined, customerName, customerPhone, currency, paidAmount: paid, notes, items: calculatedLines.map(line => ({ stockType: line.stockType, stockId: line.stock.id, unitType: line.unitType, unitQuantity: line.unitQuantity, salePricePerUnit: line.salePricePerUnit })) });
            if (result.success) setShowSale(false); else setError(result.error || labels.invalid);
        } finally { saveLock.current = false; setSaving(false); }
    };
    const openPayment = (customer, preferredCurrency) => {
        setPaymentCustomer(customer); setPaymentCurrency(preferredCurrency || (customer.balanceOwed > 0 ? 'AFN' : 'USD')); setPaymentAmount(''); setPaymentNotes(''); setPaymentError('');
    };
    const submitPayment = async event => {
        event.preventDefault(); setPaymentError('');
        const result = await receiveCounterCustomerPayment({ counterCustomerId: paymentCustomer.id, amount: Number(paymentAmount), currency: paymentCurrency, notes: paymentNotes });
        if (result.success) setPaymentCustomer(null); else setPaymentError(result.error || labels.invalid);
    };
    const term = search.trim().toLocaleLowerCase();
    const filteredSales = useMemo(() => [...(db.counterSales || [])].filter(sale => !term || [sale.billNumber, sale.customerName, sale.customerPhone, ...(sale.items || []).map(item => item.stockName)].some(value => String(value || '').toLocaleLowerCase().includes(term))).sort((a, b) => String(b.createdAt || b.id).localeCompare(String(a.createdAt || a.id))), [db.counterSales, term]);
    const filteredCustomers = useMemo(() => [...(db.counterCustomers || [])].filter(customer => !term || [customer.name, customer.phone].some(value => String(value || '').toLocaleLowerCase().includes(term))).sort((a, b) => String(b.transactions?.[0]?.createdAt || b.createdAt).localeCompare(String(a.transactions?.[0]?.createdAt || a.createdAt))), [db.counterCustomers, term]);
    const totals = (db.counterSales || []).reduce((sum, sale) => { const code = sale.currency === 'USD' ? 'USD' : 'AFN'; sum.sales[code] += Number(sale.totalAmount) || 0; sum.cash[code] += Number(sale.cashAmount) || 0; return sum; }, { sales: { AFN: 0, USD: 0 }, cash: { AFN: 0, USD: 0 } });
    const debts = (db.counterCustomers || []).reduce((sum, customer) => ({ AFN: sum.AFN + (Number(customer.balanceOwed) || 0), USD: sum.USD + (Number(customer.balanceOwedUsd) || 0) }), { AFN: 0, USD: 0 });

    return <div className="space-y-6">
      <header className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div><h2 className="text-xl font-bold text-slate-900 flex items-center gap-2"><ShoppingBasket className="h-6 w-6 text-violet-600"/>{labels.title}</h2><p className="mt-1 text-sm text-slate-500">{labels.description}</p></div>
        <button type="button" onClick={openSale} className="inline-flex items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-bold text-white shadow"><Plus className="h-4 w-4"/>{labels.newSale}</button>
      </header>
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Stat icon={Receipt} label={labels.purchases} value={moneyPair(totals.sales.AFN, totals.sales.USD)} tone="violet"/>
        <Stat icon={Wallet} label={labels.payments} value={moneyPair((db.counterCustomers || []).reduce((s,c)=>s+(Number(c.totalPaid)||0),0),(db.counterCustomers || []).reduce((s,c)=>s+(Number(c.totalPaidUsd)||0),0))} tone="emerald"/>
        <Stat icon={Banknote} label={labels.debt} value={moneyPair(debts.AFN, debts.USD)} tone="rose"/>
      </section>
      <div className="relative"><Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"/><input value={search} onChange={event=>setSearch(event.target.value)} placeholder={labels.search} className="w-full rounded-xl border border-slate-300 bg-white py-2.5 ps-10 pe-10 text-sm"/>{search&&<button type="button" onClick={()=>setSearch('')} className="absolute end-3 top-1/2 -translate-y-1/2 text-slate-400"><X className="h-4 w-4"/></button>}</div>
      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden"><div className="border-b bg-slate-50 px-5 py-3 font-bold flex items-center gap-2"><History className="h-4 w-4 text-violet-600"/>{labels.history}</div>{filteredSales.length ? <div className="divide-y">{filteredSales.map(sale=><button type="button" key={sale.id} onClick={()=>setSelectedSale(sale)} className="w-full p-4 text-start hover:bg-slate-50 grid grid-cols-2 lg:grid-cols-6 gap-3"><Cell label={labels.bill} value={`#${sale.billNumber}`}/><Cell label={labels.name} value={sale.customerName}/><Cell label={labels.total} value={`${sale.totalAmount.toLocaleString()} ${sale.currency}`}/><Cell label={labels.paid} value={`${sale.paidAmount.toLocaleString()} ${sale.currency}`} good/><Cell label={labels.remaining} value={`${sale.remainingAmount.toLocaleString()} ${sale.currency}`} bad={sale.remainingAmount>0}/><Cell label={t.date} value={sale.date}/></button>)}</div>:<Empty text={labels.noSales}/>}</section>
      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden"><div className="border-b bg-slate-50 px-5 py-3 font-bold flex items-center gap-2"><Users className="h-4 w-4 text-violet-600"/>{labels.accounts}</div>{filteredCustomers.length?<div className="divide-y">{filteredCustomers.map(customer=><div key={customer.id} className="p-4 grid grid-cols-2 lg:grid-cols-7 gap-3 items-center"><Cell label={labels.name} value={customer.name}/><Cell label={labels.phone} value={customer.phone||'—'}/><Cell label={labels.purchases} value={moneyPair(customer.totalPurchasedAmount,customer.totalPurchasedAmountUsd)} className="lg:col-span-2"/><Cell label={labels.debt} value={moneyPair(customer.balanceOwed,customer.balanceOwedUsd)} bad={customer.balanceOwed>0||customer.balanceOwedUsd>0}/><button type="button" onClick={()=>setSelectedCustomer(customer)} className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-bold">{labels.paymentHistory}</button><button type="button" disabled={!customer.balanceOwed&&!customer.balanceOwedUsd} onClick={()=>openPayment(customer)} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-40">{labels.payDebt}</button></div>)}</div>:<Empty text={labels.noCustomers}/>}</section>

      {showSale&&<Modal onClose={()=>setShowSale(false)} title={labels.newSale}><form onSubmit={submitSale} className="space-y-4"><div className="grid grid-cols-1 sm:grid-cols-2 gap-3"><Field label={labels.bill}><input required value={billNumber} onChange={e=>{setBillNumber(e.target.value);setError('')}} className={control}/></Field><Field label={labels.currency}><select value={currency} onChange={e=>setCurrency(e.target.value)} className={control}><option>AFN</option><option>USD</option></select></Field><Field label={labels.name}><input required list="counter-customer-names" value={customerName} onChange={e=>chooseCustomer(e.target.value)} className={control}/><datalist id="counter-customer-names">{(db.counterCustomers||[]).map(c=><option key={c.id} value={c.name}/>)}</datalist></Field><Field label={labels.phone}><input inputMode="numeric" value={customerPhone} onChange={e=>setCustomerPhone(e.target.value.replace(/\D/g,'').slice(0,10))} className={control} dir="ltr"/></Field></div><div className="space-y-3">{lines.map((line,index)=>{const source=line.stockType==='raw'?db.rawMaterials:db.processedStock;const calc=calculatedLines[index];return <div key={line.key} className="rounded-xl border border-slate-200 bg-slate-50 p-3"><div className="flex justify-between mb-2"><strong className="text-xs">#{index+1}</strong>{lines.length>1&&<button type="button" onClick={()=>setLines(rows=>rows.filter(row=>row.key!==line.key))} className="text-rose-600"><Trash2 className="h-4 w-4"/></button>}</div><div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3"><Field label={labels.stockType}><select value={line.stockType} onChange={e=>changeStockType(line,e.target.value)} className={control}><option value="raw">{labels.raw}</option><option value="processed">{labels.processed}</option></select></Field><Field label={labels.item}><select required value={line.stockId} onChange={e=>updateLine(line.key,{stockId:e.target.value})} className={control}><option value="">{labels.select}</option>{source.map(stock=><option key={stock.id} value={stock.id}>{stock.name} — {Number(stock.stockKg).toLocaleString()} {labels.kg}</option>)}</select></Field><Field label={labels.unit}><select value={line.unitType} onChange={e=>updateLine(line.key,{unitType:e.target.value,unitQuantity:'',salePricePerUnit:''})} className={control}><option value="kg">{labels.kg}</option><option value="bag">{labels.bag}</option><option value="ton">{labels.ton}</option></select></Field><Field label={labels.quantity}><input required inputMode="decimal" value={line.unitQuantity} onChange={e=>updateLine(line.key,{unitQuantity:normalizeDecimalInput(e.target.value)})} className={control}/></Field><Field label={`${labels.unitPrice} (${currency})`}><input required inputMode="decimal" value={line.salePricePerUnit} onChange={e=>updateLine(line.key,{salePricePerUnit:normalizeDecimalInput(e.target.value)})} className={control}/></Field></div><div className="mt-2 text-end text-xs text-slate-500">{labels.lineTotal}: <strong className="font-mono text-violet-700">{calc.totalAmount.toLocaleString()} {currency}</strong> · {calc.quantityKg.toLocaleString()} {labels.kg}</div></div>})}</div><button type="button" onClick={()=>setLines(rows=>[...rows,createLine(db,'raw')])} className="inline-flex items-center gap-1 rounded-lg bg-violet-50 px-3 py-2 text-xs font-bold text-violet-700"><Plus className="h-4 w-4"/>{labels.addItem}</button><div className="grid grid-cols-1 sm:grid-cols-2 gap-3"><Field label={`${labels.paid} (${currency})`}><input inputMode="decimal" value={paidAmount} onChange={e=>setPaidAmount(normalizeDecimalInput(e.target.value))} className={control}/></Field><Field label={labels.notes}><input value={notes} onChange={e=>setNotes(e.target.value)} className={control}/></Field></div><div className="rounded-xl border border-violet-200 bg-violet-50 p-4 grid grid-cols-3 gap-3"><Cell label={labels.total} value={`${totalAmount.toLocaleString()} ${currency}`}/><Cell label={labels.paid} value={`${paid.toLocaleString()} ${currency}`} good/><Cell label={labels.remaining} value={`${remaining.toLocaleString()} ${currency}`} bad={remaining>0}/></div>{error&&<p className="text-sm font-semibold text-rose-700">{error}</p>}<button disabled={saving} className="w-full rounded-xl bg-violet-600 py-3 text-sm font-bold text-white disabled:opacity-60">{saving?labels.saving:labels.save}</button></form></Modal>}
      {paymentCustomer&&<Modal onClose={()=>setPaymentCustomer(null)} title={`${labels.paymentTitle} — ${paymentCustomer.name}`}><form onSubmit={submitPayment} className="space-y-4"><p className="rounded-xl bg-emerald-50 p-3 text-xs text-emerald-800">{labels.cashOnly}</p><Field label={labels.currency}><select value={paymentCurrency} onChange={e=>{setPaymentCurrency(e.target.value);setPaymentAmount('')}} className={control}><option value="AFN" disabled={!paymentCustomer.balanceOwed}>AFN — {Number(paymentCustomer.balanceOwed||0).toLocaleString()}</option><option value="USD" disabled={!paymentCustomer.balanceOwedUsd}>USD — {Number(paymentCustomer.balanceOwedUsd||0).toLocaleString()}</option></select></Field><Field label={labels.amount}><input required inputMode="decimal" value={paymentAmount} onChange={e=>setPaymentAmount(normalizeDecimalInput(e.target.value))} className={control}/></Field><Field label={labels.paymentNote}><textarea rows="3" value={paymentNotes} onChange={e=>setPaymentNotes(e.target.value)} className={control}/></Field>{paymentError&&<p className="text-sm font-semibold text-rose-700">{paymentError}</p>}<button className="w-full rounded-xl bg-emerald-600 py-3 text-sm font-bold text-white">{labels.pay}</button></form></Modal>}
      {selectedSale&&<Modal onClose={()=>setSelectedSale(null)} title={`${labels.invoice} #${selectedSale.billNumber}`}><div className="mb-4 flex justify-end"><ReceiptActions elementId="counter-sale-receipt" filename={`counter-sale-${selectedSale.billNumber}`} title={`${labels.invoice} #${selectedSale.billNumber}`} printLabel={t.printInvoice||'Print'} downloadLabel="PDF"/></div><div id="counter-sale-receipt" className="receipt-document space-y-4 bg-white p-3"><div className="border-b pb-3 text-center"><h2 className="text-lg font-black">{t.companyName}</h2><p className="text-xs text-slate-500">{labels.title} · #{selectedSale.billNumber}</p></div><div className="grid grid-cols-2 gap-3"><Cell label={labels.name} value={selectedSale.customerName}/><Cell label={t.date} value={selectedSale.date}/></div><div className="overflow-x-auto"><table className="w-full text-xs"><thead><tr className="border-b text-slate-500"><th className="p-2 text-start">{labels.stockType}</th><th className="p-2 text-start">{labels.item}</th><th className="p-2 text-start">{labels.quantity}</th><th className="p-2 text-start">{labels.unitPrice}</th><th className="p-2 text-start">{labels.total}</th></tr></thead><tbody>{(selectedSale.items||[]).map((item,index)=><tr key={index} className="border-b"><td className="p-2">{item.stockType==='raw'?labels.raw:labels.processed}</td><td className="p-2 font-bold">{item.stockName}</td><td className="p-2 font-mono">{item.unitQuantity} {labels[item.unitType]}</td><td className="p-2 font-mono">{item.salePricePerUnit.toLocaleString()} {selectedSale.currency}</td><td className="p-2 font-mono">{item.totalAmount.toLocaleString()} {selectedSale.currency}</td></tr>)}</tbody></table></div><div className="grid grid-cols-3 gap-3"><Cell label={labels.total} value={`${selectedSale.totalAmount.toLocaleString()} ${selectedSale.currency}`}/><Cell label={labels.paid} value={`${selectedSale.paidAmount.toLocaleString()} ${selectedSale.currency}`} good/><Cell label={labels.remaining} value={`${selectedSale.remainingAmount.toLocaleString()} ${selectedSale.currency}`} bad={selectedSale.remainingAmount>0}/></div>{selectedSale.notes&&<p className="rounded-lg bg-slate-50 p-3 text-sm">{selectedSale.notes}</p>}</div></Modal>}
      {selectedCustomer&&<Modal onClose={()=>setSelectedCustomer(null)} title={`${labels.paymentHistory} — ${selectedCustomer.name}`}><div className="space-y-3">{(selectedCustomer.transactions||[]).map(transaction=><div key={transaction.id} className="rounded-xl border p-3 grid grid-cols-2 sm:grid-cols-4 gap-2"><Cell label={transaction.type==='sale'?labels.bill:labels.paymentTitle} value={transaction.billNumber?`#${transaction.billNumber}`:transaction.description||labels.payments}/><Cell label={labels.total} value={`${transaction.amount.toLocaleString()} ${transaction.currency}`}/><Cell label={labels.remaining} value={`${transaction.remainingAmount.toLocaleString()} ${transaction.currency}`} bad={transaction.remainingAmount>0}/><Cell label={t.date} value={transaction.date}/></div>)}</div></Modal>}
    </div>;
};

const control = 'w-full min-w-0 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-violet-600';
const Field = ({ label, children }) => <label className="block"><span className="mb-1 block text-xs font-semibold text-slate-700">{label}</span>{children}</label>;
const Cell = ({ label, value, good, bad, className='' }) => <div className={className}><span className="block text-[10px] text-slate-400">{label}</span><strong className={`block break-words text-xs font-mono ${good?'text-emerald-700':bad?'text-rose-700':'text-slate-800'}`}>{value}</strong></div>;
const Empty = ({ text }) => <div className="p-10 text-center text-sm text-slate-500">{text}</div>;
const Stat = ({ icon:Icon,label,value,tone }) => <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm flex items-center justify-between gap-3"><div><span className="text-xs font-semibold text-slate-500">{label}</span><strong className="mt-1 block font-mono text-base text-slate-900">{value}</strong></div><span className={`rounded-xl p-3 ${tone==='emerald'?'bg-emerald-100 text-emerald-700':tone==='rose'?'bg-rose-100 text-rose-700':'bg-violet-100 text-violet-700'}`}><Icon className="h-5 w-5"/></span></div>;
const Modal = ({ onClose,title,children }) => <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/55 p-3 sm:p-6"><div className="mx-auto my-2 w-full max-w-5xl rounded-2xl bg-white shadow-2xl"><div className="sticky top-0 z-10 flex items-center justify-between border-b bg-white px-5 py-4 rounded-t-2xl"><h3 className="font-bold text-slate-900">{title}</h3><button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5"/></button></div><div className="p-4 sm:p-6">{children}</div></div></div>;

