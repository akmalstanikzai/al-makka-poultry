import React from 'react';
import { useDatabase } from '../context/DatabaseContext';
import { Wheat, PackageCheck, Truck, Users, TrendingUp, Wallet, Receipt, CalendarClock, AlertTriangle, CheckCircle2, ArrowRight, ArrowLeft } from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, Legend, PieChart, Pie, Cell, CartesianGrid } from 'recharts';
import { rawStockValue } from '../lib/rawMaterialCost';

const CurrencyPair = ({ amounts, t, tone = 'text-slate-900', compact = false }) => {
    const values = [
        { code: 'AFN', label: t.dashboardAfnLabel, amount: Number(amounts?.AFN) || 0 },
        { code: 'USD', label: t.dashboardUsdLabel, amount: Number(amounts?.USD) || 0 },
    ];
    return <div className={compact ? 'grid grid-cols-1 sm:grid-cols-2 gap-1.5' : 'space-y-1.5'}>
      {values.map(value => <div key={value.code} className={`rounded-lg border border-slate-200 bg-slate-50/80 ${compact ? 'px-2 py-1' : 'px-3 py-2'}`}>
        <span className={`block font-semibold text-slate-500 ${compact ? 'text-[9px]' : 'text-[10px]'}`}>{value.label}</span>
        <strong dir="ltr" className={`block font-mono tracking-tight ${tone} ${compact ? 'text-xs' : 'text-lg sm:text-xl'}`}>{value.amount.toLocaleString()}</strong>
      </div>)}
    </div>;
};

