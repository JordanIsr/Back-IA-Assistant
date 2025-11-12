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
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Methods", "POST");
    res.set("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      return res.status(204).send("");
    }

    const { userId, message } = req.body;
    if (!message) {
      return res.status(400).json({ error: "Message is required" });
    }

    const docRef = await db.collection("messages").add({
      userId: userId || "anonymous",
      message,
      createdAt: FieldValue.serverTimestamp(),
    });

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      stream: true,
      messages: [
        {
          role: "system",
          content: "Eres un asistente empático que ayuda a las personas a expresarse y reflexionar.",
        },
        { role: "user", content: message },
      ],
    });

    let fullResponse = "";

    for await (const chunk of completion) {
      const content = chunk.choices[0]?.delta?.content || "";
      if (content) {
        fullResponse += content;
        res.write(`data: ${content}\n\n`);
      }
    }

    await db.collection("messages").add({
      userId: "assistant",
      message: fullResponse,
      replyTo: docRef.id,
      createdAt: FieldValue.serverTimestamp(),
    });

    res.write("data: [DONE]\n\n");
    res.end();
  } catch (error) {
    console.error("Error en chatWithAI:", error);
    res.status(500).send(`data: ERROR - ${error.message}\n\n`);
    res.end();
  }
});
