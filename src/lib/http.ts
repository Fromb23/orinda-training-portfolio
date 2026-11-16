import { NextResponse } from "next/server";

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export function jsonError(error: unknown) {
  if (error instanceof HttpError) return NextResponse.json({ error: error.message }, { status: error.status });
  console.error("Request failed", error instanceof Error ? error.message : "unknown error");
  return NextResponse.json({ error: "The request could not be completed." }, { status: 500 });
}

export function privateJson(data: unknown, init?: ResponseInit) {
  const response = NextResponse.json(data, init);
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  return response;
}
