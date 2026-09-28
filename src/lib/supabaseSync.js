import { supabase } from './supabase';
export const isSupabaseConfigured = () => !!supabase;
let syncQueue = Promise.resolve();
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
function queueSync(operation) {
    const next = syncQueue.then(operation);
    syncQueue = next.catch(() => undefined);
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
        .select('cash_in_hand')
        .eq('id', 'default')
        .maybeSingle();
    if (error) {
        // The rest of the business data must remain available on databases that
        // have not yet run the migration.
        console.warn('factory_state is not available yet:', error.message);
        return null;
    }
    const value = Number(data?.cash_in_hand);
    return Number.isFinite(value) ? value : null;
}
async function saveCashInHand(cashInHand) {
    if (!supabase)
        return;
    const { error } = await supabase.from('factory_state').upsert({
        id: 'default',
        cash_in_hand: cashInHand,
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
            supplierId: r.supplier_id || undefined,
            supplierName: r.supplier_name || undefined,
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
            totalPaid: Number(s.total_paid) || 0,
            balanceOwed: Number(s.balance_owed) || 0,
            createdAt: s.created_at || '',
            transactions: supplierTransactions
                .filter(tx => tx.supplier_id === s.id)
                .map(tx => ({
                id: tx.id,
                date: tx.date,
                type: tx.type,
                description: tx.description,
                amount: Number(tx.amount) || 0,
                paidAmount: Number(tx.paid_amount) || 0,
                remainingAmount: Number(tx.remaining_amount) || 0,
            })),
        }));
        const customerTransactions = custTxRes.data || [];
        const customers = (custRes.data || []).map(c => ({
            id: c.id,
            name: c.name,
            phone: c.phone || '',
            address: c.address || '',
            totalPurchasedAmount: Number(c.total_purchased_amount) || 0,
            totalPaid: Number(c.total_paid) || 0,
            balanceOwed: Number(c.balance_owed) || 0,
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
            })),
        }));
        const processedStock = (procRes.data || []).map(p => ({
            id: p.id,
            name: p.name,
            formulaId: p.formula_id || undefined,
            stockKg: Number(p.stock_kg) || 0,
            averageCostPerKg: Number(p.average_cost_per_kg) || 0,
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
            profit: Number(s.profit) || 0,
            paidAmount: Number(s.paid_amount) || 0,
            remainingAmount: Number(s.remaining_amount) || 0,
            notes: s.notes || undefined,
        }));
        const expenses = (expRes.data || []).map(e => ({
            id: e.id,
            date: e.date,
            category: e.category,
            description: e.description,
            amount: Number(e.amount) || 0,
            paidBy: e.paid_by || undefined,
            notes: e.notes || undefined,
        }));
        const formulas = (formRes.data || []).map(f => {
            const ings = Array.isArray(f.ingredients) ? f.ingredients : [];
            const totalWeight = ings.reduce((acc, ing) => acc + (Number(ing.weightKg) || 0), 0);
            const totalCost = ings.reduce((acc, ing) => acc + (Number(ing.totalCost) || 0), 0);
            return {
                id: f.id,
                name: f.name,
                description: f.description || undefined,
                ingredients: ings,
                totalWeightKg: totalWeight,
                totalBatchCost: totalCost,
                costPerKg: totalWeight > 0 ? totalCost / totalWeight : 0,
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
            totalCost: Number(b.total_cost) || 0,
            operatorName: b.operator_name || undefined,
            notes: b.notes || undefined,
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
                cashInHand: persistedCash ?? DEFAULT_CASH_IN_HAND,
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
export async function seedInitialDataToSupabase(state) {
    if (!supabase)
        return false;
    return queueSync(async () => {
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
                total_paid: s.totalPaid,
                balance_owed: s.balanceOwed,
                created_at: s.createdAt,
            }));
            await checked(supabase.from('suppliers').upsert(supRows), 'suppliers seed');
            const txRows = state.suppliers.flatMap(s => s.transactions.map(t => ({
                id: t.id,
                supplier_id: s.id,
                date: t.date,
                type: t.type,
                description: t.description,
                amount: t.amount,
                paid_amount: t.paidAmount,
                remaining_amount: t.remainingAmount,
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
                supplier_id: rm.supplierId || null,
                supplier_name: rm.supplierName || null,
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
                total_paid: c.totalPaid,
                balance_owed: c.balanceOwed,
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
                operator_name: null,
                date_created: f.createdDate,
            }));
            await checked(supabase.from('formulas').upsert(formRows), 'formulas seed');
        }
        // 5. Production Batches
        if (state.productionBatches.length > 0) {
            const batchRows = state.productionBatches.map(b => ({
                id: b.id,
                formula_id: b.formulaId,
                formula_name: b.formulaName,
                date: b.date,
                total_weight_kg: b.totalWeightKg,
                cost_per_kg: b.costPerKg,
                total_cost: b.totalCost,
                operator_name: b.operatorName || null,
                notes: b.notes || null,
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
                profit: s.profit,
                notes: s.notes || null,
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
            }));
            await checked(supabase.from('expenses').upsert(expRows), 'expenses seed');
        }
        await saveCashInHand(state.cashInHand);
    }).then(() => true).catch(err => {
        reportDatabaseError(`Database write failed: ${err.message || err}`);
        return false;
    });
}

