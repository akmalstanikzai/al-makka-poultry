export const normalizeDecimalInput = input => {
    let value = String(input || '')
        .replace(/[۰-۹]/g, digit => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))
        .replace(/[٠-٩]/g, digit => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
        .replace(/٫/g, '.')
        .replace(/[٬,\s]/g, '')
        .replace(/[^0-9.]/g, '');
    const decimalIndex = value.indexOf('.');
    if (decimalIndex >= 0) {
        value = value.slice(0, decimalIndex + 1) + value.slice(decimalIndex + 1).replace(/\./g, '');
    }
    return value;
};
