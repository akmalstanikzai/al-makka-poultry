import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { translations, getLocalizedItemName, getLocalizedCategory, getLocalizedTransactionType, getLocalizedTransactionDescription } from '../translations';
import { supabase, supabaseConfigurationError } from '../lib/supabase';
import { clearAllDataFromSupabase, loadFactorySettings, loadStateFromSupabase, saveLowStockThreshold, seedInitialDataToSupabase, sbDeleteCustomer, sbDeleteRawMaterial, sbDeleteSupplier, sbDeleteExpense, sbDeleteFormula } from '../lib/supabaseSync';
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
const currencyField = (field, currency) => currencyCode(currency) === 'USD' ? field + 'Usd' : field;
const addCurrencyValue = (record, field, amount, currency) => ({ ...record, [currencyField(field, currency)]: (Number(record[currencyField(field, currency)]) || 0) + (Number(amount) || 0) });
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
    const localWritesInProgress = useRef(0);
    const pendingStateRef = useRef(null);
    const connectionRef = useRef(false);
    const reconnectTimerRef = useRef(null);
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
                        window.dispatchEvent(new Event('supabase-reconnect-request'));
                    }
                });
            } else window.dispatchEvent(new Event('supabase-reconnect-request'));
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
    useEffect(() => { connectionRef.current = isSupabaseConnected; }, [isSupabaseConnected]);
    // Initial load, health checks, and automatic reconnection.
    useEffect(() => {
        if (!supabase || isAuthLoading || !user) {
            setIsSupabaseConnected(false);
            if (!isAuthLoading) setIsDatabaseLoading(false);
            return;
        }
        let isMounted = true;
        let isInitialLoadComplete = false;
        let retryDelay = 1500;
        isRemoteStateReady.current = false;
        lastSyncedState.current = null;
        setIsDatabaseLoading(true);

        const clearReconnectTimer = () => {
            if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
            reconnectTimerRef.current = null;
        };
        const scheduleReconnect = () => {
            if (!isMounted || reconnectTimerRef.current) return;
            reconnectTimerRef.current = setTimeout(() => {
                reconnectTimerRef.current = null;
                void reconnect();
            }, retryDelay);
            retryDelay = Math.min(retryDelay * 2, 30000);
        };
        const reconnect = async () => {
            if (!isMounted || !navigator.onLine) { scheduleReconnect(); return; }
            // Pending local data is always saved before accepting a remote snapshot.
            if (pendingStateRef.current) {
                localWritesInProgress.current += 1;
                const pending = pendingStateRef.current;
                const saved = await seedInitialDataToSupabase(pending).finally(() => {
                    localWritesInProgress.current = Math.max(0, localWritesInProgress.current - 1);
                });
                if (!isMounted) return;
                if (!saved) { setIsSupabaseConnected(false); scheduleReconnect(); return; }
                pendingStateRef.current = null;
                lastSyncedState.current = JSON.stringify(pending);
            }
            const result = await loadStateFromSupabase();
            if (!isMounted) return;
            if (!result) {
                setIsSupabaseConnected(false);
                setDatabaseError('Supabase connection was interrupted. Reconnecting automatically…');
                setIsDatabaseLoading(false);
                scheduleReconnect();
                return;
            }
            clearReconnectTimer();
            retryDelay = 1500;
            setIsSupabaseConnected(true);
            setDatabaseError(null);
            isInitialLoadComplete = true;
            isRemoteStateReady.current = true;
            setIsDatabaseLoading(false);
            // Do not replace local data after saving a pending snapshot.
            if (!pendingStateRef.current) {
                lastSyncedState.current = JSON.stringify(result.state);
                setDb(result.state);
            }
            if (result.salesReconciliationNeeded) {
                localWritesInProgress.current += 1;
                void seedInitialDataToSupabase(result.state).finally(() => {
                    localWritesInProgress.current = Math.max(0, localWritesInProgress.current - 1);
                });
            }
            void loadFactorySettings().then(settings => {
                if (isMounted && settings?.lowStockThreshold) setLowStockThresholdState(settings.lowStockThreshold);
            });
        };

        void reconnect();
        const channel = supabase.channel('supabase-live-sync')
            .on('postgres_changes', { event: '*', schema: 'public' }, () => {
                if (!isInitialLoadComplete || localWritesInProgress.current > 0 || pendingStateRef.current) return;
                void loadStateFromSupabase().then(result => {
                    if (isMounted && result) {
                        setIsSupabaseConnected(true); setDatabaseError(null);
                        lastSyncedState.current = JSON.stringify(result.state); setDb(result.state);
                    } else if (isMounted) scheduleReconnect();
                });
            })
            .subscribe(status => {
                if (!isMounted) return;
                if (status === 'SUBSCRIBED' && isInitialLoadComplete && isRemoteStateReady.current) {
                    setIsSupabaseConnected(true);
                    if (!pendingStateRef.current) setDatabaseError(null);
                } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
                    setIsSupabaseConnected(false);
                    scheduleReconnect();
                }
            });
        const retryNow = () => { clearReconnectTimer(); retryDelay = 1500; void reconnect(); };
        const handleVisibility = () => { if (document.visibilityState === 'visible') retryNow(); };
        window.addEventListener('online', retryNow);
        window.addEventListener('focus', retryNow);
        window.addEventListener('supabase-reconnect-request', retryNow);
        document.addEventListener('visibilitychange', handleVisibility);
        const healthInterval = setInterval(() => { if (!connectionRef.current || pendingStateRef.current) retryNow(); }, 30000);
        return () => {
            isMounted = false; clearReconnectTimer(); clearInterval(healthInterval);
            window.removeEventListener('online', retryNow);
            window.removeEventListener('focus', retryNow);
            window.removeEventListener('supabase-reconnect-request', retryNow);
            document.removeEventListener('visibilitychange', handleVisibility);
            supabase.removeChannel(channel);
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
                localWritesInProgress.current += 1;
                const saved = await seedInitialDataToSupabase(db).finally(() => {
                    localWritesInProgress.current = Math.max(0, localWritesInProgress.current - 1);
                });
                if (saved) {
                    if (cancelled) return;
                    pendingStateRef.current = null;
                    lastSyncedState.current = stateHash;
                    setIsSupabaseConnected(true);
                    setDatabaseError(null);
                    return;
                }
                await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
            }
            if (!cancelled) {
                setIsSupabaseConnected(false);
                setDatabaseError('The database connection was interrupted. Your change is retained and will be saved automatically when Supabase reconnects.');
                window.dispatchEvent(new Event('supabase-reconnect-request'));
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
    const addRawMaterial = (item, paidAmount, supplierPhone) => {
        const today = new Date().toISOString().split('T')[0];
        const newId = `rm-${Date.now()}`;
        const currency = currencyCode(item.currency);
        const totalBill = item.stockKg * item.unitPrice;
        const remaining = Math.max(0, totalBill - paidAmount);
        const newItem = {
            ...item,
            id: newId,
            dateAdded: today,
        };
        setDb(prev => {
            let updatedSuppliers = [...prev.suppliers];
            let assignedSupplierId = item.supplierId;
            if (item.supplierName && item.supplierName.trim()) {
                const supName = item.supplierName.trim();
                const existingSupIndex = updatedSuppliers.findIndex(s => s.id === item.supplierId || s.name.toLowerCase() === supName.toLowerCase());
                const transaction = {
                    id: `st-${Date.now()}`,
                    rawMaterialId: newId,
                    date: today,
                    type: 'purchase',
                    description: `خرید ${item.name} (${item.stockKg.toLocaleString()} کیلو)`,
                    amount: totalBill,
                    paidAmount: paidAmount,
                    remainingAmount: remaining,
                    currency,
                };
                if (existingSupIndex >= 0) {
                    const sup = updatedSuppliers[existingSupIndex];
                    assignedSupplierId = sup.id;
                    const updatedSup = {
                        ...sup,
                        phone: supplierPhone || sup.phone,
                        ...addCurrencyValue(addCurrencyValue(addCurrencyValue(sup, 'totalPurchasedAmount', totalBill, currency), 'totalPaid', paidAmount, currency), 'balanceOwed', remaining, currency),
                        transactions: [transaction, ...sup.transactions],
                    };
                    updatedSuppliers[existingSupIndex] = updatedSup;
                }
                else {
                    assignedSupplierId = `sup-${Date.now()}`;
                    const newSup = {
                        id: assignedSupplierId,
                        name: supName,
                        phone: supplierPhone || '',
                        totalPurchasedAmount: currency === 'AFN' ? totalBill : 0,
                        totalPurchasedAmountUsd: currency === 'USD' ? totalBill : 0,
                        totalPaid: currency === 'AFN' ? paidAmount : 0,
                        totalPaidUsd: currency === 'USD' ? paidAmount : 0,
                        balanceOwed: currency === 'AFN' ? remaining : 0,
                        balanceOwedUsd: currency === 'USD' ? remaining : 0,
                        goodsSettledAmount: 0,
                        goodsSettledAmountUsd: 0,
                        transactions: [transaction],
                        createdAt: today,
                    };
                    updatedSuppliers.unshift(newSup);
                }
            }
            newItem.supplierId = assignedSupplierId;
            return {
                ...prev,
                rawMaterials: [newItem, ...prev.rawMaterials],
                suppliers: updatedSuppliers,
                ...cashPatch(prev, -paidAmount, currency),
            };
        });
    };
    // RESTOCK AN EXISTING RAW MATERIAL & RECORD THE SUPPLIER PURCHASE
    const restockRawMaterial = ({ materialId, addedWeightKg, newUnitPrice, supplierName, supplierPhone, paidAmount, notes, currency: requestedCurrency }) => {
        const material = db.rawMaterials.find(item => item.id === materialId);
        const weight = Number(addedWeightKg);
        const price = Number(newUnitPrice);
        const currency = currencyCode(requestedCurrency || material?.currency);
        if (!material)
            return { success: false, error: 'Raw material not found.' };
        if (!Number.isFinite(weight) || weight <= 0 || !Number.isFinite(price) || price < 0)
            return { success: false, error: 'Restock quantity and unit price are invalid.' };
        const today = new Date().toISOString().split('T')[0];
        const totalBill = weight * price;
        const paid = Math.min(Math.max(0, Number(paidAmount) || 0), totalBill);
        const remaining = Math.max(0, totalBill - paid);
        setDb(prev => {
            let updatedSuppliers = [...prev.suppliers];
            let supplierId = material.supplierId;
            const resolvedName = supplierName?.trim() || material.supplierName || '';
            if (resolvedName) {
                // An explicitly entered supplier name takes precedence over the
                // material's previous supplier. Otherwise a restock from a new
                // supplier would incorrectly update the old supplier account.
                const supplierIndex = updatedSuppliers.findIndex(supplier => supplier.name.toLowerCase() === resolvedName.toLowerCase());
                const transaction = {
                    id: `st-${Date.now()}`,
                    rawMaterialId: materialId,
                    date: today,
                    type: 'purchase',
                    description: notes || `Restock ${material.name} (${weight.toLocaleString()} kg)`,
                    amount: totalBill,
                    paidAmount: paid,
                    remainingAmount: remaining,
                    currency,
                };
                if (supplierIndex >= 0) {
                    const supplier = updatedSuppliers[supplierIndex];
                    supplierId = supplier.id;
                    updatedSuppliers[supplierIndex] = {
                        ...supplier,
                        phone: supplierPhone || supplier.phone,
                        ...addCurrencyValue(addCurrencyValue(addCurrencyValue(supplier, 'totalPurchasedAmount', totalBill, currency), 'totalPaid', paid, currency), 'balanceOwed', remaining, currency),
                        transactions: [transaction, ...supplier.transactions],
                    };
                }
                else {
                    supplierId = `sup-${Date.now()}`;
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
                        transactions: [transaction],
                        createdAt: today,
                    });
                }
            }
            return {
                ...prev,
                rawMaterials: prev.rawMaterials.map(item => item.id === materialId ? {
                    ...item,
                    stockKg: item.stockKg + weight,
                    unitPrice: price,
                    currency,
                    supplierId,
                    supplierName: resolvedName || item.supplierName,
                    notes: notes || item.notes,
                    dateAdded: today,
                } : item),
                suppliers: updatedSuppliers,
                ...cashPatch(prev, -paid, currency),
            };
        });
        return { success: true };
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
        const threshold = updates.lowStockThreshold === '' || updates.lowStockThreshold == null ? undefined : Number(updates.lowStockThreshold);
        if (!name || !Number.isFinite(stockKg) || stockKg < 0 || !Number.isFinite(unitPrice) || unitPrice < 0 || (threshold !== undefined && (!Number.isFinite(threshold) || threshold < 0))) return { success: false, error: 'Please enter valid raw-stock values.' };
        setDb(prev => ({ ...prev, rawMaterials: prev.rawMaterials.map(item => item.id === id ? { ...item, name, category: updates.category || item.category, stockKg, unitPrice, currency: currencyCode(updates.currency), supplierName: String(updates.supplierName || '').trim() || undefined, notes: String(updates.notes || '').trim() || undefined, lowStockThreshold: threshold } : item) }));
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
        if (paidAfn + Number(db.suppliers.find(supplier => supplier.id === id)?.goodsSettledAmount || 0) > totalAfn || paidUsd + Number(db.suppliers.find(supplier => supplier.id === id)?.goodsSettledAmountUsd || 0) > totalUsd) return { success: false, error: t.paidCannotExceedTotal };
        setDb(prev => {
            const currentSupplier = prev.suppliers.find(supplier => supplier.id === id);
            if (!currentSupplier) return prev;

            const afnCashAdjustment = Number(currentSupplier.totalPaid || 0) - paidAfn;
            const usdCashAdjustment = Number(currentSupplier.totalPaidUsd || 0) - paidUsd;

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
                    balanceOwed: Math.max(0, totalAfn - paidAfn - Number(currentSupplier.goodsSettledAmount || 0)),
                    totalPurchasedAmountUsd: totalUsd,
                    totalPaidUsd: paidUsd,
                    balanceOwedUsd: Math.max(0, totalUsd - paidUsd - Number(currentSupplier.goodsSettledAmountUsd || 0)),
                } : supplier),
            };
        });
        return { success: true };
    };
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
        void sbDeleteRawMaterial(id);
    };
    // SETTLE PAYMENT TO SUPPLIER
    const settleSupplierPayment = (supplierId, amountToPay, note, currency = 'AFN') => {
        if (amountToPay <= 0)
            return;
        const today = new Date().toISOString().split('T')[0];
        setDb(prev => {
            const supIndex = prev.suppliers.findIndex(s => s.id === supplierId);
            if (supIndex === -1)
                return prev;
            const sup = prev.suppliers[supIndex];
            currency = currencyCode(currency);
            const balanceField = currencyField('balanceOwed', currency);
            const paidField = currencyField('totalPaid', currency);
            const actualPay = Math.min(amountToPay, Number(sup[balanceField]) || 0);
            const newRemaining = Math.max(0, (Number(sup[balanceField]) || 0) - actualPay);
            const transaction = {
                id: `st-${Date.now()}`,
                date: today,
                type: 'payment',
                description: note || 'پرداخت قرض و تصفیه حساب با عرضه کننده',
                amount: 0,
                paidAmount: actualPay,
                remainingAmount: newRemaining,
                currency,
            };
            const updatedSuppliers = [...prev.suppliers];
            const updatedSup = {
                ...sup,
                [paidField]: (Number(sup[paidField]) || 0) + actualPay,
                [balanceField]: newRemaining,
                transactions: [transaction, ...sup.transactions],
            };
            updatedSuppliers[supIndex] = updatedSup;
            return {
                ...prev,
                suppliers: updatedSuppliers,
                ...cashPatch(prev, -actualPay, currency),
            };
        });
    };
    // SETTLE A SUPPLIER BALANCE WITH PROCESSED GOODS. Any sale value above
    // our debt becomes a customer balance owed by the same supplier.
    const settleSupplierWithProcessedStock = async (settlement) => {
        const supplier = db.suppliers.find(item => item.id === settlement.supplierId);
        const product = db.processedStock.find(item => item.id === settlement.productId);
        const unitQuantity = Number(settlement.unitQuantity);
        const salePricePerUnit = Number(settlement.salePricePerUnit);
        const quantityKg = convertToKg(settlement.unitType, unitQuantity);
        if (!supplier || !product) return { success: false, error: t.invalidSupplierOrProduct };
        if (!Number.isFinite(unitQuantity) || unitQuantity <= 0 || !Number.isFinite(salePricePerUnit) || salePricePerUnit <= 0) return { success: false, error: t.quantityPriceMustBePositive };
        if (product.stockKg < quantityKg) return { success: false, error: `${t.insufficientStockOfItem} ${product.stockKg.toLocaleString()} ${t.kilo}. ${t.requestedAmount} ${quantityKg.toLocaleString()} ${t.kilo}.` };

        const currency = currencyCode(settlement.currency);
        const balanceField = currencyField('balanceOwed', currency);
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
        const sale = {
            id: `sale-${timestamp}`,
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
            remainingAmount: customerDebt,
            notes: settlement.notes?.trim() || t.supplierGoodsSettlement,
            currency,
            paymentMethod: 'supplier_balance_offset',
            supplierId: supplier.id,
            supplierOffsetAmount: offsetAmount,
        };
        const nextState = (() => {
            const updatedProcessedStock = db.processedStock.map(item => item.id === product.id ? { ...item, stockKg: Math.max(0, item.stockKg - quantityKg), lastUpdated: today } : item);
            const newSupplierBalance = Math.max(0, (Number(supplier[balanceField]) || 0) - offsetAmount);
            const supplierTransaction = {
                id: `st-${timestamp}`,
                date: today,
                type: 'goods_settlement',
                description: `${t.supplierGoodsSettlement}: ${product.name} (${unitQuantity.toLocaleString()} ${t[settlement.unitType] || settlement.unitType})`,
                amount: totalAmount,
                paidAmount: offsetAmount,
                remainingAmount: newSupplierBalance,
                currency,
                productId: product.id,
                quantityKg,
                customerDebt,
            };
            const updatedSuppliers = db.suppliers.map(item => item.id === supplier.id ? {
                ...item,
                [goodsSettledField]: (Number(item[goodsSettledField]) || 0) + offsetAmount,
                [balanceField]: newSupplierBalance,
                transactions: [supplierTransaction, ...(item.transactions || [])],
            } : item);

            const normalizedName = supplier.name.trim().toLowerCase();
            const existingCustomerIndex = db.customers.findIndex(customer => customer.name.trim().toLowerCase() === normalizedName || (supplier.phone && customer.phone === supplier.phone));
            const updatedCustomers = [...db.customers];
            const customerTransaction = {
                id: `ct-${timestamp}`,
                date: today,
                type: 'sale',
                description: `${t.supplierGoodsSettlement}: ${product.name} (${unitQuantity.toLocaleString()} ${t[settlement.unitType] || settlement.unitType})`,
                amount: totalAmount,
                paidAmount: offsetAmount,
                remainingAmount: customerDebt,
                currency,
            };
            let customerId;
            if (existingCustomerIndex >= 0) {
                const customer = updatedCustomers[existingCustomerIndex];
                customerId = customer.id;
                updatedCustomers[existingCustomerIndex] = {
                    ...customer,
                    phone: supplier.phone || customer.phone,
                    ...addCurrencyValue(addCurrencyValue(addCurrencyValue(customer, 'totalPurchasedAmount', totalAmount, currency), 'totalPaid', offsetAmount, currency), 'balanceOwed', customerDebt, currency),
                    transactions: [customerTransaction, ...(customer.transactions || [])],
                };
            } else {
                customerId = `cust-${timestamp}`;
                updatedCustomers.unshift({
                    id: customerId,
                    supplierId: supplier.id,
                    name: supplier.name,
                    phone: supplier.phone || '',
                    address: supplier.address || '',
                    totalPurchasedAmount: currency === 'AFN' ? totalAmount : 0,
                    totalPurchasedAmountUsd: currency === 'USD' ? totalAmount : 0,
                    totalPaid: currency === 'AFN' ? offsetAmount : 0,
                    totalPaidUsd: currency === 'USD' ? offsetAmount : 0,
                    balanceOwed: currency === 'AFN' ? customerDebt : 0,
                    balanceOwedUsd: currency === 'USD' ? customerDebt : 0,
                    transactions: [customerTransaction],
                    createdAt: today,
                });
            }
            sale.customerId = customerId;
            return { ...db, processedStock: updatedProcessedStock, suppliers: updatedSuppliers, customers: updatedCustomers, sales: [sale, ...db.sales] };
        })();

        localWritesInProgress.current += 1;
        const saved = await seedInitialDataToSupabase(nextState).finally(() => { localWritesInProgress.current = Math.max(0, localWritesInProgress.current - 1); });
        if (!saved) return { success: false, error: t.supplierGoodsSettlementSaveFailed };
        lastSyncedState.current = JSON.stringify(nextState);
        setDb(nextState);
        setIsSupabaseConnected(true);
        setDatabaseError(null);
        return { success: true, offsetAmount, customerDebt };
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
        void sbDeleteSupplier(supplierId);
    };
    // 2. PRODUCE A BATCH. A formula is saved only through saveFormulaTemplate.
    const createFormulaAndProduce = async (name, ingredients, description, operatorName, produceBatchImmediately = true, batchExpenses = 0, savedFormulaId = null, batchExpenseCurrency = 'AFN') => {
        for (const ing of ingredients) {
            const raw = db.rawMaterials.find(r => r.id === ing.rawMaterialId);
            if (!raw) return { success: false, error: `Raw material not found: ${ing.rawMaterialId}` };
            if (raw.stockKg < ing.weightKg) return { success: false, error: `${t.insufficientStockError} (${raw.name}: ${raw.stockKg} kg موجود، ${ing.weightKg} kg نیاز است)` };
        }
        const today = new Date().toISOString().split('T')[0];
        const operationTimestamp = Date.now();
        const linkedFormulaId = savedFormulaId && db.formulas.some(formula => formula.id === savedFormulaId) ? savedFormulaId : null;
        let totalWeight = 0;
        const costs = { AFN: 0, USD: 0 };
        ingredients.forEach(ing => {
            const raw = db.rawMaterials.find(r => r.id === ing.rawMaterialId);
            totalWeight += Number(ing.weightKg) || 0;
            costs[currencyCode(raw.currency)] += (Number(ing.weightKg) || 0) * raw.unitPrice;
        });
        const expenseCurrency = currencyCode(batchExpenseCurrency);
        costs[expenseCurrency] += Number(batchExpenses) || 0;
        const costPerKg = totalWeight > 0 ? costs.AFN / totalWeight : 0;
        const costPerKgUsd = totalWeight > 0 ? costs.USD / totalWeight : 0;
        const newBatch = {
            id: `batch-${operationTimestamp}`, formulaId: linkedFormulaId, formulaName: name, date: today,
            totalWeightKg: totalWeight, costPerKg, costPerKgUsd, totalCost: costs.AFN, totalCostUsd: costs.USD,
            operatorName: operatorName || 'مسئول تولید',
            notes: description || `پروسس خودکار: ${name} (${totalWeight.toLocaleString()} کیلو)`,
        };
        const updatedRaw = db.rawMaterials.map(rm => { const used = ingredients.find(ing => ing.rawMaterialId === rm.id); return used ? { ...rm, stockKg: Math.max(0, rm.stockKg - used.weightKg) } : rm; });
        const existingProcessedIndex = db.processedStock.findIndex(ps => ps.name.toLowerCase() === name.trim().toLowerCase());
        let updatedProcessedStock;
        if (existingProcessedIndex >= 0) {
            const existing = db.processedStock[existingProcessedIndex];
            const newTotalKg = existing.stockKg + totalWeight;
            const avgAfn = newTotalKg > 0 ? ((existing.stockKg * (existing.averageCostPerKg || 0)) + costs.AFN) / newTotalKg : costPerKg;
            const avgUsd = newTotalKg > 0 ? ((existing.stockKg * (existing.averageCostPerKgUsd || 0)) + costs.USD) / newTotalKg : costPerKgUsd;
            updatedProcessedStock = [...db.processedStock];
            updatedProcessedStock[existingProcessedIndex] = { ...existing, stockKg: newTotalKg, averageCostPerKg: avgAfn, averageCostPerKgUsd: avgUsd, lastUpdated: today };
        } else {
            updatedProcessedStock = [{ id: `ps-${operationTimestamp}`, name: name.trim(), formulaId: linkedFormulaId, stockKg: totalWeight, averageCostPerKg: costPerKg, averageCostPerKgUsd: costPerKgUsd, lastUpdated: today }, ...db.processedStock];
        }
        const expense = Number(batchExpenses) > 0 ? { id: `exp-${operationTimestamp}`, date: today, category: 'electricity', description: `مصارف تولید بچ: ${name}`, amount: Number(batchExpenses), currency: expenseCurrency, paidBy: operatorName || 'مسئول فابریکه' } : null;
        const nextState = { ...db, rawMaterials: updatedRaw, processedStock: updatedProcessedStock, formulas: db.formulas, productionBatches: produceBatchImmediately ? [newBatch, ...db.productionBatches] : db.productionBatches, expenses: expense ? [expense, ...db.expenses] : db.expenses, ...(expense ? cashPatch(db, -expense.amount, expense.currency) : {}) };
        localWritesInProgress.current += 1;
        const saved = await seedInitialDataToSupabase(nextState).finally(() => { localWritesInProgress.current = Math.max(0, localWritesInProgress.current - 1); });
        if (!saved) return { success: false, error: 'The production batch was not saved to the database.' };
        lastSyncedState.current = JSON.stringify(nextState); setDb(nextState); setIsSupabaseConnected(true); setDatabaseError(null);
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
            const ingredientCost = weight * raw.unitPrice;
            totalWeight += weight;
            totalCosts[currencyCode(raw.currency)] += ingredientCost;
            populatedIngredients.push({
                rawMaterialId: raw.id,
                rawMaterialName: raw.name,
                weightKg: weight,
                costPerKg: raw.unitPrice,
                totalCost: ingredientCost,
                currency: currencyCode(raw.currency),
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
        localWritesInProgress.current += 1;
        const saved = await seedInitialDataToSupabase(nextState).finally(() => {
            localWritesInProgress.current = Math.max(0, localWritesInProgress.current - 1);
        });
        if (!saved)
            return { success: false, error: 'The formula was not saved to the database.' };
        lastSyncedState.current = JSON.stringify(nextState);
        setDb(nextState);
        setIsSupabaseConnected(true);
        setDatabaseError(null);
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
        sbDeleteFormula(formulaId);
    };
    // 3. RECORD SALE (DEDUCT PROCESSED STOCK, AUTO-UPDATE CUSTOMER, ADD CASH)
    const recordSale = async (saleData) => {
        const quantityKg = convertToKg(saleData.unitType, saleData.unitQuantity);
        // Check processed stock
        let product = saleData.productId ? db.processedStock.find(p => p.id === saleData.productId) : undefined;
        if (!product) {
            product = db.processedStock.find(p => p.name.toLowerCase() === saleData.productName.trim().toLowerCase());
        }
        if (product && product.stockKg < quantityKg) {
            return {
                success: false,
                error: `موجودی دانه پروسس شده کافی نیست! موجودی فعلی: ${product.stockKg.toLocaleString()} کیلو، مقدار فروش: ${quantityKg.toLocaleString()} کیلو.`
            };
        }
        const currency = currencyCode(saleData.currency);
        const totalAmount = saleData.unitQuantity * saleData.salePricePerUnit;
        if (saleData.customerPhone?.trim() && !/^\d{10}$/.test(saleData.customerPhone.trim())) {
            return { success: false, error: t.phoneMustBe10Digits };
        }
        if (saleData.paidAmount > totalAmount) {
            return { success: false, error: t.paidAmountExceedsTotal };
        }
        const remainingAmount = Math.max(0, totalAmount - saleData.paidAmount);
        const costRatePerKg = product ? (product.averageCostPerKg || 0) : 0;
        const costRatePerKgUsd = product ? (product.averageCostPerKgUsd || 0) : 0;
        const totalCostOfGoods = costRatePerKg * quantityKg;
        const totalCostOfGoodsUsd = costRatePerKgUsd * quantityKg;
        const profit = (currency === 'AFN' ? totalAmount : 0) - totalCostOfGoods;
        const profitUsd = (currency === 'USD' ? totalAmount : 0) - totalCostOfGoodsUsd;
        const today = new Date().toISOString().split('T')[0];
        const saleId = `sale-${Date.now()}`;
        const newSale = {
            id: saleId,
            date: today,
            customerId: saleData.customerId || '',
            customerName: saleData.customerName.trim(),
            customerPhone: saleData.customerPhone?.trim(),
            productId: product?.id || saleData.productId || '',
            productName: saleData.productName.trim(),
            unitType: saleData.unitType,
            unitQuantity: saleData.unitQuantity,
            quantityKg,
            salePricePerUnit: saleData.salePricePerUnit,
            totalAmount,
            costRatePerKg,
            totalCostOfGoods,
            totalCostOfGoodsUsd,
            profit,
            profitUsd,
            paidAmount: saleData.paidAmount,
            remainingAmount,
            notes: saleData.notes?.trim(),
            currency,
        };
        const nextState = (() => {
            const prev = db;
            // 1. Deduct processed stock
            let updatedProcessedStock = prev.processedStock;
            if (product) {
                updatedProcessedStock = prev.processedStock.map(p => {
                    if (p.id === product.id) {
                        const updated = {
                            ...p,
                            stockKg: Math.max(0, p.stockKg - quantityKg),
                            lastUpdated: today,
                        };
                        return updated;
                    }
                    return p;
                });
            }
            // 2. Auto register/update customer
            let updatedCustomers = [...prev.customers];
            let assignedCustId = saleData.customerId;
            const custName = saleData.customerName.trim();
            const existingCustIndex = updatedCustomers.findIndex(c => (saleData.customerId && c.id === saleData.customerId) ||
                c.name.toLowerCase() === custName.toLowerCase());
            const customerTransaction = {
                id: `ct-${Date.now()}`,
                date: today,
                type: 'sale',
                description: `فروش ${saleData.productName} (${saleData.unitQuantity} ${t[saleData.unitType] || saleData.unitType})`,
                amount: totalAmount,
                paidAmount: saleData.paidAmount,
                remainingAmount: remainingAmount,
            };
            if (existingCustIndex >= 0) {
                const existing = updatedCustomers[existingCustIndex];
                assignedCustId = existing.id;
                const updatedCust = {
                    ...existing,
                    phone: saleData.customerPhone || existing.phone,
                    ...addCurrencyValue(addCurrencyValue(addCurrencyValue(existing, 'totalPurchasedAmount', totalAmount, currency), 'totalPaid', saleData.paidAmount, currency), 'balanceOwed', remainingAmount, currency),
                    transactions: [customerTransaction, ...existing.transactions],
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
                    totalPaid: currency === 'AFN' ? saleData.paidAmount : 0,
                    totalPaidUsd: currency === 'USD' ? saleData.paidAmount : 0,
                    rawSettledAmount: 0,
                    rawSettledAmountUsd: 0,
                    balanceOwed: currency === 'AFN' ? remainingAmount : 0,
                    balanceOwedUsd: currency === 'USD' ? remainingAmount : 0,
                    transactions: [customerTransaction],
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
                ...cashPatch(prev, saleData.paidAmount, currency),
            };
        })();
        localWritesInProgress.current += 1;
        const saved = await seedInitialDataToSupabase(nextState).finally(() => {
            localWritesInProgress.current = Math.max(0, localWritesInProgress.current - 1);
        });
        if (!saved)
            return { success: false, error: 'The sale was not saved to the database.' };
        lastSyncedState.current = JSON.stringify(nextState);
        setDb(nextState);
        setIsSupabaseConnected(true);
        setDatabaseError(null);
        return { success: true };
    };
    // RECEIVE RAW MATERIAL FROM A CUSTOMER AS A NON-CASH DEBT SETTLEMENT.
    // Any value above the customer debt becomes a supplier balance we owe.
    const settleCustomerWithRawMaterial = async (settlement) => {
        const customer = db.customers.find(item => item.id === settlement.customerId);
        const name = String(settlement.materialName || '').trim();
        const category = String(settlement.category || 'Grains');
        const unitQuantity = Number(settlement.unitQuantity);
        const unitPrice = Number(settlement.unitPrice);
        const quantityKg = convertToKg(settlement.unitType, unitQuantity);
        if (!customer || !name) return { success: false, error: t.invalidCustomerOrMaterial };
        if (!Number.isFinite(unitQuantity) || unitQuantity <= 0 || !Number.isFinite(unitPrice) || unitPrice <= 0) return { success: false, error: t.quantityPriceMustBePositive };

        const currency = currencyCode(settlement.currency);
        const customerBalanceField = currencyField('balanceOwed', currency);
        const rawSettledField = currencyField('rawSettledAmount', currency);
        const supplierPurchaseField = currencyField('totalPurchasedAmount', currency);
        const supplierBalanceField = currencyField('balanceOwed', currency);
        const supplierGoodsSettledField = currencyField('goodsSettledAmount', currency);
        const totalValue = quantityKg * unitPrice;
        const customerOffset = Math.min(totalValue, Number(customer[customerBalanceField]) || 0);
        const supplierDebt = Math.max(0, totalValue - customerOffset);
        const timestamp = Date.now();
        const today = new Date().toISOString().split('T')[0];

        const nextState = (() => {
            const newCustomerBalance = Math.max(0, (Number(customer[customerBalanceField]) || 0) - customerOffset);
            const customerTransaction = {
                id: `ct-${timestamp}`,
                date: today,
                type: 'raw_goods_settlement',
                description: `${t.customerRawSettlement}: ${name} (${quantityKg.toLocaleString()} ${t.kilo})`,
                amount: totalValue,
                paidAmount: customerOffset,
                remainingAmount: newCustomerBalance,
                currency,
            };
            const updatedCustomers = db.customers.map(item => item.id === customer.id ? {
                ...item,
                [rawSettledField]: (Number(item[rawSettledField]) || 0) + customerOffset,
                [customerBalanceField]: newCustomerBalance,
                transactions: [customerTransaction, ...(item.transactions || [])],
            } : item);

            const normalizedName = customer.name.trim().toLowerCase();
            const supplierIndex = db.suppliers.findIndex(supplier => supplier.id === customer.supplierId || supplier.name.trim().toLowerCase() === normalizedName || (customer.phone && supplier.phone === customer.phone));
            const updatedSuppliers = [...db.suppliers];
            let supplierId;
            let newSupplierBalance;
            if (supplierIndex >= 0) {
                const supplier = updatedSuppliers[supplierIndex];
                supplierId = supplier.id;
                newSupplierBalance = (Number(supplier[supplierBalanceField]) || 0) + supplierDebt;
                const supplierTransaction = {
                    id: `st-${timestamp}`,
                    rawMaterialId: '',
                    date: today,
                    type: 'customer_raw_settlement',
                    description: `${t.customerRawSettlement}: ${name} (${quantityKg.toLocaleString()} ${t.kilo})`,
                    amount: totalValue,
                    paidAmount: customerOffset,
                    remainingAmount: newSupplierBalance,
                    currency,
                };
                updatedSuppliers[supplierIndex] = {
                    ...supplier,
                    phone: customer.phone || supplier.phone,
                    address: customer.address || supplier.address,
                    [supplierPurchaseField]: (Number(supplier[supplierPurchaseField]) || 0) + totalValue,
                    [supplierGoodsSettledField]: (Number(supplier[supplierGoodsSettledField]) || 0) + customerOffset,
                    [supplierBalanceField]: newSupplierBalance,
                    transactions: [supplierTransaction, ...(supplier.transactions || [])],
                };
            } else {
                supplierId = `sup-${timestamp}`;
                newSupplierBalance = supplierDebt;
                updatedSuppliers.unshift({
                    id: supplierId,
                    name: customer.name,
                    phone: customer.phone || '',
                    address: customer.address || '',
                    totalPurchasedAmount: currency === 'AFN' ? totalValue : 0,
                    totalPurchasedAmountUsd: currency === 'USD' ? totalValue : 0,
                    totalPaid: 0,
                    totalPaidUsd: 0,
                    goodsSettledAmount: currency === 'AFN' ? customerOffset : 0,
                    goodsSettledAmountUsd: currency === 'USD' ? customerOffset : 0,
                    balanceOwed: currency === 'AFN' ? supplierDebt : 0,
                    balanceOwedUsd: currency === 'USD' ? supplierDebt : 0,
                    transactions: [{
                        id: `st-${timestamp}`,
                        rawMaterialId: '',
                        date: today,
                        type: 'customer_raw_settlement',
                        description: `${t.customerRawSettlement}: ${name} (${quantityKg.toLocaleString()} ${t.kilo})`,
                        amount: totalValue,
                        paidAmount: customerOffset,
                        remainingAmount: supplierDebt,
                        currency,
                    }],
                    createdAt: today,
                });
            }

            const existingMaterialIndex = db.rawMaterials.findIndex(material => material.name.trim().toLowerCase() === name.toLowerCase() && currencyCode(material.currency) === currency);
            const updatedRawMaterials = [...db.rawMaterials];
            let rawMaterialId;
            if (existingMaterialIndex >= 0) {
                const material = updatedRawMaterials[existingMaterialIndex];
                rawMaterialId = material.id;
                const oldWeight = Number(material.stockKg) || 0;
                const newWeight = oldWeight + quantityKg;
                const averageUnitPrice = newWeight > 0 ? ((oldWeight * (Number(material.unitPrice) || 0)) + totalValue) / newWeight : unitPrice;
                updatedRawMaterials[existingMaterialIndex] = {
                    ...material,
                    stockKg: newWeight,
                    unitPrice: averageUnitPrice,
                    category,
                    currency,
                    supplierId,
                    supplierName: customer.name,
                    customerId: customer.id,
                    notes: settlement.notes?.trim() || material.notes,
                    dateAdded: today,
                };
            } else {
                rawMaterialId = `rm-${timestamp}`;
                updatedRawMaterials.unshift({
                    id: rawMaterialId,
                    name,
                    category,
                    stockKg: quantityKg,
                    unitPrice,
                    currency,
                    supplierId,
                    supplierName: customer.name,
                    customerId: customer.id,
                    dateAdded: today,
                    notes: settlement.notes?.trim() || t.customerRawSettlement,
                    lowStockThreshold: settlement.lowStockThreshold === '' || settlement.lowStockThreshold == null ? undefined : Number(settlement.lowStockThreshold),
                });
            }
            updatedSuppliers.forEach(supplier => {
                const transaction = supplier.transactions?.[0];
                if (supplier.id === supplierId && transaction?.id === `st-${timestamp}`) transaction.rawMaterialId = rawMaterialId;
            });
            return { ...db, customers: updatedCustomers, suppliers: updatedSuppliers, rawMaterials: updatedRawMaterials };
        })();

        localWritesInProgress.current += 1;
        const saved = await seedInitialDataToSupabase(nextState).finally(() => { localWritesInProgress.current = Math.max(0, localWritesInProgress.current - 1); });
        if (!saved) return { success: false, error: t.customerRawSettlementSaveFailed };
        lastSyncedState.current = JSON.stringify(nextState);
        setDb(nextState);
        setIsSupabaseConnected(true);
        setDatabaseError(null);
        return { success: true, customerOffset, supplierDebt };
    };
    // RECEIVE PAYMENT FROM CUSTOMER
    const receiveCustomerPayment = async (customerId, amount, note, currency = 'AFN') => {
        if (amount <= 0)
            return { success: false, error: 'Payment must be greater than zero.' };
        const today = new Date().toISOString().split('T')[0];
        const nextState = (() => {
            const prev = db;
            const custIndex = prev.customers.findIndex(c => c.id === customerId);
            if (custIndex === -1)
                return null;
            const cust = prev.customers[custIndex];
            currency = currencyCode(currency);
            const balanceField = currencyField('balanceOwed', currency);
            const paidField = currencyField('totalPaid', currency);
            const rawSettledField = currencyField('rawSettledAmount', currency);
            const actualReceived = Math.min(amount, Number(cust[balanceField]) || 0);
            const newRemaining = Math.max(0, (Number(cust[balanceField]) || 0) - actualReceived);
            const transaction = {
                id: `ct-${Date.now()}`,
                date: today,
                type: 'payment',
                description: note || 'دریافت طلب و باقی‌داری مشتری',
                amount: 0,
                paidAmount: actualReceived,
                remainingAmount: newRemaining,
                currency,
            };
            const updatedCustomers = [...prev.customers];
            const updatedCust = {
                ...cust,
                [paidField]: (Number(cust[paidField]) || 0) + actualReceived,
                [balanceField]: newRemaining,
                transactions: [transaction, ...cust.transactions],
            };
            updatedCustomers[custIndex] = updatedCust;
            const normalizedCustomerName = cust.name.trim().toLowerCase();
            const normalizedCustomerPhone = (cust.phone || '').trim();
            const belongsToCustomer = sale => sale.customerId === customerId || (
                !sale.customerId && (
                    sale.customerName.trim().toLowerCase() === normalizedCustomerName ||
                    (normalizedCustomerPhone && sale.customerPhone === normalizedCustomerPhone)
                )
            );
            const alreadyAppliedToInvoices = prev.sales
                .filter(sale => belongsToCustomer(sale) && (sale.currency || 'AFN') === currency)
                .reduce((sum, sale) => sum + sale.paidAmount, 0);
            // Reconcile any older customer payments that reached the customer
            // ledger but were blocked before the related invoice update.
            let paymentToAllocate = Math.max(0, (Number(updatedCust[paidField]) || 0) + (Number(updatedCust[rawSettledField]) || 0) - alreadyAppliedToInvoices);
            const invoicePayments = new Map();
            [...prev.sales]
                .filter(sale => belongsToCustomer(sale) && (sale.currency || 'AFN') === currency && sale.remainingAmount > 0)
                .sort((first, second) => first.date.localeCompare(second.date))
                .forEach(sale => {
                    if (paymentToAllocate <= 0)
                        return;
                    const appliedAmount = Math.min(paymentToAllocate, sale.remainingAmount);
                    invoicePayments.set(sale.id, appliedAmount);
                    paymentToAllocate -= appliedAmount;
                });
            const updatedSales = prev.sales.map(sale => {
                const appliedAmount = invoicePayments.get(sale.id) || 0;
                if (appliedAmount <= 0)
                    return sale;
                return {
                    ...sale,
                    paidAmount: sale.paidAmount + appliedAmount,
                    remainingAmount: Math.max(0, sale.remainingAmount - appliedAmount),
                };
            });
            return {
                ...prev,
                customers: updatedCustomers,
                sales: updatedSales,
                ...cashPatch(prev, actualReceived, currency),
            };
        })();
        if (!nextState)
            return { success: false, error: 'Customer was not found.' };
        localWritesInProgress.current += 1;
        const saved = await seedInitialDataToSupabase(nextState).finally(() => {
            localWritesInProgress.current = Math.max(0, localWritesInProgress.current - 1);
        });
        if (!saved)
            return { success: false, error: 'The customer payment was not saved to the database.' };
        lastSyncedState.current = JSON.stringify(nextState);
        setDb(nextState);
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
        sbDeleteCustomer(customerId);
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
        sbDeleteExpense(id);
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
                seedInitialDataToSupabase(parsed);
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
    const getLocalizedName = (name) => getLocalizedItemName(name, lang);
    const getLocalizedCat = (cat) => getLocalizedCategory(cat, lang);
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
            lowStockMaterials,
            getLocalizedName,
            getLocalizedCat,
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
