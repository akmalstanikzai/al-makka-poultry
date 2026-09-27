import React from 'react';
import { useDatabase } from '../context/DatabaseContext';
import { LayoutDashboard, Warehouse, FlaskConical, ShoppingCart, Truck, Users, Receipt, BarChart3, LogOut, Wheat, ChevronLeft, ChevronRight, Globe2, ShieldCheck, X } from 'lucide-react';
export const Sidebar = ({ activeTab, setActiveTab, isMobileOpen, setIsMobileOpen, isCollapsed, setIsCollapsed, }) => {
    const { lang, setLang, t, user, logout, lowStockMaterials } = useDatabase();
    const isRtl = lang === 'fa' || lang === 'ps';
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
    const sidebarContent = (<div className="h-full flex flex-col justify-between bg-white border-r border-slate-200 text-slate-800 shadow-sm">
      {/* Top Brand */}
      <div>
        <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-600 to-amber-500 flex items-center justify-center text-white font-bold shrink-0 shadow-md shadow-amber-500/25">
              <Wheat className="w-6 h-6"/>
            </div>
            {!isCollapsed && (<div className="truncate">
                <h2 className="font-bold text-sm tracking-tight text-slate-900 truncate">
                  {t.companyName}
                </h2>
                <div className="flex items-center gap-1.5 text-[11px] text-emerald-600 font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"/>
                  <span>{t.systemOnline}</span>
                </div>
              </div>)}
          </div>

          {/* Close on mobile */}
          <button type="button" onClick={() => setIsMobileOpen(false)} className="lg:hidden p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100">
            <X className="w-5 h-5"/>
          </button>
        </div>

        {/* Navigation List */}
        <nav className="p-3 space-y-1 overflow-y-auto max-h-[calc(100vh-280px)]">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (<button key={item.id} type="button" onClick={() => handleSelectTab(item.id)} title={isCollapsed ? item.label : undefined} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all group ${isActive
                    ? 'bg-amber-600 text-white shadow-md shadow-amber-600/20 font-semibold'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'} ${isCollapsed ? 'justify-center' : 'justify-between'}`}>
                <div className="flex items-center gap-3 min-w-0">
                  <Icon className={`w-5 h-5 shrink-0 ${isActive ? 'text-white' : 'text-slate-500 group-hover:text-amber-600'}`}/>
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
      <div className="p-3 border-t border-slate-200 space-y-3 bg-slate-50/60">
        {/* Language selector */}
        <div className={`flex items-center gap-1 bg-white border border-slate-200 p-1 rounded-xl shadow-xs ${isCollapsed ? 'flex-col' : 'justify-between'}`}>
          {!isCollapsed && (<div className="flex items-center gap-1.5 ps-1.5 text-xs text-slate-500 font-medium">
              <Globe2 className="w-3.5 h-3.5"/>
              <span>{t.languageLabel}</span>
            </div>)}
          <div className="flex items-center gap-1">
            {['fa', 'ps', 'en'].map((l) => (<button key={l} type="button" onClick={() => setLang(l)} className={`px-2 py-1 text-[11px] font-bold rounded-lg transition-all ${lang === l
                ? 'bg-amber-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'}`}>
                {l === 'fa' ? 'دری' : l === 'ps' ? 'پښتو' : 'EN'}
              </button>))}
          </div>
        </div>

        {/* User Card */}
        {user && (<div className={`p-2.5 rounded-xl bg-white border border-slate-200 shadow-xs flex items-center gap-3 ${isCollapsed ? 'justify-center' : 'justify-between'}`}>
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-amber-100 border border-amber-200 text-amber-700 flex items-center justify-center font-bold text-xs shrink-0">
                <ShieldCheck className="w-4 h-4"/>
              </div>
              {!isCollapsed && (<div className="truncate text-xs">
                  <span className="font-bold text-slate-900 block truncate">{user.name}</span>
                  <span className="text-[10px] text-slate-500 block truncate">{user.email}</span>
                </div>)}
            </div>

            {!isCollapsed && (<button type="button" onClick={logout} title={t.logoutBtn} className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors">
                <LogOut className="w-4 h-4"/>
              </button>)}
          </div>)}

        {/* Desktop Collapse Toggle */}
        <div className="hidden lg:flex items-center justify-between pt-1">
          <button type="button" onClick={() => setIsCollapsed(!isCollapsed)} className="w-full py-1.5 px-2 rounded-lg text-xs font-medium text-slate-500 hover:text-slate-900 hover:bg-slate-200/60 flex items-center justify-center gap-2 transition-colors">
            <CollapseIcon className="w-4 h-4"/>
            {!isCollapsed && (<span>{t.sidebarCollapse}</span>)}
          </button>
        </div>
      </div>
    </div>);
    return (<>
      {/* Desktop Sidebar */}
      <aside className={`hidden lg:block shrink-0 transition-all duration-300 z-30 h-screen sticky top-0 border-r border-slate-200 ${isCollapsed ? 'w-20' : 'w-64'}`}>
        {sidebarContent}
      </aside>

      {/* Mobile Backdrop & Off-canvas Drawer */}
      {isMobileOpen && (<div className="fixed inset-0 z-50 lg:hidden flex">
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs transition-opacity" onClick={() => setIsMobileOpen(false)}/>
          <div className={`relative z-50 w-72 max-w-[85vw] h-full shadow-2xl ${isRtl ? 'ms-auto' : 'me-auto'}`}>
            {sidebarContent}
          </div>
        </div>)}
    </>);
};
