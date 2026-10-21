import React from 'react';

const amount = value => Number(value || 0);
const idTime = value => Number(String(value || '').match(/(\d{10,})$/)?.[1] || 0);
const money = (value, currency) => `${amount(value).toLocaleString()} ${currency || 'AFN'}`;

const findRelatedSale = (transaction, party, role, sales) => {
    if (transaction.sourceSaleId) {
        const linkedSale = (sales || []).find(sale => sale.id === transaction.sourceSaleId);
        if (linkedSale) return linkedSale;
    }
    const candidates = (sales || []).filter(sale => {
        const belongsToParty = role === 'customer'
            ? sale.customerId === party.id
            : sale.supplierId === party.id;
        return belongsToParty
            && sale.date === transaction.date
            && (sale.currency || 'AFN') === (transaction.currency || 'AFN')
            && Math.abs(amount(sale.totalAmount) - amount(transaction.amount)) < 0.01;
    });
    if (!candidates.length) return null;
    return candidates.sort((first, second) => Math.abs(idTime(first.id) - idTime(transaction.id)) - Math.abs(idTime(second.id) - idTime(transaction.id)))[0];
};

const cleanNotes = (transaction, relatedSale, t) => {
    if (transaction.type === 'payment') return transaction.description || '';
    if (transaction.type === 'cash_given' || transaction.type === 'transport_fee') return transaction.description || '';
    const transactionNotes = String(transaction.description || '').trim();
    const looksGenerated = /^(فروش|خرید|restock|supplier debt settlement|customer debt settlement)/i.test(transactionNotes)
        || [t.supplierGoodsSettlement, t.customerRawSettlement].filter(Boolean).some(prefix => transactionNotes.startsWith(prefix));
    if (transactionNotes && !looksGenerated) return transactionNotes;
    const notes = String(relatedSale?.notes || '').trim();
    const defaultSettlementNotes = [t.supplierGoodsSettlement, t.customerRawSettlement].filter(Boolean);
    if (!notes || defaultSettlementNotes.includes(notes) || /supplier debt settlement|customer debt settlement/i.test(notes)) return '';
    return notes;
};

const getStatementRow = (transaction, party, role, sales, t) => {
    const relatedSale = (transaction.type === 'sale' || transaction.type === 'goods_settlement')
        ? findRelatedSale(transaction, party, role, sales)
        : null;
    const unitType = transaction.unitType || relatedSale?.unitType || (transaction.quantityKg != null ? 'kg' : '');
    const unitQuantity = transaction.unitQuantity ?? relatedSale?.unitQuantity ?? transaction.quantityKg;
    const pricePerUnit = transaction.unitPricePerUnit ?? relatedSale?.salePricePerUnit ?? transaction.unitPrice;
    const itemName = transaction.itemName || relatedSale?.productName
        || (transaction.type === 'payment' ? t.statementCashPayment
            : transaction.type === 'cash_given' ? t.cashGivenToCustomer
                : transaction.type === 'transport_fee' ? t.transportFeeEntry : '-');
    return {
        ...transaction,
        itemName,
        unitType,
        unitQuantity,
        pricePerUnit,
        notes: cleanNotes(transaction, relatedSale, t),
    };
};

const unitText = (row, t) => {
    if (row.unitQuantity == null || !row.unitType) return '-';
    const labels = { bag: t.statementBag, kg: t.statementKilo, ton: t.statementTon };
    return `${amount(row.unitQuantity).toLocaleString()} ${labels[row.unitType] || row.unitType}`;
};

const quantityTotals = (rows, t, role) => {
    const primaryTransactionType = role === 'customer' ? 'sale' : 'purchase';
    const totals = rows.reduce((result, row) => {
        if (row.type === primaryTransactionType && row.unitType && row.unitQuantity != null) result[row.unitType] = (result[row.unitType] || 0) + amount(row.unitQuantity);
        return result;
    }, {});
    return ['bag', 'kg', 'ton']
        .filter(unit => totals[unit] > 0)
        .map(unit => `${totals[unit].toLocaleString()} ${{ bag: t.statementBag, kg: t.statementKilo, ton: t.statementTon }[unit]}`)
        .join(' · ') || '-';
};

