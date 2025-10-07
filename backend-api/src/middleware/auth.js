import jwt from "jsonwebtoken";

const ACCESS_SECRET =
  process.env.ACCESS_SECRET || "dev-access-secret-change-in-production";

export default function authMiddleware(req, res, next) {
  try {
    const token = req.cookies.accessToken;

    if (!token) {
      return res.status(401).json({ error: "Access token required" });
    }

    jwt.verify(token, ACCESS_SECRET, (err, payload) => {
      if (err) {
        if (err.name === "TokenExpiredError") {
          return res
            .status(401)
            .json({ error: "Access token expired", code: "TOKEN_EXPIRED" });
        }
        return res.status(401).json({ error: "Invalid access token" });
      }

      // Add user info to request
      req.userId = payload.sub;
      req.userEmail = payload.email;
      next();
    });
  } catch (error) {
    console.error("Auth middleware error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}
