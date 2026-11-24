/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React, { useState, useEffect } from 'react';
import { DatabaseProvider, useDatabase } from './context/DatabaseContext';
import { Sidebar, TopBar } from './components';
import {
    CustomersPage,
    CounterSalesPage,
    DashboardPage,
    ExpensesPage,
    FormulaPage,
    InventoryPage,
    StockOverviewPage,
    LoginPage,
    ReportsPage,
    SalesPage,
    SuppliersPage,
} from './pages';
import { AlertCircle, LayoutDashboard, Warehouse, ShoppingCart, Users, Menu } from 'lucide-react';
const AppContent = () => {
    const { user, lang, t, isAuthLoading, isDatabaseLoading, databaseError } = useDatabase();
    const [activeTab, setActiveTab] = useState('dashboard');
    const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
    useEffect(() => {
        window.scrollTo({ top: 0, behavior: 'instant' });
    }, [activeTab]);
    useEffect(() => {
        if (!isMobileSidebarOpen) return;
        const previousOverflow = document.body.style.overflow;
        const closeOnEscape = event => {
            if (event.key === 'Escape') setIsMobileSidebarOpen(false);
        };
        const closeOnWideScreen = () => {
            if (window.innerWidth >= 1024) setIsMobileSidebarOpen(false);
        };
        document.body.style.overflow = 'hidden';
        document.addEventListener('keydown', closeOnEscape);
        window.addEventListener('resize', closeOnWideScreen);
        return () => {
            document.body.style.overflow = previousOverflow;
            document.removeEventListener('keydown', closeOnEscape);
            window.removeEventListener('resize', closeOnWideScreen);
        };
    }, [isMobileSidebarOpen]);
    // Synchronize document dir and lang attributes with the selected language
    useEffect(() => {
        const isRtl = lang === 'fa' || lang === 'ps';
        document.documentElement.setAttribute('dir', isRtl ? 'rtl' : 'ltr');
        document.documentElement.setAttribute('lang', lang);
    }, [lang]);
    useEffect(() => {
        const preventNumberWheelChange = event => {
            if (event.target instanceof HTMLInputElement && event.target.type === 'number' && document.activeElement === event.target) {
                event.preventDefault();
            }
        };
        document.addEventListener('wheel', preventNumberWheelChange, { passive: false });
        return () => document.removeEventListener('wheel', preventNumberWheelChange);
    }, []);
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
            case 'stock-overview':
                return <StockOverviewPage />;
            case 'formula':
                return <FormulaPage />;
            case 'sales':
                return <SalesPage />;
            case 'counter-sales':
                return <CounterSalesPage />;
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
        { id: 'sales', label: t.navSales, icon: ShoppingCart },
        { id: 'customers', label: t.navCustomers, icon: Users },
    ];
    const isRtl = lang === 'fa' || lang === 'ps';
    return (<div className="app-shell min-h-screen text-slate-900 flex flex-row font-sans selection:bg-emerald-200 selection:text-slate-900" data-page={activeTab} dir={isRtl ? 'rtl' : 'ltr'}>
      {/* Sidebar Navigation */}
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} isMobileOpen={isMobileSidebarOpen} setIsMobileOpen={setIsMobileSidebarOpen} isCollapsed={isSidebarCollapsed} setIsCollapsed={setIsSidebarCollapsed}/>

      {/* Main Workspace Column */}
      <div className="app-workspace flex-1 flex flex-col min-w-0">
        {/* Top Header Bar */}
        <TopBar activeTab={activeTab} setActiveTab={setActiveTab} onOpenMobileMenu={() => setIsMobileSidebarOpen(true)}/>

        {/* Page Content Container */}
        <main id="main-content" className="app-main flex-1 max-w-[1440px] w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
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
        <footer className="app-footer mt-auto py-4 print:hidden text-center text-xs text-slate-500">
          <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
            <span>{t.companyName} • {t.companySubtitle}</span>
            <span className="text-slate-600">
              {t.activeFactory} • {t.systemOnline}
            </span>
          </div>
        </footer>

        {/* Mobile Bottom Navigation Bar (Quick Thumb Navigation for Mobile) */}
        <nav aria-label={t.morePages} className="mobile-bottom-nav lg:hidden fixed bottom-0 inset-x-0 z-40 flex items-center justify-around print:hidden">
          {mobileNavItems.map(item => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (<button key={item.id} type="button" aria-current={isActive ? 'page' : undefined} onClick={() => setActiveTab(item.id)} className={`mobile-nav-item ${isActive ? 'is-active' : ''}`}>
                <Icon className="w-5 h-5"/>
                <span className="truncate max-w-[56px]">{item.label}</span>
              </button>);
        })}
          {/* More button to trigger sidebar */}
          <button type="button" aria-expanded={isMobileSidebarOpen} onClick={() => setIsMobileSidebarOpen(true)} className={`mobile-nav-item ${!mobileNavItems.some(item => item.id === activeTab) ? 'is-active' : ''}`}>
            <Menu className="w-5 h-5"/>
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
