import fs from 'fs'
import path from 'path'

const transcript = 'C:/Users/User/.cursor/projects/c-caramalo-kodespy-app-proyectos/agent-transcripts/b1976ab4-6b90-43a2-bcfa-ad451ddc9afd/b1976ab4-6b90-43a2-bcfa-ad451ddc9afd.jsonl'
const projectRoot = 'c:/caramalo/kodespy/app/proyectos'

function relFromPath(filePath) {
  const norm = filePath.replace(/\\/g, '/')
  const idx = norm.toLowerCase().indexOf('/proyectos/')
  if (idx === -1) return null
  return norm.slice(idx + '/proyectos/'.length)
}

function readIfExists(rel) {
  const full = path.join(projectRoot, rel)
  if (!fs.existsSync(full)) return null
  return fs.readFileSync(full, 'utf8')
}

const files = new Map()
let writes = 0, replaces = 0, skipped = 0

for (const line of fs.readFileSync(transcript, 'utf8').split('\n')) {
  if (!line.trim()) continue
  let event
  try { event = JSON.parse(line) } catch { continue }
  const content = event.message?.content
  if (!Array.isArray(content)) continue
  for (const item of content) {
    if (item.type !== 'tool_use') continue
    const { name, input } = item
    const rel = relFromPath(input?.path ?? '')
    if (!rel || !rel.startsWith('src/')) continue

    if (name === 'Write' && typeof input.contents === 'string') {
      files.set(rel, input.contents)
      writes++
    } else if (name === 'StrReplace' && typeof input.old_string === 'string' && typeof input.new_string === 'string') {
      let current = files.get(rel)
      if (current == null) current = readIfExists(rel)
      if (current == null) { skipped++; continue }
      if (!current.includes(input.old_string)) { skipped++; continue }
      files.set(rel, current.replace(input.old_string, input.new_string))
      replaces++
    }
  }
}

for (const [rel, content] of files) {
  const out = path.join(projectRoot, rel)
  fs.mkdirSync(path.dirname(out), { recursive: true })
  fs.writeFileSync(out, content, 'utf8')
  console.log('saved', rel)
}
console.log({ writes, replaces, skipped, total: files.size })
