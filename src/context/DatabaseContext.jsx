import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { translations, getLocalizedTransactionType, getLocalizedTransactionDescription } from '../translations';
import { supabase, supabaseConfigurationError } from '../lib/supabase';
import { addCustomerAccountEntryInSupabase, billNumberExistsInSupabase, clearAllDataFromSupabase, correctAccountTransactionInSupabase, correctCustomerAccountEntryInSupabase, deleteCustomerFromSupabase, deleteExpenseFromSupabase, deleteFormulaFromSupabase, deleteRawMaterialFromSupabase, deleteSupplierFromSupabase, loadFactorySettings, loadStateFromSupabase, persistStateChanges, saveLowStockThreshold, writeStateToSupabase } from '../lib/supabaseData';
import { canonicalSupplierNames, normalizePartyName } from '../lib/partyRoles';
import { billNumberExists, cleanBillNumber } from '../lib/billNumber';
import { addToRawMovingAverage, rawAverageCostPerKg } from '../lib/rawMaterialCost';
const LANG_STORAGE_KEY = 'al_makkah_poultry_feed_lang';
const emptyFactoryData = {
    rawMaterials: [],
    processedStock: [],
    suppliers: [],
    customers: [],
    formulas: [],
    productionBatches: [],
    sales: [],
    expenses: [],
    cashInHand: 0,
    cashInHandUsd: 0,
};
const DatabaseContext = createContext(undefined);
const currencyCode = value => value === 'USD' ? 'USD' : 'AFN';
const normalizeStockName = value => String(value || '')
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase();
const getLocalRecordDate = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};
const normalizeRecordDate = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))
    ? String(value)
    : getLocalRecordDate();
