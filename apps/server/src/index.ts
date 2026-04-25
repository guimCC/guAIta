import { config } from "./config.js";
import { buildServer } from "./server.js";

const { app } = await buildServer();

try {
  const address = await app.listen({
    host: config.host,
    port: config.port
  });

  app.log.info({ address }, "guAIta server listening");
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
