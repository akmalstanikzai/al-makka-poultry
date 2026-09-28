import React, { useState } from 'react';
import { useDatabase } from '../context/DatabaseContext';
import { Receipt, Plus, Fuel, Users, Utensils, Zap, Wrench, Truck, Building, MoreHorizontal, Trash2, Wallet, AlertCircle, X } from 'lucide-react';
export const ExpensesPage = () => {
    const { db, t, addExpense, deleteExpense } = useDatabase();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedCategoryFilter, setSelectedCategoryFilter] = useState('all');
    const [expenseToDelete, setExpenseToDelete] = useState(null);
    // Form State
    const [category, setCategory] = useState('fuel');
    const [amount, setAmount] = useState('');
    const [description, setDescription] = useState('');
    const [paidBy, setPaidBy] = useState('');
    const [notes, setNotes] = useState('');
    const [errorMsg, setErrorMsg] = useState('');
    // Category Configs with Icons (Light Theme friendly)
    const categoryConfig = {
        fuel: {
            name: t.expenseCategories.fuel,
            icon: Fuel,
            color: 'text-amber-700',
            bg: 'bg-amber-100',
            border: 'border-amber-200',
        },
        salary: {
            name: t.expenseCategories.salary,
            icon: Users,
            color: 'text-blue-700',
            bg: 'bg-blue-100',
            border: 'border-blue-200',
        },
        food: {
            name: t.expenseCategories.food,
            icon: Utensils,
            color: 'text-emerald-700',
            bg: 'bg-emerald-100',
            border: 'border-emerald-200',
        },
        electricity: {
            name: t.expenseCategories.electricity,
            icon: Zap,
            color: 'text-amber-800',
            bg: 'bg-amber-100',
            border: 'border-amber-200',
        },
        maintenance: {
            name: t.expenseCategories.maintenance,
            icon: Wrench,
            color: 'text-purple-700',
            bg: 'bg-purple-100',
            border: 'border-purple-200',
        },
        transport: {
            name: t.expenseCategories.transport,
            icon: Truck,
            color: 'text-cyan-700',
            bg: 'bg-cyan-100',
            border: 'border-cyan-200',
        },
        rent: {
            name: t.expenseCategories.rent,
            icon: Building,
            color: 'text-rose-700',
            bg: 'bg-rose-100',
            border: 'border-rose-200',
        },
        other: {
            name: t.expenseCategories.other,
            icon: MoreHorizontal,
            color: 'text-slate-700',
            bg: 'bg-slate-100',
            border: 'border-slate-200',
        },
    };
    const handleSubmit = (e) => {
        e.preventDefault();
        if (!amount || Number(amount) <= 0) {
            setErrorMsg(t.expenseAmount);
            return;
        }
        addExpense({
            category,
            amount: Number(amount),
            description: description.trim() || categoryConfig[category].name,
            paidBy: paidBy.trim() || undefined,
            notes: notes.trim() || undefined,
        });
        setIsModalOpen(false);
        setAmount('');
        setDescription('');
        setPaidBy('');
        setNotes('');
        setErrorMsg('');
    };
    const filteredExpenses = db.expenses.filter(e => selectedCategoryFilter === 'all' || e.category === selectedCategoryFilter);
    const totalExpenses = db.expenses.reduce((acc, e) => acc + e.amount, 0);
    return (<div className="space-y-6">
      {/* Header */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-rose-100 text-rose-700">
              <Receipt className="w-5 h-5"/>
            </div>
            <span>{t.expensesTitle}</span>
          </h2>
          <p className="text-xs sm:text-sm text-slate-600 mt-1">
            {t.expensesDesc}
          </p>
        </div>

        <button type="button" onClick={() => {
            setErrorMsg('');
            setIsModalOpen(true);
        }} className="flex items-center justify-center gap-2 px-4 py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs sm:text-sm rounded-xl shadow-md shadow-amber-600/25 transition-all cursor-pointer active:scale-95">
          <Plus className="w-4 h-4"/>
          <span>{t.recordNewExpense}</span>
        </button>
      </div>

      {/* Summary Card */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-500">{t.totalExpenses}</span>
            <div className="text-2xl font-bold font-mono text-rose-700 mt-1">
              {totalExpenses.toLocaleString()} {t.currency}
            </div>
            <span className="text-xs text-slate-500">{db.expenses.length} {t.records}</span>
          </div>
          <div className="p-3 bg-rose-100 text-rose-700 rounded-xl border border-rose-200">
            <Wallet className="w-6 h-6"/>
          </div>
        </div>

        {/* Category Filter Chips */}
        <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setSelectedCategoryFilter('all')} className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${selectedCategoryFilter === 'all'
            ? 'bg-amber-600 text-white shadow-xs'
            : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>
            {t.allCategories}
          </button>
          {Object.entries(categoryConfig).map(([key, cfg]) => (<button key={key} type="button" onClick={() => setSelectedCategoryFilter(key)} className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${selectedCategoryFilter === key
                ? 'bg-amber-600 text-white shadow-xs'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>
              {cfg.name}
            </button>))}
        </div>
      </div>

      {/* Expenses Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
            <Receipt className="w-4 h-4 text-amber-600"/>
            <span>{t.expensesTitle} ({filteredExpenses.length})</span>
          </h3>
          <span className="text-xs text-slate-500">{t.activeFactory}</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-start text-xs sm:text-sm">
            <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 font-semibold uppercase text-[11px]">
              <tr>
                <th className="py-3 px-4 text-start">{t.expenseCategory}</th>
                <th className="py-3 px-4 text-start">{t.expenseDescription}</th>
                <th className="py-3 px-4 text-start">{t.expenseAmount}</th>
                <th className="py-3 px-4 text-start">{t.expensePaidBy}</th>
                <th className="py-3 px-4 text-start">{t.date}</th>
                <th className="py-3 px-4 text-center">{t.action}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredExpenses.map((exp) => {
            const cfg = categoryConfig[exp.category] || categoryConfig.other;
            const IconComponent = cfg.icon;
            return (<tr key={exp.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3.5 px-4">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-bold ${cfg.bg} ${cfg.color} border ${cfg.border}`}>
                        <IconComponent className="w-3.5 h-3.5"/>
                        <span>{cfg.name}</span>
                      </span>
                    </td>
                    <td className="py-3.5 px-4 font-medium text-slate-900">
                      {exp.description}
                      {exp.notes && <span className="block text-[11px] text-slate-500 font-normal">{exp.notes}</span>}
                    </td>
                    <td className="py-3.5 px-4 font-mono font-bold text-rose-700">
                      {exp.amount.toLocaleString()} {t.currency}
                    </td>
                    <td className="py-3.5 px-4 text-slate-700">
                      {exp.paidBy || '---'}
                    </td>
                    <td className="py-3.5 px-4 font-mono text-slate-500 text-xs">
                      {exp.date}
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <button type="button" onClick={() => setExpenseToDelete(exp.id)} className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer" title={t.delete}>
                        <Trash2 className="w-4 h-4"/>
                      </button>
                    </td>
                  </tr>);
        })}

              {filteredExpenses.length === 0 && (<tr>
                  <td colSpan={6} className="py-12 text-center text-slate-500">
                    {t.noExpensesRecorded}
                  </td>
                </tr>)}
            </tbody>
          </table>
        </div>
      </div>

      {/* Record Expense Modal */}
      {isModalOpen && (<div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl shadow-2xl p-6 relative text-slate-900">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-amber-100 text-amber-700">
                  <Receipt className="w-6 h-6"/>
                </div>
                <div>
                  <h3 className="font-bold text-lg text-slate-900">{t.recordNewExpense}</h3>
                  <p className="text-xs text-slate-500">{t.expensesDesc}</p>
                </div>
              </div>
              <button type="button" onClick={() => setIsModalOpen(false)} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-900 hover:bg-slate-100 cursor-pointer">
                <X className="w-5 h-5"/>
              </button>
            </div>

            <form onSubmit={handleSubmit} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {t.expenseCategory} *
                </label>
                <select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-900 font-medium focus:outline-none focus:border-amber-600 shadow-2xs cursor-pointer">
                  {Object.entries(categoryConfig).map(([key, cfg]) => (<option key={key} value={key}>{cfg.name}</option>))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {t.expenseAmount} ({t.currency}) *
                </label>
                <input type="number" min="1" step="any" required value={amount} onChange={(e) => setAmount(e.target.value ? Number(e.target.value) : '')} placeholder="5000" className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-sm font-mono font-bold text-slate-900 focus:outline-none focus:border-amber-600 shadow-2xs"/>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {t.expenseDescription} *
                </label>
                <input type="text" required value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t.expenseDescPlaceholder} className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-amber-600 shadow-2xs"/>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {t.expensePaidBy}
                </label>
                <input type="text" value={paidBy} onChange={(e) => setPaidBy(e.target.value)} placeholder={t.expensePaidByPlaceholder} className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-amber-600 shadow-2xs"/>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {t.additionalNote}
                </label>
                <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t.additionalNotePlaceholder} className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-amber-600 shadow-2xs"/>
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
                  <AlertCircle className="w-4 h-4 shrink-0"/>
                  <span>{errorMsg}</span>
                </div>)}
            </form>
          </div>
        </div>)}

      {/* In-app Confirmation Modal for Expense Deletion */}
      {expenseToDelete && (<div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-xl border border-slate-200 text-center">
            <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto mb-4">
              <Trash2 className="w-6 h-6"/>
            </div>
            <h3 className="text-base font-bold text-slate-900 mb-2">
              {t.delete}
            </h3>
            <p className="text-xs text-slate-600 mb-6">
              {t.confirmDelete}
            </p>
            <div className="flex gap-3">
              <button type="button" onClick={() => setExpenseToDelete(null)} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer">
                {t.cancel}
              </button>
              <button type="button" onClick={() => {
                deleteExpense(expenseToDelete);
                setExpenseToDelete(null);
            }} className="flex-1 py-2.5 rounded-xl bg-rose-600 text-xs font-bold text-white hover:bg-rose-700 transition-colors cursor-pointer">
                {t.delete}
              </button>
            </div>
          </div>
        </div>)}
    </div>);
};
