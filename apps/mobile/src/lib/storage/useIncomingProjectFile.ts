import * as Linking from "expo-linking";
import * as Sharing from "expo-sharing";
import { useCallback, useEffect, useRef } from "react";
import { importProjectFromUri } from "./importFile";

/**
 * Files arriving from outside the app: the OS share sheet, and opening a .json from Files
 * or a download. The document types are declared in app.config.ts.
 *
 * Deliberately defensive. This runs on every cold start, and a malformed payload from
 * some third-party app must surface as a message rather than take the dashboard down.
 *
 * UNVERIFIED AT RUNTIME — neither entry point has been exercised on a device. See
 * agent/ios-handoff.md.
 */
export function useIncomingProjectFile(handlers: {
  onImported: (projectId: string) => void;
  onError: (message: string) => void;
}) {
  const { onImported, onError } = handlers;

  // A cold start can deliver the same file through both the share payload and the initial
  // URL; importing twice would silently make two projects.
  const handledRef = useRef(new Set<string>());

  const handleUri = useCallback(
    async (uri: string) => {
      if (handledRef.current.has(uri)) return;
      handledRef.current.add(uri);

      const result = await importProjectFromUri(uri);
      if (result.status === "imported") {
        onImported(result.project.id);
      } else if (result.status === "failed") {
        onError(result.error);
      }
    },
    [onImported, onError],
  );

  // Share sheet (Android SEND, iOS share extension).
  useEffect(() => {
    let cancelled = false;

    async function drainSharedPayloads() {
      try {
        const payloads = await Sharing.getResolvedSharedPayloadsAsync();
        if (cancelled || payloads.length === 0) return;

        for (const payload of payloads) {
          const uri = payload.contentUri ?? payload.value;
          if (uri && payload.contentType !== "website") await handleUri(uri);
        }
      } catch {
        // No payloads, or the platform does not support them. Not an error worth showing.
      } finally {
        try {
          Sharing.clearSharedPayloads();
        } catch {
          // Nothing to clear.
        }
      }
    }

    void drainSharedPayloads();
    return () => {
      cancelled = true;
    };
  }, [handleUri]);

  // File-open: a file:// or content:// URL delivered as the launch intent.
  const url = Linking.useURL();
  useEffect(() => {
    if (!url) return;
    // Ignore our own deep links (mothlight://…); only file-ish URLs are imports.
    if (!url.startsWith("file://") && !url.startsWith("content://")) return;
    void handleUri(url);
  }, [url, handleUri]);
}
