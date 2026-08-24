import { useEffect, useRef, useState } from 'react'
import { transcriptA } from '../samples/transcriptA.ts'
import {
  clearCompletedDraft,
  formatTranscriptForPaste,
  isAcceptedAudio,
  parsePastedTranscript,
  saveCompletedDraft,
  startDemoUpload,
} from '../lib/reviewDraft.ts'
import type { Speaker } from '../types/types.ts'

export default function ReviewIntakePage({ onNavigate }: { onNavigate: (path: string) => void }) {
  const [mode, setMode] = useState<'paste' | 'upload'>('paste')
  const [pasteValue, setPasteValue] = useState('')
  const [salesSpeaker, setSalesSpeaker] = useState<Speaker>('sales')
  const [error, setError] = useState('')
  const [progress, setProgress] = useState<number | null>(null)
  const [fileName, setFileName] = useState('')
  const [fileInputKey, setFileInputKey] = useState(0)
  const cancelUpload = useRef<null | (() => void)>(null)

  useEffect(() => () => cancelUpload.current?.(), [])

  function chooseMode(next: 'paste' | 'upload') {
    cancelUpload.current?.()
    cancelUpload.current = null
    setProgress(null)
    setFileName('')
    setFileInputKey((key) => key + 1)
    setError('')
    clearCompletedDraft(sessionStorage)
    setMode(next)
  }

  function submitPaste() {
    try {
      const transcript = parsePastedTranscript(pasteValue, salesSpeaker)
      saveCompletedDraft(sessionStorage, { transcript, source: 'paste', salesSpeaker, createdAt: Date.now() })
      onNavigate('/reviews/details')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '逐字稿解析失败')
    }
  }

  function handleFile(file: File | undefined) {
    cancelUpload.current?.()
    clearCompletedDraft(sessionStorage)
    setError('')
    setProgress(null)
    if (!file) return
    if (!isAcceptedAudio(file)) {
      setError('请选择 MP3、M4A、WAV、AAC 或 OGG 音频文件')
      setFileInputKey((key) => key + 1)
      return
    }
    setFileName(file.name)
    setProgress(0)
    cancelUpload.current = startDemoUpload(setProgress, (transcript) => {
      saveCompletedDraft(sessionStorage, { transcript, source: 'upload-demo', salesSpeaker, createdAt: Date.now() })
      cancelUpload.current = null
    })
  }

  function cancel() {
    cancelUpload.current?.()
    cancelUpload.current = null
    setProgress(null)
    setFileName('')
    setFileInputKey((key) => key + 1)
    clearCompletedDraft(sessionStorage)
  }

  return (
    <section aria-labelledby="page-title" className="mx-auto max-w-4xl">
      <p className="text-sm font-bold tracking-[0.16em] text-emerald-700">拜访后复盘</p>
      <h1 id="page-title" className="mt-2 text-3xl font-black tracking-tight md:text-4xl">添加逐字稿</h1>
      <p className="mt-3 text-sm leading-6 text-slate-500">可直接粘贴已转好的文字，或使用音频上传演示。音频仅模拟转写，不会发送到真实 ASR。</p>

      <div className="mt-7 grid grid-cols-2 gap-3" role="tablist" aria-label="逐字稿录入方式">
        <button type="button" role="tab" aria-selected={mode === 'paste'} onClick={() => chooseMode('paste')} className={`rounded-xl px-4 py-3 text-sm font-black ${mode === 'paste' ? 'bg-emerald-700 text-white' : 'bg-white text-slate-600'}`}>粘贴文字记录</button>
        <button type="button" role="tab" aria-selected={mode === 'upload'} onClick={() => chooseMode('upload')} className={`rounded-xl px-4 py-3 text-sm font-black ${mode === 'upload' ? 'bg-emerald-700 text-white' : 'bg-white text-slate-600'}`}>上传音频</button>
      </div>

      <label className="mt-5 block rounded-2xl border border-slate-200 bg-white p-5 text-sm font-semibold text-slate-700">逐字稿里的说话人标签
        <select value={salesSpeaker} onChange={(event) => { setSalesSpeaker(event.target.value as Speaker); clearCompletedDraft(sessionStorage) }} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
          <option value="sales">“销售”标签代表销售方（推荐）</option>
          <option value="customer">“客户”标签代表销售方</option>
        </select>
        <p className="mt-2 text-xs font-normal leading-5 text-slate-500">请选择逐字稿中哪一个说话人标签代表销售。这会决定后续评分时“销售发言”与“客户发言”如何归类。</p>
      </label>

      {mode === 'paste' ? (
        <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><h2 className="font-black">粘贴逐字稿</h2><p className="mt-1 text-xs text-slate-500">每行格式：[开始秒-结束秒] 销售：内容</p></div>
            <button type="button" onClick={() => { setPasteValue(formatTranscriptForPaste(transcriptA)); setError('') }} className="rounded-lg bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800">填入样例 A</button>
          </div>
          <label className="mt-4 block text-sm font-semibold">文字记录
            <textarea value={pasteValue} onChange={(event) => { setPasteValue(event.target.value); setError(''); clearCompletedDraft(sessionStorage) }} rows={12} placeholder="[0-4.2] 销售：王总您好……" className="mt-2 w-full resize-y rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-sm outline-none focus:border-emerald-600" />
          </label>
          <button type="button" onClick={submitPaste} className="mt-4 w-full rounded-xl bg-slate-900 px-5 py-3.5 text-sm font-black text-white">解析并进入下一步</button>
        </div>
      ) : (
        <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="font-black">上传音频（Demo 模拟）</h2>
          <p className="mt-2 text-sm leading-6 text-amber-800">选择文件后仅展示模拟进度，完成时返回预置样例 A，不代表已做真实语音识别。</p>
          <label className="mt-4 block rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm font-bold text-slate-700">选择音频文件
            <input key={fileInputKey} type="file" accept="audio/*,.mp3,.m4a,.wav,.aac,.ogg" onChange={(event) => handleFile(event.target.files?.[0])} className="mt-3 block w-full text-xs" />
          </label>
          {progress !== null && (
            <div className="mt-5" role="status" aria-live="polite">
              <div className="flex justify-between text-sm"><span>{progress < 100 ? `正在模拟转写：${fileName}` : '模拟转写已完成'}</span><strong>{progress}%</strong></div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-emerald-600 transition-all" style={{ width: `${progress}%` }} /></div>
              {progress < 100 ? <button type="button" onClick={cancel} className="mt-4 rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold">取消上传</button>
                : <button type="button" onClick={() => onNavigate('/reviews/details')} className="mt-4 w-full rounded-xl bg-slate-900 px-5 py-3 text-sm font-black text-white">进入下一步</button>}
            </div>
          )}
        </div>
      )}
      {error && <p role="alert" className="mt-4 rounded-xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">{error}</p>}
    </section>
  )
}
