export const dynamic = "force-dynamic";

export default async function AccessRequired({ searchParams }: { searchParams: Promise<{ access?: string; role?: string }> }) {
  const query = await searchParams;
  const invalid = query.access === "invalid";
  const missingSession = query.access === "session";
  const role = query.role === "management" ? "management" : "supervisor";
  return <main className="access-page"><div className="access-card"><span className="brand-mark">MO</span><p className="eyebrow">Private portfolio</p><h1>{invalid ? "Access link unavailable" : missingSession ? "Session required" : "Access link required"}</h1>{invalid ? <><p role="alert">This {role} link is invalid or has been replaced. Ask for the current full access link and open it again.</p><p>Clean portfolio URLs only work after a valid link has established a session in this browser.</p></> : missingSession ? <><p role="alert">There is no current {role} session in this browser, or the previous session has expired.</p><p>Open the current full {role} access link again. A clean portfolio URL is not a permanent share link.</p></> : <p>This portfolio is private. Use the full access link provided to you by Mr. Orinda.</p>}</div></main>;
}