const currencyField = (field, currency) => currencyCode(currency) === 'USD' ? field + 'Usd' : field;
const applySupplierPurchase = (supplier, purchaseAmount, paidAmount, currency) => {
    const purchaseField = currencyField('totalPurchasedAmount', currency);
    const paidField = currencyField('totalPaid', currency);
    const balanceField = currencyField('balanceOwed', currency);
    const receivableField = currencyField('receivableBalance', currency);
    const settledField = currencyField('goodsSettledAmount', currency);
    const updated = {
        ...supplier,
        [purchaseField]: (Number(supplier[purchaseField]) || 0) + (Number(purchaseAmount) || 0),
        [paidField]: (Number(supplier[paidField]) || 0) + (Number(paidAmount) || 0),
    };
    const netBalance = updated[purchaseField] - updated[paidField] - (Number(updated[settledField]) || 0);
    return { ...updated, [balanceField]: Math.max(0, netBalance), [receivableField]: Math.max(0, -netBalance) };
};
const supplierAccountPosition = (supplier, currency) => {
    const purchaseField = currencyField('totalPurchasedAmount', currency);
    const paidField = currencyField('totalPaid', currency);
    const settledField = currencyField('goodsSettledAmount', currency);
    const netBalance = (Number(supplier[purchaseField]) || 0)
        - (Number(supplier[paidField]) || 0)
        - (Number(supplier[settledField]) || 0);
    return { debt: Math.max(0, netBalance), receivable: Math.max(0, -netBalance) };
};
const applyCustomerSale = (customer, purchaseAmount, paidAmount, currency) => {
    const purchaseField = currencyField('totalPurchasedAmount', currency);
    const paidField = currencyField('totalPaid', currency);
    const balanceField = currencyField('balanceOwed', currency);
    const creditField = currencyField('creditBalance', currency);
    const rawSettledField = currencyField('rawSettledAmount', currency);
    const accountChargesField = currencyField('accountCharges', currency);
    const updated = {
        ...customer,
        [purchaseField]: (Number(customer[purchaseField]) || 0) + (Number(purchaseAmount) || 0),
        [paidField]: (Number(customer[paidField]) || 0) + (Number(paidAmount) || 0),
    };
    const netBalance = updated[purchaseField] + (Number(updated[accountChargesField]) || 0)
        - updated[paidField] - (Number(updated[rawSettledField]) || 0);
    return { ...updated, [balanceField]: Math.max(0, netBalance), [creditField]: Math.max(0, -netBalance) };
};
const customerAccountPosition = (customer, currency) => {
    const purchaseField = currencyField('totalPurchasedAmount', currency);
    const paidField = currencyField('totalPaid', currency);
    const rawSettledField = currencyField('rawSettledAmount', currency);
    const accountChargesField = currencyField('accountCharges', currency);
    const netBalance = (Number(customer[purchaseField]) || 0)
        + (Number(customer[accountChargesField]) || 0)
        - (Number(customer[paidField]) || 0)
        - (Number(customer[rawSettledField]) || 0);
    return { debt: Math.max(0, netBalance), credit: Math.max(0, -netBalance) };
};
const customerOutstandingBalance = (customer, currency) => {
    return customerAccountPosition(customer, currency).debt;
};
const reconcileCustomerSales = (sales, customer, currency) => {
    const paidField = currencyField('totalPaid', currency);
    const rawSettledField = currencyField('rawSettledAmount', currency);
    let amountToAllocate = (Number(customer[paidField]) || 0) + (Number(customer[rawSettledField]) || 0);
    const matchingSaleIds = new Set(sales
        .filter(sale => (sale.currency || 'AFN') === currency && (
            sale.customerId === customer.id
            || (!sale.customerId && (
                normalizePartyName(sale.customerName) === normalizePartyName(customer.name)
                || (customer.phone && sale.customerPhone === customer.phone)
            ))
        ))
        .sort((first, second) => first.date.localeCompare(second.date))
        .map(sale => sale.id));
    const allocations = new Map();
    sales
        .filter(sale => matchingSaleIds.has(sale.id))
        .sort((first, second) => first.date.localeCompare(second.date))
        .forEach(sale => {
            const paidAmount = Math.min(amountToAllocate, Number(sale.totalAmount) || 0);
            allocations.set(sale.id, paidAmount);
            amountToAllocate = Math.max(0, amountToAllocate - paidAmount);
        });
    return sales.map(sale => {
        if (!allocations.has(sale.id)) return sale;
        const paidAmount = allocations.get(sale.id);
        return {
            ...sale,
            paidAmount,
            remainingAmount: Math.max(0, (Number(sale.totalAmount) || 0) - paidAmount),
        };
    });
};
const cashPatch = (state, amount, currency) => currencyCode(currency) === 'USD' ? { cashInHandUsd: (state.cashInHandUsd || 0) + amount } : { cashInHand: (state.cashInHand || 0) + amount };
export const DatabaseProvider = ({ children }) => {
    const [lang, setLangState] = useState(() => {
        const saved = localStorage.getItem(LANG_STORAGE_KEY);
        return (saved === 'fa' || saved === 'ps' || saved === 'en') ? saved : 'fa';
    });
    // Authentication is managed by Supabase Auth. A local-only login cannot
    // validate users created in the Supabase dashboard.
    const [user, setUser] = useState(null);
    const [isAuthLoading, setIsAuthLoading] = useState(Boolean(supabase));
    const [isDatabaseLoading, setIsDatabaseLoading] = useState(Boolean(supabase));
    const [isSupabaseConnected, setIsSupabaseConnected] = useState(false);
    const [databaseError, setDatabaseError] = useState(supabase ? null : `Supabase configuration error: ${supabaseConfigurationError || 'unknown configuration problem'}`);
    const isRemoteStateReady = useRef(false);
    const lastSyncedState = useRef(null);
    const persistedStateRef = useRef(null);
    const pendingStateRef = useRef(null);
    const manualLogoutRef = useRef(false);
    // User-defined Low Stock Threshold
    const [lowStockThreshold, setLowStockThresholdState] = useState(5000);
    const setLowStockThreshold = (threshold) => {
        const safeVal = Math.max(100, Number(threshold) || 1000);
        setLowStockThresholdState(safeVal);
        if (supabase && user) {
            void saveLowStockThreshold(safeVal).then(saved => {
                if (!saved) {
                    setDatabaseError('Could not save the low-stock threshold to the database.');
                    void loadFactorySettings().then(settings => {
                        if (settings?.lowStockThreshold)
                            setLowStockThresholdState(settings.lowStockThreshold);
                    });
                }
            });
        }
    };
    const [db, setDb] = useState(emptyFactoryData);
    const commitConfirmedState = async (nextState, isConfirmed) => {
        const saved = await persistStateChanges(db, nextState);
        let committedState = nextState;
        if (!saved) {
            // A REST sequence can fail after the important rows were already
            // committed. Reload before reporting failure so a successful
            // transaction is never submitted a second time by the user.
            let refreshed = await loadStateFromSupabase();
            if (!refreshed?.state) return false;
            if (!isConfirmed?.(refreshed.state)) {
                // Resume the same operation with the same record IDs. Upserts
                // make this idempotent and avoid creating a duplicate retry.
                const resumed = await persistStateChanges(refreshed.state, nextState);
                if (!resumed) {
                    refreshed = await loadStateFromSupabase();
                    if (!refreshed?.state || !isConfirmed?.(refreshed.state)) return false;
                    committedState = refreshed.state;
                }
                else {
                    committedState = nextState;
                }
            }
            else {
                committedState = refreshed.state;
            }
        }
        lastSyncedState.current = JSON.stringify(committedState);
        persistedStateRef.current = committedState;
        pendingStateRef.current = null;
        setDb(committedState);
        setIsSupabaseConnected(true);
        setDatabaseError(null);
        return true;
    };
    useEffect(() => {
        const handleDatabaseError = event => {
            const message = String(event.detail || 'An unknown Supabase error occurred.');
            setDatabaseError(message);
            setIsSupabaseConnected(false);
            if (/jwt|refresh token|not authenticated|unauthorized|\b401\b|\b403\b/i.test(message) && supabase) {
                void supabase.auth.refreshSession().then(({ data, error }) => {
                    if (error || !data.session) {
                        setUser(null);
                        setDatabaseError('Your Supabase login expired or was revoked. Please sign in again.');
                    } else {
                        const authUser = data.session.user;
                        setUser({ email: authUser.email || '', name: String(authUser.user_metadata?.full_name || authUser.user_metadata?.name || authUser.email || ''), role: String(authUser.user_metadata?.role || authUser.app_metadata?.role || 'User'), loginTime: new Date().toISOString() });
                        setDatabaseError(null);
                    }
                });
            }
        };
        window.addEventListener('supabase-database-error', handleDatabaseError);
        return () => window.removeEventListener('supabase-database-error', handleDatabaseError);
    }, []);
    const toAuthUser = (authUser) => {
        const userMetadata = authUser.user_metadata || {};
        const appMetadata = authUser.app_metadata || {};
        const email = authUser.email || '';
        return {
            email,
            name: String(userMetadata.full_name || userMetadata.name || email),
            // Dashboard-created users can store this in either metadata location.
            role: String(userMetadata.role || appMetadata.role || 'User'),
            loginTime: new Date().toISOString(),
        };
    };
    useEffect(() => {
        if (!supabase) { setIsAuthLoading(false); setIsDatabaseLoading(false); return; }
        let isMounted = true;
        const restoreSession = async () => {
            let { data, error } = await supabase.auth.getSession();
            if (error) {
                const refreshed = await supabase.auth.refreshSession();
                data = refreshed.data; error = refreshed.error;
            }
            if (!isMounted) return;
            if (error) {
                setUser(null);
                setDatabaseError('Your Supabase login expired or was revoked. Please sign in again.');
            } else {
                setUser(data.session?.user ? toAuthUser(data.session.user) : null);
                if (data.session) setDatabaseError(null);
            }
            setIsAuthLoading(false);
        };
        void restoreSession();
        const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
            if (!isMounted) return;
            if (event === 'SIGNED_OUT') {
                setUser(null);
                if (!manualLogoutRef.current) setDatabaseError('Your Supabase login expired or was revoked. Please sign in again.');
                manualLogoutRef.current = false;
            } else if (session?.user) {
                setUser(toAuthUser(session.user));
                setDatabaseError(null);
            }
            setIsAuthLoading(false);
        });
        return () => { isMounted = false; listener.subscription.unsubscribe(); };
    }, []);
    // Load once after authentication. The browser talks directly to Supabase;
    // deliberately do not subscribe to broad Realtime changes or refetch on
    // focus/visibility, since either pattern redownloads the complete database.
    useEffect(() => {
        if (!supabase || isAuthLoading || !user?.email) {
            setIsSupabaseConnected(false);
            if (!isAuthLoading) setIsDatabaseLoading(false);
            return;
        }
        let isMounted = true;
        isRemoteStateReady.current = false;
        lastSyncedState.current = null;
        persistedStateRef.current = null;
        setIsDatabaseLoading(true);
        const loadDatabase = async () => {
            if (!navigator.onLine) {
                setIsDatabaseLoading(false);
                setDatabaseError('You are offline. Reconnect and sign in again to load the database.');
                return;
            }
            const result = await loadStateFromSupabase();
            if (!isMounted) return;
            if (!result) {
                setIsSupabaseConnected(false);
                setDatabaseError('Could not load data directly from Supabase.');
                setIsDatabaseLoading(false);
                return;
            }
            setIsSupabaseConnected(true);
            setDatabaseError(null);
            isRemoteStateReady.current = true;
            setIsDatabaseLoading(false);
            lastSyncedState.current = JSON.stringify(result.state);
            persistedStateRef.current = result.state;
            setDb(result.state);
            if (result.salesReconciliationNeeded) {
                void writeStateToSupabase(result.state);
            }
            void loadFactorySettings().then(settings => {
                if (isMounted && settings?.lowStockThreshold) setLowStockThresholdState(settings.lowStockThreshold);
            });
        };

        void loadDatabase();
        return () => {
            isMounted = false;
        };
    }, [isAuthLoading, user?.email]);
    // Persist completed state changes. Failed writes remain pending and retry automatically.
    useEffect(() => {
        if (!supabase || !isRemoteStateReady.current) return;
        const stateHash = JSON.stringify(db);
        if (lastSyncedState.current === stateHash) return;
        let cancelled = false;
        pendingStateRef.current = db;
        const saveWithRetry = async () => {
            for (let attempt = 0; attempt < 3 && !cancelled; attempt += 1) {
                const saved = await persistStateChanges(persistedStateRef.current, db);
                if (saved) {
                    if (cancelled) return;
                    pendingStateRef.current = null;
                    lastSyncedState.current = stateHash;
                    persistedStateRef.current = db;
                    setIsSupabaseConnected(true);
                    setDatabaseError(null);
                    return;
                }
                await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
            }
            if (!cancelled) {
                setIsSupabaseConnected(false);
                setDatabaseError('The database connection was interrupted. Your change is retained and will be saved automatically when Supabase reconnects.');
            }
        };
        void saveWithRetry();
        return () => { cancelled = true; };
    }, [db]);
    // Keep HTML lang & direction in sync
    useEffect(() => {
        localStorage.setItem(LANG_STORAGE_KEY, lang);
        const html = document.documentElement;
        html.lang = lang;
        html.dir = lang === 'en' ? 'ltr' : 'rtl';
    }, [lang]);
    const setLang = (newLang) => {
        setLangState(newLang);
    };
    const t = translations[lang];
    const login = async (emailInput, passwordInput) => {
        if (!supabase) {
            return { success: false, error: `Supabase configuration error: ${supabaseConfigurationError || 'unknown configuration problem'}` };
        }
        setDatabaseError(null);
        const { error } = await supabase.auth.signInWithPassword({
            email: emailInput.trim(),
            password: passwordInput,
        });
        return error ? { success: false, error: error.message } : { success: true };
    };
    const logout = async () => {
        setUser(null);
        isRemoteStateReady.current = false;
        if (supabase) {
            const { error } = await supabase.auth.signOut();
            if (error)
                console.error('Supabase logout failed:', error.message);
        }
    };
    // Helper to convert units to kilos
    const convertToKg = (unitType, quantity) => {
        switch (unitType) {
            case 'bag':
                return quantity * 50;
            case 'ton':
                return quantity * 1000;
            case 'kg':
            default:
                return quantity;
        }
    };
    // 1. ADD RAW MATERIAL TO INVENTORY & AUTO-UPDATE SUPPLIER
    const addRawMaterial = async (item, paidAmount, supplierPhone) => {
        const requestedSupplierName = String(item.supplierName || '').trim();
        const requestedSupplierKey = normalizePartyName(requestedSupplierName);
        const matchesCustomer = requestedSupplierKey && db.customers.some(customer => normalizePartyName(customer.name) === requestedSupplierKey);
        if (requestedSupplierName && matchesCustomer && !canonicalSupplierNames.has(requestedSupplierKey)) {
            return { success: false, error: t.customerMustUseRawSettlement };
        }
        const today = new Date().toISOString().split('T')[0];
        const operationTimestamp = Date.now();
        const newId = `rm-${operationTimestamp}`;
        const currency = currencyCode(item.currency);
        const totalBill = item.stockKg * item.unitPrice;
        const paid = Math.min(Math.max(0, Number(paidAmount) || 0), totalBill);
        const remaining = Math.max(0, totalBill - paid);
        const newItem = {
            ...item,
            id: newId,
            dateAdded: today,
            averageCostPerKg: currency === 'AFN' ? Number(item.unitPrice) || 0 : 0,
            averageCostPerKgUsd: currency === 'USD' ? Number(item.unitPrice) || 0 : 0,
        };
        let updatedSuppliers = [...db.suppliers];
        let assignedSupplierId = item.supplierId;
        let supplierTransactionId = null;
        if (item.supplierName && item.supplierName.trim()) {
            const supName = item.supplierName.trim();
            const existingSupIndex = updatedSuppliers.findIndex(s => (item.supplierId && s.id === item.supplierId) || normalizePartyName(s.name) === normalizePartyName(supName));
            supplierTransactionId = `st-${operationTimestamp}`;
            const transaction = {
                id: supplierTransactionId,
                rawMaterialId: newId,
                itemName: item.name,
                quantityKg: item.stockKg,
                unitPrice: item.unitPrice,
                unitType: item.purchaseUnitType || 'kg',
                unitQuantity: item.purchaseUnitQuantity ?? item.stockKg,
                unitPricePerUnit: item.purchaseUnitPrice ?? item.unitPrice,
                date: today,
                type: 'purchase',
                description: `خرید ${item.name} (${item.stockKg.toLocaleString()} کیلو)`,
                amount: totalBill,
                paidAmount: paid,
                cashAmount: paid,
                remainingAmount: remaining,
                currency,
            };
            if (existingSupIndex >= 0) {
                const sup = updatedSuppliers[existingSupIndex];
                assignedSupplierId = sup.id;
                newItem.supplierName = sup.name;
                const supplierAfterPurchase = applySupplierPurchase(sup, totalBill, paid, currency);
                updatedSuppliers[existingSupIndex] = {
                    ...supplierAfterPurchase,
                    phone: supplierPhone || sup.phone,
                    transactions: [{ ...transaction, accountBalanceAfter: supplierAfterPurchase[currencyField('balanceOwed', currency)] }, ...sup.transactions],
                };
            }
            else {
                assignedSupplierId = `sup-${operationTimestamp}`;
                updatedSuppliers.unshift({
                    id: assignedSupplierId,
                    name: supName,
                    phone: supplierPhone || '',
                    totalPurchasedAmount: currency === 'AFN' ? totalBill : 0,
                    totalPurchasedAmountUsd: currency === 'USD' ? totalBill : 0,
                    totalPaid: currency === 'AFN' ? paid : 0,
                    totalPaidUsd: currency === 'USD' ? paid : 0,
                    balanceOwed: currency === 'AFN' ? remaining : 0,
                    balanceOwedUsd: currency === 'USD' ? remaining : 0,
                    goodsSettledAmount: 0,
                    goodsSettledAmountUsd: 0,
                    receivableBalance: 0,
                    receivableBalanceUsd: 0,
                    transactions: [{ ...transaction, accountBalanceAfter: remaining }],
                    createdAt: today,
                });
            }
        }
        newItem.supplierId = assignedSupplierId;
        const nextState = {
            ...db,
            rawMaterials: [newItem, ...db.rawMaterials],
            suppliers: updatedSuppliers,
            ...cashPatch(db, -paid, currency),
        };
        const saved = await commitConfirmedState(nextState, state => {
            const materialSaved = state.rawMaterials.some(material => material.id === newId);
            const transactionSaved = !supplierTransactionId || state.suppliers.some(supplier =>
                supplier.transactions?.some(transaction => transaction.id === supplierTransactionId));
            return materialSaved && transactionSaved;
        });
        return saved ? { success: true } : { success: false, error: t.restockFailed };
    };
    // RESTOCK AN EXISTING RAW MATERIAL & RECORD THE SUPPLIER PURCHASE
    const restockRawMaterial = async ({ materialId, addedWeightKg, newUnitPrice, purchaseUnitType = 'kg', purchaseUnitQuantity, purchaseUnitPrice, supplierId: requestedSupplierId, supplierName, supplierPhone, paidAmount, notes, currency: requestedCurrency }) => {
        const material = db.rawMaterials.find(item => item.id === materialId);
        const weight = Number(addedWeightKg);
        const price = Number(newUnitPrice);
        const currency = currencyCode(requestedCurrency || material?.currency);
        if (!material)
            return { success: false, error: 'Raw material not found.' };
        if (!Number.isFinite(weight) || weight <= 0 || !Number.isFinite(price) || price < 0)
            return { success: false, error: 'Restock quantity and unit price are invalid.' };
        const requestedSupplierName = String(supplierName || material.supplierName || '').trim();
        const requestedSupplierKey = normalizePartyName(requestedSupplierName);
        const matchesCustomer = requestedSupplierKey && db.customers.some(customer => normalizePartyName(customer.name) === requestedSupplierKey);
        if (requestedSupplierName && matchesCustomer && !canonicalSupplierNames.has(requestedSupplierKey)) {
            return { success: false, error: t.customerMustUseRawSettlement };
        }
        const today = new Date().toISOString().split('T')[0];
        const totalBill = weight * price;
        const paid = Math.min(Math.max(0, Number(paidAmount) || 0), totalBill);
        const remaining = Math.max(0, totalBill - paid);
        const operationTimestamp = Date.now();
        let updatedSuppliers = [...db.suppliers];
        let supplierId = requestedSupplierId || material.supplierId;
        let resolvedName = supplierName?.trim() || material.supplierName || '';
        let supplierTransactionId = null;
        if (resolvedName) {
            // An explicitly entered supplier name takes precedence over the
            // material's previous supplier. Otherwise a restock from a new
            // supplier would incorrectly update the old supplier account.
            const supplierIndex = updatedSuppliers.findIndex(supplier => (requestedSupplierId && supplier.id === requestedSupplierId) || normalizePartyName(supplier.name) === normalizePartyName(resolvedName));
            supplierTransactionId = `st-${operationTimestamp}`;
            const transaction = {
                id: supplierTransactionId,
                rawMaterialId: materialId,
                itemName: material.name,
                quantityKg: weight,
                unitPrice: price,
                unitType: purchaseUnitType,
                unitQuantity: purchaseUnitQuantity ?? weight,
                unitPricePerUnit: purchaseUnitPrice ?? price,
                date: today,
                type: 'purchase',
                description: notes || `Restock ${material.name} (${weight.toLocaleString()} kg)`,
                amount: totalBill,
                paidAmount: paid,
                cashAmount: paid,
                remainingAmount: remaining,
                currency,
            };
            if (supplierIndex >= 0) {
                const supplier = updatedSuppliers[supplierIndex];
                supplierId = supplier.id;
                resolvedName = supplier.name;
                const supplierAfterPurchase = applySupplierPurchase(supplier, totalBill, paid, currency);
                updatedSuppliers[supplierIndex] = {
                    ...supplierAfterPurchase,
                    phone: supplierPhone || supplier.phone,
                    transactions: [{ ...transaction, accountBalanceAfter: supplierAfterPurchase[currencyField('balanceOwed', currency)] }, ...supplier.transactions],
                };
            }
            else {
                supplierId = `sup-${operationTimestamp}`;
                updatedSuppliers.unshift({
                    id: supplierId,
                    name: resolvedName,
                    phone: supplierPhone || '',
                    address: '',
                    totalPurchasedAmount: currency === 'AFN' ? totalBill : 0,
                    totalPurchasedAmountUsd: currency === 'USD' ? totalBill : 0,
                    totalPaid: currency === 'AFN' ? paid : 0,
                    totalPaidUsd: currency === 'USD' ? paid : 0,
                    balanceOwed: currency === 'AFN' ? remaining : 0,
                    balanceOwedUsd: currency === 'USD' ? remaining : 0,
                    goodsSettledAmount: 0,
                    goodsSettledAmountUsd: 0,
                    receivableBalance: 0,
                    receivableBalanceUsd: 0,
                    transactions: [{ ...transaction, accountBalanceAfter: remaining }],
                    createdAt: today,
                });
            }
        }
        const expectedStock = material.stockKg + weight;
        const movingAverage = addToRawMovingAverage(material, weight, price, currency);
        const nextState = {
            ...db,
            rawMaterials: db.rawMaterials.map(item => item.id === materialId ? {
                ...item,
                stockKg: expectedStock,
                unitPrice: price,
                currency,
                ...movingAverage,
                supplierId,
                supplierName: resolvedName || item.supplierName,
                notes: notes || item.notes,
                dateAdded: today,
            } : item),
            suppliers: updatedSuppliers,
            ...cashPatch(db, -paid, currency),
        };
        const saved = await commitConfirmedState(nextState, state => {
            const materialSaved = state.rawMaterials.some(item => item.id === materialId && Math.abs(item.stockKg - expectedStock) < 0.001);
            const transactionSaved = !supplierTransactionId || state.suppliers.some(supplier =>
                supplier.transactions?.some(transaction => transaction.id === supplierTransactionId));
            return materialSaved && transactionSaved;
        });
        return saved ? { success: true } : { success: false, error: t.restockFailed };
    };
    // UPDATE RAW MATERIAL THRESHOLD PER ITEM
    const updateRawMaterialThreshold = (id, threshold) => {
        setDb(prev => {
            const updatedRaw = prev.rawMaterials.map(rm => {
                if (rm.id === id) {
                    const updated = { ...rm, lowStockThreshold: threshold };
                    return updated;
                }
                return rm;
            });
            return {
                ...prev,
                rawMaterials: updatedRaw,
            };
        });
    };
    // Edit inventory metadata only. This deliberately does not touch suppliers,
    // supplier transactions, balances, or cash.
    const updateRawMaterial = (id, updates) => {
        const name = String(updates.name || '').trim();
        const stockKg = Number(updates.stockKg);
        const unitPrice = Number(updates.unitPrice);
        const averageCostPerKg = Number(updates.averageCostPerKg ?? (currencyCode(updates.currency) === 'AFN' ? unitPrice : 0));
        const averageCostPerKgUsd = Number(updates.averageCostPerKgUsd ?? (currencyCode(updates.currency) === 'USD' ? unitPrice : 0));
        const threshold = updates.lowStockThreshold === '' || updates.lowStockThreshold == null ? undefined : Number(updates.lowStockThreshold);
        if (!name || !Number.isFinite(stockKg) || stockKg < 0 || !Number.isFinite(averageCostPerKg) || averageCostPerKg < 0 || !Number.isFinite(averageCostPerKgUsd) || averageCostPerKgUsd < 0 || (threshold !== undefined && (!Number.isFinite(threshold) || threshold < 0))) return { success: false, error: 'Please enter valid raw-stock values.' };
        setDb(prev => ({ ...prev, rawMaterials: prev.rawMaterials.map(item => item.id === id ? { ...item, name, category: updates.category || item.category, stockKg, averageCostPerKg, averageCostPerKgUsd, supplierName: String(updates.supplierName || '').trim() || undefined, notes: String(updates.notes || '').trim() || undefined, lowStockThreshold: threshold } : item) }));
        return { success: true };
    };
    // Edit supplier fields independently while adjusting cash by the change in paid amounts.
    const updateSupplier = (id, updates) => {
        const name = String(updates.name || '').trim();
        const phone = String(updates.phone || '').trim();
        const totalAfn = Number(updates.totalPurchasedAmount);
        const paidAfn = Number(updates.totalPaid);
        const totalUsd = Number(updates.totalPurchasedAmountUsd);
        const paidUsd = Number(updates.totalPaidUsd);
        if (!name) return { success: false, error: t.supplierNameRequired };
        if (phone && !/^\d{10}$/.test(phone)) return { success: false, error: t.phoneMustBe10Digits };
        if (![totalAfn, paidAfn, totalUsd, paidUsd].every(value => Number.isFinite(value) && value >= 0)) return { success: false, error: t.financialValuesNonNegative };
        setDb(prev => {
            const currentSupplier = prev.suppliers.find(supplier => supplier.id === id);
            if (!currentSupplier) return prev;

            const afnCashAdjustment = Number(currentSupplier.totalPaid || 0) - paidAfn;
            const usdCashAdjustment = Number(currentSupplier.totalPaidUsd || 0) - paidUsd;

            const afnPosition = supplierAccountPosition({ ...currentSupplier, totalPurchasedAmount: totalAfn, totalPaid: paidAfn }, 'AFN');
            const usdPosition = supplierAccountPosition({ ...currentSupplier, totalPurchasedAmountUsd: totalUsd, totalPaidUsd: paidUsd }, 'USD');
            return {
                ...prev,
                cashInHand: Number(prev.cashInHand || 0) + afnCashAdjustment,
                cashInHandUsd: Number(prev.cashInHandUsd || 0) + usdCashAdjustment,
                suppliers: prev.suppliers.map(supplier => supplier.id === id ? {
                    ...supplier,
                    name,
                    phone,
                    address: String(updates.address || '').trim(),
                    totalPurchasedAmount: totalAfn,
                    totalPaid: paidAfn,
                    balanceOwed: afnPosition.debt,
                    receivableBalance: afnPosition.receivable,
                    totalPurchasedAmountUsd: totalUsd,
                    totalPaidUsd: paidUsd,
                    balanceOwedUsd: usdPosition.debt,
                    receivableBalanceUsd: usdPosition.receivable,
                } : supplier),
            };
        });
        return { success: true };
    };
    // Edit the customer account independently from inventory, sales, and
    // transaction history. Cash changes only by the edited cash-received total.
    const updateCustomer = (id, updates) => {
        const name = String(updates.name || '').trim();
        const phone = String(updates.phone || '').trim();
        const totalAfn = Number(updates.totalPurchasedAmount);
        const cashAfn = Number(updates.totalPaid);
        const rawAfn = Number(updates.rawSettledAmount);
        const totalUsd = Number(updates.totalPurchasedAmountUsd);
        const cashUsd = Number(updates.totalPaidUsd);
        const rawUsd = Number(updates.rawSettledAmountUsd);
        if (!name) return { success: false, error: t.customerNameRequired };
        if (phone && !/^\d{10}$/.test(phone)) return { success: false, error: t.phoneMustBe10Digits };
        if (![totalAfn, cashAfn, rawAfn, totalUsd, cashUsd, rawUsd].every(value => Number.isFinite(value) && value >= 0)) return { success: false, error: t.financialValuesNonNegative };
        setDb(prev => {
            const currentCustomer = prev.customers.find(customer => customer.id === id);
            if (!currentCustomer) return prev;
            const afnNet = totalAfn + (Number(currentCustomer.accountCharges) || 0) - cashAfn - rawAfn;
            const usdNet = totalUsd + (Number(currentCustomer.accountChargesUsd) || 0) - cashUsd - rawUsd;
            return {
                ...prev,
                cashInHand: Number(prev.cashInHand || 0) + cashAfn - Number(currentCustomer.totalPaid || 0),
                cashInHandUsd: Number(prev.cashInHandUsd || 0) + cashUsd - Number(currentCustomer.totalPaidUsd || 0),
                customers: prev.customers.map(customer => customer.id === id ? {
                    ...customer,
                    name,
                    phone,
                    address: String(updates.address || '').trim(),
                    totalPurchasedAmount: totalAfn,
                    totalPaid: cashAfn,
                    rawSettledAmount: rawAfn,
                    balanceOwed: Math.max(0, afnNet),
                    creditBalance: Math.max(0, -afnNet),
                    totalPurchasedAmountUsd: totalUsd,
                    totalPaidUsd: cashUsd,
                    rawSettledAmountUsd: rawUsd,
                    balanceOwedUsd: Math.max(0, usdNet),
                    creditBalanceUsd: Math.max(0, -usdNet),
                } : customer),
            };
        });
        return { success: true };
    };
    const applyHistoryCorrection = async (role, partyId, transactionId, action, updates = null, reason = '') => {
        const parties = role === 'supplier' ? db.suppliers : db.customers;
        const party = parties.find(item => item.id === partyId);
        const original = party?.transactions?.find(transaction => transaction.id === transactionId);
        if (!party || !original) return { success: false, error: t.historyEntryNotFound };
        if ((original.status || 'active') !== 'active') return { success: false, error: t.historyEntryAlreadyClosed };
        if (!String(reason || '').trim()) return { success: false, error: t.correctionReasonRequired };
        const isCustomerAccountEntry = role === 'customer' && ['cash_given', 'transport_fee'].includes(original.type);
        const result = isCustomerAccountEntry
            ? await correctCustomerAccountEntryInSupabase({
                customerId: partyId,
                transactionId,
                action,
                replacement: updates,
                reason: String(reason).trim(),
            })
            : await correctAccountTransactionInSupabase({
                role,
                partyId,
                transactionId,
                action,
                replacement: updates,
                reason: String(reason).trim(),
            });
        if (!result?.success) {
            const missingMigration = /correct_account_transaction|schema cache|function/i.test(result?.error || '');
            return { success: false, error: missingMigration ? t.historyMigrationRequired : (result?.error || t.historyChangeSaveFailed) };
        }
        const refreshed = await loadStateFromSupabase();
        if (!refreshed?.state) return { success: false, error: t.historyReloadFailed };
        lastSyncedState.current = JSON.stringify(refreshed.state);
        persistedStateRef.current = refreshed.state;
        setDb(refreshed.state);
        setIsSupabaseConnected(true);
        setDatabaseError(null);
        return { success: true };
    };
    const updateSupplierTransaction = (supplierId, transactionId, updates) =>
        applyHistoryCorrection('supplier', supplierId, transactionId, 'correct', updates, updates?.correctionReason);
    const voidSupplierTransaction = (supplierId, transactionId, reason) =>
        applyHistoryCorrection('supplier', supplierId, transactionId, 'void', null, reason);
    const updateCustomerTransaction = (customerId, transactionId, updates) =>
        applyHistoryCorrection('customer', customerId, transactionId, 'correct', updates, updates?.correctionReason);
    const voidCustomerTransaction = (customerId, transactionId, reason) =>
        applyHistoryCorrection('customer', customerId, transactionId, 'void', null, reason);
    // DELETE RAW MATERIAL
    const deleteRawMaterial = (id) => {
        if (!db.rawMaterials.some(rm => rm.id === id))
            return;
        // Removing an inventory row must not undo a real purchase or remove the
        // supplier. Supplier profiles, balances, payments, and transaction
        // history are managed independently from the current inventory list.
        setDb(prev => ({
            ...prev,
            rawMaterials: prev.rawMaterials.filter(rm => rm.id !== id),
        }));
        void deleteRawMaterialFromSupabase(id);
    };
    // SETTLE PAYMENT TO SUPPLIER
    const settleSupplierPayment = async (supplierId, amountToPay, note, currency = 'AFN') => {
        if (amountToPay <= 0)
            return { success: false, error: t.paymentAmountRequired };
        const today = new Date().toISOString().split('T')[0];
        const supIndex = db.suppliers.findIndex(s => s.id === supplierId);
        if (supIndex === -1) return { success: false, error: t.invalidSupplierOrProduct };
        const sup = db.suppliers[supIndex];
        currency = currencyCode(currency);
        const balanceField = currencyField('balanceOwed', currency);
        const paidField = currencyField('totalPaid', currency);
        const actualPay = Math.min(amountToPay, Number(sup[balanceField]) || 0);
        const newRemaining = Math.max(0, (Number(sup[balanceField]) || 0) - actualPay);
        const transactionId = `st-${Date.now()}`;
        const transaction = {
            id: transactionId,
            date: today,
            type: 'payment',
            description: note || 'پرداخت قرض و تصفیه حساب با عرضه کننده',
            amount: 0,
            paidAmount: actualPay,
            cashAmount: actualPay,
            remainingAmount: newRemaining,
            currency,
        };
        const updatedSuppliers = [...db.suppliers];
        updatedSuppliers[supIndex] = {
            ...sup,
            [paidField]: (Number(sup[paidField]) || 0) + actualPay,
            [balanceField]: newRemaining,
            transactions: [transaction, ...sup.transactions],
        };
        const nextState = {
            ...db,
            suppliers: updatedSuppliers,
            ...cashPatch(db, -actualPay, currency),
        };
        const saved = await commitConfirmedState(nextState, state => state.suppliers.some(supplier =>
            supplier.id === supplierId && supplier.transactions?.some(item => item.id === transactionId)));
        return saved ? { success: true } : { success: false, error: t.historyChangeSaveFailed };
    };
    // SETTLE A SUPPLIER BALANCE WITH PROCESSED GOODS. The supplier remains on
    // the supplier ledger; any value above our debt becomes a receivable on
    // that same supplier account instead of creating a customer.
    const settleSupplierWithProcessedStock = async (settlement) => {
        const supplier = db.suppliers.find(item => item.id === settlement.supplierId);
        const product = db.processedStock.find(item => item.id === settlement.productId);
        const unitQuantity = Number(settlement.unitQuantity);
        const salePricePerUnit = Number(settlement.salePricePerUnit);
        const billNumber = cleanBillNumber(settlement.billNumber);
        const quantityKg = convertToKg(settlement.unitType, unitQuantity);
        if (!supplier || !product) return { success: false, error: t.invalidSupplierOrProduct };
        if (!billNumber) return { success: false, error: t.billNumberRequired };
        if (billNumberExists(db.sales, billNumber)) return { success: false, error: t.duplicateBillNumber };
        if (await billNumberExistsInSupabase(billNumber)) return { success: false, error: t.duplicateBillNumber };
        if (!Number.isFinite(unitQuantity) || unitQuantity <= 0 || !Number.isFinite(salePricePerUnit) || salePricePerUnit <= 0) return { success: false, error: t.quantityPriceMustBePositive };
        if (product.stockKg < quantityKg) return { success: false, error: `${t.insufficientStockOfItem} ${product.stockKg.toLocaleString()} ${t.kilo}. ${t.requestedAmount} ${quantityKg.toLocaleString()} ${t.kilo}.` };

        const currency = currencyCode(settlement.currency);
        const balanceField = currencyField('balanceOwed', currency);
        const receivableField = currencyField('receivableBalance', currency);
        const goodsSettledField = currencyField('goodsSettledAmount', currency);
        const totalAmount = unitQuantity * salePricePerUnit;
        const offsetAmount = Math.min(totalAmount, Number(supplier[balanceField]) || 0);
        const customerDebt = Math.max(0, totalAmount - offsetAmount);
        const timestamp = Date.now();
        const today = new Date().toISOString().split('T')[0];
        const costRatePerKg = Number(product.averageCostPerKg) || 0;
        const costRatePerKgUsd = Number(product.averageCostPerKgUsd) || 0;
        const totalCostOfGoods = costRatePerKg * quantityKg;
        const totalCostOfGoodsUsd = costRatePerKgUsd * quantityKg;
        const lineItem = {
            productId: product.id,
            productName: product.name,
            unitType: settlement.unitType,
            unitQuantity,
            quantityKg,
            salePricePerUnit,
            totalAmount,
        };
        const sale = {
            id: `sale-${timestamp}`,
            billNumber,
            date: today,
            customerId: '',
            customerName: supplier.name,
            customerPhone: supplier.phone || '',
            productId: product.id,
            productName: product.name,
            unitType: settlement.unitType,
            unitQuantity,
            quantityKg,
            salePricePerUnit,
            totalAmount,
            costRatePerKg,
            totalCostOfGoods,
            totalCostOfGoodsUsd,
            profit: (currency === 'AFN' ? totalAmount : 0) - totalCostOfGoods,
            profitUsd: (currency === 'USD' ? totalAmount : 0) - totalCostOfGoodsUsd,
            paidAmount: offsetAmount,
            cashAmount: 0,
            remainingAmount: customerDebt,
            notes: settlement.notes?.trim() || t.supplierGoodsSettlement,
            currency,
            paymentMethod: 'supplier_balance_offset',
            supplierId: supplier.id,
            supplierOffsetAmount: offsetAmount,
            items: [lineItem],
        };
        const nextState = (() => {
            const updatedProcessedStock = db.processedStock.map(item => item.id === product.id ? { ...item, stockKg: Math.max(0, item.stockKg - quantityKg), lastUpdated: today } : item);
            const supplierAfterSettlement = {
                ...supplier,
                [goodsSettledField]: (Number(supplier[goodsSettledField]) || 0) + totalAmount,
            };
            const newSupplierPosition = supplierAccountPosition(supplierAfterSettlement, currency);
            const newSupplierBalance = newSupplierPosition.debt;
            const supplierTransaction = {
                id: `st-${timestamp}`,
                billNumber,
                itemName: product.name,
                quantityKg,
                unitPrice: quantityKg > 0 ? totalAmount / quantityKg : 0,
                unitType: settlement.unitType,
                unitQuantity,
                unitPricePerUnit: salePricePerUnit,
                date: today,
                type: 'goods_settlement',
                description: settlement.notes?.trim() || '',
                amount: totalAmount,
                paidAmount: offsetAmount,
                cashAmount: 0,
                remainingAmount: newSupplierBalance,
                accountBalanceAfter: newSupplierBalance,
                receivableAfter: newSupplierPosition.receivable,
                currency,
                productId: product.id,
                sourceSaleId: sale.id,
                lineItems: [lineItem],
                customerDebt: newSupplierPosition.receivable,
            };
            const updatedSuppliers = db.suppliers.map(item => item.id === supplier.id ? {
                ...supplierAfterSettlement,
                [balanceField]: newSupplierBalance,
                [receivableField]: newSupplierPosition.receivable,
                transactions: [supplierTransaction, ...(item.transactions || [])],
            } : item);
            return { ...db, processedStock: updatedProcessedStock, suppliers: updatedSuppliers, sales: [sale, ...db.sales] };
        })();

        const saved = await commitConfirmedState(nextState, state =>
            state.sales.some(item => item.id === sale.id)
            && state.suppliers.some(item => item.id === supplier.id
                && item.transactions?.some(transaction => transaction.id === `st-${timestamp}`)));
        if (!saved) {
            if (await billNumberExistsInSupabase(billNumber)) return { success: false, error: t.duplicateBillNumber };
            return { success: false, error: t.supplierGoodsSettlementSaveFailed };
        }
        return { success: true, offsetAmount, customerDebt: Math.max(0, totalAmount - offsetAmount) };
    };
    // DELETE SUPPLIER
    const deleteSupplier = (supplierId) => {
        const supplier = db.suppliers.find(item => item.id === supplierId);
        if (!supplier)
            return;
        setDb({
            ...db,
            rawMaterials: db.rawMaterials.filter(material => material.supplierId !== supplierId),
            suppliers: db.suppliers.filter(item => item.id !== supplierId),
            cashInHand: db.cashInHand + Number(supplier.totalPaid || 0),
            cashInHandUsd: (db.cashInHandUsd || 0) + Number(supplier.totalPaidUsd || 0),
        });
        void deleteSupplierFromSupabase(supplierId);
    };
    // 2. PRODUCE A BATCH. A formula is saved only through saveFormulaTemplate.
    const createFormulaAndProduce = async (name, ingredients, description, operatorName, produceBatchImmediately = true, batchExpenses = 0, savedFormulaId = null, batchExpenseCurrency = 'AFN', processingDate) => {
        const materialUsage = new Map();
        for (const ingredient of ingredients) {
            const weight = Number(ingredient.weightKg) || 0;
            materialUsage.set(ingredient.rawMaterialId, (materialUsage.get(ingredient.rawMaterialId) || 0) + weight);
        }
        for (const [rawMaterialId, requiredWeight] of materialUsage) {
            const raw = db.rawMaterials.find(r => r.id === rawMaterialId);
            if (!raw) return { success: false, error: `Raw material not found: ${rawMaterialId}` };
            if (raw.stockKg < requiredWeight) return { success: false, error: `${t.insufficientStockError} (${raw.name}: ${raw.stockKg} kg موجود، ${requiredWeight} kg نیاز است)` };
        }
        const recordDate = normalizeRecordDate(processingDate);
        const operationTimestamp = Date.now();
        const linkedFormulaId = savedFormulaId && db.formulas.some(formula => formula.id === savedFormulaId) ? savedFormulaId : null;
        let totalWeight = 0;
        const costs = { AFN: 0, USD: 0 };
        ingredients.forEach(ing => {
            const raw = db.rawMaterials.find(r => r.id === ing.rawMaterialId);
            totalWeight += Number(ing.weightKg) || 0;
            const weight = Number(ing.weightKg) || 0;
            costs.AFN += weight * rawAverageCostPerKg(raw, 'AFN');
            costs.USD += weight * rawAverageCostPerKg(raw, 'USD');
        });
        const expenseCurrency = currencyCode(batchExpenseCurrency);
        costs[expenseCurrency] += Number(batchExpenses) || 0;
        const costPerKg = totalWeight > 0 ? costs.AFN / totalWeight : 0;
        const costPerKgUsd = totalWeight > 0 ? costs.USD / totalWeight : 0;
        const newBatch = {
            id: `batch-${operationTimestamp}`, formulaId: linkedFormulaId, formulaName: name, date: recordDate,
            totalWeightKg: totalWeight, costPerKg, costPerKgUsd, totalCost: costs.AFN, totalCostUsd: costs.USD,
            operatorName: operatorName || 'مسئول تولید',
            notes: description || `پروسس خودکار: ${name} (${totalWeight.toLocaleString()} کیلو)`,
        };
        const updatedRaw = db.rawMaterials.map(rm => {
            const usedWeight = materialUsage.get(rm.id) || 0;
            return usedWeight > 0 ? { ...rm, stockKg: Math.max(0, rm.stockKg - usedWeight) } : rm;
        });
        const normalizedProductName = normalizeStockName(name);
        const existingProcessedIndex = db.processedStock.findIndex(ps => normalizeStockName(ps.name) === normalizedProductName);
        let updatedProcessedStock;
        if (existingProcessedIndex >= 0) {
            const existing = db.processedStock[existingProcessedIndex];
            const newTotalKg = existing.stockKg + totalWeight;
            const avgAfn = newTotalKg > 0 ? ((existing.stockKg * (existing.averageCostPerKg || 0)) + costs.AFN) / newTotalKg : costPerKg;
            const avgUsd = newTotalKg > 0 ? ((existing.stockKg * (existing.averageCostPerKgUsd || 0)) + costs.USD) / newTotalKg : costPerKgUsd;
            updatedProcessedStock = [...db.processedStock];
            updatedProcessedStock[existingProcessedIndex] = { ...existing, stockKg: newTotalKg, averageCostPerKg: avgAfn, averageCostPerKgUsd: avgUsd, lastUpdated: recordDate };
        } else {
            updatedProcessedStock = [{ id: `ps-${operationTimestamp}`, name: name.trim(), formulaId: linkedFormulaId, stockKg: totalWeight, averageCostPerKg: costPerKg, averageCostPerKgUsd: costPerKgUsd, lastUpdated: recordDate }, ...db.processedStock];
        }
        const expense = Number(batchExpenses) > 0 ? { id: `exp-${operationTimestamp}`, date: recordDate, category: 'electricity', description: `مصارف تولید بچ: ${name}`, amount: Number(batchExpenses), currency: expenseCurrency, paidBy: operatorName || 'مسئول فابریکه' } : null;
        const nextState = { ...db, rawMaterials: updatedRaw, processedStock: updatedProcessedStock, formulas: db.formulas, productionBatches: produceBatchImmediately ? [newBatch, ...db.productionBatches] : db.productionBatches, expenses: expense ? [expense, ...db.expenses] : db.expenses, ...(expense ? cashPatch(db, -expense.amount, expense.currency) : {}) };
        const expectedProduct = updatedProcessedStock.find(item => normalizeStockName(item.name) === normalizedProductName);
        const saved = await commitConfirmedState(nextState, state =>
            state.productionBatches.some(batch => batch.id === newBatch.id)
            && state.processedStock.some(item => item.id === expectedProduct?.id
                && Math.abs(item.stockKg - expectedProduct.stockKg) < 0.001)
            && updatedRaw.filter(item => materialUsage.has(item.id)).every(expected =>
                state.rawMaterials.some(item => item.id === expected.id
                    && Math.abs(item.stockKg - expected.stockKg) < 0.001)));
        if (!saved) return { success: false, error: 'The production batch was not saved to the database.' };
        return { success: true };
    };
    // SAVE OR UPDATE A REUSABLE FORMULA WITHOUT PRODUCING A BATCH
    const saveFormulaTemplate = async (name, ingredients, description, formulaId) => {
        if (!name.trim())
            return { success: false, error: t.pleaseEnterFormulaName };
        let totalWeight = 0;
        const totalCosts = { AFN: 0, USD: 0 };
        const populatedIngredients = [];
        for (const ingredient of ingredients) {
            const raw = db.rawMaterials.find(item => item.id === ingredient.rawMaterialId);
            const weight = Number(ingredient.weightKg) || 0;
            if (!raw || weight <= 0)
                return { success: false, error: t.invalidRawMaterialSelected };
            const ingredientCostAfn = weight * rawAverageCostPerKg(raw, 'AFN');
            const ingredientCostUsd = weight * rawAverageCostPerKg(raw, 'USD');
            totalWeight += weight;
            totalCosts.AFN += ingredientCostAfn;
            totalCosts.USD += ingredientCostUsd;
            populatedIngredients.push({
                rawMaterialId: raw.id,
                rawMaterialName: raw.name,
                weightKg: weight,
                costPerKg: rawAverageCostPerKg(raw, 'AFN'),
                costPerKgUsd: rawAverageCostPerKg(raw, 'USD'),
                totalCost: ingredientCostAfn,
                totalCostUsd: ingredientCostUsd,
            });
        }
        if (totalWeight <= 0)
            return { success: false, error: t.totalWeightMustBePositive };
        const id = formulaId || `form-${Date.now()}`;
        const existing = db.formulas.find(formula => formula.id === id);
        const formula = {
            id,
            name: name.trim(),
            description,
            ingredients: populatedIngredients,
            totalWeightKg: totalWeight,
            totalBatchCost: totalCosts.AFN,
            totalBatchCostUsd: totalCosts.USD,
            costPerKg: totalCosts.AFN / totalWeight,
            costPerKgUsd: totalCosts.USD / totalWeight,
            createdDate: existing?.createdDate || new Date().toISOString().split('T')[0],
        };
        const nextState = {
            ...db,
            formulas: existing
                ? db.formulas.map(item => item.id === id ? formula : item)
                : [formula, ...db.formulas],
        };
        const saved = await commitConfirmedState(nextState, state =>
            state.formulas.some(item => item.id === id));
        if (!saved)
            return { success: false, error: 'The formula was not saved to the database.' };
        return { success: true, formulaId: id };
    };
    // DELETE FORMULA
    const deleteFormula = (formulaId) => {
        setDb(prev => ({
            ...prev,
            formulas: prev.formulas.filter(f => f.id !== formulaId),
            productionBatches: prev.productionBatches.map(batch => batch.formulaId === formulaId
                ? { ...batch, formulaId: null }
                : batch),
            processedStock: prev.processedStock.map(item => item.formulaId === formulaId
                ? { ...item, formulaId: null }
                : item),
        }));
        deleteFormulaFromSupabase(formulaId);
    };
    // 3. RECORD SALE (DEDUCT PROCESSED STOCK, AUTO-UPDATE CUSTOMER, ADD CASH)
    const recordSale = async (saleData) => {
        const billNumber = cleanBillNumber(saleData.billNumber);
        if (!billNumber) return { success: false, error: t.billNumberRequired };
        if (billNumberExists(db.sales, billNumber)) return { success: false, error: t.duplicateBillNumber };
        if (await billNumberExistsInSupabase(billNumber)) return { success: false, error: t.duplicateBillNumber };
        const requestedCustomerKey = normalizePartyName(saleData.customerName);
        const matchesSupplier = requestedCustomerKey && (
            canonicalSupplierNames.has(requestedCustomerKey)
            || db.suppliers.some(supplier => normalizePartyName(supplier.name) === requestedCustomerKey)
        );
        if (matchesSupplier) {
            return { success: false, error: t.supplierMustUseGoodsSettlement };
        }

        const requestedItems = Array.isArray(saleData.items) && saleData.items.length
            ? saleData.items
            : [{
                productId: saleData.productId,
                productName: saleData.productName,
                unitType: saleData.unitType,
                unitQuantity: saleData.unitQuantity,
                salePricePerUnit: saleData.salePricePerUnit,
            }];
        const normalizedItems = [];
        for (const requestedItem of requestedItems) {
            let product = requestedItem.productId
                ? db.processedStock.find(item => item.id === requestedItem.productId)
                : undefined;
            if (!product && requestedItem.productName) {
                product = db.processedStock.find(item => item.name.toLowerCase() === String(requestedItem.productName).trim().toLowerCase());
            }
            const unitQuantity = Number(requestedItem.unitQuantity);
            const salePricePerUnit = Number(requestedItem.salePricePerUnit);
            const unitType = requestedItem.unitType || 'bag';
            if (!product || !Number.isFinite(unitQuantity) || unitQuantity <= 0 || !Number.isFinite(salePricePerUnit) || salePricePerUnit <= 0) {
                return { success: false, error: t.saleItemsRequired || t.quantityPriceMustBePositive };
            }
            const quantityKg = convertToKg(unitType, unitQuantity);
            normalizedItems.push({
                productId: product.id,
                productName: product.name,
                unitType,
                unitQuantity,
                quantityKg,
                salePricePerUnit,
                totalAmount: unitQuantity * salePricePerUnit,
                costRatePerKg: Number(product.averageCostPerKg) || 0,
                costRatePerKgUsd: Number(product.averageCostPerKgUsd) || 0,
            });
        }

        const requestedStockByProduct = normalizedItems.reduce((usage, item) => {
            usage.set(item.productId, (usage.get(item.productId) || 0) + item.quantityKg);
            return usage;
        }, new Map());
        for (const [productId, requestedKg] of requestedStockByProduct) {
            const product = db.processedStock.find(item => item.id === productId);
            if (!product || product.stockKg < requestedKg) {
                return {
                    success: false,
                    error: `${t.insufficientStockOfItem} "${product?.name || ''}"! ${t.currentStockLabel}: ${Number(product?.stockKg || 0).toLocaleString()} ${t.kilo}, ${t.requestedAmount} ${requestedKg.toLocaleString()} ${t.kilo}.`
                };
            }
        }

        const currency = currencyCode(saleData.currency);
        const quantityKg = normalizedItems.reduce((sum, item) => sum + item.quantityKg, 0);
        const totalAmount = normalizedItems.reduce((sum, item) => sum + item.totalAmount, 0);
        const paidAmount = Math.min(Math.max(0, Number(saleData.paidAmount) || 0), totalAmount);
        if (saleData.customerPhone?.trim() && !/^\d{10}$/.test(saleData.customerPhone.trim())) {
            return { success: false, error: t.phoneMustBe10Digits };
        }
        if (Number(saleData.paidAmount) > totalAmount) {
            return { success: false, error: t.paidAmountExceedsTotal };
        }
        const remainingAmount = Math.max(0, totalAmount - paidAmount);
        const totalCostOfGoods = normalizedItems.reduce((sum, item) => sum + (item.costRatePerKg * item.quantityKg), 0);
        const totalCostOfGoodsUsd = normalizedItems.reduce((sum, item) => sum + (item.costRatePerKgUsd * item.quantityKg), 0);
        const costRatePerKg = quantityKg > 0 ? totalCostOfGoods / quantityKg : 0;
        const profit = (currency === 'AFN' ? totalAmount : 0) - totalCostOfGoods;
        const profitUsd = (currency === 'USD' ? totalAmount : 0) - totalCostOfGoodsUsd;
        const today = new Date().toISOString().split('T')[0];
        const operationTimestamp = Date.now();
        const saleId = `sale-${operationTimestamp}`;
        const customerTransactionId = `ct-${operationTimestamp}`;
        const firstItem = normalizedItems[0];
        const storedItems = normalizedItems.map(({ costRatePerKg: _costRatePerKg, costRatePerKgUsd: _costRatePerKgUsd, ...item }) => item);
        const newSale = {
            id: saleId,
            billNumber,
            date: today,
            customerId: saleData.customerId || '',
            customerName: saleData.customerName.trim(),
            customerPhone: saleData.customerPhone?.trim(),
            productId: firstItem.productId,
            productName: firstItem.productName,
            unitType: firstItem.unitType,
            unitQuantity: firstItem.unitQuantity,
            quantityKg,
            salePricePerUnit: firstItem.salePricePerUnit,
            totalAmount,
            costRatePerKg,
            totalCostOfGoods,
            totalCostOfGoodsUsd,
            profit,
            profitUsd,
            paidAmount,
            cashAmount: paidAmount,
            remainingAmount,
            notes: saleData.notes?.trim(),
            currency,
            items: storedItems,
        };
        const nextState = (() => {
            const prev = db;
            // 1. Deduct every product line from processed stock once.
            const updatedProcessedStock = prev.processedStock.map(product => {
                const usedKg = requestedStockByProduct.get(product.id) || 0;
                return usedKg > 0
                    ? { ...product, stockKg: Math.max(0, product.stockKg - usedKg), lastUpdated: today }
                    : product;
            });
            // 2. Auto register/update customer
            let updatedCustomers = [...prev.customers];
            let assignedCustId = saleData.customerId;
            const custName = saleData.customerName.trim();
            const existingCustIndex = updatedCustomers.findIndex(c => (saleData.customerId && c.id === saleData.customerId) ||
                normalizePartyName(c.name) === normalizePartyName(custName) ||
                (saleData.customerPhone?.trim() && c.phone === saleData.customerPhone.trim()));
            const customerTransaction = {
                id: customerTransactionId,
                billNumber,
                itemName: firstItem.productName,
                productId: firstItem.productId,
                sourceSaleId: saleId,
                lineItems: storedItems,
                quantityKg,
                unitPrice: quantityKg > 0 ? totalAmount / quantityKg : 0,
                unitType: firstItem.unitType,
                unitQuantity: firstItem.unitQuantity,
                unitPricePerUnit: firstItem.salePricePerUnit,
                date: today,
                type: 'sale',
                description: saleData.notes?.trim() || '',
                amount: totalAmount,
                paidAmount,
                cashAmount: paidAmount,
                remainingAmount: remainingAmount,
                currency,
            };
            if (existingCustIndex >= 0) {
                const existing = updatedCustomers[existingCustIndex];
                assignedCustId = existing.id;
                const availableCredit = customerAccountPosition(existing, currency).credit;
                const creditApplied = Math.min(availableCredit, Math.max(0, totalAmount - paidAmount));
                const customerAfterSale = applyCustomerSale(existing, totalAmount, paidAmount, currency);
                newSale.paidAmount = paidAmount + creditApplied;
                newSale.remainingAmount = Math.max(0, totalAmount - newSale.paidAmount);
                customerTransaction.paidAmount = newSale.paidAmount;
                customerTransaction.remainingAmount = newSale.remainingAmount;
                const updatedCust = {
                    ...customerAfterSale,
                    phone: saleData.customerPhone || existing.phone,
                    transactions: [{ ...customerTransaction, accountBalanceAfter: customerAfterSale[currencyField('balanceOwed', currency)] }, ...existing.transactions],
                };
                updatedCustomers[existingCustIndex] = updatedCust;
            }
            else {
                assignedCustId = `cust-${Date.now()}`;
                const newCust = {
                    id: assignedCustId,
                    name: custName,
                    phone: saleData.customerPhone || '',
                    totalPurchasedAmount: currency === 'AFN' ? totalAmount : 0,
                    totalPurchasedAmountUsd: currency === 'USD' ? totalAmount : 0,
                    totalPaid: currency === 'AFN' ? paidAmount : 0,
                    totalPaidUsd: currency === 'USD' ? paidAmount : 0,
                    rawSettledAmount: 0,
                    rawSettledAmountUsd: 0,
                    accountCharges: 0,
                    accountChargesUsd: 0,
                    creditBalance: 0,
                    creditBalanceUsd: 0,
                    balanceOwed: currency === 'AFN' ? remainingAmount : 0,
                    balanceOwedUsd: currency === 'USD' ? remainingAmount : 0,
                    transactions: [{ ...customerTransaction, accountBalanceAfter: remainingAmount }],
                    createdAt: today,
                };
                updatedCustomers.unshift(newCust);
            }
            newSale.customerId = assignedCustId;
            return {
                ...prev,
                processedStock: updatedProcessedStock,
                customers: updatedCustomers,
                sales: [newSale, ...prev.sales],
                ...cashPatch(prev, paidAmount, currency),
            };
        })();
        const saved = await commitConfirmedState(nextState, state =>
            state.sales.some(sale => sale.id === saleId)
            && state.customers.some(customer => customer.id === newSale.customerId
                && customer.transactions?.some(transaction => transaction.id === customerTransactionId)));
        if (!saved) {
            if (await billNumberExistsInSupabase(billNumber)) return { success: false, error: t.duplicateBillNumber };
            return { success: false, error: 'The sale was not saved to the database.' };
        }
        return { success: true };
    };
    // RECEIVE RAW MATERIAL FROM A CUSTOMER AS A NON-CASH DEBT SETTLEMENT.
    // The customer remains on the customer ledger; any value above their debt
    // becomes customer credit (money we owe them), never a supplier record.
    const settleCustomerWithRawMaterial = async (settlement) => {
        const customer = db.customers.find(item => item.id === settlement.customerId);
        const name = String(settlement.materialName || '').trim();
        const category = 'Uncategorized';
        const unitQuantity = Number(settlement.unitQuantity);
        const unitPriceForSelectedUnit = Number(settlement.unitPrice);
        const quantityKg = convertToKg(settlement.unitType, unitQuantity);
        const selectedUnitWeightKg = convertToKg(settlement.unitType, 1);
        const unitPricePerKg = unitPriceForSelectedUnit / selectedUnitWeightKg;
        if (!customer || !name) return { success: false, error: t.invalidCustomerOrMaterial };
        if (!Number.isFinite(unitQuantity) || unitQuantity <= 0 || !Number.isFinite(unitPriceForSelectedUnit) || unitPriceForSelectedUnit <= 0) return { success: false, error: t.quantityPriceMustBePositive };

        const currency = currencyCode(settlement.currency);
        const customerBalanceField = currencyField('balanceOwed', currency);
        const customerCreditField = currencyField('creditBalance', currency);
        const rawSettledField = currencyField('rawSettledAmount', currency);
        const totalValue = unitQuantity * unitPriceForSelectedUnit;
        const currentCustomerBalance = customerOutstandingBalance(customer, currency);
        const customerOffset = Math.min(totalValue, currentCustomerBalance);
        const customerCreditCreated = Math.max(0, totalValue - customerOffset);
        const timestamp = Date.now();
        const today = new Date().toISOString().split('T')[0];
        const existingMaterialIndex = db.rawMaterials.findIndex(material => normalizeStockName(material.name) === normalizeStockName(name));
        const rawMaterialId = existingMaterialIndex >= 0 ? db.rawMaterials[existingMaterialIndex].id : `rm-${timestamp}`;

        const nextState = (() => {
            const updatedRawSettledAmount = (Number(customer[rawSettledField]) || 0) + totalValue;
            const customerAfterSettlement = {
                ...customer,
                [rawSettledField]: updatedRawSettledAmount,
            };
            const newCustomerPosition = customerAccountPosition(customerAfterSettlement, currency);
            const newCustomerBalance = newCustomerPosition.debt;
            const customerTransaction = {
                id: `ct-${timestamp}`,
                rawMaterialId,
                itemName: name,
                quantityKg,
                unitPrice: unitPricePerKg,
                unitType: settlement.unitType,
                unitQuantity,
                unitPricePerUnit: unitPriceForSelectedUnit,
                date: today,
                type: 'raw_goods_settlement',
                description: `${t.customerRawSettlement}: ${name} (${quantityKg.toLocaleString()} ${t.kilo})`,
                amount: totalValue,
                paidAmount: customerOffset,
                cashAmount: 0,
                remainingAmount: newCustomerBalance,
                accountBalanceAfter: newCustomerBalance,
                currency,
            };
            const updatedCustomers = db.customers.map(item => item.id === customer.id ? {
                ...customerAfterSettlement,
                [customerBalanceField]: newCustomerBalance,
                [customerCreditField]: newCustomerPosition.credit,
                transactions: [customerTransaction, ...(item.transactions || [])],
            } : item);

            const updatedRawMaterials = [...db.rawMaterials];
            if (existingMaterialIndex >= 0) {
                const material = updatedRawMaterials[existingMaterialIndex];
                const oldWeight = Number(material.stockKg) || 0;
                const newWeight = oldWeight + quantityKg;
                const movingAverage = addToRawMovingAverage(material, quantityKg, unitPricePerKg, currency);
                updatedRawMaterials[existingMaterialIndex] = {
                    ...material,
                    stockKg: newWeight,
                    unitPrice: unitPricePerKg,
                    category,
                    currency,
                    ...movingAverage,
                    customerId: customer.id,
                    notes: settlement.notes?.trim() || material.notes,
                    dateAdded: today,
                };
            } else {
                updatedRawMaterials.unshift({
                    id: rawMaterialId,
                    name,
                    category,
                    stockKg: quantityKg,
                    unitPrice: unitPricePerKg,
                    currency,
                    averageCostPerKg: currency === 'AFN' ? unitPricePerKg : 0,
                    averageCostPerKgUsd: currency === 'USD' ? unitPricePerKg : 0,
                    customerId: customer.id,
                    dateAdded: today,
                    notes: settlement.notes?.trim() || t.customerRawSettlement,
                    lowStockThreshold: settlement.lowStockThreshold === '' || settlement.lowStockThreshold == null ? undefined : Number(settlement.lowStockThreshold),
                });
            }
            const updatedCustomer = updatedCustomers.find(item => item.id === customer.id);
            const updatedSales = reconcileCustomerSales(db.sales, updatedCustomer, currency);
            return { ...db, customers: updatedCustomers, rawMaterials: updatedRawMaterials, sales: updatedSales };
        })();

        const transactionId = `ct-${timestamp}`;
        const saved = await commitConfirmedState(nextState, state =>
            state.customers.some(item => item.id === customer.id
                && item.transactions?.some(transaction => transaction.id === transactionId))
            && state.rawMaterials.some(item => item.id === rawMaterialId));
        if (!saved) return { success: false, error: t.customerRawSettlementSaveFailed };
        return { success: true, customerOffset, supplierDebt: customerCreditCreated, customerCreditCreated };
    };
    // RECEIVE PAYMENT FROM CUSTOMER
    const receiveCustomerPayment = async (customerId, amount, note, currency = 'AFN') => {
        if (amount <= 0)
            return { success: false, error: 'Payment must be greater than zero.' };
        const today = new Date().toISOString().split('T')[0];
        const transactionId = `ct-${Date.now()}`;
        const nextState = (() => {
            const prev = db;
            const custIndex = prev.customers.findIndex(c => c.id === customerId);
            if (custIndex === -1)
                return null;
            const cust = prev.customers[custIndex];
            currency = currencyCode(currency);
            const balanceField = currencyField('balanceOwed', currency);
            const creditField = currencyField('creditBalance', currency);
            const paidField = currencyField('totalPaid', currency);
            const actualReceived = Number(amount);
            const customerAfterPayment = {
                ...cust,
                [paidField]: (Number(cust[paidField]) || 0) + actualReceived,
            };
            const newPosition = customerAccountPosition(customerAfterPayment, currency);
            const newRemaining = newPosition.debt;
            const transaction = {
                id: transactionId,
                date: today,
                type: 'payment',
                description: note || 'دریافت طلب و باقی‌داری مشتری',
                amount: 0,
                paidAmount: actualReceived,
                cashAmount: actualReceived,
                remainingAmount: newRemaining,
                currency,
            };
            const updatedCustomers = [...prev.customers];
            const updatedCust = {
                ...customerAfterPayment,
                [balanceField]: newRemaining,
                [creditField]: newPosition.credit,
                transactions: [transaction, ...cust.transactions],
            };
            updatedCustomers[custIndex] = updatedCust;
            const updatedSales = reconcileCustomerSales(prev.sales, updatedCust, currency);
            return {
                ...prev,
                customers: updatedCustomers,
                sales: updatedSales,
                ...cashPatch(prev, actualReceived, currency),
            };
        })();
        if (!nextState)
            return { success: false, error: 'Customer was not found.' };
        const saved = await commitConfirmedState(nextState, state =>
            state.customers.some(customer => customer.id === customerId
                && customer.transactions?.some(transaction => transaction.id === transactionId)));
        if (!saved)
            return { success: false, error: 'The customer payment was not saved to the database.' };
        return { success: true };
    };
    // Add an outgoing customer-account entry. Both supported entry types move
    // the customer's single net account toward debt to the factory and reduce
    // cash in hand; neither one changes sales or inventory.
    const addCustomerAccountEntry = async ({ customerId, type, amount, currency = 'AFN', date, note }) => {
        const numericAmount = Number(amount);
        if (!Number.isFinite(numericAmount) || numericAmount <= 0)
            return { success: false, error: t.accountEntryAmountRequired };
        if (!['cash_given', 'transport_fee'].includes(type))
            return { success: false, error: t.accountEntryTypeRequired };
        if (!db.customers.some(customer => customer.id === customerId))
            return { success: false, error: t.customerNotFound };
        const result = await addCustomerAccountEntryInSupabase({
            customerId,
            type,
            amount: numericAmount,
            currency: currencyCode(currency),
            date: normalizeRecordDate(date),
            description: String(note || '').trim(),
        });
        if (!result?.success)
            return { success: false, error: result?.error || t.accountEntrySaveFailed };
        const refreshed = await loadStateFromSupabase();
        if (!refreshed?.state)
            return { success: false, error: t.historyReloadFailed };
        lastSyncedState.current = JSON.stringify(refreshed.state);
        persistedStateRef.current = refreshed.state;
        pendingStateRef.current = null;
        setDb(refreshed.state);
        setIsSupabaseConnected(true);
        setDatabaseError(null);
        return { success: true };
    };
    // DELETE CUSTOMER
    const deleteCustomer = (customerId) => {
        setDb(prev => ({
            ...prev,
            customers: prev.customers.filter(c => c.id !== customerId),
        }));
        deleteCustomerFromSupabase(customerId);
    };
    // 4. ADD EXPENSE (AUTOMATICALLY DEDUCT FROM CASH IN HAND)
    const addExpense = (expense) => {
        const today = new Date().toISOString().split('T')[0];
        const newExpense = {
            ...expense,
            id: `exp-${Date.now()}`,
            date: today,
        };
        setDb(prev => ({
            ...prev,
            expenses: [newExpense, ...prev.expenses],
            ...cashPatch(prev, -expense.amount, expense.currency),
        }));
    };
    // DELETE EXPENSE
    const deleteExpense = (id) => {
        setDb(prev => {
            const exp = prev.expenses.find(e => e.id === id);
            const restoreCash = exp ? exp.amount : 0;
            return {
                ...prev,
                expenses: prev.expenses.filter(e => e.id !== id),
                ...cashPatch(prev, restoreCash, exp?.currency),
            };
        });
        deleteExpenseFromSupabase(id);
    };
    // BACKUP & RESTORE
    const exportDatabase = () => {
        const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(JSON.stringify(db, null, 2))}`;
        const downloadAnchor = document.createElement('a');
        downloadAnchor.setAttribute('href', jsonString);
        downloadAnchor.setAttribute('download', `al_makkah_poultry_feed_backup_${new Date().toISOString().split('T')[0]}.json`);
        document.body.appendChild(downloadAnchor);
        downloadAnchor.click();
        downloadAnchor.remove();
    };
    const importDatabase = (jsonData) => {
        try {
            const parsed = JSON.parse(jsonData);
            if (parsed.rawMaterials && parsed.processedStock && parsed.suppliers && parsed.customers) {
                setDb(parsed);
                writeStateToSupabase(parsed);
                return true;
            }
            return false;
        }
        catch (e) {
            console.error(e);
            return false;
        }
    };
    const resetToDefaultData = async () => {
        const cleared = await clearAllDataFromSupabase();
        if (cleared) {
            setDb(emptyFactoryData);
            setDatabaseError(null);
        }
        return cleared;
    };
    // Low Stock Materials calculated per individual item threshold
    const lowStockMaterials = db.rawMaterials.filter(r => r.stockKg <= (r.lowStockThreshold !== undefined ? r.lowStockThreshold : lowStockThreshold));
    // User-entered raw and processed stock names are never translated.
    const getLocalizedName = (name) => name;
    const getLocalizedTxType = (type) => getLocalizedTransactionType(type, lang);
    const getLocalizedTxDesc = (desc) => getLocalizedTransactionDescription(desc, lang);
    return (<DatabaseContext.Provider value={{
            db,
            lang,
            t,
            setLang,
            user,
            login,
            logout,
            isAuthLoading,
            isDatabaseLoading,
            lowStockThreshold,
            setLowStockThreshold,
            updateRawMaterialThreshold,
            updateRawMaterial,
            updateSupplier,
            updateCustomer,
            updateSupplierTransaction,
            voidSupplierTransaction,
            updateCustomerTransaction,
            voidCustomerTransaction,
            lowStockMaterials,
            getLocalizedName,
            getLocalizedTxType,
            getLocalizedTxDesc,
            isSupabaseConnected,
            databaseError,
            addRawMaterial,
            restockRawMaterial,
            deleteRawMaterial,
            settleSupplierPayment,
            settleSupplierWithProcessedStock,
            deleteSupplier,
            createFormulaAndProduce,
            saveFormulaTemplate,
            deleteFormula,
            recordSale,
            receiveCustomerPayment,
            addCustomerAccountEntry,
            settleCustomerWithRawMaterial,
            deleteCustomer,
            addExpense,
            deleteExpense,
            exportDatabase,
            importDatabase,
            resetToDefaultData,
        }}>
      {children}
    </DatabaseContext.Provider>);
};
export const useDatabase = () => {
    const context = useContext(DatabaseContext);
    if (!context) {
        throw new Error('useDatabase must be used within a DatabaseProvider');
    }
    return context;
};