export async function clearAllDataFromSupabase() {
    if (!supabase)
        return false;
    return queueSync(async () => {
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
// -------------------------------------------------------------
// Real-time Entity Sync Handlers
// -------------------------------------------------------------
export async function sbSyncSale(sale, customer, customerTx, processedStockItem) {
    if (!supabase)
        return;
    try {
        // Write the customer before the sale when database foreign keys are used.
        await checked(supabase.from('customers').upsert({
            id: customer.id,
            name: customer.name,
            phone: customer.phone || null,
            address: customer.address || null,
            total_purchased_amount: customer.totalPurchasedAmount,
            total_paid: customer.totalPaid,
            balance_owed: customer.balanceOwed,
            created_at: customer.createdAt,
        }), 'customers sync');
        await checked(supabase.from('sales').upsert({
            id: sale.id,
            date: sale.date,
            product_id: sale.productId || null,
            product_name: sale.productName,
            customer_id: sale.customerId || null,
            customer_name: sale.customerName,
            customer_phone: sale.customerPhone || null,
            unit_type: sale.unitType,
            unit_quantity: sale.unitQuantity,
            quantity_kg: sale.quantityKg,
            sale_price_per_unit: sale.salePricePerUnit,
            total_amount: sale.totalAmount,
            paid_amount: sale.paidAmount,
            remaining_amount: sale.remainingAmount,
            total_cost_of_goods: sale.totalCostOfGoods,
            profit: sale.profit,
            notes: sale.notes || null,
        }), 'sales sync');
        // Insert customer transaction after its customer.
        await checked(supabase.from('customer_transactions').upsert({
            id: customerTx.id,
            customer_id: customer.id,
            date: customerTx.date,
            type: customerTx.type,
            description: customerTx.description,
            amount: customerTx.amount,
            paid_amount: customerTx.paidAmount,
            remaining_amount: customerTx.remainingAmount,
        }), 'customer_transactions sync');
        // 4. Update processed stock if applicable
        if (processedStockItem) {
            await checked(supabase.from('processed_stock').upsert({
                id: processedStockItem.id,
                name: processedStockItem.name,
                formula_id: processedStockItem.formulaId || null,
                stock_kg: processedStockItem.stockKg,
                average_cost_per_kg: processedStockItem.averageCostPerKg,
                last_updated: processedStockItem.lastUpdated,
            }), 'processed_stock sync');
        }
    }
    catch (err) {
        console.error('Supabase error syncing sale:', err);
    }
}
export async function sbSyncCustomerPayment(customer, transaction) {
    if (!supabase)
        return;
    try {
        await checked(supabase.from('customers').upsert({
            id: customer.id,
            name: customer.name,
            phone: customer.phone || null,
            address: customer.address || null,
            total_purchased_amount: customer.totalPurchasedAmount,
            total_paid: customer.totalPaid,
            balance_owed: customer.balanceOwed,
            created_at: customer.createdAt,
        }), 'customers payment sync');
        await checked(supabase.from('customer_transactions').upsert({
            id: transaction.id,
            customer_id: customer.id,
            date: transaction.date,
            type: transaction.type,
            description: transaction.description,
            amount: transaction.amount,
            paid_amount: transaction.paidAmount,
            remaining_amount: transaction.remainingAmount,
        }), 'customer_transactions payment sync');
    }
    catch (err) {
        console.error('Supabase error syncing customer payment:', err);
    }
}
export async function sbDeleteCustomer(customerId) {
    if (!supabase)
        return;
    return queueSync(async () => {
        try {
            await checked(supabase.from('customer_transactions').delete().eq('customer_id', customerId), 'customer_transactions delete');
            await checked(supabase.from('customers').delete().eq('id', customerId), 'customers delete');
        }
        catch (err) {
            console.error('Supabase error deleting customer:', err);
        }
    });
}
export async function sbSyncRawMaterial(item, supplier, supplierTx) {
    if (!supabase)
        return;
    try {
        if (supplier) {
            await checked(supabase.from('suppliers').upsert({
                id: supplier.id,
                name: supplier.name,
                phone: supplier.phone || null,
                address: supplier.address || null,
                total_purchased_amount: supplier.totalPurchasedAmount,
                total_paid: supplier.totalPaid,
                balance_owed: supplier.balanceOwed,
                created_at: supplier.createdAt,
            }), 'suppliers sync');
        }
        await checked(supabase.from('raw_materials').upsert({
            id: item.id,
            name: item.name,
            category: item.category,
            stock_kg: item.stockKg,
            unit_price: item.unitPrice,
            supplier_id: item.supplierId || null,
            supplier_name: item.supplierName || null,
            date_added: item.dateAdded,
            notes: item.notes || null,
            low_stock_threshold: item.lowStockThreshold || 5000,
        }), 'raw_materials sync');
        if (supplierTx && supplier) {
            await checked(supabase.from('supplier_transactions').upsert({
                id: supplierTx.id,
                supplier_id: supplier.id,
                date: supplierTx.date,
                type: supplierTx.type,
                description: supplierTx.description,
                amount: supplierTx.amount,
                paid_amount: supplierTx.paidAmount,
                remaining_amount: supplierTx.remainingAmount,
            }), 'supplier_transactions sync');
        }
    }
    catch (err) {
        console.error('Supabase error syncing raw material:', err);
    }
}
export async function sbDeleteRawMaterial(id) {
    if (!supabase)
        return;
    return queueSync(async () => {
        try {
            await checked(supabase.from('raw_materials').delete().eq('id', id), 'raw_materials delete');
        }
        catch (err) {
            console.error('Supabase error deleting raw material:', err);
        }
    });
}
export async function sbSyncSupplierPayment(supplier, transaction) {
    if (!supabase)
        return;
    try {
        await checked(supabase.from('suppliers').upsert({
            id: supplier.id,
            name: supplier.name,
            phone: supplier.phone || null,
            address: supplier.address || null,
            total_purchased_amount: supplier.totalPurchasedAmount,
            total_paid: supplier.totalPaid,
            balance_owed: supplier.balanceOwed,
            created_at: supplier.createdAt,
        }), 'suppliers payment sync');
        await checked(supabase.from('supplier_transactions').upsert({
            id: transaction.id,
            supplier_id: supplier.id,
            date: transaction.date,
            type: transaction.type,
            description: transaction.description,
            amount: transaction.amount,
            paid_amount: transaction.paidAmount,
            remaining_amount: transaction.remainingAmount,
        }), 'supplier_transactions payment sync');
    }
    catch (err) {
        console.error('Supabase error syncing supplier payment:', err);
    }
}
export async function sbDeleteSupplier(supplierId) {
    if (!supabase)
        return;
    return queueSync(async () => {
        try {
            await checked(supabase.from('supplier_transactions').delete().eq('supplier_id', supplierId), 'supplier_transactions delete');
            await checked(supabase.from('suppliers').delete().eq('id', supplierId), 'suppliers delete');
        }
        catch (err) {
            console.error('Supabase error deleting supplier:', err);
        }
    });
}
export async function sbSyncExpense(expense) {
    if (!supabase)
        return;
    try {
        await checked(supabase.from('expenses').upsert({
            id: expense.id,
            date: expense.date,
            category: expense.category,
            amount: expense.amount,
            description: expense.description,
            paid_by: expense.paidBy || null,
            notes: expense.notes || null,
        }), 'expenses sync');
    }
    catch (err) {
        console.error('Supabase error syncing expense:', err);
    }
}
export async function sbDeleteExpense(id) {
    if (!supabase)
        return;
    return queueSync(async () => {
        try {
            await checked(supabase.from('expenses').delete().eq('id', id), 'expenses delete');
        }
        catch (err) {
            console.error('Supabase error deleting expense:', err);
        }
    });
}
export async function sbSyncFormulaProduction(formula, batch, updatedRawMaterials, processedItem) {
    if (!supabase)
        return;
    try {
        // 1. Formula
        await checked(supabase.from('formulas').upsert({
            id: formula.id,
            name: formula.name,
            description: formula.description || null,
            ingredients: formula.ingredients,
            operator_name: batch.operatorName || null,
            date_created: formula.createdDate,
        }), 'formulas sync');
        // 2. Production Batch
        await checked(supabase.from('production_batches').upsert({
            id: batch.id,
            formula_id: batch.formulaId,
            date: batch.date,
            formula_name: batch.formulaName,
            total_weight_kg: batch.totalWeightKg,
            cost_per_kg: batch.costPerKg,
            total_cost: batch.totalCost,
            operator_name: batch.operatorName || null,
            notes: batch.notes || null,
        }), 'production_batches sync');
        // 3. Processed Stock
        await checked(supabase.from('processed_stock').upsert({
            id: processedItem.id,
            name: processedItem.name,
            formula_id: processedItem.formulaId || null,
            stock_kg: processedItem.stockKg,
            average_cost_per_kg: processedItem.averageCostPerKg,
            last_updated: processedItem.lastUpdated,
        }), 'processed_stock production sync');
        // 4. Raw materials updated stock
        for (const rm of updatedRawMaterials) {
            await checked(supabase.from('raw_materials').update({ stock_kg: rm.stockKg }).eq('id', rm.id), 'raw_materials production update');
        }
    }
    catch (err) {
        console.error('Supabase error syncing formula & batch:', err);
    }
}
export async function sbDeleteFormula(formulaId) {
    if (!supabase)
        return;
    return queueSync(async () => {
        try {
            await checked(supabase.from('formulas').delete().eq('id', formulaId), 'formulas delete');
        }
        catch (err) {
            console.error('Supabase error deleting formula:', err);
        }
    });
}
