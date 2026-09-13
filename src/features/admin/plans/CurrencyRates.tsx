"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { Button, Card, CardContent, Input } from "@/components/ui";
import { useSuperAdminOnly } from "@/features/admin/hooks/useSuperAdmin";

/**
 * The currencies the catalogue is published in.
 *
 * Every price lives once, in dinars. This is the only other number needed to
 * sell abroad: the offers, the à la carte modules and the extra seats all
 * convert from it. That is the point — a second hand-typed grid drifted from
 * the first in production, and nothing could notice, because two independent
 * numbers have no relationship to keep.
 *
 * A currency with no row is not offered. Prices then stay in dinars, correctly
 * labelled, which is the one honest answer when nobody has set a rate.
 */
interface Rate {
  code: string;
  per_dzd: string | number;
  round_to: number;
}

async function call(path: string, init?: RequestInit) {
  const res = await fetch(path, { credentials: "include", ...init });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error || `Request failed (${res.status})`);
  return body;
}

export function CurrencyRates() {
  const { t } = useTranslation("admin");
  const queryClient = useQueryClient();
  const superOnly = useSuperAdminOnly();

  const [code, setCode] = useState("");
  const [perDzd, setPerDzd] = useState("");
  const [roundTo, setRoundTo] = useState("100");
  const [error, setError] = useState("");

  const { data: rates } = useQuery<Rate[]>({
    queryKey: ["admin-currency-rates"],
    queryFn: () => call("/api/admin/currency-rates"),
  });

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      call("/api/admin/currency-rates", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      setCode("");
      setPerDzd("");
      setError("");
      queryClient.invalidateQueries({ queryKey: ["admin-currency-rates"] });
    },
    onError: (e: Error) => setError(e.message),
  });

  const remove = useMutation({
    mutationFn: (c: string) =>
      call(`/api/admin/currency-rates?code=${encodeURIComponent(c)}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-currency-rates"] }),
    onError: (e: Error) => setError(e.message),
  });

  return (
    <Card className="mb-6">
      <CardContent className="p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          {t("currencyRates.title")}
        </h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          {t("currencyRates.help")}
        </p>

        {(rates?.length ?? 0) > 0 && (
          <ul className="mt-4 space-y-2">
            {rates!.map((rate) => (
              <li
                key={rate.code}
                className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2"
              >
                <span className="font-medium">{rate.code}</span>
                <span className="flex items-center gap-4">
                  <span className="text-sm font-mono tabular-nums text-gray-600 dark:text-gray-300">
                    {t("currencyRates.perDinar", { value: Number(rate.per_dzd) })}
                  </span>
                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    {t("currencyRates.step", { value: rate.round_to / 100 })}
                  </span>
                  <Button
                    {...superOnly.button}
                    variant="danger"
                    size="sm"
                    onClick={() => remove.mutate(rate.code)}
                    isLoading={remove.isPending}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-4 grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
          <Input
            name="rate-code"
            label={t("currencyRates.code")}
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="EUR"
            maxLength={3}
          />
          <Input
            name="rate-per-dzd"
            type="number"
            step="0.00001"
            label={t("currencyRates.rate")}
            value={perDzd}
            onChange={(e) => setPerDzd(e.target.value)}
            placeholder="0.0069"
          />
          <Input
            name="rate-round-to"
            type="number"
            step="1"
            min="1"
            label={t("currencyRates.rounding")}
            value={roundTo}
            onChange={(e) => setRoundTo(e.target.value)}
          />
          <Button
            {...superOnly.button}
            onClick={() =>
              save.mutate({
                code,
                per_dzd: Number(perDzd),
                round_to: Number(roundTo) || 100,
              })
            }
            isLoading={save.isPending}
            disabled={!code.trim() || !perDzd.trim()}
          >
            {t("currencyRates.save")}
          </Button>
        </div>

        {error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
      </CardContent>
    </Card>
  );
}
