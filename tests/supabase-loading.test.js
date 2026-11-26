import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { readAllRows } from '../src/lib/readAllRows.js';

const pagedQuery = (rows, cap, withCount = true) => {
    const offsets = [];
    return {
        offsets,
        async range(start, end) {
            offsets.push(start);
            return { data: rows.slice(start, Math.min(end + 1, start + cap)), error: null, count: withCount ? rows.length : null };
        },
    };
};

test('pagination reads every row when Supabase caps a 1000-row request at 10', async () => {
    const rows = Array.from({ length: 35 }, (_, id) => ({ id }));
    const query = pagedQuery(rows, 10);
    assert.deepEqual(await readAllRows(query), { data: rows, error: null });
    assert.deepEqual(query.offsets, [0, 10, 20, 30]);
});

test('pagination advances by actual rows and uses an empty page when no count is available', async () => {
    const rows = Array.from({ length: 25 }, (_, id) => ({ id }));
    const query = pagedQuery(rows, 10, false);
    assert.deepEqual((await readAllRows(query)).data, rows);
    assert.deepEqual(query.offsets, [0, 10, 20, 25]);
});

test('pagination handles empty tables and multiple full-size pages without duplicates', async () => {
    assert.deepEqual(await readAllRows(pagedQuery([], 10)), { data: [], error: null });
    const rows = Array.from({ length: 2400 }, (_, id) => ({ id }));
    const query = pagedQuery(rows, 1000);
    assert.deepEqual((await readAllRows(query)).data, rows);
    assert.deepEqual(query.offsets, [0, 1000, 2000]);
});

test('a later page failure returns an error instead of presenting a partial database', async () => {
    const error = { message: 'Connection interrupted' };
    const query = { range: async start => start ? { data: null, error } : { data: [{ id: 1 }], error: null } };
    assert.deepEqual(await readAllRows(query), { data: null, error });
    assert.ok((await readAllRows({ range: async () => ({ data: null, error: null }) })).error);
});

// Exercise the real browser data loader in Node, substituting only its Supabase
// client dependency. No network calls or live database credentials are used.
let loaderSequence = 0;
async function createLoader(tables) {
    const calls = [];
    let writes = 0;
    const client = {
        from(table) {
            let options;
            const query = {
                select(_columns, requestedOptions) { options = requestedOptions; return query; },
                order() { return query; }, eq() { return query; },
                async range(start, end) {
                    calls.push({ table, start });
                    const rows = tables[table] || [];
                    return { data: rows.slice(start, Math.min(end + 1, start + 10)), error: null, count: options?.count === 'exact' ? rows.length : null };
                },
                async maybeSingle() { return { data: { cash_in_hand: 0, cash_in_hand_usd: 0 }, error: null }; },
                upsert() { writes++; throw Error('Unexpected write during a read'); },
            };
            return query;
        },
    };
    const key = `supabase-loader-test-${++loaderSequence}`;
    globalThis[key] = client;
    let source = fs.readFileSync(new URL('../src/lib/supabaseData.js', import.meta.url), 'utf8');
    source = source.replace("import { supabase } from './supabase';", `const supabase = globalThis[${JSON.stringify(key)}];`)
        .replace(/from '(\.\/[^']+)'/g, (_, dependency) => `from '${new URL(`${dependency}.js`, new URL('../src/lib/supabaseData.js', import.meta.url)).href}'`);
    try {
        const { loadStateFromSupabase } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
        return { load: loadStateFromSupabase, calls, writes: () => writes };
    } finally { delete globalThis[key]; }
}

const supplierRow = {
    id: '01', name: 'بهاوللدین', phone: '0789206027',
    total_purchased_amount: '12130752.00', total_paid: '0.00', balance_owed: '11342052.00',
    goods_settled_amount: '788700.00', total_purchased_amount_usd: '0.00',
    total_paid_usd: '0.00', balance_owed_usd: '0.00', goods_settled_amount_usd: '0.00',
};

test('all supplier transactions load across capped pages and stay linked to exact IDs', async () => {
    const duplicate = { ...supplierRow, id: 'sup-generated-37861f', total_purchased_amount: 36000, balance_owed: 36000, goods_settled_amount: 0 };
    const tables = {
        suppliers: [supplierRow, duplicate, ...Array.from({ length: 12 }, (_, i) => ({ ...supplierRow, id: `other-${i}`, name: `Other ${i}` }))],
        supplier_transactions: Array.from({ length: 31 }, (_, i) => ({ id: `tx-${i}`, supplier_id: i === 0 ? duplicate.id : '01', type: 'purchase', amount: 100, date: '2026-11-24' })),
    };
    const loader = await createLoader(tables);
    const { state } = await loader.load();
    assert.equal(state.suppliers.length, 14);
    const main = state.suppliers.find(s => s.id === '01');
    assert.equal(main.totalPurchasedAmount, 12130752);
    assert.equal(main.balanceOwed, 11342052);
    assert.equal(main.goodsSettledAmount, 788700);
    assert.equal(main.transactions.length, 30);
    assert.equal(state.suppliers.find(s => s.id === duplicate.id).transactions.length, 1);
    assert.deepEqual(loader.calls.filter(c => c.table === 'supplier_transactions').map(c => c.start), [0, 10, 20, 30]);
    assert.equal(loader.writes(), 0);
});

test('reload reflects external edits and preserves stored balances and invoice payments without writes', async () => {
    const tables = {
        suppliers: [{ ...supplierRow }],
        customers: [{ id: 'c1', name: 'Buyer', total_purchased_amount: 1000, total_paid: 200, balance_owed: 777, credit_balance: 15 }],
        sales: [{ id: 'sale1', customer_id: 'c1', customer_name: 'Buyer', product_name: 'Feed', date: '2026-11-24', total_amount: 500, paid_amount: 100, remaining_amount: 400 }],
    };
    const loader = await createLoader(tables);
    await loader.load();
    tables.suppliers[0].total_purchased_amount = '12345000.00';
    tables.suppliers[0].balance_owed = '11556300.00';
    tables.supplier_transactions = [{ id: 'direct-insert', supplier_id: '01', type: 'payment', amount: 0, paid_amount: 100 }];
    const { state } = await loader.load();
    assert.equal(state.suppliers[0].totalPurchasedAmount, 12345000);
    assert.equal(state.suppliers[0].balanceOwed, 11556300);
    assert.equal(state.suppliers[0].transactions[0].id, 'direct-insert');
    assert.equal(state.customers[0].balanceOwed, 777);
    assert.equal(state.customers[0].creditBalance, 15);
    assert.equal(state.sales[0].paidAmount, 100);
    assert.equal(state.sales[0].remainingAmount, 400);
    assert.equal(loader.writes(), 0);
});