const MoneyPair = ({ afn, usd, tone = 'text-slate-900' }) => (
    <strong dir="ltr" className={`inline-block font-mono ${tone}`}>{amount(afn).toLocaleString()} AFN · {amount(usd).toLocaleString()} USD</strong>
);

export const AccountStatement = ({ id, party, role, sales = [], t, lang, audit = false }) => {
    const isCustomer = role === 'customer';
    const rows = (party.transactions || [])
        .filter(transaction => audit || (transaction.status || 'active') === 'active')
        .map(transaction => getStatementRow(transaction, party, role, sales, t));
    const activeRows = rows.filter(transaction => (transaction.status || 'active') === 'active');
    const cashAfn = amount(party.totalPaid);
    const cashUsd = amount(party.totalPaidUsd);
    const nonCashAfn = amount(isCustomer ? party.rawSettledAmount : party.goodsSettledAmount);
    const nonCashUsd = amount(isCustomer ? party.rawSettledAmountUsd : party.goodsSettledAmountUsd);
    const accountChargesAfn = amount(isCustomer ? party.accountCharges : 0);
    const accountChargesUsd = amount(isCustomer ? party.accountChargesUsd : 0);
    const direction = lang === 'en' ? 'ltr' : 'rtl';
    return <div id={id} className="receipt-document statement-document bg-white text-slate-900 p-5" dir={direction} lang={lang}>
      <header className="statement-header border-b-2 border-slate-900 pb-4">
        <div className="text-center">
          <h1 className="text-xl font-black">{t.companyName}</h1>
          <p className="text-xs text-slate-500 mt-1">{audit ? t.auditStatement : t.currentAccountStatement}</p>
        </div>
        <div className="statement-party-info mt-4 grid grid-cols-2 gap-x-6 gap-y-2 rounded-xl border border-slate-300 bg-slate-50 p-3 text-xs">
          <div><span className="block text-slate-500">{isCustomer ? t.customerNameLabel : t.supplier}</span><strong>{party.name}</strong></div>
          <div><span className="block text-slate-500">{t.phone}</span><strong dir="ltr">{party.phone || '-'}</strong></div>
          <div><span className="block text-slate-500">{t.address}</span><strong>{party.address || '-'}</strong></div>
          <div><span className="block text-slate-500">{t.statementAccountId}</span><strong dir="ltr" className="inline-block font-mono">#{String(party.id).slice(-6).toUpperCase()}</strong></div>
        </div>
      </header>

      <section className="statement-ledger mt-4 overflow-x-auto rounded-xl border border-slate-300">
        <table className="w-full min-w-[760px] border-collapse text-[10px]">
          <thead className="bg-slate-900 text-white">
            <tr>
              <th className="p-2 text-start">#</th>
              <th className="p-2 text-start">{t.date}</th>
              <th className="p-2 text-start">{t.productName}</th>
              <th className="p-2 text-start">{t.statementQuantity}</th>
              <th className="p-2 text-start">{t.statementPricePerUnit}</th>
              <th className="p-2 text-start">{t.totalAmount}</th>
              <th className="p-2 text-start">{t.statementPaidSettled}</th>
              <th className="p-2 text-start">{t.statementBalance}</th>
              {audit && <th className="p-2 text-start">{t.statementStatus}</th>}
            </tr>
          </thead>
          <tbody>
            {rows.length ? rows.map((row, index) => {
              const rowStatus = row.status || 'active';
              const inactive = rowStatus !== 'active';
              return <tr key={row.id} className={`statement-row border-t border-slate-200 odd:bg-white even:bg-slate-50 align-top ${inactive ? 'text-slate-500 line-through opacity-70' : ''}`}>
              <td className="p-2 font-mono text-slate-500">{rows.length - index}</td>
              <td dir="ltr" className="p-2 font-mono whitespace-nowrap">{row.date}</td>
              <td className="p-2 min-w-28">
                <strong className="block text-slate-900">{row.itemName}</strong>
                {row.notes && <span className="statement-note mt-1 block text-[9px] leading-4 text-slate-600">{row.notes}</span>}
              </td>
              <td className="p-2 font-mono whitespace-nowrap">{unitText(row, t)}</td>
              <td dir="ltr" className="p-2 font-mono whitespace-nowrap">{row.pricePerUnit == null ? '-' : money(row.pricePerUnit, row.currency)}</td>
              <td dir="ltr" className="p-2 font-mono font-bold whitespace-nowrap">{row.type === 'payment' ? '-' : money(row.amount, row.currency)}</td>
              <td dir="ltr" className="p-2 font-mono text-emerald-700 font-bold whitespace-nowrap">{row.type === 'cash_given' || row.type === 'transport_fee' ? '-' : money(row.paidAmount, row.currency)}</td>
              <td dir="ltr" className="p-2 font-mono text-rose-700 font-bold whitespace-nowrap">{money(row.accountBalanceAfter ?? row.remainingAmount, row.currency)}</td>
              {audit && <td className="p-2 min-w-24 no-underline">
                <strong className={inactive ? 'text-rose-700' : 'text-emerald-700'}>{inactive ? (rowStatus === 'voided' ? t.voided : t.corrected) : t.activeTransaction}</strong>
                {row.correctionReason && <span className="mt-1 block text-[9px] leading-4 text-slate-600">{row.correctionReason}</span>}
              </td>}
            </tr>}) : <tr><td colSpan={audit ? 9 : 8} className="p-8 text-center text-slate-500">{t.noTxRecorded}</td></tr>}
          </tbody>
        </table>
      </section>

      <section className="statement-totals mt-5 rounded-xl border-2 border-slate-900 p-4">
        <h2 className="text-sm font-black mb-3">{t.statementFinalTotals}</h2>
        <div className="mb-3 rounded-lg bg-slate-100 px-3 py-2 text-xs"><span className="text-slate-500">{t.statementTotalQuantity}: </span><strong>{quantityTotals(activeRows, t, role)}</strong></div>
        <div className="grid grid-cols-2 gap-x-5 gap-y-3 text-xs">
          <div><span className="block text-slate-500">{isCustomer ? t.statementTotalSales : t.statementTotalPurchases}</span><MoneyPair afn={party.totalPurchasedAmount} usd={party.totalPurchasedAmountUsd}/></div>
          {isCustomer && <div><span className="block text-slate-500">{t.customerAccountCharges}</span><MoneyPair afn={accountChargesAfn} usd={accountChargesUsd} tone="text-blue-700"/></div>}
          <div><span className="block text-slate-500">{isCustomer ? t.cashReceivedFromCustomer : t.cashPaidToSupplier}</span><MoneyPair afn={cashAfn} usd={cashUsd} tone="text-emerald-700"/></div>
          <div><span className="block text-slate-500">{isCustomer ? t.nonCashRawSettled : t.nonCashGoodsSettled}</span><MoneyPair afn={nonCashAfn} usd={nonCashUsd} tone="text-emerald-700"/></div>
          <div><span className="block text-slate-500">{isCustomer ? t.totalSettledByCustomer : t.totalSettledWithSupplier}</span><MoneyPair afn={cashAfn + nonCashAfn} usd={cashUsd + nonCashUsd} tone="text-emerald-700"/></div>
          <div><span className="block text-slate-500">{isCustomer ? t.statementTheyOweUs : t.statementWeOweSupplier}</span><MoneyPair afn={party.balanceOwed} usd={party.balanceOwedUsd} tone="text-rose-700"/></div>
          <div><span className="block text-slate-500">{isCustomer ? t.weOweThem : t.theyOweUs}</span><MoneyPair afn={isCustomer ? party.creditBalance : party.receivableBalance} usd={isCustomer ? party.creditBalanceUsd : party.receivableBalanceUsd} tone="text-amber-700"/></div>
        </div>
      </section>

      <p className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[9px] leading-4 text-slate-600">{audit ? t.auditStatementNote : t.currentStatementNote}</p>

      <footer className="mt-5 border-t border-slate-300 pt-3 text-center text-[9px] text-slate-500">{t.developedBy}</footer>
    </div>;
};
