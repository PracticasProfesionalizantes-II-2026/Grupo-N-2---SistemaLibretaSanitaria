import "server-only";

import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { BlobServiceClient } from "@azure/storage-blob";

/**
 * File storage (ex hosted storage service). Same bucket names as before:
 * pet-documents, pet-photos, profile-photos, vet-signatures (+ medical studies).
 *
 * Driver chosen by STORAGE_DRIVER:
 *   - `local` (default): files under ./.storage/<bucket>/<path> (gitignored).
 *   - `azure`: one Blob container per bucket, AZURE_STORAGE_CONNECTION_STRING.
 *
 * Files are always served by /api/storage/<bucket>/<path>, which checks the
 * session for private buckets. Public URLs therefore never expose the driver.
 */

export const PUBLIC_BUCKETS = new Set(["pet-photos", "profile-photos"]);

type StoredFile = { data: Buffer; contentType: string };

export interface StorageDriver {
  upload(
    bucket: string,
    filePath: string,
    data: Buffer,
    contentType?: string,
  ): Promise<void>;
  download(bucket: string, filePath: string): Promise<StoredFile | null>;
  remove(bucket: string, filePaths: string[]): Promise<void>;
  /** Deletes everything under `folder/` (e.g. all files of one pet). */
  removeFolder(bucket: string, folder: string): Promise<void>;
}

const MIME_BY_EXT: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".pdf": "application/pdf",
};

const guessContentType = (filePath: string) =>
  MIME_BY_EXT[path.extname(filePath).toLowerCase()] ??
  "application/octet-stream";

/** Rejects `..`, absolute paths and empty segments. */
function assertSafePath(bucket: string, filePath: string) {
  const ok =
    /^[a-z0-9-]+$/.test(bucket) &&
    filePath.length > 0 &&
    filePath
      .split("/")
      .every((seg) => seg !== "" && seg !== "." && seg !== "..");
  if (!ok) throw new Error(`storage: ruta inválida ${bucket}/${filePath}`);
}

function localDriver(root = path.resolve(process.cwd(), ".storage")) {
  const resolve = (bucket: string, filePath: string) => {
    assertSafePath(bucket, filePath);
    return path.join(root, bucket, filePath);
  };

  return {
    async upload(bucket, filePath, data) {
      const target = resolve(bucket, filePath);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, data);
    },
    async download(bucket, filePath) {
      try {
        const data = await readFile(resolve(bucket, filePath));
        return { data, contentType: guessContentType(filePath) };
      } catch {
        return null;
      }
    },
    async remove(bucket, filePaths) {
      await Promise.all(
        filePaths.map((p) => rm(resolve(bucket, p), { force: true })),
      );
    },
    async removeFolder(bucket, folder) {
      await rm(resolve(bucket, folder), { recursive: true, force: true });
    },
  } satisfies StorageDriver;
}

function azureDriver(connectionString: string) {
  const service = BlobServiceClient.fromConnectionString(connectionString);
  const blob = (bucket: string, filePath: string) => {
    assertSafePath(bucket, filePath);
    return service.getContainerClient(bucket).getBlockBlobClient(filePath);
  };

  return {
    async upload(bucket, filePath, data, contentType) {
      await service.getContainerClient(bucket).createIfNotExists();
      await blob(bucket, filePath).uploadData(data, {
        blobHTTPHeaders: {
          blobContentType: contentType ?? guessContentType(filePath),
        },
      });
    },
    async download(bucket, filePath) {
      try {
        const client = blob(bucket, filePath);
        const data = await client.downloadToBuffer();
        const props = await client.getProperties();
        return {
          data,
          contentType: props.contentType ?? guessContentType(filePath),
        };
      } catch {
        return null;
      }
    },
    async remove(bucket, filePaths) {
      await Promise.all(filePaths.map((p) => blob(bucket, p).deleteIfExists()));
    },
    async removeFolder(bucket, folder) {
      assertSafePath(bucket, folder);
      const container = service.getContainerClient(bucket);
      if (!(await container.exists())) return;
      for await (const item of container.listBlobsFlat({
        prefix: `${folder}/`,
      })) {
        await container.deleteBlob(item.name);
      }
    },
  } satisfies StorageDriver;
}

let driver: StorageDriver | undefined;

export function getStorage(): StorageDriver {
  if (driver) return driver;

  if (process.env.STORAGE_DRIVER === "azure") {
    const conn = process.env.AZURE_STORAGE_CONNECTION_STRING;
    if (!conn) {
      throw new Error(
        "STORAGE_DRIVER=azure necesita AZURE_STORAGE_CONNECTION_STRING.",
      );
    }
    driver = azureDriver(conn);
  } else {
    driver = localDriver();
  }
  return driver;
}

/** URL to store in rows (`photo_url`, `avatar_url`) and render as-is. */
export function storageUrl(bucket: string, filePath: string): string {
  return `/api/storage/${bucket}/${filePath.split("/").map(encodeURIComponent).join("/")}`;
}

/** Inverse of `storageUrl`, to delete or replace the previous file. */
export function storagePathFromUrl(bucket: string, url: string): string | null {
  const prefix = `/api/storage/${bucket}/`;
  const at = url.indexOf(prefix);
  if (at === -1) return null;
  return url
    .slice(at + prefix.length)
    .split("/")
    .map(decodeURIComponent)
    .join("/");
}
