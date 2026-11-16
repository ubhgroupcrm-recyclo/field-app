import { useEffect, useState } from 'react'
import { ChevronDown, PackageCheck, Truck } from 'lucide-react'
import { supabase } from './supabase'

type Delivery = { id: string; order_number: string; proforma_reference: string | null; expected_pallets: number; expected_modules: number | null; wattage_breakdown: string; qr_token: string; status: string }
type InventoryPallet = { id: string; pallet_number: string; model_type: string | null; expected_panel_count: number }
type InventoryPanel = { id: string; serial_number: string; model_type: string | null; expected_isc: number | null; expected_voc: number | null; expected_pmax: number | null }

function Empty({ text }: { text: string }) { return <p className="empty">{text}</p> }

function Collapsible({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  return <section className="accordion">
    <button className="accordion-head" onClick={() => setOpen(value => !value)} aria-expanded={open}>
      <span className="accordion-title">{icon}{title}</span>
      <span className="expand">{open ? 'Collapse' : 'Expand'}<ChevronDown size={17} className={open ? 'up' : ''} /></span>
    </button>
    {open && <div className="accordion-content">{children}</div>}
  </section>
}

export function DeliveryPlan({ projectId, isAdmin }: { projectId: string; isAdmin: boolean }) {
  const [deliveries, setDeliveries] = useState<Delivery[]>([])
  const [inventoryPallets, setInventoryPallets] = useState<InventoryPallet[]>([])
  const [inventoryPanelCount, setInventoryPanelCount] = useState(0)
  const [selectedPallet, setSelectedPallet] = useState<InventoryPallet>()
  const [inventoryPanels, setInventoryPanels] = useState<InventoryPanel[]>([])
  const [palletSearch, setPalletSearch] = useState('')
  const [message, setMessage] = useState('')
  const [uploading, setUploading] = useState(false)

  const load = async () => {
    const [deliveriesResult, palletsResult, panelsResult] = await Promise.all([
      supabase.from('deliveries').select('*').eq('project_id', projectId).order('order_number'),
      supabase.from('inventory_pallets').select('id,pallet_number,model_type,expected_panel_count').eq('project_id', projectId).order('pallet_number'),
      supabase.from('inventory_panels').select('id', { count: 'exact', head: true }).eq('project_id', projectId),
    ])
    if (deliveriesResult.error || palletsResult.error || panelsResult.error) setMessage(deliveriesResult.error?.message ?? palletsResult.error?.message ?? panelsResult.error?.message ?? 'Could not load delivery data.')
    setDeliveries((deliveriesResult.data ?? []) as Delivery[])
    setInventoryPallets((palletsResult.data ?? []) as InventoryPallet[])
    setInventoryPanelCount(panelsResult.count ?? 0)
  }
  useEffect(() => { load() }, [projectId])

  const upload = async (file?: File) => {
    if (!file) return
    setUploading(true); setMessage('')
    try {
      const XLSX = await import('xlsx')
      const book = XLSX.read(await file.arrayBuffer(), { type: 'array' })
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(book.Sheets[book.SheetNames[0]], { defval: '' })
      const data = rows.map(row => ({
        project_id: projectId,
        order_number: String(row['Order nr'] ?? row['Order number'] ?? '').replace(/\.0$/, ''),
        proforma_reference: String(row['Profor File'] ?? row['Proforma'] ?? '') || null,
        expected_pallets: Number(row['Pallets'] ?? 0),
        expected_modules: Number(row['Modules per container'] ?? 0) || null,
        gross_weight_kg: Number(row['Gross weight'] ?? 0) || null,
        wattage_breakdown: String(row['Wattage'] ?? ''),
      })).filter(row => row.order_number && row.expected_pallets)
      if (!data.length) throw new Error('No delivery rows were found. Use the supplied delivery workbook or CSV.')
      const { error } = await supabase.from('deliveries').upsert(data, { onConflict: 'project_id,order_number' })
      if (error) throw error
      setMessage(`${data.length} delivery records imported.`); load()
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not import the delivery plan.') } finally { setUploading(false) }
  }
  const print = async (delivery: Delivery) => {
    const QRCode = (await import('qrcode')).default
    const qr = await QRCode.toDataURL(`rayet-delivery:${delivery.id}:${delivery.qr_token}`, { width: 460, margin: 2 })
    const win = window.open('', '_blank')
    if (!win) return setMessage('Allow pop-ups to print a delivery QR label.')
    win.document.title = `Rayet delivery ${delivery.order_number}`
    win.document.body.innerHTML = `<main style="font-family:Arial,sans-serif;text-align:center;padding:28px"><h1>Rayet · Shoals Hook</h1><h2>Delivery ${delivery.order_number}</h2><p>Scan when the vehicle arrives at Compound Delivery Bay.</p><img src="${qr}" alt="Delivery QR code"><p>Pallet labels remain optional; this label identifies the delivery.</p><button onclick="window.print()" style="padding:12px 18px;border:0;border-radius:8px;background:#123a36;color:#fff;font-weight:700;cursor:pointer">Print label</button></main>`
  }
  const openPallet = async (pallet: InventoryPallet) => {
    setSelectedPallet(pallet)
    const { data, error } = await supabase.from('inventory_panels').select('id,serial_number,model_type,expected_isc,expected_voc,expected_pmax').eq('pallet_id', pallet.id).order('serial_number')
    if (error) setMessage(error.message)
    setInventoryPanels((data ?? []) as InventoryPanel[])
  }
  const planPallets = deliveries.reduce((sum, item) => sum + item.expected_pallets, 0)
  const planModules = deliveries.reduce((sum, item) => sum + (item.expected_modules ?? 0), 0)
  const palletVariance = inventoryPallets.length - planPallets
  const panelVariance = inventoryPanelCount - planModules
  const filteredPallets = inventoryPallets.filter(item => item.pallet_number.toLowerCase().includes(palletSearch.toLowerCase()))
  const variance = (value: number) => value === 0 ? 'Matches delivery plan' : `${value > 0 ? '+' : ''}${value} versus plan`

  return <section className="delivery-page">
    <div className="page-title"><div><h1>Delivery plan</h1><p>Expected deliveries, pallet volumes and printable delivery QR labels.</p></div></div>
    <div className="kpi-grid delivery-kpis">
      <article><span>Planned deliveries</span><b>{deliveries.length}</b></article>
      <article><span>Plan pallets</span><b>{planPallets.toLocaleString()}</b></article>
      <article><span>Expected pallets</span><b>{inventoryPallets.length.toLocaleString()}</b><small className={palletVariance === 0 ? 'variance ok' : 'variance'}>{variance(palletVariance)}</small></article>
      <article><span>Plan modules</span><b>{planModules.toLocaleString()}</b></article>
      <article><span>Expected panels</span><b>{inventoryPanelCount.toLocaleString()}</b><small className={panelVariance === 0 ? 'variance ok' : 'variance'}>{variance(panelVariance)}</small></article>
      <article><span>Checked in complete</span><b>{deliveries.filter(item => item.status === 'complete').length}</b></article>
    </div>
    {isAdmin && <section className="upload-card"><div><h2>Upload delivery plan</h2><p>Import the delivery workbook or a CSV. Re-importing updates matching order numbers.</p></div><label className="button primary file-button">{uploading ? 'Importing…' : 'Upload delivery plan'}<input type="file" accept=".xlsx,.xls,.csv" disabled={uploading} onChange={event => upload(event.target.files?.[0])} /></label></section>}
    {message && <p className="form-message">{message}</p>}
    <Collapsible title={`Deliveries (${deliveries.length} planned)`} icon={<Truck size={20} />}>
      <div className="delivery-table-wrap"><table className="delivery-table"><thead><tr><th>Order</th><th>Proforma</th><th>Pallets</th><th>Modules</th><th>Wattage</th><th /></tr></thead><tbody>{deliveries.length ? deliveries.map(item => <tr key={item.id}><td><b>{item.order_number}</b></td><td>{item.proforma_reference ?? '—'}</td><td>{item.expected_pallets}</td><td>{item.expected_modules ?? '—'}</td><td>{item.wattage_breakdown || '—'}</td><td><button className="button qr-button" onClick={() => print(item)}>Print QR</button></td></tr>) : <tr><td colSpan={6}><Empty text="No delivery plan has been imported for this project." /></td></tr>}</tbody></table></div>
    </Collapsible>
    <Collapsible title="Expected inventory" icon={<PackageCheck size={20} />}>
      <div className="inventory-head"><p className="muted">Manufacturer baseline: unique pallet serials and expected panel serials.</p><input value={palletSearch} onChange={event => setPalletSearch(event.target.value)} placeholder="Search pallet serial…" /></div>
      <div className="inventory-layout"><div className="inventory-pallets">{filteredPallets.map(item => <button className={selectedPallet?.id === item.id ? 'inventory-pallet active' : 'inventory-pallet'} key={item.id} onClick={() => openPallet(item)}><b>{item.pallet_number}</b><small>{item.model_type || 'Model not recorded'} · {item.expected_panel_count} panels</small></button>)}{!filteredPallets.length && <Empty text="No inventory pallets found for this project." />}</div><div className="inventory-panels">{selectedPallet ? <><h3>{selectedPallet.pallet_number}</h3><p className="muted">{inventoryPanels.length} expected panels</p><div className="panel-table-wrap"><table className="panel-table"><thead><tr><th>Panel serial</th><th>Model</th><th>Pmax</th><th>Voc</th><th>Isc</th></tr></thead><tbody>{inventoryPanels.map(item => <tr key={item.id}><td>{item.serial_number}</td><td>{item.model_type ?? '—'}</td><td>{item.expected_pmax ?? '—'}</td><td>{item.expected_voc ?? '—'}</td><td>{item.expected_isc ?? '—'}</td></tr>)}</tbody></table></div></> : <Empty text="Choose a pallet to reveal its expected panel serials and factory values." />}</div></div>
    </Collapsible>
  </section>
}
