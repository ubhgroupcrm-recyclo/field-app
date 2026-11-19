import { FormEvent, ReactNode, useEffect, useRef, useState } from 'react'
import { Barcode, BarChart3, Boxes, ChevronDown, LogOut, PackageCheck, PackageX, Recycle, ScanLine, ShieldCheck, Truck, UsersRound, Wrench } from 'lucide-react'
import { supabase, Profile, Project } from './supabase'
import { DeliveryPlan } from './DeliveryPlan'
import { IsolationCertificateForm } from './IsolationCertificateForm'
import { CameraScanner } from './CameraScanner'
import { InstallationRegister } from './InstallationRegister'
import { FieldWorkflow } from './FieldWorkflow'
import { ChecklistWorkflow } from './ChecklistWorkflow'

type Membership = { project_id: string; projects: Project }
type Location = { id: string; name: string; location_type: string; field_number: number | null }
type Combiner = { id: string; field_number: number; box_code: string }
type Delivery = { id: string; order_number: string; proforma_reference: string | null; expected_pallets: number; expected_modules: number | null; wattage_breakdown: string; qr_token: string; status: string }
type IsolationCertificate = { id: string; certificate_reference: string; created_at: string }
type InventoryPallet = { id: string; pallet_number: string; model_type: string | null; expected_panel_count: number }
type InventoryPanel = { id: string; serial_number: string; model_type: string | null; expected_isc: number | null; expected_voc: number | null; expected_pmax: number | null; expected_vpm: number | null; expected_ipm: number | null; expected_ff: number | null }
type View = 'admin' | 'delivery' | 'removal' | 'installation' | 'reporting'
function sortLocations(locations: Location[]) {
  const order: Record<string, number> = { compound_delivery_in: 0, compound_damaged_area: 1, compound_recycling_out: 2, field_storage_in: 0, field_damaged_area: 1, field_storage_out: 2 }
  return [...locations].sort((a, b) => (a.field_number ?? -1) - (b.field_number ?? -1) || order[a.location_type] - order[b.location_type])
}

const nav: { id: View; label: string; icon: typeof Wrench }[] = [
  { id: 'admin', label: 'Admin', icon: Wrench },
  { id: 'delivery', label: 'Delivery', icon: Truck },
  { id: 'removal', label: 'Removal', icon: Barcode },
  { id: 'installation', label: 'Installation', icon: PackageCheck },
  { id: 'reporting', label: 'Reporting', icon: BarChart3 },
]

function initials(name: string) { return name.split(/s+/).map(x => x[0]).join('').slice(0, 2).toUpperCase() }

export function App() {
  const fieldMode = location.pathname.startsWith('/field')
  const [sessionReady, setSessionReady] = useState(false)
  const [userId, setUserId] = useState<string>()
  const [profile, setProfile] = useState<Profile>()
  const [memberships, setMemberships] = useState<Membership[]>([])
  const [projectId, setProjectId] = useState(localStorage.getItem('rayet-project-id') ?? '')

  useEffect(() => {
    let active = true
    const load = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!active) return
      if (!session) { setSessionReady(true); return }
      const [p, m] = await Promise.all([
        supabase.from('profiles').select('id,display_name,role').eq('id', session.user.id).single(),
        supabase.from('project_members').select('project_id,projects(id,name,company)').eq('user_id', session.user.id),
      ])
      if (!active) return
      setUserId(session.user.id)
      setProfile(p.data as Profile | undefined)
      const rows = (m.data ?? []).filter(x => x.projects).map(x => ({
        project_id: x.project_id,
        projects: Array.isArray(x.projects) ? x.projects[0] : x.projects,
      })).filter(x => x.projects) as Membership[]
      setMemberships(rows)
      const selected = rows.some(x => x.project_id === projectId) ? projectId : rows[0]?.project_id ?? ''
      setProjectId(selected); if (selected) localStorage.setItem('rayet-project-id', selected)
      setSessionReady(true)
    }
    load()
    const { data: listener } = supabase.auth.onAuthStateChange(() => load())
    return () => { active = false; listener.subscription.unsubscribe() }
  }, [])

  const project = memberships.find(x => x.project_id === projectId)?.projects
  const chooseProject = (id: string) => { setProjectId(id); localStorage.setItem('rayet-project-id', id) }
  if (!sessionReady) return <div className="loading">Loading Rayet…</div>
  if (!userId) return <SignIn />
  if (!project) return <NoProject onSignOut={() => supabase.auth.signOut()} />
  return fieldMode
    ? <FieldApp profile={profile!} project={project} projectId={projectId} onSignOut={() => supabase.auth.signOut()} />
    : <AdminApp profile={profile!} project={project} memberships={memberships} projectId={projectId} onProject={chooseProject} onSignOut={() => supabase.auth.signOut()} />
}

function SignIn() {
  const [email, setEmail] = useState(''), [pin, setPin] = useState(''), [error, setError] = useState('')
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setError('')
    if (!/^\d{4}$/.test(pin)) return setError('Enter your four-digit PIN.')
    const { error } = await supabase.auth.signInWithPassword({ email, password: `PT-${pin}` })
    if (error) setError('Sign-in failed. Check your work email and PIN.')
  }
  return <main className="auth"><section className="auth-card"><Brand /><h1>Sign in</h1><p>Use your work email and four-digit PIN.</p><form onSubmit={submit}><label>Work email<input type="email" value={email} onChange={e => setEmail(e.target.value)} required /></label><label>Four-digit PIN<input type="password" inputMode="numeric" maxLength={4} value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, ''))} required /></label>{error && <p className="error">{error}</p>}<button className="button primary">Sign in</button></form></section></main>
}

function NoProject({ onSignOut }: { onSignOut: () => void }) {
  return <main className="auth"><section className="auth-card"><Brand /><h1>No project access</h1><p>Your account is active but is not assigned to a project. Ask a Rayet administrator to assign you.</p><button className="button" onClick={onSignOut}>Sign out</button></section></main>
}

function Brand() { return <div className="brand"><span className="brand-mark">R</span><span>Rayet<small>Shoals Hook</small></span></div> }

function AppHeader({ profile, project, memberships, onProject, onManageProjects, onSignOut, field }: { profile: Profile; project: Project; memberships?: Membership[]; onProject?: (id: string) => void; onManageProjects?: () => void; onSignOut: () => void; field?: boolean }) {
  return <header className="header"><Brand /><div className="header-right">{memberships && <label className="project-select">Project<select value={project.id} onChange={e => onProject?.(e.target.value)}>{memberships.map(x => <option value={x.project_id} key={x.project_id}>{x.projects.name}</option>)}</select></label>}{onManageProjects && <button className="button manage-projects" onClick={onManageProjects}>Manage projects</button>} {field && <span className="project-badge">{project.name}</span>}<span className="user-chip" title={profile.display_name}><span>{initials(profile.display_name)}</span>{profile.display_name}</span><button className="button signout" onClick={onSignOut}><LogOut size={16} />Sign out</button></div></header>
}

