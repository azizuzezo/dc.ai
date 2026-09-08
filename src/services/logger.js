function ts() {
  return new Date().toISOString();
}

export function logInfo(...args) {
  console.log(`[${ts()}] [INFO]`, ...args);
}

export function logWarn(...args) {
  console.warn(`[${ts()}] [WARN]`, ...args);
}

export function logError(...args) {
  console.error(`[${ts()}] [ERROR]`, ...args);
}
