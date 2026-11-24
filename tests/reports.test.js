import test from 'node:test';
import assert from 'node:assert/strict';
import { localDateValue, isValidRecordDate, normalizeRecordDate, reportDateRange, formatReportDate } from '../src/lib/recordDate.js';
import { buildReport } from '../src/lib/reportData.js';
import { translations } from '../src/translations/index.js';

test('date-only records keep the selected local day and reject impossible dates', () => {
    assert.equal(localDateValue(new Date(2026, 10, 24, 0, 5)), '2026-11-24');
    assert.equal(normalizeRecordDate('2026-01-01'), '2026-01-01');
    assert.equal(isValidRecordDate('2024-02-29'), true);
    for (const value of ['', '2026-02-29', '2026-11-31', '2026-13-01', '2026-1-01']) {
        assert.equal(isValidRecordDate(value), false, value);
        assert.throws(() => normalizeRecordDate(value));
    }
});

test('daily, seven-day, calendar-month and custom reports have inclusive boundaries', () => {
    assert.deepEqual(reportDateRange('daily', '2026-11-24'), { start: '2026-11-24', end: '2026-11-24', valid: true });
    assert.deepEqual(reportDateRange('weekly', '2026-01-03'), { start: '2025-12-28', end: '2026-01-03', valid: true });
    assert.deepEqual(reportDateRange('monthly', '', '2024-02'), { start: '2024-02-01', end: '2024-02-29', valid: true });
    assert.deepEqual(reportDateRange('monthly', '', '2026-12'), { start: '2026-12-01', end: '2026-12-31', valid: true });
    assert.equal(reportDateRange('custom', '', '', '2026-11-25', '2026-11-24').valid, false);
    assert.equal(reportDateRange('daily', '').valid, false);
    assert.deepEqual(reportDateRange('all'), { start: '', end: '', valid: true });
});

const date = '2026-11-24';
const fixture = {
    sales: [
        { id: 'sale', date, totalAmount: 300, currency: 'AFN', quantityKg: 150, totalCostOfGoods: 120, totalCostOfGoodsUsd: 1, items: [
            { productName: 'Feed A', unitType: 'bag', unitQuantity: 2, salePricePerUnit: 100, quantityKg: 100, totalAmount: 200 },
            { productName: 'Feed B', unitType: 'kg', unitQuantity: 50, salePricePerUnit: 2, quantityKg: 50, totalAmount: 100 },
        ] },
        { id: 'goods-sale', date, currency: 'USD', totalAmount: 20, totalCostOfGoods: 5, quantityKg: 50, productName: 'Feed C', unitType: 'bag', unitQuantity: 1, salePricePerUnit: 20 },
        { id: 'void-sale', date, totalAmount: 999, status: 'voided' },
        { id: 'before', date: '2026-11-23', totalAmount: 999 },
        { id: 'after', date: '2026-11-25', totalAmount: 999 },
    ],
    counterSales: [
        { id: 'counter', date, totalAmount: 10, currency: 'USD', totalCostOfGoodsUsd: 2, items: [{ stockType: 'raw', stockName: 'Wheat', unitType: 'ton', unitQuantity: 0.1, salePricePerUnit: 100 }] },
        { id: 'counter-void', date, totalAmount: 999, status: 'voided' },
    ],
    suppliers: [{ name: 'Supplier', transactions: [
        { id: 'purchase', type: 'purchase', date, quantityKg: 500, amount: 100, currency: 'AFN' },
        { id: 'goods-mirror', type: 'goods_settlement', date, amount: 20, currency: 'USD', sourceSaleId: 'goods-sale' },
        { id: 'void-purchase', type: 'purchase', date, amount: 999, status: 'voided' },
        { id: 'reversed-purchase', type: 'purchase', date, amount: 999, status: 'reversed' },
        { id: 'payment', type: 'payment', date, amount: 999 },
    ] }],
    customers: [{ name: 'Customer', transactions: [
        { id: 'raw-settlement', type: 'raw_goods_settlement', date, amount: 5, quantityKg: 25, currency: 'USD' },
        { id: 'sale-mirror', type: 'sale', date, amount: 300, sourceSaleId: 'sale' },
    ] }],
    rawMaterialPurchases: [{ id: 'unassigned', date, amount: 40, quantityKg: 200, currency: 'AFN' }],
    expenses: [{ id: 'expense', date, amount: 30, currency: 'AFN' }, { id: 'usd-expense', date, amount: 3, currency: 'USD' }],
};

