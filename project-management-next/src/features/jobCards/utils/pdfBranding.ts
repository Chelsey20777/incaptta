import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { DEJAVU_REGULAR, DEJAVU_BOLD } from './fonts';
import { BRAND_CONFIG } from '@/config/branding';

declare module 'jspdf' {
    interface jsPDF {
        lastAutoTable: {
            finalY: number;
        };
    }
}

// Converts a hex color string to an [R, G, B] tuple for jsPDF
export function hexToRgb(hex: string): [number, number, number] {
    const clean = hex.replace('#', '')
    const full = clean.length === 3
        ? clean.split('').map(c => c + c).join('')
        : clean
    const n = parseInt(full, 16)
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

// theme constants (match old generator)
export const PRIMARY_COLOR: [number, number, number] = [118, 185, 0]; // Lime Green #76b900
export const TABLE_HEADER_COLOR: [number, number, number] = [220, 220, 220]; // Light Gray
export const SECONDARY_TEXT_COLOR: [number, number, number] = [38, 38, 38]; // Black Text 1, Lighter 15%
export const BACKGROUND_COLOR: [number, number, number] = [237, 229, 225]; // #ede5e1 (Beige)
export const PAGE_MARGIN = 14;

export type CompanySettingsLike = {
    logoUrl?: string;
    sealUrl?: string;
    sealUrl2?: string;
    officialSealUrl?: string;
    companyName?: string;
    address?: string;
    email?: string;
    phone?: string;
    secondaryPhone?: string;
    phone1?: string;
    phone2?: string;
    invoiceAdviceText?: string;
    city?: string;
    country?: string;
    website?: string;
    signatureUrl?: string;
    managerName?: string;
    managerPosition?: string;
    managerSignatureUrl?: string;
    managerSignatureDataUrl?: string;
    /** PDF header logo max width in mm (aspect-preserving contain box). */
    pdfLogoMaxWidthMm?: number;
    /** PDF header logo max height in mm (aspect-preserving contain box). */
    pdfLogoMaxHeightMm?: number;
};

export interface FinanceSettingsLike {
    bankName?: string;
    branchCode?: string;
    accountName?: string;
    accountNumber?: string;
    bankName2?: string;
    accountName2?: string;
    accountNumber2?: string;
    bankAccount2?: string;
    branchCode2?: string;
    swiftCode2?: string;
    paymentTerms?: string;
    termsAdvised?: string;
    termsOther?: string;
    moreTerms?: string;
    vatRate?: number;
    vatEnabled?: boolean;
    depositMilestone?: string;
    progressMilestone?: string;
    finalMilestone?: string;
    paymentMethodText?: string;
    // Legacy support
    otherInfo?: string;
    termsAndConditions?: string;
    swiftCode?: string;
    bankAccount?: string;
    signatureUrl?: string;
};

// --- Helpers ---
export const drawBackground = (doc: jsPDF) => {
    const pageWidth = doc.internal.pageSize.width;
    const pageHeight = doc.internal.pageSize.height;
    doc.setFillColor(...BACKGROUND_COLOR);
    doc.rect(0, 0, pageWidth, pageHeight, 'F');
};

export const setupDoc = (doc: jsPDF) => {
    // Override addPage to automatically draw the background
    const originalAddPage = (doc as any).addPage.bind(doc);
    (doc as any).addPage = function (...args: any[]) {
        originalAddPage(...args);
        drawBackground(this);
        return this;
    };

    // Draw initial page background
    drawBackground(doc);
};

export const setupFonts = async (doc: jsPDF): Promise<void> => {
    try {
        doc.addFileToVFS("DejaVuSansCondensed.ttf", DEJAVU_REGULAR);
        doc.addFont("DejaVuSansCondensed.ttf", "DejaVuSansCondensed", "normal");
        if (DEJAVU_BOLD) {
            doc.addFileToVFS("DejaVuSansCondensed-Bold.ttf", DEJAVU_BOLD);
            doc.addFont("DejaVuSansCondensed-Bold.ttf", "DejaVuSansCondensed", "bold");
        }
        doc.setFont("DejaVuSansCondensed", "normal");
    } catch {
        console.warn("Could not load custom fonts, falling back to Helvetica:");
        doc.setFont("helvetica", "normal");
    }
};

export const removeWhiteBackground = async (imgSrc: string): Promise<string> => {
    return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.src = imgSrc;
        img.onload = () => {
            try {
                const canvas = document.createElement("canvas");
                canvas.width = img.width;
                canvas.height = img.height;
                const ctx = canvas.getContext("2d");
                if (!ctx) {
                    resolve(imgSrc);
                    return;
                }
                ctx.drawImage(img, 0, 0);
                const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                const data = imageData.data;
                for (let i = 0; i < data.length; i += 4) {
                    const r = data[i]!;
                    const g = data[i + 1]!;
                    const b = data[i + 2]!;
                    if (r > 240 && g > 240 && b > 240) {
                        data[i + 3] = 0;
                    }
                }
                ctx.putImageData(imageData, 0, 0);
                resolve(canvas.toDataURL("image/png"));
            } catch (e) {
                console.warn("Error processing image in removeWhiteBackground (potentially CORS):", e);
                resolve(imgSrc);
            }
        };
        img.onerror = () => {
            console.warn("Failed to load image for white background removal:", imgSrc);
            resolve(imgSrc);
        };
    });
};

