const express = require("express");
const cors = require("cors");
const multer = require("multer");
const Database = require("better-sqlite3");
const xlsx = require("xlsx");
const { google } = require("googleapis");
const { GoogleGenAI } = require("@google/genai");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 5000;

// Directorios físicos
const IMAGENES_DIR = path.join(__dirname, "public/imagenes");
const UPLOADS_DIR = path.join(__dirname, "uploads");
if (!fs.existsSync(IMAGENES_DIR))
  fs.mkdirSync(IMAGENES_DIR, { recursive: true });
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

app.use("/imagenes", express.static(IMAGENES_DIR));

const uploadTemp = multer({ dest: UPLOADS_DIR });

const storageFotos = multer.diskStorage({
  destination: (req, file, cb) => cb(null, IMAGENES_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const uniqueName = `prod_${req.params.id}_${req.body.tipo || "foto"}_${Date.now()}${ext}`;
    cb(null, uniqueName);
  },
});
const uploadFoto = multer({ storage: storageFotos });

// -------------------------------------------------------------
// BASE DE DATOS SQLITE
// -------------------------------------------------------------
const db = new Database(path.join(__dirname, "conoflex.db"));

db.exec(`
  CREATE TABLE IF NOT EXISTS productos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo TEXT,
    nombre TEXT,
    medidas TEXT,
    precio_lista TEXT,
    especificacion TEXT,
    aplicacion TEXT,
    foto_tecnica TEXT,
    foto_catalogo TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS reglas (
    clave TEXT PRIMARY KEY,
    valor TEXT
  );
`);

// Asegurar columna 'aplicacion' si la base ya existía previamente
try {
  db.exec("ALTER TABLE productos ADD COLUMN aplicacion TEXT;");
} catch (e) {
  // Columna ya existente
}

console.log("💾 Base de datos 'conoflex.db' conectada y lista.");

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI,
);
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const TOKEN_PATH = path.join(__dirname, "tokens_web.json");

if (fs.existsSync(TOKEN_PATH)) {
  oauth2Client.setCredentials(JSON.parse(fs.readFileSync(TOKEN_PATH)));
}

function crearRawEmail(to, subject, htmlBody, threadId) {
  const emailLines = [
    `To: ${to}`,
    "Content-Type: text/html; charset=utf-8",
    "MIME-Version: 1.0",
    `Subject: Re: ${subject.replace(/^Re:\s*/i, "")}`,
    "",
    htmlBody,
  ];
  const emailStr = emailLines.join("\r\n");
  const base64Encoded = Buffer.from(emailStr)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  const requestBody = { message: { raw: base64Encoded } };
  if (threadId) requestBody.message.threadId = threadId;
  return requestBody;
}

// SINCRONIZACIÓN INTELIGENTE: Preserva fotos y aplicaciones al actualizar listas de precios
function poblarDBDesdeCatalogoTXT() {
  const CATALOGO_PATH = path.join(__dirname, "catalogo.txt");
  if (!fs.existsSync(CATALOGO_PATH)) return 0;

  const contenido = fs.readFileSync(CATALOGO_PATH, "utf-8");
  const bloques = contenido.split(
    /----------------------------------------|-----------------------------------/,
  );

  const stmtExiste = db.prepare("SELECT id FROM productos WHERE codigo = ?");
  const stmtUpdate = db.prepare(`
    UPDATE productos 
    SET nombre = ?, medidas = ?, precio_lista = ?, especificacion = ?, updated_at = CURRENT_TIMESTAMP
    WHERE codigo = ?
  `);
  const stmtInsert = db.prepare(`
    INSERT INTO productos (codigo, nombre, medidas, precio_lista, especificacion, aplicacion, foto_tecnica, foto_catalogo)
    VALUES (?, ?, ?, ?, ?, '', NULL, NULL)
  `);

  let totalProcesados = 0;

  const syncTransaction = db.transaction((listaBloques) => {
    for (const bloque of listaBloques) {
      const lineas = bloque.trim().split("\n");
      if (lineas.length < 2) continue;

      let cod = "",
        nombre = "",
        medidas = "",
        precio = "",
        espec = "";

      for (const l of lineas) {
        const linea = l.trim();
        if (linea.match(/^Cód:|^Cod:|^Código:/i))
          cod = linea.replace(/^Cód:|^Cod:|^Código:/i, "").trim();
        else if (linea.match(/^Nombre:/i))
          nombre = linea.replace(/^Nombre:/i, "").trim();
        else if (linea.match(/^Medidas:/i))
          medidas = linea.replace(/^Medidas:/i, "").trim();
        else if (linea.match(/^Precio Lista:/i))
          precio = linea.replace(/^Precio Lista:/i, "").trim();
        else if (linea.match(/^Especificación:|^Especificacion:/i))
          espec = linea
            .replace(/^Especificación:|^Especificacion:/i, "")
            .trim();
      }

      if (cod && cod !== "-") {
        const existente = stmtExiste.get(cod);
        if (existente) {
          // Si el producto ya existe, SOLO actualiza sus precios y datos del catálogo.
          // Fotos y Aplicaciones quedan 100% intactas.
          stmtUpdate.run(
            nombre || "",
            medidas || "",
            precio || "",
            espec || "",
            cod,
          );
        } else {
          // Producto nuevo detectado
          stmtInsert.run(
            cod,
            nombre || "",
            medidas || "",
            precio || "",
            espec || "",
          );
        }
        totalProcesados++;
      }
    }
  });

  syncTransaction(bloques);
  return totalProcesados;
}

