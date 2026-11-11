import { describe, expect, it } from "vitest";

import { isOwnAvatarUrl } from "../routes.js";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_ID = "22222222-2222-4222-8222-222222222222";

describe("foto de perfil", () => {
  it("acepta la imagen que el usuario subió con /profile/media", () => {
    expect(
      isOwnAvatarUrl(
        `https://api.leurettech.com/storage/public/profile-media/${USER_ID}/avatar?v=1731290000000`,
        USER_ID
      )
    ).toBe(true);
  });

  it("rechaza imágenes de otro usuario, otros medios o URLs externas", () => {
    expect(
      isOwnAvatarUrl(
        `https://api.leurettech.com/storage/public/profile-media/${OTHER_ID}/avatar`,
        USER_ID
      )
    ).toBe(false);

    expect(
      isOwnAvatarUrl(
        `https://api.leurettech.com/storage/public/profile-media/${USER_ID}/company-logo`,
        USER_ID
      )
    ).toBe(false);

    expect(isOwnAvatarUrl("https://example.test/foto.jpg", USER_ID)).toBe(false);
    expect(isOwnAvatarUrl("javascript:alert(1)", USER_ID)).toBe(false);
    expect(isOwnAvatarUrl(`/storage/public/profile-media/${USER_ID}/avatar`, USER_ID)).toBe(false);
  });
});
