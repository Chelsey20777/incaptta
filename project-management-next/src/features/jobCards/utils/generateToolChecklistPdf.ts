import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatDate } from '@/lib/utils';

export const generateToolChecklistPdf = (job: any, checklist: any[]) => {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.width;
  const PAGE_MARGIN = 15;
  const PRIMARY: [number, number, number] = [0, 102, 204];
  const DARK: [number, number, number] = [33, 33, 33];
  
  doc.setFontSize(22);
  doc.setTextColor(PRIMARY[0], PRIMARY[1], PRIMARY[2]);
  doc.setFont('helvetica', 'bold');
  doc.text('Tool Return Checklist', PAGE_MARGIN, 25);
  
  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  doc.setFont('helvetica', 'normal');
  doc.text('Audit Report & Verification', PAGE_MARGIN, 32);
  
  doc.setDrawColor(230, 230, 230);
  doc.line(PAGE_MARGIN, 38, pageWidth - PAGE_MARGIN, 38);
  
  doc.setFontSize(9);
  doc.setTextColor(DARK[0], DARK[1], DARK[2]);
  doc.setFont('helvetica', 'bold');
  doc.text('Job:', PAGE_MARGIN, 46);
  doc.setFont('helvetica', 'normal');
  doc.text(`${job.generalInfo?.jobNumber || ''} - ${job.generalInfo?.jobTitle || ''}`, PAGE_MARGIN + 10, 46);
  
  const tableData = checklist.map((item, index) => [
    index + 1,
    item.itemName || 'Item',
    item.qty || 0,
    item.returned ? 'RETURNED' : 'OUTSTANDING',
    item.verifiedAt ? formatDate(item.verifiedAt) : '-',
    item.verifiedBy || '-'
  ]);
  
  autoTable(doc, {
    startY: 55,
    head: [['#', 'Tool', 'Qty', 'Status', 'Date', 'By']],
    body: tableData,
    theme: 'grid',
    headStyles: { fillColor: [0, 82, 164], textColor: [255, 255, 255] },
    didParseCell: (data) => {
      if (data.section === 'body' && data.column.index === 3) {
        data.cell.styles.textColor = data.cell.raw === 'RETURNED' ? [34, 197, 94] : [239, 68, 68];
      }
    }
  });
  
  doc.save(`Tool_Checklist_${job.generalInfo?.jobNumber || 'JC'}.pdf`);
};
