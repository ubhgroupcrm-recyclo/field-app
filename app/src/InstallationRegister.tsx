import { useEffect, useState } from 'react'
import { PackageCheck } from 'lucide-react'
import { supabase } from './supabase'

type Panel = {
  id: string
  serial_number: string
  model_type: string | null
  expected_pmax: number | null
  inventory_pallets: { pallet_number: string } | null
}

const PAGE_SIZE = 100

export function InstallationRegister({ projectId }: { projectId: string }) {
  const [panels, setPanels] = useState<Panel[]>([])
  const [panelCount, setPanelCount] = useState(0)
  const [palletCount, setPalletCount] = useState(0)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => { setPage(0) }, [projectId, search])
  useEffect(() => {
    let active = true
    const load = async () => {
      setLoading(true); setMessage('')
      const query = supabase.from('inventory_panels').select('id,serial_number,model_type,expected_pmax,inventory_pallets(pallet_number)', { count: 'exact' }).eq('project_id', projectId).order('serial_number').range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1)
      const filtered = search.trim() ? query.ilike('serial_number', `%${search.trim()}%`) : query
      const [panelResult, palletResult] = await Promise.all([
        filtered,
        supabase.from('inventory_pallets').select('id', { count: 'exact', head: true }).eq('project_id', projectId),
      ])
      if (!active) return
      if (panelResult.error || palletResult.error) setMessage(panelResult.error?.message ?? palletResult.error?.message ?? 'Could not load expected installation inventory.')
      setPanels((panelResult.data ?? []) as unknown as Panel[])
      setPanelCount(panelResult.count ?? 0); setPalletCount(palletResult.count ?? 0); setLoading(false)
    }
    load()
    return () => { active = false }
  }, [projectId, page, search])

  const totalPages = Math.max(1, Math.ceil(panelCount / PAGE_SIZE))
  return <section className="installation-page">
    <div className="page-title"><div><h1>Installation register</h1><p>Definitive expected inventory from the manufacturer panel sheets.</p></div></div>
    <div className="kpi-grid installation-kpis"><article><span>Expected panels</span><b>{panelCount.toLocaleString()}</b></article><article><span>Expected pallets</span><b>{palletCount.toLocaleString()}</b></article><article><span>Installed</span><b>0</b><small>Installation scanning to follow</small></article><article><span>Outstanding</span><b>{panelCount.toLocaleString()}</b><small>All imported panels are currently expected</small></article></div>
    <section className="register-card"><div className="register-head"><div><h2>Expected panels</h2><p>Each row is an expected panel until installation is recorded against that serial number.</p></div><label className="register-search">Search serial<input value={search} onChange={event => setSearch(event.target.value)} placeholder="Panel serial…" /></label></div>
      {message && <p className="form-message">{message}</p>}
      <div className="panel-table-wrap"><table className="panel-table installation-table"><thead><tr><th>Panel serial</th><th>Expected pallet</th><th>Model</th><th>Pmax</th><th>Status</th></tr></thead><tbody>{panels.map(panel => <tr key={panel.id}><td><b>{panel.serial_number}</b></td><td>{panel.inventory_pallets?.pallet_number ?? '—'}</td><td>{panel.model_type ?? '—'}</td><td>{panel.expected_pmax ?? '—'}</td><td><span className="expected-status"><PackageCheck size={14} />Expected</span></td></tr>)}{!loading && !panels.length && <tr><td colSpan={5}><p className="empty">No expected panels match this search.</p></td></tr>}</tbody></table></div>
      <div className="pager"><span>{panelCount ? `${page * PAGE_SIZE + 1}–${Math.min((page + 1) * PAGE_SIZE, panelCount)} of ${panelCount.toLocaleString()}` : 'No panels imported'}</span><span><button className="button" disabled={page === 0} onClick={() => setPage(value => value - 1)}>Previous</button><button className="button" disabled={page + 1 >= totalPages} onClick={() => setPage(value => value + 1)}>Next</button></span></div>
    </section>
  </section>
}
