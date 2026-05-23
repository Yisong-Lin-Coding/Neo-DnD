import { Server } from "socket.io";
import { createServer } from "http";
import {callAPI} from "./handlers/APIHandler";
import connectDB from "./db";
import {loadModels} from "./handlers/modelHandler";

const port = Number(process.env.PORT) || 3001;
const corsOrigin = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(",").map((origin) => origin.trim()).filter(Boolean)
  : "*";

const httpServer = createServer();
const io = new Server(httpServer, {
  cors: {
    origin: corsOrigin,
  },
});


(async () => {
  await connectDB();
    await loadModels(); 
    
  
    
io.on("connection", (socket) => {
  const clientSessionId = socket.handshake.query.sessionId as string | undefined;
  console.log(`Client connected: socket.id=${socket.id}, sessionId=${clientSessionId || "unknown"}`);
  
  socket.on("api", async (apiName: string, data: any, requestId: string) => {
    try {
      const result = await callAPI(apiName, data);
      socket.emit("api-response", { requestId, success: true, data: result });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      socket.emit("api-response", { requestId, success: false, error: message });
    }
  });
});



httpServer.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
})();


