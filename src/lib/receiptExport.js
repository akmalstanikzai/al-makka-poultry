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
    const [{ toCanvas }, { jsPDF }] = await Promise.all([
        import('html-to-image'),
        import('jspdf'),
    ]);
    const exportTarget = receipt.cloneNode(true);
    exportTarget.removeAttribute('id');
    const exportHost = document.createElement('div');
    Object.assign(exportHost.style, {
        position: 'fixed',
        left: '-10000px',
        top: '0',
        width: '820px',
        zIndex: '-1',
    });
    Object.assign(exportTarget.style, {
        position: 'static',
        inset: 'auto',
        width: '820px',
        maxWidth: 'none',
        height: 'auto',
        overflow: 'visible',
        background: '#ffffff',
    });
    exportHost.appendChild(exportTarget);
    document.body.appendChild(exportHost);
    await document.fonts?.ready;
    let canvas;
    let receiptHeight = 0;
    let protectedBlockPositions = [];
    try {
        const receiptRect = exportTarget.getBoundingClientRect();
        receiptHeight = receiptRect.height;
        protectedBlockPositions = Array.from(exportTarget.querySelectorAll('.statement-row, .statement-totals, .statement-party-info'))
            .map(element => {
                const rect = element.getBoundingClientRect();
                return {
                    top: Math.max(0, rect.top - receiptRect.top),
                    bottom: Math.min(receiptRect.height, rect.bottom - receiptRect.top),
                };
            });
        canvas = await toCanvas(exportTarget, {
            backgroundColor: '#ffffff',
            pixelRatio: 2,
            cacheBust: true,
        });
    }
    finally {
        exportHost.remove();
    }
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageWidth = 210;
    const pageHeight = 297;
    const margin = 10;
    const imageWidth = pageWidth - (margin * 2);
    const printableHeight = pageHeight - (margin * 2);
    const pageHeightPx = canvas.width * printableHeight / imageWidth;
    const scaleY = canvas.height / receiptHeight;
    const protectedBlocks = protectedBlockPositions.map(block => ({
        top: block.top * scaleY,
        bottom: block.bottom * scaleY,
    }));

    let pageStart = 0;
    let pageNumber = 0;
    while (pageStart < canvas.height) {
        const targetEnd = Math.min(canvas.height, pageStart + pageHeightPx);
        const crossingBlock = protectedBlocks.find(block => block.top < targetEnd
            && block.bottom > targetEnd
            && block.top > pageStart + 80);
        const pageEnd = crossingBlock ? Math.floor(crossingBlock.top) : Math.floor(targetEnd);
        const sliceHeight = Math.max(1, pageEnd - pageStart);
        const pageCanvas = document.createElement('canvas');
        pageCanvas.width = canvas.width;
        pageCanvas.height = sliceHeight;
        const context = pageCanvas.getContext('2d');
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
        context.drawImage(canvas, 0, pageStart, canvas.width, sliceHeight, 0, 0, canvas.width, sliceHeight);
        const image = pageCanvas.toDataURL('image/png');
        const imageHeight = sliceHeight * imageWidth / canvas.width;
        if (pageNumber > 0) pdf.addPage();
        pdf.addImage(image, 'PNG', margin, margin, imageWidth, imageHeight, undefined, 'FAST');
        pageStart = pageEnd;
        pageNumber += 1;
    }
    pdf.save(filename.endsWith('.pdf') ? filename : `${filename}.pdf`);
};