export const getSealImage = async (companySettings?: any): Promise<HTMLImageElement | null> => {
    const sealDataUrl = companySettings?.sealDataUrl || companySettings?.sealUrl2DataUrl;
    const sealSource = sealDataUrl || companySettings?.sealUrl || companySettings?.officialSealUrl || companySettings?.sealUrl2;
    if (!sealSource) return null;

    try {
        const transparentSeal = sealDataUrl ? sealDataUrl : await removeWhiteBackground(sealSource);
        const sealImg = new Image();
        if (!sealDataUrl) sealImg.crossOrigin = "anonymous";
        sealImg.src = transparentSeal;

        return await new Promise((resolve) => {
            sealImg.onload = () => resolve(sealImg);
            sealImg.onerror = () => resolve(null);
        });
    } catch {
        return null;
    }
};

export const drawHeader = async (doc: jsPDF, companySettings?: CompanySettingsLike): Promise<number> => {
    const pageWidth = doc.internal.pageSize.width;
    const headerTopY = 12;
    const qrFixedSize = 26;
    const qrBlockTotalHeight = qrFixedSize + 7;
    const addressBlockX = pageWidth - PAGE_MARGIN;
    const minHeaderHeight = 35;
    /** Aspect-preserving max draw box — never stretch the logo. Admin can override via settings. */
    const DEFAULT_LOGO_MAX_W = 55;
    const DEFAULT_LOGO_MAX_H = 28;
    const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
    const parseMm = (value: unknown, fallback: number) => {
        const n = typeof value === 'number' ? value : Number(value);
        return Number.isFinite(n) ? n : fallback;
    };
    const LOGO_MAX_W = clamp(parseMm(companySettings?.pdfLogoMaxWidthMm, DEFAULT_LOGO_MAX_W), 20, 80);
    const LOGO_MAX_H = clamp(parseMm(companySettings?.pdfLogoMaxHeightMm, DEFAULT_LOGO_MAX_H), 12, 45);

    let logoAspect = 45 / 25; // fallback ~1.8:1 until image loads
    let logoImgElement: HTMLImageElement | null = null;

    const logoDataUrl = (companySettings as any)?.logoDataUrl;
    const logoUrl = companySettings?.logoUrl;

    if (logoDataUrl || logoUrl) {
        try {
            const transparentLogo = logoDataUrl ? logoDataUrl : await removeWhiteBackground(logoUrl as string);
            await new Promise<void>((resolve) => {
                const img = new Image();
                if (!logoDataUrl) img.crossOrigin = "anonymous";
                img.src = transparentLogo;
                img.onload = () => {
                    logoImgElement = img;
                    if (img.width > 0 && img.height > 0) {
                        logoAspect = img.width / img.height;
                    }
                    resolve();
                };
                img.onerror = () => resolve();
            });
        } catch (e) { console.warn("Logo load fail", e); }
    }

    // Measure address block first so header band can match QR + address height
    const companyName = (companySettings?.companyName || `${BRAND_CONFIG.name} PRIVATE LIMITED ZIMBABWE`).toUpperCase();
    const address = companySettings?.address || BRAND_CONFIG.defaultAddress;
    const email = companySettings?.email || BRAND_CONFIG.defaultEmail;
    const phone = companySettings?.phone1 || companySettings?.phone || BRAND_CONFIG.defaultPhone;
    const secondaryPhone = companySettings?.secondaryPhone || companySettings?.phone2;
    const website = companySettings?.website || (email.includes('@') ? `www.${email.split('@')[1]}` : BRAND_CONFIG.defaultWebsite);

    doc.setFont("DejaVuSansCondensed", "bold");
    doc.setFontSize(9);
    const nameLines = doc.splitTextToSize(companyName, 75);

    doc.setFont("DejaVuSansCondensed", "normal");
    doc.setFontSize(8);
    const addressLines = doc.splitTextToSize(address, 55);

    const lineSpacing = 3.5;
    const h1 = (nameLines.length * 4) + 2;
    const h2 = addressLines.length * lineSpacing;
    const fixedLinesCount = 3 + (secondaryPhone ? 1 : 0);
    const h3 = fixedLinesCount * lineSpacing;
    const totalAddrHeight = h1 + h2 + h3;

    const headerBandHeight = Math.max(qrBlockTotalHeight, totalAddrHeight + 1, minHeaderHeight);
    const headerBottomY = headerTopY + headerBandHeight;

    // Contain inside 55×28 mm — preserve aspect ratio (no vertical stretch)
    let logoHeight = LOGO_MAX_H;
    let logoWidth = logoHeight * logoAspect;
    if (logoWidth > LOGO_MAX_W) {
        logoWidth = LOGO_MAX_W;
        logoHeight = logoWidth / logoAspect;
    }

    if (logoImgElement) {
        try {
            const logoY = headerTopY + Math.max(0, (headerBandHeight - logoHeight) / 2);
            doc.addImage(logoImgElement, "PNG", PAGE_MARGIN, logoY, logoWidth, logoHeight);
        } catch (err) {
            console.error("jsPDF error adding logo:", err);
        }
    }

    let qrY = headerBottomY - qrBlockTotalHeight;
    if (qrY < headerTopY) qrY = headerTopY;

    const qrX = (pageWidth / 2) - (qrFixedSize / 2);
    const fallbackWebsite = BRAND_CONFIG.defaultWebsite.startsWith('http') ? BRAND_CONFIG.defaultWebsite : `https://${BRAND_CONFIG.defaultWebsite}`;
    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(fallbackWebsite)}`;

    try {
        const qrImg = new Image();
        qrImg.crossOrigin = "anonymous";
        qrImg.src = qrCodeUrl;
        await new Promise((resolve) => {
            qrImg.onload = () => {
                try {
                    doc.addImage(qrImg, "PNG", qrX, qrY, qrFixedSize, qrFixedSize);
                } catch (err) {
                    console.error("jsPDF error adding QR:", err);
                }
                resolve(null);
            };
            qrImg.onerror = () => resolve(null);
        });
    } catch { /* ignore */ }

    const scanTextY = qrY + qrFixedSize + 4;
    doc.setFontSize(7);
    doc.setFont("DejaVuSansCondensed", "bold");
    doc.setTextColor(...PRIMARY_COLOR);
    doc.text("Scan here to view our works", pageWidth / 2, scanTextY, { align: "center" });

    let addrY = headerBottomY - totalAddrHeight - 1;
    if (addrY < headerTopY) addrY = headerTopY;

    doc.setTextColor(0, 0, 0);
    doc.setFont("DejaVuSansCondensed", "bold");
    doc.setFontSize(9);
    nameLines.forEach((line: string) => {
        doc.text(line, addressBlockX, addrY, { align: "right" });
        addrY += 4;
    });
    addrY += 2;

    doc.setTextColor(...SECONDARY_TEXT_COLOR);
    doc.setFont("DejaVuSansCondensed", "normal");
    doc.setFontSize(8);
    addressLines.forEach((line: string) => {
        doc.text(line, addressBlockX, addrY, { align: "right" });
        addrY += lineSpacing;
    });

    doc.text(phone, addressBlockX, addrY, { align: "right" });
    addrY += lineSpacing;

    if (secondaryPhone) {
        const formattedSecondary = secondaryPhone.startsWith('/') ? secondaryPhone : `/${secondaryPhone}`;
        doc.text(formattedSecondary, addressBlockX, addrY, { align: "right" });
        addrY += lineSpacing;
    }

    doc.text(email, addressBlockX, addrY, { align: "right" });
    addrY += lineSpacing;

    doc.text(website, addressBlockX, addrY, { align: "right" });

    return headerBottomY;
};

export const drawGreenBar = (doc: jsPDF, y: number) => {
    const pageWidth = doc.internal.pageSize.width;
    doc.setFillColor(...PRIMARY_COLOR);
    doc.rect(PAGE_MARGIN, y, pageWidth - (PAGE_MARGIN * 2), 8, "F");
};

export const drawJobCardInfoRow = (
    doc: jsPDF,
    opts: {
        leftTitle: string;
        leftLine1: string;
        leftLine2?: string;
        docTitle: string;
        docNumber: string;
        dateIssued: string;
        adviceText?: string;
        dueDate?: string;
        generatedBy?: string;
    },
    startY: number
) => {
    const pageWidth = doc.internal.pageSize.width;
    let currentY = startY;

    // Right column reserved width so advice text never underlaps "Generated by" / doc meta
    const rightColWidth = 58;
    const col3X = pageWidth - PAGE_MARGIN;
    const col3Left = col3X - rightColWidth;
    const col2X = 80;
    const adviceMaxWidth = Math.max(40, col3Left - col2X - 4);

    // Col 1: Bill To — wrap so long names/emails/structure sizes stay left of the advice column
    const leftMaxWidth = Math.max(36, col2X - PAGE_MARGIN - 6);
    const wrapLeft = (text: string) => {
        const chunks = String(text || "").split("\n").map((part) => part.trim()).filter(Boolean);
        const lines: string[] = [];
        for (const chunk of chunks) {
            lines.push(...doc.splitTextToSize(chunk, leftMaxWidth));
        }
        return lines;
    };

    doc.setFont("DejaVuSansCondensed", "bold");
    doc.setFontSize(9);
    doc.setTextColor(0, 0, 0);
    doc.text(opts.leftTitle, PAGE_MARGIN, currentY);

    currentY += 5;
    doc.setTextColor(...SECONDARY_TEXT_COLOR);
    doc.setFont("DejaVuSansCondensed", "normal");
    doc.setFontSize(8);
    const leftLines = [
        ...wrapLeft(opts.leftLine1 || "N/A"),
        ...(opts.leftLine2 ? wrapLeft(opts.leftLine2) : []),
    ];
    leftLines.forEach((line, idx) => {
        if (idx > 0) currentY += 4;
        doc.text(line, PAGE_MARGIN, currentY);
    });

    // Col 2: Advice
    let col2Y = startY;
    doc.setTextColor(0, 0, 0);
    doc.setFont("DejaVuSansCondensed", "bold");
    doc.text("PLEASE BE ADVISED THAT", col2X, col2Y);

    // Values
    col2Y += 5;
    doc.setTextColor(...SECONDARY_TEXT_COLOR);
    doc.setFont("DejaVuSansCondensed", "normal");
    doc.setFontSize(8);
    const adviceText = opts.adviceText || "For all onsite Installation services: Please note that you will provide transport (for the workforce ,material (herein stated in this invoice) and equipment committed to you from our premises and from your farm after service delivery.";
    const adviceLines = doc.splitTextToSize(adviceText, adviceMaxWidth);
    doc.text(adviceLines, col2X, col2Y);

    // Col 3: Meta Info
    let col3Y = startY; // Perfectly aligned with "BILL ADDRESSED TO" and "PLEASE BE ADVISED" labels
    doc.setFont("DejaVuSansCondensed", "bold");
    doc.setFontSize(14);
    doc.setTextColor(...PRIMARY_COLOR);
    doc.text(opts.docTitle, col3X, col3Y, { align: "right" });

    // Meta details (tightened spacing and reduced size for document number)
    col3Y += 6;
    doc.setFontSize(11);
    doc.text(opts.docNumber, col3X, col3Y, { align: "right" });

    col3Y += 5;
    doc.setTextColor(...SECONDARY_TEXT_COLOR);
    doc.setFontSize(9);
    doc.text(`Date: ${opts.dateIssued}`, col3X, col3Y, { align: "right" });
    if (opts.dueDate) {
        col3Y += 5;
        doc.text(`Due Date: ${opts.dueDate}`, col3X, col3Y, { align: "right" });
    }
    if (opts.generatedBy) {
        col3Y += 5;
        doc.setFontSize(8);
        const generatedLines = doc.splitTextToSize(`Generated by: ${opts.generatedBy}`, rightColWidth);
        generatedLines.forEach((line: string, idx: number) => {
            if (idx > 0) col3Y += 3.5;
            doc.text(line, col3X, col3Y, { align: "right" });
        });
    }

    const adviceBottomY = col2Y + Math.max(adviceLines.length - 1, 0) * 3.5;
    const lowestY = Math.max(
        currentY,
        adviceBottomY,
        col3Y
    );
    return lowestY + 10;
};

export const renderBrandedItemsTable = (
    doc: jsPDF,
    startY: number,
    head: string[],
    body: any[][],
    columnStyles?: any
) => {
    autoTable(doc, {
        head: [head],
        body,
        startY,
        theme: 'grid',
        styles: {
            font: "DejaVuSansCondensed",
            fontSize: 8,
            overflow: 'linebreak',
            cellPadding: 2,
            lineColor: PRIMARY_COLOR,
            lineWidth: 0.1,
            valign: 'top',
            textColor: SECONDARY_TEXT_COLOR
        },
        bodyStyles: {
            fillColor: BACKGROUND_COLOR
        },
        headStyles: {
            fillColor: TABLE_HEADER_COLOR,
            textColor: [0, 0, 0],
            fontStyle: 'bold',
            halign: 'center',
            valign: 'middle'
        },
        columnStyles: columnStyles || {
            0: { cellWidth: 35, halign: 'center', fontStyle: 'bold' },
            1: { cellWidth: 'auto', halign: 'left' },
            2: { cellWidth: 15, halign: 'center' },
            3: { cellWidth: 25, halign: 'right' },
            4: { cellWidth: 25, halign: 'right' }
        },
        margin: { left: PAGE_MARGIN, right: PAGE_MARGIN }
    });

    // @ts-ignore
    return (doc as any).lastAutoTable.finalY + 2;
};

export const drawTotalsRight = (
    doc: jsPDF,
    startY: number,
    totals: { subtotal: number; total: number; paid?: number; vat?: number; vatRate?: number; implementation?: number; discount?: number; discountLabel?: string }
) => {
    const pageWidth = doc.internal.pageSize.width;
    let currentY = startY;
    const valueX = pageWidth - PAGE_MARGIN;
    const labelRightAnchor = pageWidth - 45;
    const rowH = 6;

    doc.setFont("DejaVuSansCondensed", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...SECONDARY_TEXT_COLOR);
    doc.text("Subtotal", labelRightAnchor, currentY + 4, { align: "right" });
    doc.text(totals.subtotal.toFixed(2), valueX, currentY + 4, { align: "right" });
    currentY += rowH;

    if (totals.discount !== undefined && totals.discount > 0) {
        doc.setFont("DejaVuSansCondensed", "normal");
        doc.setTextColor(...SECONDARY_TEXT_COLOR);
        doc.text(totals.discountLabel || "Discount", labelRightAnchor, currentY + 4, { align: "right" });
        doc.text(`(${totals.discount.toFixed(2)})`, valueX, currentY + 4, { align: "right" });
        currentY += rowH;
    }

    if (totals.implementation !== undefined && totals.implementation > 0) {
        doc.setFont("DejaVuSansCondensed", "normal");
        doc.setTextColor(...SECONDARY_TEXT_COLOR);
        doc.text("Implementation Cost", labelRightAnchor, currentY + 4, { align: "right" });
        doc.text(totals.implementation.toFixed(2), valueX, currentY + 4, { align: "right" });
        currentY += rowH;
    }

    if (totals.vat !== undefined && totals.vat > 0) {
        const vatLabel = totals.vatRate ? `VAT (${totals.vatRate}%)` : 'VAT';
        doc.setFont("DejaVuSansCondensed", "normal");
        doc.setTextColor(...SECONDARY_TEXT_COLOR);
        doc.text(vatLabel, labelRightAnchor, currentY + 4, { align: "right" });
        doc.text(totals.vat.toFixed(2), valueX, currentY + 4, { align: "right" });
        currentY += rowH;
    }

    doc.setFont("DejaVuSansCondensed", "bold");
    doc.setTextColor(0, 0, 0);
    doc.text("TOTAL", labelRightAnchor, currentY + 4, { align: "right" });
    doc.text(totals.total.toFixed(2), valueX, currentY + 4, { align: "right" });
    currentY += rowH + 2;

    if (totals.paid !== undefined) {
        doc.setFillColor(230, 230, 230);
        doc.rect(PAGE_MARGIN, currentY, pageWidth - (PAGE_MARGIN * 2), rowH, "F");
        doc.setTextColor(...SECONDARY_TEXT_COLOR);
        doc.setFont("DejaVuSansCondensed", "normal");
        doc.text("Less Payment", labelRightAnchor, currentY + 4.5, { align: "right" });
        doc.text(totals.paid > 0 ? `(${totals.paid.toFixed(2)})` : "0.00", valueX, currentY + 4.5, { align: "right" });
        currentY += rowH;

        doc.setFillColor(200, 200, 200);
        doc.rect(PAGE_MARGIN, currentY, pageWidth - (PAGE_MARGIN * 2), rowH, "F");
        doc.setFont("DejaVuSansCondensed", "bold");
        doc.setTextColor(0, 0, 0);
        doc.text("Balance Due", labelRightAnchor, currentY + 4.5, { align: "right" });
        doc.text((totals.total - totals.paid).toFixed(2), valueX, currentY + 4.5, { align: "right" });
    }

    return currentY + 15;
};

export const drawFooter = async (
    doc: jsPDF,
    startY: number,
    company?: CompanySettingsLike,
    finance?: FinanceSettingsLike,
    signerName?: string,
    options: { skipPaymentBox?: boolean; skipTerms?: boolean, signatureUrl?: string, position?: string, skipSeal?: boolean, qrDataUrl?: string, qrSize?: number, qrLabel?: string } = {}
) => {
    const pageWidth = doc.internal.pageSize.width;
    let currentY = startY;

    if (currentY > 200) {
        doc.addPage();
        currentY = 20;
    }

    if (!options.skipPaymentBox) {
        let bank1Text = "";
        if (finance?.bankName) {
            bank1Text += `BANK: ${finance.bankName}\n`;
            bank1Text += `Account Name: ${finance.accountName}\n`;
            bank1Text += `Account No: ${finance.accountNumber || finance.bankAccount}`;
            if (finance.branchCode) bank1Text += `\nBranch: ${finance.branchCode}`;
        }

        let bank2Text = "";
        if (finance?.bankName2) {
            bank2Text += `BANK: ${finance.bankName2}\n`;
            bank2Text += `Account Name: ${finance.accountName2}\n`;
            bank2Text += `Account No: ${finance.accountNumber2 || finance.bankAccount2}`;
        }

        const paymentTermsText = finance?.paymentTerms ? `PAYMENT TERMS: ${finance.paymentTerms}` : "";

        autoTable(doc, {
            startY: currentY,
            head: [[{ content: 'PAYMENT DETAILS', colSpan: 2, styles: { halign: 'center' } }]],
            body: [
                [
                    { content: bank1Text, styles: { halign: 'left' } },
                    { content: bank2Text, styles: { halign: 'left' } }
                ],
                [{ content: paymentTermsText, colSpan: 2, styles: { fontStyle: 'italic', textColor: [80, 80, 80] } }]
            ],
            theme: 'grid',
            headStyles: {
                fillColor: PRIMARY_COLOR,
                textColor: [255, 255, 255],
                fontStyle: 'bold',
                fontSize: 10
            },
            bodyStyles: {
                fillColor: [255, 255, 255],
                textColor: SECONDARY_TEXT_COLOR,
                fontSize: 8,
                cellPadding: 3,
                valign: 'top'
            },
            columnStyles: {
                0: { cellWidth: (pageWidth - (PAGE_MARGIN * 2)) / 2 },
                1: { cellWidth: (pageWidth - (PAGE_MARGIN * 2)) / 2 }
            },
            margin: { left: PAGE_MARGIN, right: PAGE_MARGIN }
        });

        // @ts-ignore
        currentY = doc.lastAutoTable.finalY + 10;
    }

    const availableWidth = pageWidth - (PAGE_MARGIN * 2);
    const colWidth = (availableWidth / 3) - 4;
    const col1X = PAGE_MARGIN;
    const col2X = PAGE_MARGIN + colWidth + 6;
    const col3X = PAGE_MARGIN + (colWidth * 2) + 12;

    if (currentY > 250) {
        doc.addPage();
        currentY = 20;
    }

    doc.setFontSize(8);

    const otherInfoText = finance?.termsOther || finance?.otherInfo;
    if (otherInfoText && !options.skipTerms) {
        doc.setFont("DejaVuSansCondensed", "bold");
        doc.setTextColor(...PRIMARY_COLOR);
        doc.text("OTHER INFORMATION", col1X, currentY);
        doc.setFont("DejaVuSansCondensed", "normal");
        doc.setTextColor(...SECONDARY_TEXT_COLOR);
        const infoLines = doc.splitTextToSize(otherInfoText, colWidth);
        doc.text(infoLines, col1X, currentY + 5);
    }

    const termsText = finance?.moreTerms || finance?.termsAndConditions;
    if (termsText && !options.skipTerms) {
        doc.setFont("DejaVuSansCondensed", "bold");
        doc.setTextColor(...PRIMARY_COLOR);
        doc.text("TERMS & CONDITIONS", col2X, currentY);
        doc.setFont("DejaVuSansCondensed", "normal");
        doc.setTextColor(...SECONDARY_TEXT_COLOR);
        const termsLines = doc.splitTextToSize(termsText, colWidth);
        doc.text(termsLines, col2X, currentY + 5);
    }

    // QR code — centred on the page, parallel to the signature block
    if (options.qrDataUrl) {
        const qrSize = options.qrSize ?? 29
        const qrX = (pageWidth / 2) - (qrSize / 2)
        try {
            doc.addImage(options.qrDataUrl, 'PNG', qrX, currentY, qrSize, qrSize)
            doc.setFont('DejaVuSansCondensed', 'normal')
            doc.setFontSize(6)
            doc.setTextColor(120, 120, 120)
            doc.text(options.qrLabel ?? 'Scan to verify', pageWidth / 2, currentY + qrSize + 2.5, { align: 'center' })
        } catch { /* ignore */ }
    }

    const finalSignerName = signerName || "Authorized Signatory";
    const finalSignerPos = options.position || "Manager";

    doc.setFont("DejaVuSansCondensed", "bold");
    doc.setTextColor(0, 0, 0);
    doc.text(finalSignerName, col3X, currentY);

    doc.setFont("DejaVuSansCondensed", "normal");
    doc.setTextColor(...SECONDARY_TEXT_COLOR);
    const posLines = doc.splitTextToSize(finalSignerPos, colWidth);
    doc.text(posLines, col3X, currentY + 4);

    const dateY = currentY + 4 + (posLines.length * 3.5);
    doc.text(`Date: ${toFormattedDate(new Date())}`, col3X, dateY);

    const sigLabelY = dateY + 6;
    doc.text("Signature:", col3X, sigLabelY);

    if (options.signatureUrl) {
        try {
            const transparentSig = await removeWhiteBackground(options.signatureUrl);
            const img = new Image();
            img.crossOrigin = "anonymous";
            img.src = transparentSig;
            await new Promise((resolve) => {
                img.onload = () => {
                    const aspect = img.width / img.height;
                    doc.addImage(img, "PNG", col3X, sigLabelY + 2, 40, 40 / aspect);
                    resolve(null);
                };
                img.onerror = () => resolve(null);
            });
        } catch { /* ignore */ }
    }

    const sealImg = options.skipSeal ? null : await getSealImage(company);
    if (sealImg) {
        try {
            doc.addImage(sealImg, "PNG", col3X + 15, sigLabelY, 50, 50);
        } catch { /* ignore */ }
    }
};

export const drawWatermarkOnAllPages = (doc: jsPDF, sealImg: HTMLImageElement) => {
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        const pageWidth = doc.internal.pageSize.width;
        const pageHeight = doc.internal.pageSize.height;
        const sealSize = 120;
        const x = (pageWidth - sealSize) / 2;
        const y = (pageHeight - sealSize) / 2;

        const docAny = doc as any;
        if (docAny.GState) {
            try {
                docAny.saveGraphicsState();
                docAny.setGState(new docAny.GState({ opacity: 0.10 }));
                doc.addImage(sealImg, "PNG", x, y, sealSize, sealSize);
                docAny.restoreGraphicsState();
            } catch {
                doc.addImage(sealImg, "PNG", x, y, sealSize, sealSize);
            }
        } else {
            doc.addImage(sealImg, "PNG", x, y, sealSize, sealSize);
        }
    }
};

export const toFormattedDate = (date: any): string => {
    if (!date) return 'N/A';
    if (date && typeof date.toDate === 'function') {
        return date.toDate().toLocaleDateString();
    }
    if (date instanceof Date) {
        return date.toLocaleDateString();
    }
    try {
        const d = new Date(date);
        return isNaN(d.getTime()) ? 'N/A' : d.toLocaleDateString();
    } catch {
        return 'N/A';
    }
};