function AdminApp({ profile, project, memberships, projectId, onProject, onSignOut }: { profile: Profile; project: Project; memberships: Membership[]; projectId: string; onProject: (id: string) => void; onSignOut: () => void }) {
  const [view, setView] = useState<View>('admin')
  const [managingProjects, setManagingProjects] = useState(false)
  const isAdmin = profile.role === 'admin'
  return <main className="shell"><AppHeader profile={profile} project={project} memberships={memberships} onProject={onProject} onManageProjects={isAdmin ? () => setManagingProjects(true) : undefined} onSignOut={onSignOut} /><nav className="nav">{nav.map(item => <button key={item.id} className={view === item.id ? 'active' : ''} onClick={() => setView(item.id)}><item.icon size={18} />{item.label}</button>)}</nav>{view === 'admin' ? <AdminHome projectId={projectId} projectName={project.name} isAdmin={isAdmin} /> : view === 'delivery' ? <DeliveryPlan projectId={projectId} isAdmin={isAdmin} /> : view === 'removal' ? <RemovalHub projectId={projectId} profile={profile} /> : view === 'installation' ? <InstallationRegister projectId={projectId} /> : <RegisterPlaceholder view={view} />}{managingProjects && <div className="modal-backdrop"><section className="scan-modal projects-modal"><button className="close" onClick={() => setManagingProjects(false)}>Close</button><h2>Manage projects</h2><p>Add a project or edit its details. The project selector controls which project you are administering.</p><ProjectsManager currentProjectId={projectId} canManage={isAdmin} /></section></div>}</main>
}

