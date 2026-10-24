import { supabase } from './supabase';
import { rawAverageCostPerKg } from './rawMaterialCost';
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
        const [rawRes, supRes, supTxRes, custRes, custTxRes, procRes, salesRes, expRes, formRes, batchRes, counterCustRes, counterTxRes, counterSalesRes] = await Promise.all([
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
            supabase.from('counter_customers').select('*'),
            supabase.from('counter_customer_transactions').select('*').order('created_at', { ascending: false }),
            supabase.from('counter_sales').select('*').order('created_at', { ascending: false }),
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
            counterCustRes,
            counterTxRes,
            counterSalesRes,
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
            averageCostPerKg: r.average_cost_per_kg == null
                ? ((r.currency || 'AFN') === 'AFN' ? Number(r.unit_price) || 0 : 0)
                : Number(r.average_cost_per_kg) || 0,
            averageCostPerKgUsd: r.average_cost_per_kg_usd == null
                ? (r.currency === 'USD' ? Number(r.unit_price) || 0 : 0)
                : Number(r.average_cost_per_kg_usd) || 0,
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
            receivableBalance: Number(s.receivable_balance) || 0,
            receivableBalanceUsd: Number(s.receivable_balance_usd) || 0,
            createdAt: s.created_at || '',
            transactions: supplierTransactions
                .filter(tx => tx.supplier_id === s.id)
                .map(tx => ({
                id: tx.id,
                rawMaterialId: tx.raw_material_id || undefined,
                productId: tx.product_id || undefined,
                sourceSaleId: tx.source_sale_id || undefined,
                billNumber: tx.bill_number || '',
                lineItems: Array.isArray(tx.line_items) ? tx.line_items : [],
                itemName: tx.item_name || undefined,
                quantityKg: tx.quantity_kg == null ? undefined : Number(tx.quantity_kg),
                unitPrice: tx.unit_price == null ? undefined : Number(tx.unit_price),
                unitType: tx.unit_type || undefined,
                unitQuantity: tx.unit_quantity == null ? undefined : Number(tx.unit_quantity),
                unitPricePerUnit: tx.unit_price_per_unit == null ? undefined : Number(tx.unit_price_per_unit),
                accountBalanceAfter: tx.account_balance_after == null ? undefined : Number(tx.account_balance_after),
                receivableAfter: tx.receivable_after == null ? undefined : Number(tx.receivable_after),
                date: tx.date,
                type: tx.type,
                description: tx.description,
                amount: Number(tx.amount) || 0,
                paidAmount: Number(tx.paid_amount) || 0,
                cashAmount: Number(tx.cash_amount) || 0,
                remainingAmount: Number(tx.remaining_amount) || 0,
                currency: tx.currency || 'AFN',
                status: tx.status || 'active',
                reversalOf: tx.reversal_of || undefined,
                replacedByTransactionId: tx.replaced_by_transaction_id || undefined,
                correctionReason: tx.correction_reason || undefined,
                correctedAt: tx.corrected_at || undefined,
            })),
        }));
        let supplierBalanceReconciliationNeeded = false;
        suppliers.forEach(supplier => {
            const afnNet = supplier.totalPurchasedAmount - supplier.totalPaid - supplier.goodsSettledAmount;
            const usdNet = supplier.totalPurchasedAmountUsd - supplier.totalPaidUsd - supplier.goodsSettledAmountUsd;
            const expectedAfnBalance = Math.max(0, afnNet);
            const expectedUsdBalance = Math.max(0, usdNet);
            const expectedAfnReceivable = Math.max(0, -afnNet);
            const expectedUsdReceivable = Math.max(0, -usdNet);
            if (supplier.balanceOwed !== expectedAfnBalance || supplier.balanceOwedUsd !== expectedUsdBalance
                || supplier.receivableBalance !== expectedAfnReceivable || supplier.receivableBalanceUsd !== expectedUsdReceivable) {
                supplierBalanceReconciliationNeeded = true;
                supplier.balanceOwed = expectedAfnBalance;
                supplier.balanceOwedUsd = expectedUsdBalance;
                supplier.receivableBalance = expectedAfnReceivable;
                supplier.receivableBalanceUsd = expectedUsdReceivable;
            }
        });
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
            accountCharges: Number(c.account_charges) || 0,
            accountChargesUsd: Number(c.account_charges_usd) || 0,
            creditBalance: Number(c.credit_balance) || 0,
            creditBalanceUsd: Number(c.credit_balance_usd) || 0,
            balanceOwed: Number(c.balance_owed) || 0,
            balanceOwedUsd: Number(c.balance_owed_usd) || 0,
            createdAt: c.created_at || '',
            transactions: customerTransactions
                .filter(tx => tx.customer_id === c.id)
                .map(tx => ({
                id: tx.id,
                rawMaterialId: tx.raw_material_id || undefined,
                productId: tx.product_id || undefined,
                sourceSaleId: tx.source_sale_id || undefined,
                billNumber: tx.bill_number || '',
                lineItems: Array.isArray(tx.line_items) ? tx.line_items : [],
                itemName: tx.item_name || undefined,
                quantityKg: tx.quantity_kg == null ? undefined : Number(tx.quantity_kg),
                unitPrice: tx.unit_price == null ? undefined : Number(tx.unit_price),
                unitType: tx.unit_type || undefined,
                unitQuantity: tx.unit_quantity == null ? undefined : Number(tx.unit_quantity),
                unitPricePerUnit: tx.unit_price_per_unit == null ? undefined : Number(tx.unit_price_per_unit),
                accountBalanceAfter: tx.account_balance_after == null ? undefined : Number(tx.account_balance_after),
                date: tx.date,
                type: tx.type,
                description: tx.description,
                amount: Number(tx.amount) || 0,
                paidAmount: Number(tx.paid_amount) || 0,
                cashAmount: Number(tx.cash_amount) || 0,
                remainingAmount: Number(tx.remaining_amount) || 0,
                currency: tx.currency || 'AFN',
                status: tx.status || 'active',
                reversalOf: tx.reversal_of || undefined,
                replacedByTransactionId: tx.replaced_by_transaction_id || undefined,
                correctionReason: tx.correction_reason || undefined,
                correctedAt: tx.corrected_at || undefined,
            })),
        }));
        // Customer debt has one accounting source of truth:
        // sales - cash received - raw materials received. Repair older rows
        // whose stored balance was not updated when a settlement was saved.
        let customerBalanceReconciliationNeeded = false;
        customers.forEach(customer => {
            const expectedAfnBalance = Math.max(0,
                customer.totalPurchasedAmount + customer.accountCharges - customer.totalPaid - customer.rawSettledAmount);
            const expectedUsdBalance = Math.max(0,
                customer.totalPurchasedAmountUsd + customer.accountChargesUsd - customer.totalPaidUsd - customer.rawSettledAmountUsd);
            const expectedAfnCredit = Math.max(0,
                customer.totalPaid + customer.rawSettledAmount - customer.totalPurchasedAmount - customer.accountCharges);
            const expectedUsdCredit = Math.max(0,
                customer.totalPaidUsd + customer.rawSettledAmountUsd - customer.totalPurchasedAmountUsd - customer.accountChargesUsd);
            if (customer.balanceOwed !== expectedAfnBalance || customer.balanceOwedUsd !== expectedUsdBalance
                || customer.creditBalance !== expectedAfnCredit || customer.creditBalanceUsd !== expectedUsdCredit) {
                customerBalanceReconciliationNeeded = true;
                customer.balanceOwed = expectedAfnBalance;
                customer.balanceOwedUsd = expectedUsdBalance;
                customer.creditBalance = expectedAfnCredit;
                customer.creditBalanceUsd = expectedUsdCredit;
            }
        });
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
        const sales = (salesRes.data || []).filter(s => (s.status || 'active') === 'active').map(s => ({
            id: s.id,
            billNumber: s.bill_number || '',
            date: s.date,
            customerId: s.customer_id || '',
            supplierId: s.supplier_id || '',
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
            cashAmount: Number(s.cash_amount) || 0,
            remainingAmount: Number(s.remaining_amount) || 0,
            notes: s.notes || undefined,
            currency: s.currency || 'AFN',
            items: Array.isArray(s.items) ? s.items : [],
        }));
        const counterTransactions = counterTxRes.data || [];
        const counterCustomers = (counterCustRes.data || []).map(customer => ({
            id: customer.id,
            name: customer.name,
            phone: customer.phone || '',
            totalPurchasedAmount: Number(customer.total_purchased_amount) || 0,
            totalPurchasedAmountUsd: Number(customer.total_purchased_amount_usd) || 0,
            totalPaid: Number(customer.total_paid) || 0,
            totalPaidUsd: Number(customer.total_paid_usd) || 0,
            balanceOwed: Number(customer.balance_owed) || 0,
            balanceOwedUsd: Number(customer.balance_owed_usd) || 0,
            createdAt: customer.created_at || '',
            transactions: counterTransactions
                .filter(transaction => transaction.counter_customer_id === customer.id)
                .map(transaction => ({
                    id: transaction.id,
                    sourceSaleId: transaction.source_sale_id || undefined,
                    billNumber: transaction.bill_number || '',
                    date: transaction.date,
                    type: transaction.type,
                    items: Array.isArray(transaction.items) ? transaction.items : [],
                    description: transaction.description || '',
                    amount: Number(transaction.amount) || 0,
                    paidAmount: Number(transaction.paid_amount) || 0,
                    cashAmount: Number(transaction.cash_amount) || 0,
                    remainingAmount: Number(transaction.remaining_amount) || 0,
                    currency: transaction.currency || 'AFN',
                    status: transaction.status || 'active',
                    createdAt: transaction.created_at || '',
                })),
        }));
        const counterSales = (counterSalesRes.data || []).map(sale => ({
            id: sale.id,
            billNumber: sale.bill_number,
            counterCustomerId: sale.counter_customer_id,
            customerName: sale.customer_name,
            customerPhone: sale.customer_phone || '',
            date: sale.date,
            items: Array.isArray(sale.items) ? sale.items : [],
            quantityKg: Number(sale.total_quantity_kg) || 0,
            totalAmount: Number(sale.total_amount) || 0,
            paidAmount: Number(sale.paid_amount) || 0,
            cashAmount: Number(sale.cash_amount) || 0,
            remainingAmount: Number(sale.remaining_amount) || 0,
            totalCostOfGoods: Number(sale.total_cost_of_goods) || 0,
            totalCostOfGoodsUsd: Number(sale.total_cost_of_goods_usd) || 0,
            profit: Number(sale.profit) || 0,
            profitUsd: Number(sale.profit_usd) || 0,
            currency: sale.currency || 'AFN',
            notes: sale.notes || '',
            status: sale.status || 'active',
            auditTrail: Array.isArray(sale.audit_trail) ? sale.audit_trail : [],
            createdAt: sale.created_at || '',
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
            const totalCost = ings.reduce((acc, ing) => acc + (Number(ing.totalCost) || 0), 0);
            const totalCostUsd = ings.reduce((acc, ing) => acc + (Number(ing.totalCostUsd) || 0), 0);
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
            counterCustomers,
            counterSales,
            expenses,
        ].some(items => items.length > 0);
        return {
            hasData,
            salesReconciliationNeeded: salesReconciliationNeeded || customerBalanceReconciliationNeeded || supplierBalanceReconciliationNeeded,
            state: {
                rawMaterials,
                processedStock,
                suppliers,
                customers,
                formulas,
                productionBatches,
                sales,
                counterCustomers,
                counterSales,
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
                receivable_balance: s.receivableBalance || 0,
                receivable_balance_usd: s.receivableBalanceUsd || 0,
                created_at: s.createdAt,
            }));
            await checked(supabase.from('suppliers').upsert(supRows), 'suppliers seed');
            const txRows = state.suppliers.flatMap(s => s.transactions.map(t => ({
                id: t.id,
                supplier_id: s.id,
                raw_material_id: t.rawMaterialId || null,
                product_id: t.productId || null,
                source_sale_id: t.sourceSaleId || null,
                bill_number: t.billNumber || null,
                line_items: Array.isArray(t.lineItems) ? t.lineItems : [],
                item_name: t.itemName || null,
                quantity_kg: t.quantityKg ?? null,
                unit_price: t.unitPrice ?? null,
                unit_type: t.unitType || null,
                unit_quantity: t.unitQuantity ?? null,
                unit_price_per_unit: t.unitPricePerUnit ?? null,
                account_balance_after: t.accountBalanceAfter ?? null,
                receivable_after: t.receivableAfter ?? 0,
                date: t.date,
                type: t.type,
                description: t.description,
                amount: t.amount,
                paid_amount: t.paidAmount,
                cash_amount: t.cashAmount ?? (t.type === 'purchase' || t.type === 'payment' ? t.paidAmount : 0),
                remaining_amount: t.remainingAmount,
                currency: t.currency || 'AFN',
                status: t.status || 'active',
                reversal_of: t.reversalOf || null,
                replaced_by_transaction_id: t.replacedByTransactionId || null,
                correction_reason: t.correctionReason || null,
                corrected_at: t.correctedAt || null,
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
                average_cost_per_kg: rawAverageCostPerKg(rm, 'AFN'),
                average_cost_per_kg_usd: rawAverageCostPerKg(rm, 'USD'),
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
                account_charges: c.accountCharges || 0,
                account_charges_usd: c.accountChargesUsd || 0,
                credit_balance: c.creditBalance || 0,
                credit_balance_usd: c.creditBalanceUsd || 0,
                balance_owed: c.balanceOwed,
                balance_owed_usd: c.balanceOwedUsd || 0,
                created_at: c.createdAt,
            }));
            await checked(supabase.from('customers').upsert(custRows), 'customers seed');
            const custTxRows = state.customers.flatMap(c => c.transactions.map(t => ({
                id: t.id,
                customer_id: c.id,
                raw_material_id: t.rawMaterialId || null,
                product_id: t.productId || null,
                source_sale_id: t.sourceSaleId || null,
                bill_number: t.billNumber || null,
                line_items: Array.isArray(t.lineItems) ? t.lineItems : [],
                item_name: t.itemName || null,
                quantity_kg: t.quantityKg ?? null,
                unit_price: t.unitPrice ?? null,
                unit_type: t.unitType || null,
                unit_quantity: t.unitQuantity ?? null,
                unit_price_per_unit: t.unitPricePerUnit ?? null,
                account_balance_after: t.accountBalanceAfter ?? null,
                date: t.date,
                type: t.type,
                description: t.description,
                amount: t.amount,
                paid_amount: t.paidAmount,
                cash_amount: t.cashAmount ?? (t.type === 'sale' || t.type === 'payment' ? t.paidAmount : 0),
                remaining_amount: t.remainingAmount,
                currency: t.currency || 'AFN',
                status: t.status || 'active',
                reversal_of: t.reversalOf || null,
                replaced_by_transaction_id: t.replacedByTransactionId || null,
                correction_reason: t.correctionReason || null,
                corrected_at: t.correctedAt || null,
            })));
            if (custTxRows.length > 0) {
                await checked(supabase.from('customer_transactions').upsert(custTxRows), 'customer_transactions seed');
            }
        }
        // 4. Counter customers, their mixed-stock sales, and cash payments are
        // intentionally isolated from the ordinary customer/supplier ledgers.
        if ((state.counterCustomers || []).length > 0) {
            const counterCustomerRows = state.counterCustomers.map(customer => ({
                id: customer.id,
                name: customer.name,
                phone: customer.phone || null,
                total_purchased_amount: customer.totalPurchasedAmount || 0,
                total_purchased_amount_usd: customer.totalPurchasedAmountUsd || 0,
                total_paid: customer.totalPaid || 0,
                total_paid_usd: customer.totalPaidUsd || 0,
                balance_owed: customer.balanceOwed || 0,
                balance_owed_usd: customer.balanceOwedUsd || 0,
                created_at: customer.createdAt || new Date().toISOString().split('T')[0],
                updated_at: new Date().toISOString(),
            }));
            await checked(supabase.from('counter_customers').upsert(counterCustomerRows), 'counter_customers seed');
        }
        if ((state.counterSales || []).length > 0) {
            const counterSaleRows = state.counterSales.map(sale => ({
                id: sale.id,
                bill_number: sale.billNumber,
                counter_customer_id: sale.counterCustomerId,
                customer_name: sale.customerName,
                customer_phone: sale.customerPhone || null,
                date: sale.date,
                items: Array.isArray(sale.items) ? sale.items : [],
                total_quantity_kg: sale.quantityKg || 0,
                total_amount: sale.totalAmount || 0,
                paid_amount: sale.paidAmount || 0,
                cash_amount: sale.cashAmount || 0,
                remaining_amount: sale.remainingAmount || 0,
                total_cost_of_goods: sale.totalCostOfGoods || 0,
                total_cost_of_goods_usd: sale.totalCostOfGoodsUsd || 0,
                profit: sale.profit || 0,
                profit_usd: sale.profitUsd || 0,
                currency: sale.currency || 'AFN',
                notes: sale.notes || null,
                status: sale.status || 'active',
                audit_trail: Array.isArray(sale.auditTrail) ? sale.auditTrail : [],
            }));
            await checked(supabase.from('counter_sales').upsert(counterSaleRows), 'counter_sales seed');
        }
        const counterTransactionRows = (state.counterCustomers || []).flatMap(customer =>
            (customer.transactions || []).map(transaction => ({
                id: transaction.id,
                counter_customer_id: customer.id,
                source_sale_id: transaction.sourceSaleId || null,
                bill_number: transaction.billNumber || null,
                date: transaction.date,
                type: transaction.type,
                items: Array.isArray(transaction.items) ? transaction.items : [],
                description: transaction.description || null,
                amount: transaction.amount || 0,
                paid_amount: transaction.paidAmount || 0,
                cash_amount: transaction.cashAmount || 0,
                remaining_amount: transaction.remainingAmount || 0,
                currency: transaction.currency || 'AFN',
                status: transaction.status || 'active',
                created_at: transaction.createdAt || new Date().toISOString(),
            })));
        if (counterTransactionRows.length > 0) {
            await checked(supabase.from('counter_customer_transactions').upsert(counterTransactionRows), 'counter_customer_transactions seed');
        }
        // 5. Formulas (processed stock and batches may reference formulas)
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
                bill_number: s.billNumber || null,
                items: Array.isArray(s.items) ? s.items : [],
                date: s.date,
                product_id: s.productId || null,
                product_name: s.productName,
                customer_id: s.customerId || null,
                supplier_id: s.supplierId || null,
                customer_name: s.customerName,
                customer_phone: s.customerPhone || null,
                unit_type: s.unitType,
                unit_quantity: s.unitQuantity,
                quantity_kg: s.quantityKg,
                sale_price_per_unit: s.salePricePerUnit,
                total_amount: s.totalAmount,
                paid_amount: s.paidAmount,
                cash_amount: s.cashAmount ?? s.paidAmount,
                remaining_amount: s.remainingAmount,
                total_cost_of_goods: s.totalCostOfGoods,
                total_cost_of_goods_usd: s.totalCostOfGoodsUsd || 0,
                profit: s.profit,
                profit_usd: s.profitUsd || 0,
                notes: s.notes || null,
                currency: s.currency || 'AFN',
                status: s.status || 'active',
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
        counterCustomers: changed(previousState.counterCustomers || [], nextState.counterCustomers || []),
        counterSales: changed(previousState.counterSales || [], nextState.counterSales || []),
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
            'counter_customer_transactions', 'counter_sales', 'counter_customers',
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
export async function correctAccountTransactionInSupabase({ role, partyId, transactionId, action, replacement, reason }) {
    if (!supabase) return { success: false, error: 'Supabase is not configured.' };
    try {
        const functionName = role === 'customer'
            ? 'correct_customer_account_transaction_v3'
            : 'correct_account_transaction_v2';
        const parameters = role === 'customer'
            ? {
                p_customer_id: partyId,
                p_transaction_id: transactionId,
                p_action: action,
                p_replacement: replacement || null,
                p_reason: reason,
            }
            : {
                p_role: role,
                p_party_id: partyId,
                p_transaction_id: transactionId,
                p_action: action,
                p_replacement: replacement || null,
                p_reason: reason,
            };
        const { data, error } = await supabase.rpc(functionName, parameters);
        if (error) throw error;
        return data?.success ? data : { success: false, error: 'The correction was not completed.' };
    }
    catch (err) {
        console.error('Supabase transaction correction failed:', err);
        return { success: false, error: err.message || String(err) };
    }
}
export async function addCustomerAccountEntryInSupabase({ customerId, type, amount, currency, date, description }) {
    if (!supabase) return { success: false, error: 'Supabase is not configured.' };
    try {
        const { data, error } = await supabase.rpc('add_customer_account_entry', {
            p_customer_id: customerId,
            p_type: type,
            p_amount: amount,
            p_currency: currency,
            p_date: date,
            p_description: description || null,
        });
        if (error) throw error;
        return data?.success ? data : { success: false, error: 'The customer account entry was not saved.' };
    }
    catch (err) {
        console.error('Supabase customer account entry failed:', err);
        return { success: false, error: err.message || String(err) };
    }
}
export async function correctCustomerAccountEntryInSupabase({ customerId, transactionId, action, replacement, reason }) {
    if (!supabase) return { success: false, error: 'Supabase is not configured.' };
    try {
        const { data, error } = await supabase.rpc('correct_customer_account_entry', {
            p_customer_id: customerId,
            p_transaction_id: transactionId,
            p_action: action,
            p_replacement: replacement || null,
            p_reason: reason,
        });
        if (error) throw error;
        return data?.success ? data : { success: false, error: 'The customer account entry was not changed.' };
    }
    catch (err) {
        console.error('Supabase customer account correction failed:', err);
        return { success: false, error: err.message || String(err) };
    }
}
export async function billNumberExistsInSupabase(billNumber) {
    if (!supabase) return null;
    try {
        const { data, error } = await supabase.rpc('bill_number_exists', { p_bill_number: billNumber });
        if (error) throw error;
        return Boolean(data);
    }
    catch (err) {
        console.error('Supabase bill-number check failed:', err);
        return null;
    }
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
