import { db, one, run, id } from "./db";
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function requireValue(
  ok: unknown,
  message: string,
  status = 400,
): asserts ok {
  if (!ok) throw new HttpError(status, message);
}
const digest = (token: string) =>
  new Bun.CryptoHasher("sha256").update(token).digest("hex");
export function userFor(req: Request) {
  const token = req.headers
    .get("cookie")
    ?.match(/(?:^|;\s*)mothlight_session=([^;]+)/)?.[1];
  const user = token
    ? one(
        "SELECT u.id,u.email,u.name FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?",
        digest(token),
        Date.now(),
      )
    : null;
  requireValue(user, "Sign in to continue.", 401);
  return user;
}
export function access(userId: string, profileId: string, write = false) {
  const member = one(
    "SELECT role FROM memberships WHERE user_id=? AND profile_id=?",
    userId,
    profileId,
  );
  requireValue(
    member && (!write || member.role !== "viewer"),
    "Profile not found or permission denied.",
    403,
  );
  return member;
}
export function cookie(userId: string) {
  const token = crypto.randomUUID() + crypto.randomUUID();
  run("DELETE FROM sessions WHERE expires_at<?", Date.now());
  run(
    "INSERT INTO sessions VALUES(?,?,?)",
    digest(token),
    userId,
    Date.now() + 7 * 86400000,
  );
  return `mothlight_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=604800${process.env.MOTHLIGHT_HOSTED === "true" ? "; Secure" : ""}`;
}
export function logout(req: Request) {
  const token = req.headers
    .get("cookie")
    ?.match(/(?:^|;\s*)mothlight_session=([^;]+)/)?.[1];
  if (token) run("DELETE FROM sessions WHERE token_hash=?", digest(token));
  return "mothlight_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0";
}
export async function createUser(
  email: string,
  name: string,
  password: string,
  first = false,
) {
  requireValue(
    typeof email === "string" &&
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) &&
      email.length < 255,
    "Enter a valid email.",
  );
  requireValue(
    typeof name === "string" && name.trim() && name.length <= 200,
    "Enter a name.",
  );
  requireValue(
    typeof password === "string" &&
      password.length >= 12 &&
      password.length <= 256,
    "Use a password between 12 and 256 characters.",
  );
  const hash = await Bun.password.hash(password, { algorithm: "argon2id" });
  const userId = id(),
    profileId = id();
  db.transaction(() => {
    if (first)
      requireValue(
        !one("SELECT id FROM users LIMIT 1"),
        "Setup is already complete.",
        409,
      );
    requireValue(
      !one("SELECT id FROM users WHERE email=?", email.toLowerCase().trim()),
      "Email already exists.",
      409,
    );
    run(
      "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,?)",
      userId,
      email.toLowerCase().trim(),
      name.trim(),
      hash,
    );
    run("INSERT INTO profiles(id,name) VALUES(?,?)", profileId, "My studio");
    run("INSERT INTO memberships VALUES(?,?,?)", userId, profileId, "owner");
  })();
  return { id: userId, email: email.toLowerCase().trim(), name: name.trim() };
}
