import { supabase } from './supabase'
import { STORAGE_BUCKET_CONVENIOS_ADJUNTOS, uploadStorageFile } from './storage'
import { takeConvenioAdendasDraft } from './convenioAdendasDraft'

export async function persistConvenioAdendasDraft(convenioId: string): Promise<void> {
  const drafts = takeConvenioAdendasDraft()
  if (!drafts.length) return

  const { data: session } = await supabase.auth.getUser()
  const rows: Record<string, any>[] = []
  for (const d of drafts) {
    let path: string | null = null
    if (d.archivo instanceof File) {
      path = await uploadStorageFile(
        STORAGE_BUCKET_CONVENIOS_ADJUNTOS,
        `convenios/adendas/${convenioId}`,
        d.archivo,
      )
    } else if (typeof d.archivo === 'string' && d.archivo.trim()) {
      path = d.archivo.trim()
    }
    const row: Record<string, any> = {
      convenio_id: convenioId,
      numero: d.numero,
      fecha: d.fecha,
      archivo_firmado: path,
    }
    if (session.user) row.created_by = session.user.id
    rows.push(row)
  }

  const { error } = await supabase.from('convenio_adendas').insert(rows)
  if (error) {
    throw new Error(`Convenio creado, pero no se pudieron guardar las adendas: ${error.message}`)
  }
}
