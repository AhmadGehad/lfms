const CAMERA_TIMEOUT_MS = 5_000;
/** Cameras start dark while they adjust to the light. */
const SETTLE_MS = 400;
const PHOTO_WIDTH = 640;

function withinTimeout<T>(work: Promise<T>, onLate: (value: T) => void): Promise<T> {
  let timer: number;
  let timedOut = false;
  const timeout = new Promise<never>((_, reject) => {
    timer = window.setTimeout(() => {
      timedOut = true;
      reject(new Error("camera timed out"));
    }, CAMERA_TIMEOUT_MS);
  });
  void work.then(value => { if (timedOut) onLate(value); }, () => undefined);
  return Promise.race([work, timeout]).finally(() => window.clearTimeout(timer));
}

const stopCamera = (stream: MediaStream) => stream.getTracks().forEach(track => track.stop());

/**
 * A photo of whoever just picked a name, as a data URL. Null when there's no camera
 * or it's blocked: the work carries on, and the day's report says there's no photo.
 */
export async function takeCheckinPhoto(): Promise<string | null> {
  if (!navigator.mediaDevices?.getUserMedia) return null;
  let stream: MediaStream | undefined;
  try {
    stream = await withinTimeout(
      navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: PHOTO_WIDTH } }, audio: false }),
      stopCamera,
    );
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.srcObject = stream;
    await withinTimeout(video.play(), () => undefined);
    await new Promise(resolve => window.setTimeout(resolve, SETTLE_MS));
    if (!video.videoWidth) return null;
    const canvas = document.createElement("canvas");
    canvas.width = Math.min(PHOTO_WIDTH, video.videoWidth);
    canvas.height = Math.round(video.videoHeight * (canvas.width / video.videoWidth));
    canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.7);
  } catch {
    return null;
  } finally {
    if (stream) stopCamera(stream);
  }
}
