import { useState, useEffect, useCallback, useRef } from "react";
import Icon from "./components/Icon";
import {
  allRecords,
  saveRecord,
  deleteRecord,
  syncRecords,
  migrateLegacy,
  importBackup,
  download,
  exportCSV,
} from "./data/workspace";
import { loadDemo } from "./data/demo";
import "./App.css";

const NAV = [
  ["overview", "Resumen", "grid"],
  ["reports", "Reportes", "reports"],
  ["clients", "Clientes", "users"],
  ["technicians", "Técnicos", "tool"],
  ["agenda", "Agenda", "calendar"],
  ["sync", "Sincronización", "sync"],
  ["settings", "Configuración", "settings"],
];
const STATES = {
  pendiente: "Pendiente",
  "en-proceso": "En proceso",
  completado: "Completado",
};
const PRIORITIES = { alta: "Alta", media: "Media", baja: "Baja" };
const date = (v) =>
  v
    ? new Date(v).toLocaleDateString("es-MX", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "Sin fecha";
const initials = (n) =>
  (n || "?")
    .split(" ")
    .slice(0, 2)
    .map((n) => n[0])
    .join("")
    .toUpperCase();
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const getPage = () =>
  NAV.some((n) => n[0] === location.hash.slice(1))
    ? location.hash.slice(1)
    : "overview";
const emptyForm = (type) =>
  type === "reports"
    ? {
        title: "",
        tecnico: "",
        clienteUbicacion: "",
        descripcionProblema: "",
        estado: "pendiente",
        priority: "media",
        category: "Mantenimiento",
        scheduledAt: "",
        resolution: "",
      }
    : type === "technicians"
      ? { name: "", specialty: "", email: "", phone: "", status: "disponible" }
      : type === "visits"
        ? {
            name: "",
            clientId: "",
            technicianId: "",
            date: today(),
            time: "09:00",
            notes: "",
            status: "programada",
          }
        : {
            name: "",
            contact: "",
            email: "",
            phone: "",
            address: "",
            category: "",
          };
const localDateTime = (v) => {
  if (!v) return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}T${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};
function Badge({ value, children }) {
  return (
    <span className={`badge badge-${value}`}>
      {children || STATES[value] || PRIORITIES[value] || value}
    </span>
  );
}
function Empty({ icon = "reports", title, text, action, onAction }) {
  return (
    <div className="empty-state">
      <span className="empty-icon">
        <Icon name={icon} size={28} />
      </span>
      <h3>{title}</h3>
      <p>{text}</p>
      {action && (
        <button className="button primary" onClick={onAction}>
          <Icon name="plus" size={16} />
          {action}
        </button>
      )}
    </div>
  );
}
function Field({ label, children, wide }) {
  return (
    <label className={`field ${wide ? "wide" : ""}`}>
      <span>{label}</span>
      {children}
    </label>
  );
}

export default function App() {
  const [page, setPage] = useState(getPage),
    [records, setRecords] = useState([]),
    [busy, setBusy] = useState(true);
  const [online, setOnline] = useState(navigator.onLine),
    [mode, setMode] = useState("unknown"),
    [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState(
      localStorage.getItem("fielddesk-last-sync"),
    ),
    [notice, setNotice] = useState(null);
  const [search, setSearch] = useState(""),
    [statusFilter, setStatusFilter] = useState("all"),
    [priorityFilter, setPriorityFilter] = useState("all");
  const [sort, setSort] = useState("newest"),
    [view, setView] = useState("list"),
    [menu, setMenu] = useState(false);
  const [modal, setModal] = useState(null),
    [form, setForm] = useState({}),
    [saving, setSaving] = useState(false),
    [formError, setFormError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(null),
    [agendaDate, setAgendaDate] = useState(""),
    [installPrompt, setInstallPrompt] = useState(null);
  const [profile, setProfile] = useState(() => {
    try {
      return (
        JSON.parse(localStorage.getItem("fielddesk-profile")) || {
          name: "Mi espacio de trabajo",
          person: "Coordinador de servicios",
        }
      );
    } catch {
      return {
        name: "Mi espacio de trabajo",
        person: "Coordinador de servicios",
      };
    }
  });
  const importRef = useRef(null),
    dialogRef = useRef(null),
    syncLock = useRef(false);
  const notify = (message, error = false) => setNotice({ message, error });
  const refresh = useCallback(async () => setRecords(await allRecords()), []);
  const doSync = useCallback(
    async (manual = false) => {
      if (syncLock.current) return;
      syncLock.current = true;
      setSyncing(true);
      try {
        const r = await syncRecords();
        setMode(r.mode);
        setLastSync(localStorage.getItem("fielddesk-last-sync"));
        await refresh();
        if (manual)
          notify(
            r.mode === "offline"
              ? "Sin conexión. Tus cambios están guardados en este dispositivo."
              : r.mode === "local-only"
                ? "Datos guardados en este dispositivo. La nube requiere configurar la base de datos en Vercel."
                : `Todo al día. ${r.sent} cambio(s) sincronizado(s).`,
          );
      } catch {
        setMode("unavailable");
        if (manual)
          notify(
            "No se pudo conectar al servidor. Tus datos siguen guardados en este dispositivo.",
            true,
          );
      } finally {
        setSyncing(false);
        syncLock.current = false;
      }
    },
    [refresh],
  );
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        await migrateLegacy();
        if (active) {
          await refresh();
          await doSync();
        }
      } catch (e) {
        if (active) notify(e.message, true);
      } finally {
        if (active) setBusy(false);
      }
    })();
    const hash = () => {
      setPage(getPage());
      setMenu(false);
      setSearch("");
      setStatusFilter("all");
      setPriorityFilter("all");
    };
    const connectivity = () => {
      setOnline(navigator.onLine);
      if (navigator.onLine) doSync();
      else setMode("offline");
    };
    const install = (e) => {
      e.preventDefault();
      setInstallPrompt(e);
    };
    window.addEventListener("hashchange", hash);
    window.addEventListener("online", connectivity);
    window.addEventListener("offline", connectivity);
    window.addEventListener("beforeinstallprompt", install);
    const timer = setInterval(() => {
      if (navigator.onLine) doSync();
    }, 60000);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener("hashchange", hash);
      window.removeEventListener("online", connectivity);
      window.removeEventListener("offline", connectivity);
      window.removeEventListener("beforeinstallprompt", install);
    };
  }, [doSync, refresh]);
  useEffect(() => {
    if (notice) {
      const t = setTimeout(() => setNotice(null), 7000);
      return () => clearTimeout(t);
    }
  }, [notice]);
  useEffect(() => {
    if (!modal && !confirmDelete) return;
    const previous = document.activeElement,
      dialog = dialogRef.current;
    dialog?.querySelector("input,select,textarea,button")?.focus();
    const key = (e) => {
      if (e.key === "Escape" && !saving) {
        setModal(null);
        setConfirmDelete(null);
      }
      if (e.key === "Tab" && dialog) {
        const targets = [
          ...dialog.querySelectorAll(
            "button:not(:disabled),input,select,textarea,a[href]",
          ),
        ];
        if (e.shiftKey && document.activeElement === targets[0]) {
          e.preventDefault();
          targets.at(-1)?.focus();
        } else if (!e.shiftKey && document.activeElement === targets.at(-1)) {
          e.preventDefault();
          targets[0]?.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", key);
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, [modal, confirmDelete, saving]);
  const active = records.filter((r) => !r.deleted),
    reports = active.filter((r) => r.collection === "reports"),
    clients = active.filter((r) => r.collection === "clients"),
    technicians = active.filter((r) => r.collection === "technicians"),
    visits = active.filter((r) => r.collection === "visits"),
    pending = records.filter((r) => r.dirty);
  const completed = reports.filter((r) => r.estado === "completado").length,
    waiting = reports.filter((r) => r.estado === "pendiente").length,
    inProgress = reports.filter((r) => r.estado === "en-proceso").length;
  const goto = (key) => {
    location.hash = key;
    if (key === page) setMenu(false);
  };
  const openForm = (type, item) => {
    setForm({ ...emptyForm(type), ...item });
    setFormError("");
    setModal({ type, editing: !!item });
  };
  const change = (e) =>
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
  const selectClient = (e) => {
    const c = clients.find((c) => c.id === e.target.value);
    setForm((f) => ({
      ...f,
      clientId: e.target.value,
      ...(c ? { clienteUbicacion: c.name } : {}),
    }));
  };
  const selectTechnician = (e) => {
    const t = technicians.find((t) => t.id === e.target.value);
    setForm((f) => ({
      ...f,
      technicianId: e.target.value,
      ...(t ? { tecnico: t.name } : {}),
    }));
  };
  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    setFormError("");
    try {
      const clean = Object.fromEntries(
        Object.entries(form).map(([k, v]) => [
          k,
          typeof v === "string" ? v.trim() : v,
        ]),
      );
      if (
        modal.type === "reports" &&
        (!clean.title ||
          !clean.tecnico ||
          !clean.clienteUbicacion ||
          !clean.descripcionProblema)
      )
        throw new Error("Completa el título, técnico, cliente y descripción.");
      if (modal.type !== "reports" && !clean.name)
        throw new Error("El nombre no puede estar vacío.");
      if (
        modal.type === "visits" &&
        (!clean.clientId || !clean.technicianId || !clean.date || !clean.time)
      )
        throw new Error("Selecciona cliente, técnico, fecha y hora.");
      if (clean.scheduledAt)
        clean.scheduledAt = new Date(clean.scheduledAt).toISOString();
      await saveRecord(modal.type, clean);
      await refresh();
      setModal(null);
      notify("Cambios guardados correctamente.");
      doSync();
    } catch (e) {
      setFormError(e.message);
    } finally {
      setSaving(false);
    }
  };
  const remove = async () => {
    setSaving(true);
    try {
      await deleteRecord(confirmDelete);
      await refresh();
      setConfirmDelete(null);
      setModal(null);
      notify("Registro eliminado.");
      doSync();
    } catch (e) {
      notify(e.message, true);
    } finally {
      setSaving(false);
    }
  };
  const backup = () =>
    download(
      `fielddesk-respaldo-${today()}.json`,
      JSON.stringify(
        {
          format: "fielddesk-v1",
          exportedAt: new Date().toISOString(),
          records,
        },
        null,
        2,
      ),
    );
  const handleImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      if (file.size > 10 * 1024 * 1024)
        throw new Error("El archivo debe pesar menos de 10 MB.");
      const n = await importBackup(JSON.parse(await file.text()));
      await refresh();
      notify(`${n} registro(s) restaurado(s).`);
      doSync();
    } catch (e) {
      notify(
        e instanceof SyntaxError
          ? "No se pudo leer el archivo JSON."
          : e.message,
        true,
      );
    } finally {
      e.target.value = "";
    }
  };
  const filtered = reports
    .filter(
      (r) =>
        (statusFilter === "all" || r.estado === statusFilter) &&
        (priorityFilter === "all" || r.priority === priorityFilter) &&
        `${r.title} ${r.tecnico} ${r.clienteUbicacion} ${r.descripcionProblema}`
          .toLowerCase()
          .includes(search.toLowerCase()),
    )
    .sort((a, b) =>
      sort === "priority"
        ? ({ alta: 0, media: 1, baja: 2 }[a.priority] ?? 1) -
          ({ alta: 0, media: 1, baja: 2 }[b.priority] ?? 1)
        : sort === "oldest"
          ? a.createdAt.localeCompare(b.createdAt)
          : b.createdAt.localeCompare(a.createdAt),
    );
  const schedule = [
    ...visits
      .filter((v) => v.status !== "cancelada")
      .map((v) => ({
        ...v,
        label: v.name,
        when: `${v.date}T${v.time}`,
        client:
          clients.find((c) => c.id === v.clientId)?.name ||
          "Cliente no disponible",
        tech:
          technicians.find((t) => t.id === v.technicianId)?.name ||
          "Técnico no disponible",
        type: "visits",
      })),
    ...reports
      .filter((r) => r.scheduledAt && r.estado !== "completado")
      .map((r) => ({
        ...r,
        label: r.title,
        when: r.scheduledAt,
        client: r.clienteUbicacion,
        tech: r.tecnico,
        type: "reports",
      })),
  ].sort((a, b) => new Date(a.when) - new Date(b.when));
  const upcoming = schedule.filter(
    (s) =>
      new Date(s.when) >= new Date(`${today()}T00:00:00`) &&
      s.status !== "realizada",
  );
  const navItems = NAV.map(([key, label, icon]) => (
    <a
      key={key}
      href={`#${key}`}
      className={page === key ? "nav-link active" : "nav-link"}
      aria-current={page === key ? "page" : undefined}
      onClick={() => setMenu(false)}
    >
      <Icon name={icon} />
      <span>{label}</span>
      {key === "reports" && reports.length > 0 && (
        <span className="nav-count">{reports.length}</span>
      )}
      {key === "sync" && pending.length > 0 && <span className="nav-dot" />}
    </a>
  ));
  const reportTable = (items, compact = false) =>
    items.length === 0 ? (
      <Empty
        title={
          search || statusFilter !== "all" || priorityFilter !== "all"
            ? "No encontramos reportes"
            : "Tu próximo servicio empieza aquí"
        }
        text="Registra un reporte para organizar el trabajo de tu equipo."
        action="Crear reporte"
        onAction={() => openForm("reports")}
      />
    ) : (
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>REPORTE / CLIENTE</th>
              <th>TÉCNICO</th>
              <th>ESTADO</th>
              <th>PRIORIDAD</th>
              {!compact && <th>FECHA</th>}
              <th>
                <span className="sr-only">Acciones</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((r) => (
              <tr key={r.id}>
                <td>
                  <button
                    className="table-title"
                    onClick={() => openForm("reports", r)}
                  >
                    {r.title || r.descripcionProblema?.slice(0, 65)}
                  </button>
                  <span className="table-sub">{r.clienteUbicacion}</span>
                </td>
                <td>
                  <span className="person-cell">
                    <span className="avatar small">{initials(r.tecnico)}</span>
                    <span>{r.tecnico}</span>
                  </span>
                </td>
                <td>
                  <Badge value={r.estado} />
                </td>
                <td>
                  <span
                    className={`priority priority-${r.priority || "media"}`}
                  >
                    <i />
                    {PRIORITIES[r.priority] || "Media"}
                  </span>
                </td>
                {!compact && (
                  <td className="muted nowrap">{date(r.createdAt)}</td>
                )}
                <td>
                  <button
                    className="icon-button"
                    onClick={() => openForm("reports", r)}
                    aria-label={`Editar ${r.title || "reporte"}`}
                  >
                    <Icon name="arrow" size={17} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Saltar al contenido
      </a>
      {menu && <div className="sidebar-shade" onClick={() => setMenu(false)} />}
      <aside className={`sidebar ${menu ? "open" : ""}`}>
        <a href="#overview" className="brand">
          <span className="brand-mark">
            <Icon name="tool" size={23} />
          </span>
          <span>
            fielddesk<span className="brand-period">.</span>
            <small>GESTIÓN EN CAMPO</small>
          </span>
        </a>
        <div className="workspace">
          <span className="workspace-icon">{initials(profile.name)}</span>
          <div>
            <strong>{profile.name}</strong>
            <small>Espacio de trabajo</small>
          </div>
          <Icon name="down" size={14} />
        </div>
        <p className="nav-heading">PRINCIPAL</p>
        <nav aria-label="Navegación principal">{navItems}</nav>
        <div className="sidebar-bottom">
          <div className="offline-card">
            <Icon name="cloud" size={23} />
            <strong>Tu trabajo, siempre contigo</strong>
            <p>
              Registra servicios incluso sin conexión. Los cambios se guardan en
              tu dispositivo.
            </p>
            <button onClick={() => goto("sync")}>
              Ver sincronización <Icon name="arrow" size={14} />
            </button>
          </div>
          <div className="profile">
            <span className="avatar">{initials(profile.person)}</span>
            <div>
              <strong>{profile.person}</strong>
              <small>Coordinación de servicios</small>
            </div>
            <button
              className="icon-button"
              aria-label="Configuración del espacio"
              onClick={() => goto("settings")}
            >
              <Icon name="settings" size={18} />
            </button>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-menu"
              aria-label="Abrir menú"
              aria-expanded={menu}
              onClick={() => setMenu(!menu)}
            >
              <Icon name="menu" />
            </button>
            <span>Espacio de trabajo</span>
            <span className="breadcrumb-slash">/</span>
            <strong>{NAV.find((n) => n[0] === page)?.[1]}</strong>
          </div>
          <div className="topbar-right">
            <span className={`connection ${online ? "" : "disconnected"}`}>
              <i />
              {online ? "En línea" : "Sin conexión"}
            </span>
            <span className="topbar-divider" />
            <button
              className={`icon-button ${syncing ? "spinning" : ""}`}
              onClick={() => doSync(true)}
              aria-label="Sincronizar datos"
              disabled={syncing}
            >
              <Icon name="sync" size={19} />
            </button>
            <button
              className="avatar top-avatar"
              onClick={() => goto("settings")}
              aria-label="Ver configuración"
            >
              {initials(profile.person)}
            </button>
          </div>
        </header>
        <main id="main-content" tabIndex={-1}>
          {notice && (
            <div
              className={`notice ${notice.error ? "error" : ""}`}
              role={notice.error ? "alert" : "status"}
            >
              <Icon name={notice.error ? "clock" : "check"} size={18} />
              <span>{notice.message}</span>
              <button
                className="icon-button"
                aria-label="Cerrar aviso"
                onClick={() => setNotice(null)}
              >
                <Icon name="close" size={16} />
              </button>
            </div>
          )}
          {!online && (
            <div className="offline-banner">
              <Icon name="wifi" size={18} />
              Trabajando sin conexión. Tus cambios se guardan en este
              dispositivo.
            </div>
          )}
          <div className="page-heading">
            <div>
              <div className="eyebrow">TU OPERACIÓN, BAJO CONTROL</div>
              <h1>
                {page === "overview"
                  ? "Un buen día para avanzar."
                  : NAV.find((n) => n[0] === page)?.[1]}
              </h1>
              <p>
                {
                  {
                    overview:
                      "Todo lo que necesitas para coordinar tus servicios, en un solo lugar.",
                    reports:
                      "Del primer diagnóstico al último detalle. Da seguimiento a cada servicio.",
                    clients:
                      "Conoce a tus clientes y mantén sus datos siempre a la mano.",
                    technicians:
                      "Un equipo conectado para resolver mejor, donde sea.",
                    agenda:
                      "Organiza tus visitas y prepárate para lo que viene.",
                    sync: "Consulta dónde están tus datos y mantén tu trabajo al día.",
                    settings:
                      "Personaliza tu espacio y administra tus respaldos.",
                  }[page]
                }
              </p>
            </div>
            <div className="heading-actions">
              {page === "overview" && (
                <span className="date-chip">
                  <Icon name="calendar" size={16} />
                  {new Date().toLocaleDateString("es-MX", {
                    day: "numeric",
                    month: "long",
                  })}
                </span>
              )}
              {[
                "overview",
                "reports",
                "clients",
                "technicians",
                "agenda",
              ].includes(page) && (
                <button
                  className="button primary"
                  onClick={() =>
                    openForm(
                      ["clients", "technicians"].includes(page)
                        ? page
                        : page === "agenda"
                          ? "visits"
                          : "reports",
                    )
                  }
                >
                  <Icon name="plus" size={18} />
                  {page === "clients"
                    ? "Nuevo cliente"
                    : page === "technicians"
                      ? "Nuevo técnico"
                      : page === "agenda"
                        ? "Programar visita"
                        : "Nuevo reporte"}
                </button>
              )}
            </div>
          </div>
          {busy ? (
            <div className="panel loading" role="status">
              Cargando tu espacio de trabajo…
            </div>
          ) : (
            <>
              {page === "overview" && (
                <>
                  <section
                    className="stats-grid"
                    aria-label="Resumen de reportes"
                  >
                    {[
                      [
                        "Reportes totales",
                        reports.length,
                        "reports",
                        "blue",
                        "Servicios registrados",
                        "all",
                      ],
                      [
                        "Pendientes",
                        waiting,
                        "clock",
                        "amber",
                        "Por atender",
                        "pendiente",
                      ],
                      [
                        "En proceso",
                        inProgress,
                        "tool",
                        "violet",
                        "El equipo está en ello",
                        "en-proceso",
                      ],
                      [
                        "Completados",
                        completed,
                        "check",
                        "green",
                        "Trabajo bien hecho",
                        "completado",
                      ],
                    ].map(([label, value, icon, color, sub, filter]) => (
                      <button
                        className="stat-card"
                        key={label}
                        onClick={() => {
                          goto("reports");
                          setTimeout(() => setStatusFilter(filter), 0);
                        }}
                      >
                        <span className="stat-top">
                          {label}
                          <span className={`stat-icon ${color}`}>
                            <Icon name={icon} size={19} />
                          </span>
                        </span>
                        <strong>{value.toString().padStart(2, "0")}</strong>
                        <span className="stat-bottom">
                          {sub}
                          <Icon name="arrow" size={15} />
                        </span>
                      </button>
                    ))}
                  </section>
                  <div className="dashboard-grid">
                    <section className="panel activity-panel">
                      <div className="panel-heading">
                        <div>
                          <h2>Actividad de servicios</h2>
                          <p>Reportes registrados en los últimos 7 días</p>
                        </div>
                        <span className="subtle-tag">Esta semana</span>
                      </div>
                      <div className="chart-legend">
                        <i />
                        Servicios registrados
                      </div>
                      <div className="bar-chart">
                        {Array.from({ length: 7 }, (_, i) => {
                          const d = new Date();
                          d.setDate(d.getDate() - (6 - i));
                          const count = reports.filter(
                            (r) =>
                              new Date(r.createdAt).toDateString() ===
                              d.toDateString(),
                          ).length;
                          const max = Math.max(
                            1,
                            ...Array.from({ length: 7 }, (_, j) => {
                              const x = new Date();
                              x.setDate(x.getDate() - j);
                              return reports.filter(
                                (r) =>
                                  new Date(r.createdAt).toDateString() ===
                                  x.toDateString(),
                              ).length;
                            }),
                          );
                          return (
                            <div className="bar-column" key={i}>
                              <div className="bar-track">
                                <span
                                  className={`bar ${i === 6 ? "current" : ""}`}
                                  style={{
                                    height: `${Math.max(2, (count / max) * 100)}%`,
                                  }}
                                  title={`${date(d)}: ${count} reportes`}
                                >
                                  <span>{count}</span>
                                </span>
                              </div>
                              <small>
                                {d
                                  .toLocaleDateString("es-MX", {
                                    weekday: "short",
                                  })
                                  .replace(".", "")}
                              </small>
                            </div>
                          );
                        })}
                      </div>
                      <div className="chart-footer">
                        <span>
                          <strong>
                            {
                              reports.filter(
                                (r) =>
                                  new Date(r.createdAt) >=
                                  new Date(Date.now() - 7 * 86400000),
                              ).length
                            }
                          </strong>{" "}
                          servicios esta semana
                        </span>
                        <span className="muted">Cada servicio cuenta.</span>
                      </div>
                    </section>
                    <section className="panel distribution-panel">
                      <div className="panel-heading">
                        <div>
                          <h2>Estado de la operación</h2>
                          <p>Así va tu equipo</p>
                        </div>
                        <Icon name="more" />
                      </div>
                      <div className="donut-wrap">
                        <div
                          className="donut"
                          style={{
                            background: reports.length
                              ? `conic-gradient(#18a779 0 ${(completed / reports.length) * 100}%, #7872df ${(completed / reports.length) * 100}% ${((completed + inProgress) / reports.length) * 100}%, #efb54b ${((completed + inProgress) / reports.length) * 100}% 100%)`
                              : "#edf0f4",
                          }}
                        >
                          <div>
                            <strong>
                              {reports.length
                                ? Math.round((completed / reports.length) * 100)
                                : 0}
                              <small>%</small>
                            </strong>
                            <span>completado</span>
                          </div>
                        </div>
                      </div>
                      <div className="distribution-legend">
                        {[
                          ["Completados", completed, "green"],
                          ["En proceso", inProgress, "violet"],
                          ["Pendientes", waiting, "amber"],
                        ].map(([l, n, c]) => (
                          <div key={l}>
                            <span>
                              <i className={c} />
                              {l}
                            </span>
                            <strong>{n}</strong>
                          </div>
                        ))}
                      </div>
                    </section>
                  </div>
                  <div className="dashboard-grid lower">
                    <section className="panel">
                      <div className="panel-heading">
                        <div>
                          <h2>
                            Reportes recientes{" "}
                            <span className="count-pill">{reports.length}</span>
                          </h2>
                          <p>Los últimos movimientos de tu operación</p>
                        </div>
                        <button
                          className="text-button"
                          onClick={() => goto("reports")}
                        >
                          Ver todos <Icon name="arrow" size={16} />
                        </button>
                      </div>
                      {reportTable(
                        [...reports]
                          .sort((a, b) =>
                            b.createdAt.localeCompare(a.createdAt),
                          )
                          .slice(0, 4),
                        true,
                      )}
                    </section>
                    <section className="panel">
                      <div className="panel-heading">
                        <div>
                          <h2>Próximas visitas</h2>
                          <p>Tu siguiente parada</p>
                        </div>
                        <button
                          className="icon-button"
                          onClick={() => goto("agenda")}
                          aria-label="Ver agenda"
                        >
                          <Icon name="arrow" size={18} />
                        </button>
                      </div>
                      {upcoming.length ? (
                        <div className="visit-list">
                          {upcoming.slice(0, 3).map((v) => (
                            <button
                              className="visit-item"
                              key={v.id}
                              onClick={() => openForm(v.type, v)}
                            >
                              <span className="visit-date">
                                <strong>{new Date(v.when).getDate()}</strong>
                                <small>
                                  {new Date(v.when).toLocaleDateString(
                                    "es-MX",
                                    { month: "short" },
                                  )}
                                </small>
                              </span>
                              <span>
                                <strong>{v.label}</strong>
                                <small>{v.client}</small>
                                <span className="muted">
                                  {new Date(v.when).toLocaleTimeString(
                                    "es-MX",
                                    { hour: "2-digit", minute: "2-digit" },
                                  )}{" "}
                                  · {v.tech}
                                </span>
                              </span>
                            </button>
                          ))}
                        </div>
                      ) : (
                        <Empty
                          icon="calendar"
                          title="Un espacio para planear"
                          text="Tus próximas visitas aparecerán aquí."
                          action="Programar visita"
                          onAction={() => openForm("visits")}
                        />
                      )}
                    </section>
                  </div>
                  <div className="bottom-note">
                    <span>
                      <Icon name="check" size={16} />
                      Guardado automático en este dispositivo
                    </span>
                    <span>
                      {clients.length} clientes · {technicians.length} técnicos
                    </span>
                  </div>
                  {!records.length && (
                    <div className="welcome-strip">
                      <div>
                        <strong>Hazlo tuyo desde el primer servicio.</strong>
                        <p>
                          Comienza con tus datos o explora los módulos con un
                          conjunto de ejemplo.
                        </p>
                      </div>
                      <button
                        className="button secondary"
                        onClick={async () => {
                          try {
                            setBusy(true);
                            await loadDemo();
                            await refresh();
                            notify(
                              "Datos de ejemplo agregados. Puedes editarlos o eliminarlos.",
                            );
                            doSync();
                          } catch (e) {
                            notify(e.message, true);
                          } finally {
                            setBusy(false);
                          }
                        }}
                      >
                        Explorar con ejemplos <Icon name="arrow" size={16} />
                      </button>
                    </div>
                  )}
                </>
              )}
              {page === "reports" && (
                <section className="panel">
                  <div className="filter-bar">
                    <label className="search-field">
                      <Icon name="search" size={18} />
                      <input
                        aria-label="Buscar reportes"
                        placeholder="Buscar reporte, cliente o técnico…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                      />
                    </label>
                    <select
                      aria-label="Filtrar por estado"
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value)}
                    >
                      <option value="all">Todos los estados</option>
                      {Object.entries(STATES).map(([v, l]) => (
                        <option key={v} value={v}>
                          {l}
                        </option>
                      ))}
                    </select>
                    <select
                      aria-label="Filtrar por prioridad"
                      value={priorityFilter}
                      onChange={(e) => setPriorityFilter(e.target.value)}
                    >
                      <option value="all">Toda prioridad</option>
                      {Object.entries(PRIORITIES).map(([v, l]) => (
                        <option key={v} value={v}>
                          {l}
                        </option>
                      ))}
                    </select>
                    <button
                      className="button secondary export-button"
                      onClick={() => exportCSV(filtered)}
                      disabled={!filtered.length}
                    >
                      <Icon name="download" size={16} />
                      Exportar
                    </button>
                  </div>
                  <div className="list-toolbar">
                    <span>{filtered.length} reporte(s)</span>
                    <div>
                      <select
                        aria-label="Ordenar reportes"
                        value={sort}
                        onChange={(e) => setSort(e.target.value)}
                      >
                        <option value="newest">Más recientes</option>
                        <option value="oldest">Más antiguos</option>
                        <option value="priority">Mayor prioridad</option>
                      </select>
                      <button
                        className={`icon-button ${view === "list" ? "selected" : ""}`}
                        aria-label="Vista de lista"
                        aria-pressed={view === "list"}
                        onClick={() => setView("list")}
                      >
                        <Icon name="reports" size={18} />
                      </button>
                      <button
                        className={`icon-button ${view === "board" ? "selected" : ""}`}
                        aria-label="Vista de tablero"
                        aria-pressed={view === "board"}
                        onClick={() => setView("board")}
                      >
                        <Icon name="grid" size={18} />
                      </button>
                    </div>
                  </div>
                  {view === "list" ? (
                    reportTable(filtered)
                  ) : (
                    <div className="kanban">
                      {Object.entries(STATES).map(([state, label]) => (
                        <div className="kanban-column" key={state}>
                          <h3>
                            <Badge value={state} />
                            <span>
                              {
                                filtered.filter((r) => r.estado === state)
                                  .length
                              }
                            </span>
                          </h3>
                          {filtered
                            .filter((r) => r.estado === state)
                            .map((r) => (
                              <button
                                className="kanban-card"
                                key={r.id}
                                onClick={() => openForm("reports", r)}
                              >
                                <span
                                  className={`priority priority-${r.priority}`}
                                >
                                  <i />
                                  {PRIORITIES[r.priority]}
                                </span>
                                <strong>{r.title}</strong>
                                <p>{r.clienteUbicacion}</p>
                                <span className="kanban-footer">
                                  <span className="avatar small">
                                    {initials(r.tecnico)}
                                  </span>
                                  {r.tecnico}
                                </span>
                              </button>
                            ))}
                          {!filtered.some((r) => r.estado === state) && (
                            <p className="column-empty">
                              Sin reportes en {label.toLowerCase()}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              )}
              {["clients", "technicians"].includes(page) && (
                <>
                  <div className="directory-tools">
                    <label className="search-field">
                      <Icon name="search" size={18} />
                      <input
                        aria-label={`Buscar ${page === "clients" ? "clientes" : "técnicos"}`}
                        placeholder="Buscar por nombre, contacto o especialidad…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                      />
                    </label>
                    <span className="muted">
                      {(page === "clients" ? clients : technicians).length}{" "}
                      registrados
                    </span>
                  </div>
                  <div className="directory-grid">
                    {(page === "clients" ? clients : technicians)
                      .filter((r) =>
                        `${r.name} ${r.contact || ""} ${r.specialty || ""}`
                          .toLowerCase()
                          .includes(search.toLowerCase()),
                      )
                      .map((item) => {
                        const related = reports.filter((r) =>
                          page === "clients"
                            ? r.clientId === item.id
                            : r.technicianId === item.id,
                        );
                        return (
                          <article
                            className="panel directory-card"
                            key={item.id}
                          >
                            <div className="directory-top">
                              <span
                                className={`avatar large ${page === "clients" ? "client-avatar" : ""}`}
                              >
                                {initials(item.name)}
                              </span>
                              <button
                                className="icon-button"
                                aria-label={`Editar ${item.name}`}
                                onClick={() => openForm(page, item)}
                              >
                                <Icon name="edit" size={18} />
                              </button>
                            </div>
                            <h2>{item.name}</h2>
                            <p>
                              {item.category ||
                                item.specialty ||
                                (page === "clients"
                                  ? "Cliente"
                                  : "Técnico de campo")}
                            </p>
                            {page === "technicians" && (
                              <Badge value={item.status}>
                                {
                                  {
                                    disponible: "Disponible",
                                    "en-campo": "En campo",
                                    ausente: "Ausente",
                                  }[item.status]
                                }
                              </Badge>
                            )}
                            <div className="contact-details">
                              {item.contact && <span>{item.contact}</span>}
                              {item.email && (
                                <a href={`mailto:${item.email}`}>
                                  {item.email}
                                </a>
                              )}
                              {item.phone && (
                                <a href={`tel:${item.phone}`}>{item.phone}</a>
                              )}
                              {item.address && (
                                <span>
                                  <Icon name="location" size={15} />
                                  {item.address}
                                </span>
                              )}
                            </div>
                            <div className="directory-footer">
                              <span>
                                <strong>{related.length}</strong> servicios ·{" "}
                                {
                                  related.filter(
                                    (r) => r.estado !== "completado",
                                  ).length
                                }{" "}
                                activos
                              </span>
                              <button
                                className="text-button"
                                onClick={() => {
                                  goto("reports");
                                  setTimeout(() => setSearch(item.name), 0);
                                }}
                              >
                                Ver reportes <Icon name="arrow" size={15} />
                              </button>
                            </div>
                          </article>
                        );
                      })}
                  </div>
                  {!(page === "clients" ? clients : technicians).some((r) =>
                    `${r.name} ${r.contact || ""} ${r.specialty || ""}`
                      .toLowerCase()
                      .includes(search.toLowerCase()),
                  ) && (
                    <div className="panel">
                      <Empty
                        icon={page === "clients" ? "users" : "tool"}
                        title={
                          search
                            ? "Sin resultados"
                            : page === "clients"
                              ? "Conoce mejor a tus clientes"
                              : "Todo empieza con un buen equipo"
                        }
                        text={
                          search
                            ? "Prueba con otro nombre."
                            : "Agrega el primer registro y vincúlalo a tus reportes de servicio."
                        }
                        action={
                          page === "clients"
                            ? "Agregar cliente"
                            : "Agregar técnico"
                        }
                        onAction={() => openForm(page)}
                      />
                    </div>
                  )}
                </>
              )}
              {page === "agenda" && (
                <section className="panel">
                  <div className="panel-heading">
                    <div>
                      <h2>Calendario de servicios</h2>
                      <p>Visitas y reportes con fecha de atención</p>
                    </div>
                    <label className="date-filter">
                      Fecha{" "}
                      <input
                        type="date"
                        aria-label="Filtrar agenda por fecha"
                        value={agendaDate}
                        onChange={(e) => setAgendaDate(e.target.value)}
                      />
                      {agendaDate && (
                        <button
                          className="text-button"
                          onClick={() => setAgendaDate("")}
                        >
                          Ver todas
                        </button>
                      )}
                    </label>
                  </div>
                  {(!clients.length || !technicians.length) && (
                    <div className="inline-info">
                      Para programar una visita, primero agrega un cliente y un
                      técnico.
                      <button
                        className="text-button"
                        onClick={() =>
                          goto(!clients.length ? "clients" : "technicians")
                        }
                      >
                        Agregar {clients.length ? "técnico" : "cliente"}{" "}
                        <Icon name="arrow" size={15} />
                      </button>
                    </div>
                  )}
                  {schedule.filter(
                    (v) =>
                      !agendaDate ||
                      localDateTime(v.when).startsWith(agendaDate),
                  ).length ? (
                    <div className="agenda-list">
                      {schedule
                        .filter(
                          (v) =>
                            !agendaDate ||
                            localDateTime(v.when).startsWith(agendaDate),
                        )
                        .map((v) => (
                          <article className="agenda-item" key={v.id}>
                            <div className="agenda-day">
                              <strong>{new Date(v.when).getDate()}</strong>
                              <span>
                                {new Date(v.when).toLocaleDateString("es-MX", {
                                  month: "short",
                                })}
                              </span>
                            </div>
                            <div className="agenda-time">
                              <Icon name="clock" size={16} />
                              {new Date(v.when).toLocaleTimeString("es-MX", {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </div>
                            <div className="agenda-description">
                              <h3>{v.label}</h3>
                              <p>
                                {v.client} · {v.tech}
                              </p>
                              {v.notes && <small>{v.notes}</small>}
                            </div>
                            <Badge value={v.status || v.estado}>
                              {v.status === "programada"
                                ? "Programada"
                                : v.status === "realizada"
                                  ? "Realizada"
                                  : STATES[v.estado]}
                            </Badge>
                            <button
                              className="icon-button"
                              aria-label={`Editar ${v.label}`}
                              onClick={() => openForm(v.type, v)}
                            >
                              <Icon name="edit" size={18} />
                            </button>
                          </article>
                        ))}
                    </div>
                  ) : (
                    <Empty
                      icon="calendar"
                      title="Tu agenda está despejada"
                      text="Programa una visita o agrega una fecha a un reporte."
                      action="Programar visita"
                      onAction={() => openForm("visits")}
                    />
                  )}
                </section>
              )}
              {page === "sync" && (
                <>
                  <div className="sync-hero panel">
                    <span className={`sync-orb ${syncing ? "spinning" : ""}`}>
                      <Icon name="sync" size={35} />
                    </span>
                    <div>
                      <h2>
                        {syncing
                          ? "Sincronizando…"
                          : !online
                            ? "Puedes seguir trabajando sin conexión"
                            : mode === "local-only"
                              ? "Tus datos viven en este dispositivo"
                              : mode === "unavailable"
                                ? "El servidor no está disponible"
                                : pending.length
                                  ? "Tienes cambios por sincronizar"
                                  : "Tu trabajo está al día"}
                      </h2>
                      <p>
                        {mode === "local-only"
                          ? "La aplicación funciona de forma local. Conecta la base de datos del servidor para habilitar sincronización en la nube."
                          : "Los registros se guardan primero en este navegador y se envían al servidor cuando está disponible."}
                      </p>
                      <small>
                        Última sincronización:{" "}
                        {lastSync
                          ? new Date(lastSync).toLocaleString("es-MX")
                          : "Todavía no se ha completado"}
                      </small>
                    </div>
                    <button
                      className="button primary"
                      disabled={syncing || !online}
                      onClick={() => doSync(true)}
                    >
                      <Icon name="sync" size={18} />
                      {syncing ? "Sincronizando" : "Sincronizar ahora"}
                    </button>
                  </div>
                  <div className="stats-grid three">
                    <div className="stat-card">
                      <span>Registros locales</span>
                      <strong>{active.length}</strong>
                      <small>Disponibles en este navegador</small>
                    </div>
                    <div className="stat-card">
                      <span>Cambios locales</span>
                      <strong>{pending.length}</strong>
                      <small>En espera de confirmación del servidor</small>
                    </div>
                    <div className="stat-card">
                      <span>Conexión</span>
                      <strong className="text-value">
                        {online ? "En línea" : "Sin conexión"}
                      </strong>
                      <small>
                        {mode === "file"
                          ? "Servidor local conectado"
                          : ["redis", "d1"].includes(mode)
                            ? "Nube conectada"
                            : "Almacenamiento en dispositivo"}
                      </small>
                    </div>
                  </div>
                  <section className="panel">
                    <div className="panel-heading">
                      <div>
                        <h2>Actividad pendiente</h2>
                        <p>
                          Los cambios se conservan hasta que el servidor los
                          confirme.
                        </p>
                      </div>
                      <button className="button secondary" onClick={backup}>
                        <Icon name="download" size={16} />
                        Respaldar
                      </button>
                    </div>
                    {pending.length ? (
                      <div className="pending-list">
                        {pending.map((r) => (
                          <div key={r.id}>
                            <span className="pending-icon">
                              <Icon
                                name={
                                  r.deleted
                                    ? "trash"
                                    : r.collection === "reports"
                                      ? "reports"
                                      : "users"
                                }
                                size={18}
                              />
                            </span>
                            <span>
                              <strong>{r.title || r.name || r.tecnico}</strong>
                              <small>
                                {r.deleted ? "Eliminación" : "Guardado local"} ·{" "}
                                {date(r.updatedAt)}
                              </small>
                            </span>
                            <Badge value="pendiente">
                              {mode === "local-only"
                                ? "En dispositivo"
                                : "Por sincronizar"}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <Empty
                        icon="check"
                        title="Todo en orden"
                        text="Los nuevos cambios aparecerán aquí hasta que se sincronicen."
                      />
                    )}
                  </section>
                </>
              )}
              {page === "settings" && (
                <div className="settings-grid">
                  <section className="panel settings-panel">
                    <div className="panel-heading">
                      <div>
                        <h2>Tu espacio de trabajo</h2>
                        <p>Dale tu identidad a Fielddesk</p>
                      </div>
                      <Icon name="settings" />
                    </div>
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        try {
                          if (!profile.name.trim() || !profile.person.trim())
                            throw new Error();
                          localStorage.setItem(
                            "fielddesk-profile",
                            JSON.stringify(profile),
                          );
                          notify("Configuración guardada.");
                        } catch {
                          notify(
                            "Completa el nombre del espacio y tu nombre.",
                            true,
                          );
                        }
                      }}
                    >
                      <Field label="Nombre del espacio">
                        <input
                          required
                          maxLength={60}
                          value={profile.name}
                          onChange={(e) =>
                            setProfile({ ...profile, name: e.target.value })
                          }
                        />
                      </Field>
                      <Field label="Tu nombre">
                        <input
                          required
                          maxLength={60}
                          value={profile.person}
                          onChange={(e) =>
                            setProfile({ ...profile, person: e.target.value })
                          }
                        />
                      </Field>
                      <button className="button primary" type="submit">
                        Guardar cambios
                      </button>
                    </form>
                  </section>
                  <section className="panel settings-panel">
                    <div className="panel-heading">
                      <div>
                        <h2>Respaldo de datos</h2>
                        <p>Conserva una copia de tu trabajo</p>
                      </div>
                      <Icon name="download" />
                    </div>
                    <p>
                      Exporta todos los registros en JSON. Puedes restaurarlos
                      en este u otro dispositivo; los registros nuevos se
                      combinan con los existentes.
                    </p>
                    <div className="settings-actions">
                      <button className="button secondary" onClick={backup}>
                        <Icon name="download" size={17} />
                        Exportar respaldo
                      </button>
                      <button
                        className="button secondary"
                        onClick={() => importRef.current?.click()}
                      >
                        <Icon name="upload" size={17} />
                        Restaurar respaldo
                      </button>
                    </div>
                    <hr />
                    <h3>Reportes para tu equipo</h3>
                    <p>Descarga tus servicios como una hoja de cálculo.</p>
                    <button
                      className="text-button"
                      disabled={!reports.length}
                      onClick={() => exportCSV(reports)}
                    >
                      Exportar reportes CSV <Icon name="arrow" size={16} />
                    </button>
                  </section>
                  <section className="panel settings-panel">
                    <div className="panel-heading">
                      <div>
                        <h2>Fielddesk en tu móvil</h2>
                        <p>Siempre a mano, incluso en campo</p>
                      </div>
                      <Icon name="tool" />
                    </div>
                    <p>
                      En Android, usa “Instalar aplicación” en el menú del
                      navegador. En iPhone, abre Safari y selecciona Compartir →
                      Agregar a inicio.
                    </p>
                    {installPrompt && (
                      <button
                        className="button primary"
                        onClick={async () => {
                          await installPrompt.prompt();
                          await installPrompt.userChoice;
                          setInstallPrompt(null);
                        }}
                      >
                        Instalar aplicación
                      </button>
                    )}
                    <div className="feature-check">
                      <Icon name="check" size={17} />
                      Diseño adaptable a móvil y escritorio
                    </div>
                    <div className="feature-check">
                      <Icon name="check" size={17} />
                      Creación y consulta sin conexión
                    </div>
                  </section>
                  <section className="panel settings-panel">
                    <div className="panel-heading">
                      <div>
                        <h2>Almacenamiento y privacidad</h2>
                        <p>Tú controlas tu información</p>
                      </div>
                      <Icon name="cloud" />
                    </div>
                    <p>
                      Los datos locales pertenecen a este navegador. Borrar los
                      datos del sitio también borra esta copia. Descarga
                      respaldos periódicamente.
                    </p>
                    <p>
                      En la versi?n de Sites, inicia sesi?n con la misma cuenta
                      para recuperar tus registros en otro dispositivo. Tambi?n
                      puedes trasladarlos con un respaldo.
                    </p>
                    <span className="subtle-tag">Fielddesk · versión 2.0</span>
                  </section>
                </div>
              )}
            </>
          )}
          <footer className="page-footer">
            <span>
              fielddesk<span className="brand-period">.</span>
            </span>
            <span>Menos pendientes. Más soluciones.</span>
          </footer>
        </main>
      </div>
      <nav className="mobile-nav" aria-label="Navegación móvil">
        {[NAV[0], NAV[1], NAV[4], NAV[2]].map(([key, label, icon]) => (
          <a
            href={`#${key}`}
            key={key}
            className={page === key ? "active" : ""}
            aria-current={page === key ? "page" : undefined}
          >
            <Icon name={icon} size={21} />
            <span>{label}</span>
          </a>
        ))}
        <button
          onClick={() => setMenu(!menu)}
          aria-expanded={menu}
          className={
            ["technicians", "sync", "settings"].includes(page) ? "active" : ""
          }
        >
          <Icon name="menu" size={21} />
          <span>Más</span>
        </button>
      </nav>
      <input
        ref={importRef}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={handleImport}
      />
      {(modal || confirmDelete) && (
        <div
          className="modal-overlay"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !saving) {
              setModal(null);
              setConfirmDelete(null);
            }
          }}
        >
          <section
            className={`modal ${confirmDelete ? "confirm-modal" : ""}`}
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="dialog-title"
          >
            {confirmDelete ? (
              <>
                <div className="modal-header">
                  <h2 id="dialog-title">Eliminar registro</h2>
                  <button
                    className="icon-button"
                    aria-label="Cancelar"
                    onClick={() => setConfirmDelete(null)}
                  >
                    <Icon name="close" />
                  </button>
                </div>
                <div className="modal-body">
                  <p>
                    Se eliminará{" "}
                    <strong>{confirmDelete.title || confirmDelete.name}</strong>{" "}
                    de este espacio. Los reportes vinculados conservarán sus
                    datos.
                  </p>
                </div>
                <div className="modal-footer">
                  <button
                    className="button secondary"
                    onClick={() => setConfirmDelete(null)}
                    disabled={saving}
                  >
                    Cancelar
                  </button>
                  <button
                    className="button danger"
                    onClick={remove}
                    disabled={saving}
                  >
                    {saving ? "Eliminando…" : "Eliminar registro"}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="modal-header">
                  <div>
                    <span className="eyebrow">CADA DETALLE CUENTA</span>
                    <h2 id="dialog-title">
                      {modal.editing
                        ? "Editar"
                        : modal.type === "visits"
                          ? "Programar"
                          : "Nuevo"}{" "}
                      {
                        {
                          reports: "reporte",
                          clients: "cliente",
                          technicians: "técnico",
                          visits: "visita",
                        }[modal.type]
                      }
                    </h2>
                  </div>
                  <button
                    className="icon-button"
                    disabled={saving}
                    aria-label="Cerrar formulario"
                    onClick={() => setModal(null)}
                  >
                    <Icon name="close" />
                  </button>
                </div>
                <form onSubmit={save}>
                  <div className="modal-body form-grid">
                    {formError && (
                      <div className="form-error wide" role="alert">
                        {formError}
                      </div>
                    )}
                    {modal.type === "reports" ? (
                      <>
                        <Field label="Título del servicio *" wide>
                          <input
                            name="title"
                            value={form.title}
                            onChange={change}
                            required
                            maxLength={160}
                            placeholder="Ej. Mantenimiento del sistema de riego"
                          />
                        </Field>
                        <Field label="Cliente registrado">
                          <select
                            name="clientId"
                            value={form.clientId || ""}
                            onChange={selectClient}
                          >
                            <option value="">Capturar manualmente</option>
                            {clients.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name}
                              </option>
                            ))}
                          </select>
                        </Field>
                        <Field label="Cliente / ubicación *">
                          <input
                            name="clienteUbicacion"
                            value={form.clienteUbicacion}
                            onChange={change}
                            required
                            maxLength={200}
                            placeholder="Nombre o dirección del servicio"
                          />
                        </Field>
                        <Field label="Técnico del equipo">
                          <select
                            name="technicianId"
                            value={form.technicianId || ""}
                            onChange={selectTechnician}
                          >
                            <option value="">Capturar manualmente</option>
                            {technicians.map((t) => (
                              <option key={t.id} value={t.id}>
                                {t.name}
                              </option>
                            ))}
                          </select>
                        </Field>
                        <Field label="Nombre del técnico *">
                          <input
                            name="tecnico"
                            value={form.tecnico}
                            onChange={change}
                            required
                            maxLength={120}
                            placeholder="Responsable del servicio"
                          />
                        </Field>
                        <Field label="Descripción del problema *" wide>
                          <textarea
                            name="descripcionProblema"
                            value={form.descripcionProblema}
                            onChange={change}
                            required
                            maxLength={5000}
                            rows={4}
                            placeholder="Describe el problema, los equipos y el diagnóstico…"
                          />
                        </Field>
                        <Field label="Estado">
                          <select
                            name="estado"
                            value={form.estado}
                            onChange={change}
                          >
                            {Object.entries(STATES).map(([v, l]) => (
                              <option value={v} key={v}>
                                {l}
                              </option>
                            ))}
                          </select>
                        </Field>
                        <Field label="Prioridad">
                          <select
                            name="priority"
                            value={form.priority}
                            onChange={change}
                          >
                            {Object.entries(PRIORITIES).map(([v, l]) => (
                              <option value={v} key={v}>
                                {l}
                              </option>
                            ))}
                          </select>
                        </Field>
                        <Field label="Tipo de servicio">
                          <select
                            name="category"
                            value={form.category}
                            onChange={change}
                          >
                            {[
                              "Mantenimiento",
                              "Electricidad",
                              "Conectividad",
                              "Climatización",
                              "Instalación",
                              "Otro",
                            ].map((c) => (
                              <option key={c}>{c}</option>
                            ))}
                          </select>
                        </Field>
                        <Field label="Fecha de atención">
                          <input
                            type="datetime-local"
                            name="scheduledAt"
                            value={localDateTime(form.scheduledAt)}
                            onChange={change}
                          />
                        </Field>
                        <Field label="Solución / seguimiento" wide>
                          <textarea
                            name="resolution"
                            value={form.resolution || ""}
                            onChange={change}
                            maxLength={5000}
                            rows={3}
                            placeholder="Trabajo realizado, materiales y próximos pasos…"
                          />
                        </Field>
                      </>
                    ) : modal.type === "visits" ? (
                      <>
                        <Field label="Título de la visita *" wide>
                          <input
                            name="name"
                            value={form.name}
                            onChange={change}
                            required
                            maxLength={160}
                            placeholder="Ej. Mantenimiento preventivo"
                          />
                        </Field>
                        <Field label="Cliente *">
                          <select
                            name="clientId"
                            value={form.clientId}
                            onChange={change}
                            required
                          >
                            <option value="">Selecciona un cliente</option>
                            {clients.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name}
                              </option>
                            ))}
                          </select>
                        </Field>
                        <Field label="Técnico *">
                          <select
                            name="technicianId"
                            value={form.technicianId}
                            onChange={change}
                            required
                          >
                            <option value="">Selecciona un técnico</option>
                            {technicians.map((t) => (
                              <option key={t.id} value={t.id}>
                                {t.name}
                              </option>
                            ))}
                          </select>
                        </Field>
                        <Field label="Fecha *">
                          <input
                            name="date"
                            type="date"
                            value={form.date}
                            onChange={change}
                            required
                          />
                        </Field>
                        <Field label="Hora *">
                          <input
                            name="time"
                            type="time"
                            value={form.time}
                            onChange={change}
                            required
                          />
                        </Field>
                        <Field label="Estado">
                          <select
                            name="status"
                            value={form.status}
                            onChange={change}
                          >
                            <option value="programada">Programada</option>
                            <option value="realizada">Realizada</option>
                            <option value="cancelada">Cancelada</option>
                          </select>
                        </Field>
                        <Field label="Indicaciones" wide>
                          <textarea
                            name="notes"
                            value={form.notes}
                            onChange={change}
                            maxLength={5000}
                            rows={3}
                          />
                        </Field>
                      </>
                    ) : (
                      <>
                        <Field
                          label={
                            modal.type === "clients"
                              ? "Nombre del cliente / empresa *"
                              : "Nombre completo *"
                          }
                          wide
                        >
                          <input
                            name="name"
                            value={form.name}
                            onChange={change}
                            required
                            maxLength={160}
                          />
                        </Field>
                        {modal.type === "clients" ? (
                          <>
                            <Field label="Persona de contacto">
                              <input
                                name="contact"
                                value={form.contact}
                                onChange={change}
                                maxLength={120}
                              />
                            </Field>
                            <Field label="Sector / giro">
                              <input
                                name="category"
                                value={form.category}
                                onChange={change}
                                maxLength={80}
                              />
                            </Field>
                            <Field label="Dirección" wide>
                              <input
                                name="address"
                                value={form.address}
                                onChange={change}
                                maxLength={300}
                              />
                            </Field>
                          </>
                        ) : (
                          <>
                            <Field label="Especialidad">
                              <input
                                name="specialty"
                                value={form.specialty}
                                onChange={change}
                                maxLength={120}
                              />
                            </Field>
                            <Field label="Disponibilidad">
                              <select
                                name="status"
                                value={form.status}
                                onChange={change}
                              >
                                <option value="disponible">Disponible</option>
                                <option value="en-campo">En campo</option>
                                <option value="ausente">Ausente</option>
                              </select>
                            </Field>
                          </>
                        )}
                        <Field label="Correo electrónico">
                          <input
                            name="email"
                            type="email"
                            value={form.email}
                            onChange={change}
                            maxLength={200}
                          />
                        </Field>
                        <Field label="Teléfono">
                          <input
                            name="phone"
                            type="tel"
                            value={form.phone}
                            onChange={change}
                            maxLength={30}
                          />
                        </Field>
                      </>
                    )}
                    <p className="form-hint wide">
                      <Icon name="check" size={15} />
                      Se guarda en este dispositivo, incluso sin conexión. *
                      Campos obligatorios.
                    </p>
                  </div>
                  <div className="modal-footer">
                    {modal.editing && (
                      <button
                        className="button delete-button"
                        type="button"
                        onClick={() => setConfirmDelete(form)}
                        disabled={saving}
                      >
                        <Icon name="trash" size={16} />
                        Eliminar
                      </button>
                    )}
                    <span className="footer-spacer" />
                    <button
                      className="button secondary"
                      type="button"
                      onClick={() => setModal(null)}
                      disabled={saving}
                    >
                      Cancelar
                    </button>
                    <button
                      className="button primary"
                      type="submit"
                      disabled={saving}
                    >
                      {saving ? "Guardando…" : "Guardar cambios"}
                      <Icon name="check" size={17} />
                    </button>
                  </div>
                </form>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
