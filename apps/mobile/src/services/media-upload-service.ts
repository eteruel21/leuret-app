import { API_URL, authenticatedRequest } from "./api";

type UploadImageInput = {
  fileData: string;
  mimeType: "image/jpeg" | "image/png" | "image/webp";
};

function absoluteMediaUrl(url: string): string {
  return url.startsWith("/") ? `${API_URL}${url}` : url;
}

export async function uploadProfileMedia(
  input: UploadImageInput & {
    mediaType: "avatar" | "company-logo";
  }
): Promise<string> {
  const response = await authenticatedRequest<{ url: string }>(
    "/profile/media",
    {
      method: "POST",
      body: JSON.stringify(input)
    }
  );

  return absoluteMediaUrl(response.url);
}

export async function uploadCompanyLogo(
  companyId: string,
  input: UploadImageInput
): Promise<string> {
  const response = await authenticatedRequest<{ url: string }>(
    `/companies/${companyId}/logo`,
    {
      method: "POST",
      body: JSON.stringify(input)
    }
  );

  return absoluteMediaUrl(response.url);
}
