import React, { useState, useEffect } from "react";
import axios from "axios";
import Logo from "./assets/Logo.svg";

const API_URL = "http://localhost:5000";

export default function App() {
  const [activeTab, setActiveTab] = useState("cotizador");
  const [googleConectado, setGoogleConectado] = useState(false);
  const [cargandoMails, setCargandoMails] = useState(false);
  const [cargandoBorrador, setCargandoBorrador] = useState(false);

  // Mails y Consultas
  const [listaMails, setListaMails] = useState([]);
  const [mailSeleccionado, setMailSeleccionado] = useState(null);
  const [mailCliente, setMailCliente] = useState("");
  const [solicitudText, setSolicitudText] = useState("");
  const [notificacion, setNotificacion] = useState("");

  // Reglas y Catálogo
  const [reglasIA, setReglasIA] = useState("");
  const [guardandoReglas, setGuardandoReglas] = useState(false);
  const [catalogoPreview, setCatalogoPreview] = useState("");
  const [procesandoCatalogo, setProcesandoCatalogo] = useState(false);

  // Catálogo de Productos y Paginación
  const [productosDB, setProductosDB] = useState([]);
  const [busqueda, setBusqueda] = useState("");
  const [subiendoFotoId, setSubiendoFotoId] = useState(null);
  const [paginaActual, setPaginaActual] = useState(1);
  const itemsPorPagina = 10;

  // Modal de Edición Comercial
  const [productoEditar, setProductoEditar] = useState(null);
  const [guardandoProducto, setGuardandoProducto] = useState(false);

  useEffect(() => {
    fetchMails();
    fetchReglas();
    fetchProductosDB();
  }, []);

  useEffect(() => {
    setPaginaActual(1);
  }, [busqueda]);

  const fetchMails = async () => {
    setCargandoMails(true);
    try {
      const res = await axios.get(`${API_URL}/api/mails`);
      if (res.data && res.data.mails) {
        setListaMails(res.data.mails);
        setGoogleConectado(true);
      }
    } catch (err) {
      setGoogleConectado(false);
    } finally {
      setCargandoMails(false);
    }
  };

  const fetchReglas = async () => {
    try {
      const res = await axios.get(`${API_URL}/api/reglas`);
      if (res.data && res.data.reglas) setReglasIA(res.data.reglas);
    } catch (err) {
      console.log("Cargando configuración...");
    }
  };

  const fetchProductosDB = async () => {
    try {
      const res = await axios.get(`${API_URL}/api/productos`);
      if (res.data && res.data.productos) setProductosDB(res.data.productos);
    } catch (err) {
      console.log("Cargando catálogo...");
    }
  };

  const handleSelectMail = (mail) => {
    setMailSeleccionado(mail);
    setMailCliente(mail.emailCliente);
    setSolicitudText(
      `Consulta recibida: ${mail.asunto}\n\nDetalle: ${mail.resumen}`,
    );
    setNotificacion("");
  };

  const handleCrearBorradorDirecto = async () => {
    if (!mailCliente || !solicitudText)
      return alert("Por favor seleccioná una consulta o completá los campos.");
    setCargandoBorrador(true);
    setNotificacion("");

    try {
      const res = await axios.post(`${API_URL}/api/crear-borrador-gmail`, {
        mailCliente,
        consultaText: solicitudText,
        asunto: mailSeleccionado
          ? mailSeleccionado.asunto
          : "Presupuesto Conoflex Argentina",
        threadId: mailSeleccionado ? mailSeleccionado.threadId : null,
      });

      if (res.data.success) {
        setNotificacion(
          "✨ Presupuesto generado e inyectado con éxito en su casilla de Gmail.",
        );
      }
    } catch (err) {
      alert("Error al generar la propuesta comercial.");
    } finally {
      setCargandoBorrador(false);
    }
  };

  const handleSubirListaPrecios = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("lista_precios", file);

    setProcesandoCatalogo(true);
    try {
      const res = await axios.post(
        `${API_URL}/api/catalogo/procesar`,
        formData,
        {
          headers: { "Content-Type": "multipart/form-data" },
        },
      );

      if (res.data.success) {
        setCatalogoPreview(res.data.contenidoPreview);
        fetchProductosDB();
        alert("🎉 Catálogo de precios actualizado correctamente.");
      }
    } catch (err) {
      alert("Error procesando la lista.");
    } finally {
      setProcesandoCatalogo(false);
    }
  };

  const handleGuardarReglas = async () => {
    setGuardandoReglas(true);
    try {
      await axios.post(`${API_URL}/api/reglas`, { reglas: reglasIA });
      alert("💾 Políticas comerciales guardadas correctamente.");
    } catch (err) {
      alert("Error guardando configuración.");
    } finally {
      setGuardandoReglas(false);
    }
  };

  const handleUploadFotoProducto = async (productoId, tipo, e) => {
    const file = e.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("imagen", file);
    formData.append("tipo", tipo);

    setSubiendoFotoId(`${productoId}-${tipo}`);
    try {
      await axios.post(
        `${API_URL}/api/productos/${productoId}/imagen`,
        formData,
        {
          headers: { "Content-Type": "multipart/form-data" },
        },
      );
      fetchProductosDB();
    } catch (err) {
      alert("Error al adjuntar la imagen.");
    } finally {
      setSubiendoFotoId(null);
    }
  };

  const handleGuardarEdicionProducto = async () => {
    if (!productoEditar) return;
    setGuardandoProducto(true);
    try {
      await axios.put(
        `${API_URL}/api/productos/${productoEditar.id}`,
        productoEditar,
      );
      fetchProductosDB();
      setProductoEditar(null);
    } catch (err) {
      alert("Error al actualizar el producto.");
    } finally {
      setGuardandoProducto(false);
    }
  };

  // Filtrado de Productos
  const productosFiltrados = productosDB.filter(
    (p) =>
      (p.codigo && p.codigo.toLowerCase().includes(busqueda.toLowerCase())) ||
      (p.nombre && p.nombre.toLowerCase().includes(busqueda.toLowerCase())) ||
      (p.aplicacion &&
        p.aplicacion.toLowerCase().includes(busqueda.toLowerCase())),
  );

  // Paginación
  const totalPaginas =
    Math.ceil(productosFiltrados.length / itemsPorPagina) || 1;
  const indiceInicio = (paginaActual - 1) * itemsPorPagina;
  const productosPaginados = productosFiltrados.slice(
    indiceInicio,
    indiceInicio + itemsPorPagina,
  );

  return (
    <div className="flex h-screen bg-slate-900 font-sans text-slate-800 antialiased selection:bg-orange-500 selection:text-white">
      {/* NAVEGACIÓN LATERAL PREMIUM */}
      <aside className="w-72 bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-white flex flex-col justify-between p-5 border-r border-slate-800/80 shadow-2xl relative z-10">
        <div>
          {/* LOGO EMPRESARIAL */}
          <div className="flex items-center gap-3.5 px-3 py-5 border-b border-slate-800/80">
            <div className="w-11 h-11">
              <img src={Logo} alt="Conoflex Logo" className="w-full h-full object-contain" />
            </div>
            <div>
              <h1 className="font-extrabold text-xl tracking-tight text-white">
                CONOFLEX
              </h1>
              <p className="text-[11px] text-orange-400 font-semibold tracking-wider uppercase">
                Plataforma Comercial
              </p>
            </div>
          </div>

          {/* MENÚ PRINCIPAL */}
          <nav className="mt-8 space-y-2">
            <button
              onClick={() => setActiveTab("cotizador")}
              className={`w-full flex items-center gap-3.5 px-4 py-3.5 rounded-xl text-xs font-bold transition-all duration-300 ${
                activeTab === "cotizador"
                  ? "bg-gradient-to-r from-orange-600 to-orange-500 text-white shadow-lg shadow-orange-600/30 translate-x-1"
                  : "text-slate-400 hover:bg-slate-800/60 hover:text-white"
              }`}
            >
              <span className="text-base">📩</span>
              <span>Cotizador de Correos</span>
            </button>

            <button
              onClick={() => setActiveTab("catalogo_db")}
              className={`w-full flex items-center gap-3.5 px-4 py-3.5 rounded-xl text-xs font-bold transition-all duration-300 ${
                activeTab === "catalogo_db"
                  ? "bg-gradient-to-r from-orange-600 to-orange-500 text-white shadow-lg shadow-orange-600/30 translate-x-1"
                  : "text-slate-400 hover:bg-slate-800/60 hover:text-white"
              }`}
            >
              <span className="text-base">🗂️</span>
              <span>Catálogo & Fichas Técnicas</span>
            </button>

            <button
              onClick={() => setActiveTab("entrenamiento")}
              className={`w-full flex items-center gap-3.5 px-4 py-3.5 rounded-xl text-xs font-bold transition-all duration-300 ${
                activeTab === "entrenamiento"
                  ? "bg-gradient-to-r from-orange-600 to-orange-500 text-white shadow-lg shadow-orange-600/30 translate-x-1"
                  : "text-slate-400 hover:bg-slate-800/60 hover:text-white"
              }`}
            >
              <span className="text-base">⚙️</span>
              <span>Cargar Lista & Políticas</span>
            </button>
          </nav>
        </div>

        {/* ESTADO DEL SERVICIO */}
        <div className="bg-slate-900/90 p-4 rounded-2xl border border-slate-800 backdrop-blur-md shadow-inner">
          <div className="flex items-center justify-between text-xs mb-1.5">
            <span className="text-slate-400 font-medium">
              Servicio de Correo
            </span>
            <span className="relative flex h-2.5 w-2.5">
              <span
                className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${googleConectado ? "bg-emerald-400" : "bg-red-400"}`}
              ></span>
              <span
                className={`relative inline-flex rounded-full h-2.5 w-2.5 ${googleConectado ? "bg-emerald-500" : "bg-red-500"}`}
              ></span>
            </span>
          </div>
          <p
            className={`text-xs font-bold ${googleConectado ? "text-emerald-400" : "text-red-400"}`}
          >
            {googleConectado ? "✓ Servidor Sincronizado" : "❌ Sin Conexión"}
          </p>
        </div>
      </aside>

      {/* ÁREA DE TRABAJO */}
      <main className="flex-1 bg-slate-100 flex flex-col overflow-y-auto">
        {/* ENCABEZADO SUPERIOR */}
        <header className="bg-white/80 backdrop-blur-md sticky top-0 z-20 border-b border-slate-200/80 px-8 py-4 flex items-center justify-between shadow-sm">
          <div>
            <h2 className="text-xl font-black text-slate-900 tracking-tight">
              {activeTab === "cotizador" &&
                "Generador Automático de Propuestas Comerciales"}
              {activeTab === "catalogo_db" &&
                "Catálogo Digital de Productos Conoflex"}
              {activeTab === "entrenamiento" &&
                "Gestión de Listas de Precios y Políticas de Venta"}
            </h2>
            <p className="text-xs text-slate-500 font-medium">
              Conoflex Argentina — Sistema de Ventas
            </p>
          </div>

          <a
            href={`${API_URL}/auth/google`}
            className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all duration-200 shadow-md hover:shadow-lg active:scale-95 flex items-center gap-2"
          >
            <span>🔗</span> Conectar Servicio de Correo
          </a>
        </header>

        {/* CONTENIDO PRINCIPAL */}
        <div className="p-8 flex-1">
          {/* TAB 1: COTIZADOR */}
          {activeTab === "cotizador" && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 h-full">
              {/* LISTA DE CONSULTAS */}
              <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xl shadow-slate-200/50 flex flex-col">
                <div className="flex items-center justify-between mb-5 pb-3 border-b border-slate-100">
                  <h3 className="font-extrabold text-slate-800 text-sm tracking-wide">
                    📬 Consultas Recibidas ({listaMails.length})
                  </h3>
                  <button
                    onClick={fetchMails}
                    className="text-xs text-orange-600 hover:text-orange-700 font-bold flex items-center gap-1 transition"
                  >
                    <span>🔄</span> Actualizar
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto space-y-3 pr-1 min-h-[350px]">
                  {cargandoMails ? (
                    <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-2">
                      <div className="w-6 h-6 border-2 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
                      <p className="text-xs font-medium">
                        Sincronizando bandeja de entrada...
                      </p>
                    </div>
                  ) : listaMails.length > 0 ? (
                    listaMails.map((mail) => (
                      <div
                        key={mail.id}
                        onClick={() => handleSelectMail(mail)}
                        className={`p-4 rounded-2xl border text-left cursor-pointer transition-all duration-200 ${
                          mailSeleccionado && mailSeleccionado.id === mail.id
                            ? "border-orange-500 bg-orange-50/60 shadow-md ring-2 ring-orange-500/20"
                            : "border-slate-200/70 hover:border-orange-300 hover:bg-slate-50/80"
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-xs font-bold text-slate-800 truncate">
                            {mail.asunto}
                          </p>
                          <span className="text-[10px] bg-orange-100 text-orange-700 font-bold px-2 py-0.5 rounded-full">
                            Nuevo
                          </span>
                        </div>
                        <p className="text-[11px] font-semibold text-slate-500 truncate">
                          {mail.remitente}
                        </p>
                        <p className="text-[11px] text-slate-400 line-clamp-2 mt-1.5 leading-relaxed">
                          {mail.resumen}
                        </p>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-16 text-xs text-slate-400 font-medium">
                      No hay consultas pendientes etiquetadas.
                    </div>
                  )}
                </div>
              </div>

              {/* DETALLE Y BOTÓN GENERAR */}
              <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xl shadow-slate-200/50 flex flex-col justify-between">
                <div>
                  <h3 className="font-extrabold text-slate-800 text-base mb-5 pb-3 border-b border-slate-100">
                    Detalle de la Solicitud Comercial
                  </h3>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1.5">
                        Cliente / Correo Destino
                      </label>
                      <input
                        type="text"
                        value={mailCliente}
                        onChange={(e) => setMailCliente(e.target.value)}
                        placeholder="ejemplo@cliente.com"
                        className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none transition"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1.5">
                        Requerimiento del Cliente
                      </label>
                      <textarea
                        rows="8"
                        value={solicitudText}
                        onChange={(e) => setSolicitudText(e.target.value)}
                        placeholder="Seleccioná un correo de la lista o escribí el requerimiento del cliente..."
                        className="w-full p-4 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none transition leading-relaxed"
                      ></textarea>
                    </div>
                  </div>

                  {notificacion && (
                    <div className="mt-4 p-4 bg-emerald-50 border border-emerald-300 text-emerald-900 text-xs rounded-2xl font-bold flex items-center gap-2 animate-fade-in">
                      <span>{notificacion}</span>
                    </div>
                  )}
                </div>

                <button
                  onClick={handleCrearBorradorDirecto}
                  disabled={cargandoBorrador}
                  className="mt-6 w-full py-4 bg-gradient-to-r from-orange-600 to-orange-500 hover:from-orange-500 hover:to-orange-600 text-white font-extrabold text-sm rounded-2xl transition-all duration-300 shadow-lg shadow-orange-600/30 hover:shadow-orange-600/50 hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50"
                >
                  {cargandoBorrador
                    ? "⌛ Analizando catálogo y preparando borrador..."
                    : "🚀 Generar Propuesta en Gmail"}
                </button>
              </div>
            </div>
          )}

          {/* TAB 2: CATÁLOGO & FICHAS TÉCNICAS */}
          {activeTab === "catalogo_db" && (
            <div className="space-y-3">
              {/* BARRA DE BÚSQUEDA */}
              <div className="flex items-center justify-between gap-4 bg-white p-4 rounded-3xl border border-slate-200/80 shadow-lg shadow-slate-200/50">
                <div className="relative flex-1">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-sm">
                    🔍
                  </span>
                  <input
                    type="text"
                    placeholder="Buscar producto por código, nombre o uso (ej: garage, autopista, ruta, obra)..."
                    value={busqueda}
                    onChange={(e) => setBusqueda(e.target.value)}
                    className="w-full pl-11 pr-4 py-2.5 border border-slate-200 rounded-2xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-orange-500 transition"
                  />
                </div>
                <div className="bg-slate-100 px-4 py-2 rounded-2xl text-xs text-slate-700 font-extrabold">
                  Total: {productosFiltrados.length} productos
                </div>
              </div>

              {/* TABLA CON ANCHOS FIJOS Y PAGINACIÓN */}
              <div className="bg-white rounded-3xl border border-slate-200/80 shadow-xl shadow-slate-200/50 overflow-hidden flex flex-col justify-between">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse table-fixed">
                    <thead className="bg-slate-950 text-white font-extrabold uppercase tracking-wider text-[11px]">
                      <tr>
                        <th className="p-4 w-28">Código</th>
                        <th className="p-4 w-48">Nombre</th>
                        <th className="p-4 w-32">Precio Lista</th>
                        <th className="p-4 w-48">Aplicación / Usos</th>
                        <th className="p-4 w-36">Foto Técnica</th>
                        <th className="p-4 w-36">Foto Catálogo</th>
                        <th className="p-4 w-24 text-center">Acción</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {productosPaginados.length > 0 ? (
                        productosPaginados.map((p) => (
                          <tr
                            key={p.id}
                            className="hover:bg-slate-50/80 transition-colors"
                          >
                            <td className="px-4 py-2 font-mono font-bold text-orange-600 truncate">
                              {p.codigo}
                            </td>
                            <td
                              className="px-4 py-2 font-bold text-slate-800 truncate"
                              title={p.nombre}
                            >
                              {p.nombre}
                            </td>
                            <td className="px-4 py-2 font-semibold text-slate-700 truncate">
                              {p.precio_lista}
                            </td>

                            {/* Campo Aplicación */}
                            <td className="px-4 py-2">
                              {p.aplicacion ? (
                                <span className="bg-orange-50 text-orange-800 border border-orange-200/80 px-2.5 py-1 rounded-xl text-[11px] font-semibold line-clamp-2">
                                  {p.aplicacion}
                                </span>
                              ) : (
                                <span className="text-[10px] text-slate-400 italic">
                                  Sin especificar
                                </span>
                              )}
                            </td>

                            {/* Foto Técnica */}
                            <td className="px-4 py-2">
                              <div className="flex items-center gap-2">
                                {p.foto_tecnica ? (
                                  <img
                                    src={p.foto_tecnica}
                                    alt="Técnica"
                                    className="w-10 h-10 object-contain border rounded-lg bg-white shadow-sm flex-shrink-0"
                                  />
                                ) : (
                                  <span className="text-[10px] text-slate-400 bg-slate-100 px-2 py-1 rounded-md flex-shrink-0">
                                    Sin foto
                                  </span>
                                )}
                                <label className="cursor-pointer text-[10px] bg-slate-900 hover:bg-slate-800 text-white px-2.5 py-1.5 rounded-lg font-bold transition flex-shrink-0">
                                  {subiendoFotoId === `${p.id}-tecnica`
                                    ? "..."
                                    : "📷 Adjuntar"}
                                  <input
                                    type="file"
                                    accept="image/*"
                                    onChange={(e) =>
                                      handleUploadFotoProducto(
                                        p.id,
                                        "tecnica",
                                        e,
                                      )
                                    }
                                    className="hidden"
                                  />
                                </label>
                              </div>
                            </td>

                            {/* Foto Catálogo */}
                            <td className="p-4">
                              <div className="flex items-center gap-2">
                                {p.foto_catalogo ? (
                                  <img
                                    src={p.foto_catalogo}
                                    alt="Catálogo"
                                    className="w-10 h-10 object-contain border rounded-lg bg-white shadow-sm flex-shrink-0"
                                  />
                                ) : (
                                  <span className="text-[10px] text-slate-400 bg-slate-100 px-2 py-1 rounded-md flex-shrink-0">
                                    Sin foto
                                  </span>
                                )}
                                <label className="cursor-pointer text-[10px] bg-orange-600 hover:bg-orange-500 text-white px-2.5 py-1.5 rounded-lg font-bold transition flex-shrink-0">
                                  {subiendoFotoId === `${p.id}-catalogo`
                                    ? "..."
                                    : "🖼️ Adjuntar"}
                                  <input
                                    type="file"
                                    accept="image/*"
                                    onChange={(e) =>
                                      handleUploadFotoProducto(
                                        p.id,
                                        "catalogo",
                                        e,
                                      )
                                    }
                                    className="hidden"
                                  />
                                </label>
                              </div>
                            </td>

                            {/* Botón Editar */}
                            <td className="p-4 text-center">
                              <button
                                onClick={() => setProductoEditar({ ...p })}
                                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-[11px] font-bold rounded-xl transition shadow-sm"
                              >
                                ✏️ Editar
                              </button>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td
                            colSpan="7"
                            className="text-center py-12 text-slate-400 font-medium"
                          >
                            No se encontraron productos registrados.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* BARRA DE PAGINACIÓN */}
                <div className="flex items-center justify-between p-4 bg-slate-50/80 border-t border-slate-200/80">
                  <p className="text-xs text-slate-500 font-medium">
                    Mostrando{" "}
                    {productosFiltrados.length > 0 ? indiceInicio + 1 : 0} a{" "}
                    {Math.min(
                      indiceInicio + itemsPorPagina,
                      productosFiltrados.length,
                    )}{" "}
                    de {productosFiltrados.length} productos
                  </p>

                  <div className="flex items-center gap-2">
                    <button
                      disabled={paginaActual === 1}
                      onClick={() => setPaginaActual((prev) => prev - 1)}
                      className="px-3.5 py-1.5 bg-white border border-slate-200 hover:bg-slate-100 disabled:opacity-40 text-xs font-bold rounded-xl transition shadow-sm"
                    >
                      ⬅️ Anterior
                    </button>

                    <span className="text-xs font-extrabold text-slate-800 px-3">
                      Página {paginaActual} de {totalPaginas}
                    </span>

                    <button
                      disabled={paginaActual === totalPaginas}
                      onClick={() => setPaginaActual((prev) => prev + 1)}
                      className="px-3.5 py-1.5 bg-white border border-slate-200 hover:bg-slate-100 disabled:opacity-40 text-xs font-bold rounded-xl transition shadow-sm"
                    >
                      Siguiente ➡️
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: CARGAR LISTA & REGLAS */}
          {activeTab === "entrenamiento" && (
            <div className="max-w-5xl space-y-8">
              {/* DRAG AND DROP */}
              <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xl shadow-slate-200/50 space-y-4">
                <h3 className="font-extrabold text-slate-800 text-base">
                  1. Cargar o Actualizar Lista de Precios Oficial (PDF o Excel)
                </h3>

                <div className="border-2 border-dashed border-slate-300 hover:border-orange-500 rounded-2xl p-10 text-center bg-slate-50/60 hover:bg-orange-50/30 transition-all cursor-pointer relative">
                  <input
                    type="file"
                    accept=".pdf,.xlsx,.xls,.csv"
                    onChange={handleSubirListaPrecios}
                    className="absolute inset-0 opacity-0 cursor-pointer"
                  />
                  <div className="text-3xl mb-2">📄</div>
                  <p className="text-sm font-bold text-slate-700">
                    {procesandoCatalogo
                      ? "⏳ Procesando lista y actualizando catálogo..."
                      : "Arrastrá tu lista de precios aquí o hacé clic para seleccionarla"}
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    Soporta archivos PDF, hojas de cálculo Excel (.xlsx) y
                    listas en formato CSV.
                  </p>
                </div>

                {catalogoPreview && (
                  <div className="mt-4">
                    <h4 className="text-xs font-bold text-slate-700 mb-2">
                      📄 Vista previa del catálogo digitalizado:
                    </h4>
                    <textarea
                      rows="8"
                      readOnly
                      value={catalogoPreview}
                      className="w-full p-4 bg-slate-950 text-emerald-400 font-mono text-xs rounded-2xl focus:outline-none shadow-inner leading-relaxed"
                    ></textarea>
                  </div>
                )}
              </div>

              {/* REGLAS COMERCIALES */}
              <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xl shadow-slate-200/50 space-y-4">
                <h3 className="font-extrabold text-slate-800 text-base">
                  2. Políticas Comerciales y Descuentos
                </h3>
                <p className="text-xs text-slate-500">
                  Definí las pautas de respuesta, políticas sobre IVA, escalas
                  de descuento por cantidad y condiciones de despacho.
                </p>
                <textarea
                  rows="8"
                  value={reglasIA}
                  onChange={(e) => setReglasIA(e.target.value)}
                  className="w-full p-4 border border-slate-200 rounded-2xl text-xs font-medium leading-relaxed focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none"
                ></textarea>
                <button
                  onClick={handleGuardarReglas}
                  disabled={guardandoReglas}
                  className="px-6 py-3 bg-slate-950 hover:bg-slate-800 text-white font-bold text-xs rounded-2xl transition shadow-md"
                >
                  {guardandoReglas
                    ? "Guardando..."
                    : "💾 Guardar Políticas Comerciales"}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* MODAL DE EDICIÓN FLOTANTE */}
        {productoEditar && (
          <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-white w-full max-w-lg rounded-3xl p-6 shadow-2xl space-y-4 border border-slate-200 animate-fade-in">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="font-extrabold text-slate-900 text-base">
                  ✏️ Ficha del Producto:{" "}
                  <span className="text-orange-600 font-mono">
                    {productoEditar.codigo}
                  </span>
                </h3>
                <button
                  onClick={() => setProductoEditar(null)}
                  className="text-slate-400 hover:text-slate-600 font-bold text-lg"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-3 text-xs">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      Código
                    </label>
                    <input
                      type="text"
                      value={productoEditar.codigo || ""}
                      onChange={(e) =>
                        setProductoEditar({
                          ...productoEditar,
                          codigo: e.target.value,
                        })
                      }
                      className="w-full p-2.5 border border-slate-200 rounded-xl font-mono font-bold text-orange-600 outline-none focus:ring-2 focus:ring-orange-500"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      Precio Lista
                    </label>
                    <input
                      type="text"
                      value={productoEditar.precio_lista || ""}
                      onChange={(e) =>
                        setProductoEditar({
                          ...productoEditar,
                          precio_lista: e.target.value,
                        })
                      }
                      className="w-full p-2.5 border border-slate-200 rounded-xl font-bold text-slate-800 outline-none focus:ring-2 focus:ring-orange-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Nombre Comercial
                  </label>
                  <input
                    type="text"
                    value={productoEditar.nombre || ""}
                    onChange={(e) =>
                      setProductoEditar({
                        ...productoEditar,
                        nombre: e.target.value,
                      })
                    }
                    className="w-full p-2.5 border border-slate-200 rounded-xl font-bold outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Medidas y Dimensiones
                  </label>
                  <input
                    type="text"
                    value={productoEditar.medidas || ""}
                    onChange={(e) =>
                      setProductoEditar({
                        ...productoEditar,
                        medidas: e.target.value,
                      })
                    }
                    className="w-full p-2.5 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Especificación Técnica
                  </label>
                  <textarea
                    rows="2"
                    value={productoEditar.especificacion || ""}
                    onChange={(e) =>
                      setProductoEditar({
                        ...productoEditar,
                        especificacion: e.target.value,
                      })
                    }
                    className="w-full p-2.5 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-orange-500"
                  ></textarea>
                </div>

                {/* CAMPO DESTACADO DE APLICACIÓN Y USOS */}
                <div className="bg-orange-50/80 p-4 rounded-2xl border border-orange-200">
                  <label className="block font-extrabold text-orange-900 mb-1 text-[11px]">
                    🎯 Aplicación y Usos Recomendados
                  </label>
                  <textarea
                    rows="3"
                    placeholder="Ej: Recomendado para garages subterráneos, entradas de centros comerciales, vías con tránsito de camiones o desvíos viales..."
                    value={productoEditar.aplicacion || ""}
                    onChange={(e) =>
                      setProductoEditar({
                        ...productoEditar,
                        aplicacion: e.target.value,
                      })
                    }
                    className="w-full p-2.5 border border-orange-200 rounded-xl text-slate-800 font-medium outline-none focus:ring-2 focus:ring-orange-500 bg-white"
                  ></textarea>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  onClick={() => setProductoEditar(null)}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleGuardarEdicionProducto}
                  disabled={guardandoProducto}
                  className="px-5 py-2.5 bg-gradient-to-r from-orange-600 to-orange-500 hover:from-orange-500 hover:to-orange-600 text-white text-xs font-extrabold rounded-xl transition shadow-md shadow-orange-600/30"
                >
                  {guardandoProducto ? "Guardando..." : "💾 Guardar Cambios"}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
