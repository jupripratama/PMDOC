import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import * as http from 'http'; // Import http untuk mendapatkan tipe server

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );

  // 👉 Izinkan frontend mengakses backend
  app.enableCors({
    origin: 'http://localhost:5173',
  });

  // Menggunakan 'http.Server' untuk memberikan tipe pada server
  const server = (await app.listen(3000, 'localhost')) as http.Server;

  // Set timeout untuk server HTTP setelah listen
  server.setTimeout(300000); // Set timeout menjadi 5 menit (300000 ms)
}

void bootstrap();
