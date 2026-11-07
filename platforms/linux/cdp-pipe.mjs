// Chromium reads NUL-terminated CDP JSON from FD 3 and writes replies to FD 4.
const maxFrameLength = 16 * 1024 * 1024;

export function connectPipe(input, output) {
  const pending = new Map();
  let nextId = 0;
  let buffer = '';
  let closed;

  function close(reason = new Error('The desktop debugging pipe closed.')) {
    if (closed) return;
    closed = reason;
    for (const { reject, timer } of pending.values()) {
      clearTimeout(timer);
      reject(reason);
    }
    pending.clear();
    input.destroy();
    output.destroy();
  }

  input.on('error', close);
  output.on('error', close);
  for (const stream of [input, output]) stream.on('close', () => close());
  output.on('end', () => close());
  output.setEncoding('utf8');
  output.on('data', chunk => {
    buffer += chunk;
    let end;
    while ((end = buffer.indexOf('\0')) !== -1) {
      if (end > maxFrameLength) {
        close(new Error('Oversized desktop debugging message.'));
        return;
      }
      const frame = buffer.slice(0, end);
      buffer = buffer.slice(end + 1);
      let message;
      try {
        message = JSON.parse(frame);
      } catch {
        close(new Error('Invalid JSON from the desktop debugging pipe.'));
        return;
      }
      const request = pending.get(message?.id);
      if (!request) continue; // CDP events and late replies are not requests.
      pending.delete(message.id);
      clearTimeout(request.timer);
      if (message.error) request.reject(new Error(message.error.message));
      else request.resolve(message.result);
    }
    if (buffer.length > maxFrameLength) close(new Error('Oversized desktop debugging message.'));
  });

  return {
    close,
    call(method, params = {}, { sessionId, timeout = 5000 } = {}) {
      if (closed) return Promise.reject(closed);
      const id = ++nextId;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error(`${method} timed out.`));
        }, timeout);
        pending.set(id, { resolve, reject, timer });
        input.write(JSON.stringify({ id, method, params, sessionId }) + '\0', 'utf8', error => {
          if (error) close(error);
        });
      });
    },
  };
}
