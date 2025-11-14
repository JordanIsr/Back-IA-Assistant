require("dotenv").config();

const functions = require("firebase-functions");
const admin = require("firebase-admin");
const { FieldValue } = require("firebase-admin/firestore");
const OpenAI = require("openai");

admin.initializeApp();
const db = admin.firestore();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

exports.chatWithAI = functions.https.onRequest(async (req, res) => {
  try {
    // --- Configuración de CORS (Permitir que tu app hable con la función) ---
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Methods", "POST");
    res.set("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      // Manejar la solicitud "pre-vuelo" de CORS
      return res.status(204).send("");
    }

    const { userId, message } = req.body;
    if (!message) {
      return res.status(400).json({ error: "Message is required" });
    }

    // --- Guardar el mensaje del usuario en Firestore ---
    const docRef = await db.collection("messages").add({
      userId: userId || "anonymous",
      message,
      createdAt: FieldValue.serverTimestamp(),
    });

    // --- LÍNEAS DE STREAMING ELIMINADAS ---
    // Ya no enviamos un stream, así que borramos estos encabezados:
    // res.setHeader("Content-Type", "text/event-stream");
    // res.setHeader("Cache-Control", "no-cache");
    // res.setHeader("Connection", "keep-alive");

    // --- Llamada a OpenAI (Modo SIN STREAM) ---
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      stream: false, // <-- CAMBIO CLAVE: de 'true' a 'false'
      messages: [
        {
          role: "system",
          content: "Eres un asistente empático que ayuda a las personas a expresarse y reflexionar.",
        },
        { role: "user", content: message },
      ],
    });

    // --- BUCLE DE STREAMING ELIMINADO ---
    // Ya no necesitamos el bucle 'for await' porque la respuesta es completa.

    // --- Obtener la respuesta completa ---
    const fullResponse = completion.choices[0]?.message?.content || "No se pudo obtener respuesta.";

    // --- Guardar la respuesta del asistente en Firestore ---
    await db.collection("messages").add({
      userId: "assistant",
      message: fullResponse,
      replyTo: docRef.id,
      createdAt: FieldValue.serverTimestamp(),
    });

    // --- ENVIAR RESPUESTA JSON (Lo que tu app espera) ---
    res.status(200).json({ reply: fullResponse });

  } catch (error) {
    console.error("Error en chatWithAI:", error);
    // Enviar un error JSON también
    res.status(500).json({ error: error.message });
  }
});