import { createWorker, PSM } from 'tesseract.js'
import { readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

const root = path.resolve(process.argv[2] || 'speed-dataset/source-roi')
const output = path.resolve(process.argv[3] || 'speed-dataset/roi-labels.raw.json')
const stride = Math.max(1, Number(process.argv[4] || 1))
const sampleFps = Math.max(1, Number(process.argv[5] || 10))
const files = (await readdir(root)).filter((name) => name.endsWith('.png')).sort().filter((_, index) => index % stride === 0)
const worker = await createWorker('eng')
await worker.setParameters({
  tessedit_char_whitelist: '0123456789',
  tessedit_pageseg_mode: PSM.SINGLE_LINE,
  preserve_interword_spaces: '0',
})

const rows = []
for (let index = 0; index < files.length; index += 1) {
  const file = files[index]
  const result = await worker.recognize(path.join(root, file))
  const raw = result.data.text.replace(/\D/g, '')
  const matches = raw.match(/\d{1,3}/g) ?? []
  const value = matches.map(Number).filter((number) => number <= 600).at(-1)
  const sourceIndex = Number(file.match(/(\d+)/)?.[1] ?? index + 1) - 1
  rows.push({ file, frame: Math.round(sourceIndex * 30 / sampleFps + 135), videoTime: 4.5 + sourceIndex / sampleFps, raw, value: value ?? null, confidence: result.data.confidence })
  if ((index + 1) % 25 === 0) process.stdout.write(`${index + 1}/${files.length}\n`)
}
await worker.terminate()
await writeFile(output, JSON.stringify(rows, null, 2))
