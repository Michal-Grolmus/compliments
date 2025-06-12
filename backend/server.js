import express, { json as _json } from "express";
import cors from "cors";
import { fetch } from "undici";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

/**
 * Backend server for the Compliments UI5 application.
 * Handles API requests for generating personalized compliments using OpenAI API.
 * Streams the generated compliment text to the frontend for real-time display.
 */

const app = express();
const PORT = process.env.PORT || 3000;

// 🔁 Serve static frontend files from /dist (for production)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distPath = path.join(__dirname, "..", "dist");
app.use(express.static(distPath));

// Enable CORS for all origins (for local development)
app.use(cors());

// Parse incoming JSON requests
app.use(_json());

/**
 * POST /api/generate-compliment
 * Expects: { employeeName: string, attributes: string[], lang: string }
 * Returns: Streams compliment text as Server-Sent Events (SSE)
 */
app.post("/api/generate-compliment", async (req, res) => {
  const { employeeName, attributes, lang } = req.body;
  const language = (lang && lang.toLowerCase().startsWith("cs")) ? "cs" : "en";

  // Validate required input
  if (!employeeName || !attributes) {
    return res.status(400).json({ error: "Missing data" });
  }

  // Prepare prompt for OpenAI API
  let languageLabel = language === "cs" ? "Czech" : "English";
let prompt = `Write a kind, professional, and natural-sounding compliment in ${languageLabel}. 
It should be a short message from Michal Grolmus addressed directly to a person named ${employeeName}, 
based on the following skills and qualities: 
\n${attributes.map(a => `• ${a}`).join("\n")}\n
Use the correct grammatical form of the name "${employeeName}" as it would naturally appear in the message 
(for example, in vocative case in Czech).

The message must use formal address (i.e., use "you" in the **formal** form – "Vy" in Czech, "Sie" in German, "vous" in French, etc.). 
Do not use informal language or pronouns like "ty" in Czech. Always address the person with respect and professionalism.

The tone should be warm, sincere, and appreciative – as if Michal truly values this person's work and would be excited to become their colleague.
Avoid generic phrases, clichés, or placeholder symbols like {{name}}.
Make it personal, human, and written in proper ${languageLabel}.

Use **double line breaks** (\\n\\n) between paragraphs to clearly indicate paragraph breaks in the output. 
This is important for rendering the text correctly in a web interface.

At the end, subtly express that Michal would be happy to join this person's team.`;

  try {
    // Call OpenAI API with streaming enabled
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4", // or "gpt-3.5-turbo"
        stream: true,
        temperature: 0.8,
        messages: [{ role: "user", content: prompt }]
      })
    });

    if (!response.ok || !response.body) {
      throw new Error("OpenAI stream failed");
    }

    // Set headers for Server-Sent Events (SSE)
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");

    let buffer = "";

    // Stream data chunks to the client as they arrive
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split("\n");

      for (const line of parts) {
        if (line.startsWith("data: ")) {
          const json = line.replace("data: ", "");          

          if (json === "[DONE]") {
            res.write("event: done\ndata: \n\n");
            res.end();
            return;
          }

          try {
            const chunk = JSON.parse(json);
            const content = chunk.choices?.[0]?.delta?.content;
            if (content) {
              // Replace newlines for correct HTML rendering on frontend
              const formatted = content
                                .replace(/\n\n/g, "<br><br>")
                                .replace(/\n/g, "<br>");
              res.write(`data: ${formatted}\n\n`);
            }
          } catch (e) {
            console.error("JSON parse error:", e);
          }
        }
      }

      // Keep only the last incomplete part in the buffer
      buffer = parts[parts.length - 1];
    }
  } catch (err) {
    // Handle errors in streaming or OpenAI API call
    console.error("Streaming error:", err);
    res.status(500).json({ error: "Streaming failed" });
  }
});

// Fallback route – return index.html for any unknown route (SPA support)
app.get("*", (req, res) => {
  res.sendFile(path.join(distPath, "index.html"));
});

// Start the backend server
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