function Accordion({ title, icon, children, defaultOpen = false }: { title: string; icon: ReactNode; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  return <section className="accordion"><button className="accordion-head" onClick={() => setOpen(!open)} aria-expanded={open}><span className="accordion-title">{icon}{title}</span><span className="expand">{open ? 'Collapse' : 'Expand'}<ChevronDown size={17} className={open ? 'up' : ''} /></span></button>{open && <div className="accordion-content">{children}</div>}</section>
}

function AdminHome({ projectId, projectName, isAdmin }: { projectId: string; projectName: string; isAdmin: boolean }) {
  const [locations, setLocations] = useState<Location[]>([]), [boxes, setBoxes] = useState<Combiner[]>([])
  const [field, setField] = useState('1'), [code, setCode] = useState(''), [message, setMessage] = useState('')
  const refresh = async () => { const [l, b] = await Promise.all([supabase.from('site_locations').select('*').eq('project_id', projectId).order('name'), supabase.from('combiner_boxes').select('*').eq('project_id', projectId).order('field_number').order('box_code')]); setLocations(sortLocations((l.data ?? []) as Location[])); setBoxes(b.data ?? []) }
  useEffect(() => { refresh() }, [projectId])
  const add = async () => { if (!code.trim()) return setMessage('Enter a combiner box code.'); const { error } = await supabase.from('combiner_boxes').insert({ project_id: projectId, field_number: Number(field), box_code: code.trim() }); setMessage(error ? error.message : 'Combiner box added.'); if (!error) { setCode(''); refresh() } }
  return <div className="admin-page">
    <div className="page-title"><div><h1>{projectName}</h1><p>Project configuration, access and operational control.</p></div></div>
    <Accordion title="Operational locations & combiner boxes" icon={<Boxes size={20} />}><div className="operational-config"><section className="combiner-config"><h3>Add combiner box</h3>{isAdmin ? <><div className="form-line"><select value={field} onChange={e => setField(e.target.value)}>{[1,2,3,4,5,6].map(x => <option key={x} value={x}>Field {x}</option>)}</select><input value={code} placeholder="e.g. CB-F1-001" onChange={e => setCode(e.target.value)} /><button className="button primary" onClick={add}>Add</button></div>{message && <p className="form-message">{message}</p>}</> : <p className="muted">Only a Rayet Administrator can add project configuration.</p>}{boxes.length > 0 && <div className="combiner-list">{boxes.map(b => <span className="pill" key={b.id}>Field {b.field_number} · {b.box_code}</span>)}</div>}</section><section><h3>Locations</h3><div className="location-list">{locations.length ? locations.map(l => <LocationCard key={l.id} location={l} />) : <Empty text="Run the operator events migration to create the project locations." />}</div></section></div></Accordion>
    <Accordion title="People & project roles" icon={<UsersRound size={20} />}><AccessManager projectId={projectId} projectName={projectName} canManage={isAdmin} /></Accordion>
  </div>
}

function ProjectsManager({ currentProjectId, canManage }: { currentProjectId: string; canManage: boolean }) {
  const [projects, setProjects] = useState<Project[]>([])
  const [form, setForm] = useState({ name: '', manager: '', email: '', mobile: '', address: '', w3w: '' })
  const [message, setMessage] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const load = async () => { const { data, error } = await supabase.from('projects').select('*').order('name'); if (error) setMessage(error.message); setProjects((data ?? []) as Project[]) }
  useEffect(() => { load() }, [])
  const set = (key: keyof typeof form, value: string) => setForm(current => ({ ...current, [key]: value }))
  const save = async () => {
    if (!form.name.trim()) return setMessage('Enter a project name.')
    const code = form.name.toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '')
    const values = {
      company: 'Rayet', name: form.name.trim(), code,
      project_manager_name: form.manager.trim() || null, project_manager_email: form.email.trim() || null,
      project_manager_mobile: form.mobile.trim() || null, project_address: form.address.trim() || null, what3words: form.w3w.trim() || null,
    }
    const { data, error } = editingId
      ? await supabase.from('projects').update(values).eq('id', editingId).select().single()
      : await supabase.from('projects').insert(values).select().single()
    if (error) return setMessage(error.message)
    if (data && !editingId) await supabase.from('project_members').upsert({ project_id: data.id, user_id: (await supabase.auth.getUser()).data.user?.id, role: 'admin' })
    setForm({ name: '', manager: '', email: '', mobile: '', address: '', w3w: '' }); setEditingId(null); setShowForm(false); setMessage(editingId ? 'Project details updated.' : 'Project created and assigned to you. Refresh the project selector to switch to it.'); load()
  }
  const addProject = () => { setEditingId(null); setForm({ name: '', manager: '', email: '', mobile: '', address: '', w3w: '' }); setShowForm(open => !open) }
  const editProject = (p: Project) => { setEditingId(p.id); setForm({ name: p.name, manager: p.project_manager_name ?? '', email: p.project_manager_email ?? '', mobile: p.project_manager_mobile ?? '', address: p.project_address ?? '', w3w: p.what3words ?? '' }); setShowForm(true) }
  return <div className="projects-manager">
    {canManage && <><button className="button primary" onClick={addProject}>{showForm ? 'Cancel' : 'Add project'}</button>{showForm && <div className="project-form"><div className="project-form-grid"><label>Project name<input value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Shoals Hook" /></label><label>Project manager name<input value={form.manager} onChange={e => set('manager', e.target.value)} /></label><label>Project manager email<input type="email" value={form.email} onChange={e => set('email', e.target.value)} /></label><label>Project manager mobile<input type="tel" value={form.mobile} onChange={e => set('mobile', e.target.value)} /></label><label className="wide">Project address<textarea value={form.address} onChange={e => set('address', e.target.value)} /></label><label>what3words<input value={form.w3w} onChange={e => set('w3w', e.target.value)} placeholder="///word.word.word" /></label></div><button className="button primary" onClick={save}>Save project</button></div>}</>}
    {message && <p className="form-message">{message}</p>}
    <div className="project-list">{projects.map(p => <article className={p.id === currentProjectId ? 'project-row current-project' : 'project-row'} key={p.id}><div><b>{p.name}</b><small>{p.project_manager_name ? p.project_manager_name + (p.project_manager_email ? ' · ' + p.project_manager_email : '') : 'No project manager recorded'}</small></div><span className="project-actions">{p.id === currentProjectId && <span className="pill">Current project</span>}{canManage && <button className="text-button" onClick={() => editProject(p)}>Edit</button>}</span></article>)}</div>
  </div>
}

const projectRoles = [
  { id: 'operative', label: 'Installer / Operative', description: 'Panel and pallet scans, delivery, removal, installation and inspections.' },
  { id: 'telehandler_operator', label: 'Telehandler Operator', description: 'Telehandler checklist only.' },
  { id: 'authorised_person', label: 'Authorised Person (AP)', description: 'Can create and sign electrical isolation certificates.' },
  { id: 'competent_person', label: 'Competent Person (CP)', description: 'Can complete and sign the prove-dead test.' },
  { id: 'site_manager', label: 'Site Manager', description: 'All field functions and project registers.' },
]

type Staff = { id: string; display_name: string; staff_id: string; role: string }
type Assignment = { user_id: string; role: string }
function AccessManager({ projectId, projectName, canManage }: { projectId: string; projectName: string; canManage: boolean }) {
  const [staff, setStaff] = useState<Staff[]>([]), [members, setMembers] = useState<Assignment[]>([]), [roles, setRoles] = useState<Assignment[]>([])
  const [selected, setSelected] = useState(''), [selectedRoles, setSelectedRoles] = useState<string[]>([]), [globalAdmin, setGlobalAdmin] = useState(false), [resetPin, setResetPin] = useState(''), [resettingPin, setResettingPin] = useState(false), [message, setMessage] = useState(''), [loading, setLoading] = useState(true)
  const [showNewUser, setShowNewUser] = useState(false), [creatingUser, setCreatingUser] = useState(false)
  const [newUser, setNewUser] = useState({ displayName: '', email: '', pin: '', roles: [] as string[], globalAdmin: false })
  const load = async () => {
    setLoading(true); setMessage('')
    const [p, m, r] = await Promise.all([
      supabase.from('profiles').select('id,display_name,staff_id,role').order('display_name'),
      supabase.from('project_members').select('user_id,role').eq('project_id', projectId),
      supabase.from('project_member_roles').select('user_id,role').eq('project_id', projectId),
    ])
    if (p.error || m.error || r.error) setMessage(p.error?.message ?? m.error?.message ?? r.error?.message ?? 'Could not load project access.')
    setStaff((p.data ?? []) as Staff[]); setMembers((m.data ?? []) as Assignment[]); setRoles((r.data ?? []) as Assignment[]); setLoading(false)
  }
  useEffect(() => { load() }, [projectId])
  const projectRolesFor = (id: string) => roles.filter(x => x.user_id === id).map(x => x.role)
  const rolesFor = (id: string) => [...(staff.find(x => x.id === id)?.role === 'admin' ? ['Rayet Administrator'] : []), ...projectRolesFor(id)]
  const select = (id: string) => { setSelected(id); setSelectedRoles(projectRolesFor(id)); setGlobalAdmin(staff.find(x => x.id === id)?.role === 'admin'); setResetPin('') }
  const toggle = (role: string) => setSelectedRoles(current => current.includes(role) ? current.filter(x => x !== role) : [...current, role])
  const toggleNewUserRole = (role: string) => setNewUser(current => ({ ...current, roles: current.roles.includes(role) ? current.roles.filter(item => item !== role) : [...current.roles, role] }))
  const save = async () => {
    if (!selected) return setMessage('Choose a person first.')
    if (!selectedRoles.length) return setMessage('Choose at least one project role.')
    const { error: memberError } = await supabase.from('project_members').upsert({ project_id: projectId, user_id: selected, role: selectedRoles.includes('site_manager') ? 'supervisor' : 'worker' })
    if (memberError) return setMessage(memberError.message)
    const { error: removeError } = await supabase.from('project_member_roles').delete().eq('project_id', projectId).eq('user_id', selected)
    if (removeError) return setMessage(removeError.message)
    const { error: roleError } = await supabase.from('project_member_roles').insert(selectedRoles.map(role => ({ project_id: projectId, user_id: selected, role })))
    if (roleError) return setMessage(roleError.message)
    const { error: adminError } = await supabase.from('profiles').update({ role: globalAdmin ? 'admin' : 'member' }).eq('id', selected)
    setMessage(adminError ? adminError.message : 'Project roles saved.'); if (!adminError) load()
  }
  const remove = async (userId: string) => {
    if (!confirm('Remove this person from the project?')) return
    const { error } = await supabase.from('project_members').delete().eq('project_id', projectId).eq('user_id', userId)
    setMessage(error ? error.message : 'Person removed from this project.'); if (!error) load()
  }
  const resetUserPin = async () => {
    if (!selected) return setMessage('Choose a person first.')
    if (!/^\d{4}$/.test(resetPin)) return setMessage('Enter a four-digit PIN.')
    const name = staff.find(person => person.id === selected)?.display_name ?? 'this person'
    if (!confirm(`Reset ${name}'s PIN? They will sign in using the new four-digit PIN.`)) return
    setResettingPin(true); setMessage('')
    const { error } = await supabase.functions.invoke('reset-user-pin', { body: { userId: selected, pin: resetPin } })
    setResettingPin(false)
    if (error) return setMessage(error.message || 'Could not reset the PIN.')
    setResetPin(''); setMessage(`PIN reset for ${name}.`)
  }
  const createUser = async () => {
    if (!newUser.displayName.trim()) return setMessage('Enter the person’s name.')
    if (!/^\S+@\S+\.\S+$/.test(newUser.email.trim())) return setMessage('Enter a valid work email.')
    if (!/^\d{4}$/.test(newUser.pin)) return setMessage('Enter a four-digit PIN.')
    if (!newUser.roles.length) return setMessage('Choose at least one project role.')
    setCreatingUser(true); setMessage('')
    const { error } = await supabase.functions.invoke('create-project-user', { body: { projectId, displayName: newUser.displayName.trim(), email: newUser.email.trim(), pin: newUser.pin, roles: newUser.roles, globalAdmin: newUser.globalAdmin } })
    setCreatingUser(false)
    if (error) return setMessage(error.message || 'Could not create the user.')
    setNewUser({ displayName: '', email: '', pin: '', roles: [], globalAdmin: false }); setShowNewUser(false); setMessage('User created and assigned to this project.'); load()
  }
  const assigned = members.map(m => ({ staff: staff.find(x => x.id === m.user_id), userId: m.user_id })).filter(x => x.staff)
  return <div className="access-manager">
    <p className="muted">Showing assignments for <b>{projectName}</b>. Roles are assigned per project, so a person can hold different roles on different projects.</p>
    {canManage && <><button className="button primary" onClick={() => { setShowNewUser(open => !open); setMessage('') }}>{showNewUser ? 'Cancel' : 'Add user'}</button>{showNewUser && <div className="new-user-form"><h3>Add user to {projectName}</h3><div className="new-user-fields"><label>Name<input value={newUser.displayName} onChange={event => setNewUser(current => ({ ...current, displayName: event.target.value }))} placeholder="Full name" /></label><label>Work email<input type="email" value={newUser.email} onChange={event => setNewUser(current => ({ ...current, email: event.target.value }))} placeholder="name@company.co.uk" /></label><label>Four-digit PIN<input type="password" inputMode="numeric" maxLength={4} value={newUser.pin} onChange={event => setNewUser(current => ({ ...current, pin: event.target.value.replace(/\D/g, '') }))} placeholder="1234" /></label></div><div className="role-options">{projectRoles.map(role => <label className="role-option" key={role.id}><input type="checkbox" checked={newUser.roles.includes(role.id)} onChange={() => toggleNewUserRole(role.id)} /><span><b>{role.label}</b><small>{role.description}</small></span></label>)}<label className="role-option global-role"><input type="checkbox" checked={newUser.globalAdmin} onChange={event => setNewUser(current => ({ ...current, globalAdmin: event.target.checked }))} /><span><b>Rayet Administrator</b><small>Global access: projects, people, imports and system configuration.</small></span></label></div><button className="button primary" disabled={creatingUser} onClick={createUser}>{creatingUser ? 'Creating…' : 'Create user'}</button></div>}<div className="role-editor">
      <div className="editor-top"><label>Person to assign to {projectName}<select value={selected} onChange={e => select(e.target.value)}><option value="">Select a person…</option>{staff.map(s => <option key={s.id} value={s.id}>{s.display_name}</option>)}</select></label></div>
      <div className="role-options">{projectRoles.map(role => <label className="role-option" key={role.id}><input type="checkbox" checked={selectedRoles.includes(role.id)} onChange={() => toggle(role.id)} /><span><b>{role.label}</b><small>{role.description}</small></span></label>)}<label className="role-option global-role"><input type="checkbox" checked={globalAdmin} onChange={e => setGlobalAdmin(e.target.checked)} /><span><b>Rayet Administrator</b><small>Global access: projects, people, imports and system configuration.</small></span></label></div>
      <button className="button primary" onClick={save}>Save project roles</button>
      {selected && <div className="pin-reset"><b>Reset sign-in PIN</b><small>Sets this person’s app password securely. They will sign in using this four-digit PIN.</small><div><input type="password" inputMode="numeric" maxLength={4} value={resetPin} onChange={event => setResetPin(event.target.value.replace(/\D/g, ''))} placeholder="Four-digit PIN" /><button className="button" disabled={resettingPin} onClick={resetUserPin}>{resettingPin ? 'Resetting…' : 'Reset PIN'}</button></div></div>}
    </div></>}
    {message && <p className="form-message">{message}</p>}
    <div className="assignment-list">{loading ? <Empty text="Loading access…" /> : assigned.length ? assigned.map(({ staff: person, userId }) => <div className="assignment" key={userId}><span className="avatar">{initials(person!.display_name)}</span><span className="assignment-name"><b>{person!.display_name}</b><small>{rolesFor(userId).map(x => projectRoles.find(r => r.id === x)?.label ?? x).join(' · ') || 'No roles assigned'}</small></span>{canManage && <span className="assignment-actions"><button className="text-button" onClick={() => select(userId)}>Edit</button><button className="text-button danger-text" onClick={() => remove(userId)}>Remove</button></span>}</div>) : <Empty text="Nobody is assigned to this project yet." />}</div>
  </div>
}

function LegacyDeliveryPlan({ projectId, isAdmin }: { projectId: string; isAdmin: boolean }) {
  const [deliveries, setDeliveries] = useState<Delivery[]>([]), [inventoryPallets, setInventoryPallets] = useState<InventoryPallet[]>([]), [inventoryPanelCount, setInventoryPanelCount] = useState(0), [selectedPallet, setSelectedPallet] = useState<InventoryPallet>(), [inventoryPanels, setInventoryPanels] = useState<InventoryPanel[]>([]), [palletSearch, setPalletSearch] = useState(''), [message, setMessage] = useState(''), [uploading, setUploading] = useState(false)
  const load = async () => { const [d, p, c] = await Promise.all([supabase.from('deliveries').select('*').eq('project_id', projectId).order('order_number'), supabase.from('inventory_pallets').select('id,pallet_number,model_type,expected_panel_count').eq('project_id', projectId).order('pallet_number'), supabase.from('inventory_panels').select('id', { count: 'exact', head: true }).eq('project_id', projectId)]); if (d.error || p.error || c.error) setMessage(d.error?.message ?? p.error?.message ?? c.error?.message ?? 'Could not load delivery data.'); setDeliveries((d.data ?? []) as Delivery[]); setInventoryPallets((p.data ?? []) as InventoryPallet[]); setInventoryPanelCount(c.count ?? 0) }
  useEffect(() => { load() }, [projectId])
  const upload = async (file?: File) => {
    if (!file) return
    setUploading(true); setMessage('')
    try {
      const XLSX = await import('xlsx')
      const book = XLSX.read(await file.arrayBuffer(), { type: 'array' })
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(book.Sheets[book.SheetNames[0]], { defval: '' })
      const data = rows.map(row => ({ project_id: projectId, order_number: String(row['Order nr'] ?? row['Order number'] ?? '').replace(/\.0$/, ''), proforma_reference: String(row['Profor File'] ?? row['Proforma'] ?? '') || null, expected_pallets: Number(row['Pallets'] ?? 0), expected_modules: Number(row['Modules per container'] ?? 0) || null, gross_weight_kg: Number(row['Gross weight'] ?? 0) || null, wattage_breakdown: String(row['Wattage'] ?? '') })).filter(x => x.order_number && x.expected_pallets)
      if (!data.length) throw new Error('No delivery rows were found. Use the supplied delivery workbook or CSV.')
      const { error } = await supabase.from('deliveries').upsert(data, { onConflict: 'project_id,order_number' })
      if (error) throw error
      setMessage(data.length + ' delivery records imported.'); load()
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not import the delivery plan.') } finally { setUploading(false) }
  }
  const print = async (delivery: Delivery) => {
    const QRCode = (await import('qrcode')).default
    const qr = await QRCode.toDataURL('rayet-delivery:' + delivery.id + ':' + delivery.qr_token, { width: 460, margin: 2 })
    const win = window.open('', '_blank'); if (!win) return setMessage('Allow pop-ups to print a delivery QR label.')
    win.document.title = 'Rayet delivery ' + delivery.order_number
    const page = win.document.createElement('main'); page.style.cssText = 'font-family:Arial,sans-serif;text-align:center;padding:28px'
    page.innerHTML = '<h1>Rayet · Shoals Hook</h1><h2>Delivery ' + delivery.order_number + '</h2><p>Scan when the vehicle arrives at Compound Delivery Bay.</p>'
    const image = win.document.createElement('img'); image.src = qr; image.alt = 'Delivery QR code'; page.append(image)
    const note = win.document.createElement('p'); note.textContent = 'Pallet labels remain optional; this label identifies the delivery.'; page.append(note)
    const printButton = win.document.createElement('button'); printButton.textContent = 'Print label'; printButton.style.cssText = 'display:block;margin:20px auto;padding:12px 18px;border:0;border-radius:8px;background:#123a36;color:#fff;font-weight:700;cursor:pointer'; printButton.onclick = () => win.print(); page.append(printButton)
    win.document.body.append(page)
  }
  const openPallet = async (pallet: InventoryPallet) => { setSelectedPallet(pallet); const { data, error } = await supabase.from('inventory_panels').select('id,serial_number,model_type,expected_isc,expected_voc,expected_pmax,expected_vpm,expected_ipm,expected_ff').eq('pallet_id', pallet.id).order('serial_number'); if (error) setMessage(error.message); setInventoryPanels((data ?? []) as InventoryPanel[]) }
  const pallets = deliveries.reduce((sum, delivery) => sum + delivery.expected_pallets, 0)
  const modules = deliveries.reduce((sum, delivery) => sum + (delivery.expected_modules ?? 0), 0)
  const complete = deliveries.filter(delivery => delivery.status === 'complete').length
  const palletVariance = inventoryPallets.length - pallets
  const panelVariance = inventoryPanelCount - modules
  const filteredPallets = inventoryPallets.filter(pallet => pallet.pallet_number.toLowerCase().includes(palletSearch.toLowerCase()))
  return <section className="delivery-page"><div className="page-title"><div><h1>Delivery plan</h1><p>Expected deliveries, pallet volumes and printable delivery QR labels.</p></div></div><div className="kpi-grid delivery-kpis"><article><span>Planned deliveries</span><b>{deliveries.length}</b></article><article><span>Plan pallets</span><b>{pallets.toLocaleString()}</b></article><article><span>Expected pallets</span><b>{inventoryPallets.length.toLocaleString()}</b><small className={palletVariance === 0 ? 'variance ok' : 'variance'}>{palletVariance === 0 ? 'Matches delivery plan' : (palletVariance > 0 ? '+' : '') + palletVariance + ' versus plan'}</small></article><article><span>Plan modules</span><b>{modules.toLocaleString()}</b></article><article><span>Expected panels</span><b>{inventoryPanelCount.toLocaleString()}</b><small className={panelVariance === 0 ? 'variance ok' : 'variance'}>{panelVariance === 0 ? 'Matches delivery plan' : (panelVariance > 0 ? '+' : '') + panelVariance + ' versus plan'}</small></article><article><span>Checked in complete</span><b>{complete}</b></article></div>{isAdmin && <section className="upload-card"><div><h2>Upload delivery plan</h2><p>Import the delivery workbook or a CSV. Re-importing updates matching order numbers.</p></div><label className="button primary file-button">{uploading ? 'Importing…' : 'Upload delivery plan'}<input type="file" accept=".xlsx,.xls,.csv" disabled={uploading} onChange={e => upload(e.target.files?.[0])} /></label></section>}{message && <p className="form-message">{message}</p>}<section className="register-card"><div className="register-head"><h2>Deliveries</h2><span>{deliveries.length} planned</span></div><div className="delivery-table-wrap"><table className="delivery-table"><thead><tr><th>Order</th><th>Proforma</th><th>Pallets</th><th>Modules</th><th>Wattage</th><th></th></tr></thead><tbody>{deliveries.length ? deliveries.map(d => <tr key={d.id}><td><b>{d.order_number}</b></td><td>{d.proforma_reference ?? '—'}</td><td>{d.expected_pallets}</td><td>{d.expected_modules ?? '—'}</td><td>{d.wattage_breakdown || '—'}</td><td><button className="button qr-button" onClick={() => print(d)}>Print QR</button></td></tr>) : <tr><td colSpan={6}><Empty text="No delivery plan has been imported for this project." /></td></tr>}</tbody></table></div></section><Accordion title="Expected inventory" icon={<PackageCheck size={20} />}><div className="inventory-head"><p className="muted">Manufacturer baseline: unique pallet serials and expected panel serials.</p><input value={palletSearch} onChange={e => setPalletSearch(e.target.value)} placeholder="Search pallet serial…" /></div><div className="inventory-layout"><div className="inventory-pallets">{filteredPallets.map(pallet => <button className={selectedPallet?.id === pallet.id ? 'inventory-pallet active' : 'inventory-pallet'} key={pallet.id} onClick={() => openPallet(pallet)}><b>{pallet.pallet_number}</b><small>{pallet.model_type || 'Model not recorded'} · {pallet.expected_panel_count} panels</small></button>)}{!filteredPallets.length && <Empty text="No inventory pallets found for this project." />}</div><div className="inventory-panels">{selectedPallet ? <><h3>{selectedPallet.pallet_number}</h3><p className="muted">{inventoryPanels.length} expected panels</p><div className="panel-table-wrap"><table className="panel-table"><thead><tr><th>Panel serial</th><th>Model</th><th>Pmax</th><th>Voc</th><th>Isc</th></tr></thead><tbody>{inventoryPanels.map(panel => <tr key={panel.id}><td>{panel.serial_number}</td><td>{panel.model_type ?? '—'}</td><td>{panel.expected_pmax ?? '—'}</td><td>{panel.expected_voc ?? '—'}</td><td>{panel.expected_isc ?? '—'}</td></tr>)}</tbody></table></div></> : <Empty text="Choose a pallet to reveal its expected panel serials and factory values." />}</div></div></Accordion></section>
}

function RemovalHub({ projectId, profile }: { projectId: string; profile: Profile }) {
  const [items, setItems] = useState<{ status: string }[]>([]), [loads, setLoads] = useState<{ id: string; load_reference: string; status: string }[]>([]), [roles, setRoles] = useState<string[]>([]), [workflow, setWorkflow] = useState<'removal' | 'load'>(), [refresh, setRefresh] = useState(0)
  useEffect(() => {
    Promise.all([supabase.from('removal_items').select('status').eq('project_id', projectId), supabase.from('recycling_loads').select('id,load_reference,status').eq('project_id', projectId).order('created_at', { ascending: false }), supabase.from('project_member_roles').select('role').eq('project_id', projectId).eq('user_id', profile.id)]).then(([i, l, r]) => { setItems(i.data ?? []); setLoads(l.data ?? []); setRoles((r.data ?? []).map(x => x.role)) })
  }, [projectId, profile.id, refresh])
  const canStart = profile.role === 'admin' || roles.includes('site_manager')
  const removed = items.filter(x => x.status === 'removed').length, compound = items.filter(x => x.status === 'loaded').length, delivered = items.filter(x => x.status === 'recycled').length
  const arrive = async (load: { id: string; load_reference: string }) => {
    if (!confirm('Record arrival of pallet ' + load.load_reference + ' at SRS — Swanscombe?')) return
    const { error } = await supabase.from('recycling_loads').update({ status: 'delivered', delivered_at: new Date().toISOString() }).eq('id', load.id)
    if (!error) await supabase.from('removal_items').update({ status: 'recycled' }).eq('recycling_load_id', load.id)
    setRefresh(x => x + 1)
  }
  return <section className="removal-page"><div className="page-title"><div><h1>Removal</h1><p>Track panel removal, compound handling and delivery to SRS — Swanscombe.</p></div>{canStart && <div className="page-actions"><button className="button primary" onClick={() => setWorkflow('removal')}>Add removal</button><button className="button" onClick={() => setWorkflow('load')}>Add recycling load</button></div>}</div><div className="kpi-grid removal-kpis"><article><span>Removed</span><b>{removed.toLocaleString()}</b></article><article><span>In Compound</span><b>{compound.toLocaleString()}</b></article><article><span>Delivered to SRS</span><b>{delivered.toLocaleString()}</b></article></div><section className="register-card"><div className="register-head"><h2>Recycling loads</h2><span>{loads.length} loads</span></div>{loads.length ? <div className="load-list">{loads.map(load => <div className="load-row" key={load.id}><span><b>{load.load_reference}</b><small>{load.status === 'delivered' ? 'Delivered to SRS — Swanscombe' : 'In Compound / awaiting SRS arrival'}</small></span>{canStart && load.status === 'collected' && <button className="button qr-button" onClick={() => arrive(load)}>Record SRS arrival</button>}</div>)}</div> : <p className="muted">No recycling loads created yet.</p>}</section>{workflow && <RemovalWorkflow type={workflow} projectId={projectId} close={() => setWorkflow(undefined)} saved={() => setRefresh(x => x + 1)} />}</section>
}
function LegacyCameraScanner({ onScan }: { onScan: (code: string) => void }) {
  const video = useRef<HTMLVideoElement>(null), [message, setMessage] = useState('Opening camera…')
  useEffect(() => {
    let stream: MediaStream | undefined, active = true, timer = 0
    const start = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } } })
        if (!video.current) return; video.current.srcObject = stream
        const Detector = (window as any).BarcodeDetector
        if (!Detector) return setMessage('Camera preview is ready. This browser needs a connected barcode scanner to detect labels.')
        const detector = new Detector({ formats: ['qr_code', 'code_128', 'code_39', 'ean_13', 'data_matrix'] })
        const loop = async () => { if (!active || !video.current) return; const codes = await detector.detect(video.current).catch(() => []); if (codes[0]) onScan(codes[0].rawValue); timer = window.setTimeout(loop, 400) }; loop()
      } catch { setMessage('Camera access was not available. Check browser camera permissions.') }
    }; start()
    return () => { active = false; window.clearTimeout(timer); stream?.getTracks().forEach(track => track.stop()) }
  }, [onScan])
  return <div className="camera-scanner"><video ref={video} autoPlay playsInline /><p>{message}</p></div>
}
function RemovalWorkflow({ type, projectId, close, saved }: { type: 'removal' | 'load'; projectId: string; close: () => void; saved: () => void }) {
  const removal = type === 'removal'
  const [step, setStep] = useState(1), [isolation, setIsolation] = useState(''), [location, setLocation] = useState(''), [locations, setLocations] = useState<Location[]>([]), [certificates, setCertificates] = useState<IsolationCertificate[]>([]), [creatingCertificate, setCreatingCertificate] = useState(false), [codes, setCodes] = useState<string[]>([]), [pallet, setPallet] = useState(''), [message, setMessage] = useState(''), [saving, setSaving] = useState(false)
  const loadCertificates = () => supabase.from('isolation_certificates').select('id,certificate_reference,created_at').eq('project_id', projectId).order('created_at', { ascending: false }).then(({ data }) => setCertificates((data ?? []) as IsolationCertificate[]))
  useEffect(() => { if (removal) { supabase.from('site_locations').select('*').eq('project_id', projectId).eq('location_type', 'field_storage_out').order('field_number').then(({ data }) => setLocations((data ?? []) as Location[])); loadCertificates() } }, [projectId, removal])
  const addCode = (code: string) => setCodes(current => current.includes(code) ? current : [...current, code])
  const saveRemoval = async () => {
    if (!isolation.trim() || !location || !codes.length) return setMessage('Complete the isolation reference, location and panel scans.')
    setSaving(true); const user = (await supabase.auth.getUser()).data.user
    if (!user) { setSaving(false); return setMessage('Your session has expired. Sign in again.') }
    const rows = codes.map(serial_or_barcode => ({ project_id: projectId, serial_or_barcode, isolation_confirmed: true, isolation_reference: isolation.trim(), status: 'removed', removed_by: user.id }))
    const { error: removalError } = await supabase.from('removal_items').insert(rows)
    if (removalError) { setSaving(false); return setMessage(removalError.message) }
    const { error: eventError } = await supabase.from('asset_movements').insert(codes.map(asset_code => ({ project_id: projectId, asset_kind: 'panel', asset_code, event_type: 'removal', location_id: location, inspection_status: 'not_required', notes: 'Isolation certificate: ' + isolation.trim(), recorded_by: user.id })))
    setSaving(false); if (eventError) return setMessage('Removal saved, but movement evidence failed: ' + eventError.message)
    saved(); close()
  }
  const saveLoad = async () => {
    if (!pallet || !codes.length) return setMessage('Scan the pallet QR and at least one panel.')
    setSaving(true); const user = (await supabase.auth.getUser()).data.user
    if (!user) { setSaving(false); return setMessage('Your session has expired. Sign in again.') }
    const { data: existing, error: existingError } = await supabase.from('removal_items').select('id,serial_or_barcode').eq('project_id', projectId).in('serial_or_barcode', codes)
    if (existingError || (existing ?? []).length !== codes.length) { setSaving(false); return setMessage('Every scanned panel must already be recorded as removed before it can be loaded.') }
    const { data: load, error: loadError } = await supabase.from('recycling_loads').insert({ project_id: projectId, load_reference: pallet, status: 'collected', collected_at: new Date().toISOString(), created_by: user.id }).select().single()
    if (loadError || !load) { setSaving(false); return setMessage(loadError?.message ?? 'Could not create the recycling load.') }
    const { error: itemsError } = await supabase.from('removal_items').update({ status: 'loaded', recycling_load_id: load.id }).in('id', existing!.map(x => x.id))
    if (itemsError) { setSaving(false); return setMessage(itemsError.message) }
    const { error: eventsError } = await supabase.from('asset_movements').insert(codes.map(asset_code => ({ project_id: projectId, asset_kind: 'panel', asset_code, event_type: 'compound_recycling_in', parent_pallet_code: pallet, inspection_status: 'not_required', notes: 'Recycling pallet: ' + pallet, recorded_by: user.id })))
    setSaving(false); if (eventsError) return setMessage('Load saved, but movement evidence failed: ' + eventsError.message)
    saved(); close()
  }
  if (!removal) return <div className="modal-backdrop"><section className="workflow-modal"><button className="close" onClick={close}>Close</button><p className="kicker">RECYCLING LOAD WORKFLOW · STEP {step} OF 3</p>{step === 1 && <><h2>Scan recycling pallet QR</h2><p>Scan the pre-printed QR label attached to the sealed pallet.</p><CameraScanner onScan={code => { setPallet(code); setStep(2) }} /></>}{step === 2 && <><h2>Scan panels into pallet</h2><p>Pallet: <b>{pallet}</b></p><CameraScanner onScan={addCode} /><div className="scan-count">{codes.length} panel{codes.length === 1 ? '' : 's'} scanned</div><button className="button primary" disabled={!codes.length} onClick={() => setStep(3)}>Seal pallet</button></>}{step === 3 && <><h2>Seal and dispatch</h2><p><b>{codes.length}</b> panels will be assigned to pallet <b>{pallet}</b> and marked In Compound / collected for SRS — Swanscombe.</p><div className="scanned-list">{codes.map(code => <span className="pill" key={code}>{code}</span>)}</div><button className="button primary" disabled={saving} onClick={saveLoad}>{saving ? 'Saving…' : 'Seal recycling pallet'}</button></>}{message && <p className="error">{message}</p>}</section></div>
  return <div className="modal-backdrop"><section className="workflow-modal"><button className="close" onClick={close}>Close</button>{creatingCertificate ? <IsolationCertificateForm projectId={projectId} cancel={() => setCreatingCertificate(false)} created={reference => { setIsolation(reference); setCreatingCertificate(false); loadCertificates() }} /> : <><p className="kicker">REMOVAL WORKFLOW · STEP {step} OF 3</p>{step === 1 && <><h2>Isolation and destination</h2><p>Select a completed, signed electrical isolation certificate before scanning panels.</p><label>Isolation certificate<select value={isolation} onChange={e => setIsolation(e.target.value)}><option value="">Select certificate…</option>{certificates.map(c => <option key={c.id} value={c.certificate_reference}>{c.certificate_reference}</option>)}</select></label><button className="text-button" onClick={() => setCreatingCertificate(true)}>Create isolation certificate</button><label>Field Storage – Recycling<select value={location} onChange={e => setLocation(e.target.value)}><option value="">Select location…</option>{locations.map(l => <option value={l.id} key={l.id}>{l.name}</option>)}</select></label><button className="button primary" onClick={() => isolation && location ? setStep(2) : setMessage('Select a certificate and location.')}>Start panel scans</button></>}{step === 2 && <><h2>Scan removed panels</h2><p>Scan each panel barcode. Do not type serial numbers manually.</p><CameraScanner onScan={addCode} /><div className="scan-count">{codes.length} panel{codes.length === 1 ? '' : 's'} scanned</div><button className="button primary" disabled={!codes.length} onClick={() => setStep(3)}>Review removal</button></>}{step === 3 && <><h2>Review and save</h2><p><b>{codes.length}</b> panels will be recorded at the selected recycling storage location.</p><div className="scanned-list">{codes.map(code => <span className="pill" key={code}>{code}</span>)}</div><button className="button primary" disabled={saving} onClick={saveRemoval}>{saving ? 'Saving…' : 'Save removal batch'}</button></>}{message && <p className="error">{message}</p>}</>}</section></div>
}
function LegacyIsolationCertificateForm({ projectId, cancel, created }: { projectId: string; cancel: () => void; created: (reference: string) => void }) {
  const [reference, setReference] = useState('ISO-' + new Date().toISOString().slice(0, 10).replaceAll('-', '') + '-' + Date.now().toString().slice(-4))
  const [equipment, setEquipment] = useState({ plant: '', equipment: '', affected: '', workOrder: '' })
  const [requirements, setRequirements] = useState({ switchroom: false, panel: false, rack: false })
  const [isolations, setIsolations] = useState({ fuses_removed: false, isolator_off: false, mcb_off: false, racked_out: false, padlocks_fitted: false, tags_fitted: false })
  const [handoverName, setHandoverName] = useState(''), [handoverSignature, setHandoverSignature] = useState(''), [proveName, setProveName] = useState(''), [proveSignature, setProveSignature] = useState(''), [message, setMessage] = useState(''), [saving, setSaving] = useState(false)
  const toggleRequirement = (key: keyof typeof requirements) => setRequirements(current => ({ ...current, [key]: !current[key] }))
  const toggleIsolation = (key: keyof typeof isolations) => setIsolations(current => ({ ...current, [key]: !current[key] }))
  const save = async () => {
    if (!reference || !equipment.plant || !equipment.equipment || !handoverName || !handoverSignature || !proveName || !proveSignature) return setMessage('Complete the certificate reference, equipment details and both signatures.')
    setSaving(true); const user = (await supabase.auth.getUser()).data.user
    if (!user) { setSaving(false); return setMessage('Your session has expired. Sign in again.') }
    const now = new Date().toISOString()
    const { error } = await supabase.from('isolation_certificates').insert({ project_id: projectId, certificate_reference: reference, equipment_details: equipment, requirements, isolations, handover_name: handoverName, handover_signature: handoverSignature, handover_at: now, prove_dead_name: proveName, prove_dead_signature: proveSignature, prove_dead_at: now, created_by: user.id })
    setSaving(false); if (error) return setMessage(error.message); created(reference)
  }
  return <div className="certificate-form"><p className="kicker">ELECTRICAL ISOLATION CERTIFICATE</p><h2>Create certificate</h2><div className="certificate-grid"><label>Certificate reference<input value={reference} onChange={e => setReference(e.target.value)} /></label><label>Work order<input value={equipment.workOrder} onChange={e => setEquipment(x => ({ ...x, workOrder: e.target.value }))} /></label><label>Plant / location<input value={equipment.plant} onChange={e => setEquipment(x => ({ ...x, plant: e.target.value }))} /></label><label>Equipment to isolate<input value={equipment.equipment} onChange={e => setEquipment(x => ({ ...x, equipment: e.target.value }))} /></label><label className="wide">Other equipment affected<input value={equipment.affected} onChange={e => setEquipment(x => ({ ...x, affected: e.target.value }))} /></label></div><h3>Isolation requirement</h3><div className="check-grid">{([['switchroom','Switch-room'],['panel','Panel / cubicle'],['rack','Rack']] as [keyof typeof requirements,string][]).map(([key,label]) => <label key={key}><input type="checkbox" checked={requirements[key]} onChange={() => toggleRequirement(key)} />{label}</label>)}</div><h3>Details of isolation</h3><div className="check-grid">{([['fuses_removed','Fuses removed'],['isolator_off','Isolator off'],['mcb_off','MCB off'],['racked_out','Racked out'],['padlocks_fitted','Padlocks fitted'],['tags_fitted','Tags fitted']] as [keyof typeof isolations,string][]).map(([key,label]) => <label key={key}><input type="checkbox" checked={isolations[key]} onChange={() => toggleIsolation(key)} />{label}</label>)}</div><h3>Authorisation and prove-dead test</h3><div className="certificate-grid"><label>Electrically Authorised Person<input value={handoverName} onChange={e => setHandoverName(e.target.value)} /></label><label>Typed signature<input value={handoverSignature} onChange={e => setHandoverSignature(e.target.value)} /></label><label>Electrically Competent Person<input value={proveName} onChange={e => setProveName(e.target.value)} /></label><label>Typed signature<input value={proveSignature} onChange={e => setProveSignature(e.target.value)} /></label></div>{message && <p className="error">{message}</p>}<div className="certificate-actions"><button className="button" onClick={cancel}>Cancel</button><button className="button primary" disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save certificate'}</button></div></div>
}