test('reports sum itemized and counter sales, purchases and expenses without double counting or currency conversion', () => {
    const original = structuredClone(fixture);
    const report = buildReport(fixture, reportDateRange('daily', date));
    assert.deepEqual(report.revenue, { AFN: 300, USD: 30 });
    assert.deepEqual(report.purchaseTotal, { AFN: 140, USD: 5 });
    assert.deepEqual(report.expenseTotal, { AFN: 30, USD: 3 });
    assert.deepEqual(report.cogs, { AFN: 125, USD: 3 });
    assert.deepEqual(report.grossProfit, { AFN: 175, USD: 27 });
    assert.deepEqual(report.netProfit, { AFN: 145, USD: 24 });
    assert.equal(report.sales.length, 3);
    assert.equal(report.saleLines.length, 4);
    assert.equal(report.soldKg, 300);
    assert.equal(report.processedSoldKg, 200);
    assert.equal(report.rawSoldKg, 100);
    assert.deepEqual(report.processedSalesTotal, { AFN: 300, USD: 20 });
    assert.deepEqual(report.rawSalesTotal, { AFN: 0, USD: 10 });
    assert.equal(report.purchasedKg, 725);
    assert.equal(report.saleLines.find(line => line.id === 'counter-0').productName, 'Wheat');
    assert.equal(report.saleLines.find(line => line.id === 'counter-0').stockType, 'raw');
    assert.equal(report.saleLines.reduce((sum, line) => sum + line.totalAmount, 0), 330);
    assert.deepEqual(fixture, original);
});

test('stock summary combines production and purchases with separately valued raw and processed sales', () => {
    const report = buildReport({
        productionBatches: [
            { id: 'batch', date, totalWeightKg: 1000, totalCost: 28000, totalCostUsd: 12 },
            { id: 'older', date: '2026-11-23', totalWeightKg: 9000, totalCost: 99999 },
            { id: 'void', date, totalWeightKg: 999, totalCost: 999, status: 'voided' },
        ],
        rawMaterialPurchases: [{ id: 'purchase', date, unitType: 'ton', unitQuantity: 2, amount: 75000, currency: 'AFN' }],
        sales: [{ id: 'legacy', date, productName: 'Feed', unitType: 'bag', unitQuantity: 3, totalAmount: 4500, currency: 'AFN' }],
        counterSales: [{ id: 'mixed', date, totalAmount: 1, currency: 'USD', items: [
            { stockType: 'raw', stockName: 'Wheat', unitType: 'kg', unitQuantity: 1, salePricePerUnit: 0.333 },
            { stockType: 'processed', stockName: 'Feed', unitType: 'bag', unitQuantity: 1, salePricePerUnit: 0.666 },
        ] }],
    }, reportDateRange('daily', date));
    assert.equal(report.producedKg, 1000);
    assert.deepEqual(report.productionCost, { AFN: 28000, USD: 12 });
    assert.equal(report.purchasedKg, 2000);
    assert.deepEqual(report.purchaseTotal, { AFN: 75000, USD: 0 });
    assert.equal(report.processedSoldKg, 200);
    assert.equal(report.rawSoldKg, 1);
    assert.deepEqual(report.processedSalesTotal, { AFN: 4500, USD: 0.67 });
    assert.deepEqual(report.rawSalesTotal, { AFN: 0, USD: 0.33 });
    assert.equal(report.hasRawSales, true);
    const empty = buildReport({}, reportDateRange('all'));
    assert.equal(empty.hasRawSales, false);
    assert.equal(empty.processedSoldKg, 0);
    assert.deepEqual(empty.productionCost, { AFN: 0, USD: 0 });
});

test('Pashto supplier debt labels clearly say the debt is owed by us', () => {
    assert.equal(translations.ps.remainingOwedToSupplier, 'په مونږه پاتې پور');
    assert.equal(translations.ps.balanceOwedToSupplier, 'په مونږه پاتې پور');
});

