"use client";

import { useEffect, useMemo, useState } from "react";
import { Building2, Users, ShieldCheck, UserRound, Check, Minus, RotateCcw, UserPlus, MoreHorizontal, Loader2 } from "lucide-react";
import { ROLE_LABELS } from "@/lib/auth/session";
import { ROLE_ORDER, ROLE_SUMMARY, ROLE_MATRIX } from "@/lib/auth/roles";
import { initialsFrom, plural } from "@/lib/format";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import SignOutButton from "@/components/auth/SignOutButton";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const dateLabel = (iso) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "—");

function useLoad(load, deps) {
  const [state, setState] = useState({ status: "loading", data: null, error: null });
  const [n, setN] = useState(0);
  useEffect(() => {
    let live = true;
    setState((s) => ({ ...s, status: "loading", error: null }));
    load().then((data) => live && setState({ status: "ready", data, error: null }))
      .catch((error) => live && setState({ status: "error", data: null, error }));
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, n]);
  return [state, () => setN((x) => x + 1), (data) => setState({ status: "ready", data, error: null })];
}

function LoadError({ what, error, onRetry }) {
  return (
    <div className="notice" role="alert">
      <div className="notice-body">
        <div className="notice-title">{what} could not be loaded</div>
        <div className="notice-text">{error?.message || "Something went wrong"}.</div>
      </div>
      <button type="button" className="btn" onClick={onRetry}><RotateCcw size={14} /> Try again</button>
    </div>
  );
}

// Settings: organisation, members (administrators), roles and the signed-in account. Sections are
// shown only when the backend supports them for the current role.
export default function Settings({ adapter, session, permissions, onOrganizationRenamed }) {
  const sections = [
    { id: "organisation", label: "Organisation", icon: Building2 },
    permissions.manageMembers && { id: "members", label: "Members", icon: Users },
    { id: "roles", label: "Roles and permissions", icon: ShieldCheck },
    { id: "account", label: "Account", icon: UserRound },
  ].filter(Boolean);
  const [section, setSection] = useState("organisation");

  return (
    <div className="page">
      <div className="page-inner st">
        <div className="page-head">
          <div>
            <h1>Settings</h1>
          </div>
        </div>
        <div className="st-layout">
          <nav className="st-nav" aria-label="Settings sections">
            {sections.map((s) => (
              <button key={s.id} type="button" className={`st-nav-item ${section === s.id ? "on" : ""}`} aria-current={section === s.id ? "page" : undefined} onClick={() => setSection(s.id)}>
                <s.icon size={16} strokeWidth={1.75} aria-hidden="true" /> {s.label}
              </button>
            ))}
          </nav>
          <div className="st-body">
            {section === "organisation" && <OrganisationSection adapter={adapter} canEdit={permissions.manageMembers} onRenamed={onOrganizationRenamed} />}
            {section === "members" && permissions.manageMembers && <MembersSection adapter={adapter} currentUserId={session?.user?.id} />}
            {section === "roles" && <RolesSection currentRole={session?.role} />}
            {section === "account" && <AccountSection session={session} />}
          </div>
        </div>
      </div>
    </div>
  );
}