function RegisterPlaceholder({ view }: { view: View }) { const names = { delivery: 'Delivery register', removal: 'Removal register', installation: 'Installation register', reporting: 'Reporting', admin: 'Admin' }; return <section className="placeholder"><h1>{names[view]}</h1><p>Reporting will be added once the operational capture workflows have been signed off.</p></section> }
function Empty({ text }: { text: string }) { return <p className="empty">{text}</p> }
function LocationCard({ location }: { location: Location }) {
  const type = location.location_type
  const isDamaged = type === 'field_damaged_area' || type === 'compound_damaged_area'
  const isOut = type === 'compound_recycling_out' || type === 'field_storage_out'
  const Icon = isDamaged ? PackageX : isOut ? Recycle : Truck
  return <article className={`location-card ${isDamaged ? 'damaged' : isOut ? 'out' : 'in'}`}><span className="location-icon"><Icon size={22} /></span><span><b>{location.name}</b></span></article>
}

function FieldApp({ profile, project, projectId, onSignOut }: { profile: Profile; project: Project; projectId: string; onSignOut: () => void }) {
  const [roles, setRoles] = useState<string[]>([]), [modal, setModal] = useState<'delivery' | 'install' | 'removal' | 'recycling' | 'pallet_delivery' | 'panel_visual' | 'telehandler_pre_use'>(), [workflowCode, setWorkflowCode] = useState('')
  useEffect(() => { supabase.from('project_member_roles').select('role').eq('project_id', projectId).eq('user_id', profile.id).then(({ data }) => setRoles((data ?? []).map(x => x.role))) }, [projectId, profile.id])
  const canMove = roles.includes('operative') || roles.includes('site_manager') || profile.role === 'admin'
  const canTelehandle = roles.includes('telehandler_operator') || roles.includes('site_manager') || profile.role === 'admin'
  const start = (next: 'delivery' | 'install' | 'removal' | 'recycling') => { setWorkflowCode(''); setModal(next) }
  return <main className="field-shell"><AppHeader profile={profile} project={project} onSignOut={onSignOut} field /><section className="field-intro"><p className="kicker">FIELD OPERATOR</p><h1>What are you doing?</h1><p>Choose one task. The app guides you through each required check in the right order.</p></section>{(canMove || canTelehandle) ? <div className="task-grid">{canMove && <><Task icon={<Truck />} title="Receive delivery" text="Scan the pallet, complete delivery inspection, then inspect the panels." onClick={() => start('delivery')} /><Task icon={<Barcode />} title="Remove panels" text="Select the signed isolation certificate, scan panels and choose their destination." onClick={() => start('removal')} /><Task icon={<ScanLine />} title="Recycle at Compound" text="Scan the recycling pallet QR, then scan every panel onto it." onClick={() => start('recycling')} /><Task icon={<PackageCheck />} title="Install panels" text="Scan the pallet, move it to field storage and assign its combiner box." onClick={() => start('install')} /></>}{canTelehandle && <Task icon={<Truck />} title="Telehandler daily check" text="Complete and sign the pre-use inspection before first use." onClick={() => setModal('telehandler_pre_use')} />}</div> : <section className="notice"><ShieldCheck /> Your current role does not have field access.</section>}{modal && (modal === 'pallet_delivery' || modal === 'panel_visual' || modal === 'telehandler_pre_use' ? <ChecklistWorkflow kind={modal} projectId={projectId} profileId={profile.id} assetCode={workflowCode} onSaved={() => modal === 'pallet_delivery' ? setModal('panel_visual') : setModal(undefined)} close={() => setModal(undefined)} /> : <FieldWorkflow type={modal} projectId={projectId} profileId={profile.id} onSaved={code => modal === 'delivery' ? (setWorkflowCode(code), setModal('pallet_delivery')) : setModal(undefined)} close={() => setModal(undefined)} />)}</main>
}
function Task({ icon, title, text, onClick }: { icon: ReactNode; title: string; text: string; onClick: () => void }) { return <button className="task-card" onClick={onClick}><span className="task-icon">{icon}</span><span><b>{title}</b><small>{text}</small></span><ScanLine size={20} /></button> }
function ScanModal({ title, close }: { title: string; close: () => void }) { return <div className="modal-backdrop"><section className="scan-modal"><button className="close" onClick={close}>Close</button><p className="kicker">SCAN</p><h2>{title}</h2><p>Camera scanning is the next build step in this replacement application. No manual serial entry will be used in normal field operation.</p><button className="button primary" onClick={close}>Continue</button></section></div> }