test('empty or invalid periods show zero totals and all-time reports include records beyond today', () => {
    assert.equal(buildReport(fixture, { start: '2020-01-01', end: '2020-01-02', valid: true }).sales.length, 0);
    assert.equal(buildReport(fixture, { valid: false }).sales.length, 0);
    assert.equal(buildReport(fixture, reportDateRange('all')).sales.length, 5);
    assert.deepEqual(buildReport({}, reportDateRange('all')).netProfit, { AFN: 0, USD: 0 });
});

test('every report label and transaction date label exists in all three languages', () => {
    for (const lang of ['en', 'fa', 'ps']) {
        assert.ok(translations[lang].transactionDate);
        assert.equal(translations[lang].reporting.monthNames.length, 12);
        for (const key of Object.keys(translations.en.reporting)) assert.ok(translations[lang].reporting[key], `${lang}.${key}`);
    }
});

test('all report languages use English date digits with translated month names', () => {
    assert.equal(formatReportDate('2026-11-24', 'en', translations.en), '24 November 2026');
    for (const lang of ['fa', 'ps']) {
        assert.equal(formatReportDate('2026-11-24', lang, translations[lang]), '24 نومبر 2026');
    }
});

test('cash totals count payments on their own dates without invoice mirrors or non-cash offsets', () => {
    const report = buildReport({
        sales: [
            { id: 'sale', date, currency: 'AFN', totalAmount: 1000, paidAmount: 900, cashAmount: 200 },
            { id: 'offset', date, currency: 'AFN', totalAmount: 500, paidAmount: 500, paymentMethod: 'supplier_balance_offset' },
            { id: 'credit', date, currency: 'AFN', totalAmount: 100, paidAmount: 100, cashAmount: 0 },
        ],
        counterSales: [{ id: 'counter', date, currency: 'USD', totalAmount: 80, cashAmount: 30 }],
        suppliers: [{ transactions: [
            { id: 'purchase', type: 'purchase', date, currency: 'AFN', amount: 2000, paidAmount: 600, cashAmount: 600 },
            { id: 'payment', type: 'payment', date, currency: 'AFN', cashAmount: 50 },
            { id: 'void-payment', type: 'payment', date, currency: 'AFN', cashAmount: 999, status: 'voided' },
        ] }],
        customers: [{ transactions: [
            { id: 'mirror', type: 'sale', date, currency: 'AFN', cashAmount: 200 },
            { id: 'payment', type: 'payment', date, currency: 'AFN', cashAmount: 70 },
            { id: 'earlier', type: 'payment', date: '2026-11-23', currency: 'AFN', cashAmount: 999 },
            { id: 'cash-given', type: 'cash_given', date, currency: 'AFN', cashAmount: 20 },
            { id: 'transport', type: 'transport_fee', date, currency: 'USD', cashAmount: 2 },
            { id: 'goods', type: 'raw_goods_settlement', date, currency: 'USD', amount: 400, paidAmount: 400, cashAmount: 0 },
        ] }],
        counterCustomers: [{ transactions: [
            { id: 'counter-mirror', type: 'sale', date, currency: 'USD', cashAmount: 30 },
            { id: 'counter-payment', type: 'payment', date, currency: 'USD', paidAmount: 5 },
            { id: 'refund', type: 'adjustment', date, currency: 'USD', cashAmount: 3 },
        ] }],
        rawMaterialPurchases: [{ id: 'anonymous', date, currency: 'USD', amount: 100, paidAmount: 10 }],
        expenses: [{ id: 'expense', date, currency: 'AFN', amount: 25 }],
    }, reportDateRange('daily', date));
    assert.deepEqual(report.moneyIn, { AFN: 270, USD: 35 });
    assert.deepEqual(report.moneyOut, { AFN: 695, USD: 15 });
    assert.deepEqual(report.netCashFlow, { AFN: -425, USD: 20 });
    assert.deepEqual(report.revenue, { AFN: 1600, USD: 80 });
    assert.deepEqual(report.purchaseTotal, { AFN: 2000, USD: 500 });
});
