import React from 'react';

export const TransactionDateField = ({ value, onChange, t }) => (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-slate-700">{t.transactionDate} *</span>
      <input type="date" required value={value} onChange={event => onChange(event.target.value)} className="w-full min-w-0 rounded-xl border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 focus:border-amber-600 focus:outline-none"/>
    </label>
);
