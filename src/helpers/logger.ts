
import fs from 'fs';
import path from 'path';

export function writeLog(message: string): void {
  const logDir = path.resolve(__dirname, '../../logs');
  const logFile = path.join(logDir, 'app.log');

  // Ensure logs directory exists
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }

  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}] ${message}\n`;

  fs.appendFileSync(logFile, logEntry, 'utf8');
}
