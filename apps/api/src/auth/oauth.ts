import { OAuth2Client } from "google-auth-library";
import { config } from "../config";

const googleClient = config.OAUTH_GOOGLE_CLIENT_ID
  ? new OAuth2Client(config.OAUTH_GOOGLE_CLIENT_ID)
  : null;

export const verifyGoogleIdToken = async (idToken: string) => {
  if (!googleClient) {
    throw new Error("Google OAuth not configured");
  }
  const ticket = await googleClient.verifyIdToken({
    idToken,
    audience: config.OAUTH_GOOGLE_CLIENT_ID
  });
  const payload = ticket.getPayload();
  if (!payload?.sub) {
    throw new Error("Invalid Google token");
  }
  return {
    sub: payload.sub,
    email: payload.email ?? null
  };
};
