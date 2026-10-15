export const normalizePartyName = value => String(value || '')
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/[\u064A\u0649]/g, '\u06CC')
    .replace(/\u0643/g, '\u06A9')
    .trim()
    .replace(/\s+/g, '')
    .toLocaleLowerCase();

export const canonicalSupplierNames = new Set([
    'بهاوالدین', 'بهاءالدین', 'بهاؤالدین', 'حاجی مومن',
    'واحد الله قریشی', 'کابل سن فلور', 'ابراهیم خان', 'احسان A اخوت میل',
    'بصیر ذغال', 'عبدالله هوتک', 'سبحان الله حاجی', 'هدایت بتی کوت',
    'ناصر رحمان', 'په نعدو',
].map(normalizePartyName));

export const isCanonicalSupplierName = name => canonicalSupplierNames.has(normalizePartyName(name));
