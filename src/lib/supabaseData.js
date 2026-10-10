import { supabase } from './supabase';
let writeQueue = Promise.resolve();
function reportDatabaseError(message) {
    console.error(message);
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('supabase-database-error', {
            detail: String(message),
        }));
    }
}
async function checked(operation, label) {
    const { error } = await operation;
    if (error) {
        const message = `${label}: ${error.message}`;
        reportDatabaseError(message);
        throw new Error(message);
    }
}
function queueWrite(operation) {
    const next = writeQueue.then(operation);
    writeQueue = next.catch(() => undefined);
    return next;
}
const DEFAULT_CASH_IN_HAND = 0;

export async function loadFactorySettings() {
    if (!supabase)
        return null;
    const { data, error } = await supabase
        .from('factory_settings')
        .select('data')
        .eq('key', 'inventory')
        .maybeSingle();
    if (error) {
        reportDatabaseError(`Could not load factory settings: ${error.message}`);
        return null;
    }
    const threshold = Number(data?.data?.lowStockThreshold);
    return Number.isFinite(threshold) && threshold > 0
        ? { lowStockThreshold: threshold }
        : null;
}

export async function saveLowStockThreshold(lowStockThreshold) {
    if (!supabase)
        return false;
    try {
        await checked(supabase.from('factory_settings').upsert({
            key: 'inventory',
            data: { lowStockThreshold },
            updated_at: new Date().toISOString(),
        }), 'factory settings save');
        return true;
    }
    catch (error) {
        reportDatabaseError(`Could not save factory settings: ${error.message}`);
        return false;
    }
}
/**
 * Cash is a value in its own right, rather than something that can safely be
 * reconstructed from a partial transaction history.  The table was added
 * after the first version of the app, so a missing table is deliberately
 * treated as a backwards-compatible fallback while the SQL migration is run.
 */
async function loadCashInHand() {
    if (!supabase)
        return null;
    const { data, error } = await supabase
        .from('factory_state')
        .select('cash_in_hand, cash_in_hand_usd')
        .eq('id', 'default')
        .maybeSingle();
    if (error) {
        // The rest of the business data must remain available on databases that
        // have not yet run the migration.
        console.warn('factory_state is not available yet:', error.message);
        return null;
    }
    const value = Number(data?.cash_in_hand);
    const usdValue = Number(data?.cash_in_hand_usd);
    return Number.isFinite(value) ? { AFN: value, USD: Number.isFinite(usdValue) ? usdValue : 0 } : null;
}
async function saveCashInHand(cashInHand, cashInHandUsd = 0) {
    if (!supabase)
        return;
    const { error } = await supabase.from('factory_state').upsert({
        id: 'default',
        cash_in_hand: cashInHand,
        cash_in_hand_usd: cashInHandUsd,
        updated_at: new Date().toISOString(),
    });
    if (error) {
        // This is optional until the included migration is installed.  Do not
        // prevent the rest of the state from being saved in the meantime.
        console.warn('factory_state could not be saved:', error.message);
    }
}
/**
 * Loads the complete database state from Supabase tables.
 */
