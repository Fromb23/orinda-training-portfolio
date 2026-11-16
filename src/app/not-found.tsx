import Link from "next/link";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function NotFound() {
  const session = await getSession();
  const destination = session?.role === "MANAGEMENT" ? "/manage" : session?.role === "SUPERVISOR" ? "/portfolio" : "/";

  return <main className="not-found-page">
    <section className="not-found-card" aria-labelledby="not-found-heading">
      <span className="not-found-code" aria-hidden="true">404</span>
      <p className="eyebrow">Unavailable page</p>
      <h1 id="not-found-heading">Page not found</h1>
      <p>The page may have been removed, or the address may be incorrect. You can return safely without losing your place.</p>
      <Link className="button not-found-action" href={destination}>
        <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" focusable="false"><path d="M10.5 5 3.5 12l7 7M4 12h16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
        Back to home
      </Link>
    </section>
  </main>;
}
