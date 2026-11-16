import { ChangeEvent, useEffect, useRef, useState } from 'react'
import { BarcodeFormat, BrowserMultiFormatReader, IScannerControls } from '@zxing/browser'
import { DecodeHintType } from '@zxing/library'

const hints = new Map<DecodeHintType, unknown>([
  [DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.QR_CODE, BarcodeFormat.DATA_MATRIX, BarcodeFormat.CODE_128, BarcodeFormat.CODE_39, BarcodeFormat.CODE_93, BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.ITF]],
  [DecodeHintType.TRY_HARDER, true],
])

export function CameraScanner({ onScan }: { onScan: (code: string) => void }) {
  const video = useRef<HTMLVideoElement>(null)
  const lastCode = useRef('')
  const lastAt = useRef(0)
  const [message, setMessage] = useState('Starting camera…')
  const accept = (raw: string) => {
    const value = raw.trim(); const now = Date.now()
    if (!value || (value === lastCode.current && now - lastAt.current < 1600)) return
    lastCode.current = value; lastAt.current = now
    navigator.vibrate?.(80); setMessage(`Scanned: ${value}`); onScan(value)
  }

  useEffect(() => {
    let controls: IScannerControls | undefined
    let alive = true
    const start = async () => {
      try {
        const reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 100, delayBetweenScanSuccess: 1200 })
        controls = await reader.decodeFromConstraints(
          { audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } } },
          video.current ?? undefined,
          result => { if (alive && result) accept(result.getText()) },
        )
        if (alive) setMessage('Hold the barcode inside the camera view. Move closer if needed.')
      } catch {
        if (alive) setMessage('Camera could not start. Allow camera access in the browser, then reopen this scan step.')
      }
    }
    start()
    return () => { alive = false; controls?.stop() }
  }, [onScan])

  useEffect(() => {
    let buffer = ''
    let lastKeyAt = 0
    const onKey = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return
      const now = Date.now()
      if (now - lastKeyAt > 180) buffer = ''
      lastKeyAt = now
      if (event.key === 'Enter') {
        if (buffer.length >= 3) { event.preventDefault(); accept(buffer); buffer = '' }
        return
      }
      if (event.key.length === 1) buffer += event.key
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onScan])

  const scanPhoto = async (event: ChangeEvent<HTMLInputElement>) => {
    const image = event.target.files?.[0]; if (!image) return
    setMessage('Reading photo…')
    const url = URL.createObjectURL(image)
    try {
      const reader = new BrowserMultiFormatReader(hints)
      const result = await reader.decodeFromImageUrl(url)
      accept(result.getText())
    } catch { setMessage('No readable barcode was found in that photo. Move closer, reduce glare and try again.') } finally { URL.revokeObjectURL(url); event.target.value = '' }
  }

  return <div className="camera-scanner"><video ref={video} autoPlay playsInline muted /><p>{message}</p><label className="scan-photo">Take barcode photo<input type="file" accept="image/*" capture="environment" onChange={scanPhoto} /></label><small>For 1D barcodes, fill most of the frame width and hold the device steady. A paired Bluetooth/USB scanner also works here - configure it as a keyboard with an Enter suffix.</small></div>
}
