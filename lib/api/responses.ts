import { NextResponse } from "next/server";

export function jsonError(
  message: string,
  status: number,
  extras?: Record<string, unknown>,
) {
  return NextResponse.json({ error: message, ...extras }, { status });
}

export function jsonOk<T>(data: T, status = 200) {
  return NextResponse.json(data, { status });
}
