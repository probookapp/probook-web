import { NextResponse } from "next/server";
import { z } from "zod";

/**
 * Parse and validate a request body against a Zod schema.
 * Returns the parsed data on success, or a NextResponse with validation errors on failure.
 */
export async function validateBody<T extends z.ZodType>(
  req: Request,
  schema: T
): Promise<z.infer<T> | NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const result = schema.safeParse(body);
  if (!result.success) {
    const errors = result.error.issues.map((issue) => ({
      field: issue.path.join("."),
      message: issue.message,
    }));
    return NextResponse.json(
      { error: "Validation failed", details: errors },
      { status: 400 }
    );
  }

  return result.data;
}

/**
 * Type guard to check if validateBody returned an error response.
 */
export function isValidationError<T>(
  result: T | NextResponse
): result is NextResponse {
  return result instanceof NextResponse;
}
