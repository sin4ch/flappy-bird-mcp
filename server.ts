import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  registerAppTool,
  registerAppResource,
  RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/server";
import cors from "cors";
import express from "express";
import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

let highScore = 0;

const resourceUri = "ui://flappy-bird/flappy-bird.html";

function createServer() {
  const server = new McpServer({
    name: "Flappy Bird MCP",
    version: "1.0.0",
  });

  // Main tool: renders the game UI
  registerAppTool(
    server,
    "play-flappy-bird",
    {
      title: "Play Flappy Bird",
      description:
        "Launch a game of Flappy Bird! A classic side-scrolling game where you tap to keep the bird flying through gaps in pipes.",
      inputSchema: {},
      _meta: { ui: { resourceUri } },
    },
    async () => {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ highScore }),
          },
        ],
      };
    },
  );

  // Tool for submitting scores from the game UI
  server.tool(
    "submit-score",
    "Submit a score from the Flappy Bird game",
    { score: z.number().int().min(0) },
    async ({ score }) => {
      if (score > highScore) {
        highScore = score;
      }
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ highScore, submitted: score }),
          },
        ],
      };
    },
  );

  // Tool for retrieving the high score
  server.tool(
    "get-high-score",
    "Get the current Flappy Bird high score",
    {},
    async () => {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ highScore }),
          },
        ],
      };
    },
  );

  // Register the UI resource (bundled HTML)
  registerAppResource(
    server,
    resourceUri,
    resourceUri,
    { mimeType: RESOURCE_MIME_TYPE },
    async () => {
      const html = await fs.readFile(
        path.join(import.meta.dirname, "dist", "flappy-bird.html"),
        "utf-8",
      );
      return {
        contents: [
          { uri: resourceUri, mimeType: RESOURCE_MIME_TYPE, text: html },
        ],
      };
    },
  );

  return server;
}

// Express HTTP server
const app = express();
app.use(cors());
app.use(express.json());

app.post("/mcp", async (req, res) => {
  const server = createServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  res.on("close", () => transport.close());
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`Flappy Bird MCP server running at http://localhost:${PORT}/mcp`);
});
