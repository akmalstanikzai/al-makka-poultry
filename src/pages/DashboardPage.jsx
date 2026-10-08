import React, { useState } from 'react';
import { useDatabase } from '../context/DatabaseContext';
import { Wheat, PackageCheck, Truck, Users, TrendingUp, Wallet, Receipt, CalendarClock, AlertTriangle, CheckCircle2, SlidersHorizontal, ArrowRight, ArrowLeft } from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, Legend, PieChart, Pie, Cell, CartesianGrid } from 'recharts';
export const DashboardPage = ({ setActiveTab }) => {
    const { db, t, lang, lowStockThreshold, setLowStockThreshold, lowStockMaterials, getLocalizedName } = useDatabase();
    const [editingThreshold, setEditingThreshold] = useState(false);
    const [thresholdInput, setThresholdInput] = useState(lowStockThreshold.toString());
    const isRtl = lang === 'fa' || lang === 'ps';
    // 1. RAW stock in kilo
    const totalRawStockKg = db.rawMaterials.reduce((acc, r) => acc + (r.stockKg || 0), 0);
    const totalRawStockValue = db.rawMaterials.reduce((acc,r)=>{acc[r.currency === 'USD' ? 'USD' : 'AFN'] += r.stockKg*r.unitPrice||0;return acc;},{AFN:0,USD:0});
    // 2. Processed Stock in kilo and bags (1 bag = 50 kg)
    const totalProcessedKg = db.processedStock.reduce((acc, p) => acc + (p.stockKg || 0), 0);
    const totalProcessedBags = Math.round((totalProcessedKg / 50) * 100) / 100;
    // 3. Money we owe to suppliers
    const totalOwedToSuppliers = { AFN: db.suppliers.reduce((a,s)=>a+(s.balanceOwed||0),0), USD: db.suppliers.reduce((a,s)=>a+(s.balanceOwedUsd||0),0) };
    // 4. Money payable by customers
    const totalReceivableFromCustomers = { AFN: db.customers.reduce((a,c)=>a+(c.balanceOwed||0),0), USD: db.customers.reduce((a,c)=>a+(c.balanceOwedUsd||0),0) };
    // 5. Total processed material sold
    const totalSalesAmount = db.sales.reduce((a,s)=>{a[s.currency === 'USD' ? 'USD' : 'AFN']+=s.totalAmount||0;return a;},{AFN:0,USD:0});
    const totalSalesKg = db.sales.reduce((acc, s) => acc + (s.quantityKg || 0), 0);
    const totalGrossProfit = db.sales.reduce((a,s)=>{a.AFN += s.profit || 0; a.USD += s.profitUsd || 0; return a;},{AFN:0,USD:0});
    // 6. Money in Hand
    const moneyInHand = { AFN: db.cashInHand || 0, USD: db.cashInHandUsd || 0 };
    // 7. Total expenses
    const totalExpenses = db.expenses.reduce((a,e)=>{a[e.currency === 'USD' ? 'USD' : 'AFN']+=e.amount||0;return a;},{AFN:0,USD:0});
    // 8. Daily Processed material (today's batches)
    const todayStr = new Date().toISOString().split('T')[0];
    const todayBatches = db.productionBatches.filter(b => b.date === todayStr);
    const dailyProcessedKg = todayBatches.reduce((acc, b) => acc + (b.totalWeightKg || 0), 0);
    const dailyProcessedBags = Math.round((dailyProcessedKg / 50) * 100) / 100;
    // Chart data for trend
    const last7Days = Array.from({ length: 7 }, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - (6 - i));
        return d.toISOString().split('T')[0];
    });
    const trendData = last7Days.map(date => {
        const daySales = db.sales
            .filter(s => s.date === date)
            .reduce((sum, s) => sum + s.totalAmount, 0);
        const dayCost = db.sales
            .filter(s => s.date === date)
            .reduce((sum, s) => sum + s.totalCostOfGoods, 0);
        const dayExp = db.expenses
            .filter(e => e.date === date)
            .reduce((sum, e) => sum + e.amount, 0);
        const netProfit = daySales - dayCost - dayExp;
        const parts = date.split('-');
        const label = `${parts[1]}/${parts[2]}`;
        return {
            date: label,
            sales: daySales,
            expenses: dayExp,
            profit: Math.max(0, netProfit),
        };
    });
    // Inventory breakdown for pie chart
    const COLORS = ['#d97706', '#059669', '#2563eb', '#dc2626', '#7c3aed', '#0891b2', '#db2777'];
    const inventoryPieData = db.rawMaterials.map(rm => ({
        id: rm.id,
        name: getLocalizedName(rm.name).split('(')[0].trim(),
        value: rm.stockKg,
    })).filter(item => item.value > 0);
    const handleSaveThreshold = (e) => {
        e.preventDefault();
        const val = Number(thresholdInput);
        if (!isNaN(val) && val > 0) {
            setLowStockThreshold(val);
            setEditingThreshold(false);
        }
    };
    // Rectangular clickable cards configuration (Light Theme)
    const rectangularCards = [
        {
            id: 'raw-stock',
            title: t.rawStockCard,
            value: `${totalRawStockKg.toLocaleString()} ${t.kilo}`,
            subvalue: `${(totalRawStockKg / 1000).toFixed(1)} ${t.ton} (${totalRawStockValue.AFN.toLocaleString()} AFN · ${totalRawStockValue.USD.toLocaleString()} USD)`,
            icon: Wheat,
            bg: 'bg-white hover:bg-amber-50/40',
            border: 'border-slate-200 hover:border-amber-400',
            textColor: 'text-amber-700',
            iconBg: 'bg-amber-100 text-amber-700',
            tab: 'inventory',
            badge: `${db.rawMaterials.length} ${t.itemsCount}`,
            hasAlert: lowStockMaterials.length > 0,
        },
        {
            id: 'processed-stock',
            title: t.processedStockCard,
            value: `${totalProcessedKg.toLocaleString()} ${t.kilo}`,
            subvalue: `${totalProcessedBags.toLocaleString()} ${t.bag} (${(totalProcessedKg / 1000).toFixed(1)} ${t.ton})`,
            icon: PackageCheck,
            bg: 'bg-white hover:bg-emerald-50/40',
            border: 'border-slate-200 hover:border-emerald-400',
            textColor: 'text-emerald-700',
            iconBg: 'bg-emerald-100 text-emerald-700',
            tab: 'formula',
            badge: `${db.processedStock.length} ${t.records}`,
        },
        {
            id: 'owe-suppliers',
            title: t.oweSuppliersCard,
            value: `${totalOwedToSuppliers.AFN.toLocaleString()} AFN · ${totalOwedToSuppliers.USD.toLocaleString()} USD`,
            subvalue: `${db.suppliers.filter(s => s.balanceOwed > 0).length} ${t.navSuppliers}`,
            icon: Truck,
            bg: 'bg-white hover:bg-rose-50/40',
            border: 'border-slate-200 hover:border-rose-400',
            textColor: 'text-rose-700',
            iconBg: 'bg-rose-100 text-rose-700',
            tab: 'suppliers',
            badge: totalOwedToSuppliers.AFN > 0 || totalOwedToSuppliers.USD > 0 ? t.statusUnpaid : t.statusPaid,
        },
        {
            id: 'payable-customers',
            title: t.receivableCustomersCard,
            value: `${totalReceivableFromCustomers.AFN.toLocaleString()} AFN · ${totalReceivableFromCustomers.USD.toLocaleString()} USD`,
            subvalue: `${db.customers.filter(c => c.balanceOwed > 0).length} ${t.navCustomers}`,
            icon: Users,
            bg: 'bg-white hover:bg-blue-50/40',
            border: 'border-slate-200 hover:border-blue-400',
            textColor: 'text-blue-700',
            iconBg: 'bg-blue-100 text-blue-700',
            tab: 'customers',
            badge: totalReceivableFromCustomers.AFN > 0 || totalReceivableFromCustomers.USD > 0 ? t.statusUnpaid : t.statusPaid,
        },
        {
            id: 'total-processed-sold',
            title: t.totalProcessedSellCard,
            value: `${totalSalesAmount.AFN.toLocaleString()} AFN · ${totalSalesAmount.USD.toLocaleString()} USD`,
            subvalue: `${totalSalesKg.toLocaleString()} ${t.kilo} (${(Math.round((totalSalesKg / 50) * 100) / 100).toLocaleString()} ${t.bag})`,
            icon: TrendingUp,
            bg: 'bg-white hover:bg-cyan-50/40',
            border: 'border-slate-200 hover:border-cyan-400',
            textColor: 'text-cyan-700',
            iconBg: 'bg-cyan-100 text-cyan-700',
            tab: 'sales',
            badge: `${totalGrossProfit.AFN.toLocaleString()} AFN · ${totalGrossProfit.USD.toLocaleString()} USD`,
        },
        {
            id: 'money-in-hand',
            title: t.moneyInHandCard,
            value: `${moneyInHand.AFN.toLocaleString()} AFN · ${moneyInHand.USD.toLocaleString()} USD`,
            subvalue: t.moneyInHandCard,
            icon: Wallet,
            bg: 'bg-white hover:bg-emerald-50/40',
            border: 'border-slate-200 hover:border-emerald-500',
            textColor: 'text-emerald-800',
            iconBg: 'bg-emerald-100 text-emerald-800',
            tab: 'expenses',
            badge: 'AFN / USD',
        },
        {
            id: 'total-expenses',
            title: t.totalExpensesCard,
            value: `${totalExpenses.AFN.toLocaleString()} AFN · ${totalExpenses.USD.toLocaleString()} USD`,
            subvalue: `${db.expenses.length} ${t.records}`,
            icon: Receipt,
            bg: 'bg-white hover:bg-amber-50/40',
            border: 'border-slate-200 hover:border-amber-500',
            textColor: 'text-amber-800',
            iconBg: 'bg-amber-100 text-amber-800',
            tab: 'expenses',
            badge: `${db.expenses.length} ${t.records}`,
        },
        {
            id: 'daily-processed',
            title: t.dailyProcessedCard,
            value: `${dailyProcessedKg.toLocaleString()} ${t.kilo}`,
            subvalue: `${dailyProcessedBags} ${t.bag} (${todayBatches.length} ${t.records})`,
            icon: CalendarClock,
            bg: 'bg-white hover:bg-indigo-50/40',
            border: 'border-slate-200 hover:border-indigo-400',
            textColor: 'text-indigo-700',
            iconBg: 'bg-indigo-100 text-indigo-700',
            tab: 'formula',
            badge: `${todayBatches.length} ${t.records}`,
        },
    ];
    return (<div className="space-y-6">
      {/* 1. VISUAL NOTIFICATION SYSTEM BANNER (LOW STOCK HIGHLIGHT) */}
      {lowStockMaterials.length > 0 ? (<div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-rose-50 via-amber-50/50 to-white border border-rose-200 shadow-sm relative overflow-hidden">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex items-start sm:items-center gap-3.5">
              <div className="p-3 rounded-xl bg-rose-100 border border-rose-200 text-rose-600 shrink-0 animate-pulse">
                <AlertTriangle className="w-6 h-6"/>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-base sm:text-lg text-slate-900">
                    {t.lowStockNotificationTitle}
                  </h3>
                  <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-rose-600 text-white">
                    {lowStockMaterials.length} {t.itemsCount}
                  </span>
                </div>
                <p className="text-xs sm:text-sm text-slate-600 mt-1">
                  {t.lowStockWarningMessage
                .replace('{count}', lowStockMaterials.length.toString())
                .replace('{threshold}', lowStockThreshold.toLocaleString())}
                </p>
              </div>
            </div>

            {/* Threshold quick controls & Restock CTA */}
            <div className="flex flex-wrap items-center gap-2.5 self-start lg:self-auto">
              {!editingThreshold ? (<button type="button" onClick={() => {
                    setThresholdInput(lowStockThreshold.toString());
                    setEditingThreshold(true);
                }} className="px-3 py-2 rounded-xl bg-white hover:bg-slate-50 border border-slate-300 text-xs font-semibold text-slate-700 flex items-center gap-1.5 transition-colors shadow-2xs">
                  <SlidersHorizontal className="w-3.5 h-3.5 text-amber-600"/>
                  <span>{t.lowStockThresholdLabel} {lowStockThreshold.toLocaleString()} {t.kilo}</span>
                </button>) : (<form onSubmit={handleSaveThreshold} className="flex items-center gap-1.5">
                  <input type="number" min="0" step="any" value={thresholdInput} onChange={(e) => setThresholdInput(e.target.value)} className="w-24 bg-white border border-slate-300 rounded-lg px-2 py-1 text-xs text-slate-900 font-mono shadow-2xs"/>
                  <button type="submit" className="px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-xs">
                    {t.saveThreshold}
                  </button>
                  <button type="button" onClick={() => setEditingThreshold(false)} className="px-2 py-1 rounded-lg bg-slate-200 text-slate-700 text-xs">
                    {t.cancel}
                  </button>
                </form>)}

              <button type="button" onClick={() => setActiveTab('inventory')} className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-md shadow-amber-600/25 transition-all flex items-center gap-1.5">
                <span>{t.restockNow}</span>
                {isRtl ? <ArrowLeft className="w-3.5 h-3.5"/> : <ArrowRight className="w-3.5 h-3.5"/>}
              </button>
            </div>
          </div>

          {/* Visual Chips of Highlighted Low Stock Materials */}
          <div className="mt-4 pt-3 border-t border-rose-200/60 flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-slate-500">{t.itemsNeedRestock}:</span>
            {lowStockMaterials.map(rm => (<span key={rm.id} onClick={() => setActiveTab('inventory')} className="inline-flex items-center gap-2 px-3 py-1 rounded-lg bg-white border border-rose-200 hover:border-rose-400 text-xs font-semibold text-rose-700 cursor-pointer transition-colors shadow-2xs">
                <span>{getLocalizedName(rm.name)}</span>
                <span className="font-mono bg-rose-100 px-1.5 py-0.5 rounded text-[11px] text-rose-800">
                  {rm.stockKg.toLocaleString()} {t.kilo}
                </span>
              </span>))}
          </div>
        </div>) : (<div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-between gap-3 text-xs sm:text-sm text-emerald-800 shadow-xs">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0"/>
            <span className="font-semibold">{t.allStockHealthy}</span>
          </div>
          <span className="text-xs text-emerald-700 font-mono">
            {t.lowStockThresholdLabel} {lowStockThreshold.toLocaleString()} {t.kilo}
          </span>
        </div>)}

      {/* 2. RECTANGULAR CLICKABLE METRIC TABLES / CARDS */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold text-slate-900 tracking-tight">
            {t.companySubtitle}
          </h2>
          <span className="text-xs text-slate-500 font-medium">
            {t.viewDetails}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {rectangularCards.map((card) => {
            const Icon = card.icon;
            return (<div key={card.id} onClick={() => setActiveTab(card.tab)} className={`p-5 rounded-2xl border transition-all duration-200 cursor-pointer group shadow-sm hover:shadow-md hover:-translate-y-0.5 ${card.bg} ${card.border}`}>
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className={`p-2.5 rounded-xl ${card.iconBg} transition-transform group-hover:scale-110 shadow-2xs`}>
                    <Icon className="w-5 h-5"/>
                  </div>
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 border border-slate-200 text-slate-700">
                    {card.badge}
                  </span>
                </div>

                <div className="space-y-1">
                  <span className="text-xs font-medium text-slate-500 block line-clamp-1">
                    {card.title}
                  </span>
                  <div className={`text-xl sm:text-2xl font-black tracking-tight font-mono ${card.textColor}`}>
                    {card.value}
                  </div>
                  <p className="text-xs text-slate-500 line-clamp-1 pt-1 border-t border-slate-100">
                    {card.subvalue}
                  </p>
                </div>
              </div>);
        })}
        </div>
      </div>

      {/* 3. CHARTS & ANALYTICS ROW */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Sales & Profit Trend (2 Columns) */}
        <div className="lg:col-span-2 p-5 rounded-2xl bg-white border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-bold text-sm text-slate-900">{t.salesSummary} & {t.reportsTitle}</h3>
              <p className="text-xs text-slate-500">{t.periodWeekly}</p>
            </div>
            <span className="text-xs font-mono text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200 font-semibold">
              {t.netProfit}: {totalGrossProfit.AFN.toLocaleString()} AFN · {totalGrossProfit.USD.toLocaleString()} USD
            </span>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trendData}>
                <defs>
                  <linearGradient id="salesGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#d97706" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#d97706" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="profitGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#059669" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#059669" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0"/>
                <XAxis dataKey="date" stroke="#64748b" fontSize={11}/>
                <YAxis stroke="#64748b" fontSize={11}/>
                <Tooltip contentStyle={{ backgroundColor: '#ffffff', borderColor: '#cbd5e1', borderRadius: '12px', color: '#0f172a', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}/>
                <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }}/>
                <Area type="monotone" dataKey="sales" name={t.totalSaleAmount} stroke="#d97706" strokeWidth={2} fillOpacity={1} fill="url(#salesGrad)"/>
                <Area type="monotone" dataKey="profit" name={t.netProfit} stroke="#059669" strokeWidth={2} fillOpacity={1} fill="url(#profitGrad)"/>
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Raw Material Inventory Distribution (1 Column) */}
        <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h3 className="font-bold text-sm text-slate-900">{t.inventoryTitle}</h3>
              <p className="text-xs text-slate-500">{t.totalFormulaWeight} (kg)</p>
            </div>
            <button type="button" onClick={() => setActiveTab('inventory')} className="text-xs text-amber-600 hover:underline font-semibold">
              {t.viewDetails}
            </button>
          </div>

          <div className="h-56 w-full relative">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={inventoryPieData} cx="50%" cy="50%" innerRadius={45} outerRadius={75} paddingAngle={3} dataKey="value">
                  {inventoryPieData.map((entry, index) => (<Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]}/>))}
                </Pie>
                <Tooltip contentStyle={{ backgroundColor: '#ffffff', borderColor: '#cbd5e1', borderRadius: '12px', color: '#0f172a', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} formatter={(value) => [`${Number(value).toLocaleString()} ${t.kilo}`, '']}/>
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Legend chips */}
          <div className="flex flex-wrap gap-1.5 justify-center max-h-20 overflow-y-auto pt-2 border-t border-slate-100">
            {inventoryPieData.map((item, idx) => (<span key={item.id} className="inline-flex items-center gap-1.5 text-[10px] text-slate-700 bg-slate-50 px-2 py-0.5 rounded-md border border-slate-200">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[idx % COLORS.length] }}/>
                <span>{item.name}</span>
              </span>))}
          </div>
        </div>
      </div>
    </div>);
};
