import { ChangeEvent, useEffect, useState } from 'react'
import { CameraScanner } from './CameraScanner'
import { supabase } from './supabase'

type Workflow = 'delivery' | 'install' | 'removal' | 'recycling'
type Location = { id: string; name: string }
type Combiner = { id: string; field_number: number; box_code: string }

export function FieldWorkflow({ type, projectId, profileId, close, onSaved }: { type: Workflow; projectId: string; profileId: string; close: () => void; onSaved?: (code: string) => void }) {
  const [code, setCode] = useState('')
  const [step, setStep] = useState(1)
  const [locations, setLocations] = useState<Location[]>([])
  const [boxes, setBoxes] = useState<Combiner[]>([])
  const [location, setLocation] = useState('')
  const [box, setBox] = useState('')
  const [outcome, setOutcome] = useState<'passed' | 'failed'>('passed')
  const [notes, setNotes] = useState('')
  const [photo, setPhoto] = useState<File>()
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const isDelivery = type === 'delivery'
  const isInstall = type === 'install'

  useEffect(() => {
    if (!isDelivery && !isInstall) return
    const load = async () => {
      const [locationResult, boxResult] = await Promise.all([
        supabase.from('site_locations').select('id,name').eq('project_id', projectId).eq('location_type', isDelivery ? 'compound_delivery_in' : 'field_storage_in').order('field_number'),
        supabase.from('combiner_boxes').select('id,field_number,box_code').eq('project_id', projectId).order('field_number').order('box_code'),
      ])
      setLocations((locationResult.data ?? []) as Location[]); setBoxes((boxResult.data ?? []) as Combiner[])
      if (locationResult.error || boxResult.error) setMessage(locationResult.error?.message ?? boxResult.error?.message ?? 'Could not load site locations.')
    }
    load()
  }, [projectId, isDelivery, isInstall])

  const capturePhoto = (event: ChangeEvent<HTMLInputElement>) => setPhoto(event.target.files?.[0])
  const uploadPhoto = async () => {
    if (!photo) return null
    const extension = photo.name.split('.').pop() || 'jpg'
    const path = `${projectId}/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.${extension}`
    const { error } = await supabase.storage.from('project-evidence').upload(path, photo, { contentType: photo.type, upsert: false })
    if (error) throw error
    return path
  }
  const save = async () => {
    if (!code || !location) return setMessage('Scan the pallet and choose its destination.')
    if (isInstall && !box) return setMessage('Choose the assigned combiner box.')
    setSaving(true); setMessage('')
    try {
      const photoPath = await uploadPhoto()
      const inspectionType = isDelivery ? 'delivery_receipt' : 'installation'
      const eventType = isDelivery ? 'delivery_compound_in' : 'field_storage_in'
      const eventNotes = [isInstall ? `Assigned combiner: ${boxes.find(item => item.id === box)?.box_code}` : '', notes].filter(Boolean).join(' · ')
      const { error: eventError } = await supabase.from('asset_movements').insert({ project_id: projectId, asset_kind: 'pallet', asset_code: code, event_type: eventType, location_id: location, inspection_status: outcome, notes: eventNotes || null, recorded_by: profileId })
      if (eventError) throw eventError
      const { error: inspectionError } = await supabase.from('inspections').insert({ project_id: projectId, asset_kind: 'pallet', asset_code: code, inspection_type: inspectionType, outcome, notes: notes || null, photo_path: photoPath, location_id: location, recorded_by: profileId })
      if (inspectionError) throw inspectionError
      setStep(3)
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not save this field record.') } finally { setSaving(false) }
  }
  const titles: Record<Workflow, string> = { delivery: 'Receive delivery', install: 'Move pallet to field storage', removal: 'Remove panel', recycling: 'Recycle at Compound' }
  if (!isDelivery && !isInstall) return <div className="modal-backdrop"><section className="workflow-modal"><button className="close" onClick={close}>Close</button><p className="kicker">FIELD WORKFLOW</p><h2>{titles[type]}</h2><p>This workflow is being connected to the shared removal/recycling register next. Use the Removal register for now so scanned panels are recorded against the correct custody workflow.</p><button className="button primary" onClick={close}>Close</button></section></div>
  return <div className="modal-backdrop"><section className="workflow-modal"><button className="close" onClick={close}>Close</button><p className="kicker">{isDelivery ? 'DELIVERY CHECK-IN' : 'PALLET MOVEMENT'} · STEP {step} OF 3</p>{step === 1 && <><h2>{titles[type]}</h2><p>{isDelivery ? 'Scan the pallet barcode or delivery QR at Compound Delivery Bay.' : 'Scan the pallet barcode before it leaves Compound for field storage.'}</p><CameraScanner onScan={value => { setCode(value); setStep(2) }} /></>}{step === 2 && <><h2>Inspect and record</h2><p>Scanned pallet: <b>{code}</b></p><label>Destination<select value={location} onChange={event => setLocation(event.target.value)}><option value="">Select destination…</option>{locations.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>{isInstall && <label>Assigned combiner box<select value={box} onChange={event => setBox(event.target.value)}><option value="">Select combiner box…</option>{boxes.map(item => <option value={item.id} key={item.id}>Field {item.field_number} · {item.box_code}</option>)}</select></label>}<label>Visual inspection<select value={outcome} onChange={event => setOutcome(event.target.value as 'passed' | 'failed')}><option value="passed">Passed</option><option value="failed">Failed / damaged</option></select></label><label>Photo evidence <input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={capturePhoto} /></label><label>Notes (optional)<input value={notes} onChange={event => setNotes(event.target.value)} placeholder="Describe any visible issue" /></label><button className="button primary" disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save record'}</button></>}{step === 3 && <><h2>Saved</h2><p>{isDelivery ? 'Next: complete the formal pallet delivery inspection.' : 'The pallet movement, inspection and assigned combiner have been recorded.'}</p><button className="button primary" onClick={() => onSaved?.(code) ?? close()}>{isDelivery ? 'Start delivery inspection' : 'Finish'}</button></>}{message && <p className="error">{message}</p>}</section></div>
}