export async function loadStateFromSupabase() {
    if (!supabase)
        return null;
    try {
        const [rawRes, supRes, supTxRes, custRes, custTxRes, procRes, salesRes, expRes, formRes, batchRes] = await Promise.all([
            supabase.from('raw_materials').select('*'),
            supabase.from('suppliers').select('*'),
            supabase.from('supplier_transactions').select('*'),
            supabase.from('customers').select('*'),
            supabase.from('customer_transactions').select('*'),
            supabase.from('processed_stock').select('*'),
            supabase.from('sales').select('*').order('date', { ascending: false }),
            supabase.from('expenses').select('*').order('date', { ascending: false }),
            supabase.from('formulas').select('*'),
            supabase.from('production_batches').select('*').order('date', { ascending: false }),
        ]);
        const queryResults = [
            rawRes,
            supRes,
            supTxRes,
            custRes,
            custTxRes,
            procRes,
            salesRes,
            expRes,
            formRes,
            batchRes,
        ];
        const failedQuery = queryResults.find(result => result.error);
        if (failedQuery?.error) {
            reportDatabaseError(`Supabase read failed: ${failedQuery.error.message}`);
            return null;
        }
        const rawMaterials = (rawRes.data || []).map(r => ({
            id: r.id,
            name: r.name,
            category: r.category || 'Grains',
            stockKg: Number(r.stock_kg) || 0,
            unitPrice: Number(r.unit_price) || 0,
            currency: r.currency || 'AFN',
            supplierId: r.supplier_id || undefined,
            supplierName: r.supplier_name || undefined,
            customerId: r.customer_id || undefined,
            dateAdded: r.date_added || new Date().toISOString().split('T')[0],
            notes: r.notes || undefined,
            lowStockThreshold: r.low_stock_threshold ? Number(r.low_stock_threshold) : undefined,
        }));
        const supplierTransactions = supTxRes.data || [];
        const suppliers = (supRes.data || []).map(s => ({
            id: s.id,
            name: s.name,
            phone: s.phone || '',
            address: s.address || '',
            totalPurchasedAmount: Number(s.total_purchased_amount) || 0,
            totalPurchasedAmountUsd: Number(s.total_purchased_amount_usd) || 0,
            totalPaid: Number(s.total_paid) || 0,
            totalPaidUsd: Number(s.total_paid_usd) || 0,
            goodsSettledAmount: Number(s.goods_settled_amount) || 0,
            goodsSettledAmountUsd: Number(s.goods_settled_amount_usd) || 0,
            balanceOwed: Number(s.balance_owed) || 0,
            balanceOwedUsd: Number(s.balance_owed_usd) || 0,
            createdAt: s.created_at || '',
            transactions: supplierTransactions
                .filter(tx => tx.supplier_id === s.id)
                .map(tx => ({
                id: tx.id,
                rawMaterialId: tx.raw_material_id || undefined,
                date: tx.date,
                type: tx.type,
                description: tx.description,
                amount: Number(tx.amount) || 0,
                paidAmount: Number(tx.paid_amount) || 0,
                remainingAmount: Number(tx.remaining_amount) || 0,
                currency: tx.currency || 'AFN',
            })),
        }));
        const customerTransactions = custTxRes.data || [];
        const customers = (custRes.data || []).map(c => ({
            id: c.id,
            name: c.name,
            phone: c.phone || '',
            address: c.address || '',
            totalPurchasedAmount: Number(c.total_purchased_amount) || 0,
            totalPurchasedAmountUsd: Number(c.total_purchased_amount_usd) || 0,
            totalPaid: Number(c.total_paid) || 0,
            totalPaidUsd: Number(c.total_paid_usd) || 0,
            rawSettledAmount: Number(c.raw_settled_amount) || 0,
            rawSettledAmountUsd: Number(c.raw_settled_amount_usd) || 0,
            balanceOwed: Number(c.balance_owed) || 0,
            balanceOwedUsd: Number(c.balance_owed_usd) || 0,
            createdAt: c.created_at || '',
            transactions: customerTransactions
                .filter(tx => tx.customer_id === c.id)
                .map(tx => ({
                id: tx.id,
                date: tx.date,
                type: tx.type,
                description: tx.description,
                amount: Number(tx.amount) || 0,
                paidAmount: Number(tx.paid_amount) || 0,
                remainingAmount: Number(tx.remaining_amount) || 0,
                currency: tx.currency || 'AFN',
            })),
        }));
        const processedStock = (procRes.data || []).map(p => ({
            id: p.id,
            name: p.name,
            formulaId: p.formula_id || undefined,
            stockKg: Number(p.stock_kg) || 0,
            averageCostPerKg: Number(p.average_cost_per_kg) || 0,
            averageCostPerKgUsd: Number(p.average_cost_per_kg_usd) || 0,
            currency: p.currency || 'AFN',
            lastUpdated: p.last_updated || new Date().toISOString().split('T')[0],
        }));
        const sales = (salesRes.data || []).map(s => ({
            id: s.id,
            date: s.date,
            customerId: s.customer_id || '',
            customerName: s.customer_name,
            customerPhone: s.customer_phone || undefined,
            productId: s.product_id || '',
            productName: s.product_name,
            unitType: s.unit_type || 'bag',
            unitQuantity: Number(s.unit_quantity) || 0,
            quantityKg: Number(s.quantity_kg) || 0,
            salePricePerUnit: Number(s.sale_price_per_unit) || 0,
            totalAmount: Number(s.total_amount) || 0,
            costRatePerKg: Number(s.quantity_kg) > 0 ? (Number(s.total_cost_of_goods) || 0) / Number(s.quantity_kg) : 30,
            totalCostOfGoods: Number(s.total_cost_of_goods) || 0,
            totalCostOfGoodsUsd: Number(s.total_cost_of_goods_usd) || 0,
            profit: Number(s.profit) || 0,
            profitUsd: Number(s.profit_usd) || 0,
            paidAmount: Number(s.paid_amount) || 0,
            remainingAmount: Number(s.remaining_amount) || 0,
            notes: s.notes || undefined,
            currency: s.currency || 'AFN',
        }));
        // Customer totals may already include payments from an older app
        // version that failed before updating the sales table. Reconstruct the
        // invoice paid/remaining values oldest-first so both pages agree.
        let salesReconciliationNeeded = false;
        customers.forEach(customer => {
            ['AFN', 'USD'].forEach(currency => {
                let paidToAllocate = currency === 'USD'
                    ? customer.totalPaidUsd + customer.rawSettledAmountUsd
                    : customer.totalPaid + customer.rawSettledAmount;
                sales
                    .filter(sale => (sale.currency || 'AFN') === currency && (sale.customerId === customer.id || (!sale.customerId && (sale.customerName.trim().toLowerCase() === customer.name.trim().toLowerCase() || (customer.phone && sale.customerPhone === customer.phone)))))
                    .sort((first, second) => first.date.localeCompare(second.date))
                    .forEach(sale => {
                        const invoicePaid = Math.min(paidToAllocate, sale.totalAmount);
                        if (sale.paidAmount !== invoicePaid || sale.remainingAmount !== Math.max(0, sale.totalAmount - invoicePaid)) salesReconciliationNeeded = true;
                        sale.paidAmount = invoicePaid;
                        sale.remainingAmount = Math.max(0, sale.totalAmount - invoicePaid);
                        paidToAllocate -= invoicePaid;
                    });
            });
        });
        const expenses = (expRes.data || []).map(e => ({
            id: e.id,
            date: e.date,
            category: e.category,
            description: e.description,
            amount: Number(e.amount) || 0,
            paidBy: e.paid_by || undefined,
            notes: e.notes || undefined,
            currency: e.currency || 'AFN',
        }));
        const formulas = (formRes.data || []).map(f => {
            const ings = Array.isArray(f.ingredients) ? f.ingredients : [];
            const totalWeight = ings.reduce((acc, ing) => acc + (Number(ing.weightKg) || 0), 0);
            const totalCost = ings.filter(ing => (ing.currency || 'AFN') === 'AFN').reduce((acc, ing) => acc + (Number(ing.totalCost) || 0), 0);
            const totalCostUsd = ings.filter(ing => ing.currency === 'USD').reduce((acc, ing) => acc + (Number(ing.totalCost) || 0), 0);
            return {
                id: f.id,
                name: f.name,
                description: f.description || undefined,
                ingredients: ings,
                totalWeightKg: totalWeight,
                totalBatchCost: totalCost,
                totalBatchCostUsd: totalCostUsd,
                costPerKg: totalWeight > 0 ? totalCost / totalWeight : 0,
                costPerKgUsd: totalWeight > 0 ? totalCostUsd / totalWeight : 0,
                createdDate: f.date_created || '',
            };
        });
        const productionBatches = (batchRes.data || []).map(b => ({
            id: b.id,
            formulaId: b.formula_id || '',
            formulaName: b.formula_name || '',
            date: b.date,
            totalWeightKg: Number(b.total_weight_kg) || 0,
            costPerKg: Number(b.cost_per_kg) || 0,
            costPerKgUsd: Number(b.cost_per_kg_usd) || 0,
            totalCost: Number(b.total_cost) || 0,
            totalCostUsd: Number(b.total_cost_usd) || 0,
            operatorName: b.operator_name || undefined,
            notes: b.notes || undefined,
            currency: b.currency || 'AFN',
        }));
        const persistedCash = await loadCashInHand();
        const hasData = [
            rawMaterials,
            processedStock,
            suppliers,
            customers,
            formulas,
            productionBatches,
            sales,
            expenses,
        ].some(items => items.length > 0);
        return {
            hasData,
            salesReconciliationNeeded,
            state: {
                rawMaterials,
                processedStock,
                suppliers,
                customers,
                formulas,
                productionBatches,
                sales,
                expenses,
                // Old installations did not persist cash separately.  Keep a
                // sensible value until the included factory_state migration runs.
                cashInHand: persistedCash?.AFN ?? DEFAULT_CASH_IN_HAND,
                cashInHandUsd: persistedCash?.USD ?? 0,
            },
        };
    }
    catch (err) {
        reportDatabaseError(`Failed to load state from Supabase: ${err.message || err}`);
        return null;
    }
}
/**
 * Seeds initial factory data to Supabase if tables are newly created and empty.
 */
