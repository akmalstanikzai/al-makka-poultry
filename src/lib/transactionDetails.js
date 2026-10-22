const amount = value => Number(value || 0);
const idTime = value => Number(String(value || '').match(/\d{10,}/)?.[0] || 0);

export const findRelatedSale = (transaction, party, role, sales) => {
    if (transaction.sourceSaleId) {
        const linkedSale = (sales || []).find(sale => sale.id === transaction.sourceSaleId);
        if (linkedSale) return linkedSale;
    }
    const candidates = (sales || []).filter(sale => {
        const belongsToParty = role === 'customer'
            ? sale.customerId === party.id
            : sale.supplierId === party.id;
        return belongsToParty
            && sale.date === transaction.date
            && (sale.currency || 'AFN') === (transaction.currency || 'AFN')
            && Math.abs(amount(sale.totalAmount) - amount(transaction.amount)) < 0.01;
    });
    if (!candidates.length) return null;
    return candidates.sort((first, second) => Math.abs(idTime(first.id) - idTime(transaction.id)) - Math.abs(idTime(second.id) - idTime(transaction.id)))[0];
};

export const getTransactionEntryDetails = (transaction, party, role, sales, t) => {
    if (transaction.type === 'payment' || transaction.type === 'cash_given' || transaction.type === 'transport_fee')
        return String(transaction.description || '').trim();

    const transactionDetails = String(transaction.description || '').trim();
    const looksGenerated = /^(فروش|خرید|restock|supplier debt settlement|customer debt settlement)/i.test(transactionDetails)
        || [t.supplierGoodsSettlement, t.customerRawSettlement].filter(Boolean).some(prefix => transactionDetails.startsWith(prefix));
    if (transactionDetails && !looksGenerated) return transactionDetails;

    const relatedSale = findRelatedSale(transaction, party, role, sales);
    const saleDetails = String(relatedSale?.notes || '').trim();
    const defaultSettlementNotes = [t.supplierGoodsSettlement, t.customerRawSettlement].filter(Boolean);
    if (!saleDetails || defaultSettlementNotes.includes(saleDetails) || /supplier debt settlement|customer debt settlement/i.test(saleDetails)) return '';
    return saleDetails;
};
