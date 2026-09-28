/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React, { useState, useEffect } from 'react';
import { DatabaseProvider, useDatabase } from './context/DatabaseContext';
import { Sidebar, TopBar } from './components';
import {
    CustomersPage,
    DashboardPage,
    ExpensesPage,
    FormulaPage,
    InventoryPage,
    LoginPage,
    ReportsPage,
    SalesPage,
    SuppliersPage,
} from './pages';
import { AlertCircle, LayoutDashboard, Warehouse, FlaskConical, ShoppingCart, Receipt, Menu } from 'lucide-react';
const AppContent = () => {
    const { user, lang, t, isAuthLoading, isDatabaseLoading, databaseError } = useDatabase();
    const [activeTab, setActiveTab] = useState('dashboard');
    const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
    // Synchronize document dir and lang attributes with the selected language
    useEffect(() => {
        const isRtl = lang === 'fa' || lang === 'ps';
        document.documentElement.setAttribute('dir', isRtl ? 'rtl' : 'ltr');
        document.documentElement.setAttribute('lang', lang);
    }, [lang]);
    if (isAuthLoading || (user && isDatabaseLoading)) {
        return (<div className="min-h-screen flex items-center justify-center bg-slate-100 text-slate-600 text-sm">
        {isAuthLoading ? 'Checking secure session…' : 'Loading application data…'}
      </div>);
    }
    // Keep the login experience in place while using a local frontend session.
    if (!user) {
        return <LoginPage />;
    }
    const renderActiveView = () => {
        switch (activeTab) {
            case 'dashboard':
                return <DashboardPage setActiveTab={(tab) => setActiveTab(tab)}/>;
            case 'inventory':
                return <InventoryPage />;
            case 'formula':
                return <FormulaPage />;
            case 'sales':
                return <SalesPage />;
            case 'suppliers':
                return <SuppliersPage />;
            case 'customers':
                return <CustomersPage />;
            case 'expenses':
                return <ExpensesPage />;
            case 'reports':
                return <ReportsPage />;
            default:
                return <DashboardPage setActiveTab={(tab) => setActiveTab(tab)}/>;
        }
    };
    const mobileNavItems = [
        { id: 'dashboard', label: t.navDashboard, icon: LayoutDashboard },
        { id: 'inventory', label: t.navInventory, icon: Warehouse },
        { id: 'formula', label: t.navFormula, icon: FlaskConical },
        { id: 'sales', label: t.navSales, icon: ShoppingCart },
        { id: 'expenses', label: t.navExpenses, icon: Receipt },
    ];
    const isRtl = lang === 'fa' || lang === 'ps';
    return (<div className="min-h-screen bg-slate-100 text-slate-900 flex flex-row font-sans selection:bg-amber-500 selection:text-white" dir={isRtl ? 'rtl' : 'ltr'}>
      {/* Sidebar Navigation */}
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} isMobileOpen={isMobileSidebarOpen} setIsMobileOpen={setIsMobileSidebarOpen} isCollapsed={isSidebarCollapsed} setIsCollapsed={setIsSidebarCollapsed}/>

      {/* Main Workspace Column */}
      <div className="flex-1 flex flex-col min-w-0 pb-20 sm:pb-8">
        {/* Top Header Bar */}
        <TopBar activeTab={activeTab} setActiveTab={setActiveTab} onOpenMobileMenu={() => setIsMobileSidebarOpen(true)}/>

        {/* Page Content Container */}
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
          {databaseError && (<div className="mb-5 rounded-xl border border-rose-300 bg-rose-50 p-4 text-rose-800 flex items-start gap-3" role="alert">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5"/>
            <div>
              <p className="font-bold text-sm">Supabase database error</p>
              <p className="text-xs mt-1 break-words" dir="ltr">{databaseError}</p>
            </div>
          </div>)}
          {renderActiveView()}
        </main>

        {/* Footer (Dark Theme) */}
        <footer className="mt-auto border-t border-slate-900 bg-slate-950/80 py-4 print:hidden text-center text-xs text-slate-500">
          <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
            <span>{t.companyName} • {t.companySubtitle}</span>
            <span className="text-slate-600">
              {t.activeFactory} • {t.systemOnline}
            </span>
          </div>
        </footer>

        {/* Mobile Bottom Navigation Bar (Quick Thumb Navigation for Mobile) */}
        <nav className="sm:hidden fixed bottom-0 inset-x-0 bg-slate-900/95 backdrop-blur-md border-t border-slate-800 z-40 px-2 py-1.5 flex items-center justify-around shadow-2xl print:hidden">
          {mobileNavItems.map(item => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (<button key={item.id} type="button" onClick={() => setActiveTab(item.id)} className={`flex flex-col items-center justify-center py-1 px-2 rounded-lg transition-colors text-[10px] font-medium ${isActive
                    ? 'text-amber-400 font-bold'
                    : 'text-slate-400 hover:text-slate-200'}`}>
                <Icon className={`w-5 h-5 mb-0.5 ${isActive ? 'text-amber-400' : 'text-slate-500'}`}/>
                <span className="truncate max-w-[56px]">{item.label}</span>
              </button>);
        })}
          {/* More button to trigger sidebar */}
          <button type="button" onClick={() => setIsMobileSidebarOpen(true)} className="flex flex-col items-center justify-center py-1 px-2 rounded-lg text-slate-400 hover:text-slate-200 text-[10px] font-medium">
            <Menu className="w-5 h-5 mb-0.5 text-slate-500"/>
            <span>{t.morePages}</span>
          </button>
        </nav>
      </div>
    </div>);
};
export default function App() {
    return (<DatabaseProvider>
      <AppContent />
    </DatabaseProvider>);
}
