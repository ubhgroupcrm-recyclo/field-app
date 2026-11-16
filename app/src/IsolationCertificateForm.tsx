import { PointerEvent, useEffect, useRef, useState } from 'react'
import { RotateCcw } from 'lucide-react'
import { supabase } from './supabase'

type Person = { id: string; display_name: string }

export function SignaturePad({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const [signed, setSigned] = useState(Boolean(value))
  const point = (event: PointerEvent<HTMLCanvasElement>) => {
    const target = canvas.current!
    const rect = target.getBoundingClientRect()
    return { x: (event.clientX - rect.left) * (target.width / rect.width), y: (event.clientY - rect.top) * (target.height / rect.height) }
  }
  const begin = (event: PointerEvent<HTMLCanvasElement>) => {
    const target = canvas.current; if (!target) return
    event.preventDefault(); target.setPointerCapture(event.pointerId); drawing.current = true
    const ctx = target.getContext('2d')!; const p = point(event)
    ctx.beginPath(); ctx.moveTo(p.x, p.y)
  }
  const draw = (event: PointerEvent<HTMLCanvasElement>) => {
    const target = canvas.current; if (!target || !drawing.current) return
    const ctx = target.getContext('2d')!; const p = point(event)
    ctx.lineTo(p.x, p.y); ctx.stroke()
  }
  const end = () => {
    if (!drawing.current || !canvas.current) return
    drawing.current = false; setSigned(true); onChange(canvas.current.toDataURL('image/png'))
  }
  const clear = () => {
    const target = canvas.current; if (!target) return
    target.getContext('2d')!.clearRect(0, 0, target.width, target.height); setSigned(false); onChange('')
  }
  useEffect(() => {
    const target = canvas.current; if (!target) return
    const ctx = target.getContext('2d')!; ctx.strokeStyle = '#123a36'; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.lineJoin = 'round'
  }, [])
  return <div className="signature-pad"><div className="signature-label"><span>{label}</span><button type="button" className="text-button" onClick={clear} disabled={!signed}><RotateCcw size={14} />Clear</button></div><canvas ref={canvas} width="720" height="190" aria-label={label} onPointerDown={begin} onPointerMove={draw} onPointerUp={end} onPointerCancel={end} /><small>{signed ? 'Signature captured' : 'Sign in the box using touch or mouse.'}</small></div>
}

export function IsolationCertificateForm({ projectId, cancel, created }: { projectId: string; cancel: () => void; created: (reference: string) => void }) {
  const [reference, setReference] = useState(`ISO-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${Date.now().toString().slice(-4)}`)
  const [equipment, setEquipment] = useState({ plant: '', equipment: '', affected: '', workOrder: '' })
  const [requirements, setRequirements] = useState({ switchroom: false, panel: false, rack: false })
  const [isolations, setIsolations] = useState({ fuses_removed: false, isolator_off: false, mcb_off: false, racked_out: false, padlocks_fitted: false, tags_fitted: false })
  const [authorisedPeople, setAuthorisedPeople] = useState<Person[]>([])
  const [competentPeople, setCompetentPeople] = useState<Person[]>([])
  const [authorisedPerson, setAuthorisedPerson] = useState('')
  const [competentPerson, setCompetentPerson] = useState('')
  const [authorisedSignature, setAuthorisedSignature] = useState('')
  const [competentSignature, setCompetentSignature] = useState('')
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const loadPeople = async () => {
      const { data: roleRows, error: roleError } = await supabase.from('project_member_roles').select('user_id,role').eq('project_id', projectId).in('role', ['authorised_person', 'competent_person'])
      if (roleError) return setMessage(roleError.message)
      const ids = [...new Set((roleRows ?? []).map(row => row.user_id))]
      if (!ids.length) { setAuthorisedPeople([]); setCompetentPeople([]); return }
      const { data: profiles, error: profileError } = await supabase.from('profiles').select('id,display_name').in('id', ids).order('display_name')
      if (profileError) return setMessage(profileError.message)
      const names = new Map((profiles ?? []).map(person => [person.id, person.display_name]))
      const people = (role: string) => (roleRows ?? []).filter(row => row.role === role).map(row => ({ id: row.user_id, display_name: names.get(row.user_id) ?? 'Unnamed user' }))
      setAuthorisedPeople(people('authorised_person')); setCompetentPeople(people('competent_person'))
    }
    loadPeople()
  }, [projectId])

  const selectedName = (people: Person[], id: string) => people.find(person => person.id === id)?.display_name ?? ''
  const toggleRequirement = (key: keyof typeof requirements) => setRequirements(current => ({ ...current, [key]: !current[key] }))
  const toggleIsolation = (key: keyof typeof isolations) => setIsolations(current => ({ ...current, [key]: !current[key] }))
  const save = async () => {
    const handoverName = selectedName(authorisedPeople, authorisedPerson)
    const proveName = selectedName(competentPeople, competentPerson)
    if (!reference || !equipment.plant || !equipment.equipment || !handoverName || !authorisedSignature || !proveName || !competentSignature) return setMessage('Complete the certificate reference, equipment details, AP/CP selections and both signatures.')
    setSaving(true); const user = (await supabase.auth.getUser()).data.user
    if (!user) { setSaving(false); return setMessage('Your session has expired. Sign in again.') }
    const now = new Date().toISOString()
    const { error } = await supabase.from('isolation_certificates').insert({ project_id: projectId, certificate_reference: reference, equipment_details: equipment, requirements, isolations, handover_name: handoverName, handover_signature: authorisedSignature, handover_at: now, prove_dead_name: proveName, prove_dead_signature: competentSignature, prove_dead_at: now, created_by: user.id })
    setSaving(false); if (error) return setMessage(error.message); created(reference)
  }
  const checks = <T extends Record<string, boolean>>(items: [keyof T, string][], values: T, toggle: (key: keyof T) => void) => <div className="check-grid">{items.map(([key, label]) => <label key={String(key)}><input type="checkbox" checked={values[key]} onChange={() => toggle(key)} /><span>{label}</span></label>)}</div>
  return <div className="certificate-form"><p className="kicker">ELECTRICAL ISOLATION CERTIFICATE</p><h2>Create certificate</h2>
    <div className="certificate-grid"><label>Certificate reference<input value={reference} onChange={event => setReference(event.target.value)} /></label><label>Work order<input value={equipment.workOrder} onChange={event => setEquipment(current => ({ ...current, workOrder: event.target.value }))} /></label><label>Plant / location<input value={equipment.plant} onChange={event => setEquipment(current => ({ ...current, plant: event.target.value }))} /></label><label>Equipment to isolate<input value={equipment.equipment} onChange={event => setEquipment(current => ({ ...current, equipment: event.target.value }))} /></label><label className="wide">Other equipment affected<input value={equipment.affected} onChange={event => setEquipment(current => ({ ...current, affected: event.target.value }))} /></label></div>
    <h3>Isolation requirement</h3>{checks([['switchroom', 'Switch-room'], ['panel', 'Panel / cubicle'], ['rack', 'Rack']], requirements, toggleRequirement)}
    <h3>Details of isolation</h3>{checks([['fuses_removed', 'Fuses removed'], ['isolator_off', 'Isolator off'], ['mcb_off', 'MCB off'], ['racked_out', 'Racked out'], ['padlocks_fitted', 'Padlocks fitted'], ['tags_fitted', 'Tags fitted']], isolations, toggleIsolation)}
    <h3>Authorisation and prove-dead test</h3><div className="certificate-grid"><label>Authorised Person (AP)<select value={authorisedPerson} onChange={event => setAuthorisedPerson(event.target.value)}><option value="">Select AP…</option>{authorisedPeople.map(person => <option value={person.id} key={person.id}>{person.display_name}</option>)}</select></label><label>Competent Person (CP)<select value={competentPerson} onChange={event => setCompetentPerson(event.target.value)}><option value="">Select CP…</option>{competentPeople.map(person => <option value={person.id} key={person.id}>{person.display_name}</option>)}</select></label></div>
    {!authorisedPeople.length || !competentPeople.length ? <p className="certificate-warning">Assign at least one AP and one CP in Admin → People & project roles before creating a certificate.</p> : null}
    <div className="signature-grid"><SignaturePad label="AP signature" value={authorisedSignature} onChange={setAuthorisedSignature} /><SignaturePad label="CP signature" value={competentSignature} onChange={setCompetentSignature} /></div>
    {message && <p className="error">{message}</p>}<div className="certificate-actions"><button type="button" className="button" onClick={cancel}>Cancel</button><button type="button" className="button primary" disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save certificate'}</button></div>
  </div>
}
