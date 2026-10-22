export const cleanBillNumber = value => String(value || '')
    .normalize('NFKC')
    .trim()
    .replace(/\s+/g, ' ');

export const normalizeBillNumber = value => cleanBillNumber(value).toLocaleLowerCase();

export const billNumberExists = (sales, billNumber, excludedSaleId = '') => {
    const normalized = normalizeBillNumber(billNumber);
    if (!normalized) return false;
    return (sales || []).some(sale => sale.id !== excludedSaleId
        && normalizeBillNumber(sale.billNumber) === normalized);
};
