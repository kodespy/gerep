import jsPDF from 'jspdf'
import calibriUrl from '../assets/fonts/calibri.ttf?url'
import calibribUrl from '../assets/fonts/calibrib.ttf?url'

export const PDF_TABLE_FONT = 'Calibri'
export const PDF_TABLE_HEAD_SIZE = 10
export const PDF_TABLE_BODY_SIZE = 9

export const pdfTableBodyStyles = {
  font: PDF_TABLE_FONT,
  fontSize: PDF_TABLE_BODY_SIZE,
  fontStyle: 'normal' as const,
}

export const pdfTableHeadStyles = {
  font: PDF_TABLE_FONT,
  fontSize: PDF_TABLE_HEAD_SIZE,
  fontStyle: 'bold' as const,
}

export const pdfTableFootStyles = {
  font: PDF_TABLE_FONT,
  fontSize: PDF_TABLE_HEAD_SIZE,
  fontStyle: 'bold' as const,
}

let fontsReady: Promise<void> | null = null

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

async function loadFontBuffer(url: string, publicFallback: string): Promise<ArrayBuffer> {
  const candidates = [url, `${import.meta.env.BASE_URL || '/'}${publicFallback.replace(/^\//, '')}`, `/${publicFallback.replace(/^\//, '')}`]
  let lastErr: unknown
  for (const candidate of candidates) {
    try {
      const res = await fetch(candidate)
      if (res.ok) return res.arrayBuffer()
      lastErr = new Error(`HTTP ${res.status} (${candidate})`)
    } catch (e) {
      lastErr = e
    }
  }
  throw lastErr instanceof Error
    ? lastErr
    : new Error(`No se pudo cargar la fuente ${publicFallback}`)
}

/** Registra Calibri normal y negrita en jsPDF (una sola vez por sesión). */
export async function ensurePdfFonts(): Promise<void> {
  if (fontsReady) return fontsReady
  fontsReady = (async () => {
    const [normalBuf, boldBuf] = await Promise.all([
      loadFontBuffer(calibriUrl, 'fonts/calibri.ttf'),
      loadFontBuffer(calibribUrl, 'fonts/calibrib.ttf'),
    ])
    const doc = new jsPDF()
    doc.addFileToVFS('Calibri-normal.ttf', arrayBufferToBase64(normalBuf))
    doc.addFileToVFS('Calibri-bold.ttf', arrayBufferToBase64(boldBuf))
    doc.addFont('Calibri-normal.ttf', PDF_TABLE_FONT, 'normal')
    doc.addFont('Calibri-bold.ttf', PDF_TABLE_FONT, 'bold')
  })().catch(err => {
    fontsReady = null
    throw err
  })
  return fontsReady
}
