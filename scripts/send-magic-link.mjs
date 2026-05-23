async function main() {
  const slug = process.argv[2];
  const email = process.argv[3];
  const base = process.env.API_URL || "http://localhost:8080";
  const res = await fetch(`${base}/api/auth/request-link`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ gallery: slug, email: process.argv[3] }),
  });
  console.log((await res.json()).message || res.status);
}
main();