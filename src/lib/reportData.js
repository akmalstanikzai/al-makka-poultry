import { getSaleLineItems } from './saleLineItems.js';

const number = value => Number(value) || 0;
const active = record => (record.status || 'active') === 'active';
const sumMoney = (records, field) => records.reduce((sum, record) => {
    sum[record.currency === 'USD' ? 'USD' : 'AFN'] += number(record[field]);
    return sum;
}, { AFN: 0, USD: 0 });
const sortByDate = records => records.sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.id).localeCompare(String(b.id)));
const lineWeight = item => number(item.quantityKg) || number(item.unitQuantity) * (item.unitType === 'ton' ? 1000 : item.unitType === 'bag' ? 50 : 1);
const weight = record => number(record.quantityKg ?? record.totalQuantityKg) || getSaleLineItems(record).reduce((sum, item) => sum + lineWeight(item), 0);

export const buildReport = (db, range) => {
    const included = record => range.valid && active(record) && (!range.start || record.date >= range.start) && (!range.end || record.date <= range.end);
    // Sales already include supplier goods settlements. Their ledger mirrors
    // must never be counted as a second sale.
    const sales = sortByDate([...(db.sales || []), ...(db.counterSales || [])].filter(included));
    const saleLines = sales.flatMap(sale => {
        const items = getSaleLineItems(sale);
        return (items.length ? items : [{ productName: sale.productName, quantityKg: weight(sale), totalAmount: number(sale.totalAmount) }]).map((item, index) => ({
            ...item,
            quantityKg: lineWeight(item),
            productName: sale.items?.[index]?.stockName || item.productName,
            stockType: sale.items?.[index]?.stockType || 'processed',
            id: `${sale.id}-${index}`, date: sale.date, billNumber: sale.billNumber,
            partyName: sale.customerName, currency: sale.currency || 'AFN',
        }));
    });
    const processedSaleLines = saleLines.filter(line => line.stockType === 'processed');
    const rawSaleLines = saleLines.filter(line => line.stockType === 'raw');
    const salesByStock = { processed: { AFN: 0, USD: 0 }, raw: { AFN: 0, USD: 0 } };
    // Allocate each invoice once, preserving its saved total even when line
    // calculations have extra decimal places. Ordinary sales are processed feed.
    for (const sale of sales) {
        const items = Array.isArray(sale.items) && sale.items.length ? sale.items : [];
        const lines = getSaleLineItems(sale);
        const lineTotal = lines.reduce((sum, line) => sum + line.totalAmount, 0);
        const rawTotal = lines.reduce((sum, line, index) => sum + (items[index]?.stockType === 'raw' ? line.totalAmount : 0), 0);
        const total = number(sale.totalAmount);
        const code = sale.currency === 'USD' ? 'USD' : 'AFN';
        const rawAmount = rawTotal <= 0 ? 0 : rawTotal >= lineTotal ? total
            : Math.min(total, Math.max(0, Math.round(total * rawTotal / lineTotal * 100) / 100));
        salesByStock.raw[code] += rawAmount;
        salesByStock.processed[code] += rawAmount === 0 ? total : rawAmount === total ? 0 : Number((total - rawAmount).toFixed(2));
    }
    const purchases = sortByDate([
        ...(db.suppliers || []).flatMap(party => (party.transactions || []).filter(tx => tx.type === 'purchase').map(tx => ({ ...tx, partyName: party.name }))),
        ...(db.customers || []).flatMap(party => (party.transactions || []).filter(tx => tx.type === 'raw_goods_settlement').map(tx => ({ ...tx, partyName: party.name }))),
        ...(db.rawMaterialPurchases || []),
    ].filter(included));
    const expenses = sortByDate([...(db.expenses || [])].filter(included));
    const batches = (db.productionBatches || []).filter(included);
    const productionCost = batches.reduce((sum, batch) => ({
        AFN: sum.AFN + number(batch.totalCost),
        USD: sum.USD + number(batch.totalCostUsd),
    }), { AFN: 0, USD: 0 });
    const revenue = sumMoney(sales, 'totalAmount');
    const purchaseTotal = sumMoney(purchases, 'amount');
    const expenseTotal = sumMoney(expenses, 'amount');
    const cogs = sales.reduce((sum, sale) => ({ AFN: sum.AFN + number(sale.totalCostOfGoods), USD: sum.USD + number(sale.totalCostOfGoodsUsd) }), { AFN: 0, USD: 0 });
    const grossProfit = { AFN: revenue.AFN - cogs.AFN, USD: revenue.USD - cogs.USD };
    // Cash follows payment dates, independently of invoice value. Ledger
    // mirrors and goods offsets must not be counted as cash a second time.
    const customerPayments = [...(db.customers || []), ...(db.counterCustomers || [])]
        .flatMap(party => party.transactions || []).filter(included);
    const supplierPayments = (db.suppliers || []).flatMap(party => party.transactions || [])
        .filter(tx => tx.type === 'payment' && included(tx));
    const cashAmount = record => number(record.cashAmount ?? record.paidAmount);
    const moneyIn = sumMoney([
        ...sales.filter(sale => sale.paymentMethod !== 'supplier_balance_offset'),
        ...customerPayments.filter(tx => tx.type === 'payment'),
    ].map(record => ({ ...record, cash: cashAmount(record) })), 'cash');
    const paidOut = sumMoney([
        ...purchases.filter(purchase => purchase.type !== 'raw_goods_settlement'),
        ...supplierPayments,
        ...customerPayments.filter(tx => ['cash_given', 'transport_fee', 'adjustment'].includes(tx.type)),
    ].map(record => ({ ...record, cash: cashAmount(record) })), 'cash');
    const moneyOut = { AFN: paidOut.AFN + expenseTotal.AFN, USD: paidOut.USD + expenseTotal.USD };
    return {
        sales, saleLines, purchases, expenses, batches, revenue, purchaseTotal, expenseTotal, cogs, grossProfit,
        netProfit: { AFN: grossProfit.AFN - expenseTotal.AFN, USD: grossProfit.USD - expenseTotal.USD },
        moneyIn, moneyOut,
        netCashFlow: { AFN: moneyIn.AFN - moneyOut.AFN, USD: moneyIn.USD - moneyOut.USD },
        processedSalesTotal: salesByStock.processed,
        rawSalesTotal: salesByStock.raw,
        processedSoldKg: processedSaleLines.reduce((sum, line) => sum + number(line.quantityKg), 0),
        rawSoldKg: rawSaleLines.reduce((sum, line) => sum + number(line.quantityKg), 0),
        hasRawSales: rawSaleLines.length > 0,
        productionCost,
        soldKg: sales.reduce((sum, sale) => sum + weight(sale), 0),
        purchasedKg: purchases.reduce((sum, purchase) => sum + lineWeight(purchase), 0),
        producedKg: batches.reduce((sum, batch) => sum + number(batch.totalWeightKg), 0),
    };
};
