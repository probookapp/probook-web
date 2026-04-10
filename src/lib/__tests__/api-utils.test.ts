import { describe, it, expect, vi, beforeAll } from "vitest";

// api-utils imports auth.ts which requires JWT_SECRET at module load
beforeAll(() => {
  vi.stubEnv("JWT_SECRET", "test-secret-for-unit-tests");
  vi.stubEnv("DATABASE_URL", "postgresql://fake:fake@localhost:5432/fake");
});

// Dynamic import after env is set
let toSnakeCase: typeof import("../api-utils").toSnakeCase;
beforeAll(async () => {
  const mod = await import("../api-utils");
  toSnakeCase = mod.toSnakeCase;
});

describe("toSnakeCase", () => {
  it("converts camelCase keys to snake_case", () => {
    const input = { firstName: "John", lastName: "Doe" };
    const result = toSnakeCase(input);
    expect(result).toEqual({ first_name: "John", last_name: "Doe" });
  });

  it("handles nested objects", () => {
    const input = { userProfile: { displayName: "Jane" } };
    const result = toSnakeCase(input);
    expect(result).toEqual({ user_profile: { display_name: "Jane" } });
  });

  it("handles arrays", () => {
    const input = [{ firstName: "A" }, { firstName: "B" }];
    const result = toSnakeCase(input);
    expect(result).toEqual([{ first_name: "A" }, { first_name: "B" }]);
  });

  it("handles arrays inside objects", () => {
    const input = { userList: [{ firstName: "A" }] };
    const result = toSnakeCase(input);
    expect(result).toEqual({ user_list: [{ first_name: "A" }] });
  });

  it("returns null for null", () => {
    expect(toSnakeCase(null)).toBeNull();
  });

  it("returns undefined for undefined", () => {
    expect(toSnakeCase(undefined)).toBeUndefined();
  });

  it("converts Date to ISO string", () => {
    const date = new Date("2024-01-15T10:30:00Z");
    const result = toSnakeCase(date);
    expect(result).toBe("2024-01-15T10:30:00.000Z");
  });

  it("handles Date values inside objects", () => {
    const input = { createdAt: new Date("2024-01-15T00:00:00Z") };
    const result = toSnakeCase(input);
    expect(result).toEqual({ created_at: "2024-01-15T00:00:00.000Z" });
  });

  it("preserves already snake_case keys", () => {
    const input = { first_name: "John" };
    const result = toSnakeCase(input);
    expect(result).toEqual({ first_name: "John" });
  });

  it("handles empty object", () => {
    expect(toSnakeCase({})).toEqual({});
  });

  it("handles empty array", () => {
    expect(toSnakeCase([])).toEqual([]);
  });

  it("passes through primitive values", () => {
    expect(toSnakeCase("hello")).toBe("hello");
    expect(toSnakeCase(42)).toBe(42);
    expect(toSnakeCase(true)).toBe(true);
  });

  it("handles multiple consecutive uppercase letters", () => {
    const input = { htmlContent: "test", apiURL: "http://example.com" };
    const result = toSnakeCase(input);
    expect(result).toHaveProperty("html_content", "test");
    expect(result).toHaveProperty("api_u_r_l", "http://example.com");
  });

  it("handles deeply nested structures", () => {
    const input = {
      levelOne: {
        levelTwo: {
          levelThree: { deepValue: 42 },
        },
      },
    };
    const result = toSnakeCase(input);
    expect(result).toEqual({
      level_one: {
        level_two: {
          level_three: { deep_value: 42 },
        },
      },
    });
  });
});
