'use server'

import { requireUser } from '@/lib/auth/requireUser'
import {
  analyzeLegacyImportEmail,
  type ImportPreviewResult,
} from '@/lib/financial-engine'

export type ImportPreviewState = {
  result: ImportPreviewResult | null
  message: string
}

export async function analyzeImportEmailAction(
  _state: ImportPreviewState,
  formData: FormData
): Promise<ImportPreviewState> {
  const emailText = String(formData.get('emailText') || '')
  const { supabase } = await requireUser()

  try {
    return {
      result: await analyzeLegacyImportEmail(supabase, emailText),
      message: '',
    }
  } catch {
    return {
      result: null,
      message: 'No se pudieron cargar las reglas de comercios.',
    }
  }
}
