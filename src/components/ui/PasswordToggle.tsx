import { useTranslation } from "react-i18next";
import { Eye, EyeOff } from "lucide-react";

interface PasswordToggleProps {
  shown: boolean;
  onToggle: () => void;
}

/**
 * The eye at the end of a password field.
 *
 * Place it inside a `relative` wrapper around an `<Input>` (with `pe-10` on the
 * input so typing never runs under it). It sits on the wrapper's bottom edge,
 * which is the input's, so the label above does not have to be measured.
 *
 * It was a bare 20px icon pinned with `right-3`: too small to hit with a thumb,
 * silent to a screen reader, and on the wrong side of the field in Arabic.
 */
export function PasswordToggle({ shown, onToggle }: PasswordToggleProps) {
  const { t } = useTranslation("auth");
  const label = shown ? t("passwordToggle.hide") : t("passwordToggle.show");

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={label}
      title={label}
      className="absolute bottom-0 end-0 flex h-10 w-10 items-center justify-center rounded-e-md text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 lg:h-9"
    >
      {shown ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
    </button>
  );
}
