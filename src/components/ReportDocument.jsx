import React from 'react';

// Keep the same digits and separators in every report language.
const format = (value, maximumFractionDigits = 2) => Number(value || 0).toLocaleString('en-US', { maximumFractionDigits });

export const ReportDocument = ({ report, rangeLabel, periodLabel, lang, t }) => {
    const labels = t.reporting;
    const financialRows = [
        [labels.salesTotal, report.revenue],
        [labels.purchaseTotal, report.purchaseTotal],
        [t.factoryExpensesTotal, report.expenseTotal],
        [labels.costOfGoods, report.cogs],
        [t.operationalGrossProfit, report.grossProfit],
        [t.netProfit, report.netProfit],
    ];
    const quantities = [
        [labels.soldQuantity, report.soldKg],
        [labels.purchasedQuantity, report.purchasedKg],
        [t.feedProducedInPeriod, report.producedKg],
    ];
    return <article className="report-document" lang={lang} dir={lang === 'en' ? 'ltr' : 'rtl'}>
      <header className="report-heading">
        <div><h1>{t.companyName}</h1><p>{labels.summaryTitle} · {periodLabel}</p></div>
        <p className="report-period">{rangeLabel}</p>
      </header>

      <div className="report-cash-summary">
        <CashTotal label={labels.moneyIn} amounts={report.moneyIn}/>
        <CashTotal label={labels.moneyOut} amounts={report.moneyOut}/>
        <CashTotal label={labels.netCashFlow} amounts={report.netCashFlow} emphasized/>
      </div>

      <section className="report-section">
        <h2>{labels.financialSummary}</h2>
        <table className="report-summary-table">
          <thead><tr><th scope="col">{labels.summaryItem}</th><th scope="col">AFN</th><th scope="col">USD</th></tr></thead>
          <tbody>{financialRows.map(([label, amounts], index) => <tr key={label} className={index === financialRows.length - 1 ? 'report-total-row' : undefined}>
            <th scope="row">{label}</th><td><bdi dir="ltr">{format(amounts.AFN)}</bdi></td><td><bdi dir="ltr">{format(amounts.USD)}</bdi></td>
          </tr>)}</tbody>
        </table>
      </section>

      <section className="report-section">
        <h2>{labels.quantitySummary}</h2>
        <table className="report-summary-table">
          <thead><tr><th scope="col">{labels.summaryItem}</th><th scope="col">{t.statementKilo}</th><th scope="col">{labels.summaryBags}</th></tr></thead>
          <tbody>{quantities.map(([label, kg]) => <tr key={label}><th scope="row">{label}</th><td><bdi dir="ltr">{format(kg, 3)}</bdi></td><td><bdi dir="ltr">{format(kg / 50, 5)}</bdi></td></tr>)}</tbody>
        </table>
      </section>
      <p className="report-note">{labels.summaryNote}</p>
    </article>;
};

const CashTotal = ({ label, amounts, emphasized }) => <div className={`report-cash-total${emphasized ? ' report-cash-net' : ''}`}>
  <h2>{label}</h2>
  <div><bdi dir="ltr">{format(amounts.AFN)}</bdi><span>AFN</span></div>
  <div><bdi dir="ltr">{format(amounts.USD)}</bdi><span>USD</span></div>
</div>;
