function getLogger(name) {
  function log(level, message, extra = {}) {
    process.stdout.write(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level,
        logger: name,
        message,
        ...extra,
      }) + '\n'
    );
  }
  return {
    info:  (msg, extra) => log('INFO',  msg, extra),
    warn:  (msg, extra) => log('WARN',  msg, extra),
    error: (msg, extra) => log('ERROR', msg, extra),
  };
}

export { getLogger };
