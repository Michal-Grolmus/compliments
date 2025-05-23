import express, { json as _json } from "express";
import cors from "cors";
import { fetch } from "undici";
import dotenv from "dotenv";
dotenv.config();

const app = express();
const PORT = 3000;

app.use(cors());
app.use(_json());

app.post("/api/generate-compliment", async (req, res) => {
  const { employeeName, attributes, lang } = req.body;
  const language = (lang && lang.toLowerCase().startsWith("cs")) ? "cs" : "en";

  if (!employeeName || !attributes) {
    return res.status(400).json({ error: "Missing data" });
  }

  let languageLabel = language === "cs" ? "Czech" : "English";
let prompt = `Write a kind, professional, and natural-sounding compliment in ${languageLabel}. 
It should be a short message from Michal Grolmus addressed directly to a person named ${employeeName}, 
based on the following skills and qualities: 
\n${attributes.map(a => `• ${a}`).join("\n")}\n
Use the correct grammatical form of the name "${employeeName}" as it would naturally appear in the message 
(for example, in vocative case in Czech).

The message should be warm, sincere, and appreciative – as if Michal truly values this person's work and would be excited to become their colleague.
Avoid generic phrases, clichés, or placeholder symbols like {{name}}.
Make it personal, human, and written in proper ${languageLabel}.

Use **double line breaks** (\\n\\n) between paragraphs to clearly indicate paragraph breaks in the output. 
This is important for rendering the text correctly in a web interface.

At the end, subtly express that Michal would be happy to join this person's team.`;

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4", // nebo "gpt-3.5-turbo"
        stream: true,
        temperature: 0.8,
        messages: [{ role: "user", content: prompt }]
      })
    });

    if (!response.ok || !response.body) {
      throw new Error("OpenAI stream failed");
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");

    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      console.log("Buffer:", buffer); // Debugging line
      console.log("Buffer Stringify:", JSON.stringify(buffer)); // Debugging line
      const parts = buffer.split("\n");
      console.log("Parts:", parts); // Debugging line
      console.log("Parts Stringify:", JSON.stringify(parts)); // Debugging line

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

      // Vyčistit buffer, ponechat poslední neukončenou část
      buffer = parts[parts.length - 1];
    }
  } catch (err) {
    console.error("Streaming error:", err);
    res.status(500).json({ error: "Streaming failed" });
  }
});


app.listen(PORT, () => {
  console.log(`Server běží na http://localhost:${PORT}`);
});
