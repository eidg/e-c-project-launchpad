import request from "supertest";
import { app } from "../index.js";
import pool from "../db/pool.js";

describe("Authentication API", () => {
  let testUser = {
    email: "test@example.com",
    password: "testpassword123",
  };

  beforeAll(async () => {
    // Clean up any existing test data
    await pool.query(
      "DELETE FROM refresh_tokens WHERE user_id IN (SELECT id FROM users WHERE email = $1)",
      [testUser.email],
    );
    await pool.query("DELETE FROM users WHERE email = $1", [testUser.email]);
  });

  afterAll(async () => {
    // Clean up test data
    await pool.query(
      "DELETE FROM refresh_tokens WHERE user_id IN (SELECT id FROM users WHERE email = $1)",
      [testUser.email],
    );
    await pool.query("DELETE FROM users WHERE email = $1", [testUser.email]);
    await pool.end();
  });

  describe("POST /auth/signup", () => {
    it("should create a new user and return tokens", async () => {
      const response = await request(app)
        .post("/auth/signup")
        .send(testUser)
        .expect(201);

      expect(response.body).toHaveProperty("user");
      expect(response.body.user).toHaveProperty("id");
      expect(response.body.user).toHaveProperty("email", testUser.email);
      expect(response.body.user).toHaveProperty("createdAt");
      expect(response.body.user).not.toHaveProperty("password");

      // Check cookies are set
      const cookies = response.headers["set-cookie"];
      expect(cookies).toBeDefined();
      expect(cookies.some((cookie) => cookie.includes("accessToken"))).toBe(
        true,
      );
      expect(cookies.some((cookie) => cookie.includes("refreshToken"))).toBe(
        true,
      );
    });

    it("should not allow duplicate email signup", async () => {
      await request(app).post("/auth/signup").send(testUser).expect(400);
    });

    it("should validate email format", async () => {
      await request(app)
        .post("/auth/signup")
        .send({
          email: "invalid-email",
          password: "testpassword123",
        })
        .expect(400);
    });

    it("should validate password length", async () => {
      await request(app)
        .post("/auth/signup")
        .send({
          email: "test2@example.com",
          password: "123",
        })
        .expect(400);
    });
  });

  describe("POST /auth/login", () => {
    it("should login with valid credentials", async () => {
      const response = await request(app)
        .post("/auth/login")
        .send(testUser)
        .expect(200);

      expect(response.body).toHaveProperty("user");
      expect(response.body.user).toHaveProperty("email", testUser.email);

      // Check cookies are set
      const cookies = response.headers["set-cookie"];
      expect(cookies).toBeDefined();
      expect(cookies.some((cookie) => cookie.includes("accessToken"))).toBe(
        true,
      );
      expect(cookies.some((cookie) => cookie.includes("refreshToken"))).toBe(
        true,
      );
    });

    it("should reject invalid email", async () => {
      await request(app)
        .post("/auth/login")
        .send({
          email: "nonexistent@example.com",
          password: testUser.password,
        })
        .expect(401);
    });

    it("should reject invalid password", async () => {
      await request(app)
        .post("/auth/login")
        .send({
          email: testUser.email,
          password: "wrongpassword",
        })
        .expect(401);
    });
  });

  describe("POST /auth/refresh", () => {
    let refreshToken;

    beforeEach(async () => {
      const response = await request(app).post("/auth/login").send(testUser);

      const cookies = response.headers["set-cookie"];
      refreshToken = cookies.find((cookie) => cookie.includes("refreshToken"));
    });

    it("should refresh tokens with valid refresh token", async () => {
      const response = await request(app)
        .post("/auth/refresh")
        .set("Cookie", refreshToken)
        .expect(200);

      expect(response.body).toHaveProperty("user");

      // Check new cookies are set
      const cookies = response.headers["set-cookie"];
      expect(cookies).toBeDefined();
      expect(cookies.some((cookie) => cookie.includes("accessToken"))).toBe(
        true,
      );
      expect(cookies.some((cookie) => cookie.includes("refreshToken"))).toBe(
        true,
      );
    });

    it("should reject request without refresh token", async () => {
      await request(app).post("/auth/refresh").expect(401);
    });
  });

  describe("POST /auth/logout", () => {
    let cookies;

    beforeEach(async () => {
      const response = await request(app).post("/auth/login").send(testUser);

      cookies = response.headers["set-cookie"];
    });

    it("should logout and clear tokens", async () => {
      const response = await request(app)
        .post("/auth/logout")
        .set("Cookie", cookies)
        .expect(200);

      expect(response.body).toHaveProperty(
        "message",
        "Logged out successfully",
      );

      // Check cookies are cleared
      const logoutCookies = response.headers["set-cookie"];
      expect(logoutCookies).toBeDefined();
      expect(
        logoutCookies.some((cookie) => cookie.includes("accessToken=;")),
      ).toBe(true);
      expect(
        logoutCookies.some((cookie) => cookie.includes("refreshToken=;")),
      ).toBe(true);
    });
  });

  describe("Protected Routes", () => {
    let accessToken;

    beforeEach(async () => {
      const response = await request(app).post("/auth/login").send(testUser);

      const cookies = response.headers["set-cookie"];
      accessToken = cookies.find((cookie) => cookie.includes("accessToken"));
    });

    it("should access protected route with valid token", async () => {
      const response = await request(app)
        .get("/protected")
        .set("Cookie", accessToken)
        .expect(200);

      expect(response.body).toHaveProperty("message");
      expect(response.body).toHaveProperty("user");
    });

    it("should reject protected route without token", async () => {
      await request(app).get("/protected").expect(401);
    });
  });
});