export async function writeStateToSupabase(state) {
    if (!supabase)
        return false;
    return queueWrite(async () => {
        // Parents are always written before their dependants. This matters when
        // foreign keys are enabled and fixes writes that previously failed only
        // after a page refresh.
        // 1. Suppliers & Transactions
        if (state.suppliers.length > 0) {
            const supRows = state.suppliers.map(s => ({
                id: s.id,
                name: s.name,
                phone: s.phone || null,
                address: s.address || null,
                total_purchased_amount: s.totalPurchasedAmount,
                total_purchased_amount_usd: s.totalPurchasedAmountUsd || 0,
                total_paid: s.totalPaid,
                total_paid_usd: s.totalPaidUsd || 0,
                goods_settled_amount: s.goodsSettledAmount || 0,
                goods_settled_amount_usd: s.goodsSettledAmountUsd || 0,
                balance_owed: s.balanceOwed,
                balance_owed_usd: s.balanceOwedUsd || 0,
                created_at: s.createdAt,
            }));
            await checked(supabase.from('suppliers').upsert(supRows), 'suppliers seed');
            const txRows = state.suppliers.flatMap(s => s.transactions.map(t => ({
                id: t.id,
                supplier_id: s.id,
                raw_material_id: t.rawMaterialId || null,
                date: t.date,
                type: t.type,
                description: t.description,
                amount: t.amount,
                paid_amount: t.paidAmount,
                remaining_amount: t.remainingAmount,
                currency: t.currency || 'AFN',
            })));
            if (txRows.length > 0) {
                await checked(supabase.from('supplier_transactions').upsert(txRows), 'supplier_transactions seed');
            }
        }
        // 2. Raw Materials (may reference a supplier)
        if (state.rawMaterials.length > 0) {
            const rows = state.rawMaterials.map(rm => ({
                id: rm.id,
                name: rm.name,
                category: rm.category,
                stock_kg: rm.stockKg,
                unit_price: rm.unitPrice,
                currency: rm.currency || 'AFN',
                supplier_id: rm.supplierId || null,
                supplier_name: rm.supplierName || null,
                customer_id: rm.customerId || null,
                date_added: rm.dateAdded,
                notes: rm.notes || null,
                low_stock_threshold: rm.lowStockThreshold || 5000,
            }));
            await checked(supabase.from('raw_materials').upsert(rows), 'raw_materials seed');
        }
        // 3. Customers & Transactions (sales reference customers)
        if (state.customers.length > 0) {
            const custRows = state.customers.map(c => ({
                id: c.id,
                name: c.name,
                phone: c.phone || null,
                address: c.address || null,
                total_purchased_amount: c.totalPurchasedAmount,
                total_purchased_amount_usd: c.totalPurchasedAmountUsd || 0,
                total_paid: c.totalPaid,
                total_paid_usd: c.totalPaidUsd || 0,
                raw_settled_amount: c.rawSettledAmount || 0,
                raw_settled_amount_usd: c.rawSettledAmountUsd || 0,
                balance_owed: c.balanceOwed,
                balance_owed_usd: c.balanceOwedUsd || 0,
                created_at: c.createdAt,
            }));
            await checked(supabase.from('customers').upsert(custRows), 'customers seed');
            const custTxRows = state.customers.flatMap(c => c.transactions.map(t => ({
                id: t.id,
                customer_id: c.id,
                date: t.date,
                type: t.type,
                description: t.description,
                amount: t.amount,
                paid_amount: t.paidAmount,
                remaining_amount: t.remainingAmount,
                currency: t.currency || 'AFN',
            })));
            if (custTxRows.length > 0) {
                await checked(supabase.from('customer_transactions').upsert(custTxRows), 'customer_transactions seed');
            }
        }
        // 4. Formulas (processed stock and batches may reference formulas)
        if (state.formulas.length > 0) {
            const formRows = state.formulas.map(f => ({
                id: f.id,
                name: f.name,
                description: f.description || null,
                ingredients: f.ingredients,
                date_created: f.createdDate,
            }));
            await checked(supabase.from('formulas').upsert(formRows), 'formulas seed');
        }
        // 5. Production Batches
        if (state.productionBatches.length > 0) {
            const batchRows = state.productionBatches.map(b => ({
                id: b.id,
                formula_id: b.formulaId || null,
                formula_name: b.formulaName,
                date: b.date,
                total_weight_kg: b.totalWeightKg,
                cost_per_kg: b.costPerKg,
                cost_per_kg_usd: b.costPerKgUsd || 0,
                total_cost: b.totalCost,
                total_cost_usd: b.totalCostUsd || 0,
                operator_name: b.operatorName || null,
                notes: b.notes || null,
                currency: b.currency || 'AFN',
            }));
            await checked(supabase.from('production_batches').upsert(batchRows), 'production_batches seed');
        }
        // 6. Processed Stock
        if (state.processedStock.length > 0) {
            const procRows = state.processedStock.map(p => ({
                id: p.id,
                name: p.name,
                formula_id: p.formulaId || null,
                stock_kg: p.stockKg,
                average_cost_per_kg: p.averageCostPerKg,
                average_cost_per_kg_usd: p.averageCostPerKgUsd || 0,
                currency: p.currency || 'AFN',
                last_updated: p.lastUpdated,
            }));
            await checked(supabase.from('processed_stock').upsert(procRows), 'processed_stock seed');
        }
        // 7. Sales
        if (state.sales.length > 0) {
            const saleRows = state.sales.map(s => ({
                id: s.id,
                date: s.date,
                product_id: s.productId || null,
                product_name: s.productName,
                customer_id: s.customerId || null,
                customer_name: s.customerName,
                customer_phone: s.customerPhone || null,
                unit_type: s.unitType,
                unit_quantity: s.unitQuantity,
                quantity_kg: s.quantityKg,
                sale_price_per_unit: s.salePricePerUnit,
                total_amount: s.totalAmount,
                paid_amount: s.paidAmount,
                remaining_amount: s.remainingAmount,
                total_cost_of_goods: s.totalCostOfGoods,
                total_cost_of_goods_usd: s.totalCostOfGoodsUsd || 0,
                profit: s.profit,
                profit_usd: s.profitUsd || 0,
                notes: s.notes || null,
                currency: s.currency || 'AFN',
            }));
            await checked(supabase.from('sales').upsert(saleRows), 'sales seed');
        }
        // 8. Expenses
        if (state.expenses.length > 0) {
            const expRows = state.expenses.map(e => ({
                id: e.id,
                date: e.date,
                category: e.category,
                amount: e.amount,
                description: e.description,
                paid_by: e.paidBy || null,
                notes: e.notes || null,
                currency: e.currency || 'AFN',
            }));
            await checked(supabase.from('expenses').upsert(expRows), 'expenses seed');
        }
        await saveCashInHand(state.cashInHand, state.cashInHandUsd || 0);
    }).then(() => true).catch(err => {
        reportDatabaseError(`Database write failed: ${err.message || err}`);
        return false;
    });
}

