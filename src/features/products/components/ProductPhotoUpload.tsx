import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "@/stores/useToastStore";
import { Camera, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui";
import { useDemoMode } from "@/components/providers/DemoModeProvider";
import {
  useProductPhoto,
  useUploadProductPhoto,
  useDeleteProductPhoto,
} from "../hooks/useProducts";

interface ProductPhotoUploadProps {
  productId: string;
}

export function ProductPhotoUpload({ productId }: ProductPhotoUploadProps) {
  const { t } = useTranslation("common");
  const { isDemoMode, showSubscribePrompt } = useDemoMode();
  const [isUploading, setIsUploading] = useState(false);
  const { data: photoBase64, isLoading } = useProductPhoto(productId);
  const uploadPhoto = useUploadProductPhoto();
  const deletePhoto = useDeleteProductPhoto();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (isDemoMode) { showSubscribePrompt(); return; }
    try {
      setIsUploading(true);
      await uploadPhoto.mutateAsync({ productId, file });
    } catch {
      toast.error(t("photos.errorUploading"));
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDelete = async () => {
    if (isDemoMode) { showSubscribePrompt(); return; }
    try {
      await deletePhoto.mutateAsync(productId);
    } catch {
      toast.error(t("photos.errorDeleting"));
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-32 bg-gray-50 dark:bg-gray-800 rounded-lg border-2 border-dashed border-gray-200 dark:border-gray-700">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
        {t("photos.productPhoto")}
      </label>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp"
        onChange={handleFileSelected}
        className="hidden"
      />
      {photoBase64 ? (
        <div className="relative group">
          <img
            src={photoBase64}
            alt={t("photos.productPhoto")}
            className="w-full h-48 object-cover rounded-lg border border-gray-200 dark:border-gray-700"
          />
          <div className="absolute inset-0 bg-black bg-opacity-50 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center gap-3">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={handleUpload}
              isLoading={isUploading}
            >
              <Upload className="h-4 w-4 mr-1" />
              {t("photos.change")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="danger"
              onClick={handleDelete}
              isLoading={deletePhoto.isPending}
            >
              <Trash2 className="h-4 w-4 mr-1" />
              {t("buttons.delete")}
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={handleUpload}
          disabled={isUploading}
          className="w-full h-32 bg-gray-50 dark:bg-gray-800 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 hover:border-primary-400 dark:hover:border-primary-500 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors flex flex-col items-center justify-center gap-2 text-gray-500 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400"
        >
          {isUploading ? (
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600" />
          ) : (
            <>
              <Camera className="h-8 w-8" />
              <span className="text-sm font-medium">{t("photos.addPhoto")}</span>
            </>
          )}
        </button>
      )}
    </div>
  );
}
