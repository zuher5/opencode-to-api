export function kiloHeaders(customAuth = null) {
  const headers = {
    "Content-Type": "application/json",
  };
  const token = customAuth || process.env.KILO_API_KEY;
  if (token && typeof token === "string" && token.trim()) {
    headers["Authorization"] = token.startsWith("Bearer ") ? token : `Bearer ${token.trim()}`;
  }
  // Free gateway rejects dummy tokens; keyless by design
  return headers;
}
