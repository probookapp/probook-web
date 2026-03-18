"use client";

import { useState, useEffect, useRef } from "react";
import QRCode from "qrcode";
import { useTranslation } from "react-i18next";
import {
  ShieldCheck,
  ShieldOff,
  Copy,
  Monitor,
  Trash2,
  LogOut,
} from "lucide-react";
import { Button, Card, CardContent, CardHeader, CardTitle, Input } from "@/components/ui";
import { toast } from "@/stores/useToastStore";
import { authApi } from "@/lib/api";

interface SessionInfo {
  id: string;
  user_agent: string | null;
  ip_address: string | null;
  last_active_at: string;
  created_at: string;
  is_current: boolean;
}

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

export function SecuritySection({ totpEnabled: initialTotpEnabled }: { totpEnabled?: boolean }) {
  const { t } = useTranslation("settings");

  // 2FA state
  const [totpEnabled, setTotpEnabled] = useState(initialTotpEnabled ?? false);
  const [setupMode, setSetupMode] = useState(false);
  const [setupSecret, setSetupSecret] = useState("");
  const [setupUri, setSetupUri] = useState("");
  const [verifyCode, setVerifyCode] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [showBackupCodes, setShowBackupCodes] = useState(false);
  const [disableMode, setDisableMode] = useState(false);
  const [disablePassword, setDisablePassword] = useState("");
  const [isSettingUp, setIsSettingUp] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isDisabling, setIsDisabling] = useState(false);

  // Sessions state
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);
  const [isRevokingAll, setIsRevokingAll] = useState(false);

  useEffect(() => {
    loadSessions();
  }, []);

  const loadSessions = async () => {
    setIsLoadingSessions(true);
    try {
      const data = await authApi.getSessions();
      setSessions(data);
    } catch {
      // Silently fail
    } finally {
      setIsLoadingSessions(false);
    }
  };

  const handleSetup2FA = async () => {
    setIsSettingUp(true);
    try {
      const { secret, uri } = await authApi.totpSetup();
      setSetupSecret(secret);
      setSetupUri(uri);
      setSetupMode(true);
    } catch {
      toast.error("Failed to set up 2FA");
    } finally {
      setIsSettingUp(false);
    }
  };

  const handleVerifySetup = async () => {
    if (!verifyCode) return;
    setIsVerifying(true);
    try {
      const { backup_codes } = await authApi.totpVerifySetup(verifyCode);
      setBackupCodes(backup_codes);
      setShowBackupCodes(true);
      setSetupMode(false);
      setTotpEnabled(true);
      setVerifyCode("");
    } catch {
      toast.error("Invalid code. Please try again.");
    } finally {
      setIsVerifying(false);
    }
  };

  const handleCopyBackupCodes = () => {
    navigator.clipboard.writeText(backupCodes.join("\n"));
    toast.success(t("security.twoFactor.backupCodesCopied"));
  };

  const handleDisable2FA = async () => {
    if (!disablePassword) return;
    setIsDisabling(true);
    try {
      await authApi.totpDisable(disablePassword);
      setTotpEnabled(false);
      setDisableMode(false);
      setDisablePassword("");
      toast.success("2FA disabled");
    } catch {
      toast.error("Invalid password");
    } finally {
      setIsDisabling(false);
    }
  };

  const handleRevokeSession = async (id: string) => {
    try {
      await authApi.revokeSession(id);
      setSessions((prev) => prev.filter((s) => s.id !== id));
    } catch {
      toast.error("Failed to revoke session");
    }
  };

  const handleRevokeAll = async () => {
    if (!confirm(t("security.sessions.revokeAllConfirm"))) return;
    setIsRevokingAll(true);
    try {
      await authApi.revokeAllSessions();
      setSessions((prev) => prev.filter((s) => s.is_current));
    } catch {
      toast.error("Failed to revoke sessions");
    } finally {
      setIsRevokingAll(false);
    }
  };

  const parseUserAgent = (ua: string | null): string => {
    if (!ua) return "Unknown device";
    // Simple UA parsing
    if (ua.includes("Chrome") && !ua.includes("Edg")) return "Chrome";
    if (ua.includes("Firefox")) return "Firefox";
    if (ua.includes("Safari") && !ua.includes("Chrome")) return "Safari";
    if (ua.includes("Edg")) return "Edge";
    return ua.slice(0, 50);
  };

  const formatDate = (iso: string) => {
    return new Date(iso).toLocaleString();
  };

  const otherSessions = sessions.filter((s) => !s.is_current);

  return (
    <div className="space-y-6">
      {/* Two-Factor Authentication */}
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

          {/* Show backup codes after successful setup */}
          {showBackupCodes && backupCodes.length > 0 && (
            <div className="border border-yellow-300 dark:border-yellow-600 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg p-4 space-y-3">
              <h4 className="font-medium text-yellow-800 dark:text-yellow-200">
                {t("security.twoFactor.backupCodesTitle")}
              </h4>
              <p className="text-sm text-yellow-700 dark:text-yellow-300">
                {t("security.twoFactor.backupCodesDescription")}
              </p>
              <div className="grid grid-cols-2 gap-2 font-mono text-sm">
                {backupCodes.map((code, i) => (
                  <div
                    key={i}
                    className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded px-3 py-1.5 text-center"
                  >
                    {code}
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={handleCopyBackupCodes}
                >
                  <Copy className="h-4 w-4 mr-2" />
                  Copy
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setShowBackupCodes(false);
                    setBackupCodes([]);
                  }}
                >
                  Done
                </Button>
              </div>
            </div>
          )}

          {/* Setup mode */}
          {setupMode && (
            <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 space-y-4">
              <h4 className="font-medium text-gray-900 dark:text-gray-100">
                {t("security.twoFactor.setupTitle")}
              </h4>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {t("security.twoFactor.setupDescription")}
              </p>

              {/* QR Code — generated client-side, no secret leaked */}
              <QrCanvas uri={setupUri} />

              {/* Manual key — enter this in your authenticator app */}
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
                      toast.success("Key copied");
                    }}
                    className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                  >
                    <Copy className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Verification code input */}
              <div className="flex gap-2 items-end">
                <div className="flex-1">
                  <Input
                    label={t("security.twoFactor.verifyCode")}
                    value={verifyCode}
                    onChange={(e) => setVerifyCode(e.target.value)}
                    placeholder="000000"
                    autoComplete="one-time-code"
                  />
                </div>
                <Button
                  type="button"
                  onClick={handleVerifySetup}
                  isLoading={isVerifying}
                  disabled={!verifyCode || verifyCode.length < 6}
                >
                  {t("security.twoFactor.verify")}
                </Button>
              </div>
            </div>
          )}

          {/* Disable mode */}
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
                  onClick={handleDisable2FA}
                  isLoading={isDisabling}
                  disabled={!disablePassword}
                >
                  {t("security.twoFactor.disable")}
                </Button>
              </div>
            </div>
          )}

          {/* Status and action buttons */}
          {!setupMode && !showBackupCodes && (
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
                <Button
                  type="button"
                  onClick={handleSetup2FA}
                  isLoading={isSettingUp}
                >
                  <ShieldCheck className="h-4 w-4 mr-2" />
                  {t("security.twoFactor.enable")}
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Active Sessions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Monitor className="h-5 w-5" />
            {t("security.sessions.title")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {t("security.sessions.description")}
          </p>

          {isLoadingSessions ? (
            <div className="flex justify-center py-4">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600" />
            </div>
          ) : (
            <div className="space-y-3">
              {sessions.map((session) => (
                <div
                  key={session.id}
                  className="flex items-center justify-between border border-gray-200 dark:border-gray-700 rounded-lg p-3"
                >
                  <div className="space-y-1 min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {parseUserAgent(session.user_agent)}
                      </span>
                      {session.is_current && (
                        <span className="text-xs bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 px-2 py-0.5 rounded-full">
                          {t("security.sessions.current")}
                        </span>
                      )}
                    </div>
                    <div className="flex gap-4 text-xs text-gray-500 dark:text-gray-400">
                      {session.ip_address && (
                        <span>
                          {t("security.sessions.ipAddress")}: {session.ip_address}
                        </span>
                      )}
                      <span>
                        {t("security.sessions.lastActive")}: {formatDate(session.last_active_at)}
                      </span>
                    </div>
                  </div>
                  {!session.is_current && (
                    <Button
                      type="button"
                      variant="danger"
                      onClick={() => handleRevokeSession(session.id)}
                    >
                      <Trash2 className="h-4 w-4 mr-1" />
                      {t("security.sessions.revoke")}
                    </Button>
                  )}
                </div>
              ))}

              {otherSessions.length === 0 && (
                <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-2">
                  {t("security.sessions.noOtherSessions")}
                </p>
              )}

              {otherSessions.length > 0 && (
                <Button
                  type="button"
                  variant="danger"
                  onClick={handleRevokeAll}
                  isLoading={isRevokingAll}
                  className="w-full"
                >
                  <LogOut className="h-4 w-4 mr-2" />
                  {t("security.sessions.revokeAll")}
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
