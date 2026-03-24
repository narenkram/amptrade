import { Response, NextFunction, RequestHandler } from "express";
import { auth } from "../firebase/admin";
import { AuthenticatedRequest } from "../types/types";

export const authenticateUser: RequestHandler = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }

    const token = authHeader.split("Bearer ")[1];
    const decodedToken = await auth.verifyIdToken(token);

    req.user = {
      uid: decodedToken.uid,
      email: decodedToken.email,
    };

    next();
  } catch (error) {
    console.error("Authentication error:", error);
    res.status(401).json({ message: "Unauthorized" });
  }
};