function OrganisationSection({ adapter, canEdit, onRenamed }) {
  const [org, retry, setOrg] = useLoad(() => adapter.getOrganization(), []);
  const [form, setForm] = useState({ name: "", email: "" });
  const [errors, setErrors] = useState({});
  const [save, setSave] = useState({ status: "idle", message: "" });

  useEffect(() => {
    if (org.status === "ready") setForm({ name: org.data.name || "", email: org.data.email || "" });
  }, [org.status, org.data]);

  if (org.status === "loading") return <div className="sk st-sk" aria-label="Loading organisation" role="status" />;
  if (org.status === "error") return <LoadError what="Your organisation" error={org.error} onRetry={retry} />;
  const o = org.data;
  const dirty = form.name.trim() !== (o.name || "") || form.email.trim() !== (o.email || "");

  const submit = async (e) => {
    e.preventDefault();
    const name = form.name.trim();
    const email = form.email.trim();
    const next = {};
    if (name.length < 2 || name.length > 160) next.name = "Use 2 to 160 characters.";
    if (email && !EMAIL.test(email)) next.email = "Enter a valid email address, or leave it empty.";
    setErrors(next);
    if (Object.keys(next).length) return;
    const fields = {};
    if (name !== o.name) fields.name = name;
    if (email !== (o.email || "")) fields.email = email || null;
    setSave({ status: "saving", message: "" });
    try {
      const updated = await adapter.updateOrganization(fields);
      setOrg(updated);
      setSave({ status: "saved", message: "Changes saved." });
      if (fields.name) onRenamed?.(updated.name);
    } catch (err) {
      setSave({ status: "error", message: `${err.message || "The changes could not be saved"}.` });
    }
  };

  return (
    <section className="st-card" aria-labelledby="st-org-title">
      <header className="st-card-head">
        <h2 id="st-org-title" className="st-h2">Organisation profile</h2>
        <p className="st-lead">{canEdit ? "The name appears across the workspace and on PDF reports." : "Only administrators can change these details."}</p>
      </header>
      <form onSubmit={submit} noValidate>
        <div className="st-card-body">
          <div className="st-grid">
            <div className="st-field">
              <label htmlFor="org-name">Organisation name</label>
              <input id="org-name" className="field-input" value={form.name} onChange={(e) => { setForm({ ...form, name: e.target.value }); setSave({ status: "idle" }); }} disabled={!canEdit || save.status === "saving"} maxLength={160} aria-invalid={!!errors.name} aria-describedby={errors.name ? "org-name-err" : undefined} />
              {errors.name && <p id="org-name-err" className="field-error">{errors.name}</p>}
            </div>
            <div className="st-field">
              <label htmlFor="org-email">Contact email <span>(optional)</span></label>
              <input id="org-email" type="email" className="field-input" value={form.email} onChange={(e) => { setForm({ ...form, email: e.target.value }); setSave({ status: "idle" }); }} disabled={!canEdit || save.status === "saving"} placeholder={canEdit ? "research@hospital.org" : "Not set"} aria-invalid={!!errors.email} aria-describedby={errors.email ? "org-email-err" : undefined} />
              {errors.email && <p id="org-email-err" className="field-error">{errors.email}</p>}
            </div>
          </div>
          <dl className="st-meta">
            <div><dt>Workspace ID</dt><dd className="tnum">{o.slug || "—"}</dd></div>
            <div><dt>Created</dt><dd className="tnum">{dateLabel(o.createdAt)}</dd></div>
          </dl>
        </div>
        {canEdit && (
          <footer className="st-card-foot">
            <div className="st-foot-status">
              {save.status === "saved" && <span className="st-ok" role="status"><Check size={14} /> {save.message}</span>}
              {save.status === "error" && <span className="st-err" role="alert">{save.message}</span>}
            </div>
            <button type="button" className="btn ghost" disabled={!dirty || save.status === "saving"} onClick={() => { setForm({ name: o.name || "", email: o.email || "" }); setErrors({}); setSave({ status: "idle" }); }}>Cancel</button>
            <button type="submit" className="btn primary" disabled={!dirty || save.status === "saving"}>
              {save.status === "saving" ? <><Loader2 size={14} className="spin" /> Saving…</> : "Save changes"}
            </button>
          </footer>
        )}
      </form>
    </section>
  );
}

