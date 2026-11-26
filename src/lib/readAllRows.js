// PostgREST can cap a response below our requested page size. Advance by the
// actual rows returned, and use an exact count (when provided) to finish early.
export async function readAllRows(query, pageSize = 1000) {
    const rows = [];
    let offset = 0;
    for (;;) {
        const { data, error, count } = await query.range(offset, offset + pageSize - 1);
        if (error) return { data: null, error };
        if (!Array.isArray(data)) {
            return { data: null, error: { message: 'The database returned an invalid row list.' } };
        }
        rows.push(...data);
        offset += data.length;
        if (data.length === 0 || (Number.isFinite(count) && offset >= count)) {
            return { data: rows, error: null };
        }
    }
}