// -------------------------------------------------------------
// RUTAS DE CATÁLOGO Y PRODUCTOS
// -------------------------------------------------------------

app.post(
  "/api/catalogo/procesar",
  uploadTemp.single("lista_precios"),
  async (req, res) => {
    try {
      if (!req.file)
        return res.status(400).json({ error: "No se subió ningún archivo." });

      console.log(`📤 Procesando lista de precios: ${req.file.originalname}`);
      const ext = path.extname(req.file.originalname).toLowerCase();

      const promptText = `
      Analizá este documento de lista de precios/catálogo y convertí TODOS sus productos al siguiente formato de texto plano estructurado.
      Debes mantener exactamente estas etiquetas y el separador de guiones entre cada producto:

      Cód: [Código del producto]
      Nombre: [Nombre del producto]
      Medidas: [Medidas o especificaciones clave]
      Precio Lista: [Precio de lista o desglose de variantes de precio]
      Especificación: [Detalles técnicos adicionales o las mismas medidas]
      ----------------------------------------

      Reglas estrictamente obligatorias:
      - Respetá todos los precios en Pesos Argentinos ($) tal cual figuran.
      - No omitas ningún producto.
      - Devuelve ÚNICAMENTE el texto formateado, sin explicaciones, ni introducciones, ni bloques de código markdown.
    `;

      let contentsPayload = [];

      if (ext === ".xlsx" || ext === ".xls") {
        const workbook = xlsx.readFile(req.file.path);
        let textoExcel = "";
        workbook.SheetNames.forEach((sheetName) => {
          textoExcel +=
            `\n--- HOJA: ${sheetName} ---\n` +
            xlsx.utils.sheet_to_csv(workbook.Sheets[sheetName]);
        });
        contentsPayload = [`DATOS EXCEL:\n${textoExcel}`, promptText];
      } else if (ext === ".pdf") {
        const uploadResult = await ai.files.upload({
          file: req.file.path,
          mimeType: "application/pdf",
        });
        const fileUri =
          uploadResult.uri || (uploadResult.file && uploadResult.file.uri);
        contentsPayload = [
          { fileData: { fileUri, mimeType: "application/pdf" } },
          promptText,
        ];
      } else {
        contentsPayload = [
          `TEXTO:\n${fs.readFileSync(req.file.path, "utf-8")}`,
          promptText,
        ];
      }

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: contentsPayload,
      });

      const catalogoTextoFormateado = response.text.replace(/```/g, "").trim();

      const CATALOGO_PATH = path.join(__dirname, "catalogo.txt");
      fs.writeFileSync(CATALOGO_PATH, catalogoTextoFormateado, "utf-8");

      const totalCargados = poblarDBDesdeCatalogoTXT();

      if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);

      res.json({
        success: true,
        mensaje: `¡Se actualizó el catálogo y se sincronizaron ${totalCargados} productos!`,
        totalProductos: totalCargados,
        contenidoPreview: catalogoTextoFormateado,
      });
    } catch (error) {
      console.error("Error procesando lista:", error);
      res
        .status(500)
        .json({ error: "Error procesando lista de precios: " + error.message });
    }
  },
);

// Obtener todos los productos
app.get("/api/productos", (req, res) => {
  const productos = db.prepare("SELECT * FROM productos ORDER BY id ASC").all();
  res.json({ productos });
});

// EDITAR FICHA Y USOS DE UN PRODUCTO (Garantiza no pasar 'undefined' a la BD)
app.put("/api/productos/:id", (req, res) => {
  try {
    const { id } = req.params;
    const {
      codigo,
      nombre,
      medidas,
      precio_lista,
      especificacion,
      aplicacion,
    } = req.body;

    db.prepare(
      `
      UPDATE productos
      SET codigo = ?, nombre = ?, medidas = ?, precio_lista = ?, especificacion = ?, aplicacion = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
    ).run(
      codigo || "",
      nombre || "",
      medidas || "",
      precio_lista || "",
      especificacion || "",
      aplicacion || "",
      id,
    );

    res.json({ success: true, mensaje: "Producto actualizado correctamente." });
  } catch (err) {
    console.error("Error al actualizar producto:", err);
    res
      .status(500)
      .json({ error: "Error actualizando el producto: " + err.message });
  }
});

