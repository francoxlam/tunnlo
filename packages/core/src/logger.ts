import { createWriteStream, type WriteStream } from 'node:fs';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'quiet';
export type LogFormat = 'text' | 'json';

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  quiet: 4,
};

export interface LoggerOptions {
  level?: LogLevel;
  logFile?: string;
  format?: LogFormat;
}

export class Logger {
  private level: number;
  private fileHandle: WriteStream | null = null;
  private format: LogFormat;

  constructor(options: LoggerOptions = {}) {
    this.level = LEVEL_ORDER[options.level ?? 'info'];
    this.format = options.format ?? 'text';
    if (options.logFile) {
      this.fileHandle = createWriteStream(options.logFile, { flags: 'a' });
    }
  }

  private shouldLog(level: LogLevel): boolean {
    return LEVEL_ORDER[level] >= this.level;
  }

  private formatTimestamp(): string {
    return new Date().toISOString();
  }

  private writeToFile(level: string, msg: string): void {
    if (this.fileHandle) {
      this.fileHandle.write(`${this.formatTimestamp()} [${level.toUpperCase()}] ${msg}\n`);
    }
  }

  private formatOutput(level: LogLevel, msg: string, args: any[]): string {
    if (this.format === 'json') {
      const entry: Record<string, any> = {
        timestamp: this.formatTimestamp(),
        level,
        message: msg,
      };
      if (args.length > 0) {
        entry.data = args.length === 1 ? args[0] : args;
      }
      return JSON.stringify(entry);
    }
    return msg;
  }

  debug(msg: string, ...args: any[]): void {
    this.writeToFile('debug', msg);
    if (!this.shouldLog('debug')) return;
    if (this.format === 'json') {
      console.debug(this.formatOutput('debug', msg, args));
    } else {
      console.debug(`[tunnlo:debug] ${msg}`, ...args);
    }
  }

  info(msg: string, ...args: any[]): void {
    this.writeToFile('info', msg);
    if (!this.shouldLog('info')) return;
    if (this.format === 'json') {
      console.log(this.formatOutput('info', msg, args));
    } else {
      console.log(msg, ...args);
    }
  }

  warn(msg: string, ...args: any[]): void {
    this.writeToFile('warn', msg);
    if (!this.shouldLog('warn')) return;
    if (this.format === 'json') {
      console.warn(this.formatOutput('warn', msg, args));
    } else {
      console.warn(msg, ...args);
    }
  }

  error(msg: string, ...args: any[]): void {
    this.writeToFile('error', msg);
    if (!this.shouldLog('error')) return;
    if (this.format === 'json') {
      console.error(this.formatOutput('error', msg, args));
    } else {
      console.error(msg, ...args);
    }
  }

  /** Always prints regardless of level (for banners, prompts) */
  always(msg: string, ...args: any[]): void {
    this.writeToFile('info', msg);
    if (this.format === 'json') {
      console.log(this.formatOutput('info', msg, args));
    } else {
      console.log(msg, ...args);
    }
  }

  setLevel(level: LogLevel): void {
    this.level = LEVEL_ORDER[level];
  }

  getLevel(): LogLevel {
    const entries = Object.entries(LEVEL_ORDER) as [LogLevel, number][];
    return entries.find(([, v]) => v === this.level)?.[0] ?? 'info';
  }

  getFormat(): LogFormat {
    return this.format;
  }

  async close(): Promise<void> {
    if (this.fileHandle) {
      return new Promise((resolve) => {
        this.fileHandle!.end(() => resolve());
      });
    }
  }
}

/** Global singleton logger. Call `setGlobalLogger` to reconfigure. */
let globalLogger = new Logger();

export function getLogger(): Logger {
  return globalLogger;
}

export function setGlobalLogger(logger: Logger): void {
  globalLogger = logger;
}
