import { WebSocketServer } from "ws";

const wss = new WebSocketServer({ noServer: true });

wss.on("connection", (socket, request) => {
  console.log("WebSocket client connected");

  socket.on("message", (data) => {
    try {
      const message = JSON.parse(data.toString());

      // Handle ping for latency testing
      if (message.type === "ping") {
        socket.send(
          JSON.stringify({
            type: "pong",
            timestamp: message.timestamp,
          }),
        );
        return;
      }

      // Echo message for now (will be replaced with actual chat logic)
      socket.send(
        JSON.stringify({
          type: "echo",
          data: message,
        }),
      );
    } catch (error) {
      console.error("WebSocket message error:", error);
      socket.send(
        JSON.stringify({
          type: "error",
          message: "Invalid message format",
        }),
      );
    }
  });

  socket.on("close", () => {
    console.log("WebSocket client disconnected");
  });

  socket.on("error", (error) => {
    console.error("WebSocket error:", error);
  });
});

export default {
  attach(server) {
    server.on("upgrade", (request, socket, head) => {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit("connection", ws, request);
      });
    });
  },
};
