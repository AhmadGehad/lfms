import { describe, expect, it } from "vitest";
import { isPushServiceEndpoint } from "./pushFanout";

describe("isPushServiceEndpoint", () => {
  it.each([
    "https://fcm.googleapis.com/fcm/send/abc",
    "https://web.push.apple.com/QGk",
    "https://updates.push.services.mozilla.com/wpush/v2/abc",
    "https://wns2-par02p.notify.windows.com/w/?token=abc",
  ])("accepts %s", endpoint => {
    expect(isPushServiceEndpoint(endpoint)).toBe(true);
  });

  // The server POSTs to this address, so it mustn't be able to reach anything else.
  it.each([
    "http://fcm.googleapis.com/fcm/send/abc",
    "https://169.254.169.254/latest/meta-data",
    "https://localhost/internal",
    "https://fcm.googleapis.com.evil.test/x",
    "https://evil.test/fcm.googleapis.com",
    "https://user:pass@fcm.googleapis.com/x",
    "https://fcm.googleapis.com:8443/x",
    "https://134744072%2Egoogleapis.com/x",
    "https://localhost%2Efcm.googleapis.com/x",
    "https://storage.googleapis.com/bucket",
    "not a url",
  ])("refuses %s", endpoint => {
    expect(isPushServiceEndpoint(endpoint)).toBe(false);
  });
});
