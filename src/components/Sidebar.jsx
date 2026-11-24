import React, { useEffect, useRef } from 'react';
import { useDatabase } from '../context/DatabaseContext';
import { LayoutDashboard, Warehouse, Boxes, FlaskConical, ShoppingCart, ShoppingBasket, Truck, Users, Receipt, BarChart3, LogOut, Wheat, ChevronLeft, ChevronRight, ShieldCheck, X } from 'lucide-react';
export const Sidebar = ({ activeTab, setActiveTab, isMobileOpen, setIsMobileOpen, isCollapsed, setIsCollapsed, }) => {
    const { lang, t, user, logout, lowStockMaterials } = useDatabase();
    const isRtl = lang === 'fa' || lang === 'ps';
    const drawerRef = useRef(null);
    useEffect(() => {
        if (!isMobileOpen) return;
        const previouslyFocused = document.activeElement;
        const drawer = drawerRef.current;
        drawer?.querySelector('[aria-current="page"]')?.focus();
        const keepFocusInDrawer = event => {
            if (event.key !== 'Tab') return;
            const buttons = Array.from(drawer?.querySelectorAll('button:not(:disabled)') || [])
                .filter(button => button.getClientRects().length);
            const first = buttons[0];
            const last = buttons[buttons.length - 1];
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last?.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first?.focus();
            }
        };
        drawer?.addEventListener('keydown', keepFocusInDrawer);
        return () => {
            drawer?.removeEventListener('keydown', keepFocusInDrawer);
            if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
        };
    }, [isMobileOpen]);
    const navItems = [
        {
            id: 'dashboard',
            label: t.navDashboard,
            icon: LayoutDashboard,
            badge: lowStockMaterials.length > 0 ? lowStockMaterials.length : undefined,
            badgeColor: 'bg-rose-100 text-rose-700 border-rose-200',
        },
        {
            id: 'inventory',
            label: t.navInventory,
            icon: Warehouse,
            badge: lowStockMaterials.length > 0 ? lowStockMaterials.length : undefined,
            badgeColor: 'bg-amber-100 text-amber-800 border-amber-200',
        },
        {
            id: 'stock-overview',
            label: t.navStockOverview,
            icon: Boxes,
        },
        {
            id: 'formula',
            label: t.navFormula,
            icon: FlaskConical,
        },
        {
            id: 'sales',
            label: t.navSales,
            icon: ShoppingCart,
        },
        {
            id: 'counter-sales',
            label: t.navCounterSales,
            icon: ShoppingBasket,
        },
        {
            id: 'suppliers',
            label: t.navSuppliers,
            icon: Truck,
        },
        {
            id: 'customers',
            label: t.navCustomers,
            icon: Users,
        },
        {
            id: 'expenses',
            label: t.navExpenses,
            icon: Receipt,
        },
        {
            id: 'reports',
            label: t.navReports,
            icon: BarChart3,
        },
    ];
    const handleSelectTab = (tab) => {
        setActiveTab(tab);
        setIsMobileOpen(false);
    };
    const CollapseIcon = isRtl
        ? (isCollapsed ? ChevronLeft : ChevronRight)
        : (isCollapsed ? ChevronRight : ChevronLeft);
    const sidebarContent = (<div className="app-sidebar h-full flex flex-col justify-between">
      {/* Top Brand */}
      <div>
        <div className="sidebar-brand p-4 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center text-white font-bold shrink-0 shadow-md shadow-emerald-500/20">
              <Wheat className="w-6 h-6"/>
            </div>
            {!isCollapsed && (<div className="truncate">
                <h2 className="font-bold text-sm tracking-tight text-white truncate">
                  {t.companyName}
                </h2>
                <div className="flex items-center gap-1.5 text-[11px] text-emerald-600 font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"/>
                  <span>{t.systemOnline}</span>
                </div>
              </div>)}
          </div>

          {/* Close on mobile */}
          <button type="button" onClick={() => setIsMobileOpen(false)} aria-label={t.cancel} className="lg:hidden p-2 rounded-lg text-slate-300 hover:bg-white/10">
            <X className="w-5 h-5"/>
          </button>
        </div>

        {/* Navigation List */}
        <nav className="sidebar-navigation p-3 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (<button key={item.id} type="button" onClick={() => handleSelectTab(item.id)} title={item.label} aria-current={isActive ? 'page' : undefined} className={`sidebar-link w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all group ${isActive
                    ? 'is-active text-white font-semibold'
                    : 'text-slate-400 hover:text-white hover:bg-white/5'} ${isCollapsed ? 'justify-center' : 'justify-between'}`}>
                <div className="flex items-center gap-3 min-w-0">
                  <Icon className={`w-5 h-5 shrink-0 ${isActive ? 'text-white' : 'text-slate-400 group-hover:text-emerald-300'}`}/>
                  {!isCollapsed && (<span className="truncate">{item.label}</span>)}
                </div>

                {!isCollapsed && item.badge !== undefined && (<span className={`px-2 py-0.5 rounded-full text-xs font-bold border ${isActive ? 'bg-white/20 text-white border-white/30' : item.badgeColor}`}>
                    {item.badge}
                  </span>)}
              </button>);
        })}
        </nav>
      </div>

      {/* Bottom Footer Section */}
      <div className="sidebar-footer p-3 space-y-3">
        {/* User Card */}
        {user && (<div className={`p-2.5 rounded-xl bg-white/5 border border-white/10 flex items-center gap-3 ${isCollapsed ? 'justify-center' : 'justify-between'}`}>
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-amber-100 border border-amber-200 text-amber-700 flex items-center justify-center font-bold text-xs shrink-0">
                <ShieldCheck className="w-4 h-4"/>
              </div>
              {!isCollapsed && (<div className="truncate text-xs">
                  <span className="font-bold text-slate-100 block truncate">{user.name}</span>
                  <span className="text-[10px] text-slate-500 block truncate">{user.email}</span>
                </div>)}
            </div>

            {!isCollapsed && (<button type="button" onClick={logout} title={t.logoutBtn} className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors">
                <LogOut className="w-4 h-4"/>
              </button>)}
          </div>)}

        {/* Desktop Collapse Toggle */}
        <div className="hidden lg:flex items-center justify-between pt-1">
          <button type="button" aria-expanded={!isCollapsed} aria-label={isCollapsed ? t.sidebarExpand : t.sidebarCollapse} onClick={() => setIsCollapsed(!isCollapsed)} className="w-full py-1.5 px-2 rounded-lg text-xs font-medium text-slate-400 hover:text-white hover:bg-white/5 flex items-center justify-center gap-2 transition-colors">
            <CollapseIcon className="w-4 h-4"/>
            {!isCollapsed && (<span>{t.sidebarCollapse}</span>)}
          </button>
        </div>
      </div>
    </div>);
    return (<>
      {/* Desktop Sidebar */}
      <aside className={`print:hidden hidden lg:block shrink-0 transition-all duration-300 z-30 h-screen sticky top-0 border-r border-slate-200 ${isCollapsed ? 'w-20' : 'w-64'}`}>
        {sidebarContent}
      </aside>

      {/* Mobile Backdrop & Off-canvas Drawer */}
      {isMobileOpen && (<div className="fixed inset-0 z-50 lg:hidden flex print:hidden">
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs transition-opacity" onClick={() => setIsMobileOpen(false)}/>
          <div ref={drawerRef} role="dialog" aria-modal="true" aria-label={t.morePages} className="mobile-drawer z-50 w-72 max-w-[85vw] h-full shadow-2xl">
            {sidebarContent}
          </div>
        </div>)}
    </>);
};