// Subir Imagen
app.post(
  "/api/productos/:id/imagen",
  uploadFoto.single("imagen"),
  (req, res) => {
    try {
      const { id } = req.params;
      const { tipo } = req.body;
      if (!req.file)
        return res.status(400).json({ error: "No se recibió ninguna imagen." });

      const baseUrl = process.env.BASE_URL || `http://localhost:${PORT}`;
      const imageUrl = `${baseUrl}/imagenes/${req.file.filename}`;
      const campoBD = tipo === "tecnica" ? "foto_tecnica" : "foto_catalogo";

      db.prepare(`UPDATE productos SET ${campoBD} = ? WHERE id = ?`).run(
        imageUrl,
        id,
      );

      res.json({
        success: true,
        mensaje: `Foto ${tipo} subida correctamente.`,
        imageUrl,
      });
    } catch (err) {
      console.error("Error subiendo foto:", err);
      res.status(500).json({ error: "Error al guardar la imagen." });
    }
  },
);

// -------------------------------------------------------------
// REGLAS Y GMAIL API
// -------------------------------------------------------------
app.get("/api/reglas", (req, res) => {
  const row = db
    .prepare("SELECT valor FROM reglas WHERE clave = 'prompt_comercial'")
    .get();
  res.json({ reglas: row ? row.valor : "" });
});

app.post("/api/reglas", (req, res) => {
  const { reglas } = req.body;
  db.prepare(
    "INSERT INTO reglas (clave, valor) VALUES ('prompt_comercial', ?) ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor",
  ).run(reglas || "");
  res.json({ success: true, mensaje: "Configuración guardada" });
});

app.get("/auth/google", (req, res) => {
  const scopes = [
    "[https://www.googleapis.com/auth/gmail.readonly](https://www.googleapis.com/auth/gmail.readonly)",
    "[https://www.googleapis.com/auth/gmail.compose](https://www.googleapis.com/auth/gmail.compose)",
    "[https://www.googleapis.com/auth/gmail.modify](https://www.googleapis.com/auth/gmail.modify)",
  ];
  res.redirect(
    oauth2Client.generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      scope: scopes,
    }),
  );
});

app.get("/auth/google/callback", async (req, res) => {
  try {
    const { tokens } = await oauth2Client.getToken(req.query.code);
    oauth2Client.setCredentials(tokens);
    fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens));
    res.redirect("http://localhost:5173?status=conectado");
  } catch (error) {
    res.status(500).send("Error de autenticación");
  }
});

