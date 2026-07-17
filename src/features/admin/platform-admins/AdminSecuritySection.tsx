"use client";

import { useState, useEffect, useRef } from "react";
import QRCode from "qrcode";
import { useTranslation } from "react-i18next";
import { ShieldCheck, ShieldOff, Copy } from "lucide-react";
import { Button, Card, CardContent, CardHeader, CardTitle, Input } from "@/components/ui";
import { toast } from "@/stores/useToastStore";
import { adminAuthApi } from "@/lib/admin-api";

function QrCanvas({ uri }: { uri: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (canvasRef.current && uri) {
      QRCode.toCanvas(canvasRef.current, uri, { width: 200, margin: 2 });
    }
  }, [uri]);

  return (
    <div className="flex justify-center">
      <canvas
        ref={canvasRef}
        className="rounded border border-gray-200 dark:border-gray-700"
      />
    </div>
  );
}

export function AdminSecuritySection() {
  const { t } = useTranslation("admin");

  const [totpEnabled, setTotpEnabled] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [setupMode, setSetupMode] = useState(false);
  const [setupSecret, setSetupSecret] = useState("");
  const [setupUri, setSetupUri] = useState("");
  const [verifyCode, setVerifyCode] = useState("");
  const [disableMode, setDisableMode] = useState(false);
  const [disablePassword, setDisablePassword] = useState("");
  const [isSettingUp, setIsSettingUp] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isDisabling, setIsDisabling] = useState(false);

  useEffect(() => {
    adminAuthApi
      .getMe()
      .then((me) => {
        if (me) setTotpEnabled(Boolean(me.totp_enabled));
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  const handleSetup = async () => {
    setIsSettingUp(true);
    try {
      const { secret, uri } = await adminAuthApi.totpSetup();
      setSetupSecret(secret);
      setSetupUri(uri);
      setSetupMode(true);
    } catch {
      toast.error(t("security.twoFactor.setupError"));
    } finally {
      setIsSettingUp(false);
    }
  };

  const handleVerifySetup = async () => {
    if (verifyCode.length < 6) return;
    setIsVerifying(true);
    try {
      await adminAuthApi.totpVerifySetup(verifyCode);
      setTotpEnabled(true);
      setSetupMode(false);
      setVerifyCode("");
      toast.success(t("security.twoFactor.enabledToast"));
    } catch {
      toast.error(t("security.twoFactor.invalidCode"));
    } finally {
      setIsVerifying(false);
    }
  };

  const handleDisable = async () => {
    if (!disablePassword) return;
    setIsDisabling(true);
    try {
      await adminAuthApi.totpDisable(disablePassword);
      setTotpEnabled(false);
      setDisableMode(false);
      setDisablePassword("");
      toast.success(t("security.twoFactor.disabledToast"));
    } catch {
      toast.error(t("security.twoFactor.invalidPassword"));
    } finally {
      setIsDisabling(false);
    }
  };

  if (!loaded) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5" />
          {t("security.twoFactor.title")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {t("security.twoFactor.description")}
        </p>

        {setupMode && (
          <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 space-y-4">
            <h4 className="font-medium text-gray-900 dark:text-gray-100">
              {t("security.twoFactor.setupTitle")}
            </h4>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {t("security.twoFactor.setupDescription")}
            </p>

            <QrCanvas uri={setupUri} />

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {t("security.twoFactor.manualKey")}
              </label>
              <div className="flex items-center gap-2">
                <code className="flex-1 bg-gray-100 dark:bg-gray-900 rounded px-3 py-2 text-sm font-mono break-all">
                  {setupSecret}
                </code>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(setupSecret);
                    toast.success(t("security.twoFactor.keyCopied"));
                  }}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  <Copy className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <Input
                  label={t("security.twoFactor.verifyCode")}
                  value={verifyCode}
                  onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, ""))}
                  placeholder="000000"
                  inputMode="numeric"
                  maxLength={6}
                  autoComplete="one-time-code"
                />
              </div>
              <Button
                type="button"
                onClick={handleVerifySetup}
                isLoading={isVerifying}
                disabled={verifyCode.length < 6}
              >
                {t("security.twoFactor.verify")}
              </Button>
            </div>
          </div>
        )}

        {disableMode && (
          <div className="border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/10 rounded-lg p-4 space-y-3">
            <p className="text-sm text-red-700 dark:text-red-300">
              {t("security.twoFactor.disableConfirm")}
            </p>
            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <Input
                  label={t("security.twoFactor.disablePassword")}
                  type="password"
                  value={disablePassword}
                  onChange={(e) => setDisablePassword(e.target.value)}
                  autoComplete="current-password"
                />
              </div>
              <Button
                type="button"
                variant="danger"
                onClick={handleDisable}
                isLoading={isDisabling}
                disabled={!disablePassword}
              >
                {t("security.twoFactor.disable")}
              </Button>
            </div>
          </div>
        )}

        {!setupMode && (
          <div className="flex items-center justify-between">
            <p
              className={`text-sm font-medium ${
                totpEnabled
                  ? "text-green-600 dark:text-green-400"
                  : "text-gray-500 dark:text-gray-400"
              }`}
            >
              {totpEnabled
                ? t("security.twoFactor.enabled")
                : t("security.twoFactor.disabled")}
            </p>
            {totpEnabled ? (
              <Button
                type="button"
                variant="danger"
                onClick={() => setDisableMode(!disableMode)}
              >
                <ShieldOff className="h-4 w-4 mr-2" />
                {t("security.twoFactor.disable")}
              </Button>
            ) : (
              <Button type="button" onClick={handleSetup} isLoading={isSettingUp}>
                <ShieldCheck className="h-4 w-4 mr-2" />
                {t("security.twoFactor.enable")}
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
