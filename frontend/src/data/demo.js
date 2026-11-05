import { id, saveRecord } from "./workspace";
export async function loadDemo() {
  const clients = [
    {
      id: id(),
      name: "Rancho Los Olivos",
      contact: "María González",
      phone: "5550000101",
      email: "contacto@example.com",
      address: "Carretera rural km 12",
      category: "Agroindustria",
    },
    {
      id: id(),
      name: "Clínica San Rafael",
      contact: "Luis Méndez",
      phone: "5550000102",
      address: "Av. Reforma 240",
      category: "Salud",
    },
    {
      id: id(),
      name: "Café Central",
      contact: "Ana Torres",
      phone: "5550000103",
      address: "Centro, local 4",
      category: "Comercio",
    },
  ];
  const technicians = [
    {
      id: id(),
      name: "Daniel Herrera",
      specialty: "Electricidad",
      phone: "5550000201",
      email: "daniel@example.com",
      status: "disponible",
    },
    {
      id: id(),
      name: "Sofía Martínez",
      specialty: "Redes y conectividad",
      phone: "5550000202",
      email: "sofia@example.com",
      status: "en-campo",
    },
    {
      id: id(),
      name: "Carlos Rivera",
      specialty: "Climatización",
      phone: "5550000203",
      status: "disponible",
    },
  ];
  for (const c of clients) await saveRecord("clients", c);
  for (const t of technicians) await saveRecord("technicians", t);
  const titles = [
    "Revisión del sistema de riego",
    "Restablecer conexión de red",
    "Mantenimiento de aire acondicionado",
    "Inspección de tablero eléctrico",
    "Configuración de punto de acceso",
    "Cambio de filtro y limpieza",
  ];
  for (let i = 0; i < titles.length; i++) {
    const scheduled = new Date();
    scheduled.setDate(scheduled.getDate() + (i % 3));
    scheduled.setHours(9 + i, 0, 0, 0);
    await saveRecord("reports", {
      title: titles[i],
      tecnico: technicians[i % 3].name,
      technicianId: technicians[i % 3].id,
      clientId: clients[i % 3].id,
      clienteUbicacion: clients[i % 3].name,
      descripcionProblema: `${titles[i]}. Revisar el equipo, documentar el diagnóstico y confirmar el funcionamiento con el cliente.`,
      estado: ["pendiente", "en-proceso", "completado"][i % 3],
      priority: ["alta", "media", "baja"][i % 3],
      category: ["Electricidad", "Conectividad", "Climatización"][i % 3],
      scheduledAt: scheduled.toISOString(),
      createdAt: new Date(Date.now() - i * 86400000).toISOString(),
    });
  }
  await saveRecord("visits", {
    name: "Revisión preventiva",
    clientId: clients[0].id,
    technicianId: technicians[0].id,
    date: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
    time: "09:00",
    notes: "Confirmar acceso con el encargado.",
    status: "programada",
  });
}
