import React, { useState } from 'react';
import { useDatabase } from '../context/DatabaseContext';
import { Scale, Plus, Trash2, PackageCheck, DollarSign, Layers, CalendarClock, Zap, Info, ArrowRightLeft, ChevronDown, ChevronUp, Bookmark, FolderOpen } from 'lucide-react';
export const FormulaPage = () => {
    const { db, t, lang, saveFormulaTemplate, createFormulaAndProduce, deleteFormula, getLocalizedName } = useDatabase();
    const [loadedFormulaId, setLoadedFormulaId] = useState(null);
    const [formulaName, setFormulaName] = useState('');
    const [description, setDescription] = useState('');
    const [operatorName, setOperatorName] = useState('');
    const [batchExpenses, setBatchExpenses] = useState('');
    // Ingredients list in formulation
    const [ingredients, setIngredients] = useState([
        { rawMaterialId: db.rawMaterials[0]?.id || '', weightKg: 500 },
        { rawMaterialId: db.rawMaterials[1]?.id || '', weightKg: 300 },
        { rawMaterialId: db.rawMaterials[2]?.id || '', weightKg: 150 },
        { rawMaterialId: db.rawMaterials[3]?.id || '', weightKg: 50 },
    ]);
    const [message, setMessage] = useState(null);
    const [processStatus, setProcessStatus] = useState(null);
    const [isProducing, setIsProducing] = useState(false);
    // In-app delete formula confirmation
    const [formulaToDelete, setFormulaToDelete] = useState(null);
    // Multi-unit display toggles: 'all' | 'ton' | 'bag' | 'kg'
    const [stockViewUnit, setStockViewUnit] = useState('all');
    // Quick Unit Converter state
    const [showConverter, setShowConverter] = useState(false);
    const [convTons, setConvTons] = useState(1);
    const [convBags, setConvBags] = useState(20);
    const [convKg, setConvKg] = useState(1000);
    const handleTonsChange = (val) => {
        setConvTons(val);
        if (val === '' || isNaN(Number(val))) {
            setConvBags('');
            setConvKg('');
        }
        else {
            const num = Number(val);
            setConvKg(Math.round(num * 1000 * 100) / 100);
            setConvBags(Math.round(num * 20 * 10) / 10);
        }
    };
    const handleBagsChange = (val) => {
        setConvBags(val);
        if (val === '' || isNaN(Number(val))) {
            setConvTons('');
            setConvKg('');
        }
        else {
            const num = Number(val);
            setConvKg(Math.round(num * 50 * 100) / 100);
            setConvTons(Math.round((num / 20) * 1000) / 1000);
        }
    };
    const handleKgChange = (val) => {
        setConvKg(val);
        if (val === '' || isNaN(Number(val))) {
            setConvTons('');
            setConvBags('');
        }
        else {
            const num = Number(val);
            setConvTons(Math.round((num / 1000) * 1000) / 1000);
            setConvBags(Math.round((num / 50) * 10) / 10);
        }
    };
    // Quick Preset Templates
    const applyTemplate = (type) => {
        if (db.rawMaterials.length === 0)
            return;
        const corn = db.rawMaterials.find(r => r.name.includes('Corn') || r.name.includes('جواری') || r.name.includes('جوار')) || db.rawMaterials[0];
        const soya = db.rawMaterials.find(r => r.name.includes('Soy') || r.name.includes('سویا')) || db.rawMaterials[1] || db.rawMaterials[0];
        const oilCake = db.rawMaterials.find(r => r.name.includes('Cake') || r.name.includes('کنجاره') || r.name.includes('کنجاړه')) || db.rawMaterials[2] || db.rawMaterials[0];
        const premix = db.rawMaterials.find(r => r.name.includes('Premix') || r.name.includes('ویتامین') || r.name.includes('ویټامین')) || db.rawMaterials[3] || db.rawMaterials[0];
        if (type === 'starter') {
            setFormulaName(lang === 'fa' ? 'دانه آغازین برویلر (سوپر استارتر)' : lang === 'ps' ? 'د برویلر پیلنی دانه (سوپر سټارټر)' : 'Broiler Starter Feed (Super Starter)');
            setDescription(lang === 'fa' ? 'پروتئین ۲۲ فیصد مخصوص جوجه گوشتی روز ۱ تا ۱۰' : lang === 'ps' ? '۲۲ سلنه پروتین د غوښینو چرګوړو ۱ تر ۱۰ ورځو لپاره' : '22% Protein for broiler chicks days 1-10');
            setIngredients([
                { rawMaterialId: corn.id, weightKg: 550 },
                { rawMaterialId: soya.id, weightKg: 350 },
                { rawMaterialId: oilCake.id, weightKg: 75 },
                { rawMaterialId: premix.id, weightKg: 25 },
            ]);
        }
        else if (type === 'grower') {
            setFormulaName(lang === 'fa' ? 'دانه رشد برویلر (گروور)' : lang === 'ps' ? 'د برویلر د ودې دانه (ګروور)' : 'Broiler Grower Feed');
            setDescription(lang === 'fa' ? 'پروتئین ۲۰ فیصد رشد سریع روز ۱۱ تا ۲۵' : lang === 'ps' ? '۲۰ سلنه پروتین د چټکې ودې لپاره ۱۱ تر ۲۵ ورځو' : '20% Protein for rapid broiler growth days 11-25');
            setIngredients([
                { rawMaterialId: corn.id, weightKg: 600 },
                { rawMaterialId: soya.id, weightKg: 280 },
                { rawMaterialId: oilCake.id, weightKg: 95 },
                { rawMaterialId: premix.id, weightKg: 25 },
            ]);
        }
        else {
            setFormulaName(lang === 'fa' ? 'دانه مرغ تخمی (لیر)' : lang === 'ps' ? 'د هګیو د چرګانو دانه (لیر)' : 'Layer Hen Feed');
            setDescription(lang === 'fa' ? 'فرمول تخمگذاری با کلسیم و فسفر غنی شده' : lang === 'ps' ? 'د هګیو اچولو ځانګړی فورمول د کلسیم او فاسفورس سره' : 'Layer feed enriched with calcium and phosphorus');
            setIngredients([
                { rawMaterialId: corn.id, weightKg: 620 },
                { rawMaterialId: soya.id, weightKg: 220 },
                { rawMaterialId: oilCake.id, weightKg: 135 },
                { rawMaterialId: premix.id, weightKg: 25 },
            ]);
        }
    };
    const handleAddIngredientRow = () => {
        const defaultRm = db.rawMaterials[0]?.id || '';
        setIngredients(prev => [...prev, { rawMaterialId: defaultRm, weightKg: 100 }]);
    };
    const handleRemoveIngredientRow = (index) => {
        setIngredients(prev => prev.filter((_, i) => i !== index));
    };
    const handleUpdateIngredient = (index, field, val) => {
        setIngredients(prev => {
            const updated = [...prev];
            updated[index] = { ...updated[index], [field]: val };
            return updated;
        });
    };
    // Batch Scaling: Scale current ingredients to exact target Tons
    const handleScaleBatchToTons = (targetTons) => {
        if (totalBatchWeight <= 0)
            return;
        const targetKg = targetTons * 1000;
        const factor = targetKg / totalBatchWeight;
        setIngredients(prev => prev.map(ing => ({
            ...ing,
            weightKg: Math.round(ing.weightKg * factor)
        })));
    };
    // Calculations
    let totalBatchWeight = 0;
    let totalRawMaterialCost = 0;
    ingredients.forEach(ing => {
        const raw = db.rawMaterials.find(r => r.id === ing.rawMaterialId);
        const weight = Number(ing.weightKg) || 0;
        const cost = raw ? raw.unitPrice * weight : 0;
        totalBatchWeight += weight;
        totalRawMaterialCost += cost;
    });
    const batchExpenseAmount = Number(batchExpenses) || 0;
    const totalBatchCost = totalRawMaterialCost + batchExpenseAmount;
    const costPerKg = totalBatchWeight > 0 ? totalBatchCost / totalBatchWeight : 0;
    const costPerBag = costPerKg * 50;
    const costPerTon = costPerKg * 1000;
    const totalBags = Math.round(totalBatchWeight / 50);
    const totalTons = totalBatchWeight / 1000;
    // Processed Stock Aggregations
    const totalProcessedKg = db.processedStock.reduce((acc, p) => acc + (p.stockKg || 0), 0);
    const totalProcessedTons = totalProcessedKg / 1000;
    const totalProcessedBags = Math.round(totalProcessedKg / 50);
    const totalProcessedValue = db.processedStock.reduce((acc, p) => acc + ((p.stockKg || 0) * (p.averageCostPerKg || 0)), 0);
    const handleLoadFormula = (formula) => {
        setLoadedFormulaId(formula.id);
        setFormulaName(formula.name);
        setDescription(formula.description || '');
        setIngredients(formula.ingredients.map(ingredient => ({
            rawMaterialId: ingredient.rawMaterialId,
            weightKg: ingredient.weightKg,
        })));
        setMessage({
            type: 'success',
            text: lang === 'fa' ? 'فرمول ذخیره‌شده بارگذاری شد.' : lang === 'ps' ? 'خوندي شوی فورمول پورته شو.' : 'Saved formula loaded.',
        });
    };
    const handleSaveFormula = async () => {
        setMessage(null);
        const result = await saveFormulaTemplate(formulaName, ingredients, description.trim() || undefined, loadedFormulaId || undefined);
        if (result.success) {
            setLoadedFormulaId(result.formulaId);
            setMessage({
                type: 'success',
                text: lang === 'fa' ? 'فرمول در دیتابیس ذخیره شد.' : lang === 'ps' ? 'فورمول په ډیټابیس کې خوندي شو.' : 'Formula saved to the database.',
            });
        }
        else {
            setMessage({ type: 'error', text: result.error || 'Could not save formula.' });
        }
    };
    const handleProduce = async (e) => {
        e.preventDefault();
        setProcessStatus(null);
        if (!formulaName.trim()) {
            setProcessStatus({ type: 'error', text: t.pleaseEnterFormulaName });
            return;
        }
        if (totalBatchWeight <= 0) {
            setProcessStatus({ type: 'error', text: t.totalWeightMustBePositive });
            return;
        }
        // Check if we have enough raw materials in stock
        for (const ing of ingredients) {
            const raw = db.rawMaterials.find(r => r.id === ing.rawMaterialId);
            if (!raw) {
                setProcessStatus({ type: 'error', text: t.invalidRawMaterialSelected });
                return;
            }
            if (raw.stockKg < ing.weightKg) {
                setProcessStatus({
                    type: 'error',
                    text: `${t.insufficientStockOfItem} "${getLocalizedName(raw.name)}" - ${raw.stockKg.toLocaleString()} ${t.kilo}, ${t.requestedAmount} ${ing.weightKg.toLocaleString()} ${t.kilo}.`
                });
                return;
            }
        }
        setIsProducing(true);
        const result = await createFormulaAndProduce(formulaName.trim(), ingredients, description.trim() || undefined, operatorName.trim() || undefined, true, batchExpenseAmount, loadedFormulaId);
        setIsProducing(false);
        if (result.success) {
            setProcessStatus({
                type: 'success',
                text: lang === 'fa' ? 'پروسس با موفقیت در دیتابیس ذخیره شد.' : lang === 'ps' ? 'پروسس په بریالیتوب سره ډیټابیس کې خوندي شو.' : 'Process saved to the database successfully.'
            });
            // Reset form
            setFormulaName('');
            setDescription('');
            setOperatorName('');
            setBatchExpenses('');
            setLoadedFormulaId(null);
        }
        else {
            setProcessStatus({
                type: 'error',
                text: result.error || (lang === 'fa' ? 'پروسس در دیتابیس ذخیره نشد.' : lang === 'ps' ? 'پروسس په ډیټابیس کې خوندي نه شو.' : 'Process was not saved to the database.'),
            });
        }
    };
    const handleConfirmDeleteFormula = () => {
        if (formulaToDelete) {
            deleteFormula(formulaToDelete);
            setFormulaToDelete(null);
        }
    };
    return (<div className="flex flex-col gap-6">
      {/* Header */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-100 text-amber-700">
              <Scale className="w-5 h-5"/>
            </div>
            <span>{t.formulaTitle}</span>
          </h2>
          <p className="text-xs sm:text-sm text-slate-600 mt-1">
            {t.formulaDesc}
          </p>
        </div>

        {/* Action Controls & Presets */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Quick Unit Converter Toggle Button */}
          <button type="button" onClick={() => setShowConverter(!showConverter)} className="px-3 py-1.5 rounded-xl border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-800 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs">
            <ArrowRightLeft className="w-3.5 h-3.5 text-amber-700"/>
            <span>{t.unitConverter}</span>
            {showConverter ? <ChevronUp className="w-3.5 h-3.5"/> : <ChevronDown className="w-3.5 h-3.5"/>}
          </button>

          <div className="h-5 w-px bg-slate-200 hidden sm:block"></div>

          {/* Quick Formula Presets */}
          <span className="text-xs font-semibold text-slate-500 hidden md:inline">{t.factoryPresets}</span>
          <button type="button" onClick={() => applyTemplate('starter')} className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors cursor-pointer">
            {t.starter22}
          </button>
          <button type="button" onClick={() => applyTemplate('grower')} className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors cursor-pointer">
            {t.grower20}
          </button>
          <button type="button" onClick={() => applyTemplate('layer')} className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors cursor-pointer">
            {t.layerHen}
          </button>
        </div>
      </div>

      {/* Interactive Quick Unit Converter Box (Tons <-> Bags <-> Kg) */}
      {showConverter && (<div className="p-4 bg-gradient-to-r from-amber-50 to-orange-50 rounded-2xl border border-amber-200 shadow-sm transition-all animate-fadeIn">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-amber-200/80">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-amber-600 text-white rounded-lg shadow-xs">
                <ArrowRightLeft className="w-4 h-4"/>
              </div>
              <h4 className="font-bold text-sm text-amber-950">
                {t.unitConverterTitle}
              </h4>
            </div>
            <div className="text-[11px] font-mono font-medium text-amber-800 bg-amber-100/80 px-2.5 py-1 rounded-lg border border-amber-200">
              {t.standardConversionRule}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-3">
            {/* Tons Input */}
            <div className="bg-white p-3 rounded-xl border border-amber-200 shadow-2xs">
              <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center justify-between">
                <span>{t.amountInTons}</span>
                <span className="text-[10px] text-amber-600 font-mono">1 Ton = 1000 Kg</span>
              </label>
              <div className="relative">
                <input type="number" step="any" min="0" value={convTons} onChange={(e) => handleTonsChange(e.target.value === '' ? '' : Number(e.target.value))} placeholder="1" className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-base font-bold font-mono text-slate-900 focus:outline-none focus:border-amber-600"/>
                <span className="absolute end-3 top-2.5 text-xs font-bold text-slate-400">{t.tons}</span>
              </div>
            </div>

            {/* Bags Input */}
            <div className="bg-white p-3 rounded-xl border border-amber-200 shadow-2xs">
              <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center justify-between">
                <span>{t.amountInBags}</span>
                <span className="text-[10px] text-amber-600 font-mono">1 Bag = 50 Kg</span>
              </label>
              <div className="relative">
                <input type="number" step="any" min="0" value={convBags} onChange={(e) => handleBagsChange(e.target.value === '' ? '' : Number(e.target.value))} placeholder="20" className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-base font-bold font-mono text-slate-900 focus:outline-none focus:border-amber-600"/>
                <span className="absolute end-3 top-2.5 text-xs font-bold text-slate-400">{t.bags}</span>
              </div>
            </div>

            {/* Kg Input */}
            <div className="bg-white p-3 rounded-xl border border-amber-200 shadow-2xs">
              <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center justify-between">
                <span>{t.amountInKg}</span>
                <span className="text-[10px] text-amber-600 font-mono">Standard Weight</span>
              </label>
              <div className="relative">
                <input type="number" step="any" min="0" value={convKg} onChange={(e) => handleKgChange(e.target.value === '' ? '' : Number(e.target.value))} placeholder="1000" className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-base font-bold font-mono text-slate-900 focus:outline-none focus:border-amber-600"/>
                <span className="absolute end-3 top-2.5 text-xs font-bold text-slate-400">{t.kilos}</span>
              </div>
            </div>
          </div>
        </div>)}

      {/* Main Grid: Recipe Builder (2 Cols) + Live Cost Calculator (1 Col) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Formula Recipe Builder Form (2 Columns) */}
        <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-3 border-b border-slate-100">
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Scale className="w-5 h-5 text-amber-600"/>
              <span>{t.recipeBuilderTitle}</span>
            </h3>

            {/* Scale Batch to Exact Tons Shortcuts */}
            <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 px-2.5 py-1 rounded-xl text-xs">
              <span className="text-[11px] text-slate-500 font-semibold">{t.scaleBatchTo}</span>
              <button type="button" onClick={() => handleScaleBatchToTons(1)} className="px-2 py-0.5 rounded-md bg-white border border-slate-200 hover:border-amber-500 text-slate-700 hover:text-amber-700 font-bold transition-all cursor-pointer shadow-2xs">
                {t.ton1}
              </button>
              <button type="button" onClick={() => handleScaleBatchToTons(2)} className="px-2 py-0.5 rounded-md bg-white border border-slate-200 hover:border-amber-500 text-slate-700 hover:text-amber-700 font-bold transition-all cursor-pointer shadow-2xs">
                {t.ton2}
              </button>
              <button type="button" onClick={() => handleScaleBatchToTons(5)} className="px-2 py-0.5 rounded-md bg-white border border-slate-200 hover:border-amber-500 text-slate-700 hover:text-amber-700 font-bold transition-all cursor-pointer shadow-2xs">
                {t.ton5}
              </button>
            </div>
          </div>

          <form onSubmit={handleProduce} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {t.formulaNameLabel}
                </label>
                <input type="text" required value={formulaName} onChange={(e) => setFormulaName(e.target.value)} placeholder={t.formulaNamePlaceholder} className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-amber-600 shadow-2xs"/>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {t.operatorNameLabel}
                </label>
                <input type="text" value={operatorName} onChange={(e) => setOperatorName(e.target.value)} placeholder={t.operatorPlaceholder} className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-amber-600 shadow-2xs"/>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {t.formulaDescriptionLabel}
                </label>
                <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t.formulaDescPlaceholder} className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-amber-600 shadow-2xs"/>
              </div>

              {/* Batch Production Expenses Input */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1">
                  <Zap className="w-3.5 h-3.5 text-amber-600"/>
                  <span>{t.batchProductionExpense} ({t.currency})</span>
                </label>
                <input type="number" min="0" step="any" value={batchExpenses} onChange={(e) => setBatchExpenses(e.target.value ? Number(e.target.value) : '')} placeholder="0" className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-900 font-mono focus:outline-none focus:border-amber-600 shadow-2xs"/>
              </div>
            </div>

            {/* Ingredients Table / Rows */}
            <div className="mt-5 space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  {t.rawItemsInBatch}
                </label>
                <button type="button" onClick={handleAddIngredientRow} className="px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer">
                  <Plus className="w-3.5 h-3.5"/>
                  <span>{t.addRawIngredient}</span>
                </button>
              </div>

              <div className="space-y-2.5">
                {ingredients.map((ing, idx) => {
            const selectedRaw = db.rawMaterials.find(r => r.id === ing.rawMaterialId);
            const cost = selectedRaw ? selectedRaw.unitPrice * (Number(ing.weightKg) || 0) : 0;
            const isInsufficient = selectedRaw && selectedRaw.stockKg < (Number(ing.weightKg) || 0);
            return (<div key={idx} className={`p-3 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${isInsufficient ? 'bg-rose-50 border-rose-200' : 'bg-slate-50 border-slate-200'}`}>
                      <div className="flex-1 min-w-0">
                        <label className="block text-[10px] text-slate-500 mb-1">{t.selectRawIndex} #{idx + 1}</label>
                        <select value={ing.rawMaterialId} onChange={(e) => handleUpdateIngredient(idx, 'rawMaterialId', e.target.value)} className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-amber-600 shadow-2xs font-medium">
                          {db.rawMaterials.map(rm => (<option key={rm.id} value={rm.id}>
                              {getLocalizedName(rm.name)} ({t.currentStockLabel}: {(rm.stockKg / 1000).toFixed(2)} {t.tons} / {rm.stockKg.toLocaleString()} {t.kilo} • {rm.unitPrice} {t.currency}/kg)
                            </option>))}
                        </select>
                      </div>

                      <div className="w-full sm:w-36">
                        <label className="block text-[10px] text-slate-500 mb-1">{t.weightKgLabel}</label>
                        <input type="number" min="1" step="any" value={ing.weightKg} onChange={(e) => handleUpdateIngredient(idx, 'weightKg', e.target.value ? Number(e.target.value) : 0)} className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 font-mono focus:outline-none focus:border-amber-600 shadow-2xs"/>
                      </div>

                      <div className="w-full sm:w-32 text-end sm:pt-4">
                        <span className="text-[10px] text-slate-500 block">{t.itemCostTotal}</span>
                        <span className="text-xs font-bold text-amber-700 font-mono">
                          {cost.toLocaleString()} {t.currency}
                        </span>
                      </div>

                      <div className="sm:pt-4">
                        <button type="button" onClick={() => handleRemoveIngredientRow(idx)} className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer">
                          <Trash2 className="w-4 h-4"/>
                        </button>
                      </div>
                    </div>);
        })}
              </div>
            </div>

            <div className="pt-4 border-t border-slate-100 flex flex-wrap items-start justify-end gap-2">
              <div className="flex flex-col items-stretch sm:items-end">
                <button type="button" onClick={handleSaveFormula} className="px-5 py-3 rounded-xl bg-white hover:bg-amber-50 text-amber-800 border border-amber-300 font-bold text-sm transition-all flex items-center justify-center gap-2 cursor-pointer">
                  <Bookmark className="w-4 h-4"/>
                  <span>{loadedFormulaId
                      ? (lang === 'fa' ? 'به‌روزرسانی فرمول' : lang === 'ps' ? 'فورمول تازه کول' : 'Update formula')
                      : (lang === 'fa' ? 'ذخیره فرمول' : lang === 'ps' ? 'فورمول خوندي کول' : 'Save formula')}</span>
                </button>
                {message && <p className={`mt-2 text-xs font-semibold ${message.type === 'success' ? 'text-emerald-700' : 'text-rose-700'}`} role="status">{message.text}</p>}
              </div>
              <div className="flex flex-col items-stretch sm:items-end">
                <button type="submit" disabled={isProducing} className="px-6 py-3 rounded-xl bg-amber-600 hover:bg-amber-700 disabled:bg-amber-400 disabled:cursor-wait text-white font-bold text-sm shadow-md shadow-amber-600/25 transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-95">
                  <PackageCheck className="w-4 h-4"/>
                  <span>{isProducing ? (lang === 'fa' ? 'در حال ذخیره...' : lang === 'ps' ? 'د خوندي کولو په حال کې...' : 'Saving...') : t.produceFeedBtn}</span>
                </button>
                {processStatus && <p className={`mt-2 text-xs font-semibold ${processStatus.type === 'success' ? 'text-emerald-700' : 'text-rose-700'}`} role="status">{processStatus.text}</p>}
              </div>
            </div>
          </form>
        </div>

        {/* Real-time Calculation Panel (1 Column) - Multi-Unit (Tons, Bags, Kg) */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between space-y-6">
          <div>
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2 pb-3 border-b border-slate-100">
              <DollarSign className="w-4 h-4 text-emerald-600"/>
              <span>{t.autoCostCalcTon}</span>
            </h3>

            <div className="space-y-3 mt-4">
              {/* Total Weight in Tons & Kilo */}
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                <span className="text-xs text-slate-500 block">{t.totalFormulaWeight}:</span>
                <div className="text-2xl font-black font-mono text-slate-900 mt-1 flex items-baseline gap-2">
                  <span>{totalTons.toFixed(3)}</span>
                  <span className="text-sm font-bold text-amber-700">{t.tons}</span>
                </div>
                <div className="text-xs text-slate-600 mt-1.5 font-mono font-medium flex items-center gap-2 pt-1 border-t border-slate-200">
                  <span className="bg-slate-200/80 px-2 py-0.5 rounded text-slate-800 font-bold">
                    {totalBatchWeight.toLocaleString()} {t.kilo}
                  </span>
                  <span>•</span>
                  <span className="bg-amber-100 px-2 py-0.5 rounded text-amber-800 font-bold">
                    {totalBags.toLocaleString()} {t.bags}
                  </span>
                </div>
              </div>

              {/* Raw Material Cost & Batch Expenses */}
              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 text-xs">
                <div className="flex justify-between items-center text-slate-600">
                  <span>{t.rawMaterialsCost}</span>
                  <span className="font-mono font-bold">{totalRawMaterialCost.toLocaleString()} {t.currency}</span>
                </div>
                {batchExpenseAmount > 0 && (<div className="flex justify-between items-center text-amber-700 mt-1.5 pt-1.5 border-t border-slate-200">
                    <span>{t.prodExpensesSub}</span>
                    <span className="font-mono font-bold">+{batchExpenseAmount.toLocaleString()} {t.currency}</span>
                  </div>)}
                <div className="flex justify-between items-center text-slate-900 font-bold mt-2 pt-2 border-t border-slate-300">
                  <span>{t.totalBatchCost}:</span>
                  <span className="font-mono text-cyan-700">{totalBatchCost.toLocaleString()} {t.currency}</span>
                </div>
              </div>

              {/* Comprehensive Cost Rate per Unit: TON, BAG, KG */}
              <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-200 space-y-2">
                <div>
                  <span className="text-xs font-semibold text-emerald-800 block">
                    {t.costPerTonResult}:
                  </span>
                  <div className="text-2xl font-black font-mono text-emerald-800 mt-0.5">
                    {costPerTon.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 1 })} {t.currency}
                    <span className="text-xs font-medium text-emerald-700 ms-1">/ {t.tons}</span>
                  </div>
                </div>

                <div className="pt-2 border-t border-emerald-200 grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-[10px] text-emerald-700 block">{t.costPerBag50kg}</span>
                    <strong className="font-mono text-emerald-900 text-sm">
                      {costPerBag.toFixed(0)} {t.currency}
                    </strong>
                  </div>
                  <div>
                    <span className="text-[10px] text-emerald-700 block">{t.costPerKgShort}</span>
                    <strong className="font-mono text-emerald-900 text-sm">
                      {costPerKg.toFixed(2)} {t.currency}
                    </strong>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-[11px] text-slate-600 flex items-start gap-2">
            <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5"/>
            <span>
              {t.costTransferNotice}
            </span>
          </div>
        </div>
      </div>

      {/* Processed Feed Stock Section with Multi-Unit View (Tons, Bags, Kg) */}
      <div className="order-2 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
        {/* Section Header & Unit Selector */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-emerald-100 text-emerald-700 rounded-xl">
              <PackageCheck className="w-5 h-5"/>
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                {t.processedStockTitleTons}
              </h3>
              <p className="text-xs text-slate-500">
                {t.processedStockSubtitle}
              </p>
            </div>
          </div>

          {/* Unit Selector Tabs */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-xs font-semibold">
            <button type="button" onClick={() => setStockViewUnit('all')} className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${stockViewUnit === 'all'
            ? 'bg-white text-slate-900 shadow-xs font-bold'
            : 'text-slate-600 hover:text-slate-900'}`}>
              {t.allUnits}
            </button>
            <button type="button" onClick={() => setStockViewUnit('ton')} className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${stockViewUnit === 'ton'
            ? 'bg-amber-600 text-white shadow-xs font-bold'
            : 'text-slate-600 hover:text-slate-900'}`}>
              {t.inTons}
            </button>
            <button type="button" onClick={() => setStockViewUnit('bag')} className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${stockViewUnit === 'bag'
            ? 'bg-amber-600 text-white shadow-xs font-bold'
            : 'text-slate-600 hover:text-slate-900'}`}>
              {t.inBags}
            </button>
            <button type="button" onClick={() => setStockViewUnit('kg')} className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${stockViewUnit === 'kg'
            ? 'bg-amber-600 text-white shadow-xs font-bold'
            : 'text-slate-600 hover:text-slate-900'}`}>
              {t.inKg}
            </button>
          </div>
        </div>

        {/* Global Processed Stock Overview Banners */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div className="p-3.5 rounded-xl bg-amber-50/70 border border-amber-200">
            <span className="text-[11px] font-semibold text-amber-800 block">{t.totalStockInTons}</span>
            <div className="text-xl font-bold font-mono text-amber-900 mt-1">
              {totalProcessedTons.toFixed(2)} {t.tons}
            </div>
            <span className="text-[10px] text-amber-700">{t.equivalentMetricTon}</span>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
            <span className="text-[11px] font-semibold text-slate-600 block">{t.totalInBags50kg}</span>
            <div className="text-xl font-bold font-mono text-slate-900 mt-1">
              {totalProcessedBags.toLocaleString()} {t.bags}
            </div>
            <span className="text-[10px] text-slate-500">{t.bagsPerTonRule}</span>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
            <span className="text-[11px] font-semibold text-slate-600 block">{t.totalInKg}</span>
            <div className="text-xl font-bold font-mono text-slate-900 mt-1">
              {totalProcessedKg.toLocaleString()} {t.kilos}
            </div>
            <span className="text-[10px] text-slate-500">{t.totalWarehouseWeight}</span>
          </div>

          <div className="p-3.5 rounded-xl bg-emerald-50/70 border border-emerald-200">
            <span className="text-[11px] font-semibold text-emerald-800 block">{t.totalProcessedStockValue}</span>
            <div className="text-xl font-bold font-mono text-emerald-900 mt-1">
              {totalProcessedValue.toLocaleString()} {t.currency}
            </div>
            <span className="text-[10px] text-emerald-700">{db.processedStock.length} {t.readyFeedTypes}</span>
          </div>
        </div>

        {/* Processed Stock Items List */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pt-2">
          {db.processedStock.map(p => {
            const bags = Math.round(p.stockKg / 50);
            const tons = p.stockKg / 1000;
            const ratePerTon = p.averageCostPerKg * 1000;
            const ratePerBag = p.averageCostPerKg * 50;
            return (<div key={p.id} className="p-4 rounded-xl border border-slate-200 bg-white hover:border-amber-300 transition-all shadow-2xs flex flex-col justify-between">
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <h4 className="font-bold text-slate-900 text-sm">
                      {getLocalizedName(p.name)}
                    </h4>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                      {tons.toFixed(2)} {t.tons}
                    </span>
                  </div>

                  {/* Stock Quantity Display according to selected view unit */}
                  <div className="mt-3 p-3 bg-slate-50 rounded-xl border border-slate-100 space-y-1.5">
                    {stockViewUnit === 'ton' && (<div>
                        <span className="text-[10px] text-slate-500 block">{t.processedStockInTons}:</span>
                        <div className="text-2xl font-black font-mono text-amber-800">
                          {tons.toFixed(2)} <span className="text-xs font-semibold">{t.tons}</span>
                        </div>
                        <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                          {t.equivalentTonRate} {bags.toLocaleString()} {t.bags} • {p.stockKg.toLocaleString()} {t.kilo}
                        </div>
                      </div>)}

                    {stockViewUnit === 'bag' && (<div>
                        <span className="text-[10px] text-slate-500 block">{t.inBags}:</span>
                        <div className="text-2xl font-black font-mono text-slate-900">
                          {bags.toLocaleString()} <span className="text-xs font-semibold">{t.bags}</span>
                        </div>
                        <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                          {t.equivalentTonRate} {tons.toFixed(2)} {t.tons} • {p.stockKg.toLocaleString()} {t.kilo}
                        </div>
                      </div>)}

                    {stockViewUnit === 'kg' && (<div>
                        <span className="text-[10px] text-slate-500 block">{t.inKg}:</span>
                        <div className="text-2xl font-black font-mono text-slate-900">
                          {p.stockKg.toLocaleString()} <span className="text-xs font-semibold">{t.kilos}</span>
                        </div>
                        <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                          {t.equivalentTonRate} {tons.toFixed(2)} {t.tons} • {bags.toLocaleString()} {t.bags}
                        </div>
                      </div>)}

                    {stockViewUnit === 'all' && (<div className="grid grid-cols-3 gap-2 text-center">
                        <div className="p-2 rounded-lg bg-amber-50 border border-amber-200">
                          <span className="text-[10px] text-amber-800 block font-semibold">{t.inTons}</span>
                          <span className="font-bold font-mono text-amber-900 text-sm">{tons.toFixed(2)}</span>
                        </div>
                        <div className="p-2 rounded-lg bg-white border border-slate-200">
                          <span className="text-[10px] text-slate-500 block font-semibold">{t.inBags}</span>
                          <span className="font-bold font-mono text-slate-900 text-sm">{bags.toLocaleString()}</span>
                        </div>
                        <div className="p-2 rounded-lg bg-white border border-slate-200">
                          <span className="text-[10px] text-slate-500 block font-semibold">{t.inKg}</span>
                          <span className="font-bold font-mono text-slate-900 text-sm">{p.stockKg.toLocaleString()}</span>
                        </div>
                      </div>)}
                  </div>

                  {/* Production Cost Rates Breakdown */}
                  <div className="mt-3 pt-2 border-t border-slate-100 text-xs space-y-1">
                    <div className="flex justify-between items-center text-slate-600">
                      <span className="font-medium">{t.costPerTon}:</span>
                      <span className="font-mono font-bold text-amber-800">
                        {ratePerTon.toLocaleString(undefined, { maximumFractionDigits: 1 })} {t.currency}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-slate-600">
                      <span className="font-medium">{t.costPerBag50kg}</span>
                      <span className="font-mono font-bold text-slate-800">
                        {ratePerBag.toFixed(0)} {t.currency}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-slate-600">
                      <span className="font-medium">{t.costPerKgShort}</span>
                      <span className="font-mono font-bold text-slate-800">
                        {p.averageCostPerKg.toFixed(2)} {t.currency}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-400">
                  <span>{t.date}: {p.lastUpdated}</span>
                  <span className="font-mono">ID: {p.id.slice(-6)}</span>
                </div>
              </div>);
        })}
        </div>
      </div>

      {/* Saved Formulated Items Section with Delete Option & Tons */}
      <div className="order-1 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
        <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2 mb-4">
          <Layers className="w-4 h-4 text-amber-600"/>
          <span>{t.savedFormulasWithTons}</span>
        </h3>

        {db.formulas.length === 0 ? (<p className="text-xs text-slate-500 p-4 text-center">{t.noFormulaRegistered}</p>) : (<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {db.formulas.map(f => {
                const formulaTons = f.totalWeightKg / 1000;
                const formulaBags = Math.round(f.totalWeightKg / 50);
                const costTon = f.costPerKg * 1000;
                const costBag = f.costPerKg * 50;
                return (<div key={f.id} className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-slate-50 transition-colors flex flex-col justify-between">
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="font-bold text-slate-900 text-sm">{f.name}</h4>
                      <div className="flex items-center gap-1">
                        <button type="button" onClick={() => handleLoadFormula(f)} className="p-1.5 text-amber-700 hover:bg-amber-100 rounded-lg transition-colors cursor-pointer" title={lang === 'fa' ? 'بارگذاری فرمول' : lang === 'ps' ? 'فورمول پورته کول' : 'Load formula'}>
                          <FolderOpen className="w-4 h-4"/>
                        </button>
                        <button type="button" onClick={() => setFormulaToDelete(f.id)} className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer" title={t.deleteFormula}>
                          <Trash2 className="w-4 h-4"/>
                        </button>
                      </div>
                    </div>
                    {f.description && (<p className="text-xs text-slate-600 mt-1">{f.description}</p>)}
                    <div className="mt-3 pt-2 border-t border-slate-200/60 space-y-1.5 text-xs">
                      <div className="flex justify-between text-slate-600">
                        <span>{t.totalFormulaWeight}:</span>
                        <span className="font-mono font-bold text-slate-800">
                          {formulaTons.toFixed(2)} {t.tons} ({f.totalWeightKg.toLocaleString()} kg • {formulaBags} {t.bags})
                        </span>
                      </div>
                      <div className="flex justify-between text-slate-600">
                        <span>{t.costPerTon}:</span>
                        <span className="font-mono font-bold text-emerald-700">
                          {costTon.toLocaleString(undefined, { maximumFractionDigits: 1 })} {t.currency}
                        </span>
                      </div>
                      <div className="flex justify-between text-slate-600">
                        <span>{t.costPerBag50kg} / {t.costPerKgShort}</span>
                        <span className="font-mono font-semibold text-slate-700">
                          {costBag.toFixed(0)} / {f.costPerKg.toFixed(2)} {t.currency}
                        </span>
                      </div>
                      <div className="flex justify-between text-slate-600">
                        <span>{t.totalBatchCost}:</span>
                        <span className="font-mono font-bold text-slate-800">
                          {f.totalBatchCost.toLocaleString()} {t.currency}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 pt-2 border-t border-slate-200 text-[11px] text-slate-400">
                    {t.date}: {f.createdDate}
                  </div>
                </div>);
            })}
          </div>)}
      </div>

      {/* Recent Production Batches with Tons */}
      <div className="order-3 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
        <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2 mb-3">
          <CalendarClock className="w-4 h-4 text-amber-600"/>
          <span>{t.productionHistoryTons}</span>
        </h3>

        <div className="space-y-2.5">
          {db.productionBatches.slice(0, 8).map(b => {
            const batchTons = b.totalWeightKg / 1000;
            const batchBags = Math.round(b.totalWeightKg / 50);
            return (<div key={b.id} className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/70 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                <div>
                  <h4 className="font-bold text-slate-900">{getLocalizedName(b.formulaName)}</h4>
                  <span className="text-[11px] text-slate-500">
                    {t.date}: {b.date} {b.operatorName ? `• ${t.operatorNameLabel}: ${b.operatorName}` : ''}
                  </span>
                </div>
                <div className="text-end">
                  <span className="font-bold font-mono text-slate-900 text-sm block">
                    {batchTons.toFixed(2)} {t.tons}
                  </span>
                  <span className="text-[11px] text-slate-500 font-mono">
                    {batchBags} {t.bags} • {b.totalWeightKg.toLocaleString()} {t.kilo}
                  </span>
                </div>
              </div>);
        })}
        </div>
      </div>

      {/* In-app Confirmation Modal for Deleting Formula */}
      {formulaToDelete && (<div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-xl border border-slate-200 text-center">
            <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto mb-4">
              <Trash2 className="w-6 h-6"/>
            </div>
            <h3 className="text-base font-bold text-slate-900 mb-2">
              {t.deleteFormula}
            </h3>
            <p className="text-xs text-slate-600 mb-6">
              {t.confirmDeleteFormula}
            </p>
            <div className="flex gap-3">
              <button type="button" onClick={() => setFormulaToDelete(null)} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer">
                {t.cancelBtn}
              </button>
              <button type="button" onClick={handleConfirmDeleteFormula} className="flex-1 py-2.5 rounded-xl bg-rose-600 text-xs font-bold text-white hover:bg-rose-700 transition-colors cursor-pointer">
                {t.deleteFormulaConfirmBtn}
              </button>
            </div>
          </div>
        </div>)}
    </div>);
};
