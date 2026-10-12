export function createOpenAIError(message, type = "api_error", code = null, param = null) {
  return {
    error: {
      message: String(message),
      type,
      param,
      code,
    },
  };
}

export function sendJsonError(res, statusCode, message, type = "api_error", code = null) {
  if (res.headersSent) {
    if (!res.writableEnded) res.end();
    return;
  }
  const body = JSON.stringify(createOpenAIError(message, type, code));
  res.writeHead(statusCode, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(body),
    "access-control-allow-origin": "*",
  });
  res.end(body);
}
