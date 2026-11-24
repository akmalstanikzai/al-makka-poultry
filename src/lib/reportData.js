import { getSaleLineItems } from './saleLineItems.js';

const number = value => Number(value) || 0;
const active = record => (record.status || 'active') === 'active';
const sumMoney = (records, field) => records.reduce((sum, record) => {
    sum[record.currency === 'USD' ? 'USD' : 'AFN'] += number(record[field]);
    return sum;
}, { AFN: 0, USD: 0 });
const sortByDate = records => records.sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.id).localeCompare(String(b.id)));
const weight = record => number(record.quantityKg ?? record.totalQuantityKg) || getSaleLineItems(record).reduce((sum, item) => sum + item.quantityKg, 0);

export const buildReport = (db, range) => {
    const included = record => range.valid && active(record) && (!range.start || record.date >= range.start) && (!range.end || record.date <= range.end);
    // Sales already include supplier goods settlements. Their ledger mirrors
    // must never be counted as a second sale.
    const sales = sortByDate([...(db.sales || []), ...(db.counterSales || [])].filter(included));
    const saleLines = sales.flatMap(sale => {
        const items = getSaleLineItems(sale);
        return (items.length ? items : [{ productName: sale.productName, quantityKg: weight(sale), totalAmount: number(sale.totalAmount) }]).map((item, index) => ({
            ...item,
            productName: sale.items?.[index]?.stockName || item.productName,
            stockType: sale.items?.[index]?.stockType || 'processed',
            id: `${sale.id}-${index}`, date: sale.date, billNumber: sale.billNumber,
            partyName: sale.customerName, currency: sale.currency || 'AFN',
        }));
    });
    const purchases = sortByDate([
        ...(db.suppliers || []).flatMap(party => (party.transactions || []).filter(tx => tx.type === 'purchase').map(tx => ({ ...tx, partyName: party.name }))),
        ...(db.customers || []).flatMap(party => (party.transactions || []).filter(tx => tx.type === 'raw_goods_settlement').map(tx => ({ ...tx, partyName: party.name }))),
        ...(db.rawMaterialPurchases || []),
    ].filter(included));
    const expenses = sortByDate([...(db.expenses || [])].filter(included));
    const batches = (db.productionBatches || []).filter(included);
    const revenue = sumMoney(sales, 'totalAmount');
    const purchaseTotal = sumMoney(purchases, 'amount');
    const expenseTotal = sumMoney(expenses, 'amount');
    const cogs = sales.reduce((sum, sale) => ({ AFN: sum.AFN + number(sale.totalCostOfGoods), USD: sum.USD + number(sale.totalCostOfGoodsUsd) }), { AFN: 0, USD: 0 });
    const grossProfit = { AFN: revenue.AFN - cogs.AFN, USD: revenue.USD - cogs.USD };
    return {
        sales, saleLines, purchases, expenses, batches, revenue, purchaseTotal, expenseTotal, cogs, grossProfit,
        netProfit: { AFN: grossProfit.AFN - expenseTotal.AFN, USD: grossProfit.USD - expenseTotal.USD },
        soldKg: sales.reduce((sum, sale) => sum + weight(sale), 0),
        purchasedKg: purchases.reduce((sum, purchase) => sum + number(purchase.quantityKg), 0),
        producedKg: batches.reduce((sum, batch) => sum + number(batch.totalWeightKg), 0),
    };
};
