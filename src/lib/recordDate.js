// Date-only business records must not move to another day through UTC conversion.
export const localDateValue = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export const isValidRecordDate = value => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return false;
    const date = new Date(`${value}T12:00:00`);
    return Number.isFinite(date.getTime()) && localDateValue(date) === value;
};

export const normalizeRecordDate = value => {
    if (value == null) return localDateValue();
    if (!isValidRecordDate(value)) throw new Error('Invalid transaction date.');
    return value;
};

// Chromium does not consistently support ps-AF date formatting. Translate
// Gregorian month names explicitly so Pashto reports never fall back to English.
export const formatReportDate = (value, lang, t) => {
    if (!isValidRecordDate(value)) return '—';
    const [year, month, day] = value.split('-').map(Number);
    const format = number => number.toLocaleString(lang === 'en' ? 'en-US' : 'fa-AF', { useGrouping: false });
    return `${format(day)} ${t.reporting.monthNames[month - 1]} ${format(year)}`;
};

// A weekly report covers seven days ending on the selected date. A monthly
// report covers the entire selected calendar month, including leap days.
export const reportDateRange = (period, selectedDate, month, start, end) => {
    if (period === 'all') return { start: '', end: '', valid: true };
    if (period === 'custom') return { start, end, valid: isValidRecordDate(start) && isValidRecordDate(end) && start <= end };
    if (period === 'monthly') {
        const first = `${month}-01`;
        if (!isValidRecordDate(first)) return { start: '', end: '', valid: false };
        const last = new Date(`${first}T12:00:00`);
        last.setMonth(last.getMonth() + 1, 0);
        return { start: first, end: localDateValue(last), valid: true };
    }
    if (!isValidRecordDate(selectedDate)) return { start: '', end: '', valid: false };
    const first = new Date(`${selectedDate}T12:00:00`);
    if (period === 'weekly') first.setDate(first.getDate() - 6);
    return { start: localDateValue(first), end: selectedDate, valid: true };
};
