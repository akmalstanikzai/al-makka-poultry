const getReceiptElement = (elementId) => {
    const element = document.getElementById(elementId);
    if (!element)
        throw new Error('Receipt content is not available.');
    return element;
};

export const printReceipt = (elementId, title) => {
    const receipt = getReceiptElement(elementId);
    const printWindow = window.open('', '_blank', 'width=900,height=1100');
    if (!printWindow)
        throw new Error('The print window was blocked by the browser.');
    const styles = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
        .map(node => node.outerHTML)
        .join('');
    printWindow.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>${styles}<style>@page{size:A4;margin:12mm}body{margin:0;background:white;color:#0f172a}.receipt-document{max-width:none!important;box-shadow:none!important;border:0!important}.receipt-actions{display:none!important}</style></head><body>${receipt.outerHTML}</body></html>`);
    printWindow.document.close();
    printWindow.onload = () => {
        printWindow.focus();
        printWindow.print();
        printWindow.close();
    };
};

export const downloadReceiptPdf = async (elementId, filename) => {
    const receipt = getReceiptElement(elementId);
    const [{ toPng }, { jsPDF }] = await Promise.all([
        import('html-to-image'),
        import('jspdf'),
    ]);
    const image = await toPng(receipt, {
        backgroundColor: '#ffffff',
        pixelRatio: 2,
        cacheBust: true,
    });
    const imageSize = await new Promise((resolve, reject) => {
        const preview = new Image();
        preview.onload = () => resolve({ width: preview.naturalWidth, height: preview.naturalHeight });
        preview.onerror = () => reject(new Error('The receipt image could not be prepared.'));
        preview.src = image;
    });
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageWidth = 210;
    const pageHeight = 297;
    const margin = 10;
    const imageWidth = pageWidth - (margin * 2);
    const imageHeight = imageSize.height * imageWidth / imageSize.width;
    let remainingHeight = imageHeight;
    let offset = margin;
    pdf.addImage(image, 'PNG', margin, offset, imageWidth, imageHeight, undefined, 'FAST');
    remainingHeight -= pageHeight - (margin * 2);
    while (remainingHeight > 0) {
        pdf.addPage();
        offset = margin - (imageHeight - remainingHeight);
        pdf.addImage(image, 'PNG', margin, offset, imageWidth, imageHeight, undefined, 'FAST');
        remainingHeight -= pageHeight - (margin * 2);
    }
    pdf.save(filename.endsWith('.pdf') ? filename : `${filename}.pdf`);
};
