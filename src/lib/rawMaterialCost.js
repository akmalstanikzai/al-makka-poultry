const numeric = value => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
};

export const rawAverageCostPerKg = (material, currency) => {
    const code = currency === 'USD' ? 'USD' : 'AFN';
    const field = code === 'USD' ? 'averageCostPerKgUsd' : 'averageCostPerKg';
    if (material?.[field] != null) return numeric(material[field]);
    return (material?.currency === 'USD' ? 'USD' : 'AFN') === code
        ? numeric(material?.unitPrice)
        : 0;
};

export const rawStockValue = material => {
    const stockKg = numeric(material?.stockKg);
    return {
        AFN: stockKg * rawAverageCostPerKg(material, 'AFN'),
        USD: stockKg * rawAverageCostPerKg(material, 'USD'),
    };
};

export const addToRawMovingAverage = (material, addedWeightKg, unitPricePerKg, currency) => {
    const oldWeightKg = numeric(material?.stockKg);
    const incomingWeightKg = numeric(addedWeightKg);
    const newWeightKg = oldWeightKg + incomingWeightKg;
    const code = currency === 'USD' ? 'USD' : 'AFN';
    if (newWeightKg <= 0) {
        return { averageCostPerKg: 0, averageCostPerKgUsd: 0 };
    }
    const oldValue = rawStockValue(material);
    const incomingValue = incomingWeightKg * numeric(unitPricePerKg);
    return {
        averageCostPerKg: (oldValue.AFN + (code === 'AFN' ? incomingValue : 0)) / newWeightKg,
        averageCostPerKgUsd: (oldValue.USD + (code === 'USD' ? incomingValue : 0)) / newWeightKg,
    };
};

