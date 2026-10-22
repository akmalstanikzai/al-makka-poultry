const number = value => Number(value) || 0;

/**
 * Returns the itemized lines stored on a sale or account transaction while
 * keeping every historical single-item record readable.
 */
export const getSaleLineItems = record => {
    const storedItems = Array.isArray(record?.lineItems) && record.lineItems.length
        ? record.lineItems
        : Array.isArray(record?.items) && record.items.length
            ? record.items
            : null;

    if (storedItems) {
        return storedItems.map(item => {
            const unitType = item.unitType || 'kg';
            const unitQuantity = number(item.unitQuantity);
            const salePricePerUnit = number(item.salePricePerUnit ?? item.unitPricePerUnit);
            const unitWeight = unitType === 'ton' ? 1000 : unitType === 'bag' ? 50 : 1;
            return {
                productId: item.productId || '',
                productName: item.productName || item.itemName || '',
                unitType,
                unitQuantity,
                quantityKg: number(item.quantityKg) || (unitQuantity * unitWeight),
                salePricePerUnit,
                totalAmount: number(item.totalAmount) || (unitQuantity * salePricePerUnit),
            };
        });
    }

    const productName = record?.productName || record?.itemName;
    if (!productName) return [];
    const unitQuantity = number(record.unitQuantity ?? record.quantityKg);
    const salePricePerUnit = number(record.salePricePerUnit ?? record.unitPricePerUnit ?? record.unitPrice);
    return [{
        productId: record.productId || '',
        productName,
        unitType: record.unitType || 'kg',
        unitQuantity,
        quantityKg: number(record.quantityKg),
        salePricePerUnit,
        totalAmount: number(record.totalAmount ?? record.amount) || (unitQuantity * salePricePerUnit),
    }];
};

export const saleUnitLabel = (unitType, t) => ({
    bag: t.statementBag || t.bag,
    kg: t.statementKilo || t.kilo,
    ton: t.statementTon || t.ton,
}[unitType] || unitType);