function MemberMenu({ member, isSelf, onRole, onStatus, onRemove }) {
  const [open, setOpen] = useState(false);
  const [up, setUp] = useState(false);
  const toggle = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    setUp(window.innerHeight - r.bottom < 300);
    setOpen((o) => !o);
  };
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [open]);
  const suspended = member.status === "SUSPENDED";
  return (
    <div className="row-menu" onClick={(e) => e.stopPropagation()}>
      <button type="button" className="icon-btn" aria-label={`Actions for ${member.user?.fullName}`} aria-haspopup="menu" aria-expanded={open} onClick={toggle}>
        <MoreHorizontal size={17} strokeWidth={1.75} />
      </button>
      {open && (
        <div className={`row-menu-pop ${up ? "up" : ""}`} role="menu">
          <div className="row-menu-label">Change role</div>
          {ROLE_ORDER.filter((r) => r !== member.role).map((r) => (
            <button key={r} type="button" role="menuitem" className="row-menu-item" onClick={() => { setOpen(false); onRole(r); }}>{ROLE_LABELS[r]}</button>
          ))}
          {!isSelf && (
            <>
              <div className="row-menu-sep" />
              <button type="button" role="menuitem" className="row-menu-item" onClick={() => { setOpen(false); onStatus(suspended ? "ACTIVE" : "SUSPENDED"); }}>{suspended ? "Reactivate" : "Suspend access"}</button>
              <button type="button" role="menuitem" className="row-menu-item danger" onClick={() => { setOpen(false); onRemove(); }}>Remove from organisation</button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function MembersSection({ adapter, currentUserId }) {
  const confirm = useConfirm();
  const [members, retry, setMembers] = useLoad(() => adapter.listMembers(), []);
  const [add, setAdd] = useState({ email: "", role: "RESEARCHER" });
  const [addState, setAddState] = useState({ status: "idle", message: "" });
  const [rowState, setRowState] = useState({ id: null, message: "", tone: "" });
  const list = useMemo(() => (Array.isArray(members.data) ? members.data : []), [members.data]);
  const activeAdmins = list.filter((m) => m.role === "ORGANIZATION_ADMIN" && m.status === "ACTIVE").length;

  if (members.status === "loading") return <div className="sk st-sk" aria-label="Loading members" role="status" />;
  if (members.status === "error") return <LoadError what="Members" error={members.error} onRetry={retry} />;

  const replace = (m) => setMembers(list.map((x) => (x.id === m.id ? { ...x, ...m } : x)));
  const act = async (m, fn, done) => {
    setRowState({ id: m.id, message: "Saving…", tone: "" });
    try {
      await fn();
      setRowState({ id: m.id, message: done, tone: "ok" });
    } catch (err) {
      setRowState({ id: m.id, message: `${err.message || "The change could not be saved"}.`, tone: "err" });
    }
  };
  const changeRole = async (m, role) => {
    if (m.user?.id === currentUserId && role !== "ORGANIZATION_ADMIN" && !(await confirm({ title: `Change your own role to ${ROLE_LABELS[role]}?`, body: "You will lose access to organisation settings and member management straight away.", confirmLabel: "Change my role", tone: "danger" }))) return;
    return changeRoleNow(m, role);
  };
  const changeRoleNow = (m, role) => act(m, async () => replace(await adapter.updateMember(m.id, { role })), `Role changed to ${ROLE_LABELS[role]}.`);
  const changeStatus = async (m, status) => {
    if (status === "SUSPENDED" && !(await confirm({ title: `Suspend ${m.user?.fullName}?`, body: "They lose access to this organisation straight away. You can reactivate them later.", confirmLabel: "Suspend access", tone: "danger" }))) return;
    act(m, async () => replace(await adapter.updateMember(m.id, { status })), status === "ACTIVE" ? "Access restored." : "Access suspended.");
  };
  const remove = async (m) => {
    if (!(await confirm({ title: `Remove ${m.user?.fullName}?`, body: "They lose access to this organisation. Their account stays, and you can add them again later.", confirmLabel: "Remove member", tone: "danger" }))) return;
    act(m, async () => { await adapter.removeMember(m.id); setMembers(list.filter((x) => x.id !== m.id)); }, "Removed.");
  };

  const submitAdd = async (e) => {
    e.preventDefault();
    const email = add.email.trim();
    if (!EMAIL.test(email)) { setAddState({ status: "error", message: "Enter the email address of their Hosptic account." }); return; }
    setAddState({ status: "saving", message: "" });
    try {
      const member = await adapter.addMember({ email, role: add.role });
      setMembers([...list, member]);
      setAdd({ email: "", role: add.role });
      setAddState({ status: "saved", message: `${member.user?.fullName || email} added as ${ROLE_LABELS[member.role] || add.role}.` });
    } catch (err) {
      setAddState({ status: "error", message: `${err.message || "The member could not be added"}.` });
    }
  };

  return (
    <div className="st-stack">
      <section className="st-card" aria-labelledby="st-add-title">
        <header className="st-card-head">
          <h2 id="st-add-title" className="st-h2">Add a member</h2>
          <p className="st-lead">Add a colleague who already has a Hosptic account, using the email they sign in with.</p>
        </header>
        <div className="st-card-body">
          <form className="st-add" onSubmit={submitAdd} noValidate>
            <label className="sr-only" htmlFor="add-email">Email address</label>
            <input id="add-email" type="email" className="field-input" placeholder="colleague@hospital.org" value={add.email} onChange={(e) => { setAdd({ ...add, email: e.target.value }); setAddState({ status: "idle" }); }} disabled={addState.status === "saving"} />
            <label className="ds-select"><span className="sr-only">Role</span>
              <select value={add.role} onChange={(e) => setAdd({ ...add, role: e.target.value })} disabled={addState.status === "saving"}>
                {ROLE_ORDER.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
              </select>
            </label>
            <button type="submit" className="btn primary" disabled={addState.status === "saving"}>
              {addState.status === "saving" ? <Loader2 size={14} className="spin" /> : <UserPlus size={14} />} Add member
            </button>
          </form>
          {addState.status === "saved" && <p className="st-ok st-inline" role="status"><Check size={14} /> {addState.message}</p>}
          {addState.status === "error" && <p className="st-err st-inline" role="alert">{addState.message}</p>}
        </div>
      </section>

      <section className="st-card" aria-labelledby="st-members-title">
        <header className="st-card-head st-card-head-row">
          <div>
            <h2 id="st-members-title" className="st-h2">Members</h2>
            <p className="st-lead">{list.length <= 1 ? "You are the only member so far." : `${plural(list.length, "member", "members")} in this organisation.`}</p>
          </div>
        </header>
        <ul className="st-members" aria-label="Members">
          {list.map((m) => {
            const isSelf = m.user?.id === currentUserId;
            const lastAdmin = m.role === "ORGANIZATION_ADMIN" && m.status === "ACTIVE" && activeAdmins <= 1;
            return (
              <li key={m.id} className="st-member">
                <span className="st-avatar" aria-hidden="true">{initialsFrom(m.user?.fullName || m.user?.email || "?")}</span>
                <div className="st-member-who">
                  <span className="st-member-name">{m.user?.fullName || m.user?.email}{isSelf && <span className="st-you"> (you)</span>}</span>
                  <span className="st-member-email">{m.user?.email}</span>
                  <span className="st-member-meta tnum">
                    <span className="st-member-role">{ROLE_LABELS[m.role] || m.role}</span>
                    <span className={`status-dot ${m.status === "SUSPENDED" ? "failed" : ""}`}>{m.status === "SUSPENDED" ? "Suspended" : "Active"}</span>
                    <span>Joined {dateLabel(m.joinedAt)}</span>
                    {lastAdmin && <span title="An organisation needs at least one active administrator">Last administrator, cannot be changed</span>}
                  </span>
                </div>
                {!lastAdmin && (
                  <div className="st-member-actions">
                    <MemberMenu member={m} isSelf={isSelf} onRole={(r) => changeRole(m, r)} onStatus={(s) => changeStatus(m, s)} onRemove={() => remove(m)} />
                  </div>
                )}
                {rowState.id === m.id && rowState.message && <p className={`st-member-msg ${rowState.tone === "ok" ? "st-ok-text" : rowState.tone === "err" ? "st-err" : "st-muted-text"}`} role={rowState.tone === "err" ? "alert" : "status"}>{rowState.message}</p>}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

function RolesSection({ currentRole }) {
  const mark = (v) => (v === true ? <Check size={16} strokeWidth={2.25} className="st-yes" aria-label="Yes" /> : v === false ? <Minus size={16} className="st-no" aria-label="No" /> : <span className="st-partial">{v}</span>);
  return (
    <section className="st-card" aria-labelledby="st-roles-title">
      <header className="st-card-head">
        <h2 id="st-roles-title" className="st-h2">Roles and permissions</h2>
        <p className="st-lead">Every member has one role, and Hosptic checks it on every request. Your role is {ROLE_LABELS[currentRole] || "not set"}.</p>
      </header>
      <ul className="st-roles">
        {ROLE_ORDER.map((r) => (
          <li key={r} className={r === currentRole ? "is-current" : ""}>
            <span className="st-role-name">{ROLE_LABELS[r]}{r === currentRole && <span className="st-you"> (you)</span>}</span>
            <span className="st-role-text">{ROLE_SUMMARY[r]}</span>
          </li>
        ))}
      </ul>
      <div className="table-scroll">
        <table className="data st-matrix">
          <thead>
            <tr>
              <th scope="col">What they can do</th>
              {ROLE_ORDER.map((r) => <th key={r} scope="col" className={`c ${r === currentRole ? "is-current" : ""}`}>{ROLE_LABELS[r]}</th>)}
            </tr>
          </thead>
          <tbody>
            {ROLE_MATRIX.map(([action, ...cells]) => (
              <tr key={action}>
                <th scope="row">{action}</th>
                {cells.map((v, i) => <td key={i} className={`c ${ROLE_ORDER[i] === currentRole ? "is-current" : ""}`}>{mark(v)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function AccountSection({ session }) {
  return (
    <div className="st-stack">
      <section className="st-card" aria-labelledby="st-account-title">
        <header className="st-card-head st-account-head">
          <span className="st-avatar lg" aria-hidden="true">{initialsFrom(session?.user?.fullName || "")}</span>
          <div>
            <h2 id="st-account-title" className="st-h2">{session?.user?.fullName || "Your account"}</h2>
            <p className="st-lead">Your personal sign-in, separate from the organisation settings.</p>
          </div>
        </header>
        <dl className="st-rows">
          <div><dt>Email</dt><dd>{session?.user?.email || "—"}</dd></div>
          <div><dt>Role</dt><dd>{ROLE_LABELS[session?.role] || "—"}</dd></div>
          <div><dt>Organisation</dt><dd>{session?.organization?.name || "—"}</dd></div>
          <div><dt>Name, email and password</dt><dd className="st-quiet">Changes are not available yet</dd></div>
        </dl>
      </section>
      <section className="st-card" aria-labelledby="st-signout-title">
        <div className="st-card-body st-signout">
          <div>
            <h2 id="st-signout-title" className="st-row-title">Sign out</h2>
            <p className="st-row-text">Ends your session and clears workspace data saved on this device.</p>
          </div>
          <SignOutButton variant="button" />
        </div>
      </section>
    </div>
  );
}
