import { txtPdf } from './format'
import {
  createPdfDoc, PDF_MARGIN_MM, pdfEnsureSpace, pdfFinishAndSave, pdfPageWidth, preparePdfLayout,
} from './pdf'
import { PDF_TABLE_FONT } from './pdfTable'
import { type DocModulo } from './documentacionModulos'

export async function exportDocumentacionPdf(modulos: DocModulo[]): Promise<void> {
  if (!modulos.length) throw new Error('Seleccione al menos un módulo.')

  const doc = createPdfDoc()
  const layout = await preparePdfLayout(doc)
  const pageW = pdfPageWidth(doc)
  let y = layout.contentTop

  doc.setFont(PDF_TABLE_FONT, 'bold')
  doc.setFontSize(14)
  doc.setTextColor(47, 28, 106)
  doc.text('MANUAL DE FUNCIONALIDADES', pageW / 2, y, { align: 'center' })
  y += 5
  doc.setFontSize(10)
  doc.setTextColor(80, 80, 80)
  doc.text('Guía paso a paso por módulo · UEP-SND', pageW / 2, y, { align: 'center' })
  y += 5
  doc.setFont(PDF_TABLE_FONT, 'normal')
  doc.setFontSize(8)
  doc.text(`Módulos incluidos: ${modulos.length}`, pageW / 2, y, { align: 'center' })
  y += 8

  let sectionActual = ''
  for (const mod of modulos) {
    if (mod.section !== sectionActual) {
      sectionActual = mod.section
      y = pdfEnsureSpace(doc, y, 14, layout)
      doc.setFillColor(47, 28, 106)
      doc.rect(PDF_MARGIN_MM, y, pageW - PDF_MARGIN_MM * 2, 7, 'F')
      doc.setFont(PDF_TABLE_FONT, 'bold')
      doc.setFontSize(9)
      doc.setTextColor(255, 255, 255)
      doc.text(sectionActual.toUpperCase(), PDF_MARGIN_MM + 2.5, y + 4.7)
      y += 10
    }

    y = pdfEnsureSpace(doc, y, 22, layout)
    doc.setFont(PDF_TABLE_FONT, 'bold')
    doc.setFontSize(10)
    doc.setTextColor(30, 30, 30)
    doc.text(txtPdf(mod.label), PDF_MARGIN_MM, y)
    y += 4
    doc.setFont(PDF_TABLE_FONT, 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(100, 100, 100)
    doc.text(`Ruta: ${mod.ruta}`, PDF_MARGIN_MM, y)
    y += 4
    doc.setTextColor(50, 50, 50)
    const resumenLines = doc.splitTextToSize(txtPdf(mod.resumen), pageW - PDF_MARGIN_MM * 2) as string[]
    y = pdfEnsureSpace(doc, y, resumenLines.length * 3.6 + 2, layout)
    doc.text(resumenLines, PDF_MARGIN_MM, y)
    y += resumenLines.length * 3.6 + 3

    doc.setFont(PDF_TABLE_FONT, 'bold')
    doc.setFontSize(8)
    doc.setTextColor(47, 28, 106)
    doc.text('Pasos', PDF_MARGIN_MM, y)
    y += 4

    for (let i = 0; i < mod.pasos.length; i++) {
      const paso = mod.pasos[i]
      const title = `${i + 1}. ${txtPdf(paso.titulo)}`
      const detail = txtPdf(paso.detalle)
      const maxW = pageW - PDF_MARGIN_MM * 2 - 4
      const titleLines = doc.splitTextToSize(title, maxW) as string[]
      const detailLines = doc.splitTextToSize(detail, maxW) as string[]
      const blockH = titleLines.length * 3.6 + detailLines.length * 3.4 + 3
      y = pdfEnsureSpace(doc, y, blockH, layout)

      doc.setFont(PDF_TABLE_FONT, 'bold')
      doc.setFontSize(8)
      doc.setTextColor(20, 20, 20)
      doc.text(titleLines, PDF_MARGIN_MM + 2, y)
      y += titleLines.length * 3.6
      doc.setFont(PDF_TABLE_FONT, 'normal')
      doc.setFontSize(7.5)
      doc.setTextColor(70, 70, 70)
      doc.text(detailLines, PDF_MARGIN_MM + 2, y)
      y += detailLines.length * 3.4 + 2.5
    }
    y += 3
  }

  pdfFinishAndSave(doc, layout, 'Manual_Funcionalidades_Modulos')
}