// Persist only records that changed. This keeps ordinary frontend edits from
// resending every historical sale, transaction, batch, and inventory row.
export async function persistStateChanges(previousState, nextState) {
    if (!previousState) return writeStateToSupabase(nextState);
    const changed = (before, after) => {
        const previousById = new Map(before.map(item => [item.id, JSON.stringify(item)]));
        return after.filter(item => previousById.get(item.id) !== JSON.stringify(item));
    };
    return writeStateToSupabase({
        ...nextState,
        rawMaterials: changed(previousState.rawMaterials, nextState.rawMaterials),
        processedStock: changed(previousState.processedStock, nextState.processedStock),
        suppliers: changed(previousState.suppliers, nextState.suppliers),
        customers: changed(previousState.customers, nextState.customers),
        formulas: changed(previousState.formulas, nextState.formulas),
        productionBatches: changed(previousState.productionBatches, nextState.productionBatches),
        sales: changed(previousState.sales, nextState.sales),
        expenses: changed(previousState.expenses, nextState.expenses),
    });
}

export async function clearAllDataFromSupabase() {
    if (!supabase)
        return false;
    return queueWrite(async () => {
        const tables = [
            'customer_transactions', 'supplier_transactions', 'sales',
            'production_batches', 'processed_stock', 'raw_materials',
            'expenses', 'formulas', 'customers', 'suppliers',
        ];
        for (const table of tables) {
            await checked(supabase.from(table).delete().not('id', 'is', null), `${table} clear`);
        }
        await checked(supabase.from('factory_state').upsert({
            id: 'default',
            cash_in_hand: 0,
            updated_at: new Date().toISOString(),
        }), 'factory state reset');
        return true;
    }).catch(error => {
        reportDatabaseError(`Database reset failed: ${error.message || error}`);
        return false;
    });
}
export async function deleteCustomerFromSupabase(customerId) {
    if (!supabase)
        return;
    return queueWrite(async () => {
        try {
            await checked(supabase.from('customer_transactions').delete().eq('customer_id', customerId), 'customer_transactions delete');
            await checked(supabase.from('customers').delete().eq('id', customerId), 'customers delete');
        }
        catch (err) {
            console.error('Supabase error deleting customer:', err);
        }
    });
}
export async function deleteRawMaterialFromSupabase(id) {
    if (!supabase)
        return;
    return queueWrite(async () => {
        try {
            await checked(supabase.from('raw_materials').delete().eq('id', id), 'raw_materials delete');
        }
        catch (err) {
            console.error('Supabase error deleting raw material:', err);
        }
    });
}
export async function deleteSupplierFromSupabase(supplierId) {
    if (!supabase)
        return;
    return queueWrite(async () => {
        try {
            await checked(supabase.from('raw_materials').delete().eq('supplier_id', supplierId), 'supplier raw materials delete');
            await checked(supabase.from('supplier_transactions').delete().eq('supplier_id', supplierId), 'supplier_transactions delete');
            await checked(supabase.from('suppliers').delete().eq('id', supplierId), 'suppliers delete');
        }
        catch (err) {
            console.error('Supabase error deleting supplier:', err);
        }
    });
}
export async function deleteExpenseFromSupabase(id) {
    if (!supabase)
        return;
    return queueWrite(async () => {
        try {
            await checked(supabase.from('expenses').delete().eq('id', id), 'expenses delete');
        }
        catch (err) {
            console.error('Supabase error deleting expense:', err);
        }
    });
}
export async function deleteFormulaFromSupabase(formulaId) {
    if (!supabase)
        return;
    return queueWrite(async () => {
        try {
            await checked(supabase.from('formulas').delete().eq('id', formulaId), 'formulas delete');
        }
        catch (err) {
            console.error('Supabase error deleting formula:', err);
        }
    });
}
