const parsedTime = value => {
    const time = Date.parse(String(value || ''));
    return Number.isFinite(time) ? time : 0;
};

export const getTransactionActivityTime = transaction => {
    const idTimestamps = String(transaction?.id || '').match(/\d{10,}/g);
    const idTime = idTimestamps?.length ? Number(idTimestamps[idTimestamps.length - 1]) : 0;
    return Math.max(
        parsedTime(transaction?.correctedAt),
        Number.isFinite(idTime) ? idTime : 0,
        parsedTime(transaction?.date),
    );
};

export const compareTransactionsNewestFirst = (first, second) => {
    const timeDifference = getTransactionActivityTime(second) - getTransactionActivityTime(first);
    if (timeDifference !== 0) return timeDifference;

    // A replacement and its corrected original can share the same correction
    // timestamp. Put the active replacement first in that situation.
    const firstActive = (first?.status || 'active') === 'active' ? 1 : 0;
    const secondActive = (second?.status || 'active') === 'active' ? 1 : 0;
    if (firstActive !== secondActive) return secondActive - firstActive;
    return String(second?.id || '').localeCompare(String(first?.id || ''));
};

export const sortTransactionsNewestFirst = transactions =>
    [...(transactions || [])].sort(compareTransactionsNewestFirst);
