import * as MediaLibrary from "expo-media-library";
import * as Sharing from "expo-sharing";

/**
 * Getting the finished video off the device and into the world.
 *
 * §10 step 6 is "render it, find it in their camera roll, and post it to TikTok from
 * there". So the camera roll is the destination, and the share sheet is offered straight
 * after rather than making the user go hunting.
 */

export type SaveResult =
  | { status: "saved" }
  | { status: "denied" }
  | { status: "failed"; error: string };

/**
 * Saves to the photo library.
 *
 * Asks for write-only permission where the platform supports it — the app has no reason
 * to read the user's library here, and asking for less is both better manners and one
 * fewer thing to justify in review.
 */
export async function saveVideoToPhotos(uri: string): Promise<SaveResult> {
  try {
    const permission = await MediaLibrary.requestPermissionsAsync(true);
    if (!permission.granted) return { status: "denied" };

    await MediaLibrary.saveToLibraryAsync(uri);
    return { status: "saved" };
  } catch (cause) {
    return {
      status: "failed",
      error: cause instanceof Error ? cause.message : "Could not save to your photos.",
    };
  }
}

/** Offers the OS share sheet for the finished file. */
export async function shareVideo(uri: string): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) return;

  await Sharing.shareAsync(uri, {
    mimeType: "video/mp4",
    UTI: "public.mpeg-4",
    dialogTitle: "Share your video",
  });
}
