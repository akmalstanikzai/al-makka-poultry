import React from 'react';
import { saleUnitLabel } from '../lib/saleLineItems';
import { formatReportDate } from '../lib/recordDate';

export const ReportDocument = ({ report, rangeLabel, periodLabel, lang, t }) => {
    const labels = t.reporting;
    const format = (value, maximumFractionDigits = 5) => Number(value || 0).toLocaleString(lang === 'en' ? 'en-US' : 'fa-AF', { maximumFractionDigits });
    const money = value => <span className="inline-flex flex-wrap gap-x-3"><bdi>{format(value.AFN, 2)} AFN</bdi><bdi>{format(value.USD, 2)} USD</bdi></span>;
    const date = value => formatReportDate(value, lang, t);
    const summary = [
        [labels.salesTotal, money(report.revenue)],
        [labels.purchaseTotal, money(report.purchaseTotal)],
        [t.factoryExpensesTotal, money(report.expenseTotal)],
        [labels.soldQuantity, `${format(report.soldKg)} ${t.kilo} / ${format(report.soldKg / 50)} ${t.bag}`],
        [labels.purchasedQuantity, `${format(report.purchasedKg)} ${t.kilo} / ${format(report.purchasedKg / 50)} ${t.bag}`],
        [labels.costOfGoods, money(report.cogs)],
        [t.operationalGrossProfit, money(report.grossProfit)],
        [t.netProfit, money(report.netProfit)],
        [t.feedProducedInPeriod, `${format(report.producedKg)} ${t.kilo} / ${format(report.producedKg / 50)} ${t.bag}`],
    ];
    const salesHeaders = [t.date, t.invoiceNumber, labels.party, t.productName, labels.stockType, labels.bagsEquivalent, t.kilo, t.statementPricePerUnit, t.total];
    const purchaseHeaders = [t.date, labels.party, t.productName, labels.purchaseType, labels.bagsEquivalent, t.kilo, t.statementPricePerUnit, t.total];
    return <article className="report-document space-y-6 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-sm" lang={lang} dir={lang === 'en' ? 'ltr' : 'rtl'}>
      <header className="report-heading border-b-2 border-slate-800 pb-4 text-center">
        <h1 className="text-xl font-black text-slate-900">{t.companyName}</h1>
        <p className="mt-1 text-sm text-slate-600">{t.companySubtitle}</p>
        <h2 className="mt-3 text-lg font-bold">{t.reportsTitle} — {periodLabel}</h2>
        <p className="mt-1 text-sm font-semibold">{rangeLabel}</p>
      </header>
      <div className="report-summary grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {summary.map(([label, value]) => <div key={label} className="rounded-xl border border-slate-200 p-3"><p className="text-xs font-semibold text-slate-500">{label}</p><div className="mt-1 text-base font-bold text-slate-900">{value}</div></div>)}
      </div>
      <p className="text-xs text-slate-600">{labels.quantityNote} {labels.currencyNote} {labels.profitNote}</p>
      <ReportTable title={`${labels.salesDetails} (${format(report.sales.length)})`} headers={salesHeaders} empty={labels.noRecords} totals={<><span>{format(report.soldKg)} {t.kilo} · {format(report.soldKg / 50)} {t.bag}</span> · {money(report.revenue)}</>} totalLabel={t.total}>
        {report.saleLines.map(line => <tr key={line.id}>
          <td>{date(line.date)}</td><td><bdi>{line.billNumber || '—'}</bdi></td><td>{line.partyName || '—'}</td><td>{line.productName || '—'}</td><td>{line.stockType === 'raw' ? labels.raw : labels.processed}</td><td>{format(line.quantityKg / 50)}</td><td>{format(line.quantityKg)}</td><td>{line.salePricePerUnit == null ? '—' : <bdi>{format(line.salePricePerUnit)} {line.currency} / {saleUnitLabel(line.unitType, t)}</bdi>}</td><td><bdi>{format(line.totalAmount)} {line.currency}</bdi></td>
        </tr>)}
      </ReportTable>
      <ReportTable title={`${labels.purchaseDetails} (${format(report.purchases.length)})`} headers={purchaseHeaders} empty={labels.noRecords} totals={<><span>{format(report.purchasedKg)} {t.kilo} · {format(report.purchasedKg / 50)} {t.bag}</span> · {money(report.purchaseTotal)}</>} totalLabel={t.total}>
        {report.purchases.map(purchase => <tr key={purchase.id}>
          <td>{date(purchase.date)}</td><td>{purchase.partyName || labels.noSupplier}</td><td>{purchase.itemName || '—'}</td><td>{purchase.type === 'raw_goods_settlement' ? t.customerRawSettlement : labels.purchase}</td><td>{purchase.quantityKg == null ? '—' : format(purchase.quantityKg / 50)}</td><td>{purchase.quantityKg == null ? '—' : format(purchase.quantityKg)}</td><td>{purchase.unitPricePerUnit == null && purchase.unitPrice == null ? '—' : <bdi>{format(purchase.unitPricePerUnit ?? purchase.unitPrice)} {purchase.currency || 'AFN'} / {saleUnitLabel(purchase.unitPricePerUnit == null ? 'kg' : purchase.unitType || 'kg', t)}</bdi>}</td><td><bdi>{format(purchase.amount)} {purchase.currency || 'AFN'}</bdi></td>
        </tr>)}
      </ReportTable>
      <ReportTable title={`${labels.expenseDetails} (${format(report.expenses.length)})`} headers={[t.date, labels.category, labels.description, labels.paidBy, t.total]} empty={labels.noRecords} totals={money(report.expenseTotal)} totalLabel={t.total}>
        {report.expenses.map(expense => <tr key={expense.id}><td>{date(expense.date)}</td><td>{t.expenseCategories[expense.category] || expense.category}</td><td>{expense.description || '—'}{expense.notes && <p>{expense.notes}</p>}</td><td>{expense.paidBy || '—'}</td><td><bdi>{format(expense.amount)} {expense.currency || 'AFN'}</bdi></td></tr>)}
      </ReportTable>
    </article>;
};

const ReportTable = ({ title, headers, children, empty, totals, totalLabel }) => (
    <section className="report-section">
      <h3 className="mb-3 text-base font-bold text-slate-900">{title}</h3>
      <div className="report-table overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full text-start text-xs">
          <thead className="bg-slate-100 text-slate-700"><tr>{headers.map((header, index) => <th key={index} scope="col" className="px-3 py-3 text-start font-bold">{header}</th>)}</tr></thead>
          <tbody>{children.length ? children : <tr><td colSpan={headers.length} className="p-5 text-center text-slate-500">{empty}</td></tr>}</tbody>
          <tfoot className="bg-slate-50 font-bold"><tr><th scope="row" className="p-3 text-start">{totalLabel}</th><td colSpan={headers.length - 1} className="p-3 text-end">{totals}</td></tr></tfoot>
        </table>
      </div>
    </section>
);
