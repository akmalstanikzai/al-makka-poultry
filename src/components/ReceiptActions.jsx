import React, { useState } from 'react';
import { Download, Printer } from 'lucide-react';
import { downloadReceiptPdf, printReceipt } from '../lib/receiptExport';

export const ReceiptActions = ({ elementId, filename, title, printLabel = 'Print', downloadLabel = 'PDF' }) => {
    const [isDownloading, setIsDownloading] = useState(false);
    const [error, setError] = useState('');
    const handlePrint = () => {
        setError('');
        try {
            printReceipt(elementId, title);
        }
        catch (printError) {
            setError(printError.message);
        }
    };
    const handleDownload = async () => {
        setError('');
        setIsDownloading(true);
        try {
            await downloadReceiptPdf(elementId, filename);
        }
        catch (downloadError) {
            setError(downloadError.message || 'Could not create the PDF.');
        }
        finally {
            setIsDownloading(false);
        }
    };
    return <div className="receipt-actions flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <button type="button" onClick={handlePrint} className="px-3 py-1.5 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"><Printer className="w-3.5 h-3.5"/><span>{printLabel}</span></button>
        <button type="button" onClick={handleDownload} disabled={isDownloading} className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 disabled:bg-amber-400 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"><Download className="w-3.5 h-3.5"/><span>{isDownloading ? 'Creating…' : downloadLabel}</span></button>
      </div>
      {error && <span className="text-[10px] text-rose-600">{error}</span>}
    </div>;
};
