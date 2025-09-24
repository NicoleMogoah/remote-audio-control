// demo.js
// Option C - Remote Audio Control Demo (Node.js)

const express = require("express");
const WebSocket = require("ws");
const jwt = require("jsonwebtoken");
const { v4: uuidv4 } = require("uuid");

const SECRET = "super_secret_key"; // demo only
const PORT = 3000;

let vehicles = {}; // { vehicleId: { ws, pendingCommands: {} } }

// Utility: sign a token for operator
function generateOperatorToken() {
  return jwt.sign({ role: "operator" }, SECRET, { expiresIn: "1h" });
}

// Utility: sign a command for device
function signCommand(cmd) {
  return jwt.sign(cmd, SECRET, { expiresIn: "5m" });
}

// Utility: verify incoming command/ack
function verifyToken(token) {
  try {
    return jwt.verify(token, SECRET);
  } catch {
    return null;
  }
}

// ------------------ CLOUD SERVER ------------------
if (process.argv[2] === "cloud") {
  const app = express();
  app.use(express.json());

  // WebSocket server for devices
  const wss = new WebSocket.Server({ noServer: true });

  // HTTP server
  const server = app.listen(PORT, () => {
    const opToken = generateOperatorToken();
    console.log(`Cloud listening on http://localhost:${PORT}`);
    console.log("OPERATOR_TOKEN:", opToken);
  });

  // Handle upgrade for WebSockets
  server.on("upgrade", (req, socket, head) => {
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req);
    });
  });

  // Cloud REST API
  app.post("/vehicles/:vehicleId/commands", (req, res) => {
    const auth = req.headers["authorization"];
    if (!auth) return res.status(401).send("Missing token");
    const token = auth.split(" ")[1];
    const claims = verifyToken(token);
    if (!claims || claims.role !== "operator")
      return res.status(401).send("Invalid token");

    const { vehicleId } = req.params;
    const vehicle = vehicles[vehicleId];
    if (!vehicle) return res.status(404).send("Vehicle not connected");

    const cmdId = uuidv4();
    const command = {
      commandId: cmdId,
      type: req.body.type,
      params: req.body.params,
    };

    const signed = signCommand(command);
    vehicle.pendingCommands[cmdId] = command;
    vehicle.ws.send(JSON.stringify({ type: "command", token: signed }));

    res.json({ commandId: cmdId, status: "sent" });
  });

  app.post("/commands/:id/cancel", (req, res) => {
    const auth = req.headers["authorization"];
    if (!auth) return res.status(401).send("Missing token");
    const token = auth.split(" ")[1];
    const claims = verifyToken(token);
    if (!claims || claims.role !== "operator")
      return res.status(401).send("Invalid token");

    const { id } = req.params;
    for (const vId in vehicles) {
      const vehicle = vehicles[vId];
      if (vehicle.pendingCommands[id]) {
        vehicle.ws.send(
          JSON.stringify({ type: "cancel_command", commandId: id })
        );
        res.json({ canceled: id });
        return;
      }
    }
    res.status(404).send("Command not found");
  });

  // Handle WS device connections
  wss.on("connection", (ws) => {
    let vid = "vehicle-" + uuidv4().slice(0, 4);
    vehicles[vid] = { ws, pendingCommands: {} };
    console.log("Vehicle connected:", vid);

    ws.on("message", (msg) => {
      try {
        const data = JSON.parse(msg.toString());
        if (data.type === "ack") {
          const ackClaims = verifyToken(data.token);
          if (ackClaims) {
            console.log("ACK from device:", ackClaims);
            delete vehicles[vid].pendingCommands[ackClaims.commandId];
          }
        }
      } catch (err) {
        console.error("Bad message", err);
      }
    });

    ws.on("close", () => {
      delete vehicles[vid];
      console.log("Vehicle disconnected:", vid);
    });
  });
}

// ------------------ DEVICE SIMULATOR ------------------
if (process.argv[2] === "device") {
  const ws = new WebSocket(`ws://localhost:${PORT}`);

  ws.on("open", () => {
    console.log("Device connected to cloud");
    process.stdin.on("data", (d) => {
      const txt = d.toString().trim();
      if (txt === "override") {
        console.log("Driver override triggered!");
        const ack = {
          type: "ack",
          token: signCommand({
            commandId: "manual",
            status: "driver_override",
          }),
        };
        ws.send(JSON.stringify(ack));
      }
      if (txt === "exit") {
        process.exit(0);
      }
    });
  });

  ws.on("message", (msg) => {
    try {
      const data = JSON.parse(msg.toString());
      if (data.type === "command") {
        const claims = verifyToken(data.token);
        if (!claims) {
          console.log("Invalid command signature");
          return;
        }
        console.log("Applying command:", claims);

        // simulate applying command
        setTimeout(() => {
          const ack = {
            type: "ack",
            token: signCommand({
              commandId: claims.commandId,
              status: "applied",
            }),
          };
          ws.send(JSON.stringify(ack));
        }, 1000);
      } else if (data.type === "cancel_command") {
        console.log("Command canceled:", data.commandId);
        const ack = {
          type: "ack",
          token: signCommand({
            commandId: data.commandId,
            status: "canceled",
          }),
        };
        ws.send(JSON.stringify(ack));
      }
    } catch (err) {
      console.error("Bad WS msg", err);
    }
  });
}

