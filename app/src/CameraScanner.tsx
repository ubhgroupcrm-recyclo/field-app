import { useEffect, useRef, useState } from 'react'
import { BrowserMultiFormatReader, IScannerControls } from '@zxing/browser'

export function CameraScanner({ onScan }: { onScan: (code: string) => void }) {
  const video = useRef<HTMLVideoElement>(null)
  const lastCode = useRef('')
  const lastAt = useRef(0)
  const [message, setMessage] = useState('Starting camera…')

  useEffect(() => {
    let controls: IScannerControls | undefined
    let alive = true
    const start = async () => {
      try {
        const reader = new BrowserMultiFormatReader(undefined, { delayBetweenScanAttempts: 180 })
        controls = await reader.decodeFromConstraints(
          { audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } } },
          video.current ?? undefined,
          (result) => {
            if (!alive || !result) return
            const value = result.getText().trim()
            const now = Date.now()
            if (!value || (value === lastCode.current && now - lastAt.current < 1600)) return
            lastCode.current = value; lastAt.current = now
            navigator.vibrate?.(80)
            setMessage(`Scanned: ${value}`)
            onScan(value)
          },
        )
        if (alive) setMessage('Point the camera at the barcode or QR code.')
      } catch (error) {
        if (alive) setMessage('Camera could not start. Allow camera access in the browser, then reopen this scan step.')
      }
    }
    start()
    return () => { alive = false; controls?.stop() }
  }, [onScan])

  return <div className="camera-scanner"><video ref={video} autoPlay playsInline muted /><p>{message}</p><small>Use the device camera. A Bluetooth barcode scanner may also be used for faster bulk scans.</small></div>
}