app.get("/api/mails", async (req, res) => {
  try {
    if (!oauth2Client.credentials || !oauth2Client.credentials.access_token) {
      return res.status(401).json({ error: "No autenticado" });
    }
    const gmail = google.gmail({ version: "v1", auth: oauth2Client });
    const listRes = await gmail.users.messages.list({
      userId: "me",
      q: "label:IA-Consulta",
      maxResults: 10,
    });
    const messages = listRes.data.messages || [];
    const mailsDetalle = [];

    for (const msg of messages) {
      const detail = await gmail.users.messages.get({
        userId: "me",
        id: msg.id,
        format: "full",
      });
      const headers = detail.data.payload.headers;
      const subject =
        headers.find((h) => h.name === "Subject")?.value || "Sin asunto";
      const from =
        headers.find((h) => h.name === "From")?.value || "Desconocido";
      const emailMatch = from.match(/<([^>]+)>/) || [null, from];

      mailsDetalle.push({
        id: msg.id,
        threadId: detail.data.threadId,
        asunto: subject,
        remitente: from,
        emailCliente: emailMatch[1],
        resumen: detail.data.snippet || "",
      });
    }
    res.json({ mails: mailsDetalle });
  } catch (error) {
    res.status(500).json({ error: "Error leyendo Gmail" });
  }
});

app.post("/api/crear-borrador-gmail", async (req, res) => {
  try {
    const { mailCliente, consultaText, asunto, threadId } = req.body;

    const reglaRow = db
      .prepare("SELECT valor FROM reglas WHERE clave = 'prompt_comercial'")
      .get();
    const reglasEntrenamiento = reglaRow ? reglaRow.valor : "";

    const productosDB = db
      .prepare(
        "SELECT codigo, nombre, medidas, precio_lista, especificacion, aplicacion, foto_tecnica, foto_catalogo FROM productos",
      )
      .all();

    const prompt = `
      Sos el asistente comercial oficial de Conoflex Argentina.

      CATÁLOGO COMPLETO DE PRODUCTOS (CON USOS Y FOTOS):
      ${JSON.stringify(productosDB, null, 2)}

      REGLAS DE NEGOCIO Y DESCUENTOS:
      ${reglasEntrenamiento}

      CONSULTA RECIBIDA DEL CLIENTE (${mailCliente}):
      ${consultaText}

      INSTRUCCIONES DE MAQUETACIÓN HTML Y SELECCIÓN DE PRODUCTOS:
      1. Analiza la consulta y busca los productos cuyo campo 'aplicacion' o 'especificacion' mejor responden al requerimiento (garages, autopistas, obras, etc.).
      2. Redacta un saludo comercial cordial.
      3. Para cada producto cotizado, crea una TARJETA HORIZONTAL en HTML (tabla con borde #e2e8f0, esquinas redondeadas y padding de 10px).
      4. Si el producto tiene 'foto_tecnica' o 'foto_catalogo' con URL válida (http/https), inclúyelas centradas arriba:
         <img src="URL" style="max-width:120px; max-height:90px; object-fit:contain; border-radius:4px; margin: 0 5px;" />
         SI ES NULL O VACÍO, NO INCLUYAS NINGUNA ETIQUETA <img> NI RECUADROS VACÍOS.
      5. Muestra Nombre en negrita, Código, Medidas y Especificaciones/Aplicación.
      6. Muestra las 3 cajas de precio naranjas (Lista, Precio c/Descuento y Total).
      7. Agrega el cuadro final con notas comerciales sobre IVA, bonificaciones y despacho gratis.

      Devuelve ÚNICAMENTE el código HTML dentro del cuerpo sin explicaciones adicionales.
    `;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
    });

    const htmlBody = response.text
      .replace(/```html/g, "")
      .replace(/```/g, "")
      .trim();

    const gmail = google.gmail({ version: "v1", auth: oauth2Client });
    const draftPayload = crearRawEmail(
      mailCliente,
      asunto || "Presupuesto Conoflex Argentina",
      htmlBody,
      threadId,
    );

    const draftCreated = await gmail.users.drafts.create({
      userId: "me",
      requestBody: draftPayload,
    });

    res.json({
      success: true,
      mensaje: "Borrador generado en Gmail",
      draftId: draftCreated.data.id,
    });
  } catch (error) {
    console.error("Error creando borrador:", error);
    res.status(500).json({ error: "Error al generar borrador" });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Servidor Conoflex ejecutándose en puerto ${PORT}`);
});
