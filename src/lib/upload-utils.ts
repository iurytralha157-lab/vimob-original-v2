
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface UploadOptions {
  bucket: string;
  path: string;
  maxSizeInMB?: number;
  allowedTypes?: string[];
}

export async function validateFile(file: File, options: UploadOptions): Promise<boolean> {
  const { maxSizeInMB = 10, allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] } = options;

  // Validate type
  if (!allowedTypes.includes(file.type)) {
    toast.error(`Tipo de arquivo não permitido: ${file.type}. Use ${allowedTypes.join(', ')}`);
    return false;
  }

  // Validate size
  if (file.size > maxSizeInMB * 1024 * 1024) {
    toast.error(`Arquivo muito grande: ${(file.size / (1024 * 1024)).toFixed(2)}MB. O limite é ${maxSizeInMB}MB`);
    return false;
  }

  return true;
}

export async function uploadFile(file: File, options: UploadOptions): Promise<string | null> {
  const isValid = await validateFile(file, options);
  if (!isValid) return null;

  try {
    const { bucket, path } = options;
    const fileExt = file.name.split('.').pop();
    const fileName = `${path}/${Date.now()}-${Math.random().toString(36).slice(2, 9)}.${fileExt}`;

    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(fileName, file, {
        cacheControl: '3600',
        upsert: false
      });

    if (uploadError) {
      console.error(`Error uploading to ${bucket}:`, uploadError);
      throw uploadError;
    }

    const { data } = supabase.storage.from(bucket).getPublicUrl(fileName);
    return data.publicUrl;
  } catch (error: any) {
    console.error('Upload failed:', error);
    toast.error(`Falha no upload: ${error.message || 'Erro desconhecido'}`);
    return null;
  }
}
