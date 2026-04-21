#!/usr/bin/env tsx
/**
 * CLI import tool for Park Systems Field Service Excel reports.
 * Core parsing logic lives in lib/excel-parser.ts (also used by the web API).
 *
 * Usage:
 *   npm run import-excel -- --file <path.xlsx> [--dry-run]
 *   npm run import-excel -- --file <path.xlsx> --import [--sheet <name>] [--all]
 *
 * Flags:
 *   --file <path>    Path to .xlsx file (required)
 *   --dry-run        Print JSON preview without writing to DB (default)
 *   --import         Write to Supabase (requires SUPABASE_SERVICE_ROLE_KEY)
 *   --sheet <name>   Process only this sheet
 *   --all            Process all date sheets (default: first 3)
 */

import * as fs from 'fs'
import * as path from 'path'
import * as dotenv from 'dotenv'
import { parseWorkbook, detectTemplate } from '../lib/excel-parser'
import type { ParsedSheet } from '../lib/excel-parser'

dotenv.config({ path: path.join(process.cwd(), '.env.local') })

// ── Card resolution ───────────────────────────────────────────────────────────

async function resolveCard(content: ParsedSheet['content']): Promise<string> {
  const { createClient } = await import('@supabase/supabase-js')
  const url  = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key  = process.env.SUPABASE_SERVICE_ROLE_KEY!
  const admin = createClient(url, key)

  const eq_id    = content.eq_id.trim()
  const customer = content.customer.trim()
  const model    = content.model.trim()

  if (eq_id) {
    const { data } = await admin.from('cards').select('id').eq('eq_id', eq_id).maybeSingle()
    if (data) return data.id
  }
  if (customer && model) {
    const { data } = await admin.from('cards')
      .select('id').eq('customer', customer).eq('model', model).eq('type', 'field_service')
      .maybeSingle()
    if (data) return data.id
  }

  const { data: newCard, error } = await admin.from('cards').insert({
    type:     'field_service',
    customer: customer || 'Unknown',
    model:    model    || 'Unknown',
    sid:      content.sid      || '',
    eq_id:    eq_id            || '',
    location: content.location || '',
  }).select('id').single()

  if (error || !newCard) throw new Error(`Failed to create card: ${error?.message}`)
  return newCard.id
}

// ── Import one sheet ──────────────────────────────────────────────────────────

async function importSheet(parsed: ParsedSheet): Promise<'inserted' | 'skipped'> {
  const { createClient } = await import('@supabase/supabase-js')
  const url  = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key  = process.env.SUPABASE_SERVICE_ROLE_KEY!
  if (!url || !key) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  const admin = createClient(url, key)

  const { data: existing } = await admin.from('documents')
    .select('id').eq('source_meta->>import_hash', parsed.source_meta.import_hash).maybeSingle()
  if (existing) return 'skipped'

  const cardId = await resolveCard(parsed.content)
  const { error } = await admin.from('documents').insert({
    card_id:            cardId,
    report_date:        parsed.report_date,
    is_external:        false,
    parent_document_id: null,
    content:            parsed.content as unknown as Record<string, unknown>,
    source_meta:        parsed.source_meta as unknown as Record<string, unknown>,
  })

  if (error) {
    if (error.code === '23505') return 'skipped'
    throw new Error(`Insert failed: ${error.message}`)
  }
  return 'inserted'
}

// ── CLI ───────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2)

  const fileIdx  = args.indexOf('--file')
  const sheetIdx = args.indexOf('--sheet')
  const fileArg  = fileIdx  >= 0 ? args[fileIdx + 1]  : null
  const sheetArg = sheetIdx >= 0 ? args[sheetIdx + 1] : null
  const dryRun   = !args.includes('--import')
  const processAll = args.includes('--all')

  if (!fileArg) {
    console.error('Usage: npm run import-excel -- --file <path.xlsx> [--dry-run|--import] [--sheet <name>] [--all]')
    process.exit(1)
  }

  const xlsxPath = path.resolve(fileArg)
  if (!fs.existsSync(xlsxPath)) { console.error(`File not found: ${xlsxPath}`); process.exit(1) }

  const fileBuffer = fs.readFileSync(xlsxPath)
  const fileName   = path.basename(xlsxPath)

  console.log(`\n📂  ${fileName}`)
  console.log(`🔧  Mode: ${dryRun ? 'DRY RUN (preview)' : 'IMPORT TO SUPABASE'}`)

  const { parsed, skipped } = await parseWorkbook(fileBuffer, fileName, {
    onlySheet: sheetArg ?? undefined,
    maxSheets: (!sheetArg && !processAll) ? 3 : undefined,
  })

  if (!sheetArg && !processAll) {
    const total = parsed.length + skipped.filter(n => detectTemplate(n) !== null).length
    console.log(`ℹ️   Showing first 3 of ${total} date sheets. Pass --all to process all.\n`)
  }

  console.log(`📋  Sheets: ${parsed.map(p => p.sheet_name).join(', ')}\n`)

  let inserted = 0, skippedCount = 0, errors = 0

  for (const p of parsed) {
    process.stdout.write(`  "${p.sheet_name}" … `)
    try {
      if (dryRun) {
        console.log(`✓ parsed (${p.images_extracted} images)\n`)
        console.log(JSON.stringify(p.content, null, 2))
        console.log('\n  source_meta:', JSON.stringify(p.source_meta))
        console.log('\n' + '─'.repeat(60) + '\n')
      } else {
        const result = await importSheet(p)
        if (result === 'inserted') { inserted++; console.log(`✓ inserted (${p.images_extracted} images)`) }
        else                       { skippedCount++;  console.log('⟳ already exists') }
      }
    } catch (e) {
      errors++
      console.log(`✗ ${(e as Error).message}`)
    }
  }

  if (!dryRun) {
    console.log(`\n✅  Done — inserted: ${inserted}  skipped: ${skippedCount}  errors: ${errors}`)
  }
}

main().catch(e => { console.error('Fatal:', e); process.exit(1) })
