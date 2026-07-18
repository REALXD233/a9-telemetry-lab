let ffmpegPromise: Promise<import('@ffmpeg/ffmpeg').FFmpeg> | null = null
let progressListener: ((progress: number) => void) | null = null

async function getFfmpeg() {
  if (!ffmpegPromise) {
    ffmpegPromise = Promise.all([
      import('@ffmpeg/ffmpeg'),
      import('@ffmpeg/core?url'),
      import('@ffmpeg/core/wasm?url'),
    ]).then(async ([{ FFmpeg }, coreModule, wasmModule]) => {
      const ffmpeg = new FFmpeg()
      ffmpeg.on('progress', ({ progress }) => progressListener?.(Math.max(0, Math.min(1, progress))))
      await ffmpeg.load({ coreURL: coreModule.default, wasmURL: wasmModule.default })
      return ffmpeg
    }).catch((error) => {
      ffmpegPromise = null
      throw error
    })
  }
  return ffmpegPromise
}

export async function transcodeToBrowserMp4(file: File, onProgress: (progress: number) => void) {
  const [{ fetchFile }, ffmpeg] = await Promise.all([import('@ffmpeg/util'), getFfmpeg()])
  const token = crypto.randomUUID().replace(/-/g, '')
  const inputName = `input-${token}.mp4`
  const outputName = `output-${token}.mp4`
  progressListener = onProgress
  try {
    await ffmpeg.writeFile(inputName, await fetchFile(file))
    const exitCode = await ffmpeg.exec([
      '-i', inputName,
      '-map', '0:v:0', '-map', '0:a?',
      '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '23', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '128k',
      '-movflags', '+faststart',
      outputName,
    ])
    if (exitCode !== 0) throw new Error(`转码器退出代码 ${exitCode}`)
    const output = await ffmpeg.readFile(outputName)
    if (typeof output === 'string') throw new Error('转码器没有返回有效视频数据')
    return new Blob([Uint8Array.from(output)], { type: 'video/mp4' })
  } finally {
    progressListener = null
    await Promise.allSettled([ffmpeg.deleteFile(inputName), ffmpeg.deleteFile(outputName)])
  }
}
