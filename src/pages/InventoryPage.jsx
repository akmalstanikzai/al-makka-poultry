import React, { useState } from 'react';
import { useDatabase } from '../context/DatabaseContext';
import { Plus, Search, Wheat, Trash2, AlertTriangle, DollarSign, Scale, Truck, Sparkles, X, RefreshCw } from 'lucide-react';
export const InventoryPage = () => {
    const { db, t, lang, addRawMaterial, restockRawMaterial, deleteRawMaterial, updateRawMaterialThreshold, lowStockThreshold, getLocalizedName, getLocalizedCat } = useDatabase();
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('all');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [materialToDelete, setMaterialToDelete] = useState(null);
    const [editingThresholdItem, setEditingThresholdItem] = useState(null);
    const [newThresholdValue, setNewThresholdValue] = useState('');
    const [restockItem, setRestockItem] = useState(null);
    const [restockUnit, setRestockUnit] = useState('kg');
    const [restockQuantity, setRestockQuantity] = useState('');
    const [restockPrice, setRestockPrice] = useState('');
    const [restockCurrency, setRestockCurrency] = useState('AFN');
    const [restockSupplier, setRestockSupplier] = useState('');
    const [restockPhone, setRestockPhone] = useState('');
    const [restockPaid, setRestockPaid] = useState('');
    const [restockNotes, setRestockNotes] = useState('');
    const [restockError, setRestockError] = useState('');
    // Form State
    const [itemName, setItemName] = useState('');
    const [category, setCategory] = useState('Grains');
    const [stockUnit, setStockUnit] = useState('kg');
    const [stockKg, setStockKg] = useState('');
    const [unitPrice, setUnitPrice] = useState('');
    const [currency, setCurrency] = useState('AFN');
    const [supplierName, setSupplierName] = useState('');
    const [supplierPhone, setSupplierPhone] = useState('');
    const [paidAmount, setPaidAmount] = useState('');
    const [notes, setNotes] = useState('');
    const [threshold, setThreshold] = useState('');
    const [errorMsg, setErrorMsg] = useState('');
    // Localized presets for quick-fill
    const quickPresets = [
        {
            name: lang === 'fa' ? 'جواری دانه زرد' : lang === 'ps' ? 'ژېړ جوار' : 'Yellow Corn (Maize)',
            cat: 'Grains',
            price: 24
        },
        {
            name: lang === 'fa' ? 'کنجاره سویا (پروتین ۴۶٪)' : lang === 'ps' ? 'د سویا کنجاړه (۴۶٪)' : 'Soybean Meal (46%)',
            cat: 'Protein',
            price: 48
        },
        {
            name: lang === 'fa' ? 'کنجاره پنبه دانه' : lang === 'ps' ? 'د پنبې دانې کنجاړه' : 'Cottonseed Oil Cake',
            cat: 'Protein',
            price: 32
        },
        {
            name: lang === 'fa' ? 'تیل دیزل جنراتور و موتر' : lang === 'ps' ? 'ډیزل تېل او روغنیات' : 'Diesel Fuel & Oil',
            cat: 'Fuel',
            price: 65
        },
        {
            name: lang === 'fa' ? 'سبوس گندم' : lang === 'ps' ? 'د غنمو بوش (سبوس)' : 'Wheat Bran',
            cat: 'Fiber',
            price: 18
        },
        {
            name: lang === 'fa' ? 'پری‌میکس و ویتامین مرغداری' : lang === 'ps' ? 'ویټامینونه او پری‌میکس' : 'Poultry Premix & Vitamins',
            cat: 'Supplements',
            price: 120
        },
    ];
    const handleQuickFill = (preset) => {
        setItemName(preset.name);
        setCategory(preset.cat);
        setUnitPrice(preset.price);
    };
    const handleSelectExistingSupplier = (supName) => {
        setSupplierName(supName);
        const existing = db.suppliers.find(s => s.name === supName);
        if (existing && existing.phone) {
            setSupplierPhone(existing.phone);
        }
    };
    const stockInputQuantity = Number(stockKg) || 0;
    const stockWeightKg = stockUnit === 'ton'
        ? stockInputQuantity * 1000
        : stockUnit === 'bag' ? stockInputQuantity * 50 : stockInputQuantity;
    const totalBillCalculated = stockWeightKg * (Number(unitPrice) || 0);
    const remainingCalculated = Math.max(0, totalBillCalculated - (Number(paidAmount) || 0));
    const handleSubmit = (e) => {
        e.preventDefault();
        setErrorMsg('');
        if (!itemName.trim() || stockKg === '' || unitPrice === '') {
            setErrorMsg(t.invalidCredentials || 'Please fill in all required fields');
            return;
        }
        if (supplierPhone.trim() && !/^\d{10}$/.test(supplierPhone.trim())) {
            setErrorMsg(t.phoneMustBe10Digits);
            return;
        }
        const numericStock = stockWeightKg;
        const numericPrice = Number(unitPrice);
        const numericPaid = paidAmount === '' ? numericStock * numericPrice : Number(paidAmount);
        const numericThreshold = threshold === '' ? undefined : Number(threshold);
        addRawMaterial({
            name: itemName.trim(),
            category,
            stockKg: numericStock,
            unitPrice: numericPrice,
            currency,
            supplierName: supplierName.trim() || undefined,
            notes: notes.trim() || undefined,
            lowStockThreshold: numericThreshold,
        }, numericPaid, supplierPhone.trim() || undefined);
        // Reset form
        setItemName('');
        setCategory('Grains');
        setStockUnit('kg');
        setStockKg('');
        setUnitPrice('');
        setThreshold('');
        setSupplierName('');
        setSupplierPhone('');
        setPaidAmount('');
        setNotes('');
        setErrorMsg('');
        setIsModalOpen(false);
    };
    const openRestockModal = (item) => {
        const supplier = db.suppliers.find(value => value.id === item.supplierId || value.name === item.supplierName);
        setRestockItem(item);
        setRestockUnit('kg');
        setRestockQuantity('');
        setRestockPrice(item.unitPrice);
        setRestockCurrency(item.currency || 'AFN');
        setRestockSupplier(item.supplierName || supplier?.name || '');
        setRestockPhone(supplier?.phone || '');
        setRestockPaid('');
        setRestockNotes('');
        setRestockError('');
    };
    const restockInputQuantity = Number(restockQuantity) || 0;
    const restockWeightKg = restockUnit === 'ton'
        ? restockInputQuantity * 1000
        : restockUnit === 'bag' ? restockInputQuantity * 50 : restockInputQuantity;
    const restockTotal = restockWeightKg * (Number(restockPrice) || 0);
    const restockPaidAmount = restockPaid === '' ? restockTotal : Number(restockPaid);
    const handleRestock = (event) => {
        event.preventDefault();
        setRestockError('');
        if (restockPhone.trim() && !/^\d{10}$/.test(restockPhone.trim())) {
            setRestockError(t.phoneMustBe10Digits);
            return;
        }
        const result = restockRawMaterial({
            materialId: restockItem.id,
            addedWeightKg: restockWeightKg,
            newUnitPrice: Number(restockPrice),
            supplierName: restockSupplier.trim() || undefined,
            supplierPhone: restockPhone.trim() || undefined,
            paidAmount: restockPaidAmount,
            notes: restockNotes.trim() || undefined,
            currency: restockCurrency,
        });
        if (result.success)
            setRestockItem(null);
        else
            setRestockError(result.error || 'Could not restock this material.');
    };
    // Filtered raw materials with search and category filter
    const filteredItems = db.rawMaterials.filter(item => {
        const localizedName = getLocalizedName(item.name).toLowerCase();
        const rawName = item.name.toLowerCase();
        const search = searchTerm.toLowerCase();
        const matchesSearch = localizedName.includes(search) ||
            rawName.includes(search) ||
            (item.supplierName && item.supplierName.toLowerCase().includes(search)) ||
            (item.category && getLocalizedCat(item.category).toLowerCase().includes(search));
        const matchesCategory = selectedCategory === 'all' || item.category === selectedCategory;
        return matchesSearch && matchesCategory;
    });
    const totalWarehouseKg = db.rawMaterials.reduce((acc, i) => acc + i.stockKg, 0);
    const totalWarehouseValue = db.rawMaterials.reduce((acc, i) => { const code = i.currency === 'USD' ? 'USD' : 'AFN'; acc[code] += i.stockKg * i.unitPrice; return acc; }, { AFN: 0, USD: 0 });
    const lowStockCount = db.rawMaterials.filter(i => i.stockKg <= (i.lowStockThreshold ?? lowStockThreshold)).length;
    const categories = ['all', 'Grains', 'Protein', 'Fuel', 'Fiber', 'Supplements'];
    return (<div className="space-y-6">
      {/* Header with Title and Add Button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-100 text-amber-700">
              <Wheat className="w-5 h-5"/>
            </div>
            <span>{t.inventoryTitle}</span>
          </h2>
          <p className="text-xs sm:text-sm text-slate-600 mt-1">
            {t.inventoryDesc}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button type="button" onClick={() => setIsModalOpen(true)} className="flex items-center justify-center gap-2 px-4 py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs sm:text-sm rounded-xl shadow-md shadow-amber-600/25 transition-all cursor-pointer active:scale-95">
            <Plus className="w-4 h-4"/>
            <span>{t.addRawMaterial}</span>
          </button>
        </div>
      </div>

      {/* Overview Stat Banners */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-500">{t.rawStockCard}</span>
            <div className="text-xl font-bold font-mono text-slate-900 mt-1">
              {totalWarehouseKg.toLocaleString()} {t.kilo}
            </div>
            <span className="text-xs text-amber-700 font-mono font-medium">
              {(totalWarehouseKg / 1000).toFixed(1)} {t.ton}
            </span>
          </div>
          <div className="p-3 bg-amber-100 text-amber-700 rounded-xl border border-amber-200">
            <Scale className="w-6 h-6"/>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-500">{t.totalValue}</span>
            <div className="text-xl font-bold font-mono text-emerald-700 mt-1">
              {totalWarehouseValue.AFN.toLocaleString()} AFN · {totalWarehouseValue.USD.toLocaleString()} USD
            </div>
            <span className="text-xs text-slate-500">{t.activeFactory}</span>
          </div>
          <div className="p-3 bg-emerald-100 text-emerald-700 rounded-xl border border-emerald-200">
            <DollarSign className="w-6 h-6"/>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-500">{t.lowStockNotificationTitle}</span>
            <div className="text-xl font-bold font-mono text-rose-700 mt-1">
              {lowStockCount} {t.itemsCount}
            </div>
            <span className="text-xs text-slate-500">
              {t.thresholdLimitLabel}: {lowStockThreshold.toLocaleString()} {t.kilo}
            </span>
          </div>
          <div className={`p-3 rounded-xl border ${lowStockCount > 0 ? 'bg-rose-100 text-rose-700 border-rose-200' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>
            <AlertTriangle className="w-6 h-6"/>
          </div>
        </div>
      </div>

      {/* SEARCH BAR & CATEGORY FILTER */}
      <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
        {/* Search input */}
        <div className="relative w-full md:w-96">
          <div className="absolute inset-y-0 start-0 flex items-center ps-3.5 pointer-events-none text-slate-400">
            <Search className="w-4 h-4"/>
          </div>
          <input type="text" placeholder={t.searchPlaceholderInventory} value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full ps-10 pe-4 py-2.5 text-xs sm:text-sm bg-slate-50 border border-slate-300 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:border-amber-600 focus:ring-1 focus:ring-amber-600 transition-colors shadow-2xs"/>
          {searchTerm && (<button type="button" onClick={() => setSearchTerm('')} className="absolute inset-y-0 end-0 pe-3 flex items-center text-slate-400 hover:text-slate-700 cursor-pointer">
              <X className="w-4 h-4"/>
            </button>)}
        </div>

        {/* Category Pills Filter */}
        <div className="flex items-center gap-1.5 overflow-x-auto w-full md:w-auto pb-1 md:pb-0 scrollbar-none">
          <span className="text-xs font-semibold text-slate-500 me-1 shrink-0 hidden sm:inline">
            {t.categoryFilter}
          </span>
          {categories.map((cat) => (<button key={cat} type="button" onClick={() => setSelectedCategory(cat)} className={`px-3 py-1.5 text-xs font-semibold rounded-xl transition-all whitespace-nowrap shrink-0 cursor-pointer ${selectedCategory === cat
                ? 'bg-amber-600 text-white shadow-xs'
                : 'bg-slate-50 text-slate-600 border border-slate-200 hover:text-slate-900 hover:bg-slate-100'}`}>
              {cat === 'all' ? t.allCategories : getLocalizedCat(cat)}
            </button>))}
        </div>
      </div>

      {/* Raw materials displayed as clean, scannable rows */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="hidden lg:grid lg:grid-cols-12 gap-3 px-5 py-3 bg-slate-50 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wide text-slate-500">
          <span className="col-span-3">{t.materialName}</span>
          <span className="col-span-2">{t.currentStockLabel}</span>
          <span>{t.unitPriceKilo}</span>
          <span>{t.totalValue}</span>
          <span className="col-span-2">{t.individualThresholdHeader}</span>
          <span className="col-span-2">{t.supplier}</span>
          <span className="text-center">{t.action}</span>
        </div>
        {filteredItems.map((item) => {
            const itemThreshold = item.lowStockThreshold ?? lowStockThreshold;
            const isLowStock = item.stockKg <= itemThreshold;
            const totalVal = item.stockKg * item.unitPrice;
            return (<div key={item.id} className={`grid grid-cols-2 lg:grid-cols-12 gap-x-3 gap-y-4 items-center px-4 sm:px-5 py-4 border-b border-slate-100 last:border-b-0 transition-colors ${isLowStock ? 'bg-rose-50/40 hover:bg-rose-50/70' : 'hover:bg-slate-50/70'}`}>
              <div className="col-span-2 lg:col-span-3 min-w-0">
                <div className="flex items-start gap-2">
                  {isLowStock && <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5"/>}
                  <div className="min-w-0">
                    <h3 className="text-sm font-bold text-slate-900 truncate" title={getLocalizedName(item.name)}>{getLocalizedName(item.name)}</h3>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200 text-amber-700 font-medium">{getLocalizedCat(item.category)}</span>
                      <span className={`text-[10px] font-bold ${isLowStock ? 'text-rose-700' : 'text-emerald-700'}`}>{isLowStock ? t.statusLow : t.statusNormal}</span>
                    </div>
                    {item.notes && <p className="text-[10px] text-slate-500 truncate mt-1" title={item.notes}>{item.notes}</p>}
                  </div>
                </div>
              </div>

              <div className="lg:col-span-2">
                <span className="lg:hidden text-[10px] text-slate-400 block mb-0.5">{t.currentStockLabel}</span>
                <span className={`text-sm font-bold font-mono ${isLowStock ? 'text-rose-700' : 'text-slate-900'}`}>{item.stockKg.toLocaleString()} {t.kilo}</span>
                <span className="block text-[10px] text-slate-400 font-mono">{(item.stockKg / 1000).toFixed(2)} {t.tons}</span>
              </div>

              <div>
                <span className="lg:hidden text-[10px] text-slate-400 block mb-0.5">{t.unitPriceKilo}</span>
                <span className="text-sm font-bold text-amber-700 font-mono">{item.unitPrice.toLocaleString()} {item.currency || 'AFN'}</span>
                <span className="block text-[10px] text-slate-400">AFN / USD</span>
              </div>

              <div>
                <span className="lg:hidden text-[10px] text-slate-400 block mb-0.5">{t.totalValue}</span>
                <span className="text-sm font-bold text-emerald-700 font-mono">{totalVal.toLocaleString()}</span>
                <span className="block text-[10px] text-slate-400">AFN / USD</span>
              </div>

              <div className="lg:col-span-2">
                <span className="lg:hidden text-[10px] text-slate-400 block mb-0.5">{t.individualThresholdHeader}</span>
                <button type="button" onClick={() => {
                    setEditingThresholdItem({
                        id: item.id,
                        name: getLocalizedName(item.name),
                        current: item.lowStockThreshold ?? lowStockThreshold
                    });
                    setNewThresholdValue(item.lowStockThreshold ?? lowStockThreshold);
                }} className="text-amber-700 font-mono hover:underline flex items-center gap-1 font-semibold cursor-pointer text-xs" title={t.individualThresholdTitle}>
                  <span>{itemThreshold.toLocaleString()} {t.kilo}</span><span className="text-slate-400">✎</span>
                </button>
              </div>

              <div className="lg:col-span-2 min-w-0">
                <span className="lg:hidden text-[10px] text-slate-400 block mb-0.5">{t.supplier}</span>
                {item.supplierName ? <div className="flex items-center gap-1.5 min-w-0"><Truck className="w-3.5 h-3.5 text-amber-600 shrink-0"/><span className="text-xs font-semibold text-slate-700 truncate" title={item.supplierName}>{item.supplierName}</span></div> : <span className="text-xs text-slate-400">—</span>}
                <span className="text-[10px] text-slate-400 block mt-1">{item.dateAdded}</span>
              </div>

              <div className="col-span-2 lg:col-span-1 flex items-center justify-end gap-1.5">
                <button type="button" onClick={() => openRestockModal(item)} className="px-2.5 py-1.5 text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg transition-colors cursor-pointer flex items-center gap-1 font-semibold text-xs" title={lang === 'fa' ? 'افزایش موجودی' : lang === 'ps' ? 'ذخیره زیاتول' : 'Restock'}>
                  <RefreshCw className="w-3.5 h-3.5"/><span className="lg:hidden xl:inline">{lang === 'fa' ? 'افزایش' : lang === 'ps' ? 'زیاتول' : 'Restock'}</span>
                </button>
                <button type="button" onClick={() => setMaterialToDelete(item.id)} className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer" title={t.delete}><Trash2 className="w-4 h-4"/></button>
              </div>
            </div>);
        })}

        {filteredItems.length === 0 && (<div className="p-12 text-center bg-white">
            <Wheat className="w-10 h-10 text-slate-400 mx-auto mb-3"/>
            <p className="text-sm text-slate-600 font-medium">
              {t.showingResults} 0 {t.records}
            </p>
            {(searchTerm || selectedCategory !== 'all') && (<button type="button" onClick={() => {
                    setSearchTerm('');
                    setSelectedCategory('all');
                }} className="mt-3 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-amber-700 text-xs font-semibold cursor-pointer">
                {t.clearFilters}
              </button>)}
          </div>)}
      </div>

      {/* Add Raw Material Modal */}
      {isModalOpen && (<div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="w-full max-w-2xl bg-white border border-slate-200 rounded-2xl shadow-2xl p-6 relative max-h-[92vh] overflow-y-auto text-slate-900">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-amber-100 text-amber-700">
                  <Wheat className="w-6 h-6"/>
                </div>
                <div>
                  <h3 className="font-bold text-lg text-slate-900">{t.addRawMaterial}</h3>
                  <p className="text-xs text-slate-500">{t.inventoryDesc}</p>
                </div>
              </div>
              <button type="button" onClick={() => setIsModalOpen(false)} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-900 hover:bg-slate-100 cursor-pointer">
                <X className="w-5 h-5"/>
              </button>
            </div>

            {/* Quick Fill presets */}
            <div className="mt-4 p-3 bg-slate-50 rounded-xl border border-slate-200">
              <span className="text-xs font-semibold text-slate-600 flex items-center gap-1 mb-2">
                <Sparkles className="w-3.5 h-3.5 text-amber-600"/>
                <span>{t.highConsumptionFactoryItems}</span>
              </span>
              <div className="flex flex-wrap gap-1.5">
                {quickPresets.map((preset, idx) => (<button key={idx} type="button" onClick={() => handleQuickFill(preset)} className="text-xs px-2.5 py-1 bg-white hover:bg-amber-600 hover:text-white text-slate-700 rounded-lg border border-slate-300 transition-colors shadow-2xs cursor-pointer">
                    {preset.name}
                  </button>))}
              </div>
            </div>

            <form onSubmit={handleSubmit} className="mt-4 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    {t.materialName} *
                  </label>
                  <input type="text" required value={itemName} onChange={(e) => setItemName(e.target.value)} placeholder={t.materialName} className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-amber-600 shadow-2xs"/>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    {t.category}
                  </label>
                  <select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-amber-600 shadow-2xs cursor-pointer">
                    <option value="Grains">{getLocalizedCat('Grains')}</option>
                    <option value="Protein">{getLocalizedCat('Protein')}</option>
                    <option value="Fuel">{getLocalizedCat('Fuel')}</option>
                    <option value="Fiber">{getLocalizedCat('Fiber')}</option>
                    <option value="Supplements">{getLocalizedCat('Supplements')}</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    {t.quantity} *
                  </label>
                  <div className="grid grid-cols-[minmax(0,1fr)_9rem] gap-2">
                    <input type="number" min="0.001" step="any" required value={stockKg} onChange={(e) => setStockKg(e.target.value)} placeholder="5000" className="min-w-0 w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-900 font-mono focus:outline-none focus:border-amber-600 shadow-2xs"/>
                    <select value={stockUnit} onChange={(e) => setStockUnit(e.target.value)} className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-sm font-semibold focus:outline-none focus:border-amber-600"><option value="kg">{t.unitKg}</option><option value="bag">{t.unitBag50kg}</option><option value="ton">{t.unitTon1000kg}</option></select>
                  </div>
                  {stockWeightKg > 0 && (<span className="text-[11px] text-slate-500 mt-1 block font-medium">
                      = {stockWeightKg.toLocaleString()} {t.kilo} · {(stockWeightKg / 1000).toLocaleString(undefined, { maximumFractionDigits: 3 })} {t.ton} · {(stockWeightKg / 50).toLocaleString(undefined, { maximumFractionDigits: 2 })} {t.bag}
                    </span>)}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    {t.unitPriceKilo} ({currency}) *
                  </label>
                  <select value={currency} onChange={(e) => setCurrency(e.target.value)} className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-sm font-bold mb-2"><option value="AFN">AFN</option><option value="USD">USD</option></select>
                  <input type="number" min="0" step="any" required value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} placeholder="25" className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-900 font-mono focus:outline-none focus:border-amber-600 shadow-2xs"/>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    {t.customThresholdOpt}
                  </label>
                  <input type="number" min="0" step="any" value={threshold} onChange={(e) => setThreshold(e.target.value)} placeholder={`${t.defaultPrefix} ${lowStockThreshold}`} className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-900 font-mono focus:outline-none focus:border-amber-600 shadow-2xs"/>
                  <p className="text-[10px] text-slate-500 mt-1">
                    {t.lowStockExplExplanation}
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    {t.supplier}
                  </label>
                  <input type="text" value={supplierName} onChange={(e) => handleSelectExistingSupplier(e.target.value)} placeholder={t.supplierNamePlaceholder} list="suppliers-list" className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-amber-600 shadow-2xs"/>
                  <datalist id="suppliers-list">
                    {db.suppliers.map(s => (<option key={s.id} value={s.name}/>))}
                  </datalist>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    {t.supplierPhoneLabel}
                  </label>
                  <input type="tel" inputMode="numeric" pattern="[0-9]{10}" minLength={10} maxLength={10} value={supplierPhone} onChange={(e) => setSupplierPhone(e.target.value.replace(/\D/g, '').slice(0, 10))} placeholder="0700000000" title={t.phoneMustBe10Digits} className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-900 font-mono focus:outline-none focus:border-amber-600 shadow-2xs"/>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    {t.amountPaidLabel} ({currency})
                  </label>
                  <input type="number" min="0" step="any" value={paidAmount} onChange={(e) => setPaidAmount(e.target.value)} placeholder={t.defaultFullPayment} className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-900 font-mono focus:outline-none focus:border-amber-600 shadow-2xs"/>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {t.notesDescriptionLabel}
                </label>
                <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t.loadDetailsPlaceholder} className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-amber-600 shadow-2xs"/>
              </div>

              {/* Total Calculation Banner */}
              <div className="p-3 bg-amber-50/70 rounded-xl border border-amber-200 flex items-center justify-between">
                <div>
                  <span className="text-xs text-slate-600 block">{t.totalBill}: <strong className="font-mono text-slate-900">{totalBillCalculated.toLocaleString()} {currency}</strong></span>
                  <span className="text-xs text-rose-700 block mt-0.5">{t.remainingDebt}: <strong className="font-mono">{remainingCalculated.toLocaleString()} {currency}</strong></span>
                </div>
                <div className="text-end">
                  <span className="text-[10px] text-slate-500 block">{t.totalWarehouseValueLabel}</span>
                  <span className="text-base font-bold text-amber-700 font-mono">
                    {totalBillCalculated.toLocaleString()} {currency}
                  </span>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold cursor-pointer">
                  {t.cancel}
                </button>
                <button type="submit" className="px-5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-md shadow-amber-600/25 cursor-pointer">
                  {t.save}
                </button>
              </div>
              {errorMsg && (<div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2" role="status">
                  <AlertTriangle className="w-4 h-4 shrink-0"/>
                  <span>{errorMsg}</span>
                </div>)}
            </form>
          </div>
        </div>)}

      {/* Quick Edit Threshold Modal */}
      {editingThresholdItem && (<div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-xl border border-slate-200">
            <h3 className="text-sm font-bold text-slate-900 mb-2">
              {t.individualThresholdTitle}
            </h3>
            <p className="text-xs text-slate-600 mb-4">
              {t.rawMaterialColon} <strong>{editingThresholdItem.name}</strong>
            </p>
            <div className="mb-4">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {t.thresholdKgColon}
              </label>
              <input type="number" min="0" step="any" value={newThresholdValue} onChange={(e) => setNewThresholdValue(e.target.value)} className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-900 font-mono focus:outline-none focus:border-amber-600 shadow-2xs"/>
              <span className="text-[10px] text-slate-500 mt-1 block">
                {t.thresholdNoticeText}
              </span>
            </div>
            <div className="flex gap-3">
              <button type="button" onClick={() => setEditingThresholdItem(null)} className="flex-1 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-100 cursor-pointer">
                {t.cancel}
              </button>
              <button type="button" onClick={() => {
                if (newThresholdValue !== '') {
                    updateRawMaterialThreshold(editingThresholdItem.id, Number(newThresholdValue));
                    setEditingThresholdItem(null);
                }
            }} className="flex-1 py-2 rounded-xl bg-amber-600 text-xs font-bold text-white hover:bg-amber-700 shadow-xs cursor-pointer">
                {t.save}
              </button>
            </div>
          </div>
        </div>)}

      {restockItem && (<div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-xl border border-slate-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-3 mb-5">
              <div>
                <h3 className="text-lg font-bold text-slate-900">{lang === 'fa' ? 'افزایش موجودی مواد خام' : lang === 'ps' ? 'د خامو موادو ذخیره زیاتول' : 'Restock raw material'}</h3>
                <p className="text-xs text-slate-500 mt-1">{getLocalizedName(restockItem.name)} · {restockItem.stockKg.toLocaleString()} {t.kilo}</p>
              </div>
              <button type="button" onClick={() => setRestockItem(null)} className="p-2 rounded-lg text-slate-400 hover:bg-slate-100"><X className="w-5 h-5"/></button>
            </div>
            <form onSubmit={handleRestock} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div><label className="block text-xs font-semibold text-slate-700 mb-1">{t.saleUnit}</label><select value={restockUnit} onChange={(e) => setRestockUnit(e.target.value)} className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-sm"><option value="kg">{t.kg}</option><option value="bag">{t.bag}</option><option value="ton">{t.ton}</option></select></div>
                <div><label className="block text-xs font-semibold text-slate-700 mb-1">{t.quantity}</label><input required type="number" min="0.001" step="any" value={restockQuantity} onChange={(e) => setRestockQuantity(e.target.value)} className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-sm font-mono"/></div>
                <div><label className="block text-xs font-semibold text-slate-700 mb-1">{t.unitPriceKilo} ({restockCurrency})</label><select value={restockCurrency} onChange={(e) => setRestockCurrency(e.target.value)} className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-sm font-bold mb-2"><option value="AFN">AFN</option><option value="USD">USD</option></select><input required type="number" min="0" step="any" value={restockPrice} onChange={(e) => setRestockPrice(e.target.value)} className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-sm font-mono"/></div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><label className="block text-xs font-semibold text-slate-700 mb-1">{t.supplier}</label><input value={restockSupplier} onChange={(e) => { setRestockSupplier(e.target.value); const supplier = db.suppliers.find(value => value.name === e.target.value); if (supplier) setRestockPhone(supplier.phone || ''); }} list="restock-suppliers" className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-sm"/><datalist id="restock-suppliers">{db.suppliers.map(supplier => <option key={supplier.id} value={supplier.name}/>)}</datalist></div>
                <div><label className="block text-xs font-semibold text-slate-700 mb-1">{t.phone}</label><input type="tel" inputMode="numeric" pattern="[0-9]{10}" minLength={10} maxLength={10} value={restockPhone} onChange={(e) => setRestockPhone(e.target.value.replace(/\D/g, '').slice(0, 10))} title={t.phoneMustBe10Digits} className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-sm" dir="ltr"/></div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><label className="block text-xs font-semibold text-slate-700 mb-1">{t.paidAmount}</label><input type="number" min="0" step="any" value={restockPaid} onChange={(e) => setRestockPaid(e.target.value)} placeholder={restockTotal.toString()} className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-sm font-mono"/></div>
                <div><label className="block text-xs font-semibold text-slate-700 mb-1">{t.notesDescriptionLabel}</label><input value={restockNotes} onChange={(e) => setRestockNotes(e.target.value)} className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-sm"/></div>
              </div>
              <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 grid grid-cols-2 gap-3 text-xs">
                <div><span className="text-slate-500 block">{t.totalAmount}</span><strong className="font-mono text-slate-900">{restockTotal.toLocaleString()} {restockCurrency}</strong></div>
                <div><span className="text-slate-500 block">{t.remainingSupplierBill}</span><strong className="font-mono text-rose-700">{Math.max(0, restockTotal - restockPaidAmount).toLocaleString()} {restockCurrency}</strong></div>
              </div>
              <div className="flex gap-3 pt-2"><button type="button" onClick={() => setRestockItem(null)} className="flex-1 py-2.5 rounded-xl border border-slate-300 text-sm font-bold text-slate-700">{t.cancel}</button><button type="submit" className="flex-1 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-sm font-bold">{lang === 'fa' ? 'ثبت افزایش موجودی' : lang === 'ps' ? 'ذخیره ثبتول' : 'Save restock'}</button></div>
              {restockError && (<div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs" role="status">{restockError}</div>)}
            </form>
          </div>
        </div>)}

      {/* In-app Confirmation Modal for Raw Material Deletion */}
      {materialToDelete && (<div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-xl border border-slate-200 text-center">
            <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto mb-4">
              <Trash2 className="w-6 h-6"/>
            </div>
            <h3 className="text-base font-bold text-slate-900 mb-2">
              {t.delete}
            </h3>
            <p className="text-xs text-slate-600 mb-6">
              {t.confirmDeleteRawMaterialImpact}
            </p>
            <div className="flex gap-3">
              <button type="button" onClick={() => setMaterialToDelete(null)} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer">
                {t.cancel}
              </button>
              <button type="button" onClick={() => {
                deleteRawMaterial(materialToDelete);
                setMaterialToDelete(null);
            }} className="flex-1 py-2.5 rounded-xl bg-rose-600 text-xs font-bold text-white hover:bg-rose-700 transition-colors cursor-pointer">
                {t.delete}
              </button>
            </div>
          </div>
        </div>)}
    </div>);
};
