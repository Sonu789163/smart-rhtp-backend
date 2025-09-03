import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { User } from "../models/User";

interface AuthRequest extends Request {
  user?: any;
}

export const authMiddleware = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const token = req.header("Authorization")?.replace("Bearer ", "");

    if (!token) {
      return res
        .status(401)
        .json({ message: "No token, authorization denied" });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;

    // Try to find user by microsoftId first, then by _id
    let user = null;
    if (decoded.microsoftId) {
      user = await User.findOne({ microsoftId: decoded.microsoftId });
    } else if (decoded.userId) {
      user = await User.findById(decoded.userId);
    }

    if (!user) {
      return res.status(401).json({ message: "Token is not valid" });
    }

    if (user.status === "suspended") {
      return res.status(403).json({ message: "Account is suspended" });
    }

    req.user = user;
    next();
  } catch (error) {
    res.status(401).json({ message: "Token is not valid" });
  }
};

export const authorize = (roles: Array<"admin" | "user">) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    const currentUser = req.user;
    if (!currentUser) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    if (!roles.includes(currentUser.role)) {
      return res.status(403).json({ message: "Forbidden" });
    }
    next();
  };
};
