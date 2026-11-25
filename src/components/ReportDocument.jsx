import React from 'react';
import { CurrencyAmounts } from './CurrencyAmounts';
import { PackageCheck, Wheat, ShoppingBag } from 'lucide-react';

// English digits and separators stay consistent in every report language.
const format = (value, maximumFractionDigits = 2) => Number(value || 0).toLocaleString('en-US', { maximumFractionDigits });

export const ReportDocument = ({ report, rangeLabel, periodLabel, lang, t }) => {
    const labels = t.reporting;
    const financialRows = [
        [report.hasRawSales ? labels.allSalesValue : labels.salesTotal, report.revenue],
        [labels.costOfGoods, report.cogs],
        [t.factoryExpensesTotal, report.expenseTotal],
        [t.operationalGrossProfit, report.grossProfit],
        [t.netProfit, report.netProfit],
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

      <section className="report-section report-stock-section">
        <h2>{labels.stockSummary}</h2>
        <StockActivity kind="production" icon={PackageCheck} title={labels.producedStock} kg={report.producedKg} valueLabel={labels.productionCost} amounts={report.productionCost} t={t}/>
        <StockActivity kind="purchase" icon={Wheat} title={labels.rawPurchased} kg={report.purchasedKg} valueLabel={labels.purchaseTotal} amounts={report.purchaseTotal} t={t}/>
        <StockActivity kind="sale" icon={ShoppingBag} title={labels.processedSold} kg={report.processedSoldKg} valueLabel={labels.salesTotal} amounts={report.processedSalesTotal} t={t}/>
        {report.hasRawSales && <StockActivity kind="raw-sale" icon={Wheat} title={labels.rawSold} kg={report.rawSoldKg} valueLabel={labels.salesTotal} amounts={report.rawSalesTotal} t={t}/>}
      </section>

      <section className="report-section">
        <h2>{labels.financialSummary}</h2>
        <table className="report-summary-table">
          <thead><tr><th scope="col">{labels.summaryItem}</th><th scope="col">{t.totalAmount}</th></tr></thead>
          <tbody>{financialRows.map(([label, amounts], index) => <tr key={label} className={index === financialRows.length - 1 ? 'report-total-row' : undefined}>
            <th scope="row">{label}{label === labels.costOfGoods && <small className="report-cogs-quantity">{labels.cogsQuantity}: <bdi>{format(report.soldKg, 3)} {t.statementKilo}</bdi> · <bdi>{format(report.soldKg / 50, 5)} {t.statementBag}</bdi></small>}</th>
            <td><CurrencyAmounts afn={format(amounts.AFN)} usd={format(amounts.USD)}/></td>
          </tr>)}</tbody>
        </table>
      </section>
      <p className="report-note">{labels.summaryNote}</p>
    </article>;
};

const StockActivity = ({ kind, icon: Icon, title, kg, valueLabel, amounts, t }) => <div className="report-stock-activity" data-kind={kind}>
  <div className="report-stock-heading"><h3><Icon aria-hidden="true"/>{title}</h3></div>
  <dl className="report-stock-metrics">
    <div><dt>{t.statementKilo}</dt><dd><bdi dir="ltr">{format(kg, 3)}</bdi></dd></div>
    <div><dt>{t.reporting.summaryBags}</dt><dd><bdi dir="ltr">{format(kg / 50, 5)}</bdi></dd></div>
    <div className="report-stock-value"><dt>{valueLabel}</dt><dd><CurrencyAmounts afn={format(amounts.AFN)} usd={format(amounts.USD)}/></dd></div>
  </dl>
</div>;

const CashTotal = ({ label, amounts, emphasized }) => <div className={`report-cash-total${emphasized ? ' report-cash-net' : ''}`}>
  <h2>{label}</h2>
  <div><bdi dir="ltr">{format(amounts.AFN)}</bdi><span>AFN</span></div>
  <div><bdi dir="ltr">{format(amounts.USD)}</bdi><span>USD</span></div>
</div>;
