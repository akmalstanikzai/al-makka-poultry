import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { translations, getLocalizedItemName, getLocalizedCategory, getLocalizedTransactionType, getLocalizedTransactionDescription } from '../translations';
import { supabase } from '../lib/supabase';
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
};
const DatabaseContext = createContext(undefined);
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
    const [databaseError, setDatabaseError] = useState(supabase ? null : 'Supabase is not configured. Check the environment variables.');
    const isRemoteStateReady = useRef(false);
    const lastSyncedState = useRef(null);
    // User-defined Low Stock Threshold
    const [lowStockThreshold, setLowStockThresholdState] = useState(5000);
    const setLowStockThreshold = (threshold) => {
        const safeVal = Math.max(100, Number(threshold) || 1000);
        setLowStockThresholdState(safeVal);
        if (supabase && user) {
            void saveLowStockThreshold(safeVal).then(saved => {
                if (!saved) {
                    setDatabaseError('Could not save the low-stock threshold to Supabase.');
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
            setDatabaseError(event.detail || 'An unknown Supabase error occurred.');
            setIsSupabaseConnected(false);
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
        if (!supabase) {
            setIsAuthLoading(false);
            setIsDatabaseLoading(false);
            return;
        }
        let isMounted = true;
        supabase.auth.getSession().then(({ data, error }) => {
            if (!isMounted)
                return;
            if (error)
                setDatabaseError(`Supabase session check failed: ${error.message}`);
            setUser(data.session?.user ? toAuthUser(data.session.user) : null);
            setIsAuthLoading(false);
        });
        const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
            if (!isMounted)
                return;
            setUser(session?.user ? toAuthUser(session.user) : null);
            setIsAuthLoading(false);
        });
        return () => {
            isMounted = false;
            listener.subscription.unsubscribe();
        };
    }, []);
    // Initial Supabase Load & Real-time Subscription
    useEffect(() => {
        if (!supabase || isAuthLoading || !user) {
            setIsSupabaseConnected(false);
            if (!isAuthLoading)
                setIsDatabaseLoading(false);
            return;
        }
        let isMounted = true;
        let isInitialLoadComplete = false;
        isRemoteStateReady.current = false;
        lastSyncedState.current = null;
        setIsDatabaseLoading(true);
        // 1. Fetch live tables from Supabase
        loadStateFromSupabase().then(result => {
            if (!isMounted)
                return;
            if (result) {
                // Supabase is authoritative even when it is empty. This avoids
                // restoring stale demo/browser data after an intentional reset.
                const hydratedState = result.state;
                setIsSupabaseConnected(true);
                setDatabaseError(null);
                lastSyncedState.current = JSON.stringify(result.state);
                setDb(hydratedState);
                isInitialLoadComplete = true;
                isRemoteStateReady.current = true;
                setIsDatabaseLoading(false);
                void loadFactorySettings().then(settings => {
                    if (isMounted && settings?.lowStockThreshold) {
                        setLowStockThresholdState(settings.lowStockThreshold);
                    }
                });
            }
            else {
                setIsSupabaseConnected(false);
                setDatabaseError('Could not read application data from Supabase.');
                isInitialLoadComplete = true;
                setIsDatabaseLoading(false);
            }
        });
        // 2. Real-time changes subscription
        const channel = supabase
            .channel('supabase-live-sync')
            .on('postgres_changes', { event: '*', schema: 'public' }, () => {
            if (!isInitialLoadComplete)
                return;
            loadStateFromSupabase().then(result => {
                if (isMounted && result) {
                    setIsSupabaseConnected(true);
                    setDatabaseError(null);
                    lastSyncedState.current = JSON.stringify(result.state);
                    setDb(result.state);
                }
            });
        })
            .subscribe();
        return () => {
            isMounted = false;
            supabase.removeChannel(channel);
        };
    }, [isAuthLoading, user?.email]);
    // Persist each completed state change as one ordered snapshot.  The old
    // code fired independent writes while React was still calculating state,
    // so customer/supplier records and their linked transactions could be
    // missing after a new login.  The sync helper serializes this snapshot and
    // writes parents before records that reference them.
    useEffect(() => {
        if (!supabase || !isRemoteStateReady.current)
            return;
        const stateHash = JSON.stringify(db);
        if (lastSyncedState.current === stateHash)
            return;
        void seedInitialDataToSupabase(db).then(saved => {
            if (saved) {
                lastSyncedState.current = stateHash;
                setIsSupabaseConnected(true);
            }
            else {
                setIsSupabaseConnected(false);
                setDatabaseError('A database write failed. Your latest change was not saved.');
                void loadStateFromSupabase().then(result => {
                    if (result) {
                        lastSyncedState.current = JSON.stringify(result.state);
                        setDb(result.state);
                    }
                });
            }
        });
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
            return { success: false, error: 'Supabase is not configured. Check the environment variables.' };
        }
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
                    date: today,
                    type: 'purchase',
                    description: `خرید ${item.name} (${item.stockKg.toLocaleString()} کیلو)`,
                    amount: totalBill,
                    paidAmount: paidAmount,
                    remainingAmount: remaining,
                };
                if (existingSupIndex >= 0) {
                    const sup = updatedSuppliers[existingSupIndex];
                    assignedSupplierId = sup.id;
                    const updatedSup = {
                        ...sup,
                        phone: supplierPhone || sup.phone,
                        totalPurchasedAmount: sup.totalPurchasedAmount + totalBill,
                        totalPaid: sup.totalPaid + paidAmount,
                        balanceOwed: sup.balanceOwed + remaining,
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
                        totalPurchasedAmount: totalBill,
                        totalPaid: paidAmount,
                        balanceOwed: remaining,
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
                cashInHand: prev.cashInHand - paidAmount,
            };
        });
    };
    // RESTOCK AN EXISTING RAW MATERIAL & RECORD THE SUPPLIER PURCHASE
    const restockRawMaterial = ({ materialId, addedWeightKg, newUnitPrice, supplierName, supplierPhone, paidAmount, notes }) => {
        const material = db.rawMaterials.find(item => item.id === materialId);
        const weight = Number(addedWeightKg);
        const price = Number(newUnitPrice);
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
                const supplierIndex = updatedSuppliers.findIndex(supplier => supplier.id === supplierId || supplier.name.toLowerCase() === resolvedName.toLowerCase());
                const transaction = {
                    id: `st-${Date.now()}`,
                    date: today,
                    type: 'purchase',
                    description: notes || `Restock ${material.name} (${weight.toLocaleString()} kg)`,
                    amount: totalBill,
                    paidAmount: paid,
                    remainingAmount: remaining,
                };
                if (supplierIndex >= 0) {
                    const supplier = updatedSuppliers[supplierIndex];
                    supplierId = supplier.id;
                    updatedSuppliers[supplierIndex] = {
                        ...supplier,
                        phone: supplierPhone || supplier.phone,
                        totalPurchasedAmount: supplier.totalPurchasedAmount + totalBill,
                        totalPaid: supplier.totalPaid + paid,
                        balanceOwed: supplier.balanceOwed + remaining,
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
                        totalPurchasedAmount: totalBill,
                        totalPaid: paid,
                        balanceOwed: remaining,
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
                    supplierId,
                    supplierName: resolvedName || item.supplierName,
                    notes: notes || item.notes,
                    dateAdded: today,
                } : item),
                suppliers: updatedSuppliers,
                cashInHand: prev.cashInHand - paid,
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
    // DELETE RAW MATERIAL
    const deleteRawMaterial = (id) => {
        setDb(prev => ({
            ...prev,
            rawMaterials: prev.rawMaterials.filter(rm => rm.id !== id),
        }));
        sbDeleteRawMaterial(id);
    };
    // SETTLE PAYMENT TO SUPPLIER
    const settleSupplierPayment = (supplierId, amountToPay, note) => {
        if (amountToPay <= 0)
            return;
        const today = new Date().toISOString().split('T')[0];
        setDb(prev => {
            const supIndex = prev.suppliers.findIndex(s => s.id === supplierId);
            if (supIndex === -1)
                return prev;
            const sup = prev.suppliers[supIndex];
            const actualPay = Math.min(amountToPay, sup.balanceOwed);
            const newRemaining = Math.max(0, sup.balanceOwed - actualPay);
            const transaction = {
                id: `st-${Date.now()}`,
                date: today,
                type: 'payment',
                description: note || 'پرداخت قرض و تصفیه حساب با عرضه کننده',
                amount: 0,
                paidAmount: actualPay,
                remainingAmount: newRemaining,
            };
            const updatedSuppliers = [...prev.suppliers];
            const updatedSup = {
                ...sup,
                totalPaid: sup.totalPaid + actualPay,
                balanceOwed: newRemaining,
                transactions: [transaction, ...sup.transactions],
            };
            updatedSuppliers[supIndex] = updatedSup;
            return {
                ...prev,
                suppliers: updatedSuppliers,
                cashInHand: prev.cashInHand - actualPay,
            };
        });
    };
    // DELETE SUPPLIER
    const deleteSupplier = (supplierId) => {
        setDb(prev => ({
            ...prev,
            suppliers: prev.suppliers.filter(s => s.id !== supplierId),
        }));
        sbDeleteSupplier(supplierId);
    };
    // 2. CREATE FORMULA & PRODUCE BATCH
    const createFormulaAndProduce = (name, ingredients, description, operatorName, produceBatchImmediately = true, batchExpenses = 0) => {
        // 1. Verify stock availability
        for (const ing of ingredients) {
            const raw = db.rawMaterials.find(r => r.id === ing.rawMaterialId);
            if (!raw) {
                return { success: false, error: `Raw material not found: ${ing.rawMaterialId}` };
            }
            if (raw.stockKg < ing.weightKg) {
                return {
                    success: false,
                    error: `${t.insufficientStockError} (${raw.name}: ${raw.stockKg} kg موجود، ${ing.weightKg} kg نیاز است)`
                };
            }
        }
        const today = new Date().toISOString().split('T')[0];
        const formulaId = `form-${Date.now()}`;
        // Calculate formula ingredient costs
        let totalWeight = 0;
        let totalBatchCost = 0;
        const populatedIngredients = ingredients.map(ing => {
            const raw = db.rawMaterials.find(r => r.id === ing.rawMaterialId);
            const subtotal = ing.weightKg * raw.unitPrice;
            totalWeight += ing.weightKg;
            totalBatchCost += subtotal;
            return {
                rawMaterialId: raw.id,
                rawMaterialName: raw.name,
                weightKg: ing.weightKg,
                costPerKg: raw.unitPrice,
                totalCost: subtotal,
            };
        });
        const totalBatchCostWithExpenses = totalBatchCost + (Number(batchExpenses) || 0);
        const costPerKg = totalWeight > 0 ? Math.round((totalBatchCostWithExpenses / totalWeight) * 100) / 100 : 0;
        const newFormula = {
            id: formulaId,
            name,
            description,
            ingredients: populatedIngredients,
            totalWeightKg: totalWeight,
            totalBatchCost: totalBatchCostWithExpenses,
            costPerKg,
            createdDate: today,
        };
        const newBatch = {
            id: `batch-${Date.now()}`,
            formulaId,
            formulaName: name,
            date: today,
            totalWeightKg: totalWeight,
            costPerKg,
            totalCost: totalBatchCostWithExpenses,
            operatorName: operatorName || 'مسئول تولید',
            notes: `پروسس خودکار: ${name} (${totalWeight.toLocaleString()} کیلو)${batchExpenses > 0 ? ` • مصارف جانبی: ${batchExpenses.toLocaleString()} ${t.currency}` : ''}`,
        };
        setDb(prev => {
            // Deduct raw materials
            const updatedRaw = prev.rawMaterials.map(rm => {
                const used = ingredients.find(ing => ing.rawMaterialId === rm.id);
                if (used) {
                    const updated = {
                        ...rm,
                        stockKg: Math.max(0, rm.stockKg - used.weightKg),
                    };
                    return updated;
                }
                return rm;
            });
            // Update or Add Processed Stock
            const existingProcessedIndex = prev.processedStock.findIndex(ps => ps.name.toLowerCase() === name.trim().toLowerCase());
            let updatedProcessedStock;
            if (existingProcessedIndex >= 0) {
                const existing = prev.processedStock[existingProcessedIndex];
                const newTotalKg = existing.stockKg + totalWeight;
                const newAvgCost = newTotalKg > 0
                    ? ((existing.stockKg * existing.averageCostPerKg) + (totalWeight * costPerKg)) / newTotalKg
                    : costPerKg;
                const updatedItem = {
                    ...existing,
                    stockKg: newTotalKg,
                    averageCostPerKg: Math.round(newAvgCost * 100) / 100,
                    lastUpdated: today,
                };
                updatedProcessedStock = [...prev.processedStock];
                updatedProcessedStock[existingProcessedIndex] = updatedItem;
            }
            else {
                const newProcessedItem = {
                    id: `ps-${Date.now()}`,
                    name: name.trim(),
                    formulaId,
                    stockKg: totalWeight,
                    averageCostPerKg: costPerKg,
                    lastUpdated: today,
                };
                updatedProcessedStock = [newProcessedItem, ...prev.processedStock];
            }
            // Add expense if batch expenses were incurred
            let updatedExpenses = prev.expenses;
            let newCashInHand = prev.cashInHand;
            if (batchExpenses > 0) {
                const exp = {
                    id: `exp-${Date.now()}`,
                    date: today,
                    category: 'electricity',
                    description: `مصارف تولید بچ: ${name}`,
                    amount: batchExpenses,
                    paidBy: operatorName || 'مسئول فابریکه',
                };
                updatedExpenses = [exp, ...prev.expenses];
                newCashInHand -= batchExpenses;
            }
            return {
                ...prev,
                rawMaterials: updatedRaw,
                processedStock: updatedProcessedStock,
                formulas: [newFormula, ...prev.formulas],
                productionBatches: produceBatchImmediately ? [newBatch, ...prev.productionBatches] : prev.productionBatches,
                expenses: updatedExpenses,
                cashInHand: newCashInHand,
            };
        });
        return { success: true };
    };
    // SAVE OR UPDATE A REUSABLE FORMULA WITHOUT PRODUCING A BATCH
    const saveFormulaTemplate = (name, ingredients, description, formulaId) => {
        if (!name.trim())
            return { success: false, error: t.pleaseEnterFormulaName };
        let totalWeight = 0;
        let totalCost = 0;
        const populatedIngredients = [];
        for (const ingredient of ingredients) {
            const raw = db.rawMaterials.find(item => item.id === ingredient.rawMaterialId);
            const weight = Number(ingredient.weightKg) || 0;
            if (!raw || weight <= 0)
                return { success: false, error: t.invalidRawMaterialSelected };
            const ingredientCost = weight * raw.unitPrice;
            totalWeight += weight;
            totalCost += ingredientCost;
            populatedIngredients.push({
                rawMaterialId: raw.id,
                rawMaterialName: raw.name,
                weightKg: weight,
                costPerKg: raw.unitPrice,
                totalCost: ingredientCost,
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
            totalBatchCost: totalCost,
            costPerKg: totalCost / totalWeight,
            createdDate: existing?.createdDate || new Date().toISOString().split('T')[0],
        };
        setDb(prev => ({
            ...prev,
            formulas: existing
                ? prev.formulas.map(item => item.id === id ? formula : item)
                : [formula, ...prev.formulas],
        }));
        return { success: true, formulaId: id };
    };
    // DELETE FORMULA
    const deleteFormula = (formulaId) => {
        setDb(prev => ({
            ...prev,
            formulas: prev.formulas.filter(f => f.id !== formulaId),
        }));
        sbDeleteFormula(formulaId);
    };
    // 3. RECORD SALE (DEDUCT PROCESSED STOCK, AUTO-UPDATE CUSTOMER, ADD CASH)
    const recordSale = (saleData) => {
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
        const totalAmount = saleData.unitQuantity * saleData.salePricePerUnit;
        const remainingAmount = Math.max(0, totalAmount - saleData.paidAmount);
        const costRatePerKg = product ? product.averageCostPerKg : 30;
        const totalCostOfGoods = costRatePerKg * quantityKg;
        const profit = totalAmount - totalCostOfGoods;
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
            profit,
            paidAmount: saleData.paidAmount,
            remainingAmount,
            notes: saleData.notes?.trim(),
        };
        setDb(prev => {
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
                    totalPurchasedAmount: existing.totalPurchasedAmount + totalAmount,
                    totalPaid: existing.totalPaid + saleData.paidAmount,
                    balanceOwed: existing.balanceOwed + remainingAmount,
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
                    totalPurchasedAmount: totalAmount,
                    totalPaid: saleData.paidAmount,
                    balanceOwed: remainingAmount,
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
                cashInHand: prev.cashInHand + saleData.paidAmount,
            };
        });
        return { success: true };
    };
    // RECEIVE PAYMENT FROM CUSTOMER
    const receiveCustomerPayment = (customerId, amount, note) => {
        if (amount <= 0)
            return;
        const today = new Date().toISOString().split('T')[0];
        setDb(prev => {
            const custIndex = prev.customers.findIndex(c => c.id === customerId);
            if (custIndex === -1)
                return prev;
            const cust = prev.customers[custIndex];
            const actualReceived = Math.min(amount, cust.balanceOwed);
            const newRemaining = Math.max(0, cust.balanceOwed - actualReceived);
            const transaction = {
                id: `ct-${Date.now()}`,
                date: today,
                type: 'payment_received',
                description: note || 'دریافت طلب و باقی‌داری مشتری',
                amount: 0,
                paidAmount: actualReceived,
                remainingAmount: newRemaining,
            };
            const updatedCustomers = [...prev.customers];
            const updatedCust = {
                ...cust,
                totalPaid: cust.totalPaid + actualReceived,
                balanceOwed: newRemaining,
                transactions: [transaction, ...cust.transactions],
            };
            updatedCustomers[custIndex] = updatedCust;
            return {
                ...prev,
                customers: updatedCustomers,
                cashInHand: prev.cashInHand + actualReceived,
            };
        });
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
            cashInHand: prev.cashInHand - expense.amount,
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
                cashInHand: prev.cashInHand + restoreCash,
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
            deleteSupplier,
            createFormulaAndProduce,
            saveFormulaTemplate,
            deleteFormula,
            recordSale,
            receiveCustomerPayment,
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
