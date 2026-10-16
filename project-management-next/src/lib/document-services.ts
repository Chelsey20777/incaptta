/**
 * Client-Side Asset Generation Services
 * Uses dynamic imports to prevent Server-Side Rendering (SSR) compile issues.
 */
import { BRAND_CONFIG } from '@/config/branding'

export async function generateExcelReport(data: any[]) {
  if (typeof window === 'undefined') return;
  
  try {
    const ExcelJS = await import('exceljs');
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Operational Report');
    
    worksheet.columns = [
      { header: 'Project ID', key: 'id', width: 15 },
      { header: 'Name', key: 'name', width: 30 },
      { header: 'Status', key: 'status', width: 15 },
      { header: 'Department', key: 'department', width: 15 },
      { header: 'Progress (%)', key: 'progress', width: 15 }
    ];
    
    data.forEach((item) => {
      worksheet.addRow({
        id: item.id,
        name: item.name,
        status: item.status,
        department: item.department,
        progress: item.progress
      });
    });
    
    // Write buffer and download
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Incaptta_Supa_App_Report_${Date.now()}.xlsx`;
    a.click();
    window.URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Failed to generate Excel report:', error);
  }
}

export async function generatePdfInvoice(invoice: { id: string; clientName: string; amount: number; date: string }) {
  if (typeof window === 'undefined') return;

  try {
    const { jsPDF } = await import('jspdf');
    await import('jspdf-autotable');
    
    const doc = new jsPDF() as any;
    
    // Add layout header info
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(20);
    doc.setTextColor(121, 194, 27); // Brand Primary
    doc.text((BRAND_CONFIG.tagline ? `${BRAND_CONFIG.name} ${BRAND_CONFIG.tagline}` : BRAND_CONFIG.name).toUpperCase(), 14, 20);
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);
    doc.text('Operations & Scheduling Portal', 14, 25);
    
    // Invoice Metadata
    doc.setFontSize(12);
    doc.setTextColor(50, 50, 50);
    doc.text('INVOICE DETAIL', 14, 40);
    doc.setFontSize(10);
    doc.text(`Reference: INV-${invoice.id}`, 14, 48);
    doc.text(`Date Issued: ${invoice.date}`, 14, 54);
    doc.text(`Client Account: ${invoice.clientName}`, 14, 60);
    
    // Table content using jspdf-autotable
    doc.autoTable({
      startY: 70,
      head: [['Product / Services Description', 'Unit Cost', 'VAT (15%)', 'Line Total']],
      body: [
        ['Engineering & Project Operations Scheduling Services', `$${invoice.amount.toFixed(2)}`, `$${(invoice.amount * 0.15).toFixed(2)}`, `$${(invoice.amount * 1.15).toFixed(2)}`]
      ],
      theme: 'grid',
      headStyles: { fillColor: [121, 194, 27], textColor: [255, 255, 255] },
      styles: { fontSize: 9 }
    });
    
    doc.save(`Invoice_${invoice.id}.pdf`);
  } catch (error) {
    console.error('Failed to generate PDF invoice:', error);
  }
}

export async function generateQrCode(text: string): Promise<string> {
  if (typeof window === 'undefined') return '';
  try {
    const QRCode = await import('qrcode');
    return await QRCode.toDataURL(text);
  } catch (error) {
    console.error('Failed to generate QR Code:', error);
    return '';
  }
}
