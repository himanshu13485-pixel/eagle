import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { NestExpressApplication } from "@nestjs/platform-express";
import { join } from "path";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: true });
  app.enableCors({ origin: true, credentials: true });
  app.setGlobalPrefix("api");
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: false }),
  );

  // Serve locally-stored screenshots at /api/files/<key>
  const storageDir = process.env.STORAGE_DIR || join(process.cwd(), "storage");
  app.useStaticAssets(storageDir, { prefix: "/api/files/" });

  const port = Number(process.env.API_PORT ?? 4000);
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`Eagle API listening on http://localhost:${port}/api`);
  // eslint-disable-next-line no-console
  console.log(`AGENT_PUBLIC_URL (baked into installers) = ${process.env.AGENT_PUBLIC_URL || "(unset → localhost!)"}`);
}
bootstrap();