export const DashboardPage = ({ setActiveTab }) => {
    const { db, t, lang, lowStockThreshold, lowStockMaterials, getLocalizedName } = useDatabase();
    const isRtl = lang === 'fa' || lang === 'ps';
    // 1. RAW stock in kilo
    const totalRawStockKg = db.rawMaterials.reduce((acc, r) => acc + (r.stockKg || 0), 0);
    const totalRawStockValue = db.rawMaterials.reduce((acc, material) => {
        const value = rawStockValue(material);
        acc.AFN += value.AFN;
        acc.USD += value.USD;
        return acc;
    }, { AFN: 0, USD: 0 });
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
        const dayTotals = db.sales.filter(sale => sale.date === date).reduce((totals, sale) => {
            const isUsd = sale.currency === 'USD';
            totals[isUsd ? 'salesUsd' : 'salesAfn'] += Number(sale.totalAmount) || 0;
            totals[isUsd ? 'profitUsd' : 'profitAfn'] += Number(isUsd ? sale.profitUsd : sale.profit) || 0;
            return totals;
        }, { salesAfn: 0, salesUsd: 0, profitAfn: 0, profitUsd: 0 });
        const parts = date.split('-');
        const label = `${parts[1]}/${parts[2]}`;
        return {
            date: label,
            ...dayTotals,
        };
    });
    // Inventory breakdown for pie chart
    const COLORS = ['#d97706', '#059669', '#2563eb', '#dc2626', '#7c3aed', '#0891b2', '#db2777'];
    const inventoryPieData = db.rawMaterials.map(rm => ({
        id: rm.id,
        name: getLocalizedName(rm.name).split('(')[0].trim(),
        value: rm.stockKg,
    })).filter(item => item.value > 0);
    // Rectangular clickable cards configuration (Light Theme)
    const rectangularCards = [
        {
            id: 'raw-stock',
            title: t.rawStockCard,
            value: `${totalRawStockKg.toLocaleString()} ${t.kilo}`,
            subvalue: `${(totalRawStockKg / 1000).toFixed(1)} ${t.ton}`,
            secondaryMoney: totalRawStockValue,
            secondaryMoneyLabel: t.dashboardStockValue,
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
            moneyValue: totalOwedToSuppliers,
            subvalue: `${db.suppliers.filter(s => (s.balanceOwed || 0) > 0 || (s.balanceOwedUsd || 0) > 0).length} ${t.navSuppliers}`,
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
            moneyValue: totalReceivableFromCustomers,
            subvalue: `${db.customers.filter(c => (c.balanceOwed || 0) > 0 || (c.balanceOwedUsd || 0) > 0).length} ${t.navCustomers}`,
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
            moneyValue: totalSalesAmount,
            subvalue: `${totalSalesKg.toLocaleString()} ${t.kilo} (${(Math.round((totalSalesKg / 50) * 100) / 100).toLocaleString()} ${t.bag})`,
            secondaryMoney: totalGrossProfit,
            secondaryMoneyLabel: t.dashboardGrossProfit,
            icon: TrendingUp,
            bg: 'bg-white hover:bg-cyan-50/40',
            border: 'border-slate-200 hover:border-cyan-400',
            textColor: 'text-cyan-700',
            iconBg: 'bg-cyan-100 text-cyan-700',
            tab: 'sales',
            badge: t.dashboardGrossProfit,
        },
        {
            id: 'money-in-hand',
            title: t.moneyInHandCard,
            moneyValue: moneyInHand,
            subvalue: t.moneyInHandCard,
            icon: Wallet,
            bg: 'bg-white hover:bg-emerald-50/40',
            border: 'border-slate-200 hover:border-emerald-500',
            textColor: 'text-emerald-800',
            iconBg: 'bg-emerald-100 text-emerald-800',
            tab: 'expenses',
            badge: t.dashboardDualCurrency,
        },
        {
            id: 'total-expenses',
            title: t.totalExpensesCard,
            moneyValue: totalExpenses,
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
                  {t.lowStockPerItemMessage.replace('{count}', lowStockMaterials.length.toString())}
                </p>
              </div>
            </div>

            {/* Restock CTA */}
            <div className="flex items-center self-start lg:self-auto">
              <button type="button" onClick={() => setActiveTab('inventory')} className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-md shadow-amber-600/25 transition-all flex items-center gap-1.5">
                <span>{t.restockNow}</span>
                {isRtl ? <ArrowLeft className="w-3.5 h-3.5"/> : <ArrowRight className="w-3.5 h-3.5"/>}
              </button>
            </div>
          </div>

          {/* Visual Chips of Highlighted Low Stock Materials */}
          <div className="mt-4 pt-3 border-t border-rose-200/60 flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-slate-500">{t.itemsNeedRestock}:</span>
            {lowStockMaterials.map(rm => {
                const itemThreshold = rm.lowStockThreshold ?? lowStockThreshold;
                return <button type="button" key={rm.id} onClick={() => setActiveTab('inventory')} className="inline-flex flex-col items-start gap-1 rounded-lg border border-rose-200 bg-white px-3 py-2 text-start text-xs font-semibold text-rose-700 shadow-2xs transition-colors hover:border-rose-400">
                  <span>{getLocalizedName(rm.name)}</span>
                  <span className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] font-medium text-slate-600">
                    <span>{t.currentStockLabel}: <strong dir="ltr" className="font-mono text-rose-700">{rm.stockKg.toLocaleString()} {t.kilo}</strong></span>
                    <span>{t.thresholdLimitLabel}: <strong dir="ltr" className="font-mono text-slate-800">{itemThreshold.toLocaleString()} {t.kilo}</strong></span>
                  </span>
                </button>;
            })}
          </div>
        </div>) : (<div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-between gap-3 text-xs sm:text-sm text-emerald-800 shadow-xs">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0"/>
            <span className="font-semibold">{t.allStockHealthy}</span>
          </div>
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
            return (<button type="button" key={card.id} onClick={() => setActiveTab(card.tab)} className={`h-full p-5 rounded-2xl border text-start transition-all duration-200 cursor-pointer group shadow-sm hover:shadow-md hover:-translate-y-0.5 ${card.bg} ${card.border}`}>
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className={`p-2.5 rounded-xl ${card.iconBg} transition-transform group-hover:scale-110 shadow-2xs`}>
                    <Icon className="w-5 h-5"/>
                  </div>
                  <span className="max-w-[65%] px-2.5 py-0.5 rounded-full text-[11px] text-center font-semibold bg-slate-100 border border-slate-200 text-slate-700">
                    {card.badge}
                  </span>
                </div>

                <div className="space-y-2">
                  <span className="text-xs font-medium text-slate-600 block min-h-8">
                    {card.title}
                  </span>
                  {card.moneyValue ? <CurrencyPair amounts={card.moneyValue} t={t} tone={card.textColor}/> : <div dir="ltr" className={`text-xl sm:text-2xl font-black tracking-tight font-mono text-end ${card.textColor}`}>
                    {card.value}
                  </div>}
                  {card.secondaryMoney && <div className="pt-2 border-t border-slate-100">
                    <span className="mb-1 block text-[10px] font-semibold text-slate-500">{card.secondaryMoneyLabel}</span>
                    <CurrencyPair amounts={card.secondaryMoney} t={t} tone={card.textColor} compact/>
                  </div>}
                  <p className="text-xs text-slate-500 pt-2 border-t border-slate-100">
                    {card.subvalue}
                  </p>
                </div>
              </button>);
        })}
        </div>
      </div>

      {/* 3. CHARTS & ANALYTICS ROW */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Sales & Profit Trend (2 Columns) */}
        <div className="lg:col-span-2 p-5 rounded-2xl bg-white border border-slate-200 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-4">
            <div>
              <h3 className="font-bold text-sm text-slate-900">{t.salesSummary} & {t.reportsTitle}</h3>
              <p className="text-xs text-slate-500">{t.periodWeekly}</p>
            </div>
            <div className="min-w-56 rounded-xl border border-emerald-200 bg-emerald-50 p-2">
              <span className="mb-1 block text-[10px] font-bold text-emerald-800">{t.dashboardGrossProfit}</span>
              <CurrencyPair amounts={totalGrossProfit} t={t} tone="text-emerald-700" compact/>
            </div>
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
                  <linearGradient id="salesUsdGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563eb" stopOpacity={0.25}/>
                    <stop offset="95%" stopColor="#2563eb" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="profitUsdGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#7c3aed" stopOpacity={0.25}/>
                    <stop offset="95%" stopColor="#7c3aed" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0"/>
                <XAxis dataKey="date" stroke="#64748b" fontSize={11}/>
                <YAxis yAxisId="AFN" orientation={isRtl ? 'right' : 'left'} stroke="#d97706" fontSize={10}/>
                <YAxis yAxisId="USD" orientation={isRtl ? 'left' : 'right'} stroke="#2563eb" fontSize={10}/>
                <Tooltip formatter={(value, name) => [Number(value).toLocaleString(), name]} contentStyle={{ backgroundColor: '#ffffff', borderColor: '#cbd5e1', borderRadius: '12px', color: '#0f172a', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}/>
                <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }}/>
                <Area yAxisId="AFN" type="monotone" dataKey="salesAfn" name={`${t.totalSaleAmount} — AFN`} stroke="#d97706" strokeWidth={2} fillOpacity={1} fill="url(#salesGrad)"/>
                <Area yAxisId="AFN" type="monotone" dataKey="profitAfn" name={`${t.dashboardGrossProfit} — AFN`} stroke="#059669" strokeWidth={2} fillOpacity={1} fill="url(#profitGrad)"/>
                <Area yAxisId="USD" type="monotone" dataKey="salesUsd" name={`${t.totalSaleAmount} — USD`} stroke="#2563eb" strokeWidth={2} fillOpacity={1} fill="url(#salesUsdGrad)"/>
                <Area yAxisId="USD" type="monotone" dataKey="profitUsd" name={`${t.dashboardGrossProfit} — USD`} stroke="#7c3aed" strokeWidth={2} fillOpacity={1} fill="url(#profitUsdGrad)"/>
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
